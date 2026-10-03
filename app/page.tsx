"use client";

import { FormEvent, useState } from "react";
import type { InvestigationCase } from "@/lib/case-schema";
import type { ExperimentResult } from "@/lib/experiment-schema";

type InvestigationResult = InvestigationCase & { url?: string; experimentResult?: ExperimentResult };

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
  multi_stage_attack_chain: "MULTI-STAGE ATTACK CHAIN",
  untrusted_instruction_to_agent_navigation: "UNTRUSTED INSTRUCTION → AGENT NAVIGATION",
  untrusted_instruction_ignored: "UNTRUSTED INSTRUCTION IGNORED",
};

export default function HomePage() {
  const [url, setUrl] = useState("");
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<InvestigationResult | null>(null);
  const [error, setError] = useState("");
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [selectedHypothesisId, setSelectedHypothesisId] = useState<string | null>(null);

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
    setSelectedHypothesisId(null);

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
    setSelectedHypothesisId(null);
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

  const selectedEvent = result?.events?.find((event) => event.id === selectedEventId) ?? null;
  const selectedHypothesis = result?.hypotheses.find((hypothesis) => hypothesis.id === selectedHypothesisId) ?? null;
  const linkedHypotheses = selectedEvent ? result?.hypotheses.filter((hypothesis) => hypothesis.sourceEvents.includes(selectedEvent.id)) ?? [] : [];
  const relatedEventIds = selectedEvent ? [...new Set(linkedHypotheses.flatMap((hypothesis) => hypothesis.sourceEvents).filter((id) => id !== selectedEvent.id))] : [];
  const highlightedEvidenceIds = new Set(selectedHypothesis?.evidenceNodeIds ?? []);

  return (
    <main className="shell">
      <nav className="nav">
        <div className="brand" aria-label="KraxxDeceit">
          <img className="brand-mark" src="/kraxxdeceit-mark.png" alt="" />
          <span className="brand-wordmark"><span>KRAXX</span><span>DECEIT</span></span>
        </div>
        <span className="status-pill">RESEARCH ENGINE · v0.1</span>
      </nav>

      <section className="hero">
        <p className="eyebrow">Kraxx Security Research</p>
        <h1>Execute hostile web environments.<br /><span>Observe what actually happens.</span></h1>
        <p className="hero-copy">
          Submit a suspicious URL. Kraxx executes it inside an isolated research
          environment and turns observed behavior into a reproducible security case.
        </p>
        <form className="investigate-form" onSubmit={submit}>
          <input type="url" required value={url} onChange={(event) => setUrl(event.target.value)} placeholder="https://suspicious.example" aria-label="URL to investigate" />
          <button type="submit" disabled={running}>{running ? "INVESTIGATING..." : "START INVESTIGATION"}</button>
        </form>
        <div className="trust-row"><span>ISOLATED SANDBOX</span><span>BEHAVIORAL TELEMETRY</span><span>PORTABLE CASE OUTPUT</span></div>
        {process.env.NODE_ENV === "development" && <div className="experiment-launch"><button type="button" className="export-button" onClick={runBasicExperiment} disabled={running}>{running ? "RUNNING EXPERIMENT..." : "RUN BASIC PROMPT INJECTION EXPERIMENT"}</button><span className="muted">Fixed synthetic fixture · destination allowlist: example.com</span></div>}
      </section>

      {error && <section className="panel error-panel"><div className="panel-kicker">ENGINE ERROR</div><p>{error}</p></section>}

      {result && (
        <section className="results">
          <div className="panel result-header">
            <div><div className="panel-kicker">KRAXX CASE · SCHEMA {result.schemaVersion}</div><h2>{result.caseId}</h2><p className="muted case-summary">{result.summary}</p><button type="button" className="export-button" onClick={exportCase}>EXPORT CASE JSON</button></div>
            <div className="status-badge">{result.status.toUpperCase()}</div>
          </div>

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
              <div><strong>{result.agent.provider}</strong><span>PROVIDER</span></div>
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
              <div><h3>BASELINE</h3><p>{new Set((result.browser.requests || []).map((item) => { try { return new URL(item.url).hostname; } catch { return ""; } }).filter(Boolean)).size} hosts · {result.browser.requests.length} requests</p></div>
              <div><h3>AGENT</h3><p>{new Set((result.agentBrowser?.requests || []).map((item) => { try { return new URL(item.url).hostname; } catch { return ""; } }).filter(Boolean)).size} hosts · {(result.agentBrowser?.requests || []).length} requests · {result.differential.additionalNavigations.length} additional navigations</p></div>
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
            <div className="panel-kicker">EVIDENCE GRAPH</div>
            <p className="muted">Observed relationships only. Edges show timing or matching destinations and do not establish causality.</p>
            <div className="graph-columns"><div><h3>NODES · {result.evidenceGraph.nodes.length}</h3><div className="graph-node-list">{result.evidenceGraph.nodes.map((node)=><div className={`graph-node${highlightedEvidenceIds.has(node.id)?" is-highlighted":""}`} key={node.id}><span>{node.type}</span><strong className="wrap">{node.label}</strong></div>)}</div></div>
              <div><h3>RELATIONSHIPS · {result.evidenceGraph.edges.length}</h3><div className="graph-edge-list">{result.evidenceGraph.edges.map((edge)=><div className="graph-edge" key={edge.id}><span>{result.evidenceGraph!.nodes.find(n=>n.id===edge.sourceId)?.label??edge.sourceId}</span><i>{edge.label} · {edge.confidence}</i><span>{result.evidenceGraph!.nodes.find(n=>n.id===edge.targetId)?.label??edge.targetId}</span></div>)}</div></div></div>
            {result.evidenceGraph.truncated&&<p className="muted">Graph output was truncated to the configured bounds.</p>}
          </article>}

          {result.browser.domHtml && <details className="panel dom-panel"><summary className="panel-kicker">FINAL DOM HTML{result.browser.domTruncated ? " · TRUNCATED" : ""}</summary><pre className="terminal">{result.browser.domHtml}</pre></details>}
          <article className="panel"><div className="panel-kicker">RAW SANDBOX OUTPUT</div><pre className="terminal">{result.raw.stdout || result.raw.stderr || "No output."}</pre></article>
        </section>
      )}

      <footer><span>KraxxDeceit</span><span>Part of Kraxx</span></footer>
    </main>
  );
}
