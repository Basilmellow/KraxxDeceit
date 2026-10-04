import { createHash, randomUUID } from 'node:crypto';
import { LIMITS, PublicRequestError } from './production-policy';
export interface Admission { acquire(client: string): Promise<() => Promise<void>>; }
export class LocalAdmission implements Admission {
  private clients = new Map<string, { until: number; count: number }>();
  private leases = new Map<string, { client: string; until: number }>();
  constructor(private now = Date.now) {}
  async acquire(client: string) {
    const now = this.now();
    for (const [id,v] of this.leases) if (v.until <= now) this.leases.delete(id);
    for (const [id,v] of this.clients) if (v.until <= now) this.clients.delete(id);
    if (this.clients.size >= 10000 && !this.clients.has(client)) throw new PublicRequestError(503, 'Investigation capacity reached.');
    const rate = this.clients.get(client) ?? { until: now + LIMITS.windowMs, count: 0 };
    if (rate.count >= LIMITS.perClient) throw new PublicRequestError(429, 'Investigation rate limit reached. Try again later.');
    if (this.leases.size >= LIMITS.concurrent || [...this.leases.values()].filter(v=>v.client===client).length >= LIMITS.clientConcurrent) throw new PublicRequestError(429, 'Investigation capacity reached. Try again later.');
    rate.count++; this.clients.set(client,rate);
    const id = randomUUID(); this.leases.set(id, {client, until: now + LIMITS.leaseMs});
    return async () => { this.leases.delete(id); };
  }
}
const ACQUIRE = `local t=redis.call('TIME'); local now=t[1]*1000+math.floor(t[2]/1000); redis.call('ZREMRANGEBYSCORE',KEYS[2],'-inf',now); redis.call('ZREMRANGEBYSCORE',KEYS[3],'-inf',now); if tonumber(redis.call('GET',KEYS[1]) or '0')>=tonumber(ARGV[1]) then return 1 end; if redis.call('ZCARD',KEYS[2])>=tonumber(ARGV[2]) or redis.call('ZCARD',KEYS[3])>=tonumber(ARGV[3]) then return 2 end; local n=redis.call('INCR',KEYS[1]); if n==1 then redis.call('PEXPIRE',KEYS[1],ARGV[4]) end; redis.call('ZADD',KEYS[2],now+ARGV[5],ARGV[6]); redis.call('ZADD',KEYS[3],now+ARGV[5],ARGV[6]); redis.call('PEXPIRE',KEYS[2],ARGV[5]); redis.call('PEXPIRE',KEYS[3],ARGV[5]); return 0`;
export class RedisAdmission implements Admission {
  constructor(private url: string, private token: string, private transport = fetch, private namespace = 'kraxx') {
    if (!/^[a-zA-Z0-9_-]{1,64}$/.test(namespace)) throw new Error('Invalid admission namespace.');
  }
  private async command(args: (string|number)[]) {
    try {
      const response = await this.transport(this.url, { method:'POST', headers:{authorization:'Bearer '+this.token,'content-type':'application/json'}, body:JSON.stringify(args),signal:AbortSignal.timeout(5000) });
      if (!response.ok) throw new Error();
      const data = await response.json() as { result?: unknown; error?: unknown };
      if (data.error || data.result === undefined) throw new Error();
      return data.result;
    } catch { throw new PublicRequestError(503,'Investigation protection is unavailable. Try again later.'); }
  }
  async acquire(client: string) {
    const prefix = this.namespace + ':{admission}:';
    const keys = [prefix+'rate:'+client,prefix+'global',prefix+'client:'+client]; const id=randomUUID();
    const result=await this.command(['EVAL',ACQUIRE,3,...keys,LIMITS.perClient,LIMITS.concurrent,LIMITS.clientConcurrent,LIMITS.windowMs,LIMITS.leaseMs,id]);
    if (result===1 || result===2) throw new PublicRequestError(429,result===1?'Investigation rate limit reached. Try again later.':'Investigation capacity reached. Try again later.');
    if (result!==0) throw new PublicRequestError(503,'Investigation protection is unavailable.');
    return async()=>{ await this.command(['EVAL',"redis.call('ZREM',KEYS[1],ARGV[1]); redis.call('ZREM',KEYS[2],ARGV[1]); return 0",2,keys[1],keys[2],id]); };
  }
}
const local = new LocalAdmission();
export function admission(): Admission {
  const url=process.env.UPSTASH_REDIS_REST_URL, token=process.env.UPSTASH_REDIS_REST_TOKEN;
  if (url && token) {
    try { if (new URL(url).protocol === 'https:') return new RedisAdmission(url,token); } catch { /* Fail closed below. */ }
  }
  if (process.env.NODE_ENV==='production') throw new PublicRequestError(503,'Investigation protection is not configured.');
  return local;
}
export function clientIdentity(request: Request) {
  // Only trust Vercel's overwritten IP header on Vercel; other hosts share one bucket.
  const ip=process.env.VERCEL==='1' ? request.headers.get('x-vercel-forwarded-for')?.split(',')[0].trim() : undefined;
  return createHash('sha256').update(ip || 'shared-client').digest('hex');
}
