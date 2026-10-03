/** Static capability probe that runs inside the disposable sandbox. It never executes eBPF programs. */
export const EBF_PROBE_SCRIPT = String.raw`
const fs = require('node:fs');
const candidates = ['/usr/sbin/bpftool','/usr/bin/bpftool','/sbin/bpftool','/usr/local/bin/bpftool'];
const traceCandidates = ['/usr/sbin/bpftrace','/usr/bin/bpftrace','/sbin/bpftrace','/usr/local/bin/bpftrace'];
const bpftool = candidates.find((path) => fs.existsSync(path));
const bpftrace = traceCandidates.find((path) => fs.existsSync(path));
const btf = fs.existsSync('/sys/kernel/btf/vmlinux');
const bpfFs = fs.existsSync('/sys/fs/bpf');
let caps = 0n;
try { const status = fs.readFileSync('/proc/self/status','utf8'); const match = status.match(/^CapEff:\s*([0-9a-f]+)$/m); if (match) caps = BigInt('0x' + match[1]); } catch {}
const hasBpf = Boolean(caps & (1n << 39n));
const hasSysAdmin = Boolean(caps & (1n << 21n));
const available = Boolean((bpftool || bpftrace) && btf && bpfFs && (hasBpf || hasSysAdmin));
const missing = [];
if (!bpftool && !bpftrace) missing.push('bpftool and bpftrace are unavailable');
if (!btf) missing.push('kernel BTF metadata is unavailable');
if (!bpfFs) missing.push('bpffs is unavailable');
if (!hasBpf && !hasSysAdmin) missing.push('required BPF capabilities are unavailable');
return { available, ...(!available ? { reason: missing.join('; ') } : {}), tools: { bpftool: Boolean(bpftool), bpftrace: Boolean(bpftrace) }, kernelInterfaces: { btf, bpfFs }, capability: { bpf: hasBpf, sysAdmin: hasSysAdmin } };
`;

export type EbpfProbeResult = {
  available: boolean;
  reason?: string;
  tools?: { bpftool: boolean; bpftrace: boolean };
  kernelInterfaces?: { btf: boolean; bpfFs: boolean };
  capability?: { bpf: boolean; sysAdmin: boolean };
};
