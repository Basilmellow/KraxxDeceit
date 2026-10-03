import test from "node:test";
import assert from "node:assert/strict";
import { decideEndToEndAction, isAllowedEndToEndDestination } from "../experiments/web-agent/end-to-end-chain";
import { buildObservedChainEdges, type EvidenceNode } from "../lib/end-to-end-chain";

test("IGNORE records no requested browser navigation", () => {
  assert.deepEqual(decideEndToEndAction("ignore"), { kind:"ignore" });
});

test("FOLLOW-SAFE emits only the fixed synthetic example.com action", () => {
  const action=decideEndToEndAction("follow-safe");
  assert.deepEqual(action,{kind:"navigate",url:"https://example.com/?kraxx_experiment=e2e",synthetic_agent_action:true});
  assert.equal(isAllowedEndToEndDestination(action.url),true);
  assert.equal(isAllowedEndToEndDestination("https://example.com.evil.test/?kraxx_experiment=e2e"),false);
});

test("BLOCKED rejects example.invalid before browser navigation", () => {
  const action=decideEndToEndAction("blocked");
  assert.equal(action.kind,"navigate");
  if(action.kind==="navigate")assert.equal(isAllowedEndToEndDestination(action.url),false);
});

test("action edges require explicit post-action phases, investigation scope, ordering and matching destination", () => {
  const nodes:EvidenceNode[]=[
    {id:"agent",type:"AGENT_ACTION" as const,eventId:"e1",timestampMs:1000,source:"agent",details:{},phase:"agent_action",trafficScope:"investigation"},
    {id:"nav",type:"BROWSER_NAVIGATION" as const,eventId:"e2",timestampMs:1020,source:"playwright",details:{},phase:"post_action",trafficScope:"investigation"},
    {id:"request",type:"NETWORK_REQUEST" as const,eventId:"e3",timestampMs:1050,source:"playwright",details:{},phase:"post_action",trafficScope:"investigation"},
    {id:"socket",type:"SOCKET_OBSERVATION" as const,eventId:"e4",timestampMs:1200,source:"socket-table",details:{destinationIp:"93.184.216.34",destinationPort:"443",pid:"45"},phase:"post_action",trafficScope:"investigation"},
    {id:"process",type:"PROCESS_OBSERVATION" as const,eventId:"e5",timestampMs:900,source:"procfs",details:{pid:"45",executable:"/usr/bin/chromium"},phase:"baseline",trafficScope:"ambient"},
  ];
  const edges=buildObservedChainEdges(nodes,["93.184.216.34"],1000);
  assert.deepEqual(edges.map((edge)=>edge.type),["supports_action_hypothesis","same_destination","post_action_observation","pre_existing"]);
  assert.equal(edges.at(-1)?.label,"same PID identifies a pre-existing browser process; context only");
  assert.equal(buildObservedChainEdges(nodes,["203.0.113.10"],1000).some((edge)=>edge.targetId==="socket"),false);
  const unrelated=nodes.map((node)=>node.id==="process"?{...node,details:{pid:"99"}}:node);
  assert.equal(buildObservedChainEdges(unrelated,["93.184.216.34"],1000).some((edge)=>edge.label.includes("associated_process")),false);
  const oldSocket=nodes.map(node=>node.id==="socket"?{...node,timestampMs:990,phase:"baseline" as const}:node);
  assert.equal(buildObservedChainEdges(oldSocket,["93.184.216.34"],1000).some(edge=>edge.type==="supports_action_hypothesis"&&edge.targetId==="socket"),false);
});
