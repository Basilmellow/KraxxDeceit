import { AgentDecisionSchema, AgentProviderApiError, AgentProviderOutputError, type AgentAction, type AgentContext, type AgentDecision, type AgentProvider, type SafeProviderError } from "./provider";
import { createHash } from "node:crypto";
import { RESEARCH_BUDGETS, ResearchRunSchema, type ResearchRun } from "./research-schema";
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
  research?: ResearchRun;
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
  options: { research?:boolean; maxRuntimeMs?:number; maxExperiments?:number; maxModelTurns?:number; maxToolCalls?:number } = {},
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

  const budgets={...RESEARCH_BUDGETS,maxRuntimeMs:Math.max(1,Math.min(options.maxRuntimeMs??MAX_RUNTIME_MS,MAX_RUNTIME_MS)),maxExperiments:Math.max(1,Math.min(options.maxExperiments??RESEARCH_BUDGETS.maxExperiments,RESEARCH_BUDGETS.maxExperiments)),maxModelTurns:Math.max(1,Math.min(options.maxModelTurns??RESEARCH_BUDGETS.maxModelTurns,RESEARCH_BUDGETS.maxModelTurns)),maxToolCalls:Math.max(1,Math.min(options.maxToolCalls??RESEARCH_BUDGETS.maxToolCalls,RESEARCH_BUDGETS.maxToolCalls))};
  let stopReason:ResearchRun['stopReason']='timeout',experiments=0,toolCalls=0,providerFailure:ResearchRun['providerFailure'];
  const evidence:ResearchRun['evidence']=[],iterations:ResearchRun['iterations']=[];
  let assessment:ResearchRun['iterations'][number]|undefined,lastSignature='',repeats=0;
  const remaining=()=>budgets.maxRuntimeMs-(Date.now()-started);
  function recordAction(action:AgentAction){actions.push(action);if(!options.research)return;
    evidence.push({id:'result-'+action.id,kind:'tool_result',actionId:action.id,description:action.tool+' result: '+String(action.result.status??'recorded')});
    if(assessment){assessment.actionId=action.id;assessment.resultStatus=String(action.result.status??'recorded');assessment.evaluation=action.executionStatus==='blocked'?'Experiment blocked; no successful effect is inferred.':action.executionStatus==='failed'?'Tool failed; hypothesis remains unresolved.':action.tool==='finish'?'Model ended the bounded investigation. Assessments remain qualitative.':'Observation recorded. The next turn must reassess using this result.';iterations.push(assessment);assessment=undefined;}
  }
  while (actions.length < MAX_AGENT_ACTIONS && modelRequests < MAX_MODEL_REQUESTS && Date.now() - started < MAX_RUNTIME_MS) {
    if(remaining()<=0){stopReason="timeout";break;}
    if(options.research){if(modelRequests>=budgets.maxModelTurns){stopReason='model_budget';break;}if(toolCalls>=budgets.maxToolCalls){stopReason='tool_budget';break;}}
    let pageContext:AgentContext;
    try{pageContext=await withRuntimeLimit(readContext(),remaining());}catch{terminationReason='Runtime limit reached.';stopReason='timeout';break;}
    pageContext={...pageContext,pageText:{source:'untrusted_web_content',content:Buffer.from(pageContext.pageText.content,'utf8').subarray(0,MAX_TEXT_BYTES).toString('utf8')}};
    const snapshotId='page-context-'+String(modelRequests+1).padStart(3,'0');
    if(options.research&&evidence.length<budgets.maxEvidence)evidence.push({id:snapshotId,kind:'page_snapshot',description:'Untrusted page snapshot at '+pageContext.currentUrl+' ('+Buffer.byteLength(pageContext.pageText.content)+' bytes)',excerpt:pageContext.pageText.content.slice(0,1200),sha256:createHash('sha256').update(pageContext.pageText.content).digest('hex')});
    if(options.research)for(const e of (pageContext.observations??[]).slice(-12)){if(evidence.length<budgets.maxEvidence-16&&!evidence.some(old=>old.id===e.id))evidence.push({id:e.id,kind:'live_event',eventId:e.id,description:e.description.slice(0,500)});}
    const context:AgentContext={...pageContext,actions,...(options.research?{research:{evidence:evidence.slice(-30).map(({id,description})=>({id,description})),priorAssessments:iterations.slice(-4).map(({question,hypothesis,evidenceIds,status})=>({question,hypothesis,evidenceIds,status})),remainingExperiments:budgets.maxExperiments-experiments,remainingTools:budgets.maxToolCalls-toolCalls,remainingModelTurns:budgets.maxModelTurns-modelRequests}}:{})};
    let decision: AgentDecision;
    modelRequests += 1;
    try { decision = AgentDecisionSchema.parse(await withRuntimeLimit(provider.generateAction(context), remaining())); }
    catch (error) {
      const detail = safeError(error);
      stopReason=detail === "Agent runtime limit reached."?"timeout":"model_error";
      providerFailure=stopReason==="timeout"?undefined:error instanceof AgentProviderOutputError?error.code:error instanceof AgentProviderApiError?"http_error":error instanceof Error&&error.name==="ZodError"?"invalid_tool":"network_error";
      if (error instanceof AgentProviderApiError) providerError = error.providerError;
      terminationReason = detail === "Agent runtime limit reached." ? "Runtime limit reached." : provider.name === "openai" || provider.name === "openrouter" ? "model_error" : detail === "Agent runtime limit reached." ? "Runtime limit reached." : `Provider or tool schema error: ${detail}`;
      break;
    }

    if(options.research){
      if(Date.now()-started>=budgets.maxRuntimeMs){stopReason='timeout';break;}
      const validIds=new Set(context.research!.evidence.map(e=>e.id));
      if(decision.research?.evidenceIds.some(id=>!validIds.has(id)) || (!decision.research&&['openai','openrouter'].includes(provider.name))){stopReason='invalid_evidence';terminationReason='Research assessment lacks valid recorded evidence references.';break;}
      const a=decision.research??{question:'What does the recorded page show, and is another safe observation useful?',hypothesis:'The available page observations can support a bounded content summary.',status:decision.tool==='finish'&&pageContext.pageText.content.trim()?'supported' as const:'insufficient_evidence' as const,evidenceIds:[snapshotId]};
      assessment={id:'research-'+String(modelRequests).padStart(3,'0'),...a,origin:decision.research?'model':'engine',selectedTool:decision.tool,resultStatus:'not_executed',evaluation:'No tool result recorded.'};
      const signature=JSON.stringify({tool:decision.tool,input:decision.input,url:pageContext.currentUrl,text:createHash('sha256').update(pageContext.pageText.content).digest('hex')});
      repeats=signature===lastSignature?repeats+1:0;lastSignature=signature;
      if(decision.tool!=='finish'&&repeats>=2){stopReason='no_useful_experiment';terminationReason='Repeated experiment produced no new page observation.';iterations.push(assessment);assessment=undefined;break;}
      if(decision.tool!=='finish'&&experiments>=budgets.maxExperiments){stopReason='experiment_budget';terminationReason='Experiment budget exhausted.';iterations.push(assessment);assessment=undefined;break;}
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
      stopReason=assessment?.status === "insufficient_evidence"||assessment?.status === "unsupported"?"no_useful_experiment":"evidence_sufficient";
      recordAction({ id:nextActionId, timestampMs:anchor.timestampMs, tool:decision.tool, input:decision.input, result:{status:"completed"},anchorId:anchor.id,policyDecision:"not_applicable",executionStatus:"completed" });
      break;
    }
    if (decision.tool === "navigate") {
      if (navigations >= MAX_NAVIGATIONS) {
        stopReason="tool_budget";
        terminationReason = "Navigation limit reached.";
        const anchor=createAnchor();
        recordAction({id:nextActionId,timestampMs:anchor.timestampMs,tool:decision.tool,input:decision.input,result:{status:"rejected",reason:"navigation_limit",detail:"Navigation limit reached."},anchorId:anchor.id,policyDecision:"blocked",executionStatus:"blocked"});
        break;
      }
      try {
        const policyReason = navigationPolicy?.(decision.input.url);
        if (policyReason) {
          const anchor=createAnchor();
          recordAction({ id:nextActionId, timestampMs:anchor.timestampMs, tool:decision.tool, input:decision.input, result:{status:"rejected",reason:policyReason,detail:"Navigation denied by the experiment destination policy."},anchorId:anchor.id,policyDecision:"blocked",executionStatus:"blocked" });
          if(options.research){stopReason="safety_policy";terminationReason="Safety policy violation.";break;}
          continue;
        }
        if (!isDevelopmentFixtureUrl(decision.input.url)) await withRuntimeLimit(validateNavigation(decision.input.url),remaining());
        navigations += 1;
      } catch (error) {
        const anchor=createAnchor();
        recordAction({ id:nextActionId, timestampMs:anchor.timestampMs, tool:decision.tool, input:decision.input, result:{status:"rejected",reason:"url_safety_policy",detail:safeError(error)},anchorId:anchor.id,policyDecision:"blocked",executionStatus:"blocked" });
        if(options.research){stopReason=safeError(error)==="Agent runtime limit reached."?"timeout":"safety_policy";terminationReason=stopReason;break;}
        continue;
      }
    }
    if (decision.tool === "click") {
      if (clicks >= MAX_CLICKS) { terminationReason = "Click limit reached."; const anchor=createAnchor(); recordAction({id:nextActionId,timestampMs:anchor.timestampMs,tool:decision.tool,input:decision.input,result:{status:"rejected",reason:"click_limit",detail:"Click limit reached."},anchorId:anchor.id,policyDecision:"blocked",executionStatus:"blocked"}); break; }
      clicks += 1;
    }

    if(remaining()<=0){stopReason="timeout";terminationReason="Runtime limit reached.";break;}
    const anchor=createAnchor();
    if(options.research){experiments++;toolCalls++;}
    try {
      const result = await withRuntimeLimit(dispatch(nextActionId, decision), remaining());
      recordAction({ id:nextActionId, timestampMs:anchor.timestampMs, tool:decision.tool, input:decision.input, result,anchorId:anchor.id,policyDecision:decision.tool === "navigate" ? "allowed" : "not_applicable",executionStatus:["worker_failed","failed","rejected","blocked"].includes(String(result.status)) ? "failed" : "completed" });
      if (result.status === "worker_failed" || (options.research && ["failed","rejected","blocked"].includes(String(result.status)))) {
        stopReason=/blocked|credential|secret|policy/i.test(String(result.detail??result.status))?"safety_policy":"tool_error";
        terminationReason = typeof result.detail === "string" ? result.detail : "Browser tool execution failed.";
        break;
      }
    } catch (error) {
      stopReason=safeError(error)==="Agent runtime limit reached."?"timeout":"tool_error";
      recordAction({ id:nextActionId, timestampMs:anchor.timestampMs, tool:decision.tool, input:decision.input, result:{status:"failed",detail:safeError(error)},anchorId:anchor.id,policyDecision:decision.tool === "navigate" ? "allowed" : "not_applicable",executionStatus:"failed" });
      terminationReason = safeError(error) === "Agent runtime limit reached." ? "Runtime limit reached." : `Browser tool dispatch failed: ${safeError(error)}`;
      break;
    }
  }

  if(options.research&&!completed&&!terminationReason)terminationReason=stopReason.replaceAll('_',' ');
  if (!completed && !terminationReason) terminationReason = actions.length >= MAX_AGENT_ACTIONS || modelRequests >= MAX_MODEL_REQUESTS ? "Action limit reached." : "Runtime limit reached.";
  return { startedAtMs: started, provider: provider.name, ...(provider.model ? { model: provider.model } : {}), ...(provider.actualModel ? { actualModel: provider.actualModel } : {}), ...(provider.responseId ? { responseId: provider.responseId } : {}), ...(provider.modelToolCalls !== undefined ? { modelToolCalls: provider.modelToolCalls } : {}), actions, completed, ...(terminationReason ? { terminationReason } : {}), ...(summary ? { summary } : {}),actionAnchors,modelRequests,...(providerError?{providerError}:{}),...(options.research?{research:ResearchRunSchema.parse({version:"1.0",budgets,usage:{experiments,toolCalls,modelTurns:modelRequests,runtimeMs:Date.now()-started},stopReason,evidence:evidence.slice(0,30).map(e=>({...e,description:e.description.slice(0,500)})),iterations,...(providerFailure?{providerFailure}:{})})}:{}) };
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
