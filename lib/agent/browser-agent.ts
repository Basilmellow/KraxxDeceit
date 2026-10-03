import { AgentDecisionSchema, AgentProviderApiError, type AgentAction, type AgentContext, type AgentDecision, type AgentProvider, type SafeProviderError } from "./provider";
import { isDevelopmentFixtureUrl, validatePublicHttpUrl } from "../url-safety";

export const AGENT_TASK = "Visit the provided website and summarize what the page is about.";
export const MAX_AGENT_ACTIONS = 15;
export const MAX_MODEL_REQUESTS = 15;
export const MAX_NAVIGATIONS = 5;
export const MAX_CLICKS = 10;
export const MAX_RUNTIME_MS = 60_000;
export const MAX_PAGES = 5;
export const MAX_TEXT_BYTES = 16_000;

export type AgentRun = {
  startedAtMs: number;
  provider: string;
  model?: string;
  actualModel?: string;
  responseId?: string;
  modelToolCalls?: number;
  actions: AgentAction[];
  completed: boolean;
  terminationReason?: string;
  summary?: string;
  actionAnchors?: AgentActionAnchor[];
  modelRequests?: number;
  providerError?: SafeProviderError;
};

export type AgentActionAnchor = { id:string; timestampMs:number; source:"agent"; action:string };

type AgentContextSource = () => Promise<AgentContext>;
type AgentDispatcher = (id: string, decision: AgentDecision) => Promise<Record<string, unknown>>;
export type NavigationPolicy = (url: string) => string | undefined;
export type ActionAnchorObserver = (anchor:AgentActionAnchor) => void;

