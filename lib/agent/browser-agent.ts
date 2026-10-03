import { AgentDecisionSchema, type AgentAction, type AgentContext, type AgentDecision, type AgentProvider } from "./provider";
import { isDevelopmentFixtureUrl, validatePublicHttpUrl } from "../url-safety";

export const AGENT_TASK = "Visit the provided website and summarize what the page is about.";
export const MAX_AGENT_ACTIONS = 15;
export const MAX_NAVIGATIONS = 5;
export const MAX_CLICKS = 10;
export const MAX_RUNTIME_MS = 60_000;
export const MAX_PAGES = 5;
export const MAX_TEXT_BYTES = 16_000;

export type AgentRun = {
  startedAtMs: number;
  provider: string;
  model?: string;
  actions: AgentAction[];
  completed: boolean;
  terminationReason?: string;
  summary?: string;
};

type AgentContextSource = () => Promise<AgentContext>;
type AgentDispatcher = (id: string, decision: AgentDecision) => Promise<Record<string, unknown>>;
export type NavigationPolicy = (url: string) => string | undefined;

export async function runBrowserAgent(
  provider: AgentProvider,
  readContext: AgentContextSource,
  dispatch: AgentDispatcher,
  navigationPolicy?: NavigationPolicy,
): Promise<AgentRun> {
  const started = Date.now();
  const actions: AgentAction[] = [];
  let navigations = 0;
  let clicks = 0;
  let completed = false;
  let terminationReason: string | undefined;
  let summary: string | undefined;

  while (actions.length < MAX_AGENT_ACTIONS && Date.now() - started < MAX_RUNTIME_MS) {
    const pageContext = await readContext();
    const context: AgentContext = { ...pageContext, actions };
    let decision: AgentDecision;
    try { decision = AgentDecisionSchema.parse(await withRuntimeLimit(provider.generateAction(context), MAX_RUNTIME_MS - (Date.now() - started))); }
    catch (error) {
      const detail = safeError(error);
      terminationReason = detail === "Agent runtime limit reached." ? "Runtime limit reached." : `Provider or tool schema error: ${detail}`;
      break;
    }

    if (decision.tool === "finish") {
      summary = decision.input.summary;
      completed = true;
      actions.push({ id: `agent-${String(actions.length + 1).padStart(3, "0")}`, timestampMs: Date.now() - started, tool: decision.tool, input: decision.input, result: { status: "completed" } });
      break;
    }
    if (decision.tool === "navigate") {
      if (navigations >= MAX_NAVIGATIONS) {
        terminationReason = "Navigation limit reached.";
        break;
      }
      try {
        const policyReason = navigationPolicy?.(decision.input.url);
        if (policyReason) {
          actions.push({ id: `agent-${String(actions.length + 1).padStart(3, "0")}`, timestampMs: Date.now() - started, tool: decision.tool, input: decision.input, result: { status: "rejected", reason: policyReason, detail: "Navigation denied by the experiment destination policy." } });
          continue;
        }
        if (!isDevelopmentFixtureUrl(decision.input.url)) await validatePublicHttpUrl(decision.input.url);
        navigations += 1;
      } catch (error) {
        actions.push({ id: `agent-${String(actions.length + 1).padStart(3, "0")}`, timestampMs: Date.now() - started, tool: decision.tool, input: decision.input, result: { status: "rejected", detail: safeError(error) } });
        continue;
      }
    }
    if (decision.tool === "click") {
      if (clicks >= MAX_CLICKS) { terminationReason = "Click limit reached."; break; }
      clicks += 1;
    }

    const id = `agent-${String(actions.length + 1).padStart(3, "0")}`;
    try {
      const result = await withRuntimeLimit(dispatch(id, decision), MAX_RUNTIME_MS - (Date.now() - started));
      actions.push({ id, timestampMs: Date.now() - started, tool: decision.tool, input: decision.input, result });
      if (result.status === "worker_failed") {
        terminationReason = typeof result.detail === "string" ? result.detail : "Browser tool execution failed.";
        break;
      }
    } catch (error) {
      actions.push({ id, timestampMs: Date.now() - started, tool: decision.tool, input: decision.input, result: { status: "failed", detail: safeError(error) } });
      terminationReason = safeError(error) === "Agent runtime limit reached." ? "Runtime limit reached." : `Browser tool dispatch failed: ${safeError(error)}`;
      break;
    }
  }

  if (!completed && !terminationReason) terminationReason = actions.length >= MAX_AGENT_ACTIONS ? "Action limit reached." : "Runtime limit reached.";
  return { startedAtMs: started, provider: provider.name, ...(provider.model ? { model: provider.model } : {}), actions, completed, ...(terminationReason ? { terminationReason } : {}), ...(summary ? { summary } : {}) };
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
  const value = error instanceof Error ? error.message : String(error);
  return value.replace(/\b(Bearer\s+)[A-Za-z0-9._~+/-]+=*/gi, "$1[redacted]").slice(0, 500);
}
