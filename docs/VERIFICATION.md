# Release verification

Recorded validation for **v4.1.0**, **6 October 2026**. These are release observations, not a guarantee of current external-service availability. This consolidated record replaces older phase notes.

| Check | Recorded result |
| --- | --- |
| Regression suite | 171 passed, zero skipped |
| TypeScript and production build | Passed |
| Pinned browser image | Offline Docker and disposable remote sandbox checks passed before release; runtime contract checks remain enabled |
| Runtime dependency audit | Zero reported vulnerabilities at the recorded check |
| Live isolated Redis checks | Rate/concurrency limits, lease expiry/release, and simulated backend outage passed; exact test keys removed |
| Live two-user Supabase checks | Ownership isolation, forged-owner/update/anonymous rejection, and concurrent owner quota checks passed; exact test rows removed |
| Public four-step study | All four deterministic runs completed; zero model requests; matching case digests; exact sandboxes observed stopped |
| Study rate limit and resume | Real HTTP 429 observed; partial export imported in a fresh session and resumed after the rate window |
| Deployed workspace | Sign-in/save/open/export/delete/sign-out, HTTP-only cookies, private no-store responses, and anonymous rejection passed |
| Visitor routes | Desktop/mobile navigation and supported feature routes passed without observed runtime errors or mobile overflow |
| Fresh deployed neutral case | Completed on v4.1.0; matching digest, zero model requests; sandbox observed stopped |

The independent production-health workflow also completed a [successful manual run](https://github.com/Basilmellow/KraxxDeceit/actions/runs/37451366304). Deliberate outage notification delivery was not tested. Hourly scheduling can be delayed; liveness does not establish database, Redis, model, or research readiness.

## Experimental AI limitation

The checked free model completed only one of four bounded synthetic provider-contract attempts; the remaining attempts reported network errors. Tools in that check were simulated. It did not establish real-browser AI reliability, and no paid model was used. Deterministic execution remains the public default.

## Interpretation limits

The complete study verifies the public deterministic workflow, including its admission limits and resume behavior. It is not a statistical causal experiment, an AI susceptibility evaluation, or a sustained-load test. Recorded image checks do not resolve clean-machine base-image reproducibility. See the [image documentation](../sandbox/README.md) and [telemetry report](sandbox-capability-report.md).
