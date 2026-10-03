import { Sandbox } from "@vercel/sandbox";
import { randomUUID } from "node:crypto";
import { InvestigationCaseSchema, type InvestigationCase } from "./case-schema";
import { PLAYWRIGHT_VERSION, runBrowserInvestigation } from "./browser-investigator";
import { DENIED_SANDBOX_SUBNETS, validatePublicHttpUrl } from "./url-safety";
import { normalizeInvestigationEvents, buildEvidenceGraph } from "./evidence-graph";
import { buildDifferential } from "./differential-engine";
import { buildHypotheses, linkHypothesesToEvidenceGraph } from "./hypothesis-engine";
import type { TelemetryCollection } from "./telemetry/provider";
import { BASIC_INDIRECT_PROMPT_INJECTION } from "../experiments/web-agent/prompt-injection-basic";
import { REAL_INDIRECT_PROMPT_INJECTION } from "../experiments/web-agent/real-indirect-prompt-injection";
import { buildExperimentResult } from "./experiment-runner";
import type { ExperimentDefinition } from "./experiment-schema";
import { lookup } from "node:dns/promises";
import { normalizeExperimentEvents } from "./experiment-events";
import { ATTRIBUTION_METHODOLOGY_VERSION, POST_ACTION_WINDOW_MS, evaluateActionToEffectHypothesis, type ActionAnchor } from "./attribution-engine";

export class SandboxExecutionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SandboxExecutionError";
  }
}

function errorDetail(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  const token = process.env.VERCEL_OIDC_TOKEN;
  const summarize = (value: unknown, depth = 0): string => {
    if (!(value instanceof Error) || depth > 2) return String(value);
    const code = "code" in value && typeof value.code === "string" ? ` [${value.code}]` : "";
    const nested = value instanceof AggregateError
      ? [...value.errors].slice(0, 4).map((item) => summarize(item, depth + 1)).join("; ")
      : value.cause ? summarize(value.cause, depth + 1) : "";
    return `${value.name}${code}: ${value.message}${nested ? ` {${nested}}` : ""}`;
  };
  const cause = error instanceof Error && error.cause ? ` (cause: ${summarize(error.cause)})` : "";
  const detail = `${message}${cause}`;
  return token ? detail.split(token).join("[redacted]") : detail;
}

function publicUrl(raw: string) {
  const url = new URL(raw);
  url.username = "";
  url.password = "";
  url.hash = "";
  for (const key of [...url.searchParams.keys()]) {
    if (/(token|api.?key|auth|session|pass(word)?|secret|credential|signature|^sig$|^code$)/i.test(key)) {
      url.searchParams.set(key, "[redacted]");
    }
  }
  return url.toString();
}

function collectIndicators(urls: string[]) {
  const indicators: Array<{ type: string; value: string }> = [];
  const seen = new Set<string>();
  for (const raw of urls) {
    let value: string;
    try { value = publicUrl(raw); } catch { continue; }
    const key = `url:${value}`;
    if (!seen.has(key)) {
      seen.add(key);
      indicators.push({ type: "url", value });
    }
    const hostname = new URL(raw).hostname.replace(/^\[|\]$/g, "");
    if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(hostname)) {
      const ipKey = `ipv4:${hostname}`;
      if (!seen.has(ipKey)) {
        seen.add(ipKey);
        indicators.push({ type: "ipv4", value: hostname });
      }
    }
    if (indicators.length >= 100) break;
  }
  return indicators;
}

