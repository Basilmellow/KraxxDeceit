# Sandbox telemetry capability probe

Run `npm run probe:sandbox` from a network-enabled Vercel execution environment. The command creates one disposable sandbox, runs a fixed health check, samples a short `sleep 2` process and a local loopback TCP connection, runs the existing read-only eBPF capability check, and stops the sandbox. It accepts no URL. A temporary POST route also reuses this probe; it returns 404 unless both `KRAXX_INTERNAL_PROBE_ENABLED=true` and a matching bearer token are configured. Keep that flag unset in normal deployments. `npm run sandbox:probe` is an alias.

## Image and instrumentation

The SDK is `@vercel/sandbox` 3.5.1. When `image` is omitted, its documented default is `vercel/sandbox/universal:latest`; the runtime kernel, distribution, and interfaces must still come from the live report. No custom image is configured by this probe.

The current fallback samples `/proc` and Linux socket tables. A future eBPF image may need `bpftool`, `bpftrace`, libbpf tooling, kernel BTF metadata (often kernel headers/BTF packages), mounted bpffs, and the minimum kernel capabilities required by the selected instrumentation. Adding packages alone cannot provide kernel features or permissions. The probe checks for `CAP_BPF` and `CAP_SYS_ADMIN`; it does not load a program or test attachment, so it never reports attachment support.

## Observed capability status

A recorded remote probe is available in the [capability report](sandbox-capability-report.md) and [machine-readable result](sandbox-capability.json). Treat it as a dated runtime observation, not a guarantee about every sandbox. The probe does not establish eBPF program attachment. Application telemetry uses bounded process/socket sampling and browser observations.

A custom image may be useful if the live probe shows the default image lacks required user-space tools and the Vercel runtime can provide the needed kernel interfaces and capabilities. The live report should guide that decision; a custom image cannot by itself grant host kernel privileges.
