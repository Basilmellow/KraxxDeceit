import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { loadEnvConfig } from '@next/env';
import { investigateUrl } from '../lib/engine';
import { controlledExperiment } from '../lib/controlled-demos';
import { DEMO_URL, LIMITS, safeCase } from '../lib/production-policy';
import { parseStudyFile, studyPlan, validateStudyCase, type ControlledStudy } from '../lib/controlled-study';

// Explicit manual engine exercise: four sequential fixed sandboxes, zero model calls.
// This does not test public admission; the UI continues to use /api/demo admission.
async function main() {
  if (!process.argv.includes('--run')) throw new Error('Pass --run for four deterministic sandbox runs.');
  loadEnvConfig(process.cwd());
  const study: ControlledStudy = { version: '1.0', studyId: crypto.randomUUID(), createdAt: new Date().toISOString(), firstScenario: 'prompt-injection', cases: [null, null, null, null] };
  for (const [index, scenario] of studyPlan(study.firstScenario).entries()) {
    const result = safeCase(await investigateUrl(DEMO_URL, controlledExperiment(scenario), { demo: true, signal: AbortSignal.timeout(LIMITS.requestMs) }));
    const prior = study.cases.filter((item): item is NonNullable<typeof item> => item !== null);
    study.cases[index] = await validateStudyCase(result, scenario, prior);
    writeFileSync('.codex-localappdata/qa/v4-live-study.json', JSON.stringify(study));
    console.log(JSON.stringify({ run: index + 1, scenario, caseId: result.caseId, status: result.status, modelRequests: result.modelExecution?.modelRequests }));
  }
  const checked = await parseStudyFile(JSON.stringify(study));
  assert.equal(checked.cases.filter(Boolean).length, 4);
  console.log('Four-run engine study passed. Public admission is verified separately.');
}
void main().catch(() => { console.error('Controlled study verification failed. Partial evidence retained; no raw diagnostics printed.'); process.exitCode = 1; });
