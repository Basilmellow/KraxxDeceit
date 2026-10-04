# v3 private workspace verification

Date: 2026-10-04. Local and production private workspace verified.

167 tests passed, no skips; typecheck passed. Includes future v4 protocol unit checks.
Live Supabase test accounts: own read succeeded; cross-owner read/delete denied,
forged owner rejected, UPDATE disallowed, anonymous SELECT denied. A 19-record
quota state plus two simultaneous inserts admitted exactly one at the 20-case cap.
All 20 exact verification records were deleted. No unrelated rows or users modified.
Local browser: sign-in, HTTP-only same-site session cookies, no-store cache headers,
explicit save, open, JSON export, delete, logout, anonymous rejection and mobile passed.
Zero runtime errors. SQL applied by user; key and account B corrected by user.

## Boundaries

- Authenticated server getUser validation on every private operation; RLS remains active.
- Immutable cases: no UPDATE grant/policy. Save normalizes schema, removes raw logs,
  enforces 3 MiB input and checks recorded digest consistency. Legacy missing digests
  remain labeled; authenticity is not established by a digest.
- Database caps: 20 cases/20 MiB payload per owner; 200 cases/100 MiB payload globally.
  Trigger uses a transaction advisory lock for race-safe counting. These are payload
  limits, not a promise about total provider disk/backup accounting.
- CSRF/origin check on writes, bounded body reads, generic errors, no secret logging.
- Sign-in admission uses an isolated kraxx_auth Redis namespace and existing bounded
  rate/concurrency limits; production fails closed if protection is unavailable.
- No browser Supabase SDK or service-role key. Password cleared from UI after attempt.
- Controlled rollout uses accounts provisioned by project owner; no self-signup, password
  reset or SMTP capability is claimed. Existing public controlled demo is unchanged.
- Explicit deletion removes saved row; backups follow provider policies. No automatic
  retention expiry or independently hosted uptime coverage is claimed. Free projects
  can pause after inactivity; provider availability remains an operational dependency.

The user explicitly approved transferring only SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY
to Sensitive Vercel production variables after the initial approval review rejection.
No test account passwords or service-role key were transferred.
Production release: dpl_9tWBfKVbBn9NsAWUSGVupw25YWS5. Health returned 3.0.0.
Production sign-in, secure HTTP-only cookies, private no-store responses, save/open/
JSON export/delete, sign-out, anonymous denial and mobile layout passed with zero
runtime errors. Exact UI test record deleted.
An initial deployment omitted private routes because an unanchored cases/ ignore
rule matched app/api/cases. Both ignore rules now exclude only /cases/; corrected
deployment includes both private routes and passed the complete production flow.
The initial v3 source archive predates this packaging fix and is not the final release
source record; v4's reviewed archive includes these routes and the correction.
