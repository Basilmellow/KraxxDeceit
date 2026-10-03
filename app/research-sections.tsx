"use client";

import { useState, type CSSProperties, type KeyboardEvent, type PointerEvent } from "react";
import { Reveal } from "./ui-motion";

const MAP_NODES = [
  { label: "AGENT", x: 120, y: 104 }, { label: "BROWSER", x: 480, y: 104 },
  { label: "NETWORK", x: 104, y: 240 }, { label: "PROCESS", x: 496, y: 240 },
  { label: "SOCKET", x: 162, y: 376 }, { label: "EVIDENCE", x: 438, y: 376 },
];

export function EvidenceMap() {
  const [selected, setSelected] = useState<string | null>(null);
  const [hovered, setHovered] = useState<string | null>(null);
  const active = hovered ?? selected;
  const related = (label: string) => !active || active === "URL" || label === active || label === "URL";
  function select(label: string) { setSelected(value => value === label ? null : label); }
  const events = (label: string) => ({
    role: "button", tabIndex: 0, "aria-label": `Select ${label} evidence source`, "aria-pressed": selected === label,
    onClick: () => { setHovered(null); select(label); },
    onPointerEnter: (event: PointerEvent<SVGGElement>) => { if (event.pointerType === "mouse") setHovered(label); },
    onPointerLeave: () => setHovered(null),
    onFocus: () => setHovered(label), onBlur: () => setHovered(null),
    onKeyDown: (event: KeyboardEvent<SVGGElement>) => {
      if (event.key === "Enter" || event.key === " ") { event.preventDefault(); select(label); }
      if (event.key === "Escape") { setSelected(null); setHovered(null); }
    },
  });
  return <div className="evidence-map-viewport"><div className={`evidence-map${active ? " has-selection" : ""}`}>
    <div className="visual-topline"><span>OBSERVATION MAP</span><span>CONCEPTUAL EVIDENCE MAP</span></div>
    <svg viewBox="0 0 600 480" role="group" aria-label="Interactive conceptual evidence map">
      <g className="map-traces">{MAP_NODES.map((node, index) => <path key={node.label} className={active ? (active === "URL" || active === node.label ? "is-related" : "is-dim") : ""} style={{ "--trace-delay": `${index * 1.1}s` } as CSSProperties} d={`M300 240 Q300 ${node.y} ${node.x} ${node.y}`} />)}</g>
      <circle className="map-orbit" cx="300" cy="240" r="81"/>
      <g {...events("URL")} className={`map-center map-interactive${active === "URL" ? " is-selected" : ""}`}><circle cx="300" cy="240" r="43"/><text x="300" y="244">URL</text><text className="map-center-caption" x="300" y="305">UNTRUSTED INPUT</text></g>
      {MAP_NODES.map((node, index) => <g key={node.label} {...events(node.label)} className={`map-node map-interactive${related(node.label) ? " is-related" : " is-dim"}${active === node.label ? " is-selected" : ""}`} style={{ "--trace-delay": `${index * 1.1}s` } as CSSProperties}>
        <rect x={node.x - 65} y={node.y - 24} width="130" height="48" rx="12"/><circle cx={node.x - 44} cy={node.y} r="3"/><text x={node.x + 8} y={node.y + 4}>{node.label}</text>
      </g>)}
    </svg>
    <div className="visual-caption"><span className="caption-mark">K.</span><span aria-live="polite">{active ? `EVIDENCE SOURCE · ${active}` : "Source. Timing. Attribution."}<br/>{active ? "Conceptual relationship · inspect recorded cases below." : "Select a node to explore its connections."}</span></div>
  </div></div>;
}

const CASE_LAYERS = [
  ["WEBPAGE", "Untrusted instruction was observed."], ["AGENT", "Page text inspection and finish were recorded."],
  ["BROWSER", "Browser page events were recorded."], ["NETWORK", "No agent navigation was recorded in this example."],
  ["SYSTEM", "Sandbox process observations provide context."], ["EVIDENCE", "Only recorded relationships belong in the case."],
];

export function ExampleEvidenceChain() {
  const [selected, setSelected] = useState<number | null>(null);
  return <div className="example-evidence-chain"><span className="chain-example-label">CASE LAYERS · ILLUSTRATIVE, NOT AN OBSERVED CHAIN</span>
    <div className="example-chain-nodes">{CASE_LAYERS.map(([label], index) => <button type="button" key={label} aria-pressed={selected === index} onClick={() => setSelected(value => value === index ? null : index)} className={selected === index ? "is-selected" : ""}><span>{label}</span>{index < 5 && <i aria-hidden="true"/>}</button>)}</div>
    <p aria-live="polite">{selected === null ? "Select a layer to inspect the example’s observation boundaries." : `EVIDENCE SOURCE · ${CASE_LAYERS[selected][0]}: ${CASE_LAYERS[selected][1]}`}</p>
  </div>;
}

export function EvidenceFlow() {
  return <ol className="execution-flow" aria-label="Investigation layers">
    {["Hostile webpage", "AI agent", "Browser", "Network", "System", "Evidence"].map((label, index) => <li key={label}><span>{String(index + 1).padStart(2, "0")}</span><strong>{label}</strong>{index < 5 && <b aria-hidden="true">→</b>}</li>)}
  </ol>;
}

export function WhyKraxx() {
  return <section className="why-section light-section">
    <p className="eyebrow">WHY KRAXXDECEIT</p>
    <Reveal><h2>Less interpretation.<br/><span>More observation.</span></h2></Reveal>
    <p className="why-copy">KraxxDeceit records what the environment observed, so a research case can be reviewed against its evidence.</p>
    <div className="why-columns">
      <article><span>01 / OBSERVE</span><h3>Capture execution.</h3><p>See browser behavior and available system activity in a single case.</p></article>
      <article><span>02 / CORRELATE</span><h3>Connect the layers.</h3><p>Compare baseline and agent behavior with source, timing, and attribution intact.</p></article>
      <article><span>03 / PRESERVE</span><h3>Keep the limitations.</h3><p>Review evidence-supported hypotheses alongside missing observations and uncertainty.</p></article>
    </div>
  </section>;
}

export function ResearchDomains() {
  return <section className="domain-section"><p className="eyebrow">RESEARCH DOMAINS</p><div className="domain-chips">{["AI agent security", "Browser security", "Prompt injection", "Threat research", "Network forensics", "DFIR", "Security automation"].map(domain => <span key={domain}>{domain}</span>)}</div></section>;
}

export function FinalCta() {
  return <section className="final-cta"><p className="eyebrow">MAKE THE NEXT QUESTION OBSERVABLE</p><Reveal><h2>Don’t guess what<br/>the agent did.<br/><span>Observe it.</span></h2></Reveal><p>Run a controlled experiment with KraxxDeceit.</p><div className="hero-actions"><a className="primary-cta" href="#investigation-console">Run an investigation <span aria-hidden="true">↗</span></a><a className="text-cta" href="https://github.com/Basilmellow/KraxxDeceit" target="_blank" rel="noreferrer">View GitHub <span aria-hidden="true">↗</span></a></div></section>;
}
