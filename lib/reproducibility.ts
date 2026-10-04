import { createHash } from 'node:crypto';
import { InvestigationCaseSchema, type InvestigationCase } from './case-schema';
import { integrityPayload, sha256 } from './case-integrity';
import { controlledScenario } from './controlled-demos';
import { FIXTURE_HTML, NEUTRAL_FIXTURE_HTML } from './controlled-demo-fixtures';
import type { ExperimentDefinition } from './experiment-schema';
import { LIMITS, safeCase, investigationPolicy } from './production-policy';
import { ATTRIBUTION_METHODOLOGY_VERSION } from './attribution-engine';
export async function withReproducibility(value: InvestigationCase, experiment?: ExperimentDefinition): Promise<InvestigationCase> {
  const record = InvestigationCaseSchema.parse(safeCase(value));
  const scenario = controlledScenario(experiment);
  const policy = investigationPolicy(new URL(record.target.submittedUrl).hostname, experiment?.allowedDestinations);
  const result: InvestigationCase = { ...record, reproducibility:{
    version:'1.0',canonicalization:'sorted-json-v1',exportSha256:'0'.repeat(64),scope:'normalized-redacted-case',
    ...(scenario ? {scenario, fixtureSha256:createHash('sha256').update(scenario === 'neutral-control' ? NEUTRAL_FIXTURE_HTML : FIXTURE_HTML).digest('hex')} : {}),
    ...(experiment ? {experimentSha256:await sha256(experiment)} : {}),
    browserSettings:{headless:true,viewport:{width:1280,height:720},serviceWorkers:'block',contexts:'fresh-baseline-and-agent-shared-sandbox'},
    collectionLimits:{domBytes:1024*1024,pageTextBytes:16000,events:LIMITS.events,caseBytes:LIMITS.caseBytes,requestMs:LIMITS.requestMs,sandboxMs:LIMITS.sandboxMs},
    networkPolicy:{allowedHosts:policy.allow,deniedSubnets:[...policy.subnets.deny]},
    methodology:{attribution:ATTRIBUTION_METHODOLOGY_VERSION,...(record.behavioralComparison ? {comparison:record.behavioralComparison.methodologyVersion} : {}),...(record.research ? {research:record.research.version} : {})},
    limitations:['Digest checks normalized redacted data, not authenticity or investigator identity.','Page snapshot digests may describe content before export redaction.','Dynamic model routing, remote resources, timing and shared-sandbox state prevent guaranteed identical reruns.','Imported cases are unverified data; loading them replays evidence without executing the target.'],
  }};
  // Include all manifest settings in the digest, excluding only the digest itself.
  const bounded = InvestigationCaseSchema.parse(safeCase(result));
  bounded.reproducibility!.exportSha256 = await sha256(integrityPayload(bounded));
  return bounded;
}
