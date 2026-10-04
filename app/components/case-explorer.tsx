'use client';
import ResearchLoop from './research-loop';
import CaseReproducibility from './case-reproducibility';
import DifferentialComparison from './differential-comparison';
import { useId, useMemo, useRef, useState } from 'react';
import type { InvestigationCase, NormalizedEvent } from '@/lib/case-schema';
import { caseReport } from '@/lib/case-file';
import { absoluteEventTime, eventPhase, filterEvents, filterNodes, nodeRelationships, resolvedReferences, sourceEvent, NODE_TYPES, EVENT_PAGE_SIZE, type CaseNode, type CaseEdge } from '@/lib/case-explorer';

type Selection = { kind: 'node' | 'event' | 'edge' | 'hypothesis'; id: string };
const readable = (value: string) => value.replaceAll('_', ' ').toLowerCase();
const short = (value: string, length = 20) => value.length > length ? value.slice(0, length - 1) + '…' : value;
function Fields({ values }: { values: Record<string, string | number | undefined> }) {
  return <dl className="case-fields">{Object.entries(values).map(([key, value]) => <div key={key}><dt>{key}</dt><dd>{value === undefined || value === '' ? 'Not recorded' : value}</dd></div>)}</dl>;
}
function EvidenceMap({ nodes, edges, selected, onSelect }: { nodes: CaseNode[]; edges: CaseEdge[]; selected?: string; onSelect: (id: string) => void }) {
  const marker = useId().replaceAll(':', '');
  const positions = new Map<string, { x: number; y: number }>();
  const columns = NODE_TYPES.map(type => nodes.filter(node => node.type === type));
  columns.forEach((items, column) => items.forEach((node, row) => positions.set(node.id, { x: 12 + column * 158, y: 55 + row * 76 })));
  const height = Math.max(260, Math.max(...columns.map(items => items.length), 1) * 76 + 64);
  const relatedEdges = edges.filter(edge => (edge.sourceId === selected || edge.targetId === selected) && positions.has(edge.sourceId) && positions.has(edge.targetId));
  const neighbours = new Set(relatedEdges.flatMap(edge => [edge.sourceId, edge.targetId]));
  return <div className="case-map-scroll" tabIndex={0} aria-label="Scrollable evidence map"><svg width="1110" height={height} role="group" aria-label="Recorded evidence graph">
    <defs><marker id={marker} markerWidth="7" markerHeight="7" refX="6" refY="3" orient="auto"><path d="M0,0 L6,3 L0,6" fill="var(--pink)" /></marker></defs>
    {NODE_TYPES.map((type, index) => <text key={type} x={12 + index * 158} y="24" className="case-map-heading">{readable(type)} · {columns[index].length}</text>)}
    {relatedEdges.map(edge => { const a = positions.get(edge.sourceId)!; const b = positions.get(edge.targetId)!; const ax = a.x + 136, ay = a.y + 27, bx = b.x, by = b.y + 27; return <path key={edge.id} d={`M${ax},${ay} C${ax + 30},${ay} ${bx - 30},${by} ${bx},${by}`} className="case-map-edge" markerEnd={`url(#${marker})`}><title>{edge.label} ({edge.confidence} confidence)</title></path>; })}
    {nodes.map(node => { const p = positions.get(node.id)!; return <g key={node.id} transform={`translate(${p.x},${p.y})`} role="button" tabIndex={0} aria-label={`Inspect ${node.type}: ${node.label}`} aria-pressed={selected === node.id} className={`case-map-node ${selected === node.id ? 'is-selected' : neighbours.has(node.id) ? 'is-neighbour' : ''}`} onClick={() => onSelect(node.id)} onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onSelect(node.id); } }}>
      <title>{node.id}: {node.label}</title><rect width="136" height="54" rx="8" /><text x="10" y="20">{short(node.id, 19)}</text><text x="10" y="39" className="case-map-label">{short(node.label, 19)}</text>
    </g>; })}
  </svg></div>;
}

