# Operations

Keep public execution restricted to fixed scenarios. Keep arbitrary URL investigations disabled and internal probes restricted to their intended development gates. Do not widen network policies to make an investigation succeed.

## Configuration

Use [.env.example](../.env.example) as the configuration reference. Store credentials locally or in the deployment provider's protected environment settings. Do not copy test account passwords into production. Private storage uses a Supabase publishable/anon key, never a service-role key; apply the reviewed migration to the intended project and provision accounts explicitly.

Workspace limits are 20 cases / 20 MiB per owner and 200 cases / 100 MiB globally. These are payload quotas, excluding provider overhead and backups. Public admission allows three runs per client per ten minutes, one concurrent run per client, and three concurrent runs globally. A four-step study may require waiting; preserve partial progress with study JSON.

## Verification commands

- `npm run typecheck`, `npm run test:experiment`, and `npm run build` are local checks.
- `npm run verify:admission -- --run` uses configured staging Redis credentials, isolated test keys, and explicit cleanup. It checks admission without starting compute.
- `npm run verify:private-storage -- --run` requires two distinct confirmed test users and the applied database migration. Read the script's required environment variables before running it; keep credentials out of reports.
- `npm run smoke:neutral-demo -- --run` creates a real bounded remote sandbox with the deterministic provider. It consumes sandbox resources, not model quota.
- `npm run verify:provider-contract -- --run --model=<fixed-model>:free` exercises synthetic provider context with simulated tools. Verify current zero pricing and supported capabilities before running it. A pass does not establish real-browser reliability.

Remote checks are opt-in and are not part of the regression suite. Review completion state, budget use, digests, and cleanup rather than treating HTTP 200 as successful research.

## Release and rollback

Verify the intended linked Vercel project before deployment. A deployment dry-run manifest can be supplied to `npm run capture:release -- --run --manifest=<path>` to capture reviewed source and per-file checksums. Keep archives in the ignored local artifacts directory. Source capture excludes runtime secrets and does not back up service configuration.

Record the current and previous verified deployment IDs privately for each release. Use Vercel's rollback operation for an application regression after selecting the intended previous deployment. Application rollback does not revert database migrations, saved rows, service credentials, or upstream outages.

## Health and incidents

The [production-health workflow](../.github/workflows/production-health.yml) performs bounded read-only GET checks on health and demo once per scheduled run. It confirms a failure once and uses no model or sandbox quota. Notifications depend on the maintainer's GitHub settings. Scheduled execution can be delayed or disabled; inspect the Actions tab periodically.

Health reports application liveness only. Check the intended domain/version and bounded logs when investigating failure. Correlate request IDs without publishing credentials or private evidence. Redis failure must reject investigations before compute creation. Confirm sandbox cleanup rather than assuming a request's completion released every resource.

Provider failures can retain browser evidence while marking research incomplete. Exports are not automatically anonymized. Store incident details and private evidence outside the public repository.
