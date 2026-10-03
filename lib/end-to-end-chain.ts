import { Sandbox } from "@vercel/sandbox";
import { randomUUID } from "node:crypto";
import { InvestigationCaseSchema, type NormalizedEvent } from "./case-schema";
import { ProcfsTelemetryProvider } from "./telemetry/provider";
import { linkHypothesesToEvidenceGraph } from "./hypothesis-engine";
import { DENIED_SANDBOX_SUBNETS } from "./url-safety";
import { evaluateActionToEffectHypothesis, POST_ACTION_WINDOW_MS, ATTRIBUTION_METHODOLOGY_VERSION, type ActionAnchor } from "./attribution-engine";
import type { TelemetrySnapshot } from "./telemetry/provider";
import { TelemetrySession } from "./telemetry/session";
import { decideEndToEndAction, END_TO_END_CHAIN, E2E_FIXTURE_HTML, isAllowedEndToEndDestination, type EndToEndMode } from "../experiments/web-agent/end-to-end-chain";

const BROWSER_SCRIPT = String.raw`
const {chromium}=require('playwright');
const fs=require('node:fs');
const mode=process.argv[2];
const fixture=process.argv[3];
const safe='https://example.com/?kraxx_experiment=e2e';
const started=Date.now();
const root='/tmp/kraxxdeceit-browser';
const out={mode,startedAt:started,fixtureLoadedAt:0,finishedAt:0,requests:[],navigations:[],agentAction:null,blocked:false,fixtureLoaded:false,pageTitle:'',finalUrl:'',httpStatus:null,error:null,dns:[]};
let browser,context,page;
let streamSequence=0,actionTimestamp=0;
const streamPath=root+'/e2e-stream-events.jsonl',streamMarker=root+'/e2e-telemetry-session-start';
const safeUrl=(value)=>{try{const u=new URL(value);u.username='';u.password='';u.hash='';return u.toString()}catch{return ''}};
const streamEvent=(source,action,url,details={})=>{if(!fs.existsSync(streamMarker)||streamSequence>=1000)return;let hostname='';try{hostname=new URL(url||'').hostname.toLowerCase()}catch{}const observedAtMs=Date.now();const prefix=source==='agent'?'agent':'browser';const id=source==='agent'&&details.anchorId?details.anchorId:prefix+'-'+String(++streamSequence).padStart(3,'0');fs.appendFileSync(streamPath,JSON.stringify({id,observedAtMs,source,action,details:{...details,...(url?{url:safeUrl(url)}:{}),...(hostname?{hostname}:{})},phase:source==='agent'?'agent_action':!actionTimestamp?'baseline':observedAtMs-actionTimestamp<=5000?'post_action':'ambient',trafficScope:source==='agent'||hostname==='example.com'?'investigation':'ambient'})+'\n')};
async function main(){
 try{
  const dns=require('node:dns').promises;
  try{out.dns=(await dns.lookup('example.com',{all:true,verbatim:true})).map(x=>x.address)}catch{}
  browser=await chromium.launch({headless:true,args:['--no-sandbox']});
  context=await browser.newContext({serviceWorkers:'block'});
  await context.route('**/*',async route=>{
    let url;try{url=new URL(route.request().url())}catch{await route.abort();return}
    if(url.hostname!=='example.com'||url.protocol!=='https:'){await route.abort('blockedbyclient');return}
    await route.continue();
  });
  context.on('request',request=>{const timestamp=Date.now(),url=safeUrl(request.url());if(out.requests.length<40)out.requests.push({id:'request-'+(out.requests.length+1),timestamp,method:request.method(),url,resourceType:request.resourceType()});streamEvent('network','network.request',url,{method:request.method(),resourceType:request.resourceType()});if(new URL(url).hostname==='example.com')dns.lookup('example.com',{all:true,verbatim:true}).then(items=>items.slice(0,16).forEach(item=>streamEvent('network','browser.dns_resolution',url,{hostname:'example.com',address:item.address}))).catch(()=>{})});
  page=await context.newPage();
  page.on('framenavigated',frame=>{if(frame===page.mainFrame()){const timestamp=Date.now(),url=safeUrl(frame.url());if(out.navigations.length<20)out.navigations.push({id:'navigation-'+(out.navigations.length+1),timestamp,url});streamEvent('browser','browser.navigation',url)}});
  await page.setContent(fixture,{waitUntil:'domcontentloaded'});out.fixtureLoaded=true;out.fixtureLoadedAt=Date.now();out.pageTitle=await page.title();
  out.baselineText=(await page.locator('body').innerText()).slice(0,1000);
  out.baselineObservedAt=Date.now();
  const checkpoint=async(name)=>{const marker=root+'/e2e-'+name+'-ready',ack=root+'/e2e-'+name+'-ack';fs.writeFileSync(marker,JSON.stringify({timestamp:Date.now()}));const until=Date.now()+8000;while(Date.now()<until&&!fs.existsSync(ack))await new Promise(r=>setTimeout(r,50));try{fs.unlinkSync(ack)}catch{}if(Date.now()>=until)throw new Error('Timed out waiting for '+name+' telemetry checkpoint.')};
  const anchorAction=async(action)=>{const anchor={id:'event-agent-action-1',timestampMs:Date.now(),action};fs.writeFileSync(root+'/e2e-agent-anchor.json',JSON.stringify(anchor));const until=Date.now()+8000;while(Date.now()<until&&!fs.existsSync(root+'/e2e-agent-anchor-ack'))await new Promise(r=>setTimeout(r,25));try{fs.unlinkSync(root+'/e2e-agent-anchor-ack')}catch{}if(Date.now()>=until)throw new Error('Timed out waiting for agent action telemetry anchor.');return anchor};
  await checkpoint('baseline');
  fs.writeFileSync(root+'/e2e-telemetry-session-start',JSON.stringify({timestamp:Date.now()}));
  if(mode==='follow-safe'){
    const anchor=await anchorAction('navigate');out.agentAction={id:anchor.id,timestamp:anchor.timestampMs,type:'navigate',url:safe,synthetic_agent_action:true};
    actionTimestamp=out.agentAction.timestamp;streamEvent('agent','agent.navigate',safe,{anchorId:anchor.id,synthetic_agent_action:'true'});
    const candidate=new URL(out.agentAction.url);
    if(candidate.protocol!=='https:'||candidate.hostname!=='example.com'||candidate.search!=='?kraxx_experiment=e2e')throw new Error('Deterministic destination policy rejected the safe experiment URL.');
    out.navigations.push({id:'navigation-agent-1',timestamp:Date.now(),url:safe});
    const response=await page.goto(safe,{waitUntil:'domcontentloaded',timeout:25000});out.httpStatus=response?response.status():null;
    out.postActionAt=Date.now();await checkpoint('post-action');
  }else if(mode==='blocked'){
    const anchor=await anchorAction('navigate');out.agentAction={id:anchor.id,timestamp:anchor.timestampMs,type:'navigate',url:'https://example.invalid/',synthetic_agent_action:true};
    actionTimestamp=out.agentAction.timestamp;streamEvent('agent','agent.navigation_blocked',out.agentAction.url,{anchorId:anchor.id,reason:'destination_not_allowed'});
    const candidate=new URL(out.agentAction.url);
    out.blocked=!(candidate.protocol==='https:'&&candidate.hostname==='example.com'&&candidate.search==='?kraxx_experiment=e2e');
  }else{
    const anchor=await anchorAction('get_page_text');out.agentAction={id:anchor.id,timestamp:anchor.timestampMs,type:'get_page_text',detail:(await page.locator('body').innerText()).slice(0,1000),synthetic_agent_action:true};
    actionTimestamp=out.agentAction.timestamp;streamEvent('agent','agent.get_page_text','',{anchorId:anchor.id,synthetic_agent_action:'true'});
  }
  fs.writeFileSync(root+'/e2e-agent-done',JSON.stringify({timestamp:Date.now()}));
  await page.waitForTimeout(600);
  out.finalUrl=safeUrl(page.url());out.pageTitle=await page.title();
  if(mode==='ignore'&&out.requests.length)throw new Error('Ignore mode unexpectedly generated network requests.');
  if(mode==='blocked'&&out.navigations.length)throw new Error('Blocked mode unexpectedly navigated.');
  if(mode==='blocked'&&out.requests.length)throw new Error('Blocked mode unexpectedly generated network requests.');
}catch(error){out.error=String(error&&error.stack||error).slice(0,3000)}finally{out.finishedAt=Date.now();try{await context?.close()}catch{}try{await browser?.close()}catch{}require('node:fs').writeFileSync('/tmp/kraxxdeceit-browser/e2e-result.json',JSON.stringify(out))}}
main();
`;

