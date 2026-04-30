import { resolveToken } from "@/lib/services/integration-store";

type InstagramApiResponse = {
  id?: string;
  error?: {
    message?: string;
    type?: string;
    code?: number;
    error_subcode?: number;
    fbtrace_id?: string;
  };
};

export type InstagramPublishTestResult = {
  status: "published";
  provider: "instagram";
  instagramAccountId: string;
  instagramUsername?: string;
  mediaUrl: string;
  caption: string;
  containerId: string;
  postId: string;
  publishedAt: string;
};

export type InstagramPublishImagePostInput = {
  mediaUrl: string;
  caption: string;
};

const instagramGraphVersion = process.env.INSTAGRAM_GRAPH_VERSION ?? "v23.0";
const instagramGraphBaseUrl = `https://graph.instagram.com/${instagramGraphVersion}`;

function instagramApiErrorMessage(payload: InstagramApiResponse, status: number) {
  const error = payload.error;
  if (error) {
    return [
      error.message,
      error.type ? `type ${error.type}` : "",
      typeof error.code === "number" ? `code ${error.code}` : "",
      typeof error.error_subcode === "number" ? `subcode ${error.error_subcode}` : "",
      error.fbtrace_id ? `trace ${error.fbtrace_id}` : "",
    ].filter(Boolean).join(" - ");
  }
  return `Instagram API request failed with ${status}.`;
}

async function postInstagramForm(path: string, body: Record<string, string>) {
  const response = await fetch(`${instagramGraphBaseUrl}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams(body),
  });
  const payload = (await response.json().catch(() => ({}))) as InstagramApiResponse;

  if (!response.ok) {
    throw new Error(instagramApiErrorMessage(payload, response.status));
  }
  if (!payload.id) {
    throw new Error("Instagram API did not return an id.");
  }

  return payload.id;
}

function defaultTestCaption() {
  return [
    "Orbit Instagram integration test.",
    "This post was published from the local Orbit backend after explicit operator approval.",
    `Timestamp: ${new Date().toISOString()}`,
  ].join("\n\n");
}

export async function publishInstagramImagePost({
  mediaUrl,
  caption,
}: InstagramPublishImagePostInput): Promise<InstagramPublishTestResult> {
  const accessToken = await resolveToken("instagram", "accessToken", ["INSTAGRAM_ACCESS_TOKEN", "META_ACCESS_TOKEN"]);
  const instagramAccountId = await resolveToken("instagram", "instagramAccountId", ["INSTAGRAM_ACCOUNT_ID"]);
  const instagramUsername = await resolveToken("instagram", "instagramUsername", ["INSTAGRAM_USERNAME"]);

  if (!accessToken || !instagramAccountId) {
    throw new Error("Instagram is not connected. Connect Instagram before publishing a test post.");
  }

  const containerId = await postInstagramForm(`/${instagramAccountId}/media`, {
    image_url: mediaUrl,
    caption,
    access_token: accessToken,
  });

  const postId = await postInstagramForm(`/${instagramAccountId}/media_publish`, {
    creation_id: containerId,
    access_token: accessToken,
  });

  return {
    status: "published",
    provider: "instagram",
    instagramAccountId,
    instagramUsername,
    mediaUrl,
    caption,
    containerId,
    postId,
    publishedAt: new Date().toISOString(),
  };
}

export async function publishInstagramTestPost(): Promise<InstagramPublishTestResult> {
  return publishInstagramImagePost({
    mediaUrl:
      process.env.INSTAGRAM_TEST_IMAGE_URL?.trim() ||
      "https://picsum.photos/seed/orbit-instagram-test/1080/1080.jpg",
    caption: process.env.INSTAGRAM_TEST_CAPTION?.trim() || defaultTestCaption(),
  });
}
