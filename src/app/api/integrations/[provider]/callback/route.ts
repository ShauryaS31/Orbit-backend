import { NextResponse } from "next/server";

import { isIntegrationProviderId } from "@/lib/services/integration-registry";
import { exchangeGoogleCode } from "@/lib/services/gmail-integration";
import { exchangeInstagramCode, exchangeLinkedInCode } from "@/lib/services/social-oauth";

type RouteContext = {
  params: Promise<{ provider: string }>;
};

export async function GET(request: Request, context: RouteContext) {
  const { provider } = await context.params;
  if (!isIntegrationProviderId(provider)) {
    return NextResponse.json({ error: "Unknown integration provider." }, { status: 404 });
  }

  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const oauthError = url.searchParams.get("error");
  const oauthErrorDescription = url.searchParams.get("error_description");

  if (oauthError) {
    return NextResponse.json({ error: oauthError, error_description: oauthErrorDescription }, { status: 400 });
  }
  if (!code) {
    return NextResponse.json({ error: `Missing ${provider} OAuth code.` }, { status: 400 });
  }

  try {
    const result =
      provider === "google"
        ? await exchangeGoogleCode(code, state)
        : provider === "linkedin"
          ? await exchangeLinkedInCode(code, state)
          : await exchangeInstagramCode(code, state);

    return NextResponse.json({
      ...result,
      provider,
      message: `${provider} OAuth connected and saved in the backend integration store.`,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : `Unable to finish ${provider} OAuth.` },
      { status: 500 },
    );
  }
}
