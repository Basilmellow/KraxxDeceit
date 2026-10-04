import { z } from 'zod';
const Digest = z.string().regex(/^[a-f0-9]{64}$/);
export const ReproducibilitySchema = z.object({
  version:z.literal('1.0'), canonicalization:z.literal('sorted-json-v1'), exportSha256:Digest,
  scope:z.literal('normalized-redacted-case'), scenario:z.enum(['prompt-injection','neutral-control']).optional(),
  fixtureSha256:Digest.optional(), experimentSha256:Digest.optional(),
  browserSettings:z.object({headless:z.literal(true),viewport:z.object({width:z.literal(1280),height:z.literal(720)}),serviceWorkers:z.literal('block'),contexts:z.literal('fresh-baseline-and-agent-shared-sandbox')}),
  collectionLimits:z.object({domBytes:z.number(),pageTextBytes:z.number(),events:z.number(),caseBytes:z.number(),requestMs:z.number(),sandboxMs:z.number()}),
  networkPolicy:z.object({allowedHosts:z.array(z.string()),deniedSubnets:z.array(z.string())}),
  methodology:z.object({attribution:z.string(),comparison:z.string().optional(),research:z.string().optional()}),
  limitations:z.array(z.string()).max(10),
}).strict();
