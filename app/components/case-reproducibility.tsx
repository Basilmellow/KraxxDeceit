'use client';
import { useEffect, useState } from 'react';
import type { InvestigationCase } from '@/lib/case-schema';
import { verifyCaseIntegrity } from '@/lib/case-integrity';
export default function CaseReproducibility({result}:{result:InvestigationCase}) {
  const [check,setCheck]=useState('Checking recorded digest…');
  useEffect(()=>{let current=true;void verifyCaseIntegrity(result).then(status=>{if(current)setCheck(status==='matched'?'Recorded digest matches the normalized case.':status==='mismatch'?'Integrity mismatch: case data differs from its recorded digest.':'No integrity digest was recorded for this older case.');}).catch(()=>{if(current)setCheck('Digest verification is unavailable in this browser.');});return ()=>{current=false;};},[result]);
  const manifest=result.reproducibility;
  return <section className="panel" aria-label="Reproducibility record"><p className="panel-kicker">REPLAY AND VERIFICATION</p><h3>Reproducibility record</h3><p role="status">{check}</p><p className="case-note">A matching digest checks consistency of normalized, redacted data. It does not authenticate the source or establish that imported claims occurred. Loading a saved case never executes its target.</p>{manifest && <><dl className="case-fields"><div><dt>Export SHA-256</dt><dd>{manifest.exportSha256}</dd></div><div><dt>Scenario</dt><dd>{manifest.scenario ?? 'Custom investigation'}</dd></div><div><dt>Fixture SHA-256</dt><dd>{manifest.fixtureSha256 ?? 'Not recorded'}</dd></div><div><dt>Experiment SHA-256</dt><dd>{manifest.experimentSha256 ?? 'Not recorded'}</dd></div><div><dt>Viewport</dt><dd>{manifest.browserSettings.viewport.width} × {manifest.browserSettings.viewport.height}</dd></div></dl><details><summary>Recorded execution settings and limitations</summary><pre className="mono wrap">{JSON.stringify({...manifest,exportSha256:undefined},null,2)}</pre></details></>}</section>;
}
