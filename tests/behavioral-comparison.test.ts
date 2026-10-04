import assert from 'node:assert/strict';
import test from 'node:test';
import { buildBehavioralComparison, comparisonRun } from '../lib/behavioral-comparison';
import { BrowserObservationSchema, type NormalizedEvent } from '../lib/case-schema';
import { safeCase } from '../lib/production-policy';
const browser=()=>BrowserObservationSchema.parse({browser:'chromium',screenshotAvailable:false,domCaptured:true,domCapturedAtMs:10,domHtml:'<html>baseline</html>',domTruncated:false,domMutations:0,redirects:[],console:[],pageErrors:[],requests:[],responses:[],failedRequests:[],iframes:[],downloads:[],pageEvents:[]});
function event(id:string,url:string,phase:'baseline'|'agent',action='network.request',time=10):NormalizedEvent{return {id,timestampMs:time,source:action.startsWith('browser.')?'browser':'network',action,details:{phase,url,method:'GET'},phase:phase==='baseline'?'baseline':'post_action',trafficScope:'investigation'};}
const cat=(r:ReturnType<typeof buildBehavioralComparison>,name:string)=>r.categories.find(c=>c.category===name)!;
function input(events:NormalizedEvent[]=[]){return {browser:browser(),agentBrowser:{...browser(),domCapturedAtMs:100},agent:{completed:true},events};}
test('comparison reports additions, baseline-only records, repeat counts and excludes stream overlap',()=>{
  const events=[event('baseline-req-a-1','https://example.com/a#one','baseline'),event('baseline-req-old-2','https://example.com/old','baseline'),event('agent-req-a-3','https://example.com/a#two','agent'),event('agent-req-a-4','https://example.com/a','agent'),event('agent-req-new-5','https://example.com/new','agent'),event('stream-duplicate','https://example.com/a','baseline')];
  const r=buildBehavioralComparison(input(events)),n=cat(r,'network');assert.equal(n.added,1);assert.equal(n.removed,1);assert.equal(n.changed,1);assert.equal(n.baselineCount,2);assert.equal(n.stimulusCount,3);assert.equal(r.excludedEvents,1);assert.ok(n.differences.flatMap(d=>d.references).every(ref=>events.some(e=>e.id===ref.id)));assert.deepEqual(events[0].details.url,'https://example.com/a#one');
});
test('response status differences and blocked navigation do not become successful navigation',()=>{
  const a=event('baseline-res-a-1','https://example.com','baseline','network.response');a.details.status='200';const b=event('agent-res-b-2','https://example.com','agent','network.response');b.details.status='500';const blocked=event('agent-page-blocked-3','https://outside.example','agent','browser.request_blocked');const r=buildBehavioralComparison(input([a,b,blocked]));assert.equal(cat(r,'network').added,1);assert.equal(cat(r,'network').removed,1);assert.equal(cat(r,'navigation').stimulusCount,0);
});
test('provisioning and unknown membership are excluded despite forged legacy phase',()=>{
  const e=event('agent-req-fake-1','https://registry.npmjs.org','agent');e.phase='provisioning';assert.equal(comparisonRun(e),undefined);assert.equal(cat(buildBehavioralComparison(input([e])),'network').stimulusCount,0);
});
test('DOM hashes compare separate captured snapshots and reflect delivered redaction',()=>{
  const i=input();i.agentBrowser.domHtml='<html>stimulus</html>';const r=buildBehavioralComparison(i);assert.equal(cat(r,'dom').changed,1);assert.equal(cat(r,'dom').differences[0].references[1].id,'agentBrowser.domHtml');
  assert.equal(cat(buildBehavioralComparison({...i,agentBrowser:{...i.agentBrowser,domCapturedAtMs:undefined}}),'dom').status,'unavailable');
  const redacted=input();redacted.browser.domHtml='<html>/tmp/one</html>';redacted.agentBrowser.domHtml='<html>/tmp/two</html>';assert.equal(cat(buildBehavioralComparison(safeCase(redacted)),'dom').changed,0);
});
test('system snapshots ignore PID churn and local port churn but retain process/socket multiplicity',()=>{
  const snap=(timestampMs:number)=>({timestampMs,processes:[{pid:10,executable:'chromium',command:'chromium --renderer'}],network:[{protocol:'tcp',destinationIp:'93.184.216.34',destinationPort:443,state:'ESTABLISHED',localPort:12345}]});
  const a=snap(10),b=snap(100);b.processes[0].pid=99;b.network[0].localPort=54321;
  const i={...input(),telemetry:{providers:[{name:'procfs',available:true},{name:'socket-table',available:true}],truncationMarkers:[],baselineSnapshot:a,snapshotB:b}};
  let r=buildBehavioralComparison(i);assert.equal(cat(r,'process').unchanged,1);assert.equal(cat(r,'socket').unchanged,1);
  b.processes.push({...b.processes[0],pid:100});assert.equal(cat(buildBehavioralComparison(i),'process').changed,1);
  i.telemetry.providers[1].available=false;r=buildBehavioralComparison(i);assert.equal(cat(r,'socket').status,'unavailable');assert.equal(cat(r,'socket').baselineCount,undefined);
});
test('timing uses elapsed spans rather than comparing absolute start offsets',()=>{
  const i=input([event('baseline-page-nav-1','https://example.com','baseline','browser.navigation',100),event('baseline-req-a-2','https://example.com','baseline','network.request',150),event('agent-page-nav-3','https://example.com','agent','browser.navigation',5000),event('agent-req-a-4','https://example.com','agent','network.request',5050)]);const t=cat(buildBehavioralComparison(i),'timing');assert.equal(t.metrics[0].delta,0);assert.equal(t.unchanged,1);assert.equal(t.metrics[0].references.length,4);
});
test('incomplete runs, collection limits and missing pairs cannot claim complete comparison',()=>{
  const i=input();i.agent.completed=false;i.agentBrowser.domTruncated=true;const r=buildBehavioralComparison(i);assert.equal(r.status,'partial');assert.equal(cat(r,'dom').status,'partial');const missing=buildBehavioralComparison({browser:browser(),events:[]});assert.equal(missing.status,'unavailable');assert.equal(cat(missing,'network').baselineCount,undefined);
});
test('difference output is bounded while aggregate totals include omitted identities',()=>{
  const events=Array.from({length:70},(_,n)=>event(`agent-req-${n}-1`,`https://example.com/${n}`,'agent'));const r=cat(buildBehavioralComparison(input(events)),'network');assert.equal(r.added,70);assert.equal(r.differences.length,40);assert.equal(r.truncated,true);
});

test('failed request evidence and missing archive evidence remain explicit',()=>{
  const failed=event('agent-fail-1-1','https://example.com','agent','network.request_failed');failed.details.failure='blocked';assert.equal(cat(buildBehavioralComparison(input([failed])),'network').added,1);
  const i=input();i.browser.requests=[{id:'r1',timestampMs:1,url:'https://example.com',method:'GET',resourceType:'document'}];assert.equal(cat(buildBehavioralComparison(i),'network').status,'partial');
});
test('reference capping is visible and invalid snapshot order is unavailable',()=>{
  const events=Array.from({length:20},(_,n)=>event(`agent-req-${n}-1`,'https://example.com/repeated','agent'));const r=cat(buildBehavioralComparison(input(events)),'network');assert.equal(r.differences[0].stimulusCount,20);assert.equal(r.differences[0].references.length,12);assert.equal(r.truncated,true);
  const snap={timestampMs:10,processes:[],network:[]};const i={...input(),telemetry:{providers:[{name:'procfs',available:true}],truncationMarkers:[],baselineSnapshot:snap,snapshotB:snap}};assert.equal(cat(buildBehavioralComparison(i),'process').status,'unavailable');
});
