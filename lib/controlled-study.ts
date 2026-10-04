import { z } from 'zod';
import { controlledExperiment } from './controlled-demos';
import { CONTROLLED_DEMO_URL, type DemoScenario } from './controlled-demo-catalog';
import { FIXTURE_HTML, NEUTRAL_FIXTURE_HTML } from './controlled-demo-fixtures';
import { parseCaseFile } from './case-file';
import { canonicalJson, sha256, verifyCaseIntegrity } from './case-integrity';
import type { InvestigationCase } from './case-schema';
export const STUDY_FILE_BYTES = 13 * 1024 * 1024;
export interface ControlledStudy { version: '1.0'; studyId: string; createdAt: string; firstScenario: DemoScenario; cases: (InvestigationCase | null)[]; }
export function studyPlan(first: DemoScenario) {
  const other: DemoScenario = first === 'prompt-injection' ? 'neutral-control' : 'prompt-injection';
  return [first, other, other, first];
}
async function rawDigest(text: string) {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(bytes), value => value.toString(16).padStart(2, '0')).join('');
}
function configuration(value: InvestigationCase) {
  const r = value.reproducibility!;
  return canonicalJson({ engine: value.provenance.engineVersion, image: value.provenance.sandboxImage, browser: value.provenance.browserVersion, settings: r.browserSettings, limits: r.collectionLimits, network: r.networkPolicy, methodology: r.methodology });
}
export async function validateStudyCase(value: InvestigationCase, scenario: DemoScenario, prior: InvestigationCase[] = []) {
  const data = parseCaseFile(JSON.stringify(value)), expected = controlledExperiment(scenario), r = data.reproducibility;
  if (await verifyCaseIntegrity(data) !== 'matched') throw new Error('Studies require a matching case digest.');
  if (data.target.submittedUrl !== CONTROLLED_DEMO_URL || data.experiment?.id !== expected.id || data.experiment.executionMode !== 'deterministic' || r?.scenario !== scenario) throw new Error('Case does not match the planned deterministic scenario.');
  if (Object.entries(expected).some(([key, value]) => canonicalJson((data.experiment as unknown as Record<string, unknown>)[key]) !== canonicalJson(value))) throw new Error('Case experiment metadata differs from the fixed protocol.');
  if (r.experimentSha256 !== await sha256(expected) || r.fixtureSha256 !== await rawDigest(scenario === 'neutral-control' ? NEUTRAL_FIXTURE_HTML : FIXTURE_HTML)) throw new Error('Case fixture or experiment definition differs from this protocol.');
  if (canonicalJson(r.networkPolicy.allowedHosts) !== canonicalJson(['example.com']) || !/@sha256:[a-f0-9]{64}$/.test(data.provenance.sandboxImage ?? '')) throw new Error('Case lacks the controlled policy or pinned image.');
  if (data.status !== 'completed' || !data.agent?.completed || data.agent.provider !== 'deterministic-fallback' || data.modelExecution?.modelRequests !== 0 || data.research?.stopReason !== 'evidence_sufficient' || data.research.iterations.some(item => item.origin !== 'engine')) throw new Error('Case did not complete deterministic research within the protocol.');
  if (prior.some(item => item.caseId === data.caseId)) throw new Error('A case cannot count as more than one repetition.');
  if (prior.length && configuration(prior[0]) !== configuration(data)) throw new Error('Case execution configuration differs from the other study runs.');
  return data;
}
const StudySchema = z.object({ version: z.literal('1.0'), studyId: z.uuid(), createdAt: z.iso.datetime(), firstScenario: z.enum(['prompt-injection', 'neutral-control']), cases: z.array(z.unknown().nullable()).length(4) }).strict();
export async function parseStudyFile(text: string): Promise<ControlledStudy> {
  if (new TextEncoder().encode(text).length > STUDY_FILE_BYTES) throw new Error('Study files must be at most 13 MiB.');
  let input: unknown; try { input = JSON.parse(text); } catch { throw new Error('Choose a valid study JSON file.'); }
  const parsed = StudySchema.safeParse(input); if (!parsed.success) throw new Error('File does not match the supported study protocol.');
  const cases: (InvestigationCase | null)[] = [], prior: InvestigationCase[] = [];
  let gap = false;
  for (const [index, value] of parsed.data.cases.entries()) {
    if (value === null) { gap = true; cases.push(null); continue; }
    if (gap) throw new Error('Study runs must follow the recorded protocol order.');
    const data = await validateStudyCase(parseCaseFile(JSON.stringify(value)), studyPlan(parsed.data.firstScenario)[index], prior);
    cases.push(data); prior.push(data);
  }
  return { ...parsed.data, cases };
}
export function studyRows(study: ControlledStudy) {
  return study.cases.flatMap((value, index) => value ? [{ run: index + 1, repetition: Math.floor(index / 2) + 1, scenario: studyPlan(study.firstScenario)[index], caseId: value.caseId, events: value.events?.length ?? 0, instructionObserved: Boolean(value.events?.some(item => item.action === 'browser.untrusted_instruction_observed')), agentRequests: value.agentBrowser?.requests.length ?? null, navigationActions: value.agent?.actions.filter(item => item.tool === 'navigate').length ?? null, comparison: value.behavioralComparison?.status ?? 'unavailable', truncated: Boolean(value.evidenceGraph?.truncated || value.browser.domTruncated || value.telemetry?.truncated || value.telemetry?.truncationMarkers.length || value.behavioralComparison?.categories.some(item => item.truncated)) }] : []);
}
const escape = (value: string) => value.replace(/[\\`*_{}\[\]()#+.!|<>]/g, '\\$&').replace(/\r?\n/g, ' ');
export function studyReport(study: ControlledStudy) {
  const rows = studyRows(study), complete = rows.length === 4;
  return ['# Controlled repeated study', '', `Study: ${escape(study.studyId)}`, `Created: ${escape(study.createdAt)}`, `Completion: ${complete ? '4/4 protocol runs recorded' : `${rows.length}/4; partial study, no completed comparison`}`, '',
    'Two counterbalanced repetitions: first scenario, other scenario, other scenario, first scenario. Each run uses a fresh disposable sandbox and fixed deterministic actions. This measures collector/fixture repeatability, not AI susceptibility. Execution order is fixed, not randomized.', '',
    ...rows.map(row => `- Run ${row.run}, repetition ${row.repetition}, ${row.scenario}: ${escape(row.caseId)}; events ${row.events}; instruction observed ${row.instructionObserved}; agent requests ${row.agentRequests ?? 'unavailable'}; navigation actions ${row.navigationActions}; comparison ${row.comparison}; truncated ${row.truncated}.`), '',
    '## Interpretation limits', '', 'Four bounded runs are descriptive observations, not a statistical significance test. Differences do not establish causation or malicious intent. Timing, shared sandbox activity and collector limits remain confounders. Missing records are not absence of behavior. Imported digests establish consistency, not authenticity. Full per-case evidence and limitations remain embedded in study.json.', ''].join('\n');
}
export function studyCsv(study: ControlledStudy) {
  const cell = (value: unknown) => { let text = String(value ?? 'unavailable'); if (/^[\s]*[=+@-]/.test(text)) text = "'" + text; return '"' + text.replaceAll('"', '""') + '"'; };
  const rows = studyRows(study), headers = ['run', 'repetition', 'scenario', 'caseId', 'events', 'instructionObserved', 'agentRequests', 'navigationActions', 'comparison', 'truncated'] as const;
  return [headers.map(cell).join(','), ...rows.map(row => headers.map(key => cell(row[key])).join(','))].join('\r\n') + '\r\n';
}
