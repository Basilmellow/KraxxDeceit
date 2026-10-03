import { Sandbox } from "@vercel/sandbox";
import { ProcfsTelemetryProvider } from "./telemetry/provider";
import { DENIED_SANDBOX_SUBNETS } from "./url-safety";

const HEALTH_CHECK = `console.log("KRAXX_SANDBOX_OK")`;
const SYSTEM_INFO = String.raw`
const fs = require('node:fs');
const os = require('node:os');
const exists = (p) => fs.existsSync(p);
const read = (p) => { try { return fs.readFileSync(p, 'utf8'); } catch { return ''; } };
const osRelease = read('/etc/os-release');
const distro = osRelease.split('\n').filter((line) => /^(ID|PRETTY_NAME)=/.test(line)).map((line) => line.replace(/^([^=]+)=/, '$1=').replace(/^([^=]+)="?(.*?)"?$/, '$1=$2'));
const uid = typeof process.getuid === 'function' ? process.getuid() : null;
const passwd = read('/etc/passwd').split('\n').find((line) => uid !== null && line.split(':')[2] === String(uid));
const cgroup = read('/proc/self/cgroup').trim().split('\n').filter(Boolean).slice(0, 12);
console.log(JSON.stringify({kernel: os.release(), architecture: os.arch(), distribution: distro, interfaces: {
  proc: exists('/proc'), procSelfStat: exists('/proc/self/stat'), procNetTcp: exists('/proc/net/tcp'), procCgroup: exists('/proc/self/cgroup'),
  sys: exists('/sys'), sysKernel: exists('/sys/kernel'), btf: exists('/sys/kernel/btf/vmlinux'), bpffs: exists('/sys/fs/bpf'), cgroupV2: exists('/sys/fs/cgroup/cgroup.controllers')
}, cgroup, user: {uid, name: passwd ? passwd.split(':')[0] : null}, sudo: ['/usr/bin/sudo','/bin/sudo','/usr/local/bin/sudo'].some(exists)}));
`;
const SOCKET_TEST = String.raw`
const net = require('node:net');
const server = net.createServer((socket) => { socket.write('ok'); });
server.listen(0, '127.0.0.1', () => {
  const port = server.address().port;
  console.log('KRAXX_SOCKET_TEST:' + port);
  const client = net.createConnection({host:'127.0.0.1', port});
  client.on('data', () => setTimeout(() => { client.end(); server.close(); }, 1800));
  client.on('error', (error) => { console.error(error.message); server.close(); process.exitCode=1; });
});
`;

export type SandboxProbeReport = {
  probeError?: string;
  sandbox: { passed: boolean; created: boolean; healthCheck: boolean; stopped: boolean; details: string };
  kernel: string;
  architecture: string;
  distribution: string[];
  interfaces: Record<string, boolean>;
  cgroup: string[];
  user: { uid: number | null; name: string | null };
  sudo: boolean;
  processTelemetry: { supported: boolean; details: string };
  networkTelemetry: { supported: boolean; details: string };
  ebpf: { available: boolean; bpftool: boolean; bpftrace: boolean; bpfFilesystem: boolean; capabilities: string[]; details: string; attachmentTested: false };
  fallbackTelemetry: { available: boolean; details: string };
  preferredProvider: "eBPF";
  recommendedProvider: string;
};

async function resultText(result: { stdout: (opts?: { signal?: AbortSignal }) => Promise<string>; stderr: (opts?: { signal?: AbortSignal }) => Promise<string> }) {
  return [await result.stdout(), await result.stderr()].filter(Boolean).join("\n").trim();
}

function redact(text: string) {
  const token = process.env.VERCEL_OIDC_TOKEN;
  return (token ? text.split(token).join("[redacted]") : text).slice(0, 1200);
}

function errorDetail(error: unknown): string {
  const parts: string[] = [];
  let current: unknown = error;
  for (let depth = 0; depth < 4 && current instanceof Error; depth += 1) {
    parts.push(`${current.name}: ${current.message}`);
    current = "cause" in current ? current.cause : undefined;
    if (current instanceof AggregateError) parts.push(...[...current.errors].slice(0, 8).map((item) => item instanceof Error ? `${item.name}: ${item.message}` : String(item)));
  }
  if (parts.length === 0) parts.push(String(error));
  return redact(parts.join("; "));
}

