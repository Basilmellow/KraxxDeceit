"use client";
import { useState } from 'react';
import type { InvestigationCase } from '@/lib/case-schema';
export default function DemoPage() {
  const [running,setRunning]=useState(false), [error,setError]=useState(''), [result,setResult]=useState<InvestigationCase|null>(null);
  async function run() {
    setRunning(true);setError('');setResult(null);
    try { const response=await fetch('/api/demo',{method:'POST',headers:{'content-type':'application/json'},body:'{}'}); const data=await response.json(); if(!response.ok)throw new Error(data.error ?? 'Demo could not complete.'); setResult(data); }
    catch(e){setError(e instanceof Error?e.message:'Demo could not complete.');} finally{setRunning(false);}
  }
  return <main className="demo-shell"><a href="/">KraxxDeceit</a><section className="panel"><p className="panel-kicker">CONTROLLED RESEARCH DEMO</p><h1>Observe a safe synthetic research case.</h1><p>A fixed synthetic webpage runs inside a disposable sandbox. Agent navigation is restricted to example.com.</p><button className="primary-cta" disabled={running} onClick={run}>{running?'Running controlled demo…':'RUN CONTROLLED DEMO'}</button><p role="status" aria-live="polite">{running?'Collecting browser, network and system evidence.':error}</p></section>{result && <section className="panel"><h2>{result.caseId}</h2><p>{result.summary}</p><p>Provider: {result.agent?.provider} · Model: {result.agent?.model ?? 'deterministic'}</p><p>{result.events?.length ?? 0} observed events · {result.evidenceGraph?.nodes.length ?? 0} evidence nodes · {result.hypotheses.length} hypotheses</p><p>Hypotheses reflect observed evidence; a supported result is not guaranteed.</p><button className="export-button" onClick={()=>{const href=URL.createObjectURL(new Blob([JSON.stringify(result,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=href;a.download=result.caseId+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(href),1000);}}>DOWNLOAD CASE</button><details><summary>View real case result</summary><pre className="mono wrap">{JSON.stringify(result,null,2)}</pre></details></section>}</main>;
}
