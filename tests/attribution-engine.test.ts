import test from "node:test";
import assert from "node:assert/strict";
import type { NormalizedEvent } from "../lib/case-schema";
import { classifyAttributionEvent, evaluateActionToEffectHypothesis, POST_ACTION_WINDOW_MS, type ActionAnchor } from "../lib/attribution-engine";

const anchor:ActionAnchor={id:"agent-action-001",timestampMs:3100,source:"agent",action:"navigate"};
const event=(id:string,source:NormalizedEvent["source"],action:string,timestampMs:number,details:Record<string,string>,phase:NormalizedEvent["phase"]="post_action",trafficScope:NormalizedEvent["trafficScope"]="investigation"):NormalizedEvent=>({id,source,action,timestampMs,details,phase,trafficScope});
const actionEvent=()=>event(anchor.id,"agent","agent.navigate",anchor.timestampMs,{url:"https://example.com/?kraxx_experiment=e2e",result:"completed"},"agent_action");
const nav=()=>event("nav-1","browser","browser.navigation",3120,{url:"https://example.com/?kraxx_experiment=e2e"});
const request=()=>event("request-1","network","network.request",3150,{url:"https://example.com/?kraxx_experiment=e2e",method:"GET"});
const socket=(id="socket-1",timestamp=3180,phase:NormalizedEvent["phase"]="post_action",scope:NormalizedEvent["trafficScope"]="investigation")=>event(id,"system","system.socket_observed",timestamp,{destinationIp:"93.184.216.34",destinationPort:"443",pid:"44"},phase,scope);
const process=(id="process-1",timestamp=2800,phase:NormalizedEvent["phase"]="baseline")=>event(id,"system","system.process_started",timestamp,{pid:"44",ppid:"1",command:"chrome-headless",executable:"/chrome/chrome-headless"},phase,"investigation");
const evaluate=(events:NormalizedEvent[],windowMs=POST_ACTION_WINDOW_MS)=>evaluateActionToEffectHypothesis({events,anchor,targetUrl:"https://example.com/?kraxx_experiment=e2e",resolvedAddresses:["93.184.216.34"],windowMs});

test("A: a pre-action socket is context only and cannot support the chain",()=>{
  const old=socket("socket-old",3000,"baseline");const result=evaluate([actionEvent(),nav(),request(),old,process()]);
  assert.equal(result.status,"insufficient_evidence");assert.ok(result.preExistingEventIds.includes(old.id));assert.ok(!result.sourceEventIds.includes(old.id));
});

test("B: a destination-matched post-action socket can support the chain",()=>{
  const result=evaluate([actionEvent(),nav(),request(),socket(),process()]);
  assert.equal(result.status,"supported");assert.equal(result.confidence,"high");assert.ok(result.sourceEventIds.includes("socket-1"));assert.ok(!result.sourceEventIds.includes("process-1"));
});

test("C: a pre-existing Chromium process is not an action effect",()=>{
  const old=process();const result=evaluate([actionEvent(),nav(),request(),old]);
  assert.equal(result.status,"insufficient_evidence");assert.ok(result.preExistingEventIds.includes(old.id));assert.ok(!result.sourceEventIds.includes(old.id));
});

test("D: a post-action Chromium child process may support the chain at medium confidence",()=>{
  const child=event("process-child","system","system.process_started",3190,{pid:"45",ppid:"44",command:"chrome-renderer",executable:"/chrome/chrome-renderer"});
  const result=evaluate([actionEvent(),nav(),request(),child]);
  assert.equal(result.status,"supported");assert.equal(result.confidence,"medium");assert.ok(result.sourceEventIds.includes(child.id));
});

test("E: baseline browser/network events cannot enter the action chain",()=>{
  const events=[actionEvent(),event("nav-base","browser","browser.navigation",3120,{url:"https://example.com/"},"baseline"),event("request-base","network","network.request",3150,{url:"https://example.com/"},"baseline")];
  assert.equal(evaluate(events).status,"insufficient_evidence");
});

test("F: provisioning traffic is excluded",()=>{
  const provision=socket("socket-provision",3180,"provisioning","provisioning");
  const result=evaluate([actionEvent(),nav(),request(),provision]);
  assert.equal(result.status,"insufficient_evidence");assert.ok(result.excludedEventIds.includes(provision.id));
});

test("G: ambient traffic is excluded",()=>{
  const ambient=socket("socket-ambient",3180,"post_action","ambient");
  const result=evaluate([actionEvent(),nav(),request(),ambient]);
  assert.equal(result.status,"insufficient_evidence");assert.ok(result.excludedEventIds.includes(ambient.id));
});

test("H: events beyond the attribution window are ineligible",()=>{
  const late=socket("socket-late",anchor.timestampMs+POST_ACTION_WINDOW_MS+1);
  const result=evaluate([actionEvent(),nav(),request(),late]);
  assert.equal(result.status,"insufficient_evidence");assert.ok(result.excludedEventIds.includes(late.id));
});

test("I: matching destination alone does not establish the action chain",()=>{
  const result=evaluate([actionEvent(),event("nav-old","browser","browser.navigation",3000,{url:"https://example.com/"},"baseline"),request(),socket()]);
  assert.equal(result.status,"insufficient_evidence");assert.ok(!result.sourceEventIds.includes("socket-1"));
});

test("J: matching PID alone cannot attribute pre-existing process/socket events",()=>{
  const oldSocket=socket("socket-old",3000,"baseline");const oldProcess=process("process-old",2900,"baseline");
  const result=evaluate([actionEvent(),oldSocket,oldProcess]);
  assert.equal(result.status,"insufficient_evidence");assert.ok(!result.sourceEventIds.includes(oldProcess.id));assert.ok(!result.sourceEventIds.includes(oldSocket.id));
});

test("classification uses explicit phase, traffic scope, anchor time, and a finite window",()=>{
  assert.equal(classifyAttributionEvent(socket(),anchor).eligible,true);
  assert.equal(classifyAttributionEvent(socket("old",3000,"post_action"),anchor).relationship,"pre_existing");
  assert.equal(classifyAttributionEvent(socket("setup",3200,"setup"),anchor).eligible,false);
});