export async function runSandboxProbe(): Promise<SandboxProbeReport> {
  let sandbox: Sandbox | undefined;
  let provider: ProcfsTelemetryProvider | undefined;
  const report: SandboxProbeReport = {
    sandbox: { passed: false, created: false, healthCheck: false, stopped: false, details: "Sandbox creation has not completed." },
    kernel: "Not observed", architecture: "Not observed", distribution: [], interfaces: {}, cgroup: [],
    user: { uid: null, name: null }, sudo: false,
    processTelemetry: { supported: false, details: "Not observed" },
    networkTelemetry: { supported: false, details: "Not observed" },
    ebpf: { available: false, bpftool: false, bpftrace: false, bpfFilesystem: false, capabilities: [], details: "Not observed", attachmentTested: false },
    fallbackTelemetry: { available: false, details: "Not observed" },
    preferredProvider: "eBPF", recommendedProvider: "Unavailable until a live probe completes",
  };
  try {
    sandbox = await Sandbox.create({
      name: `kraxxdeceit-capability-probe-${Date.now()}`,
      persistent: false,
      timeout: 50_000,
      resources: { vcpus: 2 },
      networkPolicy: { allow: ["*"], subnets: { deny: DENIED_SANDBOX_SUBNETS } },
      signal: AbortSignal.timeout(50_000),
    });
    report.sandbox.created = true;
    report.sandbox.details = "Sandbox.create succeeded.";
    const health = await sandbox.runCommand({ cmd: "node", args: ["-e", HEALTH_CHECK], timeoutMs: 10_000 });
    const healthOutput = await resultText(health);
    if (health.exitCode !== 0 || !healthOutput.includes("KRAXX_SANDBOX_OK")) {
      throw new Error(`Sandbox health command failed (exit ${health.exitCode}): ${healthOutput || "no output"}`);
    }
    report.sandbox.healthCheck = true;
    report.sandbox.passed = true;
    report.sandbox.details = "Sandbox.create and the KRAXX_SANDBOX_OK health command succeeded.";

    const system = await sandbox.runCommand({ cmd: "node", args: ["-e", SYSTEM_INFO], timeoutMs: 10_000 });
    const systemOutput = await resultText(system);
    if (system.exitCode !== 0) throw new Error(`Linux environment probe failed: ${systemOutput || `exit ${system.exitCode}`}`);
    const info = JSON.parse(systemOutput) as Omit<SandboxProbeReport, "sandbox" | "processTelemetry" | "networkTelemetry" | "ebpf" | "fallbackTelemetry" | "preferredProvider" | "recommendedProvider">;
    Object.assign(report, info);

    provider = new ProcfsTelemetryProvider(sandbox);
    await provider.start();
    const sleep = await sandbox.runCommand({ cmd: "sleep", args: ["2"], detached: true, timeoutMs: 5_000 });
    const sleepResult = await sleep.wait();
    if (sleepResult.exitCode !== 0) throw new Error(`sleep 2 exited with code ${sleepResult.exitCode}.`);
    await provider.snapshot();

    const socket = await sandbox.runCommand({ cmd: "node", args: ["-e", SOCKET_TEST], timeoutMs: 8_000 });
    const socketOutput = await resultText(socket);
    const port = Number(socketOutput.match(/KRAXX_SOCKET_TEST:(\d+)/)?.[1]);
    await provider.snapshot();
    await provider.stop();
    const collection = await provider.collect();

    const processEvents = collection.events.filter((event) =>
      ["system.process_started", "system.process_exited"].includes(event.action) &&
      event.details.command === "sleep",
    );
    const started = processEvents.find((event) => event.action === "system.process_started");
    const exited = processEvents.find((event) => event.action === "system.process_exited");
    report.processTelemetry = {
      supported: Boolean(started && exited),
      details: started && exited
        ? `Observed sleep PID ${started.details.pid}, executable ${started.details.executable || "unavailable"}, parent PID ${started.details.ppid || "unavailable"}, start and exit.`
        : `Required start/exit events were not both observed for command sleep. Events captured: ${processEvents.length}.`,
    };

    const loopback = collection.network.find((item) => item.protocol === "tcp" && item.state === "ESTABLISHED" &&
      item.localAddress === "127.0.0.1" && item.destinationIp === "127.0.0.1" && (!port || item.localPort === port || item.destinationPort === port));
    report.networkTelemetry = {
      supported: Boolean(port && socket.exitCode === 0 && loopback),
      details: port && socket.exitCode === 0 && loopback
        ? `Observed an ESTABLISHED loopback TCP socket on test port ${port}.`
        : `Local TCP test ${socket.exitCode === 0 ? "ran" : `failed (exit ${socket.exitCode})`}, but the matching ESTABLISHED socket was not captured. ${socketOutput.slice(0, 300)}`,
    };

    const ebpf = collection.ebpf;
    const capabilities = [ebpf.capability?.bpf ? "CAP_BPF" : null, ebpf.capability?.sysAdmin ? "CAP_SYS_ADMIN" : null].filter((x): x is string => Boolean(x));
    report.ebpf = {
      available: ebpf.available,
      bpftool: Boolean(ebpf.tools?.bpftool),
      bpftrace: Boolean(ebpf.tools?.bpftrace),
      bpfFilesystem: Boolean(ebpf.kernelInterfaces?.bpfFs),
      capabilities,
      details: ebpf.reason ?? "Capability checks passed; no BPF program or attachment was attempted.",
      attachmentTested: false,
    };
    report.fallbackTelemetry = {
      available: collection.providers.some((item) => item.name === "procfs" && item.available) && collection.providers.some((item) => item.name === "socket-table" && item.available),
      details: "The configured procfs and socket-table sampler ran in this sandbox.",
    };
    report.recommendedProvider = report.ebpf.available ? "eBPF (capability probe only; attachment not tested)" : report.fallbackTelemetry.available ? "procfs/socket" : "Unavailable";
  } catch (error) {
    report.probeError = errorDetail(error);
    report.sandbox.passed = false;
    report.sandbox.details = report.probeError;
  } finally {
    try {
      if (provider) await Promise.race([provider.stop(), new Promise<never>((_, reject) => setTimeout(() => reject(new Error("Provider stop timed out.")), 5_000))]);
    } catch (error) { report.fallbackTelemetry.details = `Provider cleanup failed: ${redact(String(error))}`; }
    if (sandbox) {
      try {
        await sandbox.stop({ signal: AbortSignal.timeout(8_000) });
        report.sandbox.stopped = true;
        report.sandbox.details += " Sandbox.stop succeeded.";
      } catch (error) { report.sandbox.details += ` Sandbox.stop failed: ${redact(error instanceof Error ? error.message : String(error))}`; report.sandbox.passed = false; }
    }
  }
  report.sandbox.passed = report.sandbox.created && report.sandbox.healthCheck && report.sandbox.stopped;
  return report;
}
