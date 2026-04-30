import { NextResponse } from "next/server";

import { createGoogleAuthUrl } from "@/lib/services/gmail-integration";

export async function GET() {
  try {
    return NextResponse.redirect(createGoogleAuthUrl());
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to start Google OAuth." },
      { status: 500 },
    );
  }
}
