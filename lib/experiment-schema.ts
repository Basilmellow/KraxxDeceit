import { z } from "zod";
import { NormalizedEventSchema } from "./case-schema";

export const ExperimentDefinitionSchema = z.object({
  id: z.string().min(1).max(100),
  name: z.string().min(1).max(160),
  version: z.string().min(1).max(40),
  task: z.string().min(1).max(500),
  fixtureUrl: z.url().max(2048),
  expectedBehavior: z.string().max(1000).optional(),
  allowedDestinations: z.array(z.string().min(1).max(253)).max(20),
  maxActions: z.number().int().positive().max(50),
  maxRuntimeMs: z.number().int().positive().max(180_000),
}).strict();

export type ExperimentDefinition = z.infer<typeof ExperimentDefinitionSchema>;

export const ExperimentOutcomeSchema = z.enum([
  "prompt_injection_observed",
  "agent_followed_instruction",
  "agent_ignored_instruction",
  "agent_attempted_blocked_action",
  "agent_performed_allowed_action",
  "agent_timeout",
  "model_error",
  "no_agent_deviation",
  "navigation_blocked",
  "additional_destination_observed",
]);

export const ExperimentResultSchema = z.object({
  experimentId: z.string(),
  caseId: z.string(),
  baseline: z.object({ requests: z.number().int().nonnegative(), hosts: z.array(z.string()), navigations: z.array(z.string()), processes:z.number().int().nonnegative().optional(),connections:z.number().int().nonnegative().optional() }),
  agent: z.object({ actions: z.number().int().nonnegative(), requests: z.number().int().nonnegative(), hosts: z.array(z.string()), navigations: z.array(z.string()), completed: z.boolean(), summary: z.string().optional(),processes:z.number().int().nonnegative().optional(),connections:z.number().int().nonnegative().optional() }),
  outcomes: z.array(ExperimentOutcomeSchema),
  hypotheses: z.array(z.unknown()).max(20),
  completed: z.boolean(),
  terminationReason: z.string().optional(),
  modelExecution:z.object({provider:z.enum(["openai","openrouter","fallback"]),model:z.string().optional(),configuredModel:z.string().optional(),actualModel:z.string().optional(),responseId:z.string().optional(),modelToolCalls:z.number().int().nonnegative().optional(),toolCalls:z.number().int().nonnegative(),modelRequests:z.number().int().nonnegative().optional()}).optional(),
  timeline: z.array(z.object({ step: z.string(), evidenceId: z.string(), detail: z.string() })).max(100),
  experimentSummary: z.object({
    experiment: z.string(), task: z.string(), baselineBehavior: z.string(), agentBehavior: z.string(), differential: z.array(z.string()),
    hypotheses: z.array(z.string()), blockedActions: z.array(z.string()), observedExternalDestinations: z.array(z.string()), limitations: z.array(z.string()),
  }),
}).strict();

export type ExperimentResult = z.infer<typeof ExperimentResultSchema>;
export type ExperimentOutcome = z.infer<typeof ExperimentOutcomeSchema>;
export type ExperimentEvidenceInput = {
  caseId: string;
  events: Array<z.infer<typeof NormalizedEventSchema>>;
  baselineRequests: string[];
  baselineNavigations: string[];
  agentActions: Array<{ id: string; tool: string; input: Record<string, unknown>; result: Record<string, unknown>; policyDecision?:"allowed"|"blocked"|"not_applicable"; executionStatus?:"completed"|"blocked"|"failed"|"not_executed" }>;
  agentRequests: string[];
  agentNavigations: string[];
  agentCompleted: boolean;
  agentSummary?: string;
  terminationReason?: string;
  hypotheses: unknown[];
  modelExecution?:{provider:"openai"|"openrouter"|"fallback";model?:string;configuredModel?:string;actualModel?:string;responseId?:string;modelToolCalls?:number;toolCalls:number;modelRequests?:number};
  baselineProcesses?:number;
  agentProcesses?:number;
  baselineConnections?:number;
  agentConnections?:number;
};
