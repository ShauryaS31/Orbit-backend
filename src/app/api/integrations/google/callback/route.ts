import { NextResponse } from "next/server";

import { exchangeGoogleCode } from "@/lib/services/gmail-integration";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const oauthError = url.searchParams.get("error");

  if (oauthError) {
    return NextResponse.json({ error: oauthError }, { status: 400 });
  }
  if (!code) {
    return NextResponse.json({ error: "Missing Google OAuth code." }, { status: 400 });
  }

  try {
    const result = await exchangeGoogleCode(code, state);
    return NextResponse.json({
      ...result,
      message: "Gmail connected for this backend process. Add GOOGLE_REFRESH_TOKEN to .env.local for persistence after restart.",
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to finish Google OAuth." },
      { status: 500 },
    );
  }
}
