import { NextResponse } from "next/server";

import {
  publishInstagramImagePost,
  publishInstagramTestPost,
} from "@/lib/services/instagram-publishing";

type PublishTestBody = {
  mediaUrl?: string;
  media_url?: string;
  caption?: string;
};

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as PublishTestBody;
    const mediaUrl = body.mediaUrl?.trim() || body.media_url?.trim();
    const caption = body.caption?.trim();

    if (mediaUrl) {
      return NextResponse.json(
        await publishInstagramImagePost({
          mediaUrl,
          caption:
            caption ||
            [
              "Orbit Instagram integration test.",
              "This post was published from a Cloudflare-hosted generated asset after explicit operator approval.",
              `Timestamp: ${new Date().toISOString()}`,
            ].join("\n\n"),
        }),
      );
    }

    return NextResponse.json(await publishInstagramTestPost());
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to publish Instagram test post." },
      { status: 500 },
    );
  }
}
