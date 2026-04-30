import { publishInstagramImagePost } from "@/lib/services/instagram-publishing";

export interface SchedulePostOptions {
  /** When true, include `scheduleDate` for Ayrshare (request included `schedule_time`). */
  explicitSchedule?: boolean;
}

export interface SchedulePostResult {
  success: boolean;
  deployment_post_id?: string;
  scheduled_at: string;
  message?: string;
}

/** Synchronous sandbox contract — no network I/O (instant publish responses). */
export function createSandboxSchedulePostResult(
  platform: string,
  scheduledDate: Date,
): SchedulePostResult {
  return {
    success: true,
    deployment_post_id: `sandbox_${platform}_${Date.now().toString(36)}`,
    scheduled_at: scheduledDate.toISOString(),
    message: `Sandbox schedule simulated for ${platform}.`,
  };
}

const AYRSHARE_POST_URL = "https://app.ayrshare.com/api/post";

/** Logged when `SOCIAL_SANDBOX` is false and `AYRSHARE_API_KEY` is unset. */
export const AYRSHARE_API_KEY_REMINDER =
  "[Social Orchestrator]: AYRSHARE_API_KEY is not set but SOCIAL_SANDBOX is false. Add AYRSHARE_API_KEY to your environment to publish via Ayrshare.";

interface AyrsharePostResponse {
  status?: string;
  id?: string;
  postIds?: string[];
  errors?: Array<{
    platform?: string;
    message?: string;
    code?: string;
    status?: string;
  }>;
  message?: string;
}

/** Returns true if production publish is blocked by a missing API key (reminder logged once). */
export function isAyrshareProductionBlocked(): boolean {
  if (process.env.SOCIAL_SANDBOX === "true") {
    return false;
  }
  if (process.env.AYRSHARE_API_KEY?.trim()) {
    return false;
  }
  console.warn(AYRSHARE_API_KEY_REMINDER);
  return true;
}

/** Instagram (and TikTok image flows) require HTTPS media URLs reachable by Ayrshare. */
function resolveMediaUrlsForPlatform(
  platform: string,
  imageUrl: string,
): string[] | undefined {
  const trimmed = imageUrl.trim();
  if (!trimmed) {
    if (platform === "instagram") {
      throw new Error(
        "Instagram requires a media URL. Provide a generated asset with an HTTPS URL, or link an Instagram Business account in Ayrshare.",
      );
    }
    return undefined;
  }

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    throw new Error(`Invalid media URL for ${platform}: ${trimmed}`);
  }

  const isHttps = url.protocol === "https:";
  const isLocalHttp =
    url.protocol === "http:" &&
    (url.hostname === "localhost" || url.hostname === "127.0.0.1");

  if (platform === "instagram") {
    if (!isHttps) {
      throw new Error(
        "Instagram requires a publicly accessible HTTPS mediaUrl. Local http:// URLs are not accepted by Ayrshare.",
      );
    }
    return [trimmed];
  }

  if (platform === "tiktok") {
    if (!isHttps) {
      throw new Error(
        "TikTok posting requires HTTPS mediaUrls. Use a publicly reachable asset URL.",
      );
    }
    return [trimmed];
  }

  // LinkedIn / Facebook: text-only OK; attach media only when HTTPS (avoid sending broken localhost URLs).
  if (isHttps) {
    return [trimmed];
  }
  if (isLocalHttp) {
    return undefined;
  }

  return undefined;
}

function formatScheduleDateUtc(date: Date): string {
  return date.toISOString().replace(/\.\d{3}Z$/, "Z");
}

function summarizeAyrshareErrors(payload: AyrsharePostResponse): string {
  const parts =
    payload.errors?.map((e) => {
      const platform = e.platform ? `[${e.platform}] ` : "";
      const msg = e.message ?? e.code ?? "unknown error";
      return `${platform}${msg}`;
    }) ?? [];
  if (parts.length > 0) {
    return parts.join("; ");
  }
  return payload.message ?? "Ayrshare returned an error.";
}

