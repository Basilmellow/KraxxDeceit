import type { NormalizedEvent } from "./case-schema";

export type InvestigationDifferential = {
  additionalHosts: string[];
  additionalRequests: string[];
  additionalProcesses: string[];
  additionalConnections: string[];
  additionalNavigations: string[];
};

export function normalizeHost(value: string | undefined): string | null {
  if (!value) return null;
  try {
    const parsed = new URL(value.includes("://") ? value : `https://${value}`);
    return parsed.hostname.replace(/^\[|\]$/g, "").toLowerCase().replace(/\.$/, "") || null;
  } catch {
    return null;
  }
}

export function normalizedEventPhase(event: NormalizedEvent): "baseline" | "agent" | null {
  const value = event.details.phase;
  if (value === "baseline" || value === "agent") return value;
  if (event.source === "agent") return "agent";
  if (/^baseline-/.test(event.id)) return "baseline";
  if (/^agent-/.test(event.id)) return "agent";
  return null;
}

function canonicalUrl(value: string | undefined) {
  if (!value) return null;
  try {
    const url = new URL(value);
    url.hash = "";
    return url.toString();
  } catch {
    return null;
  }
}

function requestKey(event: NormalizedEvent) {
  const url = canonicalUrl(event.details.url);
  return url ? `${event.details.method ?? "GET"} ${url}` : null;
}

function eventHost(event: NormalizedEvent) {
  return normalizeHost(event.details.url ?? event.details.hostname ?? event.details.host ?? event.details.destinationIp);
}

function stableUnique(values: Array<string | null | undefined>) {
  return [...new Set(values.filter((value): value is string => Boolean(value)))].sort((a, b) => a.localeCompare(b));
}

export function buildDifferential(events: readonly NormalizedEvent[]): InvestigationDifferential {
  const baseline = events.filter((event) => normalizedEventPhase(event) === "baseline");
  const agent = events.filter((event) => normalizedEventPhase(event) === "agent");
  const baselineHosts = new Set(baseline.filter((event) => event.action === "network.request").map(eventHost).filter((host): host is string => Boolean(host)));
  const baselineRequests = new Set(baseline.filter((event) => event.action === "network.request").map(requestKey).filter((key): key is string => Boolean(key)));
  const baselineNavigations = new Set(baseline.filter((event) => event.action === "browser.navigation").map((event) => canonicalUrl(event.details.url)).filter((url): url is string => Boolean(url)));
  const baselineProcesses = new Set(baseline.filter((event) => event.action === "system.process_started").map((event) => `${event.details.command ?? "process"} (PID ${event.details.pid ?? "?"})`));
  const baselineConnections = new Set(baseline.filter((event) => ["system.network_connection", "system.socket", "system.socket_observed"].includes(event.action)).map((event) => `${event.details.destinationIp ?? event.details.remoteIp ?? "unknown"}:${event.details.destinationPort ?? "?"}`));

  return {
    additionalHosts: stableUnique(agent.filter((event) => event.action === "network.request").map(eventHost).filter((host) => host && !baselineHosts.has(host))),
    additionalRequests: stableUnique(agent.filter((event) => event.action === "network.request").map(requestKey).filter((key) => key && !baselineRequests.has(key))),
    additionalProcesses: stableUnique(agent.filter((event) => event.action === "system.process_started").map((event) => `${event.details.command ?? "process"} (PID ${event.details.pid ?? "?"})`).filter((process) => !baselineProcesses.has(process))),
    additionalConnections: stableUnique(agent.filter((event) => ["system.network_connection", "system.socket", "system.socket_observed"].includes(event.action)).map((event) => `${event.details.destinationIp ?? event.details.remoteIp ?? "unknown"}:${event.details.destinationPort ?? "?"}`).filter((connection) => !baselineConnections.has(connection))),
    additionalNavigations: stableUnique(agent.filter((event) => event.action === "browser.navigation").map((event) => canonicalUrl(event.details.url)).filter((url) => url && !baselineNavigations.has(url))),
  };
}
