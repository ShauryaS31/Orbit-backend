import { NextResponse } from "next/server";

import { isIntegrationProviderId } from "@/lib/services/integration-registry";
import { createGoogleAuthUrl } from "@/lib/services/gmail-integration";
import { createInstagramAuthUrl, createLinkedInAuthUrl } from "@/lib/services/social-oauth";

type RouteContext = {
  params: Promise<{ provider: string }>;
};

export async function GET(_request: Request, context: RouteContext) {
  const { provider } = await context.params;
  if (!isIntegrationProviderId(provider)) {
    return NextResponse.json({ error: "Unknown integration provider." }, { status: 404 });
  }

  try {
    if (provider === "google") return NextResponse.redirect(await createGoogleAuthUrl());
    if (provider === "linkedin") return NextResponse.redirect(await createLinkedInAuthUrl());
    return NextResponse.redirect(await createInstagramAuthUrl());
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : `Unable to start ${provider} OAuth.` },
      { status: 500 },
    );
  }
}
