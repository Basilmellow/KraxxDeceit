'use client';
import { useState } from 'react';
import type { InvestigationCase } from '@/lib/case-schema';
import { verifyCaseIntegrity } from '@/lib/case-integrity';
import { CASE_FILE_BYTES, parseCaseFile } from '@/lib/case-file';
export default function CaseLoader({ onLoad, disabled = false }: { onLoad: (value: InvestigationCase) => void; disabled?: boolean }) {
  const [status, setStatus] = useState('');
  return <section className="panel" aria-label="Load saved case"><h2>Load a saved case</h2><p>Inspect an exported JSON case locally. Loading a file does not run an investigation or upload it to the service. Imported claims are unverified.</p><label className="case-file-label">Case JSON<input type="file" accept=".json,application/json" disabled={disabled} onChange={async event => {
    const file = event.target.files?.[0]; event.target.value = ''; if (!file) return;
    try { if (file.size > CASE_FILE_BYTES) throw new Error('Case files must be at most 3 MiB.'); const data = parseCaseFile(await file.text()); const integrity = await verifyCaseIntegrity(data); if (integrity === 'mismatch') throw new Error('Case integrity mismatch. The normalized case differs from its recorded digest.'); onLoad(data); setStatus(`Loaded ${data.caseId}. ${integrity === 'matched' ? 'Recorded digest matches; this does not verify authenticity.' : 'No integrity digest recorded.'} Imported evidence is unverified.`); }
    catch (error) { setStatus(error instanceof Error ? error.message : 'Could not load this case.'); }
  }} /></label><p role="status">{status}</p></section>;
}
