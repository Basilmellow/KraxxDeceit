# Controlled public launch

Launch scope: public fixed-fixture research and local exports, invite-only private
case accounts, and deterministic repeated studies. Future enterprise/research
capabilities in MASTER-PLAN.md are not required by this launch and are not claimed.

## Release gates

- [x] Homepage routes visitors to supported features; arbitrary public URL form is
  available only during local development.
- [x] Public guide explains research modes, rate windows, progress preservation,
  ownership, explicit uploads, deletion and interpretation limits.
- [x] Deterministic research remains the default; paid model tests are not used.
- [x] Refreshed regression suite: 171 passing tests, zero skips.
- [x] Refreshed isolated Redis concurrency/rate/lease/outage checks and exact cleanup.
- [x] Refreshed live Supabase two-user ownership and concurrent quota checks, exact cleanup.
- [x] Runtime dependency audit: zero reported vulnerabilities on 2026-10-06.
- [x] Complete four-step public UI study across a real admission window, including
  retained progress, export/re-import and real HTTP 429 recovery.
- [x] Local production build, homepage/guide desktop and mobile checks.
- [x] Independent GitHub Actions monitor observed passing after publication:
  https://github.com/Basilmellow/KraxxDeceit/actions/runs/37451366304
- [x] Reviewed source captured without configured credentials; implementation committed
  and pushed as 16a9f9c. Clean final source manifest records commit and tree status.
- [x] Production homepage/guide/mobile checks and private workspace regression passed;
  health returned 4.1.0. Deployment dpl_44w1KZLByV79D7pXUwGqFLWEtH7d.
- [x] Fresh v4.1 deterministic case completed with a matching digest and no model requests.

## Operations

Operational maintainer: repository owner Basilmellow. Non-sensitive bug reports use
the repository issue tracker. New private accounts are provisioned by the project
owner; no public signup or email delivery is advertised. Retention and provider
backups remain described in the guide and OPERATIONS.md.

The GitHub production-health workflow runs hourly plus manual dispatch, independently
of this local Codex chat. It performs bounded GET requests for health/demo, confirms
a failure once, distinguishes monitor network errors and creates no research work.
No database/model/Redis credentials or npm dependencies are needed. Failed workflow
runs appear in Actions; notification delivery depends on the maintainer's GitHub
notification settings. GitHub schedules can be delayed and public inactive-repository
schedules can be disabled; this is not an uptime SLA. Reference:
https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule

The user confirmed failed Actions notifications enabled on 2026-10-06. Notification
delivery itself was not tested with an intentional outage or an external message.
The independent monitor's observed manual run succeeded; future scheduled runs remain
subject to GitHub's scheduler. No ongoing provider health guarantee is made.

Keep the existing Codex heartbeat for chat failure/recovery alerts. Neither liveness
monitor proves successful research or upstream readiness. Review dependency usage,
Supabase availability/storage and sandbox cleanup when investigating an incident.
Use the verified v4 deployment dpl_EqcBZs8czxzXS4kYchqY3WV7iL2u for an application
rollback if this launch patch regresses; rollback leaves saved Supabase cases intact.

## Release limitations

Free AI reliability remains experimental even if an individual provider check passes.
The complete public study is a bounded functional test, not sustained load or a
statistical significance test. There is no production-scale reliability claim.
Studies are exported locally; reload can lose unexported progress. Whole-study
persistence, public sharing/redaction/signatures, self-service accounts, teams and
expanded public targets are future work requiring separate scope and validation.

## Using the project publicly

Use PROJECT-SUMMARY.md for factual project/resume descriptions. Share the public
homepage/demo and source repository. Review screenshots and exported evidence for
private data before posting. Do not publish account credentials or local test artifacts.
