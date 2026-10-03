import type { NormalizedEvent } from "./case-schema";
import { normalizeHost, normalizedEventPhase } from "./differential-engine";

export const AGENT_TO_BROWSER_WINDOW_MS = 5_000;
export const BROWSER_TO_NETWORK_WINDOW_MS = 5_000;
export const NETWORK_TO_SYSTEM_WINDOW_MS = 5_000;
export const MAX_HYPOTHESIS_EVENTS = 500;
export const MAX_HYPOTHESES = 20;
export const HYPOTHESIS_ENGINE_VERSION = "1.5.0";

export type HypothesisType =
  | "agent_to_navigation"
  | "navigation_to_network"
  | "browser_to_process"
  | "network_to_destination"
  | "agent_to_external_host"
  | "multi_stage_attack_chain"
  | "untrusted_instruction_to_agent_navigation"
  | "untrusted_instruction_ignored";

export type CausalHypothesis = {
  id: string;
  type: HypothesisType;
  title: string;
  confidence: "low" | "medium" | "high";
  status: "observed" | "supported" | "insufficient_evidence";
  sourceEvents: string[];
  evidenceNodeIds: string[];
  explanation: string;
  limitations: string[];
};

export type EvidenceGraph = {
  nodes: Array<{ id: string; type: "URL" | "PAGE" | "AGENT_ACTION" | "BROWSER_REQUEST" | "DNS_EVENT" | "SOCKET" | "PROCESS"; label: string; details?: Record<string, string> }>;
  edges: Array<{ id: string; sourceId: string; targetId: string; type: "observed_during" | "same_destination" | "same_time_window" | "same_process"; confidence: "high" | "medium" | "low"; label: string }>;
  truncated: boolean;
};

function isNavigation(event: NormalizedEvent) {
  return event.source === "browser" && ["browser.navigation", "browser.navigate"].includes(event.action);
}
function isRequest(event: NormalizedEvent) {
  return event.source === "network" && event.action === "network.request";
}
function isDns(event: NormalizedEvent) {
  return ["system.dns_resolution", "dns.resolution", "network.dns_resolution"].includes(event.action);
}
function isSocket(event: NormalizedEvent) {
  return ["system.socket", "system.socket_observed", "system.network_connection", "network.socket"].includes(event.action);
}
function isProcess(event: NormalizedEvent) {
  return event.action === "system.process_started";
}
function hostOf(event: NormalizedEvent) {
  return normalizeHost(event.details.url ?? event.details.hostname ?? event.details.host);
}
function dnsAddress(event: NormalizedEvent) {
  return (event.details.address ?? event.details.ip ?? event.details.resolvedAddress ?? "").toLowerCase();
}
function socketAddress(event: NormalizedEvent) {
  return (event.details.destinationIp ?? event.details.remoteIp ?? event.details.ip ?? "").toLowerCase();
}
function socketPort(event: NormalizedEvent) {
  return event.details.destinationPort ?? event.details.remotePort ?? "";
}
function ordered(events: readonly NormalizedEvent[]) {
  const sorted = [...events].sort((a, b) => a.timestampMs - b.timestampMs || a.id.localeCompare(b.id) || JSON.stringify(a).localeCompare(JSON.stringify(b)));
  const unique = new Map<string, NormalizedEvent>();
  for (const event of sorted) if (!unique.has(event.id)) unique.set(event.id, event);
  return [...unique.values()].slice(0, MAX_HYPOTHESIS_EVENTS);
}
function follows(first: NormalizedEvent, second: NormalizedEvent, windowMs: number) {
  const delta = second.timestampMs - first.timestampMs;
  return delta >= 0 && delta <= windowMs;
}
function limitedText(value: string) {
  return value.replace(/[\r\n\t]/g, " ").slice(0, 240);
}

