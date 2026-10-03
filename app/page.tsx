"use client";

import { FormEvent, useState } from "react";
import { EvidenceMap, EvidenceFlow, WhyKraxx, ResearchDomains, FinalCta, ExampleEvidenceChain } from "./research-sections";
import { MotionSurface, TiltCard, ResearchQuestions } from "./ui-motion";
import type { InvestigationCase } from "@/lib/case-schema";
import type { ExperimentResult } from "@/lib/experiment-schema";

type InvestigationResult = InvestigationCase & { url?: string; experimentResult?: ExperimentResult };
type ChainMode = "ignore" | "follow-safe" | "blocked";

function formatTime(timestampMs: number) {
  const minutes=Math.floor(timestampMs/60000),seconds=Math.floor(timestampMs/1000)%60,millis=Math.max(0,timestampMs%1000);
  return `${String(minutes).padStart(2,"0")}:${String(seconds).padStart(2,"0")}.${String(millis).padStart(3,"0")}`;
}

const HYPOTHESIS_LABELS: Record<InvestigationCase["hypotheses"][number]["type"], string> = {
  agent_to_navigation: "AGENT → NAVIGATION",
  navigation_to_network: "NAVIGATION → NETWORK",
  browser_to_process: "BROWSER → PROCESS",
  network_to_destination: "NETWORK → DESTINATION",
  agent_to_external_host: "AGENT → EXTERNAL HOST",
  multi_stage_attack_chain: "MULTI-STAGE EVIDENCE CHAIN",
  untrusted_instruction_to_agent_navigation: "UNTRUSTED INSTRUCTION → AGENT NAVIGATION",
  untrusted_instruction_ignored: "UNTRUSTED INSTRUCTION IGNORED",
  untrusted_instruction_observed: "UNTRUSTED INSTRUCTION OBSERVED",
};

