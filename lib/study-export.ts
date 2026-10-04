import { zipSync } from 'fflate';
import { parseStudyFile, studyCsv, studyReport, type ControlledStudy } from './controlled-study';

/** Self-contained evidence stays in study.json; filenames never come from imported input. */
export async function studyBundle(value: ControlledStudy): Promise<Uint8Array> {
  const study = await parseStudyFile(JSON.stringify(value));
  const encoder = new TextEncoder();
  const files: Record<string, Uint8Array> = {
    'study.json': encoder.encode(JSON.stringify(study)),
    'report.md': encoder.encode(studyReport(study)),
    'observations.csv': encoder.encode(studyCsv(study)),
    'README.txt': encoder.encode('KraxxDeceit controlled study export\n\nImport study.json on /experiments to inspect all recorded cases locally.\nFull case evidence is embedded in study.json. Partial studies remain partial.\nReview evidence before sharing: no automatic anonymization.\nCSV formula-like cells are escaped. Checksums cover exact file bytes, not authenticity.\nDeterministic runs measure fixture/collector repeatability, not AI susceptibility.\nFour descriptive observations cannot establish causation or statistical significance.\n'),
  };
  const sums = await Promise.all(Object.entries(files).map(async ([name, bytes]) => {
    const digest = await crypto.subtle.digest('SHA-256', new Uint8Array(bytes).buffer);
    return `${Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('')}  ${name}`;
  }));
  files['SHA256SUMS.txt'] = encoder.encode(sums.join('\n') + '\n');
  return zipSync(files, { level: 6 });
}