export default function CaseExplorer({ result }: { result: InvestigationCase }) {
  const graph = result.evidenceGraph ?? { nodes: [], edges: [], truncated: false };
  const events = result.events ?? [];
  const [selection, setSelection] = useState<Selection>({ kind: 'node', id: graph.nodes.find(node => sourceEvent(node, events))?.id ?? graph.nodes[0]?.id ?? '' });
  const [nodeType, setNodeType] = useState('all'), [nodeQuery, setNodeQuery] = useState('');
  const [eventSource, setEventSource] = useState('all'), [phase, setPhase] = useState('all'), [eventQuery, setEventQuery] = useState(''), [page, setPage] = useState(0);
  const [rawOpen, setRawOpen] = useState(false);
  const nodes = useMemo(() => filterNodes(graph.nodes, nodeType, nodeQuery), [graph.nodes, nodeType, nodeQuery]);
  const timeline = useMemo(() => filterEvents(events, eventSource, phase, eventQuery), [events, eventSource, phase, eventQuery]);
  const pageCount = Math.max(1, Math.ceil(timeline.length / EVENT_PAGE_SIZE)), currentPage = Math.min(page, pageCount - 1);
  const node = selection.kind === 'node' ? graph.nodes.find(item => item.id === selection.id) : undefined;
  const edge = selection.kind === 'edge' ? graph.edges.find(item => item.id === selection.id) : undefined;
  const event = selection.kind === 'event' ? events.find(item => item.id === selection.id) : node ? sourceEvent(node, events) : undefined;
  const hypothesis = selection.kind === 'hypothesis' ? result.hypotheses.find(item => item.id === selection.id) : undefined;
  const relationships = node ? nodeRelationships(graph, node.id) : [];
  const supporting = node ? result.hypotheses.filter(item => item.evidenceNodeIds.includes(node.id)) : event ? result.hypotheses.filter(item => item.sourceEvents.includes(event.id)) : [];
  const partialAgent = Boolean(result.agent && !result.agent.completed);
  const phases = [...new Set(events.map(eventPhase))].sort();
  const pickNode = (id: string) => setSelection({ kind: 'node', id });
  const inspectorHeading = useRef<HTMLHeadingElement>(null);
  function inspect(selection: Selection) {
    setSelection(selection);
    requestAnimationFrame(() => { inspectorHeading.current?.focus({ preventScroll: true }); inspectorHeading.current?.scrollIntoView({ block: 'start' }); });
  }
  const pickEvent = (id: string) => inspect({ kind: 'event', id });
  function exportCase(report = false) {
    const href = URL.createObjectURL(new Blob([report ? caseReport(result) : JSON.stringify(result, null, 2)], { type: report ? 'text/markdown' : 'application/json' }));
    const link = document.createElement('a'); link.href = href; link.download = result.caseId.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 100) + (report ? '.md' : '.json'); link.click(); setTimeout(() => URL.revokeObjectURL(href), 1000);
  }
  function eventDetails(value: NormalizedEvent) {
    return <><Fields values={{ 'Event ID': value.id, 'Source': value.source, 'Action': value.action, 'Phase': eventPhase(value), 'Traffic scope': value.trafficScope ?? 'unknown', 'Relative time': `${value.timestampMs} ms`, 'Case time (UTC)': absoluteEventTime(result.createdAt, value.timestampMs), 'Case': result.caseId }} /><h4>Recorded metadata</h4><Fields values={value.details} /></>;
  }
  const warning = graph.truncated || result.telemetry?.truncated || result.telemetry?.truncationMarkers.length || result.browser.domTruncated || events.some(item => item.action === 'telemetry.truncated');
  return <section className="case-explorer" aria-label="Case evidence explorer">
    <header className="case-overview panel">
      <div className="case-section-heading"><div><p className="panel-kicker">RESEARCH CASE · {result.status}</p><h2>{result.caseId}</h2></div><div className="case-ref-links"><button className="case-button" onClick={() => exportCase()}>DOWNLOAD CASE</button><button className="case-button" onClick={() => exportCase(true)}>DOWNLOAD REPORT</button></div></div>
      <p>{result.summary}</p><p className="case-target">{result.target.submittedUrl}</p>
      <div className="case-metrics"><div><strong>{events.length}</strong><span>recorded events</span></div><div><strong>{graph.nodes.length}</strong><span>graph nodes</span></div><div><strong>{graph.edges.length}</strong><span>relationships</span></div><div><strong>{result.hypotheses.length}</strong><span>hypotheses</span></div></div>
      <p className="case-note">Observations describe this bounded run. Relationships and hypotheses do not establish malicious intent or prove causation.</p>
      {partialAgent && <p className="case-warning" role="status"><strong>AI run incomplete.</strong> {result.agent?.terminationReason ?? 'Completion was not recorded.'} Browser evidence remains available.</p>}
      {warning ? <p className="case-warning"><strong>Evidence is truncated.</strong> The graph, DOM, or telemetry reached a collection limit. Missing records cannot be treated as absent behaviour.</p> : null}
    </header>

    <section className="panel" aria-labelledby="graph-heading">
      <div className="case-section-heading"><div><p className="panel-kicker">01 / OBSERVATIONS</p><h3 id="graph-heading">Explore the evidence graph</h3></div><span className="case-count">{nodes.length} of {graph.nodes.length} nodes</span></div>
      <p className="case-note">Select a node to highlight its recorded neighbours and inspect its relationships. Each column groups one evidence type.</p>
      <div className="case-toolbar"><label>Find a node<input value={nodeQuery} onChange={e => setNodeQuery(e.target.value)} maxLength={160} placeholder="ID, destination, or recorded metadata" /></label><label>Node type<select value={nodeType} onChange={e => setNodeType(e.target.value)}><option value="all">All types</option>{NODE_TYPES.map(type => <option key={type} value={type}>{readable(type)}</option>)}</select></label></div>
      {!graph.nodes.length ? <p className="case-empty">No evidence graph was recorded for this case.</p> : !nodes.length ? <p className="case-empty">No nodes match these filters.</p> : <div className="case-graph-layout"><div className="case-node-list" aria-label="Evidence nodes">{nodes.map(item => <button key={item.id} aria-pressed={node?.id === item.id} onClick={() => pickNode(item.id)}><span className="case-tag">{readable(item.type)}</span><strong>{item.label}</strong><small>{item.id}</small></button>)}</div><EvidenceMap nodes={nodes} edges={graph.edges} selected={node?.id} onSelect={pickNode} /></div>}
      {node && !nodes.some(item => item.id === node.id) && <p className="case-note">The inspected node is outside the current filters.</p>}
    </section>

    <section className="panel case-inspector" aria-labelledby="inspector-heading" aria-live="polite">
      <p className="panel-kicker">02 / EVIDENCE INSPECTOR</p><h3 id="inspector-heading" ref={inspectorHeading} tabIndex={-1}>{node ? 'Selected node' : edge ? 'Selected relationship' : hypothesis ? 'Selected hypothesis' : event ? 'Selected event' : 'Select evidence to inspect'}</h3>
      {node && <><Fields values={{ 'Node ID': node.id, 'Type': readable(node.type), 'Label': node.label }} />{event ? <>{eventDetails(event)}</> : <><p className="case-note">This summary node has no exact source-event reference. Event-level provenance is unavailable; no association has been inferred from similar labels or timing.</p><Fields values={node.details ?? {}} /></>}
        <h4>Recorded relationships · {relationships.length}</h4>{relationships.length ? <ul className="case-link-list">{relationships.map(item => <li key={item.id}><button onClick={() => setSelection({ kind: 'edge', id: item.id })}>{item.label}<small>{readable(item.type)} · {item.confidence} confidence</small></button></li>)}</ul> : <p className="case-note">No retained relationships reference this node.</p>}</>}
      {edge && <><Fields values={{ 'Relationship ID': edge.id, 'Type': readable(edge.type), 'Explanation': edge.label, 'Confidence': edge.confidence }} /><div className="case-ref-links">{[edge.sourceId, edge.targetId].map((id, i) => graph.nodes.some(item => item.id === id) ? <button key={`${id}-${i}`} onClick={() => pickNode(id)}>{i === 0 ? 'From' : 'To'}: {id}</button> : <span key={`${id}-${i}`}>Node not retained: {id}</span>)}</div><p className="case-note">This relationship is a recorded association. Confidence is qualitative and does not prove a causal effect.</p></>}
      {!node && event && eventDetails(event)}
      {hypothesis && <><Fields values={{ 'Hypothesis ID': hypothesis.id, 'Status': readable(hypothesis.status), 'Evidence class': hypothesis.evidenceClass ? readable(hypothesis.evidenceClass) : undefined, 'Confidence': hypothesis.confidence }} /><h4>{hypothesis.title}</h4><p>{hypothesis.explanation}</p><h4>Limitations</h4><ul className="case-limitations">{hypothesis.limitations.map((value, i) => <li key={i}>{value}</li>)}</ul><h4>Referenced source events</h4><div className="case-ref-links">{resolvedReferences(hypothesis.sourceEvents, events).map(ref => ref.event ? <button key={ref.id} onClick={() => pickEvent(ref.id)}>{ref.id} · {ref.event.timestampMs} ms</button> : <span key={ref.id}>Event not retained: {ref.id}</span>)}</div><h4>Evidence nodes</h4><div className="case-ref-links">{hypothesis.evidenceNodeIds.map(id => graph.nodes.some(item => item.id === id) ? <button key={id} onClick={() => pickNode(id)}>{id}</button> : <span key={id}>Node not retained: {id}</span>)}</div></>}
      {supporting.length > 0 && <><h4>Referenced by hypotheses</h4><div className="case-ref-links">{supporting.map(item => <button key={item.id} onClick={() => inspect({ kind: 'hypothesis', id: item.id })}>{item.title}</button>)}</div></>}
    </section>

    <section className="panel" aria-labelledby="timeline-heading">
      <div className="case-section-heading"><div><p className="panel-kicker">03 / CHRONOLOGY</p><h3 id="timeline-heading">Recorded event timeline</h3></div><span className="case-count" role="status">{timeline.length} matching events</span></div>
      <div className="case-toolbar case-timeline-toolbar"><label>Find an event<input maxLength={160} value={eventQuery} onChange={e => { setEventQuery(e.target.value); setPage(0); }} placeholder="ID, action, or destination" /></label><label>Source<select value={eventSource} onChange={e => { setEventSource(e.target.value); setPage(0); }}><option value="all">All sources</option>{['browser','network','system','agent'].map(value => <option key={value}>{value}</option>)}</select></label><label>Phase<select value={phase} onChange={e => { setPhase(e.target.value); setPage(0); }}><option value="all">All phases</option>{phases.map(value => <option key={value}>{value}</option>)}</select></label></div>
      {!timeline.length ? <p className="case-empty">{events.length ? 'No events match these filters.' : 'No normalized events were recorded.'}</p> : <div className="case-table-scroll" tabIndex={0} aria-label="Scrollable recorded event timeline"><table className="case-event-table"><thead><tr><th scope="col">Time</th><th scope="col">Source / phase</th><th scope="col">Recorded action</th><th scope="col">Evidence</th></tr></thead><tbody>{timeline.slice(currentPage * EVENT_PAGE_SIZE, (currentPage + 1) * EVENT_PAGE_SIZE).map(item => <tr key={item.id} className={event?.id === item.id ? 'is-selected' : ''}><td>{(item.timestampMs / 1000).toFixed(3)} s</td><td>{item.source}<small>{eventPhase(item)}</small></td><td><button onClick={() => pickEvent(item.id)} aria-label={`Inspect event ${item.id}`}>{item.action}<small>{item.id}</small></button></td><td>{item.details.url ?? item.details.destinationIp ?? item.details.command ?? item.details.detail ?? '—'}</td></tr>)}</tbody></table></div>}
      <div className="case-pagination"><button className="case-button" disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}>Previous events</button><span>Page {currentPage + 1} of {pageCount}</span><button className="case-button" disabled={currentPage + 1 >= pageCount} onClick={() => setPage(currentPage + 1)}>Next events</button></div>
    </section>

    <section className="panel" aria-labelledby="hypothesis-heading"><p className="panel-kicker">04 / INTERPRETATION</p><h3 id="hypothesis-heading">Evidence-linked hypotheses</h3><p className="case-note">Hypotheses are interpretations of recorded evidence. Inspect their source events and limitations before drawing a conclusion.</p>{!result.hypotheses.length ? <p className="case-empty">No evidence-linked hypotheses were generated.</p> : <div className="case-hypotheses">{result.hypotheses.map(item => <button key={item.id} aria-pressed={hypothesis?.id === item.id} onClick={() => inspect({ kind: 'hypothesis', id: item.id })}><span className="case-tag">{readable(item.status)} · {item.confidence} confidence</span><strong>{item.title}</strong><small>{item.sourceEvents.length} source references · {item.evidenceClass ? readable(item.evidenceClass) : 'Evidence class not recorded'}</small></button>)}</div>}</section>

    <section className="panel" aria-labelledby="provenance-heading"><p className="panel-kicker">05 / REPRODUCIBILITY</p><h3 id="provenance-heading">Case and model provenance</h3><div className="case-provenance-grid"><div><h4>Execution record</h4><Fields values={{ 'Case': result.caseId, 'Created': result.createdAt, 'Engine': result.provenance.engineVersion, 'Sandbox': result.provenance.sandbox, 'Image': result.provenance.sandboxImage, 'Browser': result.browser.browser, 'Browser version': result.provenance.browserVersion, 'Telemetry mode': result.telemetryMode, 'Experiment': result.experiment?.id, 'Experiment version': result.experiment?.version, 'Research mode': result.experiment?.executionMode }} /></div><div><h4>Model record</h4><Fields values={{ 'Provider': result.modelExecution?.provider ?? result.agent?.provider, 'Configured model': result.modelExecution?.configuredModel ?? result.agent?.model, 'Actual model': result.modelExecution?.actualModel, 'Response ID': result.modelExecution?.responseId, 'AI model requests': result.modelExecution?.modelRequests, 'Provider turns': result.modelExecution?.providerTurns, 'Recorded tool calls': result.modelExecution?.toolCalls ?? result.agent?.actionCount, 'Completion': result.agent ? result.agent.completed ? 'Completed' : 'Incomplete' : undefined, 'Stop reason': result.agent?.terminationReason }} /><p className="case-note">Provider turns can include deterministic fallback calls. Model availability does not establish evidence quality.</p></div></div>
      <h4>Recorded collector availability</h4><ul className="case-collectors">{result.telemetry?.providers.length ? result.telemetry.providers.map((provider, index) => <li key={`${provider.name}-${index}`}><strong>{provider.name}</strong><span>{provider.available ? 'Available' : 'Unavailable'}</span>{provider.reason && <p>{provider.reason}</p>}</li>) : <li>Collector availability was not recorded.</li>}</ul>
      {result.telemetry?.truncationMarkers.length ? <><h4>Collection limits</h4><ul className="case-limitations">{result.telemetry.truncationMarkers.map((value, i) => <li key={i}>{value}</li>)}</ul></> : null}
    </section>
    <CaseReproducibility result={result} />
    {result.behavioralComparison && <DifferentialComparison report={result.behavioralComparison} onEvent={pickEvent} />}
    {result.research && <ResearchLoop result={result} onEvent={pickEvent} />}
    <details className="panel case-raw" onToggle={e => setRawOpen(e.currentTarget.open)}><summary>Inspect exported case JSON</summary>{rawOpen && <pre className="mono wrap">{JSON.stringify(result, null, 2)}</pre>}</details>
  </section>;
}