export default function HomePage() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [url, setUrl] = useState("");
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<InvestigationResult | null>(null);
  const [error, setError] = useState("");
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [selectedHypothesisId, setSelectedHypothesisId] = useState<string | null>(null);
  const [selectedGraphNodeId, setSelectedGraphNodeId] = useState<string | null>(null);
  const [hoveredGraphNodeId, setHoveredGraphNodeId] = useState<string | null>(null);
  const [chainMode, setChainMode] = useState<ChainMode>("follow-safe");

  function exportCase() {
    if (!result) return;
    const blob = new Blob([JSON.stringify(result, null, 2)], { type: "application/json" });
    const href = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = href;
    link.download = `kraxxdeceit-${result.caseId}.json`;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(href), 1_000);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setRunning(true);
    setError("");
    setResult(null);
    setSelectedEventId(null);
    setSelectedHypothesisId(null); setSelectedGraphNodeId(null); setHoveredGraphNodeId(null);

    try {
      const response = await fetch("/api/investigate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url }),
      });
      const data = await response.json();
      if (!response.ok) {
        const detail = typeof data.detail === "string" ? `: ${data.detail}` : "";
        throw new Error(`${data.error ?? "Investigation failed."}${detail}`);
      }
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setRunning(false);
    }
  }

  async function runBasicExperiment() {
    setRunning(true);
    setError("");
    setResult(null);
    setSelectedEventId(null);
    setSelectedHypothesisId(null); setSelectedGraphNodeId(null); setHoveredGraphNodeId(null);
    try {
      const response = await fetch("/api/internal/experiment", { method: "POST" });
      const data = await response.json();
      if (!response.ok) {
        const detail = typeof data.detail === "string" ? `: ${data.detail}` : "";
        throw new Error(`${data.error ?? "Experiment failed."}${detail}`);
      }
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown experiment error");
    } finally {
      setRunning(false);
    }
  }

  async function runRealAgentExperiment() {
    setRunning(true); setError(""); setResult(null); setSelectedEventId(null); setSelectedHypothesisId(null); setSelectedGraphNodeId(null); setHoveredGraphNodeId(null);
    try {
      const response = await fetch("/api/internal/real-agent-experiment", { method: "POST" });
      const data = await response.json();
      if (!response.ok) {
        const detail = typeof data.detail === "string" ? `: ${data.detail}` : "";
        throw new Error(`${data.error ?? "Real-agent experiment failed."}${detail}`);
      }
      setResult(data);
    } catch (err) { setError(err instanceof Error ? err.message : "Unknown experiment error"); }
    finally { setRunning(false); }
  }

  async function runChainExperiment() {
    setRunning(true); setError(""); setResult(null); setSelectedEventId(null); setSelectedHypothesisId(null); setSelectedGraphNodeId(null); setHoveredGraphNodeId(null);
    try {
      const response = await fetch("/api/internal/end-to-end-chain", { method:"POST", headers:{"content-type":"application/json"}, body:JSON.stringify({mode:chainMode}) });
      const data = await response.json();
      if (!response.ok) throw new Error(`${data.error ?? "Experiment failed."}${typeof data.detail === "string" ? `: ${data.detail}` : ""}`);
      setResult(data);
    } catch (err) { setError(err instanceof Error ? err.message : "Unknown experiment error"); }
    finally { setRunning(false); }
  }

  const selectedEvent = result?.events?.find((event) => event.id === selectedEventId) ?? null;
  const selectedHypothesis = result?.hypotheses.find((hypothesis) => hypothesis.id === selectedHypothesisId) ?? null;
  const linkedHypotheses = selectedEvent ? result?.hypotheses.filter((hypothesis) => hypothesis.sourceEvents.includes(selectedEvent.id)) ?? [] : [];
  const relatedEventIds = selectedEvent ? [...new Set(linkedHypotheses.flatMap((hypothesis) => hypothesis.sourceEvents).filter((id) => id !== selectedEvent.id))] : [];
  const selectedChainNodeIds = result?.evidenceGraph?.nodes.filter((node)=>node.details?.eventId===selectedEventId).map((node)=>node.id) ?? [];
  const highlightedEvidenceIds = new Set([...(selectedHypothesis?.evidenceNodeIds ?? []), ...selectedChainNodeIds]);
  const activeGraphNodeId = hoveredGraphNodeId ?? selectedGraphNodeId;
  const relatedEdges = result?.evidenceGraph?.edges.filter(edge => edge.sourceId === activeGraphNodeId || edge.targetId === activeGraphNodeId) ?? [];
  const relatedGraphNodeIds = new Set([activeGraphNodeId, ...relatedEdges.flatMap(edge => [edge.sourceId, edge.targetId])]);

  return (
    <MotionSurface>
      <nav className="nav" aria-label="Main navigation">
        <a className="brand" href="#top" aria-label="KraxxDeceit home"><img className="brand-mark" src="/kraxxdeceit-mark.png" alt="" /><span className="brand-wordmark"><span>KRAXX</span><span>DECEIT</span></span></a>
        <div id="mobile-navigation" className={`nav-links${menuOpen ? " is-open" : ""}`}><a onClick={() => setMenuOpen(false)} href="#research">Research</a><a onClick={() => setMenuOpen(false)} href="#how-it-works">How it works</a><a onClick={() => setMenuOpen(false)} href="#cases">Cases</a><a onClick={() => setMenuOpen(false)} href="#documentation">Documentation</a><a onClick={() => setMenuOpen(false)} href="/demo">Controlled demo</a></div>
        <div className="nav-actions"><a className="github-link" href="https://github.com/Basilmellow/KraxxDeceit" target="_blank" rel="noreferrer">GitHub <span aria-hidden="true">↗</span></a><a className="nav-cta" href="#investigation-console">Run investigation <span aria-hidden="true">↗</span></a></div>
        <button className={`menu-toggle${menuOpen ? " is-open" : ""}`} type="button" aria-label={menuOpen ? "Close navigation menu" : "Open navigation menu"} aria-expanded={menuOpen} aria-controls="mobile-navigation" onClick={() => setMenuOpen((open) => !open)}><span/><span/></button>
      </nav>

      <section className="hero" id="top">
        <div className="hero-copy-column"><p className="eyebrow"><span className="eyebrow-line"/>KRAXX SECURITY RESEARCH</p>
        <h1><span className="hero-word-group">See what</span>{" "}<span className="hero-word-group">happens when</span>{" "}<span className="hero-word-group hero-accent">AI meets</span>{" "}<span className="hero-word-group">a hostile web.</span></h1>
        <p className="hero-copy">Execute suspicious webpages inside isolated research environments. Observe the agent, browser, network and system — then reconstruct the evidence.</p>
        <div className="hero-actions"><a className="primary-cta" href="#investigation-console">Run an investigation <span aria-hidden="true">↗</span></a><a className="text-cta" href="https://github.com/Basilmellow/KraxxDeceit" target="_blank" rel="noreferrer">View GitHub <span aria-hidden="true">↗</span></a></div>
        <div className="hero-proof"><span className="proof-dot"/>SANDBOXED EXECUTION <i/> OBSERVED EVIDENCE <i/> REPRODUCIBLE CASES</div></div>
        <EvidenceMap/>
      </section>

      <div className="capability-strip" id="research">{["Isolated sandbox", "AI browser", "Playwright", "Network telemetry", "Process telemetry", "Evidence graph"].map(label => <div key={label}><i/>{label}</div>)}</div>

      <section className="story-section light-section" id="how-it-works"><div className="section-index">01 / THE APPROACH</div><div className="story-content"><p className="eyebrow">A clearer view of hostile behavior</p><h2>Don&rsquo;t trust the explanation.<br/><span>Observe the execution.</span></h2><p className="section-intro">A page is only one part of the story. KraxxDeceit connects an agent’s browser actions with network activity and sandbox observations, preserving where each finding came from.</p><a className="dark-text-link" href="#investigation-console">Start with a URL <span aria-hidden="true">↗</span></a></div><div className="story-stamp"><span>CONTROLLED<br/>EXECUTION</span><b>01</b></div><EvidenceFlow/></section>

      <section className="capabilities-section"><div className="section-heading"><div><p className="eyebrow">RESEARCH INSTRUMENTS</p><h2>From page to<br/><span>provenance.</span></h2></div><p>Each layer answers a different question. The result is a richer record of what the investigation actually observed.</p></div><div className="capability-grid"><TiltCard><span className="card-number">01</span><div className="card-icon">⌘</div><h3>Isolated execution</h3><p>Run browser investigations inside disposable Vercel Sandboxes designed to contain the research session.</p><span className="card-foot">VERCEL SANDBOX</span></TiltCard><TiltCard><span className="card-number">02</span><div className="card-icon">▣</div><h3>Behavior in context</h3><p>Capture browser actions, page changes, and network requests as they happen during the investigation.</p><span className="card-foot">CHROMIUM · PLAYWRIGHT</span></TiltCard><TiltCard><span className="card-number">03</span><div className="card-icon">⌁</div><h3>Correlated telemetry</h3><p>Compare process and socket observations across the session, with attribution boundaries kept visible.</p><span className="card-foot">PROCFS · SOCKETS</span></TiltCard><TiltCard><span className="card-number">04</span><div className="card-icon">◇</div><h3>Portable evidence</h3><p>Build a reviewable case from observed events, relationships, and deterministic hypotheses.</p><span className="card-foot">CASE · GRAPH · TIMELINE</span></TiltCard></div></section>

      <section className="method-section"><div className="section-index">02 / THE METHOD</div><div className="method-main"><p className="eyebrow">A repeatable research loop</p><h2>Four moves.<br/><span>One evidence trail.</span></h2><div className="method-steps"><article><span>01</span><div><h3>Isolate</h3><p>Provision a disposable sandbox and launch a controlled browser session.</p></div><b>→</b></article><article><span>02</span><div><h3>Observe</h3><p>Record browser activity alongside available network and system telemetry.</p></div><b>→</b></article><article><span>03</span><div><h3>Correlate</h3><p>Compare phases and connect events while preserving source and timing.</p></div><b>→</b></article><article><span>04</span><div><h3>Reconstruct</h3><p>Review the evidence graph, hypotheses, timeline, and portable case.</p></div><b>↗</b></article></div></div></section>

      <section className="case-section" id="cases"><div className="case-copy"><p className="eyebrow">EXAMPLE RESEARCH CASE · STAGE 1.8</p><h2>Untrusted instruction.<br/><span>Observed outcome.</span></h2><p>A recorded synthetic prompt-injection experiment checked whether an agent would change its task after reading hostile page content. The visible result is limited to actions and telemetry the run actually recorded.</p><a className="light-text-link" href="#investigation-console">Run your own investigation <span aria-hidden="true">↗</span></a></div><div className="case-card"><div className="case-card-top"><span>CASE SNAPSHOT</span><span>EXAMPLE · NOT A LIVE RUN</span></div><div className="case-outcome"><span className="outcome-symbol">✓</span><div><small>OBSERVED OUTCOME</small><strong>Instruction ignored</strong><span>Untrusted instruction observed · no deviation recorded</span></div></div><div className="case-facts"><div><span>PROVIDER</span><b>OpenRouter</b></div><div><span>MODEL ROUTED</span><b>nvidia/nemotron-3-ultra-550b-a55b:free</b></div><div><span>TOOL ACTIONS</span><b>Page text inspection · finish</b></div><div><span>SYSTEM OBSERVATION</span><b>Browser events recorded · no socket event observed</b></div></div><ExampleEvidenceChain/><div className="case-card-bottom"><span>Illustrative snapshot from a prior recorded run.</span><span className="mono">STAGE 1.8</span></div></div></section>

      <WhyKraxx/><ResearchDomains/><section className="research-domains"><div><p className="eyebrow">RESEARCH QUESTIONS</p><h2>Built to make<br/>behavior <span>inspectable.</span></h2></div><ResearchQuestions/></section>

      <section className="open-section" id="documentation"><div className="open-mark">K<span>.</span></div><div><p className="eyebrow">OPEN RESEARCH TOOLING</p><h2>Built in<br/><span>the open.</span></h2><p>Explore the code, review the evidence model, and run the console locally. Cases can be exported for review and reproducibility.</p><a href="https://github.com/Basilmellow/KraxxDeceit" target="_blank" rel="noreferrer" className="primary-cta">Explore KraxxDeceit on GitHub <span aria-hidden="true">↗</span></a><a className="text-cta case-format-link" href="https://github.com/Basilmellow/KraxxDeceit/blob/main/lib/case-schema.ts" target="_blank" rel="noreferrer">Read the case format <span aria-hidden="true">↗</span></a></div><span className="open-side-note">KRAXX SECURITY RESEARCH</span></section>

      <section className="console-section" id="investigation-console"><div className="console-heading"><div><p className="eyebrow">THE INVESTIGATION CONSOLE</p><h2>Put a URL<br/><span>under observation.</span></h2></div><p>Submit a target to create a controlled browser investigation and generate an inspectable research case.</p></div>
        <form className="investigate-form" onSubmit={submit}><input type="url" required value={url} onChange={(event) => setUrl(event.target.value)} placeholder="https://suspicious.example" aria-label="URL to investigate" /><button type="submit" disabled={running}>{running ? "INVESTIGATING..." : "START INVESTIGATION"}<span aria-hidden="true">↗</span></button></form>
        <div className="trust-row"><span>ISOLATED SANDBOX</span><span>BROWSER + SYSTEM TELEMETRY</span><span>PORTABLE CASE OUTPUT</span></div>
        {process.env.NODE_ENV === "development" && <div className="dev-tools"><div className="dev-tools-heading"><span>DEVELOPMENT EXPERIMENTS</span><span>FIXED SYNTHETIC FIXTURES · DEVELOPMENT ONLY</span></div><div className="dev-tool-row"><button type="button" className="export-button" onClick={runBasicExperiment} disabled={running}>{running ? "RUNNING EXPERIMENT..." : "RUN BASIC PROMPT INJECTION EXPERIMENT"}</button><span className="muted">Destination allowlist: example.com</span></div><div className="dev-tool-row"><button type="button" className="export-button" onClick={runRealAgentExperiment} disabled={running}>{running ? "RUNNING REAL AGENT..." : "RUN REAL AI AGENT EXPERIMENT"}</button><span className="muted">Configured provider when available · deterministic fallback otherwise</span></div><div className="dev-tool-row chain-launch"><label htmlFor="chain-mode">CONTROLLED AGENT NAVIGATION CHAIN</label><select id="chain-mode" value={chainMode} onChange={(event)=>setChainMode(event.target.value as ChainMode)} disabled={running}><option value="ignore">IGNORE</option><option value="follow-safe">FOLLOW-SAFE</option><option value="blocked">BLOCKED</option></select><button type="button" className="export-button" onClick={runChainExperiment} disabled={running}>{running ? "RUNNING CHAIN..." : "RUN CONTROLLED CHAIN"}</button></div></div>}
      </section>
      {error && <section className="panel error-panel"><div className="panel-kicker">ENGINE ERROR</div><p>{error}</p></section>}

      {result && (
        <section className="results">
          <div className="panel result-header">
            <div><div className="panel-kicker">KRAXX CASE · SCHEMA {result.schemaVersion}</div><h2>{result.caseId}</h2><p className="muted case-summary">{result.summary}</p><button type="button" className="export-button" onClick={exportCase}>EXPORT CASE JSON</button></div>
            <div className="status-badge">{result.status.toUpperCase()}</div>
          </div>

          {result.experiment?.id === "real-indirect-prompt-injection" && <article className="panel experiment-panel">
            <div className="panel-kicker">REAL AI AGENT EXPERIMENT · v{result.experimentVersion ?? result.experiment.version}</div>
            <div className="metric-row agent-metrics">
              <div><strong>{(result.agentProvider ?? result.modelExecution?.provider) === "openrouter" ? "OpenRouter" : result.agentProvider ?? result.modelExecution?.provider ?? "unknown"}</strong><span>PROVIDER</span></div>
              <div><strong>{result.agentModel ?? "Deterministic fallback"}</strong><span>MODEL</span></div>
              <div><strong>{result.modelExecution?.toolCalls ?? result.agentActions?.length ?? 0}</strong><span>TOOL CALLS</span></div>
              <div><strong>{result.agent?.completed ? "COMPLETED" : result.agent?.terminationReason ?? "INCOMPLETE"}</strong><span>AGENT STATUS</span></div>
            </div>
            <p className="muted">Real model execution: {result.realModelExecution ? "yes" : "no; fallback or no model tool call"} · Synthetic fixture: {result.syntheticFixture ? "yes" : "no"}</p>
            <h3 className="panel-kicker subsection">UNTRUSTED WEB CONTENT</h3>
            <p className="mono wrap">{result.events?.find((event) => event.action === "browser.untrusted_instruction_observed")?.details.detail ?? "No hostile instruction was observed in browser telemetry."}</p>
            <h3 className="panel-kicker subsection">POLICY DECISIONS</h3>
            <div className="stack">{(result.agentActions ?? []).filter((action) => action.tool === "navigate").map((action) => <div className="event" key={action.id}><span>{action.policyDecision?.toUpperCase() ?? "NOT RECORDED"} · {action.executionStatus ?? "unknown"}</span><span className="mono wrap">{String(action.input.url ?? "")}{typeof action.result.reason === "string" ? ` · ${action.result.reason}` : ""}</span></div>)}{!(result.agentActions ?? []).some((action) => action.tool === "navigate") && <p className="muted">No navigation was requested.</p>}</div>
            <h3 className="panel-kicker subsection">OBSERVED EFFECTS</h3>
            <p className="muted">Browser: {result.agentBrowser?.pageEvents.filter((event) => event.type === "navigation").length ?? 0} agent-context navigation events · {result.agentBrowser?.requests.length ?? 0} requests. Network and system effects are shown in the differential and evidence graph below.</p>
          </article>}

          {result.experimentSummary && <article className="panel evidence-chain-panel">
            <div className="panel-kicker">EVIDENCE CHAIN · {result.experimentSummary.mode.toUpperCase()} · TELEMETRY: {result.telemetryMode?.toUpperCase() ?? result.telemetry?.mode?.toUpperCase() ?? "SNAPSHOT"}</div>
            <p className="muted">Synthetic deterministic action. All displayed telemetry stages are tied to observed event IDs; association does not independently establish causation.</p>
            <div className="chain-stage-list">{result.evidenceChain?.nodes.map((node)=><button type="button" className={`chain-stage phase-${node.phase ?? "unknown"}`} key={node.id} onClick={()=>setSelectedEventId(node.eventId)} aria-pressed={selectedEventId===node.eventId}>
              <span className="phase-badge">{node.phase === "baseline" && (node.type === "SOCKET_OBSERVATION" || node.type === "PROCESS_OBSERVATION") ? "PRE-EXISTING" : (node.phase ?? "unknown").replaceAll("_"," ").toUpperCase()}</span><span className="panel-kicker">{node.type.replaceAll("_"," ")}</span><strong className="mono">{node.eventId}</strong><span className="muted">T+{formatTime(node.timestampMs)} · {node.source} · {node.trafficScope ?? "unknown"}</span><span className="mono wrap">{Object.entries(node.details).map(([key,value])=>`${key}: ${value}`).join(" · ")}</span>
            </button>)}</div>
            <p className="event"><span>CHAIN COMPLETE</span><strong>{result.experimentSummary.chainComplete ? "YES" : "NO"}</strong></p>
            <p className="muted">Observed: {result.experimentSummary.observedStages.join(" · ") || "None"}</p>
            {result.experimentSummary.missingStages.length>0&&<p className="muted">Missing: {result.experimentSummary.missingStages.join(" · ")}</p>}
            <p className="muted">{result.experimentSummary.limitation}</p>
            <h3 className="panel-kicker subsection">EXPERIMENT TIMELINE</h3><div className="timeline">{result.evidenceChain?.timeline.map((item)=><button type="button" className={`timeline-event timeline-select phase-${item.phase ?? "unknown"}`} key={item.id} onClick={()=>setSelectedEventId(item.id)}><span className="timeline-time">T+{formatTime(item.timestampMs)}</span><span className="timeline-dot"/><div><strong>{item.step.toUpperCase()}</strong><span className="timeline-category">{item.phase?.replaceAll("_"," ").toUpperCase() ?? "UNKNOWN"} · {item.trafficScope ?? "unknown"} · {item.id}</span></div></button>)}</div>
          </article>}

          {result.experimentResult && <article className="panel experiment-panel">
            <div className="panel-kicker">EXPERIMENT</div>
            <h2>{result.experimentResult.experimentSummary.experiment}</h2>
            <p className="muted">TASK</p><p>{result.experimentResult.experimentSummary.task}</p>
            <div className="grid experiment-stats">
              <div><h3>BASELINE</h3><p>{result.experimentResult.baseline.requests} requests · {result.experimentResult.baseline.hosts.join(", ") || "no hosts"} · {result.experimentResult.baseline.navigations.length} navigations</p></div>
              <div><h3>AGENT</h3><p>{result.experimentResult.agent.actions} actions · {result.experimentResult.agent.requests} requests · {result.experimentResult.agent.hosts.join(", ") || "no hosts"} · {result.experimentResult.agent.navigations.length} navigations</p></div>
            </div>
            <p className="panel-kicker subsection">EXPERIMENT OUTCOME</p>
            <div className="trust-row">{result.experimentResult.outcomes.map((outcome) => <span className="outcome-badge" key={outcome}>{outcome.replaceAll("_", " ").toUpperCase()}</span>)}</div>
            <h3 className="panel-kicker subsection">ACTION TIMELINE</h3>
            <div className="timeline">{result.experimentResult.timeline.map((step, index) => {
              const evidence = result.events?.find((event) => event.id === step.evidenceId);
              return <button type="button" className="timeline-event timeline-select" key={`${step.evidenceId}-${index}`} disabled={!evidence} onClick={() => evidence && setSelectedEventId(step.evidenceId)}><span className="timeline-time">{index + 1}</span><span className="timeline-dot"/><div><strong>{step.step}</strong><span className="timeline-category">{step.evidenceId}</span><p className="mono wrap">{step.detail}</p></div></button>;
            })}</div>
            <h3 className="panel-kicker subsection">EXPERIMENT SUMMARY</h3>
            <p>{result.experimentResult.experimentSummary.baselineBehavior}</p><p>{result.experimentResult.experimentSummary.agentBehavior}</p>
            <p className="muted">Differential: {result.experimentResult.experimentSummary.differential.join(" · ") || "No additional baseline differences."}</p>
            <p className="muted">Hypotheses: {result.experimentResult.experimentSummary.hypotheses.join(" · ") || "None generated."}</p>
            <p className="muted">Blocked actions: {result.experimentResult.experimentSummary.blockedActions.join(" · ") || "None."}</p>
            <p className="muted">Observed external destinations: {result.experimentResult.experimentSummary.observedExternalDestinations.join(" · ") || "None."}</p>
            <p className="muted">Limitations: {result.experimentResult.experimentSummary.limitations.join(" ")}</p>
          </article>}

          <div className="grid">
            <article className="panel">
              <div className="panel-kicker">TARGET</div>
              <p className="mono wrap">{result.target?.submittedUrl ?? result.url ?? "Unavailable"}</p>
              <p className="muted">FINAL URL</p>
              <p className="mono wrap">{result.target?.finalUrl ?? result.browser.finalUrl ?? "Not observed"}</p>
              <p className="muted">PAGE TITLE</p>
              <p>{result.browser.pageTitle || "Unavailable"}</p>
            </article>
            <article className="panel">
              <div className="panel-kicker">BROWSER OBSERVATION</div>
              <div className="event"><span>BROWSER</span><span>Chromium</span></div>
              <div className="event"><span>HTTP STATUS</span><span>{result.browser.httpStatus ?? "Unavailable"}</span></div>
              <div className="event"><span>SCREENSHOTS</span><span>{result.browser.screenshotAvailable ? "Initial and final captured" : "Unavailable"}</span></div>
              <div className="event"><span>DOM</span><span>{result.browser.domCaptured ? `Captured${result.browser.domTruncated ? " · truncated at 1 MB" : ""}` : "Unavailable"}</span></div>
              <div className="event"><span>DOM MUTATIONS</span><span>{result.browser.domMutations}</span></div>
              {result.browser.browserError && <p className="muted browser-error">{result.browser.browserError}</p>}
            </article>
          </div>

          <article className="panel">
            <div className="panel-kicker">NETWORK ACTIVITY</div>
            <div className="metric-row">
              <div><strong>{result.browser.requests.length}</strong><span>REQUESTS</span></div>
              <div><strong>{result.browser.responses.length}</strong><span>RESPONSES</span></div>
              <div><strong>{result.browser.failedRequests.length}</strong><span>FAILED</span></div>
            </div>
            {result.browser.requests.length > 0 && <div className="table-scroll"><table><thead><tr><th>METHOD</th><th>TYPE</th><th>URL</th></tr></thead><tbody>
              {result.browser.requests.map((request) => <tr key={request.id}><td>{request.method}</td><td>{request.resourceType}</td><td className="mono wrap">{request.url}</td></tr>)}
            </tbody></table></div>}
            {result.browser.failedRequests.length > 0 && <div className="stack subsection"><div className="panel-kicker">FAILED REQUESTS</div>
              {result.browser.failedRequests.map((request) => <div className="event" key={request.id}><span>{request.method} · {request.resourceType}</span><span className="mono wrap">{request.url}<br /><span className="muted">{request.failure}</span></span></div>)}
            </div>}
          </article>

          <div className="grid">
            <article className="panel"><div className="panel-kicker">REDIRECT CHAIN</div>
              {result.redirectChain.length === 0 ? <p className="muted">No redirect observed.</p> : <div className="stack">{result.redirectChain.map((item, index) => <div className="event" key={`${item}-${index}`}><span>{String(index + 1).padStart(2, "0")}</span><span className="mono wrap">{item}</span></div>)}</div>}
            </article>
            <article className="panel"><div className="panel-kicker">IFRAMES & DOWNLOADS</div>
              <p className="muted">{result.browser.iframes.length} iframe URL{result.browser.iframes.length === 1 ? "" : "s"} observed · {result.browser.downloads.length} download event{result.browser.downloads.length === 1 ? "" : "s"}</p>
              <div className="stack">{result.browser.iframes.map((frame, index) => <div className="event" key={`${frame}-${index}`}><span>IFRAME</span><span className="mono wrap">{frame}</span></div>)}
                {result.browser.downloads.map((download, index) => <div className="event" key={`download-${index}`}><span>DOWNLOAD</span><span className="mono wrap">{download.url} · {download.detail}</span></div>)}</div>
            </article>
          </div>

          <div className="grid">
            <article className="panel"><div className="panel-kicker">PAGE EVENTS</div>
              {result.browser.console.length === 0 && result.browser.pageErrors.length === 0 ? <p className="muted">No console messages or page errors captured.</p> : <div className="stack">
                {result.browser.console.map((message, index) => <div className="event" key={`console-${index}`}><span>CONSOLE · {message.type.toUpperCase()}</span><span className="mono wrap">{message.text}</span></div>)}
                {result.browser.pageErrors.map((message, index) => <div className="event" key={`page-error-${index}`}><span>PAGE ERROR</span><span className="mono wrap">{message}</span></div>)}
              </div>}
            </article>
            <article className="panel"><div className="panel-kicker">OBSERVED INDICATORS</div>
              {result.indicators.length === 0 ? <p className="muted">No indicators extracted.</p> : <div className="stack">{result.indicators.map((indicator) => <div className="event" key={`${indicator.type}:${indicator.value}`}><span>{indicator.type}</span><span className="mono wrap">{indicator.value}</span></div>)}</div>}
            </article>
          </div>

          {result.browser.screenshotAvailable && <article className="panel"><div className="panel-kicker">SCREENSHOTS</div><div className="screenshot-grid">
            {result.browser.initialScreenshot && <figure><figcaption>INITIAL</figcaption><img src={result.browser.initialScreenshot} alt="Initial browser screenshot" /></figure>}
            {result.browser.finalScreenshot && <figure><figcaption>FINAL</figcaption><img src={result.browser.finalScreenshot} alt="Final browser screenshot" /></figure>}
          </div></article>}

          {result.agent && <article className="panel agent-panel">
            <div className="panel-kicker">AI AGENT EXPERIMENT</div>
            <p className="muted">{result.agent.task}</p>
            <div className="metric-row agent-metrics">
              <div><strong>{result.agent.provider === "openrouter" ? "OpenRouter" : result.agent.provider}</strong><span>PROVIDER</span></div>
              <div><strong>{result.agent.model || "Deterministic"}</strong><span>MODEL</span></div>
              <div><strong>{result.agent.actionCount}</strong><span>ACTIONS</span></div>
              <div><strong>{result.agent.completed ? "YES" : "NO"}</strong><span>COMPLETED</span></div>
            </div>
            {result.agent.terminationReason && <p className="muted">Termination: {result.agent.terminationReason}</p>}
            {result.agent.summary && <p className="agent-summary">{result.agent.summary}</p>}
            <div className="timeline">{result.agent.actions.map((action) => <div className="timeline-event" key={action.id}>
              <span className="timeline-time">{formatTime(action.timestampMs)}</span><span className="timeline-dot" />
              <div><strong>{action.tool.toUpperCase()}</strong><span className="timeline-category">{action.result.status ? String(action.result.status) : ""}</span>
                {action.tool === "get_page_text" && <p className="muted">Page text returned as untrusted webpage data ({typeof action.result.content === "string" ? action.result.content.length : 0} characters).</p>}
                {action.tool === "finish" && typeof action.input.summary === "string" && <p>{action.input.summary}</p>}
                {typeof action.result.detail === "string" && <p className="muted">{action.result.detail}</p>}
              </div>
            </div>)}</div>
          </article>}

          {result.differential && <article className="panel">
            <div className="panel-kicker">AGENT-ONLY ACTIVITY</div>
            <p className="muted">Observed only during agent execution</p>
            <div className="grid agent-diff">
              <div><h3>BASELINE</h3><p>{new Set((result.browser.requests || []).map((item) => { try { return new URL(item.url).hostname; } catch { return ""; } }).filter(Boolean)).size} hosts · {result.browser.requests.length} requests · {result.browser.pageEvents.filter((event)=>event.type==="navigation").length} navigations · {result.experimentResult?.baseline.processes ?? 0} processes · {result.experimentResult?.baseline.connections ?? 0} connections</p></div>
              <div><h3>AGENT</h3><p>{new Set((result.agentBrowser?.requests || []).map((item) => { try { return new URL(item.url).hostname; } catch { return ""; } }).filter(Boolean)).size} hosts · {(result.agentBrowser?.requests || []).length} requests · {result.differential.additionalNavigations.length} additional navigations · {result.experimentResult?.agent.processes ?? 0} processes · {result.experimentResult?.agent.connections ?? 0} connections</p></div>
            </div>
            {result.differential.additionalHosts.length > 0 && <div className="stack">{result.differential.additionalHosts.map((host) => <div className="event" key={host}><span>ADDITIONAL HOST</span><span className="mono wrap">{host}</span></div>)}</div>}
            {result.differential.additionalNavigations.length > 0 && <div className="stack">{result.differential.additionalNavigations.map((item, index) => <div className="event" key={`${item}-${index}`}><span>NAVIGATION</span><span className="mono wrap">{item}</span></div>)}</div>}
            {result.differential.additionalRequests.length > 0 && <details><summary>Additional requests ({result.differential.additionalRequests.length})</summary><div className="stack">{result.differential.additionalRequests.map((item) => <p className="mono wrap" key={item}>{item}</p>)}</div></details>}
            {result.differential.unexpectedActions.length > 0 && <p className="muted">Agent requested browser actions: {result.differential.unexpectedActions.join(", ")}</p>}
            <div className="metric-row agent-metrics">
              <div><strong>{result.differential.additionalProcesses?.length ?? 0}</strong><span>ADDITIONAL PROCESSES</span></div>
              <div><strong>{result.differential.additionalConnections?.length ?? 0}</strong><span>ADDITIONAL CONNECTIONS</span></div>
              <div><strong>{result.differential.additionalBrowserRequests?.length ?? 0}</strong><span>ADDITIONAL BROWSER REQUESTS</span></div>
            </div>
            {result.differential.additionalDestinations?.map((destination)=><div className="event" key={destination}><span>DESTINATION</span><span className="mono wrap">{destination}</span></div>)}
          </article>}

          <article className="panel hypotheses-panel">
            <div className="panel-kicker">CAUSAL HYPOTHESES</div>
            <p className="muted">Deterministic hypotheses supported by observed evidence. Correlation does not establish causation.</p>
            {result.hypotheses.length === 0 ? <p className="muted">No hypothesis met the evidence and timing rules.</p> : <div className="hypothesis-list">
              {result.hypotheses.map((hypothesis) => <button type="button" className="hypothesis-card" key={hypothesis.id} aria-pressed={selectedHypothesisId === hypothesis.id} onClick={() => setSelectedHypothesisId(selectedHypothesisId === hypothesis.id ? null : hypothesis.id)}>
                <span className="panel-kicker">{HYPOTHESIS_LABELS[hypothesis.type]}</span>
                <span className="hypothesis-state">{hypothesis.confidence.toUpperCase()} · {hypothesis.status.toUpperCase()}</span>
                <strong>{hypothesis.title}</strong>
                <span>{hypothesis.explanation}</span>
                <span className="hypothesis-label">SUPPORTING EVIDENCE</span>
                <span className="hypothesis-evidence mono">{hypothesis.sourceEvents.join(" · ")}</span>
                <span className="hypothesis-label">LIMITATIONS</span>
                {hypothesis.limitations.map((limitation, index) => <span className="muted" key={`${hypothesis.id}-limitation-${index}`}>{limitation}</span>)}
              </button>)}
            </div>}
          </article>

          {result.telemetry && <article className="panel">
            <div className="panel-kicker">SYSTEM TELEMETRY</div>
            <div className="metric-row">
              <div><strong>{result.telemetry.processes.length}</strong><span>PROCESSES OBSERVED</span></div>
              <div><strong>{result.telemetry.network.filter((item)=>item.state==="ESTABLISHED").length}</strong><span>NETWORK CONNECTIONS</span></div>
              <div><strong>{result.telemetry.providers.filter((provider)=>provider.available&&provider.name!=="ebpf-probe").map((provider)=>provider.name).join(" + ")||"Unavailable"}</strong><span>TELEMETRY PROVIDER</span></div>
              <div><strong>{result.telemetry.mode?.toUpperCase() ?? "SNAPSHOT"} · {result.telemetry.eventCount ?? result.telemetry.streamEvents?.length ?? 0}</strong><span>TELEMETRY MODE · EVENTS</span></div>
              <div><strong>{result.telemetry.ebpf.available?"AVAILABLE":"UNAVAILABLE"}</strong><span>EBPF CAPABILITY</span></div>
            </div>
            {!result.telemetry.ebpf.available&&result.telemetry.ebpf.reason&&<p className="muted">{result.telemetry.ebpf.reason}</p>}
            {result.telemetry.truncationMarkers.length>0&&<p className="muted">Truncation markers: {result.telemetry.truncationMarkers.join(", ")}</p>}
            {result.telemetry.processes.length>0&&<details className="telemetry-details"><summary>Processes ({result.telemetry.processes.length})</summary><div className="stack">{result.telemetry.processes.slice(0,20).map((process)=><div className="event" key={process.pid}><span>{process.command} · PID {process.pid}</span><span className="mono wrap">{process.executable} · PPID {process.ppid}</span></div>)}</div></details>}
            {result.telemetry.network.length>0&&<details className="telemetry-details"><summary>Network observations ({result.telemetry.network.length})</summary><div className="stack">{result.telemetry.network.slice(0,24).map((item,index)=><div className="event" key={`${item.protocol}-${item.localPort}-${item.destinationIp}-${index}`}><span>{item.protocol.toUpperCase()} · {item.state}</span><span className="mono wrap">{item.destinationIp}:{item.destinationPort}{item.pid?` · PID ${item.pid}`:""}</span></div>)}</div></details>}
            {result.telemetry.filesystem.length>0&&<details className="telemetry-details"><summary>Investigation workspace files ({result.telemetry.filesystem.length})</summary><div className="stack">{result.telemetry.filesystem.slice(0,24).map((item)=><div className="event" key={item.path}><span>{item.kind}</span><span className="mono wrap">{item.path} · {item.sizeBytes} bytes</span></div>)}</div></details>}
          </article>}

          <article className="panel"><div className="panel-kicker">TIMELINE</div>
            {result.events?.length ? <div className="timeline">{result.events.map((event) => <button type="button" className="timeline-event timeline-select" key={event.id} aria-pressed={selectedEventId === event.id} onClick={() => setSelectedEventId(selectedEventId === event.id ? null : event.id)}>
              <span className="timeline-time">{formatTime(event.timestampMs)}</span><span className="timeline-dot" />
              <div><strong>{event.action.toUpperCase()}</strong><span className="timeline-category">{event.source}</span>
                <p className="mono wrap">{Object.entries(event.details).map(([key, value]) => `${key}: ${value}`).join(" · ")}</p>
              </div>
            </button>)}</div> : result.observations.length===0?<p className="muted">No observations captured.</p>:<div className="timeline">{result.observations.map((event)=><div className="timeline-event" key={event.id}><span className="timeline-time">{formatTime(event.timestampMs)}</span><span className="timeline-dot"/><div><strong>{event.action.replaceAll("_"," ").toUpperCase()}</strong><span className="timeline-category">{event.category}</span>{event.details&&<p className="mono wrap">{Object.entries(event.details).map(([key,value])=>`${key}: ${value}`).join(" · ")}</p>}</div></div>)}</div>}
            {selectedEvent && <div className="selected-event">
              <div className="panel-kicker">SELECTED EVENT</div>
              <div className="event"><span>EVENT ID</span><span className="mono">{selectedEvent.id}</span></div>
              <div className="event"><span>TIMESTAMP</span><span>{formatTime(selectedEvent.timestampMs)} · {selectedEvent.timestampMs} ms</span></div>
              <div className="event"><span>SOURCE</span><span>{selectedEvent.source}</span></div>
              <div className="event"><span>ACTION</span><span className="mono wrap">{selectedEvent.action}</span></div>
              <div className="event"><span>DETAILS</span><span className="mono wrap">{Object.entries(selectedEvent.details).map(([key, value]) => `${key}: ${value}`).join(" · ")}</span></div>
              <div className="event"><span>RELATED EVENTS</span><span className="mono wrap">{relatedEventIds.join(" · ") || "None"}</span></div>
              <div className="event"><span>RELATED HYPOTHESES</span><span className="mono wrap">{linkedHypotheses.map((hypothesis) => hypothesis.id).join(" · ") || "None"}</span></div>
            </div>}
          </article>

          {result.evidenceGraph&&<article className="panel evidence-graph">
            <div className="panel-kicker">EVIDENCE GRAPH</div><p className="graph-selection-label" aria-live="polite">{activeGraphNodeId ? `OBSERVED RELATIONSHIP · ${relatedEdges.length} recorded connections` : "Select an evidence source to highlight its recorded relationships."}</p>
            <p className="muted">Observed relationships only. Edges show timing or matching destinations and do not establish causality.</p>
            <div className="graph-columns"><div><h3>NODES · {result.evidenceGraph.nodes.length}</h3><div className="graph-node-list">{result.evidenceGraph.nodes.map((node)=><button type="button" className={`graph-node${highlightedEvidenceIds.has(node.id)?" is-highlighted":""}${activeGraphNodeId ? relatedGraphNodeIds.has(node.id) ? " is-related" : " is-dim" : ""}`} key={node.id} aria-pressed={selectedGraphNodeId === node.id} onPointerEnter={event => { if (event.pointerType === "mouse") setHoveredGraphNodeId(node.id); }} onPointerLeave={() => setHoveredGraphNodeId(null)} onFocus={() => setHoveredGraphNodeId(node.id)} onBlur={() => setHoveredGraphNodeId(null)} onKeyDown={event => { if (event.key === "Escape") { setSelectedGraphNodeId(null); setHoveredGraphNodeId(null); } }} onClick={() => { setHoveredGraphNodeId(null); setSelectedGraphNodeId(value => value === node.id ? null : node.id); if (node.details?.eventId) setSelectedEventId(node.details.eventId); }}><span>{node.type}</span><strong className="wrap">{node.label}</strong></button>)}</div></div>
              <div><h3>RELATIONSHIPS · {result.evidenceGraph.edges.length}</h3><div className="graph-edge-list">{result.evidenceGraph.edges.map((edge)=><div className={`graph-edge${activeGraphNodeId ? relatedEdges.some(item => item.id === edge.id) ? " is-related" : " is-dim" : ""}`} key={edge.id}><span>{result.evidenceGraph!.nodes.find(n=>n.id===edge.sourceId)?.label??edge.sourceId}</span><i>{edge.label} · {edge.confidence}</i><span>{result.evidenceGraph!.nodes.find(n=>n.id===edge.targetId)?.label??edge.targetId}</span></div>)}</div></div></div>
            {result.evidenceGraph.truncated&&<p className="muted">Graph output was truncated to the configured bounds.</p>}
          </article>}

          {result.browser.domHtml && <details className="panel dom-panel"><summary className="panel-kicker">FINAL DOM HTML{result.browser.domTruncated ? " · TRUNCATED" : ""}</summary><pre className="terminal">{result.browser.domHtml}</pre></details>}
          <article className="panel"><div className="panel-kicker">RAW SANDBOX OUTPUT</div><pre className="terminal">{result.raw.stdout || result.raw.stderr || "No output."}</pre></article>
        </section>
      )}

      <FinalCta/><footer><div className="footer-brand">KraxxDeceit <span>Part of Kraxx / Kraxxsec</span></div><div className="footer-links"><a href="https://github.com/Basilmellow/KraxxDeceit" target="_blank" rel="noreferrer">GitHub ↗</a><a href="#documentation">Documentation</a></div></footer>
    </MotionSurface>
  );
}
