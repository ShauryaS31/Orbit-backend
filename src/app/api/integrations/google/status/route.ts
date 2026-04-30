import { NextResponse } from "next/server";

import { getGoogleIntegrationStatus } from "@/lib/services/gmail-integration";

export async function GET() {
  return NextResponse.json(await getGoogleIntegrationStatus());
}
