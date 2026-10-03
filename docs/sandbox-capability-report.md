# KraxxDeceit sandbox capability report

**Status: remote verification unverified.** No production or preview deployment was created from this run, and no request reached a Vercel deployment.

## Verified locally

- `npm run typecheck` passed.
- `npm run build` passed. Next.js included `/api/internal/probe-sandbox` as a dynamic route.
- The probe uses one disposable sandbox, a 50-second sandbox lifetime, bounded command timeouts, and calls `sandbox.stop()` in `finally`.
- The route accepts only POST, ignores request bodies, returns JSON, and requires both `KRAXX_INTERNAL_PROBE_ENABLED=true` and a matching `Authorization: Bearer …` value. When either check fails, it returns 404. It returns a bounded field allowlist and no token or environment variables.

## Remote observations

| Check | Status | Result |
| --- | --- | --- |
| Deployment URL/environment | **UNVERIFIED** | No deployment was created. |
| Vercel project lookup | **UNVERIFIED** | Vercel CLI could not reach its API from this environment. |
| Sandbox creation and `KRAXX_SANDBOX_OK` | **UNVERIFIED** | No remote route invocation occurred. |
| Kernel, architecture, distribution, procfs/sysfs, cgroup | **UNVERIFIED** | No remote sandbox result. |
| Process telemetry | **UNVERIFIED** | No remote sandbox result. |
| Local TCP/socket telemetry | **UNVERIFIED** | No remote sandbox result. |
| eBPF tools, filesystem, capabilities | **UNVERIFIED** | No remote sandbox result; no BPF attachment was attempted. |
| Fallback provider in a remote sandbox | **UNVERIFIED** | No remote sandbox result. |

The deployment attempt stopped during project lookup with `connect EACCES 34.160.81.0:443`. This is a local network-access failure before Vercel deployment or sandbox execution, and provides no evidence about sandbox telemetry. The earlier local sandbox probe was similarly blocked before `Sandbox.create()` completed.

## Probe route state

The temporary route remains in the source tree but is disabled unless both `KRAXX_INTERNAL_PROBE_ENABLED=true` and `KRAXX_INTERNAL_PROBE_TOKEN` are configured. The local environment does not have the enable flag or token set, so the route is not callable there. It must remain disabled in normal deployments; after a successful remote result, remove the route or redeploy with the enable flag unset.

No claim is made about production kernel details, process/socket observability, eBPF availability, or the preferred runtime provider. The current fallback recommendation remains unverified until the probe runs in a Vercel-hosted execution path.
