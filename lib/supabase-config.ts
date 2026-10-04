import { PrivateRequestError } from './private-cases';
export function supabaseConfiguration(env: Record<string, string | undefined> = process.env) {
  const url = env.SUPABASE_URL, key = env.SUPABASE_PUBLISHABLE_KEY;
  const fail = () => { throw new PrivateRequestError(503, 'Private workspace is not configured.'); };
  if (!url || !key || !/^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/.test(url)) return fail();
  if (key.startsWith('ey')) {
    try { if (JSON.parse(Buffer.from(key.split('.')[1], 'base64url').toString()).role !== 'anon') return fail(); }
    catch { return fail(); }
  } else if (!key.startsWith('sb_publishable_')) return fail();
  return { url, key };
}
