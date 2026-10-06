import { loadEnvConfig } from '@next/env';
import { randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { RedisAdmission } from '../lib/investigation-admission';
import { publicInvestigation } from '../lib/public-investigation';
import type { investigateUrl } from '../lib/engine';

let stage = 'configuration';
async function main() {
  if(!process.argv.includes('--run'))throw new Error('Pass --run for isolated live Redis checks.');
  loadEnvConfig(process.cwd());
  const url=process.env.UPSTASH_REDIS_REST_URL,key=process.env.UPSTASH_REDIS_REST_TOKEN;
  if(!url||!key||key==='[SENSITIVE]'||new URL(url).protocol!=='https:')throw new Error('Configure staging Redis REST credentials in .env.local.');
  const namespace='kraxx_verify_'+randomUUID().replaceAll('-','').slice(0,16),prefix=namespace+':{admission}:';
  const clients=['a','b','c','d','expired'];
  const keys=[prefix+'global',...clients.map(c=>prefix+'client:'+c),...clients.map(c=>prefix+'rate:'+c)];
  const releases:Array<()=>Promise<void>>=[];
  async function command(args:(string|number)[]) {
    const r=await fetch(url!,{method:'POST',headers:{authorization:'Bearer '+key,'content-type':'application/json'},body:JSON.stringify(args),signal:AbortSignal.timeout(5000)});
    if(!r.ok)throw new Error('Redis request failed.');const d=await r.json() as {result:unknown;error?:unknown};if(d.error)throw new Error('Redis command failed.');return d.result;
  }
  const store=()=>new RedisAdmission(url,key,fetch,namespace);
  try {
    stage = 'first-acquire';
    releases.push(await store().acquire('a'));
    await assert.rejects(store().acquire('a'),{status:429});
    stage = 'concurrent-acquire';
    const races=await Promise.allSettled(['b','c','d'].map(c=>store().acquire(c)));
    assert.equal(races.filter(r=>r.status==='fulfilled').length,2);assert.equal(races.filter(r=>r.status==='rejected'&&r.reason.status===429).length,1);
    for(const r of races)if(r.status==='fulfilled')releases.push(r.value);
    assert.equal(await command(['ZCARD',prefix+'global']),3);
    stage = 'release';
    await Promise.all(releases.map(release=>release()));assert.equal(await command(['ZCARD',prefix+'global']),0);
    // Existing a admission counts once; two further successful admissions reach its window limit.
    stage = 'rate-window';
    for(let i=0;i<2;i++)await (await store().acquire('a'))();
    await assert.rejects(store().acquire('a'),{status:429});
    stage = 'expired-lease';
    await command(['ZADD',prefix+'global',0,'expired-test-lease']);await command(['ZADD',prefix+'client:expired',0,'expired-test-lease']);
    await (await store().acquire('expired'))();assert.equal(await command(['ZCARD',prefix+'global']),0);
    stage = 'simulated-outage';
    let executions=0;
    const unavailable=new RedisAdmission(url,key,(async()=>{throw new Error('simulated transport outage');}) as typeof fetch,namespace);
    const response=await publicInvestigation(new Request('https://site/api/demo',{method:'POST',body:'{}'}),true,{admission:unavailable,run:(async()=>{executions++;throw new Error('should never run');}) as typeof investigateUrl,log:()=>{}});
    assert.equal(response.status,503);assert.equal(executions,0);
    const report={scope:'staging-Redis-isolated-keys-no-sandbox',namespace,atomicGlobalConcurrency:'PASS',perClientConcurrency:'PASS',rateWindow:'PASS',expiredLeaseRecovery:'PASS',release:'PASS',simulatedBackendOutage:'PASS',outageComputeExecutions:executions};
    console.log(JSON.stringify(report));writeFileSync('.codex-localappdata/qa/v1-admission.json',JSON.stringify(report,null,2));
  } finally {
    await Promise.allSettled(releases.map(release=>release()));
    // Delete only the exact keys belonging to this freshly generated verification namespace.
    assert.ok(keys.every(k=>k.startsWith(prefix)));await command(['DEL',...keys]);
    assert.equal(await command(['EXISTS',...keys]),0);console.log(JSON.stringify({isolatedTestKeyCleanup:'PASS'}));
  }
}
void main().catch(()=>{console.error('Admission verification failed at '+stage+'. No credentials or Redis bodies are printed.');process.exitCode=1;});