export type EvidenceNode = { id: string; type: "AGENT_ACTION" | "BROWSER_NAVIGATION" | "NETWORK_REQUEST" | "SOCKET_OBSERVATION" | "PROCESS_OBSERVATION"; eventId: string; timestampMs: number; source: string; details: Record<string, string>; phase:NonNullable<NormalizedEvent["phase"]>; trafficScope:NonNullable<NormalizedEvent["trafficScope"]> };
export type ChainRelationship = "observed_during"|"same_destination"|"same_time_window"|"same_process"|"temporally_related"|"associated_process"|"pre_existing"|"post_action_observation"|"supports_action_hypothesis";
const nodeHost = (url:string|undefined) => { try { return url ? new URL(url).hostname.toLowerCase() : ""; } catch { return ""; } };
export function buildObservedChainEdges(nodes: EvidenceNode[], safeAddresses: string[], anchorTimestampMs: number, maxWindowMs = POST_ACTION_WINDOW_MS) {
  const find = (type: EvidenceNode["type"]) => nodes.find((node)=>node.type===type);
  const agent=find("AGENT_ACTION"), navigation=find("BROWSER_NAVIGATION"), request=find("NETWORK_REQUEST");
  const eligible=(node:EvidenceNode|undefined)=>Boolean(node&&node.phase==="post_action"&&node.trafficScope==="investigation"&&node.timestampMs>=anchorTimestampMs&&node.timestampMs-anchorTimestampMs<=maxWindowMs);
  const navEligible=eligible(navigation),requestEligible=eligible(request)&&Boolean(navigation&&request&&request.timestampMs>=navigation.timestampMs&&request.timestampMs<=anchorTimestampMs+maxWindowMs);
  const socket=nodes.find((node)=>node.type==="SOCKET_OBSERVATION"&&eligible(node)&&node.details.destinationPort==="443"&&safeAddresses.includes(node.details.destinationIp??"")&&Boolean(request)&&node.timestampMs>=request!.timestampMs&&node.timestampMs<=anchorTimestampMs+maxWindowMs);
  const process=nodes.find((node)=>node.type==="PROCESS_OBSERVATION"&&Boolean(socket?.details.pid)&&node.details.pid===socket?.details.pid);
  const edges:Array<{id:string;sourceId:string;targetId:string;type:ChainRelationship;confidence:"high"|"medium"|"low";label:string}> = [];
  const add=(from:EvidenceNode|undefined,to:EvidenceNode|undefined,type:ChainRelationship,label:string,confidence:"high"|"medium"|"low")=>{if(from&&to)edges.push({id:`edge-${edges.length+1}`,sourceId:from.id,targetId:to.id,type,label,confidence})};
  if(agent?.phase === "agent_action" && agent.trafficScope === "investigation" && navEligible && nodeHost(agent.details.url) === nodeHost(navigation?.details.url))add(agent,navigation,"supports_action_hypothesis","requested after the explicit agent action", "high");
  if(navEligible&&requestEligible&&nodeHost(navigation?.details.url)===nodeHost(request?.details.url))add(navigation,request,"same_destination","same destination in timestamp order", "high");
  if(requestEligible&&socket)add(request,socket,"post_action_observation","new destination socket observed after the request", "medium");
  if(socket&&process)add(socket,process,process.timestampMs<anchorTimestampMs||process.phase==="baseline"?"pre_existing":"same_process",process.timestampMs<anchorTimestampMs||process.phase==="baseline"?"same PID identifies a pre-existing browser process; context only":"associated_process: observed process identity matches socket PID",process.timestampMs<anchorTimestampMs?"low":"high");
  for(const oldSocket of nodes.filter(node=>node.type==="SOCKET_OBSERVATION"&&node.timestampMs<anchorTimestampMs))for(const oldProcess of nodes.filter(node=>node.type==="PROCESS_OBSERVATION"&&node.timestampMs<anchorTimestampMs&&node.details.pid&&node.details.pid===oldSocket.details.pid))add(oldSocket,oldProcess,"pre_existing","pre-existing socket/process context only","low");
  return edges;
}

