# KraxxDeceit delivery status

Updated 2026-10-06. The master plan is the original architectural snapshot; this file records observed delivery.

| Phase | State | Verification |
|---|---|---|
| v0.3 prebuilt sandbox | Deployed previously | v0.3-verification.md |
| v0.4 evidence graph | Deployed previously | v0.4-verification.md |
| v0.5 differential comparisons | Deployed previously | v0.5-verification.md |
| v0.6 bounded AI research | Deployed; provider reliability limited | v0.6-verification.md |
| v0.7 case explorer/import/report | Implemented, locally checked and deployed | v0.7-verification.md |
| v0.8 fixed public demo scenarios | Implemented, locally checked and deployed; production AI partial | v0.8-verification.md |
| v0.9 reproducibility/export consistency | Implemented, locally checked and deployed; production AI incomplete | v0.9-verification.md |
| v0.9.1 reliability preparation | Deployed; one production AI completion, fixed free model gate still open | v0.9.1-verification.md |
| v1 controlled public research platform | Deployed and verified | Deterministic default; optional free AI experimental; v1-verification.md |
| v2.0 PDF and research bundles | Deployed and verified | v2.0-verification.md and V2-PLAN.md |
| v3 authentication/private storage | Deployed and verified | v3-verification.md |
| v4 advanced controlled studies | Deployed and verified within bounded scope | v4-verification.md and V3-V4-PLAN.md |
| v4.1 controlled public launch | Deployed; launch gates passed within the documented scope | v4.1-verification.md and LAUNCH-CHECKLIST.md |

Current public release: **4.1.0**, https://kraxxdeceit.kraxxsec.com/demo.

Completed this batch: three individually built/deployed phases. Final suite 150 tests, no skips. Local deterministic runs completed; live production model failures are retained and labeled incomplete. Case imports stay local, no custom URLs/experiment definitions/model parameters accepted by demos. Arbitrary URL investigation is disabled in production. Changes were uncommitted during validation; the user subsequently authorized commit and push.

## Historical v1 preparation gates (before the product decision below)

- Validate a fixed model/provider against strict research tool/evidence output across both scenarios; distinguish service failure, invalid evidence and actual completed research. Current dynamically routed free model does not meet this reliability gate.
- Run a bounded operational exercise for distributed admission/backend outage and capacity/cleanup under concurrent work; unit coverage exists, production multi-client reliability/load evidence is not recorded.
- Deployment source and dependency lock are now captured in a verified local v0.9.1 archive and per-file manifest. This is an uncommitted snapshot; no signed/published Git release or runtime-secret backup is claimed.
- Confirm support/operational ownership, rollback procedure and monitoring for the intended public launch. No uptime promise or public-launch stability claim is made.

Private case storage and local PDF reports are now deployed. Unrestricted target
investigation remains outside the controlled public release.

## Latest v1 gate progress

User supplied staging Redis credentials. Live isolated-key concurrency/rate/lease/outage checks passed with exact key cleanup. Two concurrent deterministic remote browser cases completed with matching digests, released admission leases and stopped sandboxes. Three fixed free models were checked; none completed every bounded provider-contract check. The patched free router completed one production investigation from supplied evidence. No paid model tests or production model configuration changes were made. Remaining decisions: reliable fixed free model and monitoring/incident ownership; broader production load/monitoring validation remains. See v0.9.1-verification.md and OPERATIONS.md.

## v1 product decision (2026-10-04)

The user selected deterministic research as the default, with optional free AI explicitly experimental. The core controlled platform therefore does not depend on free-model reliability. AI remains bounded, evidence-validated and failure-visible; fixed free model reliability is unresolved. Hourly Codex chat monitoring is active (kraxxdeceit-production-health), with failure/recovery notifications. This is a local Codex automation, not independently hosted continuous uptime coverage.

## v1 release outcome

151 tests passed with no skips; typecheck, local and Vercel production builds passed. Both
production default scenarios completed with zero AI model requests and engine-origin
assessments. Desktop/mobile/download/digest/tamper checks passed. Local dev remains at
http://localhost:3000/demo. Deployment dpl_HPkgmSNbyKJNNUuXYMin2qEA33Ga. Verified
source archive includes 121 files with no configured credential matches; Git publication was subsequently authorized by the user. See v1-verification.md for case records and remaining limits.

## v2.0 scope

User selected local PDF reports and sharing-ready ZIP exports. 156 tests passed;
local download, checksum, evidence preservation, PDF render and mobile checks passed.
Authentication/private storage and controlled publication are later phases.

V2.0 public download checks passed: PDF, ZIP, exact file checksums, preserved evidence,
comparison limits, desktop/mobile and zero export API calls. A fresh deterministic
research case completed and its sandbox stopped. Local and production builds and
health passed. The user authorized committing the verified v2 release.

V2 committed/pushed as fb982ca. V3 live Supabase ownership and quota-race checks
passed with exact cleanup; local and production private workspace flows passed.
V4's four-run manual engine study, local UI, imports/exports and rate-limit recovery
checks passed. Production v4 health, one admitted real study run, import/export/checksum/
tamper/mobile checks and the private workspace regression passed. Public admission
limits remain unchanged. Deployment dpl_EqcBZs8czxzXS4kYchqY3WV7iL2u.

The complete four-step public UI study passed on 2026-10-06, including a real rate
limit, local export/re-import and continuation across the actual window. Refreshed
Redis admission and Supabase ownership/quota checks passed with exact cleanup.
171 tests passed, zero skips. One current fixed free model completed only one of four
bounded provider-contract attempts; AI remains experimental without a reliability
claim. Launch uses public deterministic research and invite-only private accounts.
Public homepage/guide/mobile and private workspace regression checks passed on v4.1.
Independent GitHub health monitor run 37451366304 succeeded; user confirmed failed-run
alerts enabled. Fresh production case CASE-20261006-987C469F completed with a matching
digest and zero model requests. See v4.1-verification.md for the final release record.
