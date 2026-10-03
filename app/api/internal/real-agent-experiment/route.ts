import { NextResponse } from "next/server";
import { REAL_INDIRECT_PROMPT_INJECTION } from "@/experiments/web-agent/real-indirect-prompt-injection";
import { investigateUrl, SandboxExecutionError } from "@/lib/engine";
import { UnsafeTargetError } from "@/lib/url-safety";

export const runtime = "nodejs";
export const maxDuration = 180;

export async function POST() {
  if (process.env.NODE_ENV !== "development") return NextResponse.json({ error: "Not found." }, { status: 404 });
  try {
    const result = await investigateUrl(REAL_INDIRECT_PROMPT_INJECTION.fixtureUrl, REAL_INDIRECT_PROMPT_INJECTION);
    return NextResponse.json(result);
  } catch (error) {
    console.error("KraxxDeceit real-agent experiment failed:", error);
    if (error instanceof UnsafeTargetError) return NextResponse.json({ error: error.message }, { status: 400 });
    if (error instanceof SandboxExecutionError) return NextResponse.json({ error: "Vercel Sandbox execution failed", detail: error.message }, { status: 500 });
    return NextResponse.json({ error: "Real-agent experiment failed. See server logs for diagnostics." }, { status: 500 });
  }
}
