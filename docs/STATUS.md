# Project status

Current controlled release: **4.1.0**. Status reviewed on **6 October 2026**.

| Area | Available scope |
| --- | --- |
| Public demo | Fixed injection/control fixtures, deterministic default, optional experimental free AI |
| Evidence | Browser observations, bounded telemetry, timeline, graph, hypotheses, case integrity digest |
| Reports | Local JSON, Markdown, PDF, ZIP; no automatic publication or anonymization |
| Private workspace | Invite-only accounts; owner-scoped save/open/delete with storage quotas |
| Studies | Four deterministic runs, partial-progress import, JSON/CSV/Markdown/ZIP exports |
| Monitoring | Hourly read-only GitHub Actions liveness checks with failure confirmation |

See [verification](VERIFICATION.md) for observed release checks. Availability of a feature does not imply that every external service is currently healthy.

## Remaining work and intentionally excluded scope

- Establish repeatable free-model reliability before making AI research the default.
- Provide and verify a complete clean-machine build recipe for the custom sandbox base image; the deployed registry image is private.
- Validate longer-running operational behavior and alert delivery; the release checks do not establish sustained-load capacity or an uptime SLA.
- Revisit public signup, password recovery, public case links, full-study cloud storage, and broader experiments only as separately designed features.
- Keep arbitrary public URL investigations disabled unless their abuse controls and operating costs are reviewed for that scope.

No date or delivery commitment is implied by this list.
