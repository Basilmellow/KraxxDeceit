import { InvestigationCaseSchema, type InvestigationCase } from './case-schema';

export const CASE_FILE_BYTES = 3 * 1024 * 1024;
/** Validate inert data locally. Never insert imported DOM into the document. */
export function parseCaseFile(text: string): InvestigationCase {
  if (new TextEncoder().encode(text).length > CASE_FILE_BYTES) throw new Error('Case files must be at most 3 MiB.');
  let value: unknown;
  try { value = JSON.parse(text); } catch { throw new Error('Choose a valid JSON case file.'); }
  let count = 0;
  function check(item: unknown, depth = 0) {
    if (depth > 32 || ++count > 100_000) throw new Error('The case file exceeds the structural limit.');
    if (item && typeof item === 'object') for (const [key, child] of Object.entries(item)) {
      if (['__proto__', 'prototype', 'constructor'].includes(key)) throw new Error('The case file contains unsupported object keys.');
      check(child, depth + 1);
    }
  }
  check(value);
  const parsed = InvestigationCaseSchema.safeParse(value);
  if (!parsed.success) throw new Error('This file does not match the supported case schema.');
  // Raw worker logs are never needed in the public explorer or its exports.
  return { ...parsed.data, raw: { stdout: '', stderr: '' } };
}

const md = (value: unknown) => String(value ?? 'Not recorded').replace(/[\\`*_{}\[\]()#+.!|<>]/g, '\\$&').replace(/\r?\n/g, ' ');
export function caseReport(result: InvestigationCase) {
  const lines = [
    `# Research case ${md(result.caseId)}`, '',
    '## Executive summary', '', md(result.summary), '',
    `- Target: ${md(result.target.submittedUrl)}`,
    `- Investigation time: ${md(result.createdAt)}`,
    `- Status: ${md(result.status)}`,
    `- Agent completion: ${result.agent ? result.agent.completed ? 'Completed' : 'Incomplete' : 'Not recorded'}`,
    `- Stop reason: ${md(result.research?.stopReason ?? result.agent?.terminationReason)}`, '',
    '## Execution and model provenance', '',
    `- Engine: ${md(result.provenance.engineVersion)}`,
    `- Sandbox: ${md(result.provenance.sandbox)}`,
    `- Pinned image: ${md(result.provenance.sandboxImage)}`,
    `- Browser version: ${md(result.provenance.browserVersion)}`,
    `- Research mode: ${md(result.experiment?.executionMode)}`,
    `- Provider: ${md(result.modelExecution?.provider ?? result.agent?.provider)}`,
    `- Configured model: ${md(result.modelExecution?.configuredModel ?? result.agent?.model)}`,
    `- AI model requests: ${md(result.modelExecution?.modelRequests)}`,
    `- Provider turns: ${md(result.modelExecution?.providerTurns)}`,
    `- Actual model: ${md(result.modelExecution?.actualModel)}`, '',
    '## Experiment', '',
    `- Definition: ${md(result.experiment?.id)} / ${md(result.experiment?.version)}`,
    `- Task: ${md(result.experiment?.task)}`,
    `- Expected behavior: ${md(result.experiment?.expectedBehavior)}`,
    `- Allowed destinations: ${md(result.experiment?.allowedDestinations?.join(', '))}`, '',
    '## Observed behavior', '',
    `- Events: ${result.events?.length ?? 0}; graph nodes: ${result.evidenceGraph?.nodes.length ?? 0}; relationships: ${result.evidenceGraph?.edges.length ?? 0}.`,
    `- Browser requests: ${result.browser.requests.length}; redirects: ${result.browser.redirects.length}; DOM captured: ${result.browser.domCaptured}.`,
    `- Recorded processes: ${result.telemetry?.processes.length ?? 'unavailable'}; sockets: ${result.telemetry?.network.length ?? 'unavailable'}.`, '',
    '## Hypotheses and exact evidence references', '',
  ];
  for (const h of result.hypotheses) lines.push(`### ${md(h.title)}`, '', `${md(h.status)}; ${md(h.confidence)} qualitative confidence.`, '', md(h.explanation), '', `Source events: ${h.sourceEvents.map(md).join(', ')}.`, `Evidence nodes: ${h.evidenceNodeIds.map(md).join(', ')}.`, ...h.limitations.map(l => `- ${md(l)}`), '');
  if (result.reproducibility) lines.push('## Reproducibility manifest', '',
    `- Normalized export SHA-256: ${md(result.reproducibility.exportSha256)}`,
    `- Fixture SHA-256: ${md(result.reproducibility.fixtureSha256)}`,
    `- Experiment SHA-256: ${md(result.reproducibility.experimentSha256)}`,
    `- Viewport: ${result.reproducibility.browserSettings.viewport.width} x ${result.reproducibility.browserSettings.viewport.height}`,
    `- Allowed hosts: ${md(result.reproducibility.networkPolicy.allowedHosts.join(', '))}`,
    `- Collection limits: ${md(JSON.stringify(result.reproducibility.collectionLimits))}`,
    ...result.reproducibility.limitations.map(value=>`- ${md(value)}`), '');
  if (result.behavioralComparison) lines.push('## Baseline versus stimulus', '',
    `- Availability: ${md(result.behavioralComparison.status)}`,
    ...result.behavioralComparison.limitations.map(value => `- ${md(value)}`),
    ...result.behavioralComparison.categories.flatMap(category => [
      `- ${md(category.category)}: ${md(category.status)}; added ${category.added}, removed ${category.removed}, changed ${category.changed}; truncated: ${category.truncated ? 'yes' : 'no'}.`,
      ...category.notes.map(note => `  - ${md(note)}`),
    ]), '');
  if (result.research) lines.push('## Research budget and usage', '',
    `- Recorded budgets: ${md(JSON.stringify(result.research.budgets))}`,
    `- Recorded usage: ${md(JSON.stringify(result.research.usage))}`,
    ...result.research.iterations.flatMap(iteration => [
      `### ${md(iteration.id)} / ${md(iteration.origin)} assessment`, '',
      md(iteration.question), md(iteration.hypothesis),
      `Status: ${md(iteration.status)}; selected tool: ${md(iteration.selectedTool)}; result: ${md(iteration.resultStatus)}.`,
      `Evidence references: ${iteration.evidenceIds.map(md).join(', ')}.`, md(iteration.evaluation), '',
    ]), '');
  lines.push('## Limitations and final assessment', '',
    'Evidence describes one bounded execution. Absence of an observation does not prove absence of behavior. Associations and model assessments do not establish causation or malicious intent.', '',
    `Agent outcome: ${result.agent?.completed ? 'completed within the recorded constraints' : 'evidence insufficient for a completed agent investigation'}.`,
    `Collection truncation: ${result.evidenceGraph?.truncated || result.browser.domTruncated || result.telemetry?.truncated || result.telemetry?.truncationMarkers.length || result.behavioralComparison?.categories.some(category => category.truncated) ? 'recorded' : 'not reported'}.`,
    ...((result.telemetry?.providers ?? []).filter(p => !p.available).map(p => `- Unavailable collector: ${md(p.name)}. ${md(p.reason)}`)), '',
    '## Reproduction steps', '',
    '1. Preserve the accompanying JSON case and its recorded image, experiment, model and evidence identifiers.',
    '2. Load the JSON in the case explorer to replay recorded evidence without executing the target.',
    '3. For a new execution, choose the matching controlled scenario. The public service does not accept custom experiment definitions.',
    '4. Compare observations and limitations. Fresh timing, network responses and dynamically routed models may differ; identical results are not guaranteed.', '');
  return lines.join('\n');
}
