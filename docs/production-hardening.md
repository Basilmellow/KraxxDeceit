# KraxxDeceit v0.2 production foundation

Production origin: https://kraxxdeceit.kraxxsec.com

## Configuration
Set server-only AI_PROVIDER=openrouter, AI_MODEL=openrouter/free, OPENROUTER_API_KEY, and SITE_URL. OpenAI remains supported using its existing key. Never use NEXT_PUBLIC_ for credentials. Enable Vercel OIDC for Sandbox authentication.

Set UPSTASH_REDIS_REST_URL (HTTPS) and UPSTASH_REDIS_REST_TOKEN for a dedicated Redis database shared by all instances. Production refuses investigations and demo requests without shared protection; no memory-only production fallback. Do not share the admission key namespace with other applications. Local development uses bounded memory buckets. Deployment on Vercel trusts only x-vercel-forwarded-for; other hosts share a single bucket until a trusted ingress adapter is configured.

Arbitrary URL investigations default to disabled in production. Set KRAXX_PUBLIC_INVESTIGATIONS_ENABLED=true to enable them after configuring shared protection. /demo accepts no URL or other parameters and runs the fixed synthetic fixture inside Chromium through the existing engine. It may use the configured agent or existing fallback; outcomes and hypotheses are never fabricated.

## Limits
3 admitted investigations per client per 10 minutes; 1 concurrent per client; 3 concurrent globally. Redis Lua atomically admits rate and concurrency leases. Leases expire after 180 seconds to recover from interrupted invocations; Sandbox TTL is 140 seconds and HTTP deadline is 150 seconds. A timed-out request retains admission until work cleanup finishes or its lease expires. Cleanup failure is bounded by the disposable sandbox TTL.

Request bodies: 4 KiB. Cases: 3 MiB serialized UTF-8. Canonical normalized events: 2,000. Existing browser and telemetry collection caps remain active. Oversized cases are rejected rather than silently dropping evidence references. Public responses omit raw stdout/stderr and redact configured secrets, credentials and internal paths. Logs contain only requestId, caseId when available, duration, status, sandboxCreated, provider and actualModel when available.

## Egress and SSRF
Syntax/DNS safety precedes compute. Browser interception repeats safety checks for requests and redirects and restricts destinations to the original host (example.com for demo/experiments). Domain firewall rules restrict HTTPS; plain HTTP and literal IP targets receive only individually revalidated public address CIDRs. Private IPv4, metadata, loopback, mapped IPv6, link-local and private IPv6 are denied at the firewall. Other target hosts, redirects and third-party assets are blocked; some websites will consequently be incomplete.

Provisioning permits only npm, Playwright CDN and Amazon Linux package repositories. After installation, sandbox.update replaces the policy before Chromium starts; provisioning remains outside agent attribution. AI requests occur in the application server, so the sandbox needs no model-provider endpoint or credentials. No unrestricted policy is used by the public engine.

The restricted provisioning list must be verified against the live Vercel runtime before release; unexpected package mirrors fail closed. This change does not deploy or execute paid/live investigations.

## Routes
/api/internal/* returns 404 outside development, including the capability probe even if its token and enable flag are present. /api/health returns only status=ok and version=0.2.0; it is liveness, not an upstream readiness claim.

## Reference documentation
- [Vercel Sandbox firewall and runtime policy updates](https://vercel.com/sandbox)
- [Vercel request headers](https://vercel.com/docs/headers/request-headers)
- [Upstash atomic Lua over REST](https://upstash.com/blog/lua-scripting-on-upstash-redis-atomic-operations-over-http)

Only standard HTTP(S) ports 80 and 443 are accepted.