export async function runEndToEndChain(mode: EndToEndMode) {
  if (process.env.NODE_ENV !== "development") throw new Error("This fixed experiment is available only in local development.");
  const action = decideEndToEndAction(mode);
  if (action.kind === "navigate" && mode === "follow-safe" && !isAllowedEndToEndDestination(action.url)) throw new Error("The fixed example.com destination failed the experiment policy.");
  const caseStart = Date.now();
  const caseId = `CASE-${new Date().toISOString().slice(0,10).replaceAll("-","")}-${randomUUID().slice(0,8).toUpperCase()}`;
  if (process.env.NODE_ENV === "development") console.info(`[KRAXX] Vercel Sandbox auth: ${process.env.VERCEL_OIDC_TOKEN?.trim() ? "available" : "missing"}`);
  if (!process.env.VERCEL_OIDC_TOKEN?.trim()) throw new Error("Vercel Sandbox authentication is missing. Run `vercel link` and `vercel env pull .env.local`, then restart the dev server.");

  const provisioningStartedAt = Date.now();
  const sandbox = await Sandbox.create({ name: `kraxx-e2e-${caseId.toLowerCase()}`, persistent: false, timeout: 150_000, resources: { vcpus: 2 }, networkPolicy: "allow-all" });
  let provider: ProcfsTelemetryProvider | undefined;
  let telemetry: Awaited<ReturnType<ProcfsTelemetryProvider["collect"]>> | undefined;
  let sandboxStopped = false;
  let providerStopped = false;
  try {
    const health = await sandbox.runCommand({ cmd: "node", args: ["-e", "console.log('KRAXX_SANDBOX_OK')"], timeoutMs: 5_000 });
    const healthText = await health.stdout();
    if (health.exitCode !== 0 || !healthText.includes("KRAXX_SANDBOX_OK")) throw new Error(`Sandbox health command failed (exit ${health.exitCode}).`);
    const install = await sandbox.runCommand({ cmd: "npm", args: ["install", "--prefix", "/tmp/kraxxdeceit-browser", "--no-audit", "--no-fund", "--no-save", "playwright@1.63.0"], timeoutMs: 60_000 });
    if (install.exitCode !== 0) throw new Error(`Playwright setup failed: ${(await install.stderr()).slice(0, 1200)}`);
    const chromium = await sandbox.runCommand({ cmd: "node", args: ["/tmp/kraxxdeceit-browser/node_modules/playwright/cli.js", "install", "--with-deps", "chromium", "--only-shell"], timeoutMs: 60_000 });
    if (chromium.exitCode !== 0) throw new Error(`Chromium setup failed: ${(await chromium.stderr()).slice(0, 1200)}`);
    await sandbox.updateNetworkPolicy({ allow: ["example.com"], subnets: { deny: DENIED_SANDBOX_SUBNETS } });
    const provisioningFinishedAt = Date.now();
    await sandbox.writeFiles([{ path: "/tmp/kraxxdeceit-browser/e2e-runner.cjs", content: BROWSER_SCRIPT }]);
    provider = new ProcfsTelemetryProvider(sandbox);
    await provider.start();
    let snapshotQueue:Promise<unknown>=Promise.resolve();
    const takeSnapshot=()=>{const next=snapshotQueue.then(()=>provider!.snapshot());snapshotQueue=next.then(()=>undefined,()=>undefined);return next};
    const streamPaths=["e2e-stream-events.jsonl","e2e-telemetry-session-start","e2e-agent-done","e2e-agent-anchor.json","e2e-agent-anchor-ack"];
    await sandbox.runCommand({cmd:"node",args:["-e",`const fs=require('node:fs');for(const name of ${JSON.stringify(streamPaths)})try{fs.unlinkSync('/tmp/kraxxdeceit-browser/'+name)}catch{}`]}).catch(()=>undefined);
    const startedAt = Date.now();
    const run = await sandbox.runCommand({ cmd: "env", args: ["NODE_PATH=/tmp/kraxxdeceit-browser/node_modules", "node", "/tmp/kraxxdeceit-browser/e2e-runner.cjs", mode, E2E_FIXTURE_HTML], detached: true, timeoutMs: 45_000 });
    const deadline = Date.now() + 40_000;
    let liveResult: Record<string, unknown> | undefined;
    let baselineSnapshot: TelemetrySnapshot | undefined;
    let postActionSnapshot: TelemetrySnapshot | undefined;
    let telemetrySession:TelemetrySession|undefined;
    let streamResult:Awaited<ReturnType<TelemetrySession["collect"]>>|undefined;
    let actionAnchorAcked=false;
    let baselineAcked = false;
    let postActionAcked = false;
    while (Date.now() < deadline && !liveResult) {
      if (!baselineAcked && await sandbox.readFileToBuffer({ path: "/tmp/kraxxdeceit-browser/e2e-baseline-ready" }).catch(() => null)) {
        baselineSnapshot = await takeSnapshot();
        telemetrySession=new TelemetrySession({snapshot:takeSnapshot,allowedHosts:["example.com"],caseStartedAtMs:caseStart,readBrowserEvents:async()=>{const bytes=await sandbox.readFileToBuffer({path:"/tmp/kraxxdeceit-browser/e2e-stream-events.jsonl"}).catch(()=>null);if(!bytes)return[];return bytes.toString("utf8").split("\n").filter(Boolean).slice(-1000).flatMap(line=>{try{return[JSON.parse(line) as unknown]}catch{return[]}})},writeStartMarker:async()=>sandbox.writeFiles([{path:"/tmp/kraxxdeceit-browser/e2e-telemetry-session-start",content:JSON.stringify({startedAtMs:Date.now()})}])});
        await telemetrySession.start();
        await sandbox.writeFiles([{ path: "/tmp/kraxxdeceit-browser/e2e-baseline-ack", content: "observed" }]);
        baselineAcked = true;
      }
      if (!postActionAcked && await sandbox.readFileToBuffer({ path: "/tmp/kraxxdeceit-browser/e2e-post-action-ready" }).catch(() => null)) {
        postActionSnapshot = await takeSnapshot();
        await sandbox.writeFiles([{ path: "/tmp/kraxxdeceit-browser/e2e-post-action-ack", content: "observed" }]);
        postActionAcked = true;
      }
      if(telemetrySession&&!actionAnchorAcked){const marker=await sandbox.readFileToBuffer({path:"/tmp/kraxxdeceit-browser/e2e-agent-anchor.json"}).catch(()=>null);if(marker){try{const anchor=JSON.parse(marker.toString("utf8")) as {id:string;timestampMs:number;action:string};telemetrySession.recordActionAnchor({id:anchor.id,timestampMs:Math.max(0,anchor.timestampMs-caseStart),action:anchor.action},caseStart);await sandbox.writeFiles([{path:"/tmp/kraxxdeceit-browser/e2e-agent-anchor-ack",content:"recorded"}]);actionAnchorAcked=true}catch{}}}
      if(telemetrySession&&!streamResult&&await sandbox.readFileToBuffer({path:"/tmp/kraxxdeceit-browser/e2e-agent-done"}).catch(()=>null)){await telemetrySession.stop();streamResult=await telemetrySession.collect()}
      const file = await sandbox.readFileToBuffer({ path: "/tmp/kraxxdeceit-browser/e2e-result.json" }).catch(() => null);
      if (file) { try { liveResult = JSON.parse(file.toString("utf8")) as Record<string, unknown>; } catch {} }
      if (!liveResult) await new Promise((resolve) => setTimeout(resolve, 200));
    }
    const finishedRunner = await run.wait();
    if (!liveResult) throw new Error(`Sandbox browser runner exited without its bounded result file (exit ${finishedRunner.exitCode}). stdout: ${(await finishedRunner.stdout()).slice(0,1200)} stderr: ${(await finishedRunner.stderr()).slice(0,1600)}`);
    if(telemetrySession&&!streamResult){await telemetrySession.stop();streamResult=await telemetrySession.collect()}
    postActionSnapshot ??= await takeSnapshot().catch(() => undefined);
    await provider.stop();
    providerStopped = true;
    telemetry = await provider.collect();
    if(streamResult)telemetry={...telemetry,mode:"stream",eventCount:streamResult.eventCount,truncated:streamResult.truncated,streamEvents:streamResult.events,streamRelationships:streamResult.relationships};
    if (typeof liveResult.error === "string" && liveResult.error) throw new Error(`Sandbox browser experiment failed: ${liveResult.error}`);

    const reqs = Array.isArray(liveResult.requests) ? liveResult.requests as Array<Record<string, unknown>> : [];
    const navs = Array.isArray(liveResult.navigations) ? liveResult.navigations as Array<Record<string, unknown>> : [];
    const toRelative = (timestamp: unknown) => Math.max(0, Number(timestamp) - caseStart);
    const telemetryStartedAt = telemetry?.startedAtMs ?? caseStart;
    const baselineAt = baselineSnapshot ? telemetryStartedAt + baselineSnapshot.timestampMs : Number.POSITIVE_INFINITY;
    const phase = (ts: number, anchorTs?: number): NormalizedEvent["phase"] => anchorTs === undefined ? (ts < provisioningFinishedAt ? "provisioning" : ts < baselineAt ? "setup" : "baseline") : ts < anchorTs ? "baseline" : ts <= anchorTs + POST_ACTION_WINDOW_MS ? "post_action" : "cleanup";
    const trafficScope = (details: Record<string,string>, stage: NormalizedEvent["phase"]): NormalizedEvent["trafficScope"] => stage === "provisioning" ? "provisioning" : details.destinationIp && Array.isArray(liveResult.dns) && (liveResult.dns as string[]).includes(details.destinationIp) && details.destinationPort === "443" ? "investigation" : stage === "setup" || stage === "cleanup" ? "ambient" : "unknown";
    const events: NormalizedEvent[] = [
      { id: "event-investigation-start", timestampMs: 0, source: "system", action: "investigation_started", details: {}, phase: "setup", trafficScope: "unknown" },
      { id: "event-provisioning-start", timestampMs: toRelative(provisioningStartedAt), source: "system", action: "sandbox_provisioning_started", details: {}, phase: "provisioning", trafficScope: "provisioning" },
      { id: "event-provisioning-complete", timestampMs: toRelative(provisioningFinishedAt), source: "system", action: "sandbox_provisioning_complete", details: {}, phase: "setup", trafficScope: "unknown" },
    ];
    const nodes: EvidenceNode[] = [];
    const agentRaw = liveResult.agentAction as Record<string,unknown> | null;
    const anchor: ActionAnchor | undefined = agentRaw ? { id: "event-agent-action-1", timestampMs: toRelative(agentRaw.timestamp), source: "agent", action: String(agentRaw.type ?? "navigate") } : undefined;
    const agent: NormalizedEvent | undefined = anchor ? { id: anchor.id, timestampMs: anchor.timestampMs, source: "agent", action: mode === "blocked" ? "agent.navigation_blocked" : anchor.action === "get_page_text" ? "agent.get_page_text" : "agent.navigate", details: { url: String(agentRaw?.url ?? ""), result: mode === "blocked" ? "rejected" : "completed", ...(mode === "follow-safe" ? { synthetic_agent_action: "true" } : {}), ...(mode === "blocked" ? { reason: "destination_not_allowed" } : {}) }, phase: "agent_action", trafficScope: "investigation" } : undefined;
    if (agent) { events.push(agent); nodes.push({ id: `node-${agent.id}`, type: "AGENT_ACTION", eventId: agent.id, timestampMs: agent.timestampMs, source: "agent", details: agent.details, phase: "agent_action", trafficScope: "investigation" }); }
    const safeAddresses = Array.isArray(liveResult.dns) ? liveResult.dns as string[] : [];
    const navigation = navs.find((item) => typeof item.url === "string" && new URL(item.url).hostname === "example.com");
    const navTimestamp = navigation ? Number(navigation.timestamp) : 0;
    const navPhase = phase(navTimestamp, anchor ? caseStart + anchor.timestampMs : undefined);
    const navScope = navPhase === "post_action" && mode === "follow-safe" ? "investigation" : "unknown";
    const navEvent = navigation ? { id: String(navigation.id), timestampMs: toRelative(navigation.timestamp), source: "browser" as const, action: "browser.navigation", details: { url: String(navigation.url) }, phase: navPhase, trafficScope: navScope as NormalizedEvent["trafficScope"] } : undefined;
    if (navEvent) { events.push(navEvent); nodes.push({ id: `node-${navEvent.id}`, type: "BROWSER_NAVIGATION", eventId: navEvent.id, timestampMs: navEvent.timestampMs, source: "playwright", details: navEvent.details, phase: navEvent.phase ?? "unknown", trafficScope: navEvent.trafficScope ?? "unknown" }); }
    const request = reqs.find((item) => typeof item.url === "string" && new URL(String(item.url)).hostname === "example.com");
    const requestTimestamp = request ? Number(request.timestamp) : 0;
    const requestPhase = phase(requestTimestamp, anchor ? caseStart + anchor.timestampMs : undefined);
    const requestEvent = request ? { id: String(request.id), timestampMs: toRelative(request.timestamp), source: "network" as const, action: "network.request", details: { method: String(request.method), url: String(request.url), resourceType: String(request.resourceType) }, phase: requestPhase, trafficScope: requestPhase === "post_action" && mode === "follow-safe" ? "investigation" as const : "unknown" as const } : undefined;
    if (requestEvent) { events.push(requestEvent); nodes.push({ id: `node-${requestEvent.id}`, type: "NETWORK_REQUEST", eventId: requestEvent.id, timestampMs: requestEvent.timestampMs, source: "playwright", details: requestEvent.details, phase: requestEvent.phase ?? "unknown", trafficScope: requestEvent.trafficScope ?? "unknown" }); }
    const eventKeys = new Set<string>();
    const recordSystemEvent = (id: string, timestampMs: number, actionName: string, details: Record<string,string>, eventPhase: NormalizedEvent["phase"], scope: NormalizedEvent["trafficScope"]) => {
      const key = [actionName,details.protocol,details.localAddress,details.localPort,details.destinationIp,details.destinationPort,details.pid].join("|");
      if (eventKeys.has(key)) return;
      eventKeys.add(key);
      const normalized: NormalizedEvent = { id, timestampMs, source: "system", action: actionName, details, phase: eventPhase, trafficScope: scope };
      events.push(normalized);
      if (actionName === "system.socket_observed" && details.destinationPort === "443") nodes.push({ id: `node-${id}`, type: "SOCKET_OBSERVATION", eventId: id, timestampMs, source: "procfs+socket-table", details, phase: eventPhase ?? "unknown", trafficScope: scope ?? "unknown" });
      if (["system.process_started","system.process_observed"].includes(actionName) && /chrom(e|ium)/i.test(`${details.command ?? ""} ${details.executable ?? ""}`)) nodes.push({ id: `node-${id}`, type: "PROCESS_OBSERVATION", eventId: id, timestampMs, source: "procfs", details, phase: eventPhase ?? "unknown", trafficScope: scope ?? "unknown" });
    };
    const baselineKeys = new Set((baselineSnapshot?.network ?? []).map(n => [n.protocol,n.localAddress,n.localPort,n.destinationIp,n.destinationPort].join("|")));
    const snapshotEvents = (snapshot:TelemetrySnapshot|undefined, isPost:boolean) => {
      if (!snapshot) return;
      const observedAt = telemetryStartedAt + snapshot.timestampMs;
      for (const item of snapshot.processes.filter(p => /chrom(e|ium)/i.test(`${p.command} ${p.executable}`))) {
        const startAbs = item.startTimeMs ?? observedAt;
        const startRel = toRelative(startAbs);
        const wasRunningAtAction = !anchor || startAbs < caseStart + anchor.timestampMs;
        const p = wasRunningAtAction || !isPost ? "baseline" : phase(startAbs, caseStart + anchor!.timestampMs);
        const d = { pid:String(item.pid),ppid:String(item.ppid),command:item.command,executable:item.executable,...(item.startTimeMs?{startTimeMs:String(item.startTimeMs)}:{}) };
        recordSystemEvent(`system-process-${item.pid}-${isPost?"post":"baseline"}`, startRel, "system.process_observed", d, p, p === "post_action" ? "investigation" : "ambient");
      }
      for (const item of snapshot.network.filter(n=>n.protocol === "tcp" && n.destinationPort === 443 && n.state === "ESTABLISHED")) {
        const tuple=[item.protocol,item.localAddress,item.localPort,item.destinationIp,item.destinationPort].join("|");
        const preExisting = baselineKeys.has(tuple) || !isPost || !anchor || observedAt < caseStart + anchor.timestampMs;
        const targetSocket = safeAddresses.includes(item.destinationIp);
        const p:NormalizedEvent["phase"] = preExisting ? "baseline" : phase(observedAt,caseStart+anchor!.timestampMs);
        const scope:NormalizedEvent["trafficScope"] = p === "post_action" && targetSocket ? "investigation" : "ambient";
        recordSystemEvent(`system-socket-${item.localPort}-${item.destinationIp}-${isPost?"post":"baseline"}`,toRelative(observedAt),"system.socket_observed",{protocol:item.protocol,localAddress:item.localAddress,localPort:String(item.localPort),destinationIp:item.destinationIp,destinationPort:String(item.destinationPort),state:item.state,...(item.pid?{pid:String(item.pid)}:{})},p,scope);
      }
    };
    snapshotEvents(baselineSnapshot,false);
    snapshotEvents(postActionSnapshot,true);
    for (const event of telemetry.events) {
      const id = `system-${event.action}-${event.timestampMs}-${events.length}`;
      const absolute = event.action === "system.process_started" && event.details.startTimeMs ? Number(event.details.startTimeMs) : telemetryStartedAt + event.timestampMs;
      const p = phase(absolute, anchor ? caseStart + anchor.timestampMs : undefined);
      const isTargetSocket = event.action === "system.network_connection" && safeAddresses.includes(event.details.destinationIp ?? "") && event.details.destinationPort === "443";
      const scope:NormalizedEvent["trafficScope"] = p === "provisioning" ? "provisioning" : isTargetSocket && p === "post_action" ? "investigation" : "ambient";
      const normalizedAction = event.action === "system.network_connection" ? "system.socket_observed" : event.action;
      recordSystemEvent(id,toRelative(absolute),normalizedAction,event.details,p,scope);
    }
    for(const event of streamResult?.events??[]){
      const priorEvent=events.find(existing=>existing.id===event.id);
      if(priorEvent){priorEvent.timestampMs=event.timestampMs;priorEvent.phase=event.phase;priorEvent.trafficScope=event.trafficScope;priorEvent.details={...priorEvent.details,...event.details}}
      else events.push(event);
      const type:EvidenceNode["type"]|undefined=event.source==="agent"?"AGENT_ACTION":event.action==="browser.navigation"?"BROWSER_NAVIGATION":event.action==="network.request"?"NETWORK_REQUEST":event.action.includes("socket")?"SOCKET_OBSERVATION":event.action.includes("process")?"PROCESS_OBSERVATION":undefined;
      if(type){const existing=nodes.find(node=>node.eventId===event.id);const next={id:`node-${event.id}`,type,eventId:event.id,timestampMs:event.timestampMs,source:event.source==="system"?"procfs+socket-table":event.source,details:event.details,phase:event.phase??"unknown",trafficScope:event.trafficScope??"unknown"};if(existing)Object.assign(existing,next);else nodes.push(next)}
    }
    events.sort((a,b)=>a.timestampMs-b.timestampMs);
    const socketNodes = nodes.filter((node)=>node.type === "SOCKET_OBSERVATION");
    const attribution = anchor ? evaluateActionToEffectHypothesis({events,anchor,targetUrl:END_TO_END_CHAIN.safeUrl,resolvedAddresses:safeAddresses}) : undefined;
    const matchingSocket = attribution?.sourceEventIds.map(id=>nodes.find(n=>n.eventId===id)).find(n=>n?.type==="SOCKET_OBSERVATION");
    const processNode = attribution?.sourceEventIds.map(id=>nodes.find(n=>n.eventId===id)).find(n=>n?.type==="PROCESS_OBSERVATION");
    const streamedIds=new Set((streamResult?.events??[]).map(event=>event.id));
    const selectedNodes = nodes.filter(node => node.type === "AGENT_ACTION" || node.type === "BROWSER_NAVIGATION" || node.type === "NETWORK_REQUEST" || node.type === "PROCESS_OBSERVATION" || node.eventId === matchingSocket?.eventId || node.phase === "baseline" || streamedIds.has(node.eventId));
    const chainNodes = selectedNodes.sort((a,b)=>a.timestampMs-b.timestampMs);
    const found = Boolean(agent && navEvent && requestEvent && attribution?.status === "supported" && (matchingSocket || processNode));
    const stageKeys = ["agent_action","post_action_browser_navigation","post_action_network_request","post_action_socket_or_process"];
    const observedStages = [Boolean(agent),Boolean(navEvent?.phase === "post_action"),Boolean(requestEvent?.phase === "post_action"),Boolean(matchingSocket||processNode)].flatMap((v,i)=>v?[stageKeys[i]]:[]);
    const missingStages = stageKeys.filter((_,i)=>![Boolean(agent),Boolean(navEvent?.phase === "post_action"),Boolean(requestEvent?.phase === "post_action"),Boolean(matchingSocket||processNode)][i]);
    const timeline: Array<{id:string;step:string;timestampMs:number;phase?:NonNullable<NormalizedEvent["phase"]>;trafficScope?:NonNullable<NormalizedEvent["trafficScope"]>}> = [
      { id: "event-investigation-start", step: "investigation started", timestampMs: 0,phase:"setup" as const,trafficScope:"unknown" as const },
      ...events.filter(event=>event.phase === "provisioning" || event.phase === "setup").map(event=>({id:event.id,step:event.action.replaceAll("_"," "),timestampMs:event.timestampMs,phase:event.phase,trafficScope:event.trafficScope})),
      ...(Boolean(liveResult.fixtureLoaded) ? [{ id: "event-fixture-loaded", step: "fixture loaded · baseline checkpoint", timestampMs: toRelative(liveResult.baselineObservedAt ?? liveResult.fixtureLoadedAt),phase:"baseline" as const,trafficScope:"investigation" as const }] : []),
      ...chainNodes.filter(node=>!streamedIds.has(node.eventId)).map((node)=>({id:node.eventId,step:node.type.toLowerCase().replaceAll("_"," "),timestampMs:node.timestampMs,phase:node.phase,trafficScope:node.trafficScope})),
      ...(streamResult?.events??[]).map(event=>({id:event.id,step:event.source==="agent"?"AGENT ACTION":event.phase==="baseline"?"PRE-EXISTING":event.trafficScope==="ambient"||event.phase==="ambient"?"AMBIENT":event.phase==="post_action"?"POST-ACTION":event.action,timestampMs:event.timestampMs,phase:event.phase,trafficScope:event.trafficScope})),
      ...events.filter((event)=>(event.source==="agent"&&event.action==="agent.get_page_text")||event.action==="agent.navigation_blocked").map((event)=>({id:event.id,step:event.action,timestampMs:event.timestampMs})),
    ].sort((a,b)=>a.timestampMs-b.timestampMs);
    const graph = { nodes: chainNodes.map((node)=>({id:node.id,type:({AGENT_ACTION:"AGENT_ACTION",BROWSER_NAVIGATION:"PAGE",NETWORK_REQUEST:"BROWSER_REQUEST",SOCKET_OBSERVATION:"SOCKET",PROCESS_OBSERVATION:"PROCESS"} as const)[node.type],label:`${node.type}: ${node.eventId}`,details:{eventId:node.eventId,source:node.source,phase:node.phase,trafficScope:node.trafficScope,...node.details}})), edges: [] as Array<{id:string;sourceId:string;targetId:string;type:ChainRelationship;confidence:"high"|"medium"|"low";label:string}>, truncated:false };
    graph.edges = buildObservedChainEdges(chainNodes,safeAddresses,anchor?.timestampMs ?? Number.POSITIVE_INFINITY);
    const streamNodeByEvent=new Map(chainNodes.map(node=>[node.eventId,node.id]));
    for(const relationship of streamResult?.relationships??[]){const sourceId=streamNodeByEvent.get(relationship.sourceEventId),targetId=streamNodeByEvent.get(relationship.targetEventId);if(sourceId&&targetId&&graph.edges.length<250&&!graph.edges.some(edge=>edge.sourceId===sourceId&&edge.targetId===targetId&&edge.type===relationship.type))graph.edges.push({id:relationship.id,sourceId,targetId,type:relationship.type,confidence:relationship.type==="post_action_observation"?"medium":"low",label:relationship.label})}
    const graphForHypotheses = { nodes:[], edges:[], truncated:false };
    const chainHypothesis = mode === "follow-safe" && anchor && attribution ? [{ id:"hypothesis-e2e-chain",type:"multi_stage_attack_chain" as const,title:`${attribution.status === "supported" ? "Supported" : "Insufficient evidence"} action-to-effect hypothesis`,confidence:attribution.confidence,status:attribution.status,evidenceClass:attribution.status!=="supported"?"INSUFFICIENT_EVIDENCE" as const:attribution.sourceEventIds.some(id=>events.find(event=>event.id===id)?.action==="system.socket_observed")?"ACTION_EFFECT_SUPPORTED" as const:"DIFFERENTIAL_SUPPORTED" as const,sourceEvents:attribution.sourceEventIds.length?attribution.sourceEventIds:[anchor.id],evidenceNodeIds:(attribution.sourceEventIds.length?attribution.sourceEventIds:[anchor.id]).map(id=>nodes.find(n=>n.eventId===id)?.id??`node-${id}`),explanation:attribution.explanation,limitations:attribution.limitations }] : [];
    const linked = linkHypothesesToEvidenceGraph(graphForHypotheses, events, chainHypothesis);
    const evidenceGraph = { nodes: [...graph.nodes,...linked.evidenceGraph.nodes.filter((node)=>!graph.nodes.some((present)=>present.id===node.id))], edges: [...graph.edges,...linked.evidenceGraph.edges.filter((edge)=>!graph.edges.some((present)=>present.id===edge.id))], truncated:false };
    const allHypotheses = chainHypothesis.length ? linked.hypotheses : [];
    const cleanupAt = Date.now();
    await sandbox.stop(); sandboxStopped = true;
    const cleanupTimestamp = toRelative(cleanupAt);
    const cleanupEvent:NormalizedEvent = {id:"event-sandbox-cleanup",timestampMs:cleanupTimestamp,source:"system",action:"sandbox_cleanup_complete",details:{},phase:"cleanup",trafficScope:"unknown"};
    events.push(cleanupEvent);
    timeline.push({id:cleanupEvent.id,step:"sandbox cleanup complete",timestampMs:cleanupTimestamp,phase:"cleanup",trafficScope:"unknown"});
    timeline.sort((a,b)=>a.timestampMs-b.timestampMs);
    const evidenceChain = { nodes: chainNodes, edges: graph.edges.map((edge)=>({...edge,sourceEventId:graph.nodes.find(n=>n.id===edge.sourceId)?.details?.eventId,targetEventId:graph.nodes.find(n=>n.id===edge.targetId)?.details?.eventId})), timeline };
    const target = mode === "ignore" ? END_TO_END_CHAIN.fixtureUrl : mode === "blocked" ? "https://example.invalid/" : END_TO_END_CHAIN.safeUrl;
    return InvestigationCaseSchema.parse({ schemaVersion:"0.1",caseId,createdAt:new Date(caseStart).toISOString(),target:{submittedUrl:target,...(typeof liveResult.finalUrl === "string"&&liveResult.finalUrl?{finalUrl:liveResult.finalUrl}:{})},status:"completed",summary:`${END_TO_END_CHAIN.name} (${mode}) ${attribution?.status === "supported" ? "has a supported bounded action-to-effect hypothesis" : "completed without sufficient post-action system evidence"}.`,redirectChain:[],indicators:[],browser:{browser:"chromium",...(typeof liveResult.pageTitle==="string"?{pageTitle:liveResult.pageTitle}:{}),...(typeof liveResult.finalUrl==="string"&&liveResult.finalUrl?{finalUrl:liveResult.finalUrl}:{}),...(typeof liveResult.httpStatus==="number"?{httpStatus:liveResult.httpStatus}:{}),screenshotAvailable:false,domCaptured:false,domTruncated:false,domMutations:0,redirects:[],console:[],pageErrors:[],requests:reqs.map((r)=>({id:String(r.id),timestampMs:toRelative(r.timestamp),method:String(r.method),url:String(r.url),resourceType:String(r.resourceType)})),responses:[],failedRequests:[],iframes:[],downloads:[],pageEvents:navs.map((n)=>({type:"navigation",url:String(n.url),timestampMs:toRelative(n.timestamp)}))},experiment:{mode:"agent",task:END_TO_END_CHAIN.purpose,id:END_TO_END_CHAIN.id,name:END_TO_END_CHAIN.name,version:END_TO_END_CHAIN.version,fixtureUrl:END_TO_END_CHAIN.fixtureUrl,expectedBehavior:`${mode} deterministic mode`},agent:{task:END_TO_END_CHAIN.purpose,provider:"deterministic-fallback",actions:agent?[{id:"agent-action-1",timestampMs:agent.timestampMs,tool:"navigate",input:{url:agent.details.url,synthetic_agent_action:mode==="follow-safe"},result:{status:mode==="blocked"?"rejected":"completed",...(mode==="blocked"?{reason:"destination_not_allowed"}:{})}}]:[{id:"agent-ignore",timestampMs:toRelative(liveResult.startedAt),tool:"get_page_text",input:{},result:{status:"completed"}}],actionCount:1,completed:true,summary:mode==="ignore"?"Observed the synthetic instruction without navigating.":mode==="blocked"?"Rejected the unsafe destination before browser navigation.":"Followed a fixed synthetic action to the safe example.com destination."},hypotheses:allHypotheses,hypothesisMetadata:{generatedAt:new Date().toISOString(),engineVersion:ATTRIBUTION_METHODOLOGY_VERSION,categories:{OBSERVATION_SUPPORTED:false,DIFFERENTIAL_SUPPORTED:allHypotheses.some(item=>item.evidenceClass==="DIFFERENTIAL_SUPPORTED"),ACTION_EFFECT_SUPPORTED:allHypotheses.some(item=>item.evidenceClass==="ACTION_EFFECT_SUPPORTED"),INSUFFICIENT_EVIDENCE:!allHypotheses.some(item=>item.evidenceClass==="ACTION_EFFECT_SUPPORTED")}},telemetry:{...telemetry,mode:"stream",eventCount:streamResult?.eventCount??0,truncated:streamResult?.truncated??false,streamEvents:streamResult?.events??[],streamRelationships:streamResult?.relationships??[],streamProcesses:streamResult?.processes??[],streamSockets:streamResult?.sockets??[]},telemetryMode:"stream",events,evidenceGraph,experimentSummary:{mode,synthetic:true,chainComplete:mode==="follow-safe"&&found,observedStages,missingStages,causalLanguage:attribution?.status??"observed",hypothesisStatus:attribution?.status,limitation:attribution?.limitations.join(" ")??"No action anchor was recorded."},attribution:{actionAnchors:anchor?[anchor]:[],attributionWindowMs:POST_ACTION_WINDOW_MS,methodologyVersion:ATTRIBUTION_METHODOLOGY_VERSION,provisioningExcluded:true},evidenceChain,observations:timeline.map((item)=>({id:item.id,timestampMs:item.timestampMs,category:"system" as const,action:item.step})),provenance:{engineVersion:ATTRIBUTION_METHODOLOGY_VERSION,sandbox:"Vercel Firecracker Sandbox"},raw:{stdout:"KRAXX_SANDBOX_OK",stderr:""}});
  } finally {
    if (provider && !providerStopped) await provider.stop().catch(()=>undefined);
    if (!sandboxStopped) await sandbox.stop().catch(()=>undefined);
  }
}
