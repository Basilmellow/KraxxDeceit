import { NextResponse } from "next/server";
import { InvestigationRequestSchema } from "@/lib/case-schema";
import { investigateUrl, SandboxExecutionError } from "@/lib/engine";
import { UnsafeTargetError } from "@/lib/url-safety";

export const runtime = "nodejs";
export const maxDuration = 180;

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const parsed = InvestigationRequestSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json({ error: "Enter a valid HTTP(S) URL." }, { status: 400 });
    }

    const result = await investigateUrl(parsed.data.url);

    return NextResponse.json({ ...result, url: result.target.submittedUrl });
  } catch (error) {
    console.error("KraxxDeceit investigation failed:", error);
    if (error instanceof UnsafeTargetError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    if (error instanceof SandboxExecutionError) {
      return NextResponse.json(
        { error: "Vercel Sandbox execution failed", detail: error.message },
        { status: 500 },
      );
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Investigation failed unexpectedly." },
      { status: 500 }
    );
  }
}
