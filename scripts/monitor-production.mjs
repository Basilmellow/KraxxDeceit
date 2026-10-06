import { pathToFileURL } from 'node:url';
const origin = 'https://kraxxdeceit.kraxxsec.com';
async function attempt(path, transport) {
  try {
    const response = await transport(origin + path, { method: 'GET', signal: AbortSignal.timeout(8000), redirect: 'error', headers: { 'cache-control': 'no-cache' } });
    if (response.status !== 200) { await response.body?.cancel(); return { path, state: 'degraded', httpStatus: response.status }; }
    if (path === '/demo') { await response.body?.cancel(); return { path, state: 'healthy', httpStatus: 200 }; }
    const reader = response.body?.getReader(); let size = 0; const chunks = [];
    if (!reader) return { path, state: 'degraded', reason: 'missing health body' };
    try { for (;;) { const { value, done } = await reader.read(); if (done) break; size += value.length; if (size > 65536) { await reader.cancel(); return { path, state: 'degraded', reason: 'oversized health body' }; } chunks.push(value); } } finally { reader.releaseLock(); }
    let data; try { data = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { return { path, state: 'degraded', reason: 'invalid health JSON' }; }
    return { path, state: data?.status === 'ok' ? 'healthy' : 'degraded', httpStatus: 200, ...(typeof data?.version === 'string' ? { version: data.version.slice(0, 40) } : {}) };
  } catch { return { path, state: 'monitor-access-error', reason: 'request unavailable or timed out; service outage not established' }; }
}
export async function checkProduction(transport = fetch) {
  const checks = await Promise.all(['/api/health', '/demo'].map(async path => {
    const first = await attempt(path, transport);
    if (first.state === 'healthy') return first;
    const confirmation = await attempt(path, transport);
    return { ...confirmation, initialState: first.state, confirmed: confirmation.state !== 'healthy' };
  }));
  const state = checks.some(item => item.state === 'degraded') ? 'degraded' : checks.some(item => item.state === 'monitor-access-error') ? 'monitor-access-error' : 'healthy';
  return { state, checks, scope: 'read-only liveness; not Redis, database, model or research readiness' };
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  void checkProduction().then(result => { console.log(JSON.stringify(result)); process.exitCode = result.state === 'healthy' ? 0 : result.state === 'degraded' ? 1 : 2; });
}
