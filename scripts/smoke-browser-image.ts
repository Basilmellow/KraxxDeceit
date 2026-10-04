import assert from 'node:assert/strict';
import { loadEnvConfig } from '@next/env';
import { investigateUrl } from '../lib/engine';
import { BASIC_INDIRECT_PROMPT_INJECTION } from '../experiments/web-agent/prompt-injection-basic';
import { DEMO_URL, LIMITS, safeCase } from '../lib/production-policy';

// Manual remote smoke: fixed synthetic fixture and deterministic provider, no model quota.
async function main() {
  if (!process.argv.includes('--run')) throw new Error('Pass --run to execute one controlled sandbox case.');
  loadEnvConfig(process.cwd());
  process.env.AI_PROVIDER = 'deterministic';
  const result = safeCase(await investigateUrl(DEMO_URL, { ...BASIC_INDIRECT_PROMPT_INJECTION, fixtureUrl: DEMO_URL }, { demo: true, signal: AbortSignal.timeout(LIMITS.requestMs) }));
  assert.equal(result.status, 'completed');
  assert.ok(result.events && result.events.length > 0);
  assert.ok(result.evidenceGraph);
  assert.equal(result.research?.stopReason, 'evidence_sufficient');
  assert.equal(result.research?.usage.experiments, 2);
  assert.equal(result.research?.iterations.length, 3);
  assert.ok(result.provenance.sandboxImage?.includes('@sha256:'));
  console.log(JSON.stringify({ caseId: result.caseId, status: result.status, events: result.events.length,
    nodes: result.evidenceGraph.nodes.length, hypotheses: result.hypotheses.length,
    research: { stopReason: result.research.stopReason, usage: result.research.usage }, modelExecution: result.modelExecution, telemetryMode: result.telemetryMode, provenance: result.provenance }, null, 2));
}
void main().catch(() => { console.error('Controlled engine smoke failed. No raw diagnostics are printed.'); process.exitCode = 1; });
