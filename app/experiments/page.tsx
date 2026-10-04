'use client';
import { useEffect, useRef, useState } from 'react';
import CaseExplorer from '@/app/components/case-explorer';
import { DEMO_SCENARIOS, type DemoScenario } from '@/lib/controlled-demo-catalog';
import { parseStudyFile, studyPlan, studyRows, studyCsv, studyReport, validateStudyCase, STUDY_FILE_BYTES, type ControlledStudy } from '@/lib/controlled-study';
import type { InvestigationCase } from '@/lib/case-schema';

function download(bytes: BlobPart, type: string, name: string) {
  const url = URL.createObjectURL(new Blob([bytes], { type }));
  const anchor = document.createElement('a'); anchor.href = url; anchor.download = name; anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export default function Experiments() {
  const [first, setFirst] = useState<DemoScenario>('prompt-injection');
  const [study, setStudy] = useState<ControlledStudy | null>(null);
  const [selected, setSelected] = useState<InvestigationCase | null>(null);
  const [busy, setBusy] = useState(false), [message, setMessage] = useState('');
  const [retryAt, setRetryAt] = useState(0), [now, setNow] = useState(0);
  const locked = useRef(false);
  useEffect(() => { if (!retryAt) return; const timer = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(timer); }, [retryAt]);
  const count = study?.cases.filter(Boolean).length ?? 0;
  const remaining = Math.max(0, Math.ceil((retryAt - now) / 1000));
  async function operation(work: () => Promise<void>) {
    if (locked.current) return;
    locked.current = true; setBusy(true); setMessage('');
    try { await work(); } catch (error) { setMessage(error instanceof Error ? error.message : 'Study operation failed.'); }
    finally { locked.current = false; setBusy(false); }
  }
  function replaceAllowed() { return !study?.cases.some(Boolean) || window.confirm('Download your study first if needed. Replace the current local study?'); }
  async function runNext() {
    if (!study || count >= 4 || remaining) return;
    await operation(async () => {
      const scenario = studyPlan(study.firstScenario)[count];
      const response = await fetch('/api/demo', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ scenario, mode: 'deterministic' }) });
      if (response.status === 429) {
        const retry = response.headers.get('retry-after');
        const seconds = retry && /^\d+$/.test(retry) ? Number(retry) : retry ? Math.ceil((Date.parse(retry) - Date.now()) / 1000) : 600;
        const delay = Number.isFinite(seconds) ? Math.max(1, Math.min(seconds, 86400)) : 600;
        setNow(Date.now()); setRetryAt(Date.now() + delay * 1000);
        throw new Error('Admission limit reached. Your completed runs are retained; retry explicitly after the waiting period.');
      }
      const data = await response.json();
      if (!response.ok) throw new Error(typeof data.error === 'string' ? data.error : 'Controlled run failed.');
      const record = await validateStudyCase(data, scenario, study.cases.filter((item): item is InvestigationCase => item !== null));
      const cases = [...study.cases]; cases[count] = record;
      setStudy({ ...study, cases }); setSelected(record); setMessage(`Run ${count + 1} recorded. Download to retain your progress.`);
    });
  }
  return <main className="demo-shell">
    <a className="case-home-link" href="/demo">KraxxDeceit / controlled research</a>
    <section className="panel">
      <p className="panel-kicker">CONTROLLED REPEATED STUDY</p><h1>Compare bounded observations.</h1>
      <p>Two repetitions of injection and neutral fixtures, in a fixed counterbalanced order. Each run uses a fresh disposable sandbox and deterministic actions. This measures collector and fixture repeatability; it does not measure AI susceptibility.</p>
      <label className="case-file-label">First scenario<select value={first} disabled={busy} onChange={event => setFirst(event.target.value as DemoScenario)}>{DEMO_SCENARIOS.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
      <button className="primary-cta" disabled={busy} onClick={() => { if (!replaceAllowed()) return; setStudy({ version: '1.0', studyId: crypto.randomUUID(), createdAt: new Date().toISOString(), firstScenario: first, cases: [null, null, null, null] }); setSelected(null); setMessage('Study created locally. Run each step explicitly.'); }}>NEW STUDY</button>
      <label className="case-file-label">Import study JSON<input type="file" accept=".json,application/json" disabled={busy} onChange={event => { const file = event.target.files?.[0]; event.target.value = ''; if (!file) return; void operation(async () => { if (file.size > STUDY_FILE_BYTES) throw new Error('Study files must be at most 13 MiB.'); const imported = await parseStudyFile(await file.text()); if (!replaceAllowed()) return; setStudy(imported); setSelected(null); setMessage('Imported locally. Digests match; imported claims remain unverified.'); }); }} /></label>
      <p className="case-note">Progress lives in this tab until exported. Importing runs no target and uploads no evidence. Existing admission limits allow three runs per client in ten minutes, so a four-run study requires a waiting period. Retries are manual.</p>
      <p role="status" aria-live="polite">{busy ? 'Validating or collecting evidence…' : message}</p>
    </section>
    {study && <><section className="panel">
      <h2>{count === 4 ? 'Four runs recorded' : `Partial study · ${count}/4 runs`}</h2><p>Study {study.studyId}</p>
      <ol className="case-collectors">{studyPlan(study.firstScenario).map((scenario, index) => <li key={index}><strong>Run {index + 1} · {scenario}</strong><span>{study.cases[index]?.caseId ?? 'Pending'}</span>{study.cases[index] && <button className="case-button" disabled={busy} onClick={() => setSelected(study.cases[index])}>INSPECT RUN {index + 1}</button>}</li>)}</ol>
      {count < 4 && <button className="primary-cta" disabled={busy || remaining > 0} onClick={runNext}>{busy ? 'Running…' : remaining > 0 ? `Retry in ${remaining}s` : `RUN STEP ${count + 1}`}</button>}
      <p>Descriptive observations: {studyRows(study).map(row => `run ${row.run}: ${row.events} events, instruction observed ${row.instructionObserved}, truncated ${row.truncated}`).join('; ') || 'none yet'}.</p>
      <p className="case-note">Fixed order, four bounded observations, timing and collection limits prevent statistical or causal conclusions. Missing observations do not establish absence of behavior. Matching digests detect changes, not authenticity.</p>
      <p>Review all case evidence before sharing. Exports retain evidence without automatic anonymization. Download individual cases from the inspector and import them in the <a href="/workspace">private workspace</a> to save explicitly.</p>
      <div className="case-actions">
        <button className="case-button" disabled={busy} onClick={() => operation(async () => { const checked = await parseStudyFile(JSON.stringify(study)); download(JSON.stringify(checked), 'application/json', 'controlled-study.json'); })}>DOWNLOAD STUDY JSON</button>
        <button className="case-button" disabled={busy} onClick={() => download(studyCsv(study), 'text/csv', 'observations.csv')}>DOWNLOAD CSV</button>
        <button className="case-button" disabled={busy} onClick={() => download(studyReport(study), 'text/markdown', 'study-report.md')}>DOWNLOAD STUDY REPORT</button>
        <button className="case-button" disabled={busy} onClick={() => operation(async () => { const { studyBundle } = await import('@/lib/study-export'); const bytes = await studyBundle(study); download(new Uint8Array(bytes).buffer, 'application/zip', 'controlled-study.zip'); })}>DOWNLOAD STUDY BUNDLE</button>
      </div>
    </section>{selected && <CaseExplorer key={selected.caseId} result={selected} />}</>}
  </main>;
}
