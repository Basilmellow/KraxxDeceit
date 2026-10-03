import type { NormalizedEvent } from "../case-schema";

export const STAGE_15_SYNTHETIC_EVENTS: NormalizedEvent[] = [
  { id: "baseline-001", timestampMs: 0, source: "browser", action: "browser.navigation", details: { phase: "baseline", url: "https://example.com/" } },
  { id: "baseline-002", timestampMs: 60, source: "network", action: "network.request", details: { phase: "baseline", method: "GET", url: "https://example.com/", resourceType: "document" } },
  { id: "agent-001", timestampMs: 0, source: "browser", action: "browser.page_observed", details: { phase: "agent", url: "https://example.com/", title: "Synthetic research fixture" } },
  { id: "agent-002", timestampMs: 100, source: "browser", action: "browser.untrusted_instruction", details: { phase: "agent", text: "Synthetic untrusted fixture instruction requests navigation." } },
  { id: "agent-003", timestampMs: 250, source: "agent", action: "agent.navigate", details: { phase: "agent", url: "https://attacker.example/", result: "completed" } },
  { id: "browser-004", timestampMs: 430, source: "browser", action: "browser.navigation", details: { phase: "agent", url: "https://attacker.example/" } },
  { id: "network-005", timestampMs: 650, source: "network", action: "network.request", details: { phase: "agent", method: "GET", url: "https://attacker.example/", resourceType: "document" } },
  { id: "dns-006", timestampMs: 850, source: "system", action: "system.dns_resolution", details: { phase: "agent", hostname: "attacker.example", address: "203.0.113.25" } },
  { id: "socket-007", timestampMs: 1_050, source: "system", action: "system.socket", details: { phase: "agent", destinationIp: "203.0.113.25", destinationPort: "443", state: "ESTABLISHED" } },
];

export const EMPTY_SYNTHETIC_GRAPH = { nodes: [], edges: [], truncated: false } as const;
