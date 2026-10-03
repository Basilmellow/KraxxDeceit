import assert from "node:assert/strict";
import test from "node:test";
import { InvestigationCaseSchema, type NormalizedEvent } from "../lib/case-schema";
import { buildDifferential, normalizeHost } from "../lib/differential-engine";
import { EMPTY_SYNTHETIC_GRAPH, STAGE_15_SYNTHETIC_EVENTS } from "../lib/fixtures/stage15-synthetic";
import { buildHypotheses, linkHypothesesToEvidenceGraph, MAX_HYPOTHESIS_EVENTS, MAX_HYPOTHESES } from "../lib/hypothesis-engine";

const event = (id: string, timestampMs: number, source: NormalizedEvent["source"], action: string, details: Record<string, string> = {}): NormalizedEvent => ({ id, timestampMs, source, action, details });
const graph = () => ({ nodes: [], edges: [], truncated: false });
const hypothesisFor = (events: NormalizedEvent[], type: string) => buildHypotheses(events, graph()).hypotheses.find((hypothesis) => hypothesis.type === type);

test("agent navigation is correlated with a matching browser navigation", () => {
  const events = [event("agent-1", 100, "agent", "agent.navigate", { url: "https://attacker.example/" }), event("browser-1", 200, "browser", "browser.navigation", { phase: "agent", url: "https://ATTACKER.example/path" })];
  const hypothesis = hypothesisFor(events, "agent_to_navigation");
  assert.equal(hypothesis?.confidence, "high");
  assert.deepEqual(hypothesis?.sourceEvents, ["agent-1", "browser-1"]);
});

test("browser navigation is correlated with a matching network request", () => {
  const events = [event("browser-1", 100, "browser", "browser.navigation", { url: "https://attacker.example/" }), event("network-1", 200, "network", "network.request", { url: "https://attacker.example/resource" })];
  assert.ok(hypothesisFor(events, "navigation_to_network"));
});

test("an agent-only host generates an external-host hypothesis", () => {
  const report = buildHypotheses(STAGE_15_SYNTHETIC_EVENTS, graph());
  const hypothesis = report.hypotheses.find((item) => item.type === "agent_to_external_host");
  assert.ok(hypothesis);
  assert.match(hypothesis.explanation, /attacker\.example/);
  assert.ok(hypothesis.limitations.some((item) => item.includes("does not establish maliciousness")));
});

test("all five observed stages create a referenced multi-stage chain", () => {
  const generated = buildHypotheses(STAGE_15_SYNTHETIC_EVENTS, graph());
  const linked = linkHypothesesToEvidenceGraph(graph(), STAGE_15_SYNTHETIC_EVENTS, generated.hypotheses);
  const chain = linked.hypotheses.find((item) => item.type === "multi_stage_attack_chain");
  assert.ok(chain);
  assert.deepEqual(chain.sourceEvents, ["agent-003", "browser-004", "network-005", "dns-006", "socket-007"]);
  assert.equal(chain.status, "supported");
  assert.ok(chain.evidenceNodeIds.every((id) => linked.evidenceGraph.nodes.some((node) => node.id === id)));
});

test("baseline differential reports attacker.example as additional", () => {
  const differential = buildDifferential(STAGE_15_SYNTHETIC_EVENTS);
  assert.deepEqual(differential.additionalHosts, ["attacker.example"]);
  assert.equal(differential.additionalRequests.length, 1);
});

test("events outside the configured correlation window do not correlate", () => {
  const events = [event("agent-1", 0, "agent", "agent.navigate", { url: "https://attacker.example/" }), event("browser-1", 5_001, "browser", "browser.navigation", { phase: "agent", url: "https://attacker.example/" }), event("network-1", 10_002, "network", "network.request", { phase: "agent", url: "https://attacker.example/" })];
  const report = buildHypotheses(events, graph());
  assert.equal(report.hypotheses.some((item) => item.type === "agent_to_navigation" || item.type === "navigation_to_network" || item.type === "agent_to_external_host"), false);
});

test("missing required observations produce no unsupported hypothesis", () => {
  const report = buildHypotheses([event("agent-1", 1, "agent", "agent.navigate", { url: "https://attacker.example/" })], graph());
  assert.deepEqual(report.hypotheses, []);
});

