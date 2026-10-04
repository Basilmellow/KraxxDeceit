import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import { PrivateRequestError, type PrivateCaseStore } from './private-cases';
import { supabaseConfiguration } from './supabase-config';

export async function supabaseServer() {
  const { url, key } = supabaseConfiguration();
  const jar = await cookies();
  return createServerClient(url, key, {
    cookieOptions: { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/' },
    cookies: { getAll: () => jar.getAll(), setAll: values => { for (const { name, value, options } of values) jar.set(name, value, { ...options, httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/' }); } },
    global: { fetch: (input, init) => fetch(input, { ...init, cache: 'no-store', signal: AbortSignal.any([AbortSignal.timeout(10_000), ...(init?.signal ? [init.signal] : [])]) }) },
  });
}
export async function supabaseCaseStore(): Promise<PrivateCaseStore> {
  const client = await supabaseServer();
  const table = 'kraxx_private_cases';
  function check(error: { code?: string } | null) {
    if (error?.code === 'P0001') throw new PrivateRequestError(409, 'Private case storage capacity reached. Delete a saved case before trying again.');
    if (error) throw new PrivateRequestError(503, 'Private case storage is unavailable.');
  }
  return {
    async user() { const { data, error } = await client.auth.getUser(); if (error && ((error.status ?? 0) >= 500 || !['AuthSessionMissingError', 'AuthApiError'].includes(error.name))) throw new PrivateRequestError(503, 'Authentication is unavailable.'); return data.user ? { id: data.user.id } : null; },
    async list(owner) { const { data, error } = await client.from(table).select('id,case_id,created_at,payload_bytes').eq('owner_id', owner).order('created_at', { ascending: false }).limit(20); check(error); return data ?? []; },
    async get(owner, id) { const { data, error } = await client.from(table).select('payload').eq('owner_id', owner).eq('id', id).maybeSingle(); check(error); return data; },
    async save(owner, value) { const { data, error } = await client.from(table).insert({ owner_id: owner, case_id: value.caseId, payload: value }).select('id').single(); check(error); if (!data) throw new Error(); return data; },
    async remove(owner, id) { const { data, error } = await client.from(table).delete().eq('owner_id', owner).eq('id', id).select('id'); check(error); return Boolean(data?.length); },
  };
}
