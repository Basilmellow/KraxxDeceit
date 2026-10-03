import { z } from "zod";

export const InvestigationRequestSchema = z.object({
  url: z.url().max(2048),
});

const NetworkRequestSchema = z.object({
  id: z.string(),
  timestampMs: z.number().int().nonnegative(),
  method: z.string(),
  url: z.string(),
  resourceType: z.string(),
});

const NetworkResponseSchema = NetworkRequestSchema.extend({
  status: z.number().int().min(0).max(999),
});

const FailedRequestSchema = NetworkRequestSchema.extend({
  failure: z.string(),
});

const BrowserConsoleSchema = z.object({
  type: z.string(),
  text: z.string(),
  url: z.string().optional(),
  lineNumber: z.number().int().optional(),
});

const BrowserEventSchema = z.object({
  type: z.string(),
  url: z.string().optional(),
  detail: z.string().optional(),
  timestampMs: z.number().int().nonnegative(),
});

const AgentActionSchema = z.object({
  id: z.string(),
  timestampMs: z.number().int().nonnegative(),
  tool: z.enum(["navigate", "back", "forward", "click", "type", "scroll", "get_page_text", "take_screenshot", "finish"]),
  input: z.record(z.string(), z.unknown()),
  result: z.record(z.string(), z.unknown()),
});
const DifferentialSchema = z.object({
  additionalNavigations: z.array(z.string()),
  additionalRequests: z.array(z.string()),
  additionalHosts: z.array(z.string()),
  unexpectedActions: z.array(z.string()),
  additionalProcesses: z.array(z.string()).default([]),
  additionalConnections: z.array(z.string()).default([]),
  additionalDestinations: z.array(z.string()).optional(),
  additionalBrowserRequests: z.array(z.string()).optional(),
});
const CausalHypothesisSchema = z.object({
  id: z.string(),
  type: z.enum(["agent_to_navigation", "navigation_to_network", "browser_to_process", "network_to_destination", "agent_to_external_host", "multi_stage_attack_chain", "untrusted_instruction_to_agent_navigation", "untrusted_instruction_ignored"]),
  title: z.string(),
  confidence: z.enum(["low", "medium", "high"]),
  status: z.enum(["observed", "supported", "insufficient_evidence"]),
  sourceEvents: z.array(z.string()).min(1).max(500),
  evidenceNodeIds: z.array(z.string()).min(1).max(500),
  explanation: z.string().max(1200),
  limitations: z.array(z.string()).min(1).max(20),
});
export const NormalizedEventSchema = z.object({
  id:z.string(), timestampMs:z.number().int().nonnegative(), source:z.enum(["browser","network","system","agent"]),
  action:z.string(), details:z.record(z.string(),z.string()),
});
const TelemetrySchema = z.object({
  providers:z.array(z.object({name:z.string(),available:z.boolean(),reason:z.string().optional()})),
  processes:z.array(z.object({pid:z.number().int().nonnegative(),ppid:z.number().int().nonnegative(),executable:z.string(),command:z.string(),startTimeMs:z.number().optional(),state:z.string()})).max(200),
  network:z.array(z.object({protocol:z.string(),localAddress:z.string(),localPort:z.number().int(),destinationIp:z.string(),destinationPort:z.number().int(),state:z.string(),pid:z.number().int().optional(),timestampMs:z.number().int().nonnegative()})).max(500),
  filesystem:z.array(z.object({path:z.string(),kind:z.enum(["created","modified"]),sizeBytes:z.number().int().nonnegative(),timestampMs:z.number().int().nonnegative()})).max(500),
  snapshotA:z.unknown(), snapshotB:z.unknown(), agentStartSnapshot:z.unknown().optional(),
  ebpf:z.object({available:z.boolean(),reason:z.string().optional(),tools:z.record(z.string(),z.boolean()).optional(),kernelInterfaces:z.record(z.string(),z.boolean()).optional(),capability:z.record(z.string(),z.boolean()).optional()}),
  truncationMarkers:z.array(z.string()), startedAtMs:z.number(), finishedAtMs:z.number(),
});
const EvidenceGraphSchema = z.object({
  nodes:z.array(z.object({id:z.string(),type:z.enum(["URL","PAGE","AGENT_ACTION","BROWSER_REQUEST","DNS_EVENT","SOCKET","PROCESS"]),label:z.string(),details:z.record(z.string(),z.string()).optional()})).max(100),
  edges:z.array(z.object({id:z.string(),sourceId:z.string(),targetId:z.string(),type:z.enum(["observed_during","same_destination","same_time_window","same_process"]),confidence:z.enum(["high","medium","low"]),label:z.string()})).max(250),
  truncated:z.boolean(),
});