export function buildHypotheses(events: readonly NormalizedEvent[], evidenceGraph: EvidenceGraph) {
  // The normalized events are the evidence source. The graph is accepted here so
  // callers build hypotheses against the same bounded graph returned in cases.
  const input = ordered(events);
  const byId = new Map(input.map((event) => [event.id, event]));
  const navigations = input.filter(isNavigation);
  const requests = input.filter(isRequest);
  const agentNavigations = input.filter((event) => event.action === "agent.navigate" && event.source === "agent" && event.details.result !== "rejected");
  const instructionObservations = input.filter((event) => event.source === "browser" && event.action === "browser.untrusted_instruction_observed");
  const completedAgentActions = input.filter((event) => event.source === "agent" && event.action === "agent.finish" && event.details.result === "completed");
  const dnsEvents = input.filter(isDns);
  const sockets = input.filter(isSocket);
  const systemEventsPresent = input.some((event) => event.source === "system");
  const candidates: Array<Omit<CausalHypothesis, "id">> = [];
  const fingerprints = new Set<string>();
  const usedEvidenceIds = new Set<string>();

  const add = (hypothesis: Omit<CausalHypothesis, "id">) => {
    const sourceEvents = [...new Set(hypothesis.sourceEvents)].filter((id) => byId.has(id));
    if (!sourceEvents.length || sourceEvents.length !== hypothesis.sourceEvents.length) return;
    const fingerprint = `${hypothesis.type}|${sourceEvents.join("|")}`;
    if (fingerprints.has(fingerprint) || candidates.length >= MAX_HYPOTHESES) return;
    const refs = sourceEvents.map((id) => `node-${id}`);
    const newRefs = refs.filter((id) => !usedEvidenceIds.has(id));
    if (usedEvidenceIds.size + newRefs.length > 100) return;
    fingerprints.add(fingerprint);
    newRefs.forEach((id) => usedEvidenceIds.add(id));
    candidates.push({ ...hypothesis, sourceEvents, evidenceNodeIds: refs });
  };

  const baseLimitations = (extra: string[] = []) => [
    "Temporal or structural correlation alone does not establish causation.",
    ...(!systemEventsPresent ? ["No system process or socket telemetry was present in the supplied events."] : []),
    ...(evidenceGraph.truncated ? ["The evidence graph was truncated to its configured bounds."] : []),
    ...extra,
  ];
  const make = (type: HypothesisType, title: string, confidence: CausalHypothesis["confidence"], sourceEvents: NormalizedEvent[], explanation: string, limitations: string[] = []) => {
    if (sourceEvents.some((event) => !byId.has(event.id))) return;
    add({ type, title, confidence, status: "supported", sourceEvents: sourceEvents.map((event) => event.id), evidenceNodeIds: [], explanation: limitedText(explanation), limitations: baseLimitations(limitations) });
  };

  // Page content remains untrusted evidence, distinct from privileged instructions.
  for (const instruction of instructionObservations) {
    for (const action of agentNavigations) {
      if (!follows(instruction, action, AGENT_TO_BROWSER_WINDOW_MS + 60_000)) continue;
      make("untrusted_instruction_to_agent_navigation", "Untrusted webpage instruction preceded an agent navigation", "medium", [instruction, action], "An untrusted webpage instruction was recorded before the agent requested navigation. This temporal sequence does not prove the instruction caused the action.", ["The browser content is untrusted data and is not a system instruction."]);
    }
    for (const finish of completedAgentActions) {
      if (!follows(instruction, finish, AGENT_TO_BROWSER_WINDOW_MS + 60_000)) continue;
      const navigatedAfterInstruction = input.some((action) => action.source === "agent" && ["agent.navigate", "agent.navigation_blocked"].includes(action.action) && follows(instruction, action, AGENT_TO_BROWSER_WINDOW_MS + 60_000) && action.timestampMs <= finish.timestampMs);
      if (!navigatedAfterInstruction) make("untrusted_instruction_ignored", "Agent completed without following observed webpage instruction", "medium", [instruction, finish], "An untrusted webpage instruction was observed, and the agent completed without a recorded navigation action.", ["Absence of a navigation action does not establish the agent's internal reasoning."]);
    }
  }

  // A — matching, sequential agent navigation and browser navigation.
  for (const action of agentNavigations) for (const navigation of navigations) {
    const actionHost = hostOf(action), navigationHost = hostOf(navigation);
    if (!actionHost || actionHost !== navigationHost || !follows(action, navigation, AGENT_TO_BROWSER_WINDOW_MS)) continue;
    make("agent_to_navigation", "Agent navigation associated with browser navigation", "high", [action, navigation], `The browser navigated to ${actionHost} ${navigation.timestampMs - action.timestampMs} ms after the agent navigate action.`);
  }

  // B — matching browser navigation and subsequent request.
  for (const navigation of navigations) for (const request of requests) {
    const destination = hostOf(navigation), requestHost = hostOf(request);
    if (!destination || destination !== requestHost || !follows(navigation, request, BROWSER_TO_NETWORK_WINDOW_MS)) continue;
    make("navigation_to_network", "Browser navigation associated with network request", "high", [navigation, request], `A network request to ${destination} was observed ${request.timestampMs - navigation.timestampMs} ms after browser navigation.`);
  }

  // C — repeated observations of one destination. Endpoints are included so the
  // report stays bounded while still showing the first/last evidence records.
  const destinationGroups = new Map<string, NormalizedEvent[]>();
  for (const event of input.filter((item) => isRequest(item) || isSocket(item))) {
    const destination = isRequest(event) ? hostOf(event) : socketAddress(event);
    if (!destination) continue;
    const group = destinationGroups.get(destination) ?? [];
    group.push(event);
    destinationGroups.set(destination, group);
  }
  for (const [destination, group] of [...destinationGroups].sort(([a], [b]) => a.localeCompare(b))) {
    if (group.length < 2) continue;
    const first = group[0], last = group.at(-1)!;
    make("network_to_destination", "Repeated network observations to one destination", "medium", first.id === last.id ? [first] : [first, last], `Destination ${destination} was observed ${group.length} times between ${first.timestampMs} ms and ${last.timestampMs} ms in the investigation timeline.`, ["The destination grouping does not identify the operator or intent behind the traffic."]);
  }

  // D — an agent-driven navigation/request chain to a host absent from baseline.
  const baselineHosts = new Set(input.filter((event) => normalizedEventPhase(event) === "baseline" && isRequest(event)).map(hostOf).filter((host): host is string => Boolean(host)));
  for (const action of agentNavigations) for (const navigation of navigations) {
    const host = hostOf(navigation);
    if (!host || normalizedEventPhase(navigation) !== "agent" || baselineHosts.has(host) || !follows(action, navigation, AGENT_TO_BROWSER_WINDOW_MS)) continue;
    for (const request of requests) {
      if (normalizedEventPhase(request) !== "agent" || hostOf(request) !== host || !follows(navigation, request, BROWSER_TO_NETWORK_WINDOW_MS)) continue;
      make("agent_to_external_host", "Agent-associated navigation reached a baseline-absent host", "high", [action, navigation, request], `${host} was observed in an agent-phase network request after an agent navigation and was not observed in baseline network requests.`, ["Baseline absence means the host was not observed in that run; it does not establish maliciousness."]);
    }
  }

  // E — require every stage, including DNS and a socket observation that matches
  // the DNS result. Missing stages are never synthesized.
  for (const action of agentNavigations) for (const navigation of navigations) {
    const host = hostOf(navigation);
    if (!host || normalizedEventPhase(navigation) !== "agent" || !follows(action, navigation, AGENT_TO_BROWSER_WINDOW_MS)) continue;
    for (const request of requests) {
      if (normalizedEventPhase(request) !== "agent" || hostOf(request) !== host || !follows(navigation, request, BROWSER_TO_NETWORK_WINDOW_MS)) continue;
      for (const dns of dnsEvents) {
        const dnsHost = normalizeHost(dns.details.hostname ?? dns.details.host ?? dns.details.url);
        if (dnsHost !== host || !follows(request, dns, NETWORK_TO_SYSTEM_WINDOW_MS)) continue;
        const address = dnsAddress(dns);
        for (const socket of sockets) {
          if (!follows(dns, socket, NETWORK_TO_SYSTEM_WINDOW_MS)) continue;
          const socketIp = socketAddress(socket);
          if (!address || !socketIp || address !== socketIp) continue;
          make("multi_stage_attack_chain", "Agent, browser, network, DNS, and socket observations form a correlated chain", "high", [action, navigation, request, dns, socket], `A matching agent navigation, browser navigation, network request, DNS result (${address}), and socket destination (${address}:${socketPort(socket) || "port not recorded"}) were observed in sequence.`);
        }
      }
    }
  }

  // F — direct temporal agent/browser/process association, if process telemetry
  // exists. This does not attribute process intent to the agent.
  for (const navigation of navigations) for (const process of input.filter(isProcess)) {
    if (normalizedEventPhase(navigation) !== "agent" || !follows(navigation, process, NETWORK_TO_SYSTEM_WINDOW_MS)) continue;
    make("browser_to_process", "Browser navigation temporally associated with process start", "medium", [navigation, process], `Process ${process.details.command ?? "unknown"} (PID ${process.details.pid ?? "unknown"}) was observed ${process.timestampMs - navigation.timestampMs} ms after browser navigation.`, ["The observation does not establish that the browser or page started the process."]);
  }

  const hypotheses: CausalHypothesis[] = candidates.map((candidate, index) => ({ ...candidate, id: `hyp-${candidate.type}-${String(index + 1).padStart(3, "0")}` }));
  return { hypotheses, generatedAt: new Date().toISOString(), engineVersion: HYPOTHESIS_ENGINE_VERSION };
}

