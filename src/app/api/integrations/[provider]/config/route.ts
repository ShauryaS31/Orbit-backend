import { NextResponse } from "next/server";

import {
  isIntegrationProviderId,
  saveIntegrationProviderConfig,
} from "@/lib/services/integration-registry";

type RouteContext = {
  params: Promise<{ provider: string }>;
};

export async function POST(request: Request, context: RouteContext) {
  const { provider } = await context.params;
  if (!isIntegrationProviderId(provider)) {
    return NextResponse.json({ error: "Unknown integration provider." }, { status: 404 });
  }

  const body = (await request.json().catch(() => ({}))) as Record<string, string | undefined>;
  const hasValue = Object.values(body).some((value) => Boolean(value?.trim()));

  if (!hasValue) {
    return NextResponse.json({ error: "Provide at least one integration value to save." }, { status: 400 });
  }

  try {
    return NextResponse.json({
      providers: await saveIntegrationProviderConfig(provider, body),
      saved: true,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to save integration config." },
      { status: 500 },
    );
  }
}