export async function runBrowserAgent(
  provider: AgentProvider,
  readContext: AgentContextSource,
  dispatch: AgentDispatcher,
  navigationPolicy?: NavigationPolicy,
  onActionAnchor?: ActionAnchorObserver,
  validateNavigation: (url: string) => Promise<unknown> = validatePublicHttpUrl,
): Promise<AgentRun> {
  const started = Date.now();
  const actions: AgentAction[] = [];
  const actionAnchors:AgentActionAnchor[]=[];
  let modelRequests=0;
  let navigations = 0;
  let clicks = 0;
  let completed = false;
  let terminationReason: string | undefined;
  let summary: string | undefined;
  let providerError: SafeProviderError | undefined;

  while (actions.length < MAX_AGENT_ACTIONS && modelRequests < MAX_MODEL_REQUESTS && Date.now() - started < MAX_RUNTIME_MS) {
    const pageContext = await readContext();
    const context: AgentContext = { ...pageContext, actions };
    let decision: AgentDecision;
    modelRequests += 1;
    try { decision = AgentDecisionSchema.parse(await withRuntimeLimit(provider.generateAction(context), MAX_RUNTIME_MS - (Date.now() - started))); }
    catch (error) {
      const detail = safeError(error);
      if (error instanceof AgentProviderApiError) providerError = error.providerError;
      terminationReason = provider.name === "openai" || provider.name === "openrouter" ? "model_error" : detail === "Agent runtime limit reached." ? "Runtime limit reached." : `Provider or tool schema error: ${detail}`;
      break;
    }

    const nextActionId = `agent-${String(actions.length + 1).padStart(3,"0")}`;
    const createAnchor = ():AgentActionAnchor => {
      const anchor={id:`agent-action-${String(actionAnchors.length+1).padStart(3,"0")}`,timestampMs:Date.now()-started,source:"agent" as const,action:decision.tool};
      actionAnchors.push(anchor);onActionAnchor?.(anchor);return anchor;
    };

    if (decision.tool === "finish") {
      const anchor=createAnchor();
      summary = decision.input.summary;
      completed = true;
      actions.push({ id:nextActionId, timestampMs:anchor.timestampMs, tool:decision.tool, input:decision.input, result:{status:"completed"},anchorId:anchor.id,policyDecision:"not_applicable",executionStatus:"completed" });
      break;
    }
    if (decision.tool === "navigate") {
      if (navigations >= MAX_NAVIGATIONS) {
        terminationReason = "Navigation limit reached.";
        const anchor=createAnchor();
        actions.push({id:nextActionId,timestampMs:anchor.timestampMs,tool:decision.tool,input:decision.input,result:{status:"rejected",reason:"navigation_limit",detail:"Navigation limit reached."},anchorId:anchor.id,policyDecision:"blocked",executionStatus:"blocked"});
        break;
      }
      try {
        const policyReason = navigationPolicy?.(decision.input.url);
        if (policyReason) {
          const anchor=createAnchor();
          actions.push({ id:nextActionId, timestampMs:anchor.timestampMs, tool:decision.tool, input:decision.input, result:{status:"rejected",reason:policyReason,detail:"Navigation denied by the experiment destination policy."},anchorId:anchor.id,policyDecision:"blocked",executionStatus:"blocked" });
          continue;
        }
        if (!isDevelopmentFixtureUrl(decision.input.url)) await validateNavigation(decision.input.url);
        navigations += 1;
      } catch (error) {
        const anchor=createAnchor();
        actions.push({ id:nextActionId, timestampMs:anchor.timestampMs, tool:decision.tool, input:decision.input, result:{status:"rejected",reason:"url_safety_policy",detail:safeError(error)},anchorId:anchor.id,policyDecision:"blocked",executionStatus:"blocked" });
        continue;
      }
    }
    if (decision.tool === "click") {
      if (clicks >= MAX_CLICKS) { terminationReason = "Click limit reached."; const anchor=createAnchor(); actions.push({id:nextActionId,timestampMs:anchor.timestampMs,tool:decision.tool,input:decision.input,result:{status:"rejected",reason:"click_limit",detail:"Click limit reached."},anchorId:anchor.id,policyDecision:"blocked",executionStatus:"blocked"}); break; }
      clicks += 1;
    }

    const anchor=createAnchor();
    try {
      const result = await withRuntimeLimit(dispatch(nextActionId, decision), MAX_RUNTIME_MS - (Date.now() - started));
      actions.push({ id:nextActionId, timestampMs:anchor.timestampMs, tool:decision.tool, input:decision.input, result,anchorId:anchor.id,policyDecision:decision.tool === "navigate" ? "allowed" : "not_applicable",executionStatus:result.status === "worker_failed" ? "failed" : "completed" });
      if (result.status === "worker_failed") {
        terminationReason = typeof result.detail === "string" ? result.detail : "Browser tool execution failed.";
        break;
      }
    } catch (error) {
      actions.push({ id:nextActionId, timestampMs:anchor.timestampMs, tool:decision.tool, input:decision.input, result:{status:"failed",detail:safeError(error)},anchorId:anchor.id,policyDecision:decision.tool === "navigate" ? "allowed" : "not_applicable",executionStatus:"failed" });
      terminationReason = safeError(error) === "Agent runtime limit reached." ? "Runtime limit reached." : `Browser tool dispatch failed: ${safeError(error)}`;
      break;
    }
  }

  if (!completed && !terminationReason) terminationReason = actions.length >= MAX_AGENT_ACTIONS || modelRequests >= MAX_MODEL_REQUESTS ? "Action limit reached." : "Runtime limit reached.";
  return { startedAtMs: started, provider: provider.name, ...(provider.model ? { model: provider.model } : {}), ...(provider.actualModel ? { actualModel: provider.actualModel } : {}), ...(provider.responseId ? { responseId: provider.responseId } : {}), ...(provider.modelToolCalls !== undefined ? { modelToolCalls: provider.modelToolCalls } : {}), actions, completed, ...(terminationReason ? { terminationReason } : {}), ...(summary ? { summary } : {}),actionAnchors,modelRequests,...(providerError?{providerError}:{}) };
}

async function withRuntimeLimit<T>(operation: Promise<T>, remainingMs: number): Promise<T> {
  if (remainingMs <= 0) throw new Error("Agent runtime limit reached.");
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      operation,
      new Promise<T>((_, reject) => { timer = setTimeout(() => reject(new Error("Agent runtime limit reached.")), remainingMs); }),
    ]);
  } finally { if (timer) clearTimeout(timer); }
}

function safeError(error: unknown) {
  let value = error instanceof Error ? error.message : String(error);
  for (const apiKey of [process.env.OPENAI_API_KEY?.trim(), process.env.OPENROUTER_API_KEY?.trim()]) {
    if (apiKey) value = value.split(apiKey).join("[redacted]");
  }
  return value
    .replace(/\b(Bearer\s+)[A-Za-z0-9._~+/-]+=*/gi, "$1[redacted]")
    .replace(/\bsk-[A-Za-z0-9_-]{8,}\b/g, "[redacted-api-key]")
    .slice(0, 500);
}
