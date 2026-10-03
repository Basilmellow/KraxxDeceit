import { loadEnvConfig } from "@next/env";
import { runSandboxProbe } from "../lib/sandbox-probe";

loadEnvConfig(process.cwd());
async function main() {
  const report = await runSandboxProbe();
  console.log("KRAXXDECEIT SANDBOX CAPABILITY REPORT");
  console.log(`Sandbox: ${report.sandbox.passed ? "PASS" : "FAIL"}`);
  console.log(`Kernel: ${report.kernel}`);
  console.log(`Architecture: ${report.architecture}`);
  console.log(`Process telemetry: ${report.processTelemetry.supported ? "PASS" : "FAIL"}`);
  console.log(`Network telemetry: ${report.networkTelemetry.supported ? "PASS" : "FAIL"}`);
  console.log(`eBPF: ${report.ebpf.available ? "AVAILABLE" : "UNAVAILABLE"}`);
  console.log(`Fallback telemetry: ${report.fallbackTelemetry.available ? "AVAILABLE" : "UNAVAILABLE"}`);
  console.log(`Recommended provider: ${report.recommendedProvider}`);
  console.log(JSON.stringify(report, null, 2));
  if (!report.sandbox.passed) process.exitCode = 1;
}

void main();
