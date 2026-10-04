import { z } from 'zod';
export const ResearchAssessmentSchema=z.object({question:z.string().min(1).max(240),hypothesis:z.string().min(1).max(400),evidenceIds:z.array(z.string().min(1).max(100)).min(1).max(8),status:z.enum(['supported','unsupported','insufficient_evidence'])}).strict();
export const ResearchStopSchema=z.enum(['evidence_sufficient','no_useful_experiment','experiment_budget','tool_budget','model_budget','timeout','safety_policy','model_error','tool_error','invalid_evidence']);
export const ResearchRunSchema=z.object({
  version:z.literal('1.0'),stopReason:ResearchStopSchema,
  budgets:z.object({maxExperiments:z.number().int().positive(),maxToolCalls:z.number().int().positive(),maxModelTurns:z.number().int().positive(),maxRuntimeMs:z.number().int().positive(),maxOutputAllowance:z.number().int().positive(),maxEvidence:z.number().int().positive()}),
  usage:z.object({experiments:z.number().int().nonnegative(),toolCalls:z.number().int().nonnegative(),modelTurns:z.number().int().nonnegative(),runtimeMs:z.number().int().nonnegative()}),
  evidence:z.array(z.object({id:z.string(),kind:z.enum(['page_snapshot','tool_result','live_event']),description:z.string().max(500),excerpt:z.string().max(1200).optional(),sha256:z.string().length(64).optional(),actionId:z.string().optional(),eventId:z.string().optional()})).max(30),
  iterations:z.array(z.object({id:z.string(),question:z.string().max(240),hypothesis:z.string().max(400),status:z.enum(['supported','unsupported','insufficient_evidence']),origin:z.enum(['model','engine']),evidenceIds:z.array(z.string()).max(8),selectedTool:z.string(),actionId:z.string().optional(),resultStatus:z.string().max(100),evaluation:z.string().max(500)})).max(10),
  providerFailure:z.enum(['output_limit','invalid_tool','empty_response','multiple_tools','http_error','network_error']).optional(),
}).strict();
export type ResearchRun=z.infer<typeof ResearchRunSchema>;
export type ResearchAssessment=z.infer<typeof ResearchAssessmentSchema>;
export const RESEARCH_BUDGETS={maxExperiments:5,maxToolCalls:10,maxModelTurns:8,maxRuntimeMs:60_000,maxOutputAllowance:4096,maxEvidence:30} as const;
