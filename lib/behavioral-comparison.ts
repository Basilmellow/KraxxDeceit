import { createHash } from 'node:crypto';
import { z } from 'zod';
import type { InvestigationCase, NormalizedEvent } from './case-schema';
import { BehavioralComparisonSchema, type BehavioralComparison, type ComparisonCategory } from './behavioral-comparison-schema';

type Input = Pick<InvestigationCase,'browser'|'agentBrowser'|'events'> & { agent?: {completed:boolean}; telemetry?: Pick<NonNullable<InvestigationCase['telemetry']>,'truncated'|'truncationMarkers'|'providers'|'baselineSnapshot'|'snapshotB'> };
type Fact = {key:string; reference:{kind:'event'|'snapshot';id:string}};
const cut = (value:string) => value.slice(0,600);
function canonical(value:string|undefined) { try { const u=new URL(value??''); u.hash=''; return u.toString(); } catch { return undefined; } }
/** Browser run membership is distinct from action attribution. Never infer it from time proximity. */
export function comparisonRun(event:NormalizedEvent):'baseline'|'stimulus'|undefined {
  if (['provisioning','setup','cleanup','unknown'].includes(event.phase??'') || ['provisioning','unknown'].includes(event.trafficScope??'')) return undefined;
  if (event.source==='browser'||event.source==='network') {
    if(event.details.phase==='baseline')return 'baseline';
    if(event.details.phase==='agent')return 'stimulus';
    if(event.phase==='baseline')return 'baseline';
    if(event.phase==='post_action')return 'stimulus';
  }
  return undefined;
}
function compare(category:ComparisonCategory['category'],baseline:Fact[],stimulus:Fact[],status:ComparisonCategory['status'],notes:string[]=[]):ComparisonCategory {
  const group=(facts:Fact[])=>{const out=new Map<string,Fact[]>();for(const f of facts)out.set(f.key,[...(out.get(f.key)??[]),f]);return out;};
  const a=group(baseline),b=group(stimulus);let added=0,removed=0,changed=0,unchanged=0,referenceTruncated=false;
  const differences:ComparisonCategory['differences']=[];
  for(const key of [...new Set([...a.keys(),...b.keys()])].sort()) { const av=a.get(key)??[],bv=b.get(key)??[];
    if(av.length===bv.length){unchanged++;continue;} if(!av.length)added++;else if(!bv.length)removed++;else changed++;
    referenceTruncated ||= av.length+bv.length>12;
    differences.push({value:cut(key),baselineCount:av.length,stimulusCount:bv.length,references:[...av,...bv].slice(0,12).map(f=>f.reference)});
  }
  return {category,status,...(status!=='unavailable'?{baselineCount:baseline.length,stimulusCount:stimulus.length}:{}),added,removed,changed,unchanged,differences:differences.slice(0,40),truncated:differences.length>40 || referenceTruncated,notes,metrics:[]};
}
const Snapshot=z.object({timestampMs:z.number(),processes:z.array(z.object({command:z.string(),executable:z.string()})).max(500),network:z.array(z.object({protocol:z.string(),destinationIp:z.string(),destinationPort:z.number(),state:z.string()})).max(1000),truncated:z.array(z.string()).optional()});
export function buildBehavioralComparison(input:Input):BehavioralComparison {
  const events=input.events??[];
  // Snapshot-normalized events and live stream events overlap. Compare only the
  // primary browser archive, whose IDs identify independent run membership.
  const primary=events.filter(e=>/^(baseline|agent)-(req|res|fail|page)-/.test(e.id));
  const base=primary.filter(e=>comparisonRun(e)==='baseline'),stim=primary.filter(e=>comparisonRun(e)==='stimulus');
  const limits:boolean=Boolean(input.telemetry?.truncated||input.telemetry?.truncationMarkers.length||events.some(e=>e.action==='telemetry.truncated'));
  const archiveIncomplete=input.events===undefined || base.filter(e=>e.action==='network.request').length<input.browser.requests.length || stim.filter(e=>e.action==='network.request').length<(input.agentBrowser?.requests.length??0);
  const paired=Boolean(input.agentBrowser && !input.browser.browserError && !input.agentBrowser.browserError);
  const status:ComparisonCategory['status']=!input.agentBrowser?'unavailable':!paired||!input.agent?.completed||limits||archiveIncomplete?'partial':'complete';
  const eventFacts=(list:NormalizedEvent[],action:string,key:(e:NormalizedEvent)=>string|undefined):Fact[]=>list.filter(e=>e.action===action).flatMap(e=>{const value=key(e);return value?[{key:value,reference:{kind:'event' as const,id:e.id}}]:[];});
  const requests=(e:NormalizedEvent)=>{const url=canonical(e.details.url);return url?`${(e.details.method??'GET').toUpperCase()} ${url}`:undefined;};
  const networkFacts=(list:NormalizedEvent[])=>[...eventFacts(list,'network.request',e=>{const k=requests(e);return k?'REQUEST '+k:undefined;}),...eventFacts(list,'network.response',e=>{const k=requests(e);return k?'RESPONSE '+(e.details.status??'unknown')+' '+k:undefined;}),...eventFacts(list,'network.request_failed',e=>{const k=requests(e);return k?'FAILED '+(e.details.failure??'unknown')+' '+k:undefined;})];
  const categories:ComparisonCategory[]=[compare('network',networkFacts(base),networkFacts(stim),status,['Network identity includes record type, method, canonical URL (fragment removed), and response status or failure. Occurrence counts are compared. A request does not establish HTTP success. Live stream duplicates are excluded.']),compare('navigation',eventFacts(base,'browser.navigation',e=>canonical(e.details.url)),eventFacts(stim,'browser.navigation',e=>canonical(e.details.url)),status,['Only recorded navigation events are compared; blocked attempts are not successful navigations.'])];
  const domReady=Boolean(input.browser.domCaptured&&input.agentBrowser?.domCaptured&&input.browser.domHtml!==undefined&&input.agentBrowser.domHtml!==undefined&&input.browser.domCapturedAtMs!==undefined&&input.agentBrowser.domCapturedAtMs!==undefined && input.agentBrowser.domCapturedAtMs>input.browser.domCapturedAtMs);
  const dom=compare('dom',[],[],!domReady?'unavailable':input.browser.domTruncated||input.agentBrowser?.domTruncated||status==='partial'?'partial':'complete',['SHA-256 compares sanitized DOM snapshots, not live page execution. Form removal and redaction can hide changes. Dynamic content can differ without an agent effect.']);
  if(domReady){const a=input.browser.domHtml!,b=input.agentBrowser!.domHtml!;const ha=createHash('sha256').update(a).digest('hex'),hb=createHash('sha256').update(b).digest('hex');dom.baselineCount=1;dom.stimulusCount=1;dom.changed=Number(ha!==hb);dom.unchanged=Number(ha===hb);dom.differences=ha===hb?[]:[{value:`Sanitized DOM hash ${ha} → ${hb}`,baselineCount:1,stimulusCount:1,references:[{kind:'snapshot',id:'browser.domHtml'},{kind:'snapshot',id:'agentBrowser.domHtml'}]}];dom.metrics=[{name:'Sanitized DOM bytes',baseline:Buffer.byteLength(a),stimulus:Buffer.byteLength(b),delta:Buffer.byteLength(b)-Buffer.byteLength(a),references:[{kind:'snapshot',id:'browser.domHtml'},{kind:'snapshot',id:'agentBrowser.domHtml'}]}];}else dom.notes.push('Two separately timestamped DOM captures were not recorded.');
  categories.push(dom);
  const a=Snapshot.safeParse(input.telemetry?.baselineSnapshot),b=Snapshot.safeParse(input.telemetry?.snapshotB);
  for(const category of ['process','socket'] as const){const provider=category==='process'?'procfs':'socket-table';const available=input.telemetry?.providers.some(p=>p.name===provider&&p.available);const valid=Boolean(available&&a.success&&b.success&&b.data.timestampMs>a.data.timestampMs);const facts=(which:'baselineSnapshot'|'snapshotB'):Fact[]=>{const snap=which==='baselineSnapshot'?a:b;if(!valid||!snap.success)return [];return category==='process'?snap.data.processes.map((p,index)=>({key:p.command||p.executable,reference:{kind:'snapshot',id:`telemetry.${which}.processes[${index}]`}})):snap.data.network.filter(p=>p.destinationPort>0&&p.state==='ESTABLISHED').map(p=>({key:`${p.protocol} ${p.destinationIp}:${p.destinationPort}`,reference:{kind:'snapshot',id:`telemetry.${which}.network`}}));};
    categories.push(compare(category,facts('baselineSnapshot'),facts('snapshotB'),!valid?'unavailable':limits||status==='partial'||Boolean(a.success&&a.data.truncated?.length)||Boolean(b.success&&b.data.truncated?.length)?'partial':'complete',[category==='process'?'Process command identity ignores PID churn; multiplicities remain visible.':'Established remote endpoint identity ignores local ephemeral ports; multiplicities remain visible.','Snapshots include the whole sandbox, including ambient activity. Fresh browser contexts share this sandbox; differences are not action attribution.',...(!valid?['Collector or paired timestamped snapshots are unavailable.']:[])]));}
  const timing=compare('timing',[],[],status,['Elapsed browser event spans include waits between actions. They are not model latency, page response latency, or performance benchmarks. Unequal observation windows are not normalized.']);
  const browserEvents=(list:NormalizedEvent[])=>list.filter(e=>['network.request','browser.navigation'].includes(e.action)).sort((a,b)=>a.timestampMs-b.timestampMs);
  const ta=browserEvents(base),tb=browserEvents(stim);
  if(ta.length>=2&&tb.length>=2){const av=ta.at(-1)!.timestampMs-ta[0].timestampMs,bv=tb.at(-1)!.timestampMs-tb[0].timestampMs;timing.baselineCount=ta.length;timing.stimulusCount=tb.length;timing.metrics=[{name:'Observed browser event span (ms)',baseline:av,stimulus:bv,delta:bv-av,references:[ta[0],ta.at(-1)!,tb[0],tb.at(-1)!].map(e=>({kind:'event',id:e.id}))}];timing.changed=Number(av!==bv);timing.unchanged=Number(av===bv);}else {timing.status='unavailable';timing.notes.push('At least two browser/network events per run are required for an elapsed span.');}
  categories.push(timing);
  categories.sort((a,b)=>['network','dom','navigation','process','socket','timing'].indexOf(a.category)-['network','dom','navigation','process','socket','timing'].indexOf(b.category));
  return BehavioralComparisonSchema.parse({methodologyVersion:'1.0',design:'fresh-browser-contexts-shared-sandbox',status:categories.every(c=>c.status==='unavailable')?'unavailable':categories.every(c=>c.status==='complete')?'complete':'partial',excludedEvents:events.length-base.length-stim.length,categories,limitations:['One sequential baseline/stimulus pair; no randomized repetition or causal conclusion.','Baseline observes the page; stimulus reloads it in a fresh context and executes bounded agent actions.','System snapshots include shared sandbox activity. Excluded event count covers events not assigned to a browser run; system comparisons use snapshots.',...(!input.agent?.completed?['Agent incomplete: the stimulus does not represent a completed experiment.']:[]),...(limits?['Collection limits were recorded; missing evidence is not proof of absent behaviour.']:[])]});
}
