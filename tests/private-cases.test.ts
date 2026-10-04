import test from 'node:test';
import assert from 'node:assert/strict';
import { privateCases, boundedJson, type PrivateCaseStore } from '../lib/private-cases';
import { fixture } from './fixtures/case';
import { withReproducibility } from '../lib/reproducibility';
import { parseCaseFile } from '../lib/case-file';
import { controlledExperiment } from '../lib/controlled-demos';
import { supabaseConfiguration } from '../lib/supabase-config';
const id = '11111111-1111-4111-8111-111111111111';
test('private configuration rejects service-role and secret keys and unexpected hosts', () => {
  const url = 'https://test-project.supabase.co';
  const token = (role: string) => 'ey.fake'.split('.')[0] + '.' + Buffer.from(JSON.stringify({ role })).toString('base64url') + '.signature';
  for (const key of ['', 'sb_secret_fake', token('service_role'), token('authenticated'), 'ey.invalid.jwt']) assert.throws(() => supabaseConfiguration({ SUPABASE_URL: url, SUPABASE_PUBLISHABLE_KEY: key }), { status: 503 });
  for (const host of ['http://test.supabase.co', 'https://evil.example', 'https://test.supabase.co@evil.example']) assert.throws(() => supabaseConfiguration({ SUPABASE_URL: host, SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_fake' }));
  assert.equal(supabaseConfiguration({ SUPABASE_URL: url, SUPABASE_PUBLISHABLE_KEY: token('anon') }).url, url);
});
const request = (method: string, body?: unknown, origin = 'https://site') => new Request('https://site/api/cases', { method, headers: { origin, 'content-type': 'application/json' }, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
function store(user = 'A') {
  const calls: string[] = [];
  const value: PrivateCaseStore = { user: async () => user ? { id: user } : null, list: async owner => { calls.push('list:' + owner); return []; }, get: async (owner, key) => { calls.push('get:' + owner + ':' + key); return owner === 'A' ? { payload: fixture() } : null; }, save: async (owner, data) => { calls.push('save:' + owner); assert.deepEqual(data.raw, { stdout: '', stderr: '' }); return { id }; }, remove: async owner => { calls.push('delete:' + owner); return owner === 'A'; } };
  return { calls, factory: async () => value, value };
}
test('anonymous requests never read or write case storage and private responses are not cached', async () => {
  for (const method of ['GET', 'POST', 'DELETE']) {
    const s = store(''), response = await privateCases(request(method, method === 'POST' ? { case: fixture() } : undefined), s.factory, method === 'DELETE' ? id : undefined);
    assert.equal(response.status, 401); assert.deepEqual(s.calls, []); assert.equal(response.headers.get('cache-control'), 'private, no-store'); assert.equal(response.headers.get('vary'), 'Cookie');
  }
});
test('read/delete always use authenticated owner and another owner receives identical not-found responses', async () => {
  for (const method of ['GET', 'DELETE']) {
    const s = store('B'), response = await privateCases(request(method), s.factory, id);
    assert.equal(response.status, 404); assert.match(s.calls[0], /^(get|delete):B/); assert.deepEqual(await response.json(), { error: 'Case not found.' });
  }
  const s = store(); assert.equal((await privateCases(request('GET'), s.factory, id)).status, 200); assert.match(s.calls[0], /^get:A:/);
});
test('save rejects client-selected owners, invalid/inert case structures and altered digests', async () => {
  const s = store();
  for (const body of [{ case: fixture(), owner_id: 'B' }, { case: {} }, { case: { ...fixture(), unknown: { constructor: {} } } }]) assert.equal((await privateCases(request('POST', body), s.factory)).status, 400);
  const data = await withReproducibility(parseCaseFile(JSON.stringify(fixture())), controlledExperiment()); data.summary = 'changed';
  assert.equal((await privateCases(request('POST', { case: data }), s.factory)).status, 409); assert.deepEqual(s.calls, []);
  assert.equal((await privateCases(request('POST', { case: fixture() }), s.factory)).status, 201); assert.deepEqual(s.calls, ['save:A']);
});
test('cross-origin/missing-origin writes fail before authentication; malformed ids and storage failures expose no internals', async () => {
  let called = false; const factory = async () => { called = true; throw new Error('secret database details'); };
  for (const origin of ['https://evil', '']) assert.equal((await privateCases(request('POST', {}, origin), factory)).status, 403);
  assert.equal(called, false); assert.equal((await privateCases(request('GET'), factory, '../other')).status, 404); assert.equal(called, false);
  const response = await privateCases(request('GET'), factory); assert.equal(response.status, 503); assert.ok(!(await response.text()).includes('secret'));
});
test('private body reads are byte bounded and cancellation stops stalled streams', async () => {
  await assert.rejects(boundedJson(request('POST', { data: 'x'.repeat(50) }), 10), { status: 413 });
  const controller = new AbortController(); const req = new Request('https://site', { method: 'POST', headers: { 'content-type': 'application/json' }, signal: controller.signal, body: new ReadableStream({ start() {} }), duplex: 'half' } as RequestInit);
  const pending = boundedJson(req, 100); controller.abort(); await assert.rejects(pending, { status: 408 });
});
