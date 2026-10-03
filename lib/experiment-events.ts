import type { NormalizedEvent } from "./case-schema";
import type { AgentRun } from "./agent/browser-agent";

/** Adds temporal provenance to the independently collected baseline/agent observations. */
export function normalizeExperimentEvents(input:{events:NormalizedEvent[];agent:AgentRun;caseStartedAtMs:number;allowedDestinations:string[];resolvedAddresses:string[];provisioningStartedAtMs?:number;provisioningCompletedAtMs?:number}):NormalizedEvent[]{
  const agentOffset=Math.max(0,input.agent.startedAtMs-input.caseStartedAtMs);
  const anchors=(input.agent.actionAnchors??[]).map(anchor=>({...anchor,timestampMs:agentOffset+anchor.timestampMs}));
  const actionAnchor=anchors.find(anchor=>anchor.action==="navigate");
  const allowedHosts=new Set(input.allowedDestinations.map(host=>host.toLowerCase().replace(/\.$/,"")));
  const addresses=new Set(input.resolvedAddresses.map(address=>address.toLowerCase()));
  const phaseAt=(timestampMs:number):NormalizedEvent["phase"]=>{if(!actionAnchor||timestampMs<actionAnchor.timestampMs)return "baseline";return timestampMs-actionAnchor.timestampMs<=5_000?"post_action":"ambient"};
  const browserTraffic=(url:string|undefined):NormalizedEvent["trafficScope"]=>{
    try{const parsed=new URL(url??"");const host=parsed.hostname.toLowerCase().replace(/\.$/,"");return allowedHosts.has(host)||parsed.pathname==="/research-fixtures/agent-injection-basic.html"?"investigation":"ambient"}catch{return "unknown"}
  };
  const actionByEventId=new Map(input.agent.actions.map(action=>[`agent-${action.id}`,action]));
  const anchorByActionId=new Map(input.agent.actions.map((action,index)=>[action.id,anchors[index]]));
  const output:NormalizedEvent[]=[];
  if(input.provisioningStartedAtMs!==undefined)output.push({id:"event-sandbox-provisioning-start",timestampMs:Math.max(0,input.provisioningStartedAtMs-input.caseStartedAtMs),source:"system",action:"sandbox_provisioning_started",details:{},phase:"provisioning",trafficScope:"provisioning"});
  if(input.provisioningCompletedAtMs!==undefined)output.push({id:"event-sandbox-provisioning-complete",timestampMs:Math.max(0,input.provisioningCompletedAtMs-input.caseStartedAtMs),source:"system",action:"sandbox_provisioning_complete",details:{},phase:"setup",trafficScope:"provisioning"});

  for(const original of input.events){
    const event={...original,details:{...original.details}};
    if(event.source==="agent"){
      const action=actionByEventId.get(event.id);
      if(!action){output.push({...event,phase:"unknown",trafficScope:"unknown"});continue;}
      const anchor=anchorByActionId.get(action.id);
      const isBlocked=action.tool==="navigate"&&action.result.status==="rejected";
      const url=typeof action.input.url==="string"?action.input.url:undefined;
      output.push({
        ...event,id:anchor?.id??event.id,timestampMs:agentOffset+action.timestampMs,
        action:isBlocked?"agent.navigation_blocked":event.action,
        details:{...event.details,agentActionId:action.id,anchorId:anchor?.id??"",policyDecision:action.policyDecision??"not_applicable",executionStatus:action.executionStatus??String(action.result.status??"recorded"),...(url?{url}:{}),...(isBlocked?{requestedUrl:url??"",reason:String(action.result.reason??"policy_blocked"),timestamp:String(agentOffset+action.timestampMs)}:{})},
        phase:"agent_action",trafficScope:"investigation",
      });
      continue;
    }
    if(event.source==="browser"||event.source==="network"){
      const timestampMs=event.timestampMs;
      const eventPhase=event.phase??(event.id.startsWith("baseline-")?"baseline":phaseAt(timestampMs));
      const runPhase=event.id.startsWith("agent-")?"agent":"baseline";
      const url=event.details.url;
      const trafficScope=event.trafficScope??(event.action==="browser.request_blocked"?"investigation":browserTraffic(url));
      output.push({...event,details:{...event.details,phase:runPhase,...(event.action==="browser.untrusted_instruction_observed"?{contentType:"untrusted_web_content"}:{})},phase:eventPhase,trafficScope});
      continue;
    }
    if(event.source==="system"){
      const isProcessStart=event.action==="system.process_started";
      const processStartedAt=Number(event.details.startTimeMs);
      const timestampMs=isProcessStart&&Number.isFinite(processStartedAt)?Math.max(0,processStartedAt-input.caseStartedAtMs):event.timestampMs;
      const eventPhase=event.phase??phaseAt(timestampMs);
      const isSocket=event.action==="system.network_connection"||event.action==="system.socket_observed";
      const targetSocket=isSocket&&addresses.has((event.details.destinationIp??"").toLowerCase())&&event.details.destinationPort==="443";
      const isChromium=/chrom(e|ium)/i.test(`${event.details.command??""} ${event.details.executable??""}`);
      const trafficScope=event.trafficScope??(eventPhase==="post_action"&&(targetSocket||(isProcessStart&&isChromium))?"investigation":"ambient");
      output.push({...event,timestampMs,action:isSocket?"system.socket_observed":event.action,details:{...event.details,phase:eventPhase==="post_action"?"agent":"baseline"},phase:eventPhase,trafficScope});
      continue;
    }
    output.push({...event,phase:event.phase??"unknown",trafficScope:event.trafficScope??"unknown"});
  }
  output.sort((a,b)=>a.timestampMs-b.timestampMs||a.id.localeCompare(b.id));
  return output.slice(0,2_000);
}
