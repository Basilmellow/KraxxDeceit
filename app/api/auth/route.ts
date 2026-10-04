import { z } from 'zod';
import { boundedJson, sameOriginWrite, PRIVATE_HEADERS, PrivateRequestError, privateFailure } from '@/lib/private-cases';
import { supabaseServer } from '@/lib/supabase-server';
import { admitSignIn } from '@/lib/auth-admission';
export const runtime = 'nodejs';
export async function GET() {
  try {
    const client = await supabaseServer(), { data, error } = await client.auth.getUser();
    if (error && (error.status ?? 0) >= 500) throw new Error();
    return Response.json({ user: data.user ? { id: data.user.id, email: data.user.email } : null }, { headers: PRIVATE_HEADERS });
  } catch (error) { return privateFailure(error); }
}
export async function POST(request: Request) {
  let release: (() => Promise<void>) | undefined;
  try {
    sameOriginWrite(request);
    const body = await boundedJson(request, 2048);
    const action = z.discriminatedUnion('action', [z.object({ action: z.literal('sign-in'), email: z.email().max(254), password: z.string().min(8).max(128) }).strict(), z.object({ action: z.literal('sign-out') }).strict()]).safeParse(body);
    if (!action.success) throw new PrivateRequestError(400, 'Enter a valid email and password.');
    const client = await supabaseServer();
    if (action.data.action === 'sign-out') {
      const { error } = await client.auth.signOut({ scope: 'local' }); if (error) throw new Error();
      return Response.json({ signedOut: true }, { headers: PRIVATE_HEADERS });
    }
    release = await admitSignIn(request);
    const { data, error } = await client.auth.signInWithPassword({ email: action.data.email, password: action.data.password });
    if (error || !data.user) throw new PrivateRequestError(error?.status === 429 ? 429 : 401, error?.status === 429 ? 'Sign-in rate limit reached. Try again later.' : 'Sign-in could not complete. Check your credentials.');
    return Response.json({ user: { id: data.user.id, email: data.user.email } }, { headers: PRIVATE_HEADERS });
  } catch (error) { return privateFailure(error); }
  finally { await release?.().catch(() => {}); }
}
