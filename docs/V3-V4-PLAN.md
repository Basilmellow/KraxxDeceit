# KraxxDeceit v3 and v4 delivery

On 2026-10-04 the user selected v3 authentication/private storage, followed by v4
advanced experiments, and requested a free service. Supabase Free was selected.

## v3 - controlled private workspace

Supabase-verified sessions in HTTP-only, same-site cookies. Every case operation
authenticates server-side and filters by that user; PostgreSQL RLS independently
enforces ownership. Only publishable/anon keys; secret/service-role keys rejected.
Explicit save/open/delete, bounded immutable case payloads and existing local exports.
Accounts provisioned by the project owner; no public signup/email delivery is claimed.

## v4 - counterbalanced controlled studies

Four explicit sequential runs: injection, neutral, neutral, injection (or inverse).
Two repetitions per scenario, fresh sandboxes, fixed deterministic actions, pinned
image and compatible execution metadata. Keep public admission unchanged, including
three runs per client per ten minutes; a study may span rate-limit windows. No automatic
retry or scheduled compute. Validate each case digest/fixture/experiment configuration,
reject duplicates/incomplete/AI runs, retain partial progress and full evidence.
Descriptive repeatability/detector results with JSON/CSV/Markdown/ZIP exports. No
statistical significance or causal claim, and no AI susceptibility claim.

Deployment follows local validation and live ownership checks. Transferring Supabase
configuration to Vercel production was explicitly approved after an automatic
review rejection. Only the URL and publishable key were transferred as Sensitive
production variables; test passwords and service-role credentials were excluded.
