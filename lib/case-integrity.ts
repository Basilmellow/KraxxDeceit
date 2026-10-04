import type { InvestigationCase } from './case-schema';
/** Sorted JSON object keys; array order is evidence order. Undefined fields omitted. */
export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return '[' + value.map(item => canonicalJson(item ?? null)).join(',') + ']';
  if (value && typeof value === 'object') return '{' + Object.entries(value).filter(([,v]) => v !== undefined).sort(([a],[b]) => a < b ? -1 : a > b ? 1 : 0).map(([key,item]) => JSON.stringify(key)+':'+canonicalJson(item)).join(',') + '}';
  return JSON.stringify(value) ?? 'null';
}
export function integrityPayload(result: InvestigationCase) {
  const { reproducibility, ...record } = result;
  if (!reproducibility) return record;
  const { exportSha256: ignored, ...manifest } = reproducibility;
  void ignored;
  return { ...record, reproducibility:manifest };
}
export async function sha256(value: unknown): Promise<string> {
  const bytes = new TextEncoder().encode(canonicalJson(value));
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest),byte => byte.toString(16).padStart(2,'0')).join('');
}
export async function verifyCaseIntegrity(result: InvestigationCase): Promise<'matched'|'mismatch'|'unavailable'> {
  if (!result.reproducibility) return 'unavailable';
  return await sha256(integrityPayload(result)) === result.reproducibility.exportSha256 ? 'matched' : 'mismatch';
}
