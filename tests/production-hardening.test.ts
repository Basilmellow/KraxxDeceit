import test from 'node:test';
import { VERIFIED_SANDBOX_IMAGE } from '../lib/sandbox-image';
import assert from 'node:assert/strict';
import { Sandbox } from '@vercel/sandbox';
import { LocalAdmission, RedisAdmission, admission, clientIdentity } from '../lib/investigation-admission';
import { LIMITS, DEMO_URL, safeCase, PROVISIONING_POLICY, investigationPolicy, internalRoutesEnabled } from '../lib/production-policy';
import { publicInvestigation, readBody } from '../lib/public-investigation';
import { investigateUrl } from '../lib/engine';
import { validatePublicHttpUrl, FORBIDDEN_IPV6_SUBNETS } from '../lib/url-safety';
import type { InvestigationCase } from '../lib/case-schema';
import { GET } from '../app/api/health/route';

function env(values: Record<string,string|undefined>) {
  const before=Object.fromEntries(Object.keys(values).map(k=>[k,process.env[k]]));
  for(const [k,v] of Object.entries(values)) { if(v===undefined)delete process.env[k];else process.env[k]=v; }
  return ()=>{for(const [k,v] of Object.entries(before)){if(v===undefined)delete process.env[k];else process.env[k]=v;}};
}
const req=(body:unknown={},path='demo')=>new Request('https://kraxxdeceit.kraxxsec.com/api/'+path,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});
const fakeCase=()=>({caseId:'CASE-TEST',status:'completed',target:{submittedUrl:DEMO_URL},events:[],raw:{stdout:'discard me',stderr:''},agent:{provider:'openrouter',model:'openrouter/free'},modelExecution:{actualModel:'test-model'}} as unknown as InvestigationCase);

