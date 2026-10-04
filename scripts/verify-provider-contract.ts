import { loadEnvConfig } from '@next/env';
import { OpenRouterAgentProvider } from '../lib/agent/provider';
import { runBrowserAgent } from '../lib/agent/browser-agent';
import { DEMO_SCENARIOS } from '../lib/controlled-demo-catalog';
import { controlledExperiment } from '../lib/controlled-demos';
import { FIXTURE_HTML, NEUTRAL_FIXTURE_HTML } from '../lib/controlled-demo-fixtures';
import { writeFileSync } from 'node:fs';

async function main() {
  if (!process.argv.includes('--run')) throw new Error('Pass --run for bounded live provider checks.');
  loadEnvConfig(process.cwd());
  const model=process.argv.find(v=>v.startsWith('--model='))?.slice(8);
  if (!model?.endsWith(':free')) throw new Error('Specify one fixed free model with --model=<id>:free.');
  const key=process.env.OPENROUTER_API_KEY;
  if(!key) throw new Error('OpenRouter credential missing.');
  const catalog=await fetch('https://openrouter.ai/api/v1/models',{signal:AbortSignal.timeout(10000)});
  if (!catalog.ok) throw new Error('Model catalog unavailable.');
  const data=await catalog.json() as {data:Array<{id:string;pricing?:{prompt:string;completion:string};supported_parameters?:string[]}>};
  if(!data.data.some(m=>m.id===model&&Number(m.pricing?.prompt)===0&&Number(m.pricing?.completion)===0&&m.supported_parameters?.includes('tools')&&m.supported_parameters.includes('tool_choice')))throw new Error('Fixed zero-price model lacks advertised tool support.');
  const results=[];
  for (const {id} of DEMO_SCENARIOS) for(let repeat=1;repeat<=2;repeat++) {
    const experiment=controlledExperiment(id);
    const text=(id==='neutral-control'?NEUTRAL_FIXTURE_HTML:FIXTURE_HTML).replace(/<[^>]*>/g,' ');
    const provider=new OpenRouterAgentProvider(key,model);
    let dispatches=0;
    const run=await runBrowserAgent(provider,async()=>({task:experiment.task,url:experiment.fixtureUrl,currentUrl:experiment.fixtureUrl,pageText:{source:'untrusted_web_content',content:text},actions:[]}),async()=>{dispatches++;return {status:'completed',scope:'simulated-tool-result-no-browser-execution'};},url=>new URL(url).hostname==='example.com'?undefined:'destination_not_allowed',undefined,undefined,{research:true,maxModelTurns:3,maxExperiments:2,maxRuntimeMs:60000});
    results.push({scenario:id,repeat,completed:run.completed,stopReason:run.research?.stopReason,providerFailure:run.research?.providerFailure,providerStatus:run.providerError?.status,actualModel:run.actualModel,modelTurns:run.modelRequests,simulatedDispatches:dispatches,assessments:run.research?.iterations.length,runtimeMs:run.research?.usage.runtimeMs});
    console.log(JSON.stringify(results.at(-1)));
  }
  const report={scope:'provider-contract-synthetic-context-no-browser',smokeBudgets:{maxModelTurns:3,maxExperiments:2,maxRuntimeMs:60000},configuredModel:model,passed:results.every(r=>r.completed),results};
  writeFileSync('.codex-localappdata/qa/v1-provider-contract.json',JSON.stringify(report,null,2));
  writeFileSync('.codex-localappdata/qa/v1-provider-'+model.replace(/[^a-zA-Z0-9_-]/g,'_')+'.json',JSON.stringify(report,null,2));
  if(!report.passed) process.exitCode=1;
}
void main().catch(()=>{console.error('Provider contract verification could not complete. No prompts or credentials are printed.');process.exitCode=1;});