test("duplicate event IDs do not duplicate hypotheses or supporting references", () => {
  const action = event("agent-1", 100, "agent", "agent.navigate", { url: "https://attacker.example/" });
  const navigation = event("browser-1", 200, "browser", "browser.navigation", { phase: "agent", url: "https://attacker.example/" });
  const report = buildHypotheses([action, action, navigation, navigation], graph());
  assert.equal(report.hypotheses.filter((item) => item.type === "agent_to_navigation").length, 1);
  assert.equal(new Set(report.hypotheses[0].sourceEvents).size, report.hypotheses[0].sourceEvents.length);
});

test("hostname normalization ignores URL path, casing, and trailing dot", () => {
  assert.equal(normalizeHost("https://example.com/"), "example.com");
  assert.equal(normalizeHost("https://example.com/path?q=1"), "example.com");
  assert.equal(normalizeHost("https://EXAMPLE.COM."), "example.com");
  assert.equal(normalizeHost("not a url"), null);
});

test("repeated requests produce one bounded destination hypothesis", () => {
  const events = [event("network-1", 100, "network", "network.request", { url: "https://repeat.example/a" }), event("network-2", 200, "network", "network.request", { url: "https://repeat.example/b" }), event("network-3", 300, "network", "network.request", { url: "https://repeat.example/c" })];
  const hypothesis = hypothesisFor(events, "network_to_destination");
  assert.ok(hypothesis);
  assert.equal(hypothesis.sourceEvents.length, 2);
  assert.match(hypothesis.explanation, /observed 3 times/);
});

test("hypothesis processing and returned evidence remain bounded", () => {
  const events: NormalizedEvent[] = [];
  for (let index = 0; index < 300; index += 1) {
    events.push(event(`agent-${index}`, index * 2, "agent", "agent.navigate", { url: `https://host-${index}.example/` }));
    events.push(event(`browser-${index}`, index * 2 + 1, "browser", "browser.navigation", { phase: "agent", url: `https://host-${index}.example/` }));
  }
  const limitedInput = [...events].sort((a, b) => a.timestampMs - b.timestampMs || a.id.localeCompare(b.id)).slice(0, MAX_HYPOTHESIS_EVENTS);
  const report = buildHypotheses(events, graph());
  assert.ok(report.hypotheses.length <= MAX_HYPOTHESES);
  assert.ok(report.hypotheses.every((hypothesis) => hypothesis.sourceEvents.every((id) => limitedInput.some((item) => item.id === id))));
});

test("case schema exports schema version, differential, graph, events, and hypotheses", () => {
  const generated = buildHypotheses(STAGE_15_SYNTHETIC_EVENTS, graph());
  const linked = linkHypothesesToEvidenceGraph(graph(), STAGE_15_SYNTHETIC_EVENTS, generated.hypotheses);
  const browser = { browser: "chromium", screenshotAvailable: false, domCaptured: false, domTruncated: false, domMutations: 0, redirects: [], console: [], pageErrors: [], requests: [], responses: [], failedRequests: [], iframes: [], downloads: [], pageEvents: [] };
  const parsed = InvestigationCaseSchema.parse({ caseId: "CASE-SYNTHETIC", createdAt: new Date().toISOString(), target: { submittedUrl: "https://example.com/" }, status: "completed", summary: "Synthetic fixture case", redirectChain: [], indicators: [], browser, observations: [], provenance: { engineVersion: "test", sandbox: "synthetic" }, raw: { stdout: "", stderr: "" }, events: STAGE_15_SYNTHETIC_EVENTS, differential: { ...buildDifferential(STAGE_15_SYNTHETIC_EVENTS), unexpectedActions: [] }, evidenceGraph: linked.evidenceGraph, hypotheses: linked.hypotheses, hypothesisMetadata: { generatedAt: generated.generatedAt, engineVersion: generated.engineVersion } });
  assert.equal(parsed.schemaVersion, "0.1");
  assert.ok(parsed.hypotheses.some((item) => item.type === "multi_stage_attack_chain"));
  assert.doesNotThrow(() => JSON.stringify(parsed));
});
