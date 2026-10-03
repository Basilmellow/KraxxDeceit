import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import type { BrowserObservation, InvestigationCase, NormalizedEvent } from "./case-schema";
import type { AgentRun } from "./agent/browser-agent";
import type { TelemetryCollection } from "./telemetry/provider";

export const MAX_NORMALIZED_EVENTS = 500;
export const MAX_GRAPH_NODES = 100;
export const MAX_GRAPH_EDGES = 250;

type GraphNode = {id:string;type:"URL"|"PAGE"|"AGENT_ACTION"|"BROWSER_REQUEST"|"DNS_EVENT"|"SOCKET"|"PROCESS";label:string;details?:Record<string,string>};
type GraphEdge = {id:string;sourceId:string;targetId:string;type:"observed_during"|"same_destination"|"same_time_window"|"same_process";confidence:"high"|"medium"|"low";label:string};

export function normalizeInvestigationEvents(input:{startedAtMs:number;browserStartedAtMs:number;agent:AgentRun;browser:BrowserObservation;agentBrowser?:BrowserObservation;telemetry?:TelemetryCollection}) {
  const out:NormalizedEvent[]=[{id:"event-investigation-start",timestampMs:0,source:"system",action:"investigation_started",details:{caseStart:new Date(input.startedAtMs).toISOString()}}];
  const browserOffset=Math.max(0,input.browserStartedAtMs-input.startedAtMs);
  const addBrowser=(observation:BrowserObservation|undefined,prefix:string)=>{
    if(!observation)return;
    for(const event of observation.pageEvents)out.push({id:`${prefix}-page-${event.timestampMs}-${out.length}`,timestampMs:browserOffset+event.timestampMs,source:"browser",action:`browser.${event.type}`,details:{phase:prefix,...(event.url?{url:event.url}:{}),...(event.detail?{detail:event.detail}:{})}});
    for(const req of observation.requests)out.push({id:`${prefix}-req-${req.id}-${out.length}`,timestampMs:browserOffset+req.timestampMs,source:"network",action:"network.request",details:{phase:prefix,method:req.method,url:req.url,resourceType:req.resourceType}});
    for(const res of observation.responses)out.push({id:`${prefix}-res-${res.id}-${out.length}`,timestampMs:browserOffset+res.timestampMs,source:"network",action:"network.response",details:{phase:prefix,method:res.method,url:res.url,status:String(res.status)}});
    for(const fail of observation.failedRequests)out.push({id:`${prefix}-fail-${fail.id}-${out.length}`,timestampMs:browserOffset+fail.timestampMs,source:"network",action:"network.request_failed",details:{phase:prefix,method:fail.method,url:fail.url,failure:fail.failure}});
  };
  addBrowser(input.browser,"baseline");
  if(input.agentBrowser){
    const baselineReqs=new Set(input.browser.requests.map(x=>`${x.method}|${x.url}|${x.timestampMs}`));
    const baselinePageEvents=new Set(input.browser.pageEvents.map(x=>`${x.type}|${x.url??""}|${x.detail??""}|${x.timestampMs}`));
    const extra={...input.agentBrowser,requests:input.agentBrowser.requests.filter(x=>!baselineReqs.has(`${x.method}|${x.url}|${x.timestampMs}`)),pageEvents:input.agentBrowser.pageEvents.filter(x=>!baselinePageEvents.has(`${x.type}|${x.url??""}|${x.detail??""}|${x.timestampMs}`))};
    addBrowser(extra,"agent");
  }
  const agentOffset=Math.max(0,input.agent.startedAtMs-input.startedAtMs);
  for(const action of input.agent.actions){const blocked=action.tool==="navigate"&&action.result.status==="rejected"&&action.result.reason==="destination_not_allowed";out.push({id:`agent-${action.id}`,timestampMs:agentOffset+action.timestampMs,source:"agent",action:blocked?"agent.navigation_blocked":`agent.${action.tool}`,details:{phase:"agent",result:String(action.result.status??"recorded"),...(blocked?{reason:"destination_not_allowed"}:{}),...(action.tool==="navigate"&&typeof action.input.url==="string"?{url:action.input.url}:{}),...(action.tool==="finish"&&typeof action.input.summary==="string"?{summary:action.input.summary.slice(0,700)}:{})}})};
  const telemetryOffset=Math.max(0,(input.telemetry?.startedAtMs??input.startedAtMs)-input.startedAtMs);
  if(input.telemetry)for(const event of input.telemetry.events)out.push({id:`system-${event.action}-${event.timestampMs}-${out.length}`,timestampMs:telemetryOffset+event.timestampMs,source:"system",action:event.action,details:{phase:event.timestampMs>=(input.telemetry.agentStartSnapshot?.timestampMs??Number.POSITIVE_INFINITY)?"agent":"baseline",...event.details}});
  out.sort((a,b)=>a.timestampMs-b.timestampMs||a.id.localeCompare(b.id));
  const capped=out.slice(0,MAX_NORMALIZED_EVENTS);
  if(out.length>MAX_NORMALIZED_EVENTS)capped[MAX_NORMALIZED_EVENTS-1]={id:"event-truncated",timestampMs:capped.at(-1)?.timestampMs??0,source:"system",action:"telemetry.truncated",details:{limit:String(MAX_NORMALIZED_EVENTS),omitted:String(out.length-MAX_NORMALIZED_EVENTS)}};
  return capped;
}

