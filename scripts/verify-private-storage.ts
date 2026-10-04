import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { loadEnvConfig } from '@next/env';
import { createClient } from '@supabase/supabase-js';
import { writeFileSync } from 'node:fs';
import { supabaseConfiguration } from '../lib/supabase-config';

let stage = 'configuration';
let authStatus: number | undefined, authReason: string | undefined;
async function main() {
  if (!process.argv.includes('--run')) throw new Error('Pass --run for isolated test-user storage checks.');
  loadEnvConfig(process.cwd());
  const { url, key } = supabaseConfiguration();
  const clients = ['A', 'B'].map(() => createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: (input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(10_000) }) } }));
  const users: string[] = [], inserted: string[] = [], table = 'kraxx_private_cases', nonce = randomUUID();
  try {
    for (const [index, letter] of ['A', 'B'].entries()) {
      const email = process.env[`KRAXX_TEST_${letter}_EMAIL`], password = process.env[`KRAXX_TEST_${letter}_PASSWORD`];
      if (!email || !password) throw new Error('Dedicated test users are not configured.');
      stage = 'sign-in-' + letter;
      const { data, error } = await clients[index].auth.signInWithPassword({ email, password });
      if (error || !data.user) { authStatus = error?.status; authReason = ['invalid_credentials', 'email_not_confirmed', 'over_request_rate_limit', 'user_banned'].includes(error?.code ?? '') ? error!.code : 'unclassified'; throw new Error('Test sign-in failed.'); } users.push(data.user.id);
    }
    stage = 'distinct-accounts';
    assert.notEqual(users[0], users[1]);
    const payload = { schemaVersion: '0.1', caseId: 'PRIVATE-VERIFY-' + nonce, verificationOnly: true };
    stage = 'migration-and-insert';
    const saved = await clients[0].from(table).insert({ owner_id: users[0], case_id: payload.caseId, payload }).select('id').single();
    if (saved.error || !saved.data) throw new Error('Migration or insertion verification failed.'); inserted.push(saved.data.id);
    stage = 'owner-read';
    const own = await clients[0].from(table).select('payload').eq('id', inserted[0]).single(); assert.equal(own.error, null); assert.equal(own.data?.payload.caseId, payload.caseId);
    stage = 'cross-owner-read';
    const other = await clients[1].from(table).select('payload').eq('id', inserted[0]); assert.equal(other.error, null); assert.deepEqual(other.data, []);
    stage = 'cross-owner-delete';
    const crossDelete = await clients[1].from(table).delete().eq('id', inserted[0]).select('id'); assert.equal(crossDelete.error, null); assert.deepEqual(crossDelete.data, []);
    stage = 'forged-owner';
    const forged = await clients[1].from(table).insert({ owner_id: users[0], case_id: payload.caseId, payload }); assert.ok(forged.error);
    stage = 'immutable-update';
    const updated = await clients[0].from(table).update({ case_id: 'altered' }).eq('id', inserted[0]); assert.ok(updated.error);
    stage = 'anonymous-read';
    const anonymous = createClient(url, key, { auth: { persistSession: false }, global: { fetch: (input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(10_000) }) } }); const anon = await anonymous.from(table).select('id').eq('id', inserted[0]); assert.ok(anon.error);
    const remaining = await clients[0].from(table).select('id').eq('id', inserted[0]).single(); assert.equal(remaining.error, null);
    stage = 'quota-precondition';
    const count = await clients[0].from(table).select('id', { count: 'exact', head: true });
    assert.equal(count.error, null); assert.equal(count.count, 1, 'Use a dedicated test account with no existing saved cases.');
    stage = 'quota-fill';
    const bulk = await clients[0].from(table).insert(Array.from({ length: 18 }, (_, i) => ({ owner_id: users[0], case_id: payload.caseId + '-' + i, payload: { ...payload, caseId: payload.caseId + '-' + i } }))).select('id');
    if (bulk.data) inserted.push(...bulk.data.map(row => row.id)); assert.equal(bulk.error, null); assert.equal(bulk.data?.length, 18);
    stage = 'quota-race';
    const race = await Promise.all([0, 1].map(i => clients[0].from(table).insert({ owner_id: users[0], case_id: payload.caseId + '-race-' + i, payload: { ...payload, caseId: payload.caseId + '-race-' + i } }).select('id').single()));
    for (const result of race) if (result.data) inserted.push(result.data.id);
    assert.equal(race.filter(result => !result.error).length, 1); assert.equal(race.find(result => result.error)?.error?.code, 'P0001');
    writeFileSync('.codex-localappdata/qa/v3-private-storage.json', JSON.stringify({ ownRead: 'PASS', crossRead: 'DENIED', crossDelete: 'DENIED', forgedOwner: 'DENIED', updates: 'DENIED', anonymous: 'DENIED', quotaRace: 'PASS', scope: 'isolated-dedicated-test-users', verificationId: nonce }));
    console.log('Live private storage ownership checks passed.');
  } finally {
    if (inserted.length) { stage = 'cleanup'; const cleanup = await clients[0].from(table).delete().in('id', inserted).select('id'); if (cleanup.error || cleanup.data?.length !== inserted.length) throw new Error('Exact verification record cleanup failed.'); }
    await Promise.all(clients.map(client => client.auth.signOut({ scope: 'local' })));
  }
}
void main().catch(() => { console.error('Private storage verification failed at ' + stage + '. ' + JSON.stringify({ authStatus, authReason }) + ' No credentials or raw provider errors are printed.'); process.exitCode = 1; });
