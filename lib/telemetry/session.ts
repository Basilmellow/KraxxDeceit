import type { NormalizedEvent } from "../case-schema";
import type { NetworkObservation, ProcessObservation, TelemetrySnapshot } from "./provider";

export const MAX_EVENTS = 2_000;
export const MAX_PROCESS_EVENTS = 500;
export const MAX_SOCKET_EVENTS = 1_000;
export const MAX_BROWSER_EVENTS = 1_000;
export const DEFAULT_POLL_INTERVAL_MS = 200;

export type StreamEvent = NormalizedEvent & { observedAtMs: number };
export type StreamRelationship = { id: string; sourceEventId: string; targetEventId: string; type: "same_destination" | "temporally_related" | "associated_process" | "post_action_observation" | "pre_existing" | "supports_action_hypothesis"; label: string };
export type ProcessStreamRecord = ProcessObservation & { firstSeen: number; lastSeen: number; status: "running" | "exited" };
export type SocketStreamRecord = NetworkObservation & { firstSeen: number; lastSeen: number; process_identity: string };
export type TelemetrySessionResult = { startedAtMs: number; stoppedAtMs: number; events: StreamEvent[]; processes: ProcessStreamRecord[]; sockets: SocketStreamRecord[]; relationships: StreamRelationship[]; eventCount: number; truncated: boolean; truncationMarkers: string[] };

export type TelemetrySessionOptions = {
  snapshot?: () => Promise<TelemetrySnapshot>;
  readBrowserEvents?: () => Promise<unknown[]>;
  writeStartMarker?: () => Promise<void>;
  allowedHosts?: string[];
  caseStartedAtMs?: number;
  pollIntervalMs?: number;
};
type StreamEventInput = Omit<StreamEvent, "id" | "observedAtMs" | "timestampMs"> & { id?:string; observedAtMs?:number; timestampMs?:number };

