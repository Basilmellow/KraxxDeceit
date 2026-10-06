import test from 'node:test';
import assert from 'node:assert/strict';
// Standalone monitor runs without installing application dependencies on GitHub.
// @ts-expect-error Plain JavaScript utility has no declaration file.
import { checkProduction } from '../scripts/monitor-production.mjs';
test('monitor uses GET only, accepts healthy version changes and does not retry healthy checks', async () => {
  const calls: string[] = [];
  const result = await checkProduction(async (url: string, init: RequestInit) => { calls.push(url); assert.equal(init.method, 'GET'); assert.ok(init.signal); return new Response(url.endsWith('/api/health') ? JSON.stringify({ status: 'ok', version: '99.0.0' }) : 'demo'); });
  assert.equal(result.state, 'healthy'); assert.equal(calls.length, 2);
});
test('monitor confirms failures once and distinguishes network access from service failure', async () => {
  let calls = 0;
  const unavailable = await checkProduction(async () => { calls++; throw new Error('network'); });
  assert.equal(unavailable.state, 'monitor-access-error'); assert.equal(calls, 4);
  calls = 0; const degraded = await checkProduction(async () => { calls++; return new Response('unavailable', { status: 503 }); });
  assert.equal(degraded.state, 'degraded'); assert.equal(calls, 4);
});
test('monitor accepts recovery during confirmation and rejects invalid or oversized health bodies', async () => {
  let health = 0;
  const recovered = await checkProduction(async (url: string) => url.endsWith('/demo') ? new Response('demo') : ++health === 1 ? new Response('bad', { status: 503 }) : Response.json({ status: 'ok' }));
  assert.equal(recovered.state, 'healthy'); assert.equal(health, 2);
  for (const body of ['not json', 'x'.repeat(65537)]) assert.equal((await checkProduction(async (url: string) => new Response(url.endsWith('/demo') ? 'demo' : body))).state, 'degraded');
});
