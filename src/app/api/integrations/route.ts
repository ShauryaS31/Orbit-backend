import { NextResponse } from "next/server";

import { getIntegrationProviders } from "@/lib/services/integration-registry";

export async function GET() {
  try {
    return NextResponse.json({
      providers: await getIntegrationProviders(),
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to load integrations." },
      { status: 500 },
    );
  }
}
