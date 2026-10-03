import { NextResponse } from "next/server";
import { runEndToEndChain } from "@/lib/end-to-end-chain";
import { z } from "zod";

export const runtime = "nodejs";
export const maxDuration = 180;

const RequestSchema = z.object({ mode: z.enum(["ignore", "follow-safe", "blocked"]) });

export async function POST(request: Request) {
  if (process.env.NODE_ENV !== "development") return NextResponse.json({ error: "Not found." }, { status: 404 });
  const parsed = RequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Choose a fixed controlled experiment mode." }, { status: 400 });
  try { return NextResponse.json(await runEndToEndChain(parsed.data.mode)); }
  catch (error) {
    const token = process.env.VERCEL_OIDC_TOKEN?.trim();
    const detail = (error instanceof Error ? error.message : "Unknown experiment error.")
      .replace(/\bBearer\s+[A-Za-z0-9._~+/-]+=*/gi, "Bearer [redacted]")
      .replace(/((?:token|api.?key|auth|session|pass(?:word)?|secret|credential)\s*[:=]\s*["']?)[^\s"'&,;<>]+/gi, "$1[redacted]")
      .replace(/\b[A-Za-z0-9_-]{24,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g,"[redacted]");
    const safeDetail = token ? detail.split(token).join("[redacted]") : detail;
    console.error("KraxxDeceit end-to-end chain failed:", safeDetail);
    return NextResponse.json({ error: "Controlled Agent Navigation Chain failed", detail: safeDetail }, { status: 500 });
  }
}
