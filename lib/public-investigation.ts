import { randomUUID } from 'node:crypto';
import { investigateUrl } from './engine';
import { InvestigationRequestSchema, type InvestigationCase } from './case-schema';
import { admission, clientIdentity, type Admission } from './investigation-admission';
import { DEMO_URL, LIMITS, PublicRequestError, controlledAiConfigurationValid, productionConfigurationValid, safeCase } from './production-policy';
import { DemoRequestSchema, controlledExperiment } from './controlled-demos';
import { UnsafeTargetError } from './url-safety';
export async function readBody(request: Request, signal: AbortSignal = AbortSignal.timeout(10_000)) {
  if (signal.aborted) throw new PublicRequestError(504, "Request timed out.");
  const reader = request.body?.getReader();
  if (!reader) return {};
  let size = 0;
  const chunks: Uint8Array[] = [];
  let onAbort: () => void = () => {};
  const aborted = new Promise<never>((_, reject) => {
    onAbort = () => {
      void reader.cancel().catch(() => {});
      reject(new PublicRequestError(504, 'Request timed out.'));
    };
    signal.addEventListener('abort', onAbort, { once: true });
    if (signal.aborted) onAbort();
  });
  try {
    for (;;) {
      const { done, value } = await Promise.race([reader.read(), aborted]);
      if (signal.aborted) throw new PublicRequestError(504, "Request timed out.");
      if (done) break;
      size += value.length;
      if (size > LIMITS.bodyBytes) {
        await reader.cancel();
        throw new PublicRequestError(413, 'Request body is too large.');
      }
      chunks.push(value);
    }
  } finally {
    signal.removeEventListener('abort', onAbort);
    reader.releaseLock();
  }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { throw new PublicRequestError(400, 'Send a valid JSON request.'); }
}
export async function publicInvestigation(request: Request, demo: boolean, dependencies?: { admission: Admission; run: typeof investigateUrl; log?: (value: string)=>void }) {
  const requestId=randomUUID(), started=Date.now(); let release:(()=>Promise<void>)|undefined;
  let sandboxCreated=false; let result:InvestigationCase|undefined; let status=500;
  const controller=new AbortController(); const timer=setTimeout(()=>controller.abort(),LIMITS.requestMs);
  const abort=()=>controller.abort(); request.signal.addEventListener('abort',abort,{once:true});
  if(request.signal.aborted)controller.abort();
  const headers={'Cache-Control':'no-store','X-Request-Id':requestId};
  try {
    if (!demo && process.env.NODE_ENV==='production' && process.env.KRAXX_PUBLIC_INVESTIGATIONS_ENABLED!=='true') throw new PublicRequestError(403,'Public URL investigations are disabled. Use the controlled demo.');
    if (!demo && !productionConfigurationValid()) throw new PublicRequestError(503,'Investigation service is not configured.');
    const origin=request.headers.get('origin'); if(origin && origin!==new URL(request.url).origin) throw new PublicRequestError(403,'Request origin is not allowed.');
    release=await (dependencies?.admission ?? admission()).acquire(clientIdentity(request));
    const body=await readBody(request, controller.signal);
    const demoRequest = demo ? DemoRequestSchema.safeParse(body) : undefined;
    if(demo && !demoRequest?.success) throw new PublicRequestError(400,'Choose a supported controlled scenario. Custom parameters are not accepted.');
    const demoMode = demoRequest?.data?.mode ?? 'deterministic';
    if (demo && demoMode === 'ai' && !controlledAiConfigurationValid()) throw new PublicRequestError(503, 'Experimental free AI research is not configured. Use deterministic research.');
    const parsed=demo ? undefined : InvestigationRequestSchema.safeParse(body);
    if(!demo && !parsed?.success) throw new PublicRequestError(400,'Enter a valid HTTP(S) URL.');
    const work=(dependencies?.run ?? investigateUrl)(demo?DEMO_URL:parsed!.data!.url,demo?controlledExperiment(demoRequest?.data?.scenario):undefined,{signal:controller.signal,demo,...(demo ? {demoMode} : {}),onSandboxCreated:()=>{sandboxCreated=true;}});
    // Keep the lease until actual cleanup completes, including after a client timeout.
    const cleanup=release; release=undefined; void work.finally(()=>cleanup?.().catch(()=>{})).catch(()=>{});
    result=await Promise.race([work,new Promise<never>((_,reject)=>{ if(controller.signal.aborted)reject(new PublicRequestError(504,'Investigation timed out.')); else controller.signal.addEventListener('abort',()=>reject(new PublicRequestError(504,'Investigation timed out.')),{once:true}); })]);
    result=safeCase(result);
    if(result.status === "failed") throw new PublicRequestError(502,"Sandbox investigation could not complete. Try again later.");
    status=200;
    return Response.json({...result,url:result.target.submittedUrl},{status,headers});
  } catch(error) {
    status=error instanceof PublicRequestError?error.status:error instanceof UnsafeTargetError?400:500;
    const message=error instanceof PublicRequestError?error.message:error instanceof UnsafeTargetError?'Target is not a safe public HTTP(S) URL.':'Investigation could not complete. Try again later.';
    return Response.json({error:message,requestId},{status,headers:status===429?{...headers,'Retry-After':'600'}:headers});
  } finally {
    clearTimeout(timer); request.signal.removeEventListener('abort',abort); await release?.().catch(()=>{});
    (dependencies?.log ?? console.info)(JSON.stringify(safeCase({requestId,...(result?{caseId:result.caseId}:{}),duration:Date.now()-started,status,sandboxCreated,provider:result?.agent?.provider ?? (['openrouter','openai'].includes(process.env.AI_PROVIDER??'')?process.env.AI_PROVIDER:'fallback'),...(result?.modelExecution?.actualModel?{actualModel:result.modelExecution.actualModel}:{})})));
  }
}
