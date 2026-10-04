import { z } from 'zod';
import { CASE_FILE_BYTES, parseCaseFile } from './case-file';
import { verifyCaseIntegrity } from './case-integrity';
import type { InvestigationCase } from './case-schema';

export class PrivateRequestError extends Error {
  constructor(public status: number, message: string) { super(message); }
}
export const PRIVATE_HEADERS = { 'Cache-Control': 'private, no-store', 'Vary': 'Cookie', 'X-Content-Type-Options': 'nosniff' };
export function sameOriginWrite(request: Request) {
  if (request.headers.get('origin') !== new URL(request.url).origin) throw new PrivateRequestError(403, 'Request origin is not allowed.');
}
export async function boundedJson(request: Request, maximum: number) {
  if (!request.headers.get('content-type')?.startsWith('application/json')) throw new PrivateRequestError(415, 'Send a JSON request.');
  const reader = request.body?.getReader();
  if (!reader) throw new PrivateRequestError(400, 'Send a valid JSON request.');
  const chunks: Uint8Array[] = []; let bytes = 0;
  const timeout = AbortSignal.timeout(10_000), signal = AbortSignal.any([request.signal, timeout]);
  let abort = () => {};
  const aborted = new Promise<never>((_, reject) => { abort = () => { void reader.cancel().catch(() => {}); reject(new PrivateRequestError(408, 'Request body timed out.')); }; signal.addEventListener('abort', abort, { once: true }); if (signal.aborted) abort(); });
  try {
    for (;;) {
      const item = await Promise.race([reader.read(), aborted]);
      if (signal.aborted) throw new PrivateRequestError(408, 'Request body timed out.');
      if (item.done) break;
      bytes += item.value.length;
      if (bytes > maximum) { await reader.cancel(); throw new PrivateRequestError(413, 'Request exceeds the supported size.'); }
      chunks.push(item.value);
    }
    try { return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown; }
    catch { throw new PrivateRequestError(400, 'Send a valid JSON request.'); }
  } finally { signal.removeEventListener('abort', abort); reader.releaseLock(); }
}
export interface PrivateCaseStore {
  user(): Promise<{ id: string } | null>;
  list(owner: string): Promise<unknown[]>;
  get(owner: string, id: string): Promise<{ payload: unknown } | null>;
  save(owner: string, value: InvestigationCase): Promise<{ id: string }>;
  remove(owner: string, id: string): Promise<boolean>;
}
export function privateFailure(error: unknown) {
  return Response.json({ error: error instanceof PrivateRequestError ? error.message : 'Private workspace is unavailable. Try again later.' }, { status: error instanceof PrivateRequestError ? error.status : 503, headers: PRIVATE_HEADERS });
}
export async function privateCases(request: Request, factory: () => Promise<PrivateCaseStore>, id?: string) {
  try {
    if (request.method !== 'GET') sameOriginWrite(request);
    if (id && !z.uuid().safeParse(id).success) throw new PrivateRequestError(404, 'Case not found.');
    const store = await factory(), user = await store.user();
    if (!user) throw new PrivateRequestError(401, 'Sign in to access private cases.');
    if (request.method === 'GET' && !id) return Response.json({ cases: await store.list(user.id) }, { headers: PRIVATE_HEADERS });
    if (request.method === 'GET' && id) {
      const record = await store.get(user.id, id);
      if (!record) throw new PrivateRequestError(404, 'Case not found.');
      const value = parseCaseFile(JSON.stringify(record.payload));
      if (await verifyCaseIntegrity(value) === 'mismatch') throw new PrivateRequestError(409, 'Stored case integrity mismatch.');
      return Response.json({ case: value }, { headers: PRIVATE_HEADERS });
    }
    if (request.method === 'DELETE' && id) {
      if (!await store.remove(user.id, id)) throw new PrivateRequestError(404, 'Case not found.');
      return new Response(null, { status: 204, headers: PRIVATE_HEADERS });
    }
    if (request.method === 'POST' && !id) {
      const input = z.object({ case: z.unknown() }).strict().safeParse(await boundedJson(request, CASE_FILE_BYTES + 1024));
      if (!input.success) throw new PrivateRequestError(400, 'Send one supported case.');
      let value: InvestigationCase;
      try { value = parseCaseFile(JSON.stringify(input.data.case)); } catch { throw new PrivateRequestError(400, 'This is not a supported case file.'); }
      if (!value.caseId || value.caseId.length > 200) throw new PrivateRequestError(400, 'Unsupported case identifier.');
      if (await verifyCaseIntegrity(value) === 'mismatch') throw new PrivateRequestError(409, 'Case integrity mismatch.');
      return Response.json(await store.save(user.id, value), { status: 201, headers: PRIVATE_HEADERS });
    }
    throw new PrivateRequestError(405, 'Method not allowed.');
  } catch (error) { return privateFailure(error); }
}
