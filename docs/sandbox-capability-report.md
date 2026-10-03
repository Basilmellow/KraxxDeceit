# KraxxDeceit Sandbox Capability Report

Live measurements from a disposable Vercel Sandbox, 2026-10-03. The probe ran fixed health, Linux-interface, `sleep 2`, and loopback-only socket checks. The subsequent application check contacted only `https://example.com/`.

## Verified

- **Sandbox lifecycle:** `Sandbox.create` succeeded; `node -e "console.log('KRAXX_SANDBOX_OK')"` passed; `Sandbox.stop` succeeded.
- **Linux:** kernel `6.18.49`; architecture `x64`; distribution `Ubuntu 26.04.1 LTS` (`ubuntu`).
- **Interfaces:** `/proc`, `/proc/self/stat`, `/proc/net/tcp`, `/proc/self/cgroup`, `/sys`, `/sys/kernel`, bpffs (`/sys/fs/bpf`), and cgroup v2 (`/sys/fs/cgroup/cgroup.controllers`) were present. The observed cgroup was `0::/`.
- **Process observation:** `ProcfsTelemetryProvider` observed the controlled `sleep 2` start and exit: PID `930`, executable `/usr/lib/cargo/bin/coreutils/sleep`, parent PID `1`.
- **Controlled network:** the probe's Procfs-backed sampler observed an `ESTABLISHED` loopback TCP socket on port `36553`. A separate `SocketTelemetryProvider` run observed another `ESTABLISHED` loopback connection on port `44589`.
- **Outbound connection observation:** the application investigation of `https://example.com/` completed with HTTP 200 and captured the browser request. During that sandbox run, socket telemetry captured two established non-loopback TLS sockets on port 443. No other external destination was tested.

## Unverified

- No outbound destinations other than the explicitly requested `example.com` were tested.
- Windows host processes, host files, and host telemetry were not inspected.
- No general claim is made about socket attribution for arbitrary browser traffic beyond the observed test run.

## eBPF

- `bpftool`: unavailable. `bpftrace`: unavailable.
- BPF filesystem: present. Effective `CAP_BPF` and `CAP_SYS_ADMIN` were observed.
- Kernel BTF metadata (`/sys/kernel/btf/vmlinux`): unavailable.
- Probe result: **UNAVAILABLE_FOR_TOOLING**. Tooling and BTF prerequisites were missing, so no eBPF program was loaded and no attachment was attempted. **LIVE_ATTACHMENT_UNVERIFIED**. This report does not claim eBPF support.

## Fallback telemetry

- `ProcfsTelemetryProvider`: **PASS** for controlled process start/exit and observed PID, executable, and parent PID.
- `SocketTelemetryProvider`: **PASS** for a separate controlled loopback connection.
- The providers use the existing procfs/socket-table sampling implementation; the second provider was instantiated and exercised independently after its control files were reset inside the disposable Sandbox.
- Browser and Playwright request telemetry remains the primary source for page-level activity. Procfs and socket-table observations add sandbox system context.

## Recommended provider

Use browser/Playwright telemetry plus `ProcfsTelemetryProvider` and `SocketTelemetryProvider` as the baseline system-observation stack. Keep eBPF disabled until required tooling and kernel BTF are present and a harmless live attachment test is separately verified.

Machine-readable measurements: [`sandbox-capability.json`](./sandbox-capability.json).
