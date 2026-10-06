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
The archive records the source commit and working-tree status. Preserve the Git
commit separately; source checksums do not establish authenticity or back up secrets.

## Rollback and incident checks

Known rollback for v2.0: v1.0.0 `dpl_HPkgmSNbyKJNNUuXYMin2qEA33Ga`.
Use `vercel rollback dpl_HPkgmSNbyKJNNUuXYMin2qEA33Ga --yes
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

## v2.0 exports

PDF and ZIP are produced in the browser from the loaded case, with no server export
endpoint. Import and export do not create sandboxes or call models. Export failure
leaves the original JSON/Markdown controls available. Bounds: 3 MiB case input,
100,000 report characters, 40 PDF pages. Download and review evidence before sharing;
there is no automatic anonymization or public publishing. Verify exact ZIP file
checksums against SHA256SUMS.txt separately from the normalized case digest.

## v3 private workspace and v4 studies

Production requires SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY; configure only the
publishable/anon key as Sensitive Vercel configuration. Never use a service-role key
or transfer test account credentials. Apply the reviewed private_cases migration to
the intended Supabase project. Accounts are provisioned by the project owner; public
signup, password reset and email delivery are not part of this release.
HTTP-only cookies, server getUser checks, explicit owner filters and database RLS
protect case operations. Save is explicit and immutable; delete removes the row.
Payload caps: owner 20 cases/20 MiB, global 200 cases/100 MiB; provider overhead and
backups are separate. Monitor Supabase availability and storage; free projects may
pause when inactive. GET /api/health is application liveness, not a database probe.

Known application rollback for v4: verified v3 deployment
dpl_9tWBfKVbBn9NsAWUSGVupw25YWS5. V3 rollback: verified v2 deployment
dpl_E8WNQBrAud9rAeZ2SiL8TsxNQ8Jo. Use the existing Vercel rollback command with
the chosen ID; rollback does not remove the Supabase database or its saved rows.

/experiments records four explicit deterministic controlled runs. Keep the existing
public admission limits and wait across windows. Do not raise limits for a study or
retry automatically. Download study JSON to preserve partial progress; import and
export are local. Full study storage/public links and AI susceptibility experiments
are not enabled. See v4-verification.md for observed scope and limitations.

## Controlled public launch

The v4.1 release keeps private accounts invite-only and public research restricted
to fixed fixtures. /guide explains visitor workflows and evidence handling.
PROJECT-SUMMARY.md supplies factual portfolio/resume descriptions. Use
LAUNCH-CHECKLIST.md and v4.1-verification.md for launch gates and current observations.
The repository owner maintains this personal research project; non-sensitive support
uses the repository issue tracker. Do not put secrets or private evidence in issues.

The production-health GitHub Actions workflow provides an independent hourly
read-only liveness check without service credentials or model/sandbox work. It retries
a failed check once, distinguishes network-access errors, and fails the workflow for
actionable states. Failed-run notifications depend on the owner's GitHub settings;
the existing Codex heartbeat continues to provide chat failure/recovery alerts.
Review Actions periodically: schedules can be delayed or disabled for inactive public
repositories. Neither monitor establishes an SLA or database/Redis/research readiness.
