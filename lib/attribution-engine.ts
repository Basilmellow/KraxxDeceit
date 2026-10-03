import type { NormalizedEvent } from "./case-schema";

export const POST_ACTION_WINDOW_MS = 5_000;
export const ATTRIBUTION_METHODOLOGY_VERSION = "1.7.1";

export type ActionAnchor = { id:string; timestampMs:number; source:"agent"; action:string };
export type AttributionResult = {
  status:"supported"|"insufficient_evidence";
  confidence:"high"|"medium"|"low";
  sourceEventIds:string[];
  eligibleEventIds:string[];
  preExistingEventIds:string[];
  excludedEventIds:string[];
  explanation:string;
  limitations:string[];
};

export function classifyAttributionEvent(event:NormalizedEvent, anchor:ActionAnchor, windowMs=POST_ACTION_WINDOW_MS) {
  if(event.timestampMs<anchor.timestampMs)return {eligible:false,relationship:"pre_existing" as const,reason:"observed_before_action"};
  if(event.timestampMs-anchor.timestampMs>windowMs)return {eligible:false,relationship:"none" as const,reason:"outside_attribution_window"};
  if(event.phase!=="post_action")return {eligible:false,relationship:"none" as const,reason:"phase_not_post_action"};
  if(event.trafficScope!=="investigation")return {eligible:false,relationship:"none" as const,reason:`traffic_scope_${event.trafficScope??"unknown"}`};
  return {eligible:true,relationship:"post_action_observation" as const,reason:"in_window_investigation_event"};
}

const host=(value:string|undefined)=>{try{return value?new URL(value).hostname.toLowerCase():""}catch{return ""}};
const destinationPort=(event:NormalizedEvent)=>Number(event.details.destinationPort??event.details.remotePort??0);

export function evaluateActionToEffectHypothesis(input:{events:readonly NormalizedEvent[];anchor:ActionAnchor;targetUrl:string;resolvedAddresses:readonly string[];windowMs?:number}):AttributionResult {
  const {events,anchor,targetUrl,resolvedAddresses}=input;
  const windowMs=input.windowMs??POST_ACTION_WINDOW_MS;
  const targetHost=host(targetUrl),safeIps=new Set(resolvedAddresses.map(x=>x.toLowerCase()));
  const preExistingEventIds:string[]=[],excludedEventIds:string[]=[],eligibleEventIds:string[]=[];
  const eligible=(event:NormalizedEvent)=>{const result=classifyAttributionEvent(event,anchor,windowMs);if(result.eligible){eligibleEventIds.push(event.id);return true}if(result.relationship==="pre_existing")preExistingEventIds.push(event.id);else excludedEventIds.push(event.id);return false};
  const anchorEvent=events.find(event=>event.id===anchor.id&&event.source==="agent"&&event.timestampMs===anchor.timestampMs);
  const nav=events.find(event=>event.source==="browser"&&event.action==="browser.navigation"&&host(event.details.url)===targetHost&&eligible(event));
  const request=events.find(event=>event.source==="network"&&event.action==="network.request"&&host(event.details.url)===targetHost&&eligible(event)&&Boolean(nav)&&event.timestampMs>=nav!.timestampMs);
  const socket=request&&events.find(event=>event.source==="system"&&event.action==="system.socket_observed"&&eligible(event)&&safeIps.has((event.details.destinationIp??"").toLowerCase())&&destinationPort(event)===443&&event.timestampMs>=request.timestampMs);
  const chromiumProcesses=events.filter(event=>event.source==="system"&&["system.process_started","system.process_observed"].includes(event.action)&&/chrom(e|ium)/i.test(`${event.details.command??""} ${event.details.executable??""}`));
  const postProcesses=chromiumProcesses.filter(eligible);
  const systemAvailable=events.some(event=>event.source==="system");
  const anchorValid=Boolean(anchorEvent&&anchor.action==="navigate");
  const stagesValid=Boolean(anchorValid&&nav&&request&&request.timestampMs<=anchor.timestampMs+windowMs&&nav.timestampMs<=request.timestampMs);
  const baselineSystem=events.filter(event=>event.source==="system"&&event.timestampMs<anchor.timestampMs);
  const limitations=["System telemetry does not independently establish causation.","Sandbox provisioning traffic is excluded from investigation browser traffic attribution."];
  if(baselineSystem.length)limitations.push("The destination or browser had pre-existing system activity before the agent action; it is context only.");
  if(socket){
    const pid=socket.details.pid;
    if(!pid||!chromiumProcesses.some(event=>event.details.pid===pid))limitations.push("Socket-to-browser process identity was not independently established.");
  }
  if(!socket&&systemAvailable&&!postProcesses.length)limitations.push("Available system observations were pre-existing, ambient, or otherwise ineligible for post-action attribution.");
  if(!systemAvailable)limitations.push("System telemetry was unavailable for this execution.");
  if(!stagesValid){
    return {status:"insufficient_evidence",confidence:"low",sourceEventIds:[...(anchorEvent?[anchorEvent.id]:[]),...(nav?[nav.id]:[]),...(request?[request.id]:[])],eligibleEventIds:[...new Set(eligibleEventIds)],preExistingEventIds:[...new Set(preExistingEventIds)],excludedEventIds:[...new Set(excludedEventIds)],explanation:"The required in-window agent action, post-action browser navigation, and same-destination network request were not all observed in order.",limitations};
  }
  if(socket){
    const sourceEventIds=[anchorEvent!.id,nav!.id,request!.id,socket.id];
    const processMatches=Boolean(socket.details.pid&&chromiumProcesses.some(event=>event.details.pid===socket.details.pid));
    return {status:"supported",confidence:processMatches?"high":"medium",sourceEventIds,eligibleEventIds:[...new Set(eligibleEventIds)],preExistingEventIds:[...new Set(preExistingEventIds)],excludedEventIds:[...new Set(excludedEventIds)],explanation:"An agent navigation action was followed by a browser navigation and network request to the same destination within the attribution window. A corresponding post-action socket observation was also recorded.",limitations};
  }
  if(postProcesses.length){
    return {status:"supported",confidence:"medium",sourceEventIds:[anchorEvent!.id,nav!.id,request!.id,postProcesses[0].id],eligibleEventIds:[...new Set(eligibleEventIds)],preExistingEventIds:[...new Set(preExistingEventIds)],excludedEventIds:[...new Set(excludedEventIds)],explanation:"An agent navigation action was followed by a same-destination browser navigation and request. A post-action Chromium process observation is temporally eligible, but a matching post-action destination socket was not observed.",limitations};
  }
  return {status:"insufficient_evidence",confidence:"low",sourceEventIds:[anchorEvent!.id,nav!.id,request!.id],eligibleEventIds:[...new Set(eligibleEventIds)],preExistingEventIds:[...new Set(preExistingEventIds)],excludedEventIds:[...new Set(excludedEventIds)],explanation:"Browser and network activity followed the agent action, but no eligible post-action system/network observation supports a complete multi-stage hypothesis.",limitations};
}