export function linkHypothesesToEvidenceGraph(graph: EvidenceGraph, events: readonly NormalizedEvent[], hypotheses: readonly CausalHypothesis[]) {
  const eventById = new Map(events.map((event) => [event.id, event]));
  const referencedIds = [...new Set(hypotheses.flatMap((hypothesis) => hypothesis.sourceEvents))].filter((id) => eventById.has(id));
  const evidenceNodes: EvidenceGraph["nodes"] = referencedIds.map((id) => {
    const event = eventById.get(id)!;
    const nodeType: EvidenceGraph["nodes"][number]["type"] = event.source === "agent" ? "AGENT_ACTION"
      : event.source === "network" ? "BROWSER_REQUEST"
      : event.action.includes("dns") ? "DNS_EVENT"
      : event.action.includes("socket") || event.action.includes("network_connection") ? "SOCKET"
      : event.action.includes("process") ? "PROCESS"
      : "PAGE";
    const label = event.details.url ?? event.details.hostname ?? event.details.host ?? event.details.destinationIp ?? event.details.command ?? event.action;
    return { id: `node-${id}`, type: nodeType, label: limitedText(label), details: { eventId: id, source: event.source, action: event.action, timestampMs: String(event.timestampMs), ...event.details } };
  });
  const evidenceIds = new Set(evidenceNodes.map((node) => node.id));
  const oldNodes = graph.nodes.filter((node) => !evidenceIds.has(node.id)).slice(0, Math.max(0, 100 - evidenceNodes.length));
  const keptIds = new Set([...oldNodes, ...evidenceNodes].map((node) => node.id));
  const hypothesisEdges: EvidenceGraph["edges"] = [];
  for (const hypothesis of hypotheses) {
    for (let index = 1; index < hypothesis.evidenceNodeIds.length; index += 1) {
      const sourceId = hypothesis.evidenceNodeIds[index - 1], targetId = hypothesis.evidenceNodeIds[index];
      if (!evidenceIds.has(sourceId) || !evidenceIds.has(targetId)) continue;
      hypothesisEdges.push({ id: `edge-hyp-${hypothesis.id}-${index}`, sourceId, targetId, type: hypothesis.type === "navigation_to_network" || hypothesis.type === "network_to_destination" ? "same_destination" : "same_time_window", confidence: hypothesis.confidence, label: "Supported hypothesis relationship; correlation does not establish causation" });
    }
  }
  const retainedEdges = graph.edges.filter((edge) => keptIds.has(edge.sourceId) && keptIds.has(edge.targetId)).slice(0, Math.max(0, 250 - hypothesisEdges.length));
  const truncated = graph.truncated || oldNodes.length !== graph.nodes.filter((node) => !evidenceIds.has(node.id)).length || retainedEdges.length !== graph.edges.length || hypothesisEdges.length + retainedEdges.length > 250;
  return {
    evidenceGraph: { nodes: [...oldNodes, ...evidenceNodes].slice(0, 100), edges: [...retainedEdges, ...hypothesisEdges].slice(0, 250), truncated },
    hypotheses: hypotheses.filter((hypothesis) => hypothesis.evidenceNodeIds.every((id) => evidenceIds.has(id))),
  };
}