export const BrowserObservationSchema = z.object({
  browser: z.literal("chromium"),
  initialUrl: z.string().optional(),
  pageTitle: z.string().optional(),
  finalUrl: z.string().optional(),
  httpStatus: z.number().int().min(0).max(999).optional(),
  browserError: z.string().optional(),
  screenshotAvailable: z.boolean(),
  initialScreenshot: z.string().optional(),
  finalScreenshot: z.string().optional(),
  domCaptured: z.boolean(),
  domHtml: z.string().optional(),
  domTruncated: z.boolean(),
  domMutations: z.number().int().nonnegative(),
  redirects: z.array(z.string()).max(100),
  console: z.array(BrowserConsoleSchema).max(100),
  pageErrors: z.array(z.string()).max(50),
  requests: z.array(NetworkRequestSchema).max(300),
  responses: z.array(NetworkResponseSchema).max(300),
  failedRequests: z.array(FailedRequestSchema).max(300),
  iframes: z.array(z.string()).max(100),
  downloads: z.array(BrowserEventSchema).max(30),
  pageEvents: z.array(BrowserEventSchema).max(100),
});

export const InvestigationCaseSchema = z.object({
  schemaVersion: z.literal("0.1").default("0.1"),
  caseId: z.string(),
  createdAt: z.string(),
  target: z.object({ submittedUrl: z.string(), finalUrl: z.string().optional() }),
  status: z.enum(["completed", "failed"]),
  summary: z.string(),
  redirectChain: z.array(z.string()),
  indicators: z.array(z.object({ type: z.string(), value: z.string() })),
  browser: BrowserObservationSchema,
  experiment: z.object({
    mode: z.enum(["baseline", "agent"]), task: z.string().optional(), id: z.string().optional(), name: z.string().optional(), version: z.string().optional(),
    fixtureUrl: z.string().optional(), expectedBehavior: z.string().optional(), allowedDestinations: z.array(z.string()).optional(),
    maxActions: z.number().int().positive().optional(), maxRuntimeMs: z.number().int().positive().optional(),
  }).optional(),
  experimentResult: z.unknown().optional(),
  outcomes: z.array(z.string()).optional(),
  agent: z.object({
    task: z.string(), provider: z.string(), model: z.string().optional(), actions: z.array(AgentActionSchema),
    actionCount: z.number().int().nonnegative(), completed: z.boolean(), terminationReason: z.string().optional(), summary: z.string().optional(),
  }).optional(),
  baselineEvents: z.array(BrowserEventSchema).optional(),
  agentEvents: z.array(BrowserEventSchema).optional(),
  differential: DifferentialSchema.optional(),
  hypotheses: z.array(CausalHypothesisSchema).max(20).default([]),
  hypothesisMetadata: z.object({ generatedAt: z.string().datetime(), engineVersion: z.string() }).optional(),
  telemetry:TelemetrySchema.optional(),
  events:z.array(NormalizedEventSchema).max(500).optional(),
  evidenceGraph:EvidenceGraphSchema.optional(),
  agentBrowser: BrowserObservationSchema.optional(),
  observations: z.array(z.object({
    id: z.string(),
    timestampMs: z.number().int().nonnegative(),
    category: z.enum(["navigation", "network", "browser", "system"]),
    action: z.string(),
    details: z.record(z.string(), z.string()).optional(),
  })),
  provenance: z.object({ engineVersion: z.string(), sandbox: z.string() }),
  raw: z.object({ stdout: z.string(), stderr: z.string() }),
});

export type InvestigationCase = z.infer<typeof InvestigationCaseSchema>;
export type BrowserObservation = z.infer<typeof BrowserObservationSchema>;
export type NormalizedEvent = z.infer<typeof NormalizedEventSchema>;
