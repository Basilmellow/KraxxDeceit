import test from "node:test";
import assert from "node:assert/strict";
import { isPublicTelemetryAddress, TelemetrySession } from "../lib/telemetry/session";
import type { NetworkObservation, ProcessObservation, TelemetrySnapshot } from "../lib/telemetry/provider";

const pause = (ms = 120) => new Promise((resolve) => setTimeout(resolve, ms));
const processRow = (pid = 81): ProcessObservation => ({ pid, ppid: 12, executable: "/usr/bin/sleep", command: "sleep 2", startTimeMs: 1_000, state: "S" });
const socketRow = (pid?: number): NetworkObservation => ({ protocol: "tcp", localAddress: "10.0.0.2", localPort: 41000, destinationIp: "93.184.216.34", destinationPort: 443, state: "ESTABLISHED", ...(pid === undefined ? {} : { pid }), timestampMs: Date.now() });
const snap = (processes: ProcessObservation[] = [], network: NetworkObservation[] = []): TelemetrySnapshot => ({ timestampMs: Date.now(), processes, network, filesystem: [], truncated: [] });

test("excludes private IPv4-mapped IPv6 gateway addresses from outbound socket telemetry", () => {
  assert.equal(isPublicTelemetryAddress("0:0:ffff:a9fe0001"), false);
  assert.equal(isPublicTelemetryAddress("::ffff:169.254.0.1"), false);
  assert.equal(isPublicTelemetryAddress("::ffff:7f00:1"), false);
  assert.equal(isPublicTelemetryAddress("93.184.216.34"), true);
});

test("captures a short-lived process and marks its observed lifetime", async () => {
  let state = snap([processRow()]);
  const session = new TelemetrySession({ snapshot: async () => state, pollIntervalMs: 100 });
  await session.start(); await pause(); state = snap(); await pause(); await session.stop();
  const result = await session.collect();
  assert.equal(result.processes.length, 1);
  assert.equal(result.processes[0].status, "exited");
  assert.ok(result.processes[0].lastSeen >= result.processes[0].firstSeen);
});

test("captures a short-lived established socket between snapshots", async () => {
  let state = snap();
  const session = new TelemetrySession({ snapshot: async () => state, pollIntervalMs: 100 });
  await session.start(); state = snap([], [socketRow()]); await pause(); state = snap(); await pause(); await session.stop();
  assert.equal((await session.collect()).sockets.length, 1);
});

test("attributes an observed post-action socket to a matching browser request", async () => {
  let state = snap(); const at = Date.now();
  const browserEvents: unknown[] = [
    { id: "browser-001", observedAtMs: at, source: "network", action: "network.request", details: { url: "https://example.com/", hostname: "example.com" }, phase: "baseline", trafficScope: "investigation" },
    { id: "browser-002", observedAtMs: at + 1, source: "network", action: "browser.dns_resolution", details: { hostname: "example.com", address: "93.184.216.34" }, phase: "baseline", trafficScope: "investigation" },
  ];
  const session = new TelemetrySession({ snapshot: async () => state, readBrowserEvents: async () => browserEvents, allowedHosts: ["example.com"], pollIntervalMs: 100 });
  await session.start();
  session.recordActionAnchor({ id: "agent-action-001", timestampMs: 0, action: "navigate" }, Date.now());
  state = snap([], [socketRow()]); await pause(150); await session.stop();
  const result = await session.collect();
  const socketEvent = result.events.find((event) => event.action === "system.socket_observed");
  assert.equal(socketEvent?.phase, "post_action");
  assert.equal(socketEvent?.trafficScope, "investigation", JSON.stringify({ events:result.events, relationships:result.relationships }));
  assert.ok(result.relationships.some((edge) => edge.type === "same_destination"));
  assert.ok(result.relationships.some((edge) => edge.type === "post_action_observation"));
});

