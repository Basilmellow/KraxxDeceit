# v4 controlled repeated studies

Date: 2026-10-04. Local and production verification passed within the scope below.

168 regression tests passed with no skips; TypeScript passed. Study validation rejects
digest changes, duplicates, gaps, incompatible execution configuration, altered fixture/
experiment metadata, incomplete cases and AI runs. ZIP checksums cover exact file bytes;
CSV formula-like cells are escaped, and filenames are fixed.

Manual four-run engine exercise (not a public admission/load test):

| Run | Scenario | Case |
|---|---|---|
| 1 | prompt-injection | CASE-20261004-775D0890 |
| 2 | neutral-control | CASE-20261004-4B9F0344 |
| 3 | neutral-control | CASE-20261004-8C46453C |
| 4 | prompt-injection | CASE-20261004-7A6E41A6 |

All four completed, matching normalized digests and fixed fixture/experiment hashes,
compatible pinned image/browser/limits, zero model requests. Sandboxes were observed
stopped. Live evidence is retained only in ignored local QA files.

Local browser exercised one real run through /api/demo (CASE-20261004-CE959D5F),
then a simulated 429 with Retry-After: completed progress retained, next run disabled,
no automatic retry. Imported the complete live study, inspected a case, downloaded
JSON/CSV/Markdown/ZIP, verified embedded evidence and exact checksums. Tampered import
was rejected without replacing the current study. Imports/exports made no API calls.
Mobile layout and zero browser runtime errors passed; screenshots visually inspected.

Local and Vercel production builds passed. Deployment
dpl_EqcBZs8czxzXS4kYchqY3WV7iL2u; public health returned 4.0.0.
Production study workflow repeated the local checks with real admitted case
CASE-20261004-C27A49C8 (zero model requests), simulated 429 recovery, live complete
study import, four export formats, exact checksums, tamper rejection, mobile layout
and zero runtime errors. Private workspace sign-in/save/open/export/delete/sign-out,
secure HTTP-only cookies, private no-store responses and anonymous denial passed again.
Exact saved test case deleted; the production run sandbox was checked stopped.
Local dev restored at http://localhost:3000.

Deployment source capture verified all private/study routes and zero configured
credential matches. Final source archive and per-file manifest are held under
.codex-localappdata/releases/4.0.0; its manifest records the source commit and tree status.

## Product and operational limits

Four fixed, counterbalanced deterministic runs describe collector/fixture repeatability,
not AI susceptibility, statistical significance or causation. Import digests establish
consistency, not authenticity. Missing records do not establish absence of behavior.
Public admission remains three runs/client/ten minutes with existing concurrency limits;
four-run public studies must span rate windows. No batch endpoint or automatic retry.
The complete manual engine exercise does not establish a completed four-run public UI
study or a production load test. The UI admission recovery path uses a simulated 429;
existing live isolated Redis tests verify actual rate/concurrency behavior separately.

Study state stays in the tab until explicitly exported. Reloading can lose unexported
progress. Study JSON is bounded to 13 MiB; individual cases retain the 3 MiB bound.
ZIP contains study.json with all case evidence, descriptive report.md, observations.csv,
README.txt and SHA256SUMS.txt. No automatic anonymization or public sharing links.
Individual cases can be explicitly saved through the existing private workspace;
whole studies are not stored on the server.

Reproduce the manual bounded engine check with
`npx tsx scripts/verify-controlled-study.ts --run`; it runs four sequential fixed
sandboxes without model calls. Public studies always use the existing admitted demo route.