const hostOf = (url: string) => { try { return new URL(url).hostname.toLowerCase().replace(/\.$/, ""); } catch { return ""; } };
function isPublicAddress(raw: string): boolean {
  const ip = raw.toLowerCase().replace(/^\[|\]$/g, "");
  if (ip.includes(":")) {
    if (ip === "::" || ip === "::1" || ip.startsWith("fc") || ip.startsWith("fd") || ip.startsWith("fe80:") || ip.startsWith("ff") || ip.startsWith("2001:db8:")) return false;
    const mapped = ip.match(/::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if(mapped)return isPublicAddress(mapped[1]);
    const mappedHex=ip.match(/^(?:(?:0:){0,5}|::)ffff:([0-9a-f]{8})$/);
    const mappedWords=ip.match(/^(?:(?:0:){0,5}|::)ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
    const hex=mappedHex?.[1]??(mappedWords?mappedWords[1].padStart(4,"0")+mappedWords[2].padStart(4,"0"):undefined);
    if(hex){const octets=hex.match(/.{2}/g)!.map((part)=>parseInt(part,16));return isPublicAddress(octets.join("."))}
    return true;
  }
  const parts = ip.split(".").map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return false;
  const [a, b] = parts;
  return !(a === 0 || a === 10 || a === 127 || a >= 224 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 192 && b === 0) || (a === 198 && (b === 18 || b === 19)) || (a === 198 && b === 51) || (a === 203 && b === 0));
}

export class TelemetrySession {
  readonly startedAtMs = Date.now();
  private stoppedAtMs = 0;
  private timer?: ReturnType<typeof setInterval>;
  private pending?: Promise<void>;
  private stopped = false;
  private truncated = false;
  private readonly truncationMarkers = new Set<string>();
  private readonly events: StreamEvent[] = [];
  private readonly processes = new Map<string, ProcessStreamRecord>();
  private readonly sockets = new Map<string, SocketStreamRecord>();
  private readonly processEventIds = new Map<string, string>();
  private readonly socketEventIds = new Map<string, string>();
  private readonly relationships: StreamRelationship[] = [];
  private readonly anchors: Array<{ id: string; timestampMs: number; action: string }> = [];
  private readonly hostAddresses = new Map<string, Set<string>>();
  private readonly requestedHosts = new Map<string, Array<{ id: string; timestampMs: number }>>();
  private readonly counters = new Map<string, number>();
  private readonly allowedHosts: Set<string>;
  private browserSeen = new Set<string>();
  private browserEventCount = 0;

  constructor(private readonly options: TelemetrySessionOptions = {}) {
    this.allowedHosts = new Set((options.allowedHosts ?? []).map((host) => host.toLowerCase().replace(/\.$/, "")));
  }

  async start(): Promise<void> {
    if (this.timer || this.stopped) return;
    await this.options.writeStartMarker?.();
    this.timer = setInterval(() => {
      if (!this.pending && !this.stopped) this.pending = this.poll().finally(() => { this.pending = undefined; });
    }, Math.min(250, Math.max(100, this.options.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS)));
    this.pending = this.poll().finally(() => { this.pending = undefined; });
    await this.pending;
  }

  record(event: StreamEventInput): StreamEvent | undefined {
    if(event.id){const duplicate=this.events.find(item=>item.id===event.id);if(duplicate){duplicate.details={...duplicate.details,...Object.fromEntries(Object.entries(event.details).slice(0,16).map(([key,value])=>[key.slice(0,80),String(value).slice(0,2048)]))};return duplicate}}
    const source = event.source;
    const bucket = source === "browser" || source === "network" ? "browser" : source === "agent" ? "agent" : event.action.includes("socket") || event.action.includes("network_connection") ? "socket" : event.action.includes("process") ? "process" : "other";
    const cap = bucket === "browser" ? MAX_BROWSER_EVENTS : bucket === "socket" ? MAX_SOCKET_EVENTS : bucket === "process" ? MAX_PROCESS_EVENTS : MAX_EVENTS;
    const count = this.counters.get(bucket) ?? 0;
    if (count >= cap || this.events.length >= MAX_EVENTS - 1) {
      this.markTruncated(`${bucket}_event_limit`);
      return undefined;
    }
    this.counters.set(bucket, count + 1);
    const prefix = bucket === "process" ? "proc" : bucket === "socket" ? "socket" : bucket === "browser" ? "browser" : bucket === "agent" ? "agent" : "stream";
    const next = (this.counters.get(`${prefix}-id`) ?? 0) + 1;
    this.counters.set(`${prefix}-id`, next);
    const observedAtMs = event.observedAtMs ?? Date.now();
    const timestampMs = Math.max(0, observedAtMs - (this.options.caseStartedAtMs ?? this.startedAtMs));
    const phase = event.phase ?? (source === "agent" ? "agent_action" : this.phaseAt(observedAtMs));
    const normalized = {
      ...event,
      id: event.id ?? `${prefix}-${String(next).padStart(3, "0")}`,
      timestampMs,
      observedAtMs,
      phase,
      action: event.action.slice(0, 100),
      details: Object.fromEntries(Object.entries(event.details).slice(0, 16).map(([key,value])=>[key.slice(0,80),String(value).slice(0,2048)])),
    } as StreamEvent;
    this.events.push(normalized);
    if (normalized.source === "network" && normalized.action === "network.request") {
      const host = normalized.details.hostname ?? hostOf(normalized.details.url ?? "");
      if (host) {
        const group = this.requestedHosts.get(host) ?? [];
        group.push({ id: normalized.id, timestampMs: observedAtMs });
        this.requestedHosts.set(host, group);
      }
    }
    if (normalized.action === "network.dns_resolution" || normalized.action === "browser.dns_resolution") {
      const host = (normalized.details.hostname ?? normalized.details.host ?? "").toLowerCase();
      const address = normalized.details.address ?? normalized.details.ip ?? "";
      if (host && address) { const addresses = this.hostAddresses.get(host) ?? new Set<string>(); addresses.add(address); this.hostAddresses.set(host, addresses); }
    }
    return normalized;
  }

  recordActionAnchor(anchor: { id: string; timestampMs: number; action: string }, loopStartedAtMs = this.startedAtMs): void {
    const observedAtMs = loopStartedAtMs + anchor.timestampMs;
    this.registerAnchor(anchor.id,anchor.action,observedAtMs);
    this.record({ id: anchor.id, observedAtMs, source: "agent", action: `agent.${anchor.action}`, details: { action: anchor.action }, phase: "agent_action", trafficScope: "investigation" });
  }

  private registerAnchor(id:string,action:string,observedAtMs:number):void {
    if(this.anchors.some(anchor=>anchor.id===id))return;
    this.anchors.push({ id, timestampMs: observedAtMs, action });
    for (const event of this.events) {
      if (event.observedAtMs < observedAtMs && event.source === "system") {
        event.phase = "baseline";
        event.trafficScope = "ambient";
        if ((event.action === "system.socket_observed" || event.action === "system.process_observed") && !this.relationships.some((edge) => edge.type === "pre_existing" && edge.targetEventId === event.id)) {
          this.addRelationship(event.id, id, "pre_existing", "Observed before the agent action; context only.");
        }
      }
    }
  }

  async stop(): Promise<void> {
    if (this.stopped) return;
    this.stopped = true;
    if (this.timer) clearInterval(this.timer);
    await this.pending?.catch(() => undefined);
    this.stoppedAtMs = Date.now();
  }

  /** Read bounded observation labels without stopping or mutating collection. */
  peekEvidence(): Array<{id:string;description:string}> {
    return this.events.filter(e=>e.trafficScope==='investigation'&&e.source!=='agent').slice(-12).map(e=>({id:e.id,description:(e.source+' '+e.action+' at '+e.timestampMs+' ms; '+(e.details.url??e.details.hostname??e.details.destinationIp??'recorded observation')).slice(0,500)}));
  }

  async collect(): Promise<TelemetrySessionResult> {
    if (!this.stopped) await this.stop();
    return {
      startedAtMs: this.startedAtMs,
      stoppedAtMs: this.stoppedAtMs || Date.now(),
      events: this.events.map((event) => ({ ...event, details: { ...event.details } })).sort((a,b)=>a.timestampMs-b.timestampMs||a.id.localeCompare(b.id)),
      processes: [...this.processes.values()].map((item) => ({ ...item })),
      sockets: [...this.sockets.values()].map((item) => ({ ...item })),
      relationships: [...this.relationships],
      eventCount: this.events.length,
      truncated: this.truncated,
      truncationMarkers: [...this.truncationMarkers],
    };
  }

  private async poll(): Promise<void> {
    const observedAtMs = Date.now();
    const [snapshot, browserEvents] = await Promise.all([
      this.options.snapshot?.().catch(() => undefined),
      this.options.readBrowserEvents?.().catch(() => []),
    ]);
    if (snapshot) this.recordSnapshot(snapshot, observedAtMs);
    for (const raw of browserEvents ?? []) this.recordBrowserEvent(raw);
  }

  private recordSnapshot(snapshot: TelemetrySnapshot, observedAtMs: number): void {
    const present = new Set<string>();
    for (const process of snapshot.processes) {
      const identity = `${process.pid}:${process.startTimeMs ?? process.executable}`;
      present.add(identity);
      const existing = this.processes.get(identity);
      if (existing) { existing.lastSeen = observedAtMs; existing.state = process.state; continue; }
      if (this.processes.size >= MAX_PROCESS_EVENTS) { this.markTruncated("process_event_limit"); continue; }
      const stored: ProcessStreamRecord = { ...process, firstSeen: observedAtMs, lastSeen: observedAtMs, status: "running" };
      this.processes.set(identity, stored);
      const event = this.record({ observedAtMs, source: "system", action: "system.process_observed", details: { pid: String(process.pid), ppid: String(process.ppid), command: process.command, executable: process.executable, status: "running", linuxState: process.state, firstSeen: String(observedAtMs), lastSeen: String(observedAtMs) }, phase: this.phaseAt(observedAtMs), trafficScope: "ambient" });
      if (event) this.processEventIds.set(identity, event.id);
    }
    for (const [identity, process] of this.processes) {
      if (present.has(identity)) continue;
      if (process.status === "running") {
        process.status = "exited";
        const id = this.processEventIds.get(identity);
        const event = this.events.find((item) => item.id === id);
        if (event) { event.details.status = "exited"; event.details.lastSeen = String(observedAtMs); }
        process.lastSeen = observedAtMs;
      }
    }

    for (const socket of snapshot.network) {
      if (socket.protocol !== "tcp" || socket.state !== "ESTABLISHED" || socket.destinationPort <= 0 || !isPublicAddress(socket.destinationIp)) continue;
      const key = [socket.protocol, socket.localAddress, socket.localPort, socket.destinationIp, socket.destinationPort, socket.pid ?? "unknown"].join("|");
      const existing = this.sockets.get(key);
      if (existing) { existing.lastSeen = observedAtMs; const prior=this.events.find(item=>item.id===this.socketEventIds.get(key));if(prior)prior.details.lastSeen=String(observedAtMs);continue; }
      if (this.sockets.size >= MAX_SOCKET_EVENTS) { this.markTruncated("socket_event_limit"); continue; }
      const process = socket.pid === undefined ? undefined : [...this.processes.values()].find((item) => item.pid === socket.pid && item.status === "running");
      const request = this.matchingRequest(socket.destinationIp, observedAtMs);
      const stored: SocketStreamRecord = { ...socket, firstSeen: observedAtMs, lastSeen: observedAtMs, process_identity: process ? `${process.command} (${process.executable})` : "unknown" };
      this.sockets.set(key, stored);
      const event = this.record({ observedAtMs, source: "system", action: "system.socket_observed", details: {
        protocol: socket.protocol, localAddress: socket.localAddress, localPort: String(socket.localPort), destinationIp: socket.destinationIp,
        destinationPort: String(socket.destinationPort), state: socket.state, firstSeen: String(observedAtMs), lastSeen: String(observedAtMs),
        ...(socket.pid !== undefined ? { pid: String(socket.pid) } : {}), process_identity: process ? stored.process_identity : "unknown",
        ...(request ? { hostname: request.hostname, browserRequestId: request.id } : {}),
      }, phase: this.phaseAt(observedAtMs), trafficScope: request ? "investigation" : "ambient" });
      if (event) this.socketEventIds.set(key, event.id);
      if (request) {
        this.addRelationship(request.id, event?.id ?? "", "same_destination", "Browser request hostname resolved to the socket's observed destination.");
        if (event?.phase === "post_action" && event.trafficScope === "investigation") this.addRelationship(request.id, event.id, "post_action_observation", "Matching socket observed after the action within the attribution window.");
      }
      if (process && event) {
        const processId = this.processEventIds.get(`${process.pid}:${process.startTimeMs ?? process.executable}`);
        if (processId) this.addRelationship(processId, event.id, "associated_process", "Socket PID matched an observed process identity.");
      }
    }
  }

  private recordBrowserEvent(raw: unknown): void {
    if (!raw || typeof raw !== "object") return;
    const candidate = raw as { id?: unknown; timestampMs?: unknown; observedAtMs?: unknown; source?: unknown; action?: unknown; details?: unknown; phase?: unknown; trafficScope?: unknown };
    if (typeof candidate.id !== "string" || this.browserSeen.has(candidate.id)) return;
    this.browserSeen.add(candidate.id);
    if (this.browserEventCount >= MAX_BROWSER_EVENTS) { this.markTruncated("browser_event_limit"); return; }
    this.browserEventCount += 1;
    const details = candidate.details && typeof candidate.details === "object" ? candidate.details as Record<string, string> : {};
    const source = candidate.source === "network" || candidate.source === "agent" || candidate.source === "system" ? candidate.source : "browser";
    const url = details.url ?? "";
    const host = details.hostname ?? hostOf(url);
    const trafficScope = this.allowedHosts.has(host.toLowerCase()) ? "investigation" : "ambient";
    const phase = source === "agent" ? "agent_action" : (candidate.phase as NormalizedEvent["phase"] | undefined) ?? this.phaseAt(Number(candidate.observedAtMs ?? candidate.timestampMs ?? Date.now()));
    const capturedScope = (candidate.trafficScope as NormalizedEvent["trafficScope"] | undefined) ?? trafficScope;
    const observedAtMs=Number(candidate.observedAtMs ?? candidate.timestampMs ?? Date.now());
    if(source==="agent")this.registerAnchor(candidate.id,String(details.tool??String(candidate.action??"").replace(/^agent\./,"")),observedAtMs);
    const event = this.record({ id: candidate.id, observedAtMs, source, action: String(candidate.action ?? "browser.observed"), details: { ...details, ...(host ? { hostname: host } : {}) }, phase, trafficScope: capturedScope });
    if (event && source === "network" && event.action === "network.request") {
      for (const anchor of this.anchors) if (event.observedAtMs >= anchor.timestampMs && event.observedAtMs - anchor.timestampMs <= 5_000) this.addRelationship(anchor.id, event.id, "supports_action_hypothesis", "Browser request observed after an agent action within the attribution window.");
    }
  }

  private matchingRequest(destinationIp: string, at: number): { id: string; hostname: string } | undefined {
    for (const [hostname, addresses] of this.hostAddresses) {
      if (!this.allowedHosts.has(hostname) || !addresses.has(destinationIp)) continue;
      const request = (this.requestedHosts.get(hostname) ?? []).filter((item) => at >= item.timestampMs && at - item.timestampMs <= 5_000).at(-1);
      if (request) return { id: request.id, hostname };
    }
    return undefined;
  }

  private phaseAt(at: number): NormalizedEvent["phase"] {
    const anchor = [...this.anchors].reverse().find((item) => item.timestampMs <= at);
    if (!anchor) return "baseline";
    return at - anchor.timestampMs <= 5_000 ? "post_action" : "ambient";
  }

  private addRelationship(sourceEventId: string, targetEventId: string, type: StreamRelationship["type"], label: string): void {
    if (!sourceEventId || !targetEventId || this.relationships.some((edge) => edge.sourceEventId === sourceEventId && edge.targetEventId === targetEventId && edge.type === type)) return;
    if (this.relationships.length >= MAX_EVENTS) { this.markTruncated("relationship_limit"); return; }
    this.relationships.push({ id: `stream-edge-${String(this.relationships.length + 1).padStart(3, "0")}`, sourceEventId, targetEventId, type, label });
  }

  private markTruncated(marker: string): void {
    this.truncated = true;
    this.truncationMarkers.add(marker);
    if (this.events.some((event) => event.action === "telemetry.truncated") || this.events.length >= MAX_EVENTS) return;
    const next = (this.counters.get("stream-id") ?? 0) + 1;
    this.counters.set("stream-id", next);
    const now = Date.now();
    this.events.push({ id: `stream-${String(next).padStart(3, "0")}`, timestampMs: Math.max(0, now - (this.options.caseStartedAtMs ?? this.startedAtMs)), observedAtMs: now, source: "system", action: "telemetry.truncated", details: { marker }, phase: this.phaseAt(now), trafficScope: "unknown" });
  }
}

export function isPublicTelemetryAddress(value: string) { return isPublicAddress(value); }