test("marks a socket observed before the action as pre-existing context", async () => {
  const session = new TelemetrySession({ snapshot: async () => snap([], [socketRow()]), pollIntervalMs: 100 });
  await session.start();
  await pause(5);
  session.recordActionAnchor({ id: "agent-action-001", timestampMs: 0, action: "navigate" }, Date.now());
  await session.stop(); const result = await session.collect();
  assert.equal(result.events.find((event) => event.action === "system.socket_observed")?.phase, "baseline");
  assert.ok(result.relationships.some((edge) => edge.type === "pre_existing"));
});

test("merges repeated observations of the same socket and keeps first and last seen", async () => {
  const session = new TelemetrySession({ snapshot: async () => snap([], [socketRow()]), pollIntervalMs: 100 });
  await session.start(); await pause(); await session.stop(); const result = await session.collect();
  assert.equal(result.sockets.length, 1);
  assert.ok(result.sockets[0].lastSeen > result.sockets[0].firstSeen);
});

test("correlates a socket PID with a process observation", async () => {
  const session = new TelemetrySession({ snapshot: async () => snap([processRow(81)], [socketRow(81)]), pollIntervalMs: 100 });
  await session.start(); await session.stop(); const result = await session.collect();
  assert.match(result.sockets[0].process_identity, /sleep/);
  assert.ok(result.relationships.some((edge) => edge.type === "associated_process"));
});

test("records unknown process identity when a socket PID was not observed", async () => {
  const session = new TelemetrySession({ snapshot: async () => snap([], [socketRow(999)]), pollIntervalMs: 100 });
  await session.start(); await session.stop(); const result = await session.collect();
  assert.equal(result.sockets[0].process_identity, "unknown");
});

test("does not include provisioning activity in the telemetry session", async () => {
  const session = new TelemetrySession({ snapshot: async () => snap([processRow()]), pollIntervalMs: 100 });
  await session.start(); await session.stop(); const result = await session.collect();
  assert.ok(result.events.every((event) => event.phase !== "provisioning"));
});

test("keeps non-allowlisted browser traffic ambient", async () => {
  const browserEvents = [{ id: "browser-001", observedAtMs: Date.now(), source: "network", action: "network.request", details: { url: "https://other.example.net/", hostname: "other.example.net" } }];
  const session = new TelemetrySession({ readBrowserEvents: async () => browserEvents, allowedHosts: ["example.com"], pollIntervalMs: 100 });
  await session.start(); await session.stop(); const result = await session.collect();
  assert.equal(result.events.find((event) => event.id === "browser-001")?.trafficScope, "ambient");
});

test("caps events and emits a truncation marker", async () => {
  const session = new TelemetrySession();
  for (let index = 0; index < 2_005; index++) session.record({ source: "system", action: "custom.observation", details: {}, observedAtMs: Date.now() + index });
  await session.stop(); const result = await session.collect();
  assert.ok(result.events.length <= 2_000);
  assert.equal(result.truncated, true);
  assert.ok(result.events.some((event) => event.action === "telemetry.truncated"));
});

test("collects stream events in timestamp order", async () => {
  const session = new TelemetrySession(); const now = Date.now();
  session.record({ source: "browser", action: "later", details: {}, observedAtMs: now + 20 });
  session.record({ source: "browser", action: "earlier", details: {}, observedAtMs: now + 10 });
  await session.stop(); const result = await session.collect();
  assert.deepEqual(result.events.map((event) => event.action), ["earlier", "later"]);
});

test("separates baseline and post-action events using the action anchor", async () => {
  const session = new TelemetrySession(); const started = session.startedAtMs;
  session.record({ source: "system", action: "system.socket_observed", details: {}, observedAtMs: started + 1 });
  session.recordActionAnchor({ id: "agent-action-001", timestampMs: 10, action: "navigate" }, started);
  session.record({ source: "system", action: "system.socket_observed", details: {}, observedAtMs: started + 20 });
  await session.stop(); const result = await session.collect();
  assert.deepEqual(result.events.filter((event) => event.action === "system.socket_observed").map((event) => event.phase), ["baseline", "post_action"]);
  assert.equal(result.events.find((event) => event.id === "agent-action-001")?.phase, "agent_action");
});
