import test from 'node:test';
import assert from 'node:assert/strict';
import { absoluteEventTime, filterEvents, filterNodes, nodeRelationships, resolvedReferences, sourceEvent } from '../lib/case-explorer';
import { buildHypotheses, linkHypothesesToEvidenceGraph } from '../lib/hypothesis-engine';
import type { NormalizedEvent } from '../lib/case-schema';
const events: NormalizedEvent[] = [
  { id:'nav',timestampMs:200,source:'browser',action:'browser.navigation',details:{url:'https://example.com',phase:'baseline'} },
  { id:'req',timestampMs:300,source:'network',action:'network.request',details:{url:'https://example.com',eventId:'forged',source:'forged',timestampMs:'999'},phase:'post_action',trafficScope:'investigation' },
];
test('case explorer resolves exact graph event references and never guesses from URL or time', () => {
  assert.equal(sourceEvent({id:'node-req',type:'BROWSER_REQUEST',label:'request',details:{eventId:'req'}},events)?.id,'req');
  assert.equal(sourceEvent({id:'request-1',type:'BROWSER_REQUEST',label:'https://example.com',details:{eventId:'req'}},events),undefined);
  assert.equal(sourceEvent({id:'node-req',type:'BROWSER_REQUEST',label:'request',details:{eventId:'missing'}},events),undefined);
  assert.deepEqual(resolvedReferences(['req','missing','req'],events).map(r=>({id:r.id,found:Boolean(r.event)})),[{id:'req',found:true},{id:'missing',found:false}]);
});
test('case event filters preserve recorded phase, sort without mutating input, and handle empty results', () => {
  const reversed=[...events].reverse();
  assert.deepEqual(filterEvents(reversed,'all','all','EXAMPLE.COM').map(e=>e.id),['nav','req']);
  assert.equal(reversed[0].id,'req');
  assert.deepEqual(filterEvents(events,'network','post_action','request').map(e=>e.id),['req']);
  assert.deepEqual(filterEvents(events,'network','baseline',''),[]);
  assert.deepEqual(filterEvents([], 'all','all',''),[]);
});
test('case graph neighbourhood excludes missing endpoints and node filters search recorded metadata', () => {
  const graph={nodes:[{id:'a',type:'URL' as const,label:'target'},{id:'b',type:'PAGE' as const,label:'page',details:{hostname:'example.com'}}],edges:[{id:'one',sourceId:'a',targetId:'b',type:'observed_during' as const,confidence:'high' as const,label:'observed'},{id:'missing',sourceId:'a',targetId:'gone',type:'observed_during' as const,confidence:'high' as const,label:'not retained'}],truncated:true};
  assert.deepEqual(nodeRelationships(graph,'a').map(e=>e.id),['one']);
  assert.deepEqual(filterNodes(graph.nodes,'PAGE','EXAMPLE').map(n=>n.id),['b']);
  assert.deepEqual(filterNodes(graph.nodes,'URL','EXAMPLE'),[]);
});
test('case timestamp display leaves missing absolute time explicit', () => {
  assert.equal(absoluteEventTime('2026-10-04T00:00:00Z',300),'2026-10-04T00:00:00.300Z');
  assert.equal(absoluteEventTime('unrecorded',300),'Absolute time not recorded');
});
test('untrusted event metadata cannot overwrite provenance of linked hypothesis evidence', () => {
  const graph={nodes:[],edges:[],truncated:false};
  const linked=linkHypothesesToEvidenceGraph(graph,events,buildHypotheses(events,graph).hypotheses);
  const node=linked.evidenceGraph.nodes.find(n=>n.id==='node-req');
  assert.ok(node?.details);
  assert.equal(node.details.eventId,'req');assert.equal(node.details.source,'network');
  assert.equal(node.details.timestampMs,'300');assert.equal(node.details.phase,'post_action');
  assert.equal(node.details.trafficScope,'investigation');
});