export async function investigateUrl(rawUrl: string, experiment?: ExperimentDefinition): Promise<InvestigationCase> {
  // Validate syntax and DNS before creating any remote compute. Sandbox subnet
  // denies and the browser's request route repeat this check after redirects.
  const target = await validatePublicHttpUrl(rawUrl);
  if (experiment && (process.env.NODE_ENV !== "development" || target.toString() !== experiment.fixtureUrl || ![BASIC_INDIRECT_PROMPT_INJECTION.id, REAL_INDIRECT_PROMPT_INJECTION.id].includes(experiment.id))) {
    throw new Error("This fixed experiment is available only in the local development environment.");
  }
  const safeTarget = publicUrl(target.toString());
  const caseId = `CASE-${new Date().toISOString().slice(0, 10).replaceAll("-", "")}-${randomUUID().slice(0, 8).toUpperCase()}`;

  if (process.env.NODE_ENV === "development") {
    const authAvailable = Boolean(process.env.VERCEL_OIDC_TOKEN?.trim());
    console.info(`[KRAXX] Vercel Sandbox auth: ${authAvailable ? "available" : "missing"}`);
  }
  if (!process.env.VERCEL_OIDC_TOKEN?.trim()) {
    throw new Error("Vercel Sandbox authentication is missing. Run `vercel link` and `vercel env pull .env.local`, then restart the dev server.");
  }

  let sandbox: Sandbox;
  try {
    sandbox = await Sandbox.create({
      name: `kraxxdeceit-${caseId.toLowerCase()}`,
      persistent: false,
      timeout: 170_000,
      resources: { vcpus: 2 },
      networkPolicy: "allow-all",
    });
  } catch (error) {
    throw new SandboxExecutionError(`Sandbox creation/authentication failed: ${errorDetail(error)}`);
  }

  const createdAt = new Date().toISOString();
  try {
    const healthCheck = await sandbox.runCommand({ cmd: "node", args: ["-e", "console.log('KRAXX_SANDBOX_OK')"] });
    const healthStdout = await healthCheck.stdout();
    const healthStderr = await healthCheck.stderr();
    if (healthCheck.exitCode !== 0 || !healthStdout.includes("KRAXX_SANDBOX_OK")) {
      throw new SandboxExecutionError(`Sandbox health check failed (exit code ${healthCheck.exitCode}). stderr: ${healthStderr.slice(0, 1000) || "<empty>"}`);
    }

    const browserRun = await runBrowserInvestigation(sandbox, target.toString(), experiment ? { allowedDestinations: experiment.allowedDestinations, task: experiment.task } : undefined);
    const investigationStartedAtMs = Date.parse(createdAt);
    const browser = browserRun.browser;
    const finalUrl = browserRun.agentBrowser?.finalUrl ?? browser.finalUrl;
    const redirectChain = browser.redirects;
    const urls = [safeTarget, ...(finalUrl ? [finalUrl] : []), ...browser.requests.map((event) => event.url), ...(browserRun.agentBrowser?.requests.map((event) => event.url) ?? [])];
    const observations: InvestigationCase["observations"] = [
      { id: "browser-001", timestampMs: 0, category: "browser", action: "navigation", details: { url: safeTarget } },
    ];

    let observationIndex = 1;
    for (const request of browser.requests) {
      observations.push({
        id: `network-${String(observationIndex++).padStart(3, "0")}`,
        timestampMs: request.timestampMs,
        category: "network",
        action: "http_request",
        details: { method: request.method, url: request.url, resourceType: request.resourceType },
      });
    }
    for (const response of browser.responses) {
      observations.push({
        id: `network-${String(observationIndex++).padStart(3, "0")}`,
        timestampMs: response.timestampMs,
        category: "network",
        action: "http_response",
        details: { method: response.method, url: response.url, resourceType: response.resourceType, status: String(response.status) },
      });
    }
    for (const failure of browser.failedRequests) {
      observations.push({
        id: `network-${String(observationIndex++).padStart(3, "0")}`,
        timestampMs: failure.timestampMs,
        category: "network",
        action: "request_failed",
        details: { method: failure.method, url: failure.url, resourceType: failure.resourceType, failure: failure.failure },
      });
    }
    for (const event of browser.pageEvents) {
      observations.push({
        id: `browser-${String(observationIndex++).padStart(3, "0")}`,
        timestampMs: event.timestampMs,
        category: "browser",
        action: event.type,
        details: { ...(event.url ? { url: event.url } : {}), ...(event.detail ? { detail: event.detail } : {}) },
      });
    }
    observations.sort((a, b) => a.timestampMs - b.timestampMs);

    const telemetry:TelemetryCollection = browserRun.telemetry ?? {
      providers:[{name:"procfs",available:false,reason:"Sandbox procfs telemetry provider did not start."},{name:"socket-table",available:false,reason:"Sandbox socket table collection was unavailable."},{name:"ebpf-probe",available:false,reason:"eBPF capability probe could not run."}],
      startedAtMs:investigationStartedAtMs,finishedAtMs:Date.now(),snapshotA:{timestampMs:0,processes:[],network:[],filesystem:[],truncated:[]},snapshotB:{timestampMs:0,processes:[],network:[],filesystem:[],truncated:[]},
      processes:[],network:[],filesystem:[],events:[],ebpf:{available:false,reason:"eBPF capability probe could not run."},truncationMarkers:["system_telemetry_unavailable"],
    };
    const baseEvents=normalizeInvestigationEvents({startedAtMs:investigationStartedAtMs,browserStartedAtMs:browserRun.browserStartedAtMs,agent:browserRun.agent,browser,agentBrowser:browserRun.agentBrowser,telemetry});
    const resolvedAddresses = experiment ? await lookup("example.com", { all: true, verbatim: true }).then((items) => items.slice(0, 10).map((item) => item.address)).catch(() => []) : [];
    const events=experiment ? normalizeExperimentEvents({events:baseEvents,agent:browserRun.agent,caseStartedAtMs:investigationStartedAtMs,allowedDestinations:experiment.allowedDestinations,resolvedAddresses,provisioningStartedAtMs:browserRun.provisioningStartedAtMs,provisioningCompletedAtMs:browserRun.provisioningCompletedAtMs}) : baseEvents;
    const eventDifferential=buildDifferential(events);
    const differential={...eventDifferential,unexpectedActions:browserRun.differential.unexpectedActions,additionalDestinations:eventDifferential.additionalConnections,additionalBrowserRequests:eventDifferential.additionalRequests};
    if(events.some(event=>event.action==="telemetry.truncated")&&!telemetry.truncationMarkers.includes("normalized_event_limit"))telemetry.truncationMarkers.push("normalized_event_limit");
    const initialEvidenceGraph=await buildEvidenceGraph({target:safeTarget,browser,agentBrowser:browserRun.agentBrowser,agent:browserRun.agent,telemetry,startedAtMs:investigationStartedAtMs,browserStartedAtMs:browserRun.browserStartedAtMs});
    const hypothesisReport=buildHypotheses(events,initialEvidenceGraph);
    const realAgentAnchor = experiment?.id === REAL_INDIRECT_PROMPT_INJECTION.id ? (browserRun.agent.actionAnchors ?? []).find((anchor) => anchor.action === "navigate") : undefined;
    const actionEffect = realAgentAnchor ? evaluateActionToEffectHypothesis({events,anchor:{...realAgentAnchor,timestampMs:Math.max(0,browserRun.agent.startedAtMs-investigationStartedAtMs)+realAgentAnchor.timestampMs} as ActionAnchor,targetUrl:"https://example.com",resolvedAddresses}) : undefined;
    const actionEffectObserved=Boolean(actionEffect?.sourceEventIds.some(id=>events.find(event=>event.id===id)?.action==="system.socket_observed"));
    const actionEffectHypothesis = actionEffect ? [{id:`hypothesis-action-effect-${caseId.toLowerCase()}`,type:"multi_stage_attack_chain" as const,title:"Agent action to observed effect chain",confidence:actionEffect.confidence,status:actionEffect.status,evidenceClass:actionEffect.status!=="supported"?"INSUFFICIENT_EVIDENCE" as const:actionEffectObserved?"ACTION_EFFECT_SUPPORTED" as const:"DIFFERENTIAL_SUPPORTED" as const,sourceEvents:actionEffect.sourceEventIds,evidenceNodeIds:actionEffect.sourceEventIds.map((id)=>`node-${id}`),explanation:actionEffect.explanation,limitations:actionEffect.limitations}] : [];
    const allHypotheses = [...hypothesisReport.hypotheses, ...actionEffectHypothesis].slice(0,20);
    const linkedEvidence=linkHypothesesToEvidenceGraph(initialEvidenceGraph,events,allHypotheses);
    const isRealAgentExperiment = experiment?.id === REAL_INDIRECT_PROMPT_INJECTION.id;
    const providerLabel = browserRun.agent.provider === "openai" || browserRun.agent.provider === "openrouter" ? browserRun.agent.provider : "fallback";
    const modelExecution = { provider: providerLabel as "openai" | "openrouter" | "fallback", ...(browserRun.agent.model ? {model:browserRun.agent.model,configuredModel:browserRun.agent.model}:{}), ...(browserRun.agent.actualModel ? {actualModel:browserRun.agent.actualModel}:{}), ...(browserRun.agent.responseId ? {responseId:browserRun.agent.responseId}:{}), ...(browserRun.agent.modelToolCalls !== undefined ? {modelToolCalls:browserRun.agent.modelToolCalls}:{}), toolCalls:browserRun.agent.actions.length, modelRequests:browserRun.agent.modelRequests ?? 0 };
    const baselineSnapshot = telemetry.baselineSnapshot as {processes?:unknown[];network?:Array<{state?:string}>}|undefined;
    const agentSnapshot = telemetry.snapshotB as {processes?:unknown[];network?:Array<{state?:string}>}|undefined;
    const experimentResult = experiment ? buildExperimentResult(experiment, {
      caseId,
      events,
      baselineRequests: browser.requests.map((request) => request.url),
      baselineNavigations: [...new Set(browser.pageEvents.filter((event) => event.type === "navigation" && event.url).map((event) => event.url!))],
      agentActions: browserRun.agent.actions,
      agentRequests: (browserRun.agentBrowser?.requests ?? []).map((request) => request.url),
      agentNavigations: [...new Set((browserRun.agentBrowser?.pageEvents ?? []).filter((event) => event.type === "navigation" && event.url).map((event) => event.url!))],
      agentCompleted: browserRun.agent.completed,
      ...(browserRun.agent.summary ? { agentSummary: browserRun.agent.summary } : {}),
      ...(browserRun.agent.terminationReason ? { terminationReason: browserRun.agent.terminationReason } : {}),
      ...(isRealAgentExperiment ? {modelExecution,baselineProcesses:baselineSnapshot?.processes?.length??0,agentProcesses:agentSnapshot?.processes?.length??0,baselineConnections:baselineSnapshot?.network?.filter((item)=>item.state==="ESTABLISHED").length??0,agentConnections:agentSnapshot?.network?.filter((item)=>item.state==="ESTABLISHED").length??0} : {}),
      hypotheses: linkedEvidence.hypotheses,
    }) : undefined;

    return InvestigationCaseSchema.parse({
      schemaVersion: "0.1",
      caseId,
      createdAt,
      target: { submittedUrl: safeTarget, ...(finalUrl ? { finalUrl } : {}) },
      status: browserRun.launchFailed ? "failed" : "completed",
      summary: browserRun.agent.summary
        ? `Agent summary: ${browserRun.agent.summary}`
        : browserRun.launchFailed
        ? browser.browserError ?? "Chromium failed to launch."
        : browser.browserError
          ? `Browser observation completed with a navigation or capture issue: ${browser.browserError}`
          : "Chromium browser observation completed inside an isolated Vercel Sandbox.",
      redirectChain,
      indicators: collectIndicators(urls),
      browser,
      ...(browserRun.agentBrowser ? { agentBrowser: browserRun.agentBrowser } : {}),
      experiment: { mode: "agent", task: experiment?.task ?? "Visit the provided website and summarize what the page is about.", ...(experiment ? { id: experiment.id, name: experiment.name, version: experiment.version, fixtureUrl: experiment.fixtureUrl, expectedBehavior: experiment.expectedBehavior, allowedDestinations: experiment.allowedDestinations, maxActions: experiment.maxActions, maxRuntimeMs: experiment.maxRuntimeMs } : {}) },
      ...(isRealAgentExperiment ? {agentProvider:providerLabel, ...(browserRun.agent.model?{agentModel:browserRun.agent.model}:{}),experimentVersion:experiment.version,syntheticFixture:true,realModelExecution:providerLabel!=="fallback"&&browserRun.agent.actions.length>0,modelExecution,agentActions:browserRun.agent.actions,attribution:{actionAnchors:(browserRun.agent.actionAnchors??[]).map((anchor)=>({...anchor,timestampMs:Math.max(0,browserRun.agent.startedAtMs-investigationStartedAtMs)+anchor.timestampMs})),attributionWindowMs:POST_ACTION_WINDOW_MS,methodologyVersion:ATTRIBUTION_METHODOLOGY_VERSION,provisioningExcluded:true}} : {}),
      ...(browserRun.agent.providerError ? {providerError:browserRun.agent.providerError} : {}),
      ...(experimentResult ? { experimentResult, outcomes: experimentResult.outcomes } : {}),
      agent: { task: experiment?.task ?? "Visit the provided website and summarize what the page is about.", provider: isRealAgentExperiment?providerLabel:browserRun.agent.provider, ...(browserRun.agent.model ? { model: browserRun.agent.model } : {}), actions: browserRun.agent.actions, actionCount: browserRun.agent.actions.length, completed: browserRun.agent.completed, ...(browserRun.agent.terminationReason ? { terminationReason: browserRun.agent.terminationReason } : {}), ...(browserRun.agent.summary ? { summary: browserRun.agent.summary } : {}) },
      baselineEvents: browserRun.baselineEvents,
      agentEvents: browserRun.agentEvents,
      differential,
      hypotheses: linkedEvidence.hypotheses,
      hypothesisMetadata: { generatedAt: hypothesisReport.generatedAt, engineVersion: hypothesisReport.engineVersion, categories:{OBSERVATION_SUPPORTED:allHypotheses.some(item=>item.evidenceClass==="OBSERVATION_SUPPORTED"),DIFFERENTIAL_SUPPORTED:allHypotheses.some(item=>item.evidenceClass==="DIFFERENTIAL_SUPPORTED"),ACTION_EFFECT_SUPPORTED:allHypotheses.some(item=>item.evidenceClass==="ACTION_EFFECT_SUPPORTED"),INSUFFICIENT_EVIDENCE:!actionEffectObserved} },
      telemetry,
      telemetryMode:telemetry.mode??"snapshot",
      events,
      evidenceGraph: linkedEvidence.evidenceGraph,
      observations,
      provenance: { engineVersion: `0.2.0-playwright-${PLAYWRIGHT_VERSION}`, sandbox: "Vercel Firecracker Sandbox" },
      raw: { stdout: browserRun.stdout, stderr: browserRun.stderr },
    });
  } finally {
    await sandbox.stop().catch(() => undefined);
  }
}
