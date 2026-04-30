import { NextResponse } from "next/server";

import { saveGoogleClientConfig } from "@/lib/services/gmail-integration";

interface GoogleConfigBody {
  clientId?: string;
  clientSecret?: string;
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as GoogleConfigBody;

  if (!body.clientId?.trim() && !body.clientSecret?.trim()) {
    return NextResponse.json(
      { error: "Provide GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET." },
      { status: 400 },
    );
  }

  try {
    const status = await saveGoogleClientConfig(body);
    return NextResponse.json({
      ...status,
      saved: true,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to save Google config." },
      { status: 500 },
    );
  }
}
