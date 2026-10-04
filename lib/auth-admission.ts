import { LocalAdmission, RedisAdmission, clientIdentity } from './investigation-admission';
import { PublicRequestError } from './production-policy';
import { PrivateRequestError } from './private-cases';
const local = new LocalAdmission();
export async function admitSignIn(request: Request) {
  try {
    const url = process.env.UPSTASH_REDIS_REST_URL, key = process.env.UPSTASH_REDIS_REST_TOKEN;
    if (url && key && new URL(url).protocol === 'https:') return await new RedisAdmission(url, key, fetch, 'kraxx_auth').acquire(clientIdentity(request));
    if (process.env.NODE_ENV === 'production') throw new PrivateRequestError(503, 'Sign-in protection is unavailable.');
    return await local.acquire(clientIdentity(request));
  } catch (error) {
    if (error instanceof PublicRequestError && error.status === 429) throw new PrivateRequestError(429, 'Sign-in rate limit reached. Try again later.');
    throw new PrivateRequestError(503, 'Sign-in protection is unavailable.');
  }
}
