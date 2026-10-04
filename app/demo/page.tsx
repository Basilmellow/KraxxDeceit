'use client';
import { useState } from 'react';
import { InvestigationCaseSchema, type InvestigationCase } from '@/lib/case-schema';
import CaseExplorer from '@/app/components/case-explorer';
import CaseLoader from '@/app/components/case-loader';
import { DEMO_SCENARIOS, type DemoScenario } from '@/lib/controlled-demo-catalog';

export default function DemoPage() {
  const [running, setRunning] = useState(false), [error, setError] = useState(''), [result, setResult] = useState<InvestigationCase | null>(null);
  const [scenario, setScenario] = useState<DemoScenario>('prompt-injection');
  const [mode, setMode] = useState<'deterministic' | 'ai'>('deterministic');
  async function run() {
    setRunning(true); setError(''); setResult(null);
    try {
      const response = await fetch('/api/demo', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({scenario,mode}) });
      const data = await response.json();
      if (!response.ok) throw new Error(typeof data.error === 'string' ? data.error : 'Demo could not complete.');
      const parsed = InvestigationCaseSchema.safeParse(data);
      if (!parsed.success) throw new Error('The returned case could not be validated.');
      setResult(parsed.data);
    } catch (value) { setError(value instanceof Error ? value.message : 'Demo could not complete.'); }
    finally { setRunning(false); }
  }
  return <main className="demo-shell"><a className="case-home-link" href="/">KraxxDeceit <span> / research workspace</span></a><p><a className="case-home-link" href="/workspace">Private case workspace</a> · <a className="case-home-link" href="/experiments">Repeated experiments</a></p><section className="panel"><p className="panel-kicker">CONTROLLED RESEARCH DEMO</p><h1>Observe. Inspect. Trace the evidence.</h1><p>A fixed synthetic webpage runs inside a disposable sandbox. Agent navigation is restricted to example.com.</p><label className="case-file-label">Controlled scenario<select disabled={running} value={scenario} onChange={e => setScenario(e.target.value as DemoScenario)}>{DEMO_SCENARIOS.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><p className="case-note">{DEMO_SCENARIOS.find(item => item.id === scenario)?.description} Each choice runs independently; two separate runs do not prove an injection effect.</p><label className="case-file-label">Research mode<select disabled={running} value={mode} onChange={e => setMode(e.target.value as 'deterministic' | 'ai')}><option value="deterministic">Deterministic research (default)</option><option value="ai">Free AI research (experimental)</option></select></label><p className="case-note">{mode === 'deterministic' ? 'A fixed sequence reads the page and captures a screenshot. Browser telemetry is collected live; assessments come from engine rules. No AI model is called.' : 'Experimental free AI chooses bounded research actions. Availability and tool compliance vary; a run may fail. Assessments are untrusted proposals checked against recorded evidence.'}</p><button className="primary-cta" disabled={running} onClick={run}>{running ? 'Running controlled demo…' : 'RUN CONTROLLED DEMO'}</button><p role="status" aria-live="polite">{running ? 'Collecting browser, network and system evidence.' : error}</p>{!result && !running && <p className="case-note">Run the controlled demo to explore its graph, timeline, hypotheses, and execution provenance.</p>}</section><CaseLoader disabled={running} onLoad={setResult} />{result && <CaseExplorer key={result.caseId} result={result} />}</main>;
}
