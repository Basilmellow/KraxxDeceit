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
  anchorId: z.string().optional(),
  policyDecision: z.enum(["allowed","blocked","not_applicable"]).optional(),
  executionStatus: z.enum(["completed","blocked","failed","not_executed"]).optional(),
});
const SafeProviderErrorSchema = z.object({
  status:z.number().int().min(100).max(599), type:z.string().max(100).optional(), code:z.string().max(100).optional(),
  message:z.string().max(1000).optional(), requestId:z.string().max(256).optional(), retryAfterMs:z.number().int().nonnegative().max(86_400_000).optional(),
}).strict();
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
  type: z.enum(["agent_to_navigation", "navigation_to_network", "browser_to_process", "network_to_destination", "agent_to_external_host", "multi_stage_attack_chain", "untrusted_instruction_to_agent_navigation", "untrusted_instruction_ignored", "untrusted_instruction_observed"]),
  title: z.string(),
  confidence: z.enum(["low", "medium", "high"]),
  status: z.enum(["observed", "supported", "insufficient_evidence"]),
  evidenceClass: z.enum(["OBSERVATION_SUPPORTED", "DIFFERENTIAL_SUPPORTED", "ACTION_EFFECT_SUPPORTED", "INSUFFICIENT_EVIDENCE"]).optional(),
  sourceEvents: z.array(z.string()).min(1).max(500),
  evidenceNodeIds: z.array(z.string()).min(1).max(500),
  explanation: z.string().max(1200),
  limitations: z.array(z.string()).min(1).max(20),
});
export const EventPhaseSchema = z.enum(["provisioning","setup","baseline","agent_action","post_action","cleanup","ambient","unknown"]);
export const TrafficScopeSchema = z.enum(["provisioning","investigation","ambient","unknown"]);
export const NormalizedEventSchema = z.object({
  id:z.string(), timestampMs:z.number().int().nonnegative(), source:z.enum(["browser","network","system","agent"]),
  action:z.string(), details:z.record(z.string(),z.string()), phase:EventPhaseSchema.optional(), trafficScope:TrafficScopeSchema.optional(),
});
const TelemetrySchema = z.object({
  mode:z.enum(["snapshot","stream"]).optional(), eventCount:z.number().int().nonnegative().max(2000).optional(), truncated:z.boolean().optional(),
  streamEvents:z.array(NormalizedEventSchema).max(2000).optional(),
  streamRelationships:z.array(z.object({id:z.string(),sourceEventId:z.string(),targetEventId:z.string(),type:z.enum(["same_destination","temporally_related","associated_process","post_action_observation","pre_existing","supports_action_hypothesis"]),label:z.string().max(500)})).max(2000).optional(),
  streamProcesses:z.array(z.object({pid:z.number().int().nonnegative(),ppid:z.number().int().nonnegative(),executable:z.string(),command:z.string(),startTimeMs:z.number().optional(),state:z.string(),firstSeen:z.number(),lastSeen:z.number(),status:z.enum(["running","exited"])})).max(500).optional(),
  streamSockets:z.array(z.object({protocol:z.string(),localAddress:z.string(),localPort:z.number().int(),destinationIp:z.string(),destinationPort:z.number().int(),state:z.string(),pid:z.number().int().optional(),timestampMs:z.number().int().nonnegative(),firstSeen:z.number(),lastSeen:z.number(),process_identity:z.string()})).max(1000).optional(),
  providers:z.array(z.object({name:z.string(),available:z.boolean(),reason:z.string().optional()})),
  processes:z.array(z.object({pid:z.number().int().nonnegative(),ppid:z.number().int().nonnegative(),executable:z.string(),command:z.string(),startTimeMs:z.number().optional(),state:z.string()})).max(200),
  network:z.array(z.object({protocol:z.string(),localAddress:z.string(),localPort:z.number().int(),destinationIp:z.string(),destinationPort:z.number().int(),state:z.string(),pid:z.number().int().optional(),timestampMs:z.number().int().nonnegative()})).max(500),
  filesystem:z.array(z.object({path:z.string(),kind:z.enum(["created","modified"]),sizeBytes:z.number().int().nonnegative(),timestampMs:z.number().int().nonnegative()})).max(500),
  snapshotA:z.unknown(), snapshotB:z.unknown(), baselineSnapshot:z.unknown().optional(), agentStartSnapshot:z.unknown().optional(),
  ebpf:z.object({available:z.boolean(),reason:z.string().optional(),tools:z.record(z.string(),z.boolean()).optional(),kernelInterfaces:z.record(z.string(),z.boolean()).optional(),capability:z.record(z.string(),z.boolean()).optional()}),
  truncationMarkers:z.array(z.string()), startedAtMs:z.number(), finishedAtMs:z.number(),
});
const EvidenceGraphSchema = z.object({
  nodes:z.array(z.object({id:z.string(),type:z.enum(["URL","PAGE","AGENT_ACTION","BROWSER_REQUEST","DNS_EVENT","SOCKET","PROCESS"]),label:z.string(),details:z.record(z.string(),z.string()).optional()})).max(100),
  edges:z.array(z.object({id:z.string(),sourceId:z.string(),targetId:z.string(),type:z.enum(["observed_during","same_destination","same_time_window","same_process","temporally_related","associated_process","pre_existing","post_action_observation","supports_action_hypothesis"]),confidence:z.enum(["high","medium","low"]),label:z.string()})).max(250),
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
  agentProvider:z.enum(["openai","openrouter","fallback"]).optional(),
  agentModel:z.string().optional(),
  experimentVersion:z.string().optional(),
  syntheticFixture:z.boolean().optional(),
  realModelExecution:z.boolean().optional(),
  modelExecution:z.object({provider:z.enum(["openai","openrouter","fallback"]),model:z.string().optional(),configuredModel:z.string().optional(),actualModel:z.string().optional(),responseId:z.string().optional(),modelToolCalls:z.number().int().nonnegative().optional(),toolCalls:z.number().int().nonnegative(),modelRequests:z.number().int().nonnegative().optional()}).optional(),
  providerError:SafeProviderErrorSchema.optional(),
  telemetryMode:z.enum(["snapshot","stream"]).optional(),
  agentActions:z.array(AgentActionSchema).max(50).optional(),
  experimentSummary: z.object({ mode:z.enum(["ignore","follow-safe","blocked"]), synthetic:z.literal(true), chainComplete:z.boolean(), observedStages:z.array(z.string()), missingStages:z.array(z.string()), causalLanguage:z.string(), limitation:z.string(), hypothesisStatus:z.enum(["observed","supported","insufficient_evidence"]).optional() }).optional(),
  attribution: z.object({ actionAnchors:z.array(z.object({id:z.string(),timestampMs:z.number().int().nonnegative(),source:z.literal("agent"),action:z.string()})), attributionWindowMs:z.number().int().positive(), methodologyVersion:z.string(), provisioningExcluded:z.boolean().optional() }).optional(),
  evidenceChain: z.object({ nodes:z.array(z.object({ id:z.string(), type:z.enum(["AGENT_ACTION","BROWSER_NAVIGATION","NETWORK_REQUEST","SOCKET_OBSERVATION","PROCESS_OBSERVATION"]), eventId:z.string(), timestampMs:z.number().int().nonnegative(), source:z.string(), details:z.record(z.string(),z.string()), phase:EventPhaseSchema.optional(), trafficScope:TrafficScopeSchema.optional() })), edges:z.array(z.object({ id:z.string(), sourceId:z.string(), targetId:z.string(), type:z.enum(["observed_during","same_destination","same_time_window","same_process","temporally_related","associated_process","pre_existing","post_action_observation","supports_action_hypothesis"]), confidence:z.enum(["high","medium","low"]), label:z.string(), sourceEventId:z.string().optional(), targetEventId:z.string().optional() })),timeline:z.array(z.object({ id:z.string(), step:z.string(), timestampMs:z.number().int().nonnegative(), phase:EventPhaseSchema.optional(), trafficScope:TrafficScopeSchema.optional() })) }).optional(),
  outcomes: z.array(z.string()).optional(),
  agent: z.object({
    task: z.string(), provider: z.string(), model: z.string().optional(), actions: z.array(AgentActionSchema),
    actionCount: z.number().int().nonnegative(), completed: z.boolean(), terminationReason: z.string().optional(), summary: z.string().optional(),
  }).optional(),
  baselineEvents: z.array(BrowserEventSchema).optional(),
  agentEvents: z.array(BrowserEventSchema).optional(),
  differential: DifferentialSchema.optional(),
  hypotheses: z.array(CausalHypothesisSchema).max(20).default([]),
  hypothesisMetadata: z.object({ generatedAt: z.string().datetime(), engineVersion: z.string(), categories:z.object({OBSERVATION_SUPPORTED:z.boolean(),DIFFERENTIAL_SUPPORTED:z.boolean(),ACTION_EFFECT_SUPPORTED:z.boolean(),INSUFFICIENT_EVIDENCE:z.boolean()}).optional() }).optional(),
  telemetry:TelemetrySchema.optional(),
  events:z.array(NormalizedEventSchema).max(2000).optional(),
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
