import { DENIED_SANDBOX_SUBNETS } from './url-safety';
export const LIMITS = { requestMs: 150_000, sandboxMs: 140_000, caseBytes: 3 * 1024 * 1024, events: 2000, bodyBytes: 4096, windowMs: 600_000, perClient: 3, clientConcurrent: 1, concurrent: 3, leaseMs: 180_000 } as const;
export const DEMO_URL = 'https://example.com/kraxx-controlled-demo';
export function internalRoutesEnabled() { return process.env.NODE_ENV === 'development'; }
export function productionConfigurationValid() {
  if (process.env.NODE_ENV !== 'production') return true;
  return ['openrouter', 'openai'].includes(process.env.AI_PROVIDER ?? '') && Boolean(process.env.AI_MODEL?.trim()) && Boolean((process.env.AI_PROVIDER === 'openrouter' ? process.env.OPENROUTER_API_KEY : process.env.OPENAI_API_KEY)?.trim());
}
export function controlledAiConfigurationValid() {
  const model = process.env.AI_MODEL?.trim();
  return process.env.AI_PROVIDER === 'openrouter' && Boolean(model && (model === 'openrouter/free' || model.endsWith(':free'))) && Boolean(process.env.OPENROUTER_API_KEY?.trim());
}
export const PROVISIONING_POLICY = { allow: ['registry.npmjs.org', 'cdn.playwright.dev', 'playwright.download.prss.microsoft.com', 'cdn.playwright.download.prss.microsoft.com', 'amazonlinux.com', '*.amazonlinux.com'], subnets: { deny: DENIED_SANDBOX_SUBNETS } };
export function investigationPolicy(host: string, destinations?: string[]) { return { allow: destinations ?? [host.replace(/^\[|\]$/g, '').replace(/\.$/, '')], subnets: { deny: DENIED_SANDBOX_SUBNETS } }; }
export class PublicRequestError extends Error { constructor(public status: number, message: string) { super(message); } }
export function safeCase<T>(value: T): T {
  const secrets = Object.entries(process.env).filter(([key,v]) => /KEY|TOKEN|SECRET|PASSWORD|CREDENTIAL/i.test(key) && v && v.length >= 8).map(([,v])=>v!);
  const walk = (v: unknown, key = ''): unknown => {
    if (/^(authorization|cookie|set-cookie|environment|env|headers|stack|.*(?:api[_-]?key|token|password|credential|secret).*)$/i.test(key)) return '[redacted]';
    if (typeof v === 'string') {
      let s = v; for (const secret of secrets) s = s.split(secret).join('[redacted]');
      return s.replace(/\n\s*at\s+[^\n]+/g, '[stack frame removed]').replace(/Bearer\s+[^\s"'<>]+/gi, 'Bearer [redacted]').replace(/\bsk-(?:or-v1-|proj-)?[\w-]{20,}/g, '[redacted]').replace(/(?:[A-Za-z]:\\|\/(?:tmp|vercel|home|Users|usr|opt|root|etc|var)\/)[^\s"'<>]+/g, '[internal path]');
    }
    if (Array.isArray(v)) return v.map(item=>walk(item));
    if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k,item])=>[k,walk(item,k)]));
    return v;
  };
  const result = walk(value) as T;
  const object = result as { raw?: unknown; events?: unknown[] };
  if (object.raw) object.raw = { stdout: '', stderr: '' };
  if ((object.events?.length ?? 0) > LIMITS.events) throw new PublicRequestError(413, 'Investigation exceeded the event limit.');
  if (Buffer.byteLength(JSON.stringify(result)) > LIMITS.caseBytes) throw new PublicRequestError(413, 'Investigation exceeded the case size limit.');
  return result;
}
