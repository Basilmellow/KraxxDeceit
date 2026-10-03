import { internalRoutesEnabled } from "@/lib/production-policy";
import { timingSafeEqual } from "node:crypto";
import { runSandboxProbe } from "@/lib/sandbox-probe";

export const runtime = "nodejs";
export const maxDuration = 60;

function authorized(request: Request) {
  const expected = process.env.KRAXX_INTERNAL_PROBE_TOKEN;
  const match = /^Bearer ([^\s]+)$/.exec(request.headers.get("authorization") ?? "");
  if (!expected || !match) return false;
  const actualBytes = Buffer.from(match[1], "utf8");
  const expectedBytes = Buffer.from(expected, "utf8");
  return actualBytes.length === expectedBytes.length && timingSafeEqual(actualBytes, expectedBytes);
}

function hidden() {
  return Response.json({ error: "Not found" }, { status: 404, headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  if (!internalRoutesEnabled()) return hidden();
  if (process.env.KRAXX_INTERNAL_PROBE_ENABLED !== "true" || !authorized(request)) return hidden();

  try {
    const report = await runSandboxProbe();
    const response = {
      success: report.sandbox.passed,
      sandbox: {
        created: report.sandbox.created,
        healthCheck: report.sandbox.healthCheck,
        stopped: report.sandbox.stopped,
        details: report.sandbox.passed ? "Sandbox and health check succeeded; disposable sandbox stopped." : "Sandbox probe did not complete successfully.",
      },
      kernel: report.kernel,
      architecture: report.architecture,
      distribution: report.distribution,
      interfaces: report.interfaces,
      cgroup: report.cgroup,
      processTelemetry: report.processTelemetry,
      networkTelemetry: report.networkTelemetry,
      ebpf: report.ebpf,
      fallbackTelemetry: report.fallbackTelemetry,
      recommendedProvider: report.recommendedProvider,
    };
    return Response.json(response, {
      status: report.sandbox.passed ? 200 : 502,
      headers: { "Cache-Control": "no-store" },
    });
  } catch {
    return Response.json({ success: false, error: "Sandbox capability probe failed." }, {
      status: 500,
      headers: { "Cache-Control": "no-store" },
    });
  }
}