test('rate limit allows three admissions, rejects fourth, and resets after the window',async()=>{
  let now=0;const limiter=new LocalAdmission(()=>now);
  for(let i=0;i<3;i++)await (await limiter.acquire('a'))();
  await assert.rejects(limiter.acquire('a'),{status:429});now=LIMITS.windowMs;await (await limiter.acquire('a'))();
});
test('concurrency limits enforce one per client and three globally; release is idempotent',async()=>{
  const limiter=new LocalAdmission();const releases=[];
  releases.push(await limiter.acquire('a'));await assert.rejects(limiter.acquire('a'),{status:429});
  releases.push(await limiter.acquire('b'));releases.push(await limiter.acquire('c'));await assert.rejects(limiter.acquire('d'),{status:429});
  await releases[0]();await releases[0]();await (await limiter.acquire('d'))();await Promise.all(releases.map(r=>r()));
});
test('expired leases recover admission after crashed work',async()=>{let now=0;const limiter=new LocalAdmission(()=>now);await limiter.acquire('a');now=LIMITS.leaseMs+1;await (await limiter.acquire('a'))();});
test('shared admission uses atomic Redis Lua and fails closed on backend errors',async()=>{
  const commands:unknown[][]=[];
  const transport=(async(_url:unknown,options:RequestInit)=>{commands.push(JSON.parse(String(options.body)));return Response.json({result:0});}) as typeof fetch;
  const store=new RedisAdmission('https://redis.example','fake-credential',transport);await (await store.acquire('hash'))();
  assert.equal(commands.length,2);assert.equal(commands[0][0],'EVAL');assert.match(String(commands[0][1]),/ZCARD/);assert.match(String(commands[0][1]),/TIME/);assert.match(String(commands[1][1]),/ZREM/);
  const failed=new RedisAdmission('https://redis.example','fake-credential',(async()=>{throw new Error('Bearer fake-credential');}) as typeof fetch);
  await assert.rejects(failed.acquire('hash'),{status:503,message:'Investigation protection is unavailable. Try again later.'});
});
test('Redis denial and unexpected results do not admit work',async()=>{
  for(const result of [1,2,'unexpected']){const store=new RedisAdmission('https://redis.example','fake',(async()=>Response.json({result})) as typeof fetch);await assert.rejects(store.acquire('hash'),{status:result==='unexpected'?503:429});}
});
test('verification Redis namespace isolates every acquire/release key and rejects key-slot injection',async()=>{
  const commands:unknown[][]=[];
  const transport=(async(_url:unknown,options:RequestInit)=>{commands.push(JSON.parse(String(options.body)));return Response.json({result:0});}) as typeof fetch;
  const store=new RedisAdmission('https://redis.example','fake',transport,'kraxx_verify_test');
  await (await store.acquire('client'))();
  assert.ok(commands[0].slice(3,6).every(k=>String(k).startsWith('kraxx_verify_test:{admission}:')));
  assert.ok(commands[1].slice(3,5).every(k=>String(k).startsWith('kraxx_verify_test:{admission}:')));
  assert.throws(()=>new RedisAdmission('https://redis.example','fake',transport,'kraxx:{production}'),/Invalid admission namespace/);
});
test('production refuses memory-only admission and ignores untrusted forwarding headers locally',()=>{
  const restore=env({NODE_ENV:'production',UPSTASH_REDIS_REST_URL:undefined,UPSTASH_REDIS_REST_TOKEN:undefined,VERCEL:undefined});
  try {assert.throws(()=>admission(),{status:503});assert.equal(clientIdentity(req()),clientIdentity(new Request('https://site',{headers:{'x-forwarded-for':'8.8.8.8','x-vercel-forwarded-for':'1.1.1.1'}})));}finally{restore();}
});
test('URL safety rejects localhost, private/mapped IPv6, metadata, link-local and forbidden schemes',async()=>{
  for(const url of ['http://localhost','http://127.1','http://127.255.1.1','http://10.2.3.4','http://172.16.0.1','http://192.168.1.2','http://169.254.169.254','http://[::ffff:127.0.0.1]','http://[::ffff:192.168.1.1]','http://[::1]','http://[fe80::1]','http://[fc00::1]','http://metadata.google.internal','file:///etc/passwd','ftp://8.8.8.8','https://user:password@8.8.8.8'])await assert.rejects(validatePublicHttpUrl(url));
  assert.equal((await validatePublicHttpUrl('https://8.8.8.8')).hostname,'8.8.8.8');
});
test('production URL safety does not accept development fixture bypass',async()=>{const restore=env({NODE_ENV:'production'});try{await assert.rejects(validatePublicHttpUrl('http://localhost:3000/research-fixtures/agent-injection-basic.html'));}finally{restore();}});
test('egress policies have explicit provisioning hosts, target-only investigation and private denies',()=>{
  assert.ok(!PROVISIONING_POLICY.allow.includes('*'));assert.ok(!PROVISIONING_POLICY.allow.includes('openrouter.ai'));
  const policy=investigationPolicy('example.com');assert.deepEqual(policy.allow,['example.com']);assert.ok(FORBIDDEN_IPV6_SUBNETS.includes('::ffff:0:0/96'));assert.ok(policy.subnets.deny.includes('169.254.0.0/16'));
});
test('all internal routes reject production, including enabled authenticated probe',async()=>{
  const restore=env({NODE_ENV:'production',KRAXX_INTERNAL_PROBE_ENABLED:'true',KRAXX_INTERNAL_PROBE_TOKEN:'test-probe-token'});
  try{
    assert.equal(internalRoutesEnabled(),false);
    const routes=await Promise.all([import('../app/api/internal/experiment/route'),import('../app/api/internal/real-agent-experiment/route'),import('../app/api/internal/end-to-end-chain/route'),import('../app/api/internal/probe-sandbox/route')]);
    for(const route of routes){const response=await route.POST(new Request('https://site/api/internal/test',{method:'POST',headers:{authorization:'Bearer test-probe-token'},body:'{}'}));assert.equal(response.status,404);}
  }finally{restore();}
});
test('case sanitization removes configured secrets, bearer credentials, raw logs and paths',()=>{
  const secret='FAKE-TEST-SECRET-ONLY';const restore=env({OPENROUTER_API_KEY:secret});
  try { const output=JSON.stringify(safeCase({text:secret+' Bearer abc /tmp/private/file C:\\Users\\private\\file',authorization:'sensitive',raw:{stdout:secret,stderr:'error'}}));assert.ok(!output.includes(secret));assert.ok(!output.includes('/tmp/private'));assert.ok(!output.includes('private'));assert.ok(!output.includes('Bearer abc'));assert.ok(!output.includes('sensitive')); }finally{restore();}
});
test('case-size and normalized-event limits reject oversized results',()=>{assert.throws(()=>safeCase({data:'x'.repeat(LIMITS.caseBytes)}),{status:413});assert.throws(()=>safeCase({events:Array(LIMITS.events+1).fill({})}),{status:413});});
test('demo endpoint ignores model input selection and accepts only fixed empty request',async()=>{
  const restore=env({NODE_ENV:'development'});try{
    let calls=0;const run=(async(url,fixture,options)=>{calls++;assert.equal(url,DEMO_URL);assert.equal(fixture?.fixtureUrl,DEMO_URL);assert.equal(options?.demo,true);options?.onSandboxCreated?.();return fakeCase();}) as typeof investigateUrl;
    const logs:string[]=[];const deps={admission:new LocalAdmission(),run,log:(s:string)=>logs.push(s)};
    assert.equal((await publicInvestigation(req({url:'https://evil.example'}),true,deps)).status,400);assert.equal(calls,0);
    const response=await publicInvestigation(req(),true,deps);assert.equal(response.status,200);const data=await response.json();assert.equal(data.caseId,'CASE-TEST');assert.equal(calls,1);assert.equal(data.raw.stdout,'');
    const log=JSON.parse(logs.at(-1)!);assert.equal(log.sandboxCreated,true);assert.equal(log.actualModel,'test-model');assert.deepEqual(Object.keys(log).sort(),['actualModel','caseId','duration','provider','requestId','sandboxCreated','status']);
  }finally{restore();}
});
test('public error response and log never include thrown secrets or stacks',async()=>{
  const secret='FAKE-PRIVATE-TEST-KEY';const restore=env({NODE_ENV:'development',OPENROUTER_API_KEY:secret});try{
    const logs:string[]=[];const response=await publicInvestigation(req(),true,{admission:new LocalAdmission(),run:(async()=>{throw new Error(secret+' /tmp/private Bearer private');}) as typeof investigateUrl,log:s=>logs.push(s)});
    assert.equal(response.status,500);const output=await response.text()+logs.join('');assert.ok(!output.includes(secret));assert.ok(!output.includes('private'));assert.ok(!output.includes('stack'));
  }finally{restore();}
});
test('production public URL endpoint defaults to disabled',async()=>{const restore=env({NODE_ENV:'production',KRAXX_PUBLIC_INVESTIGATIONS_ENABLED:undefined});try{assert.equal((await publicInvestigation(req({url:'https://example.com'},'investigate'),false,{admission:new LocalAdmission(),run:(async()=>{throw new Error('must not run');}) as typeof investigateUrl,log:()=>{}})).status,403);}finally{restore();}});
test('cross-origin requests and oversized bodies are rejected before execution',async()=>{
  const restore=env({NODE_ENV:'development'});const deps={admission:new LocalAdmission(),run:(async()=>{throw new Error('must not run');}) as typeof investigateUrl,log:()=>{}};
  try {const request=req();request.headers.set('origin','https://untrusted.example');assert.equal((await publicInvestigation(request,true,deps)).status,403);await assert.rejects(readBody(req({data:'x'.repeat(5000)})),{status:413});}finally{restore();}
});
test('body reading respects cancellation',async()=>{const controller=new AbortController();controller.abort();await assert.rejects(readBody(req(),controller.signal),{status:504});});
test('health exposes only liveness and version',async()=>{const response=GET();assert.equal(response.status,200);assert.deepEqual(await response.json(),{status:'ok',version:'2.0.0'});assert.equal(response.headers.get('cache-control'),'no-store');});
test('engine uses disposable bounded sandbox and stops after failed health gate',async()=>{
  const restore=env({NODE_ENV:'development',VERCEL_OIDC_TOKEN:'FAKE-OIDC-TEST-ONLY'});const original=Sandbox.create;let stopped=false;
  Sandbox.create=(async(options)=>{assert.equal(options?.persistent,false);assert.equal(options?.timeout,LIMITS.sandboxMs);assert.deepEqual(options?.networkPolicy,investigationPolicy('8.8.8.8'));assert.equal(options?.image,VERIFIED_SANDBOX_IMAGE);return {runCommand:async()=>({exitCode:1,stdout:async()=>'',stderr:async()=>''}),stop:async()=>{stopped=true;}} as unknown as Sandbox;}) as typeof Sandbox.create;
  try {await assert.rejects(investigateUrl('https://8.8.8.8'));assert.equal(stopped,true);}finally{Sandbox.create=original;restore();}
});

