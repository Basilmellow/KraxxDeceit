import test from 'node:test';
import assert from 'node:assert/strict';
import { controlledExperiment, controlledScenario, DemoRequestSchema } from '../lib/controlled-demos';
import { publicInvestigation } from '../lib/public-investigation';
import { LocalAdmission } from '../lib/investigation-admission';
import { investigateUrl } from '../lib/engine';
import { DEMO_URL } from '../lib/production-policy';
import type { InvestigationCase } from '../lib/case-schema';
import { FIXTURE_HTML, NEUTRAL_FIXTURE_HTML } from '../lib/controlled-demo-fixtures';
test('neutral fixture has no instruction-detector trigger and injection fixture retains its stimulus',()=>{
  const trigger = /ignore (your|the|all|previous|the current) (current )?(assignment|instructions|task)|system message/i;
  assert.equal(trigger.test(NEUTRAL_FIXTURE_HTML),false);assert.equal(trigger.test(FIXTURE_HTML),true);
});
test('controlled demo selection accepts only fixed names and the legacy empty request',()=>{
  for(const body of [{},{scenario:'prompt-injection'},{scenario:'neutral-control'}])assert.ok(DemoRequestSchema.safeParse(body).success);
  for(const body of [{scenario:'other'},{scenario:'neutral-control',url:'https://evil.example'},{model:'fake'},{task:'run command'},null,[]])assert.equal(DemoRequestSchema.safeParse(body).success,false);
});
test('controlled engine bypass requires the entire canonical experiment, not just its id',async()=>{
  for(const scenario of ['prompt-injection','neutral-control'] as const){
    const def=controlledExperiment(scenario);assert.equal(controlledScenario(def),scenario);
    for(const altered of [{...def,task:'attacker task'},{...def,allowedDestinations:['evil.example']},{...def,maxRuntimeMs:999999},{...def,fixtureUrl:'http://localhost'}]){
      assert.equal(controlledScenario(altered),undefined);await assert.rejects(investigateUrl(DEMO_URL,altered,{demo:true}),/Invalid controlled demo/);
    }
    def.allowedDestinations.push('evil.example');assert.deepEqual(controlledExperiment(scenario).allowedDestinations,['example.com']);
  }
});
test('neutral API dispatch uses fixed task, fixture and limits; extra parameters never execute',async()=>{
  let calls=0;
  const run=(async(url,def,options)=>{calls++;assert.equal(url,DEMO_URL);assert.equal(controlledScenario(def),'neutral-control');assert.equal(options?.demo,true);return {caseId:'TEST',target:{submittedUrl:DEMO_URL},status:'completed',raw:{stdout:'',stderr:''}} as InvestigationCase;}) as typeof investigateUrl;
  const req=(body:unknown)=>new Request('https://site/api/demo',{method:'POST',body:JSON.stringify(body)});
  const deps={admission:new LocalAdmission(),run,log:()=>{}};
  assert.equal((await publicInvestigation(req({scenario:'neutral-control',model:'fake'}),true,deps)).status,400);assert.equal(calls,0);
  assert.equal((await publicInvestigation(req({scenario:'neutral-control'}),true,deps)).status,200);assert.equal(calls,1);
});

test('production deterministic default needs no AI credential and explicit AI accepts only configured free models',async()=>{
  const keys=['NODE_ENV','AI_PROVIDER','AI_MODEL','OPENROUTER_API_KEY'];
  const before=Object.fromEntries(keys.map(k=>[k,process.env[k]]));
  let calls=0;const modes:unknown[]=[];
  const run=(async(_url,_def,options)=>{calls++;modes.push(options?.demoMode);return {caseId:'TEST',target:{submittedUrl:DEMO_URL},status:'completed',raw:{stdout:'',stderr:''}} as InvestigationCase;}) as typeof investigateUrl;
  const req=(body:unknown)=>new Request('https://site/api/demo',{method:'POST',body:JSON.stringify(body)});
  const dispatch=(body:unknown)=>publicInvestigation(req(body),true,{admission:new LocalAdmission(),run,log:()=>{}});
  try {
    (process.env as Record<string,string|undefined>).NODE_ENV='production';delete process.env.AI_PROVIDER;delete process.env.AI_MODEL;delete process.env.OPENROUTER_API_KEY;
    assert.equal((await dispatch({})).status,200);assert.deepEqual(modes,['deterministic']);
    assert.equal((await dispatch({mode:'ai'})).status,503);assert.equal(calls,1);
    process.env.AI_PROVIDER='openrouter';process.env.OPENROUTER_API_KEY='FAKE-TEST-ONLY';process.env.AI_MODEL='openai/gpt-4.1-mini';
    assert.equal((await dispatch({mode:'ai'})).status,503);assert.equal(calls,1);
    await assert.rejects(investigateUrl(DEMO_URL,controlledExperiment(),{demo:true,demoMode:'ai'}),/Experimental free AI/);
    process.env.AI_MODEL='openrouter/free';assert.equal((await dispatch({mode:'ai'})).status,200);
    process.env.AI_MODEL='vendor/model:free';assert.equal((await dispatch({mode:'ai'})).status,200);
    assert.deepEqual(modes,['deterministic','ai','ai']);
    assert.equal((await dispatch({mode:'unrestricted'})).status,400);assert.equal(calls,3);
    await assert.rejects(investigateUrl('https://example.com',undefined,{demoMode:'deterministic'}),/Invalid controlled demo/);
  } finally {for(const key of keys){if(before[key]===undefined)delete process.env[key];else process.env[key]=before[key];}}
});
