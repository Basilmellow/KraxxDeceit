# Controlled research operations

The current public service runs fixed demos. Keep arbitrary URL investigations disabled
and internal experiments restricted to development. Do not widen firewall policies to
make an investigation succeed. Provider failures retain browser evidence and remain
explicitly incomplete; health is liveness, not AI readiness.

## Verification

- `npm run typecheck` and `npm run test:experiment` check local code and policy behavior.
- `npm run verify:admission -- --run` uses staging Upstash REST credentials from
  `.env.local`. It creates isolated namespaced keys, checks concurrent acquisition,
  rate limits, expired leases and cleanup, and simulates a backend outage without
  starting compute. Never point a destructive load test at production admission keys.
- `npm run verify:provider-contract -- --run --model=<fixed-model>:free` runs two
  repetitions of both scenarios with synthetic page context and simulated tools.
  The model must have current zero input/output pricing and advertised tool support.
  The smoke caps are 3 provider turns, 2 experiments and 60 seconds per case; passing
  does not prove production browser behavior or long-term model availability.
- `npm run smoke:neutral-demo -- --run` checks one actual remote browser run with
  the deterministic provider, retaining a local ignored export and checking integrity.
  It uses the configured sandbox credentials but no model quota.
- Perform one controlled browser smoke on a deployed release. Inspect agent completion,
  model identity, stop reason, budget usage, comparison availability, digest and cleanup.
  A 200 response alone is not successful AI completion.

## Source release capture

Run `vercel deploy --dry --json --project prj_U2CWk5vbMi2Mh69cgnUjs15fTz0h
--scope basil-mellows-projects` and save its output under `.codex-localappdata/qa/`.
Review excluded files, then run `npm run capture:release -- --run --manifest=<path>`.
This captures deployment source with per-file SHA-256 values, verifies archive entries
and rejects configured credential values. It excludes runtime secrets, local cases,
QA exports, Git internals and dependency/build directories. Preserve the archive and
manifest securely; they do not replace runtime configuration or a reviewed Git release.
The archive records an uncommitted source snapshot and makes no Git publication claim.

## Rollback and incident checks

Known rollback before v1: v0.9.1 `dpl_2psdk1rBPK48ED6UyVvSXGdwThh3`.
Use `vercel rollback dpl_2psdk1rBPK48ED6UyVvSXGdwThh3 --yes
--scope basil-mellows-projects` when reverting an application regression.
Rollback does not repair an external model/Redis outage or revert service credentials.

Check `/api/health`, the intended domain/version, bounded deployment logs and exact
case sandbox status. Correlate case/request IDs without logging credentials, raw target
content or private model reasoning. If Redis is unavailable, investigations must return
503 before compute creation. Wait for actual work cleanup before assuming a lease is
released; TTL recovery is the backstop after a process crash.

Vercel CLI may withhold Sensitive environment values. Configure staging credentials
locally rather than copying keys into chat or source. Hourly Codex heartbeat monitoring is active: `kraxxdeceit-production-health`. It checks
health and demo with bounded GET requests, confirms failures once, and alerts this chat
on failure or recovery. It never creates cases or consumes model quota. Execution depends
on the Codex automation environment; this does not establish independently hosted 24/7
coverage. The user reports manual localhost checks; no external alert destination or
formal incident owner is recorded.

## v1 research modes

`POST /api/demo` accepts only optional fixed `scenario` and `mode` values. Missing mode
uses `deterministic`; its fixed page-read, screenshot and finish sequence calls no AI
model, while collecting actual browser/system evidence. `mode: "ai"` is explicitly
experimental and requires OpenRouter plus `openrouter/free` or a configured `:free` model
and a credential. Paid models are rejected on this route. Deterministic mode still needs
sandbox authentication, the verified image and distributed Redis admission in production.
Case exports record `experiment.executionMode`, zero deterministic AI model requests,
and provider turns separately. Older imports without these optional fields remain valid.
