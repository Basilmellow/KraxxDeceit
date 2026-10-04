import type { InvestigationCase, NormalizedEvent } from './case-schema';
export type CaseGraph = NonNullable<InvestigationCase['evidenceGraph']>;
export type CaseNode = CaseGraph['nodes'][number];
export type CaseEdge = CaseGraph['edges'][number];
export const NODE_TYPES = ['URL', 'PAGE', 'AGENT_ACTION', 'BROWSER_REQUEST', 'DNS_EVENT', 'SOCKET', 'PROCESS'] as const;
export const EVENT_PAGE_SIZE = 50;

/** Exact recorded references only. Similar URLs/times are not provenance. */
export function sourceEvent(node: CaseNode, events: readonly NormalizedEvent[]) {
  const id = node.details?.eventId;
  return id ? events.find(event => event.id === id && node.id === `node-${event.id}`) : undefined;
}
export function nodeRelationships(graph: CaseGraph, id: string) {
  const ids = new Set(graph.nodes.map(node => node.id));
  return graph.edges.filter(edge => ids.has(edge.sourceId) && ids.has(edge.targetId) && (edge.sourceId === id || edge.targetId === id));
}
export function filterNodes(nodes: readonly CaseNode[], type: string, query: string) {
  const search = query.trim().toLowerCase().slice(0, 160);
  return nodes.filter(node => (type === 'all' || node.type === type) && (!search || [node.id, node.label, ...Object.values(node.details ?? {})].some(value => value.toLowerCase().includes(search))));
}
export function filterEvents(events: readonly NormalizedEvent[], source: string, phase: string, query: string) {
  const search = query.trim().toLowerCase().slice(0, 160);
  return events.filter(event => (source === 'all' || event.source === source) && (phase === 'all' || eventPhase(event) === phase) && (!search || [event.id, event.action, ...Object.values(event.details)].some(value => value.toLowerCase().includes(search))))
    .sort((a, b) => a.timestampMs - b.timestampMs || a.id.localeCompare(b.id));
}
export function eventPhase(event: NormalizedEvent) { return event.phase ?? event.details.phase ?? 'unknown'; }
export function absoluteEventTime(createdAt: string, timestampMs: number) {
  const value = Date.parse(createdAt) + timestampMs;
  return Number.isFinite(value) && Math.abs(value) <= 8.64e15 ? new Date(value).toISOString() : 'Absolute time not recorded';
}
export function resolvedReferences(ids: readonly string[], events: readonly NormalizedEvent[]) {
  const byId = new Map(events.map(event => [event.id, event]));
  return [...new Set(ids)].map(id => ({ id, event: byId.get(id) }));
}