test('DNS safety rejects mixed or private answers without contacting a target',async()=>{
  const resolver=async()=>[{address:'8.8.8.8',family:4},{address:'10.0.0.1',family:4}];
  await assert.rejects(validatePublicHttpUrl('https://public-looking.com',resolver));
  await assert.rejects(validatePublicHttpUrl('https://public-looking.com',async()=>[{address:'::ffff:7f00:1',family:6}]));
  await assert.rejects(validatePublicHttpUrl('https://8.8.8.8:8080'));
});
test('request abort returns a timeout while retaining concurrency until work settles',async()=>{
  const restore=env({NODE_ENV:'development'});const limiter=new LocalAdmission();const controller=new AbortController();let finish!:(value:InvestigationCase)=>void;
  const work=new Promise<InvestigationCase>(resolve=>{finish=resolve;});
  const run=(async()=>{controller.abort();return work;}) as typeof investigateUrl;
  const request=new Request('https://site/api/demo',{method:'POST',body:'{}',signal:controller.signal});
  try {
    const response=await publicInvestigation(request,true,{admission:limiter,run,log:()=>{}});assert.equal(response.status,504);
    await assert.rejects(limiter.acquire(clientIdentity(request)),{status:429});
    finish(fakeCase());await new Promise(resolve=>setTimeout(resolve,0));await (await limiter.acquire(clientIdentity(request)))();
  }finally{finish(fakeCase());restore();}
});