export async function buildEvidenceGraph(input:{target:string;browser:BrowserObservation;agentBrowser?:BrowserObservation;agent:AgentRun;telemetry?:TelemetryCollection;startedAtMs:number;browserStartedAtMs:number}) {
  const nodes:GraphNode[]=[];const edges:GraphEdge[]=[];const nodeIds=new Set<string>();let edgeTruncated=false;
  const addNode=(node:GraphNode)=>{if(nodeIds.has(node.id)||nodes.length>=MAX_GRAPH_NODES)return;nodeIds.add(node.id);nodes.push(node)};
  const addEdge=(a:string,b:string,type:GraphEdge["type"],confidence:GraphEdge["confidence"],label:string)=>{if(edges.length>=MAX_GRAPH_EDGES){edgeTruncated=true;return}if(nodeIds.has(a)&&nodeIds.has(b))edges.push({id:`edge-${edges.length+1}`,sourceId:a,targetId:b,type,confidence,label})};
  const root="url-target";addNode({id:root,type:"URL",label:safeLabel(input.target)});
  const page="page-main";addNode({id:page,type:"PAGE",label:safeLabel(input.agentBrowser?.finalUrl??input.browser.finalUrl??input.target)});addEdge(root,page,"observed_during","high","Page observed for submitted target");
  for(const action of input.agent.actions){const id=`action-${action.id}`;addNode({id,type:"AGENT_ACTION",label:action.tool,details:{status:String(action.result.status??"recorded")}});addEdge(page,id,"observed_during","high","Agent action observed during page inspection")}
  const reqs=[...input.browser.requests,...(input.agentBrowser?.requests??[])];const uniqReqs=[...new Map(reqs.map(r=>[`${r.method}|${r.url}|${r.timestampMs}`,r])).values()];
  const browserOffset=Math.max(0,input.browserStartedAtMs-input.startedAtMs);
  const requestNodes:Array<{id:string;host:string;port:number;timestampMs:number;url:string}>=[];
  for(const [i,r] of uniqReqs.slice(0,45).entries()){let host="unknown",port=0;try{const u=new URL(r.url);host=u.hostname;port=Number(u.port)||(u.protocol==="https:"?443:80)}catch{}const id=`request-${i+1}`;addNode({id,type:"BROWSER_REQUEST",label:`${r.method} ${safeLabel(r.url)}`,details:{resourceType:r.resourceType}});addEdge(page,id,"observed_during","high","Browser request observed during investigation");requestNodes.push({id,host,port,timestampMs:r.timestampMs,url:r.url})}
  const processNodes=new Map<number,string>();for(const p of (input.telemetry?.processes??[]).slice(0,30)){const id=`process-${p.pid}`;addNode({id,type:"PROCESS",label:`${p.command} · PID ${p.pid}`,details:{ppid:String(p.ppid),executable:p.executable}});processNodes.set(p.pid,id);addEdge(page,id,"same_time_window","medium","Process observed during investigation window")}
  const sockets=(input.telemetry?.network??[]).filter(x=>x.state==="ESTABLISHED"&&x.destinationPort>0).slice(0,40);
  const socketTimestampOffset=Math.max(0,(input.telemetry?.startedAtMs??input.startedAtMs)-input.startedAtMs);
  for(const [i,s] of sockets.entries()){const id=`socket-${i+1}`;addNode({id,type:"SOCKET",label:`${s.protocol} ${s.destinationIp}:${s.destinationPort}`,details:{state:s.state,...(s.pid?{pid:String(s.pid)}:{})}});addEdge(page,id,"same_time_window","medium","Socket observed during investigation window");if(s.pid){const pidId=processNodes.get(s.pid);if(pidId)addEdge(pidId,id,"same_process","high","Socket inode was associated with this process")}}
  const dnsCache=new Map<string,string[]>();for(const req of requestNodes){if(dnsCache.has(req.host))continue;const normalized=req.host.toLowerCase();if(isIP(normalized)){dnsCache.set(normalized,[normalized]);continue}try{const addresses=await lookup(normalized,{all:true,verbatim:true});dnsCache.set(normalized,addresses.slice(0,10).map(x=>x.address))}catch{dnsCache.set(normalized,[])}}
  for(const req of requestNodes){const addresses=dnsCache.get(req.host.toLowerCase())??[];for(const address of addresses.slice(0,3)){const dnsId=`dns-${req.id}-${address}`;addNode({id:dnsId,type:"DNS_EVENT",label:`${req.host} resolved to ${address}`});addEdge(req.id,dnsId,"same_destination","high","Resolver returned this address for the observed request host");for(const [i,s]of sockets.entries())if(s.destinationPort===req.port&&s.destinationIp===address)addEdge(dnsId,`socket-${i+1}`,"same_destination","high","Resolved address matches observed socket destination")}
    for(const [i,s]of sockets.entries()){if(s.destinationPort===req.port&&addresses.includes(s.destinationIp))continue;const reqTime=browserOffset+req.timestampMs,socketTime=socketTimestampOffset+s.timestampMs;if(s.destinationPort===req.port&&Math.abs(socketTime-reqTime)<5_000)addEdge(req.id,`socket-${i+1}`,"same_time_window","low","Request and socket were observed within 5 seconds")}}
  const cap=(input.agentBrowser?.requests.length??0)-input.browser.requests.length;
  const truncated=nodes.length>=MAX_GRAPH_NODES||edgeTruncated||uniqReqs.length>45||cap>MAX_NORMALIZED_EVENTS;
  return {nodes,edges,truncated};
}
function safeLabel(value:string){return value.replace(/\b(Bearer\s+)[A-Za-z0-9._~+/-]+=*/gi,"$1[redacted]").slice(0,240)}
