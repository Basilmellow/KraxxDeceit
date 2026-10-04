import test from 'node:test';
import assert from 'node:assert/strict';
import { controlledExperiment } from '../lib/controlled-demos';
import { type DemoScenario, CONTROLLED_DEMO_URL } from '../lib/controlled-demo-catalog';
import { parseCaseFile } from '../lib/case-file';
import { withReproducibility } from '../lib/reproducibility';
import { sha256, integrityPayload } from '../lib/case-integrity';
import { studyPlan, parseStudyFile, validateStudyCase, studyCsv, studyReport, type ControlledStudy } from '../lib/controlled-study';
import { RESEARCH_BUDGETS } from '../lib/agent/research-schema';
import { fixture } from './fixtures/case';
async function sample(scenario: DemoScenario, id: string) {
  const definition = controlledExperiment(scenario);
  const record = parseCaseFile(JSON.stringify({ ...fixture(), caseId: id, target: { submittedUrl: CONTROLLED_DEMO_URL }, experiment: { ...definition, mode: 'agent', executionMode: 'deterministic' }, provenance: { engineVersion: 'test-study', sandbox: 'test', sandboxImage: 'test@sha256:' + 'a'.repeat(64), browserVersion: 'test' }, agent: { task: definition.task, provider: 'deterministic-fallback', actions: [], actionCount: 0, completed: true }, modelExecution: { provider: 'fallback', toolCalls: 0, modelRequests: 0 }, research: { version: '1.0', stopReason: 'evidence_sufficient', budgets: RESEARCH_BUDGETS, usage: { experiments: 0, toolCalls: 0, modelTurns: 0, runtimeMs: 0 }, evidence: [], iterations: [] } }));
  return withReproducibility(record, definition);
}
const empty = (): ControlledStudy => ({ version: '1.0', studyId: '11111111-1111-4111-8111-111111111111', createdAt: '2026-10-04T00:00:00Z', firstScenario: 'prompt-injection', cases: [null, null, null, null] });
test('protocol counterbalances two repetitions and partial studies never claim completion', async () => {
  assert.deepEqual(studyPlan('prompt-injection'), ['prompt-injection', 'neutral-control', 'neutral-control', 'prompt-injection']);
  assert.deepEqual(studyPlan('neutral-control'), ['neutral-control', 'prompt-injection', 'prompt-injection', 'neutral-control']);
  const study = empty(); study.cases[0] = await sample('prompt-injection', 'A');
  assert.match(studyReport(await parseStudyFile(JSON.stringify(study))), /1\/4; partial study/);
  study.cases[2] = await sample('neutral-control', 'B'); await assert.rejects(parseStudyFile(JSON.stringify(study)), /protocol order/);
});
test('study import validates all case digests and rejects duplicate repetitions and mismatched fixtures', async () => {
  const study = empty(); study.cases = await Promise.all(studyPlan(study.firstScenario).map((scenario, i) => sample(scenario as DemoScenario, 'CASE-' + i)));
  assert.match(studyReport(await parseStudyFile(JSON.stringify(study))), /4\/4 protocol runs/);
  study.cases[3] = study.cases[0]; await assert.rejects(parseStudyFile(JSON.stringify(study)), /more than one repetition/);
  study.cases[3] = await sample('neutral-control', 'OTHER'); await assert.rejects(parseStudyFile(JSON.stringify(study)), /planned deterministic scenario/);
  study.cases[0]!.summary = 'tampered'; await assert.rejects(parseStudyFile(JSON.stringify(study)), /matching case digest/);
});
test('valid digests do not excuse incompatible configuration or modified experiment metadata', async () => {
  const first = await sample('prompt-injection', 'A'), second = await sample('neutral-control', 'B');
  second.provenance.engineVersion = 'different'; second.reproducibility!.exportSha256 = await sha256(integrityPayload(second));
  await assert.rejects(validateStudyCase(second, 'neutral-control', [first]), /configuration differs/);
  const changed = await sample('prompt-injection', 'C'); changed.experiment!.task = 'different'; changed.reproducibility!.exportSha256 = await sha256(integrityPayload(changed));
  await assert.rejects(validateStudyCase(changed, 'prompt-injection'), /metadata differs/);
});
test('experimental AI and incomplete runs cannot count toward the deterministic protocol', async () => {
  const value = await sample('prompt-injection', 'A'); value.agent!.completed = false; value.reproducibility!.exportSha256 = await sha256(integrityPayload(value));
  await assert.rejects(validateStudyCase(value, 'prompt-injection'), /did not complete/);
  value.agent!.completed = true; value.experiment!.executionMode = 'experimental_ai'; value.reproducibility!.exportSha256 = await sha256(integrityPayload(value));
  await assert.rejects(validateStudyCase(value, 'prompt-injection'), /planned deterministic/);
});
test('CSV exports quote cells and neutralize spreadsheet formulas; Markdown escapes hostile identifiers', async () => {
  const study = empty(); study.cases[0] = await sample('prompt-injection', '=HYPERLINK("evil")');
  assert.match(studyCsv(study), /"'=HYPERLINK\(""evil""\)"/);
  study.studyId = '<script>'; assert.ok(!studyReport(study).includes('<script>'));
});