export async function schedulePost(
  platform: string,
  content: string,
  imageUrl: string,
  scheduledDate: Date,
  options?: SchedulePostOptions,
): Promise<SchedulePostResult> {
  const sandbox = process.env.SOCIAL_SANDBOX === "true";

  if (sandbox) {
    return createSandboxSchedulePostResult(platform, scheduledDate);
  }

  const apiKey = process.env.AYRSHARE_API_KEY?.trim();
  const explicitSchedule = options?.explicitSchedule === true;

  if (platform === "instagram") {
    const isFutureScheduled = scheduledDate.getTime() > Date.now() + 2000;
    if (explicitSchedule && isFutureScheduled && !apiKey) {
      throw new Error(
        "Direct Instagram publishing does not support future scheduling. Add AYRSHARE_API_KEY for scheduled social posts, or publish immediately.",
      );
    }

    try {
      const [mediaUrl] = resolveMediaUrlsForPlatform(platform, imageUrl) ?? [];
      if (!mediaUrl) {
        throw new Error("Instagram requires a publicly reachable HTTPS media URL.");
      }
      const result = await publishInstagramImagePost({
        mediaUrl,
        caption: content,
      });

      return {
        success: true,
        deployment_post_id: result.postId,
        scheduled_at: result.publishedAt,
        message: `Posted directly to Instagram${result.instagramUsername ? ` @${result.instagramUsername}` : ""}.`,
      };
    } catch (error) {
      if (!apiKey) {
        throw error;
      }
      console.warn(
        "[Social Orchestrator]: Direct Instagram publish failed; falling back to Ayrshare:",
        error instanceof Error ? error.message : error,
      );
    }
  }

  if (!apiKey) {
    console.warn(AYRSHARE_API_KEY_REMINDER);
    throw new Error(
      "AYRSHARE_API_KEY is required when SOCIAL_SANDBOX is not enabled.",
    );
  }

  const mediaUrls = resolveMediaUrlsForPlatform(platform, imageUrl);

  const body: Record<string, unknown> = {
    post: content,
    platforms: [platform],
  };

  if (platform === "instagram") {
    if (!mediaUrls?.length) {
      throw new Error(
        "Instagram requires mediaUrls with at least one HTTPS image URL.",
      );
    }
    body.mediaUrls = mediaUrls;
  } else if (mediaUrls?.length) {
    body.mediaUrls = mediaUrls;
  }

  if (explicitSchedule) {
    body.scheduleDate = formatScheduleDateUtc(scheduledDate);
  }

  let response: Response;
  try {
    response = await fetch(AYRSHARE_POST_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
  } catch (error) {
    const msg =
      error instanceof Error ? error.message : "Network error calling Ayrshare.";
    console.error("[Social Orchestrator]: Fetch failed:", msg);
    throw new Error(`Ayrshare request failed: ${msg}`);
  }

  let payload: AyrsharePostResponse;
  try {
    payload = (await response.json()) as AyrsharePostResponse;
  } catch {
    console.error("[Social Orchestrator]: Invalid JSON from Ayrshare.");
    throw new Error("Ayrshare returned a non-JSON response.");
  }

  const failedHttp = !response.ok;
  const failedBody =
    payload.status === "error" ||
    (Array.isArray(payload.errors) && payload.errors.length > 0);

  if (failedHttp || failedBody) {
    const summary = summarizeAyrshareErrors(payload);
    console.error("[Social Orchestrator]: Ayrshare API error:", summary, payload);
    throw new Error(summary);
  }

  const deploymentPostId =
    payload.postIds?.[0] ?? payload.id ?? `ayrshare_${Date.now().toString(36)}`;

  return {
    success: true,
    deployment_post_id: deploymentPostId,
    scheduled_at: scheduledDate.toISOString(),
    message: `Posted via Ayrshare to ${platform}.`,
  };
}
