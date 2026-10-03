# Sandbox telemetry capability probe

Run `npm run probe:sandbox` from a network-enabled Vercel execution environment. The command creates one disposable sandbox, runs a fixed health check, samples a short `sleep 2` process and a local loopback TCP connection, runs the existing read-only eBPF capability check, and stops the sandbox. It accepts no URL. A temporary POST route also reuses this probe; it returns 404 unless both `KRAXX_INTERNAL_PROBE_ENABLED=true` and a matching bearer token are configured. Keep that flag unset in normal deployments. `npm run sandbox:probe` is an alias.

## Image and instrumentation

The SDK is `@vercel/sandbox` 3.5.1. When `image` is omitted, its documented default is `vercel/sandbox/universal:latest`; the runtime kernel, distribution, and interfaces must still come from the live report. No custom image is configured by this probe.

The current fallback samples `/proc` and Linux socket tables. A future eBPF image may need `bpftool`, `bpftrace`, libbpf tooling, kernel BTF metadata (often kernel headers/BTF packages), mounted bpffs, and the minimum kernel capabilities required by the selected instrumentation. Adding packages alone cannot provide kernel features or permissions. The probe checks for `CAP_BPF` and `CAP_SYS_ADMIN`; it does not load a program or test attachment, so it never reports attachment support.

## Observed capability status

No live remote probe result is recorded in this checkout yet. The local development environment previously denied the SDK connection with `EACCES ...:443` before `Sandbox.create()` reached Vercel. That is an authentication/network-path blocker, not evidence about telemetry inside a Vercel Sandbox. Until `npm run probe:sandbox` completes remotely, kernel details, process/socket observation, and eBPF capabilities are **unobserved**. Do not infer production support from the SDK default image or local results.

A custom image may be useful if the live probe shows the default image lacks required user-space tools and the Vercel runtime can provide the needed kernel interfaces and capabilities. The live report should guide that decision; a custom image cannot by itself grant host kernel privileges.
