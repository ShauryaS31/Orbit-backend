import { NextResponse } from "next/server";

import { publishInstagramTestPost } from "@/lib/services/instagram-publishing";

export async function POST() {
  try {
    return NextResponse.json(await publishInstagramTestPost());
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to publish Instagram test post." },
      { status: 500 },
    );
  }
}
