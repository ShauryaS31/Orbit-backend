import { NextResponse } from "next/server";

import { getDraftPlainText } from "@/lib/agents/draft-utils";
import type { SchedulePostResult } from "@/lib/services/social-orchestrator";
import {
  createSandboxSchedulePostResult,
  isAyrshareProductionBlocked,
  schedulePost,
} from "@/lib/services/social-orchestrator";
import type { CampaignExecutionDraft } from "@/lib/types/orbit";
import { workflowStore } from "@/lib/state/workflow-store";

interface RouteParams {
  params: Promise<{
    id: string;
  }>;
}

type PublishPlatform = "instagram" | "linkedin" | "facebook" | "tiktok";

interface PublishBody {
  draft_id?: string;
  platform?: PublishPlatform;
  schedule_time?: string;
}

function resolveAbsoluteAssetUrl(urlOrPath: string): string {
  if (urlOrPath.startsWith("http://") || urlOrPath.startsWith("https://")) {
    return urlOrPath;
  }
  const base =
    process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ?? "http://localhost:3000";
  const path = urlOrPath.startsWith("/") ? urlOrPath : `/${urlOrPath}`;
  return `${base}${path}`;
}

function resolveDraftImageUrl(
  workflow: NonNullable<ReturnType<typeof workflowStore.getWorkflow>>,
  draft: CampaignExecutionDraft,
): string {
  const asset = workflow.generated_campaign_assets.find((a) => a.day === draft.meta.day);
  return resolveAbsoluteAssetUrl(asset?.image_url ?? "/images/placeholder-brand-motif.png");
}

function publishCompatibilityError(
  draft: CampaignExecutionDraft,
  platform: PublishPlatform,
): string | null {
  if (draft.type === "email") {
    return "Email drafts cannot be published via the social orchestrator.";
  }
  if (draft.type === "linkedin_post") {
    return platform === "linkedin"
      ? null
      : "LinkedIn post drafts must publish to LinkedIn.";
  }
  if (draft.type === "carousel") {
    if (draft.platform === "linkedin") {
      return platform === "linkedin"
        ? null
        : "LinkedIn carousel drafts must publish to LinkedIn.";
    }
    if (draft.platform === "instagram") {
      return platform === "linkedin"
        ? "Instagram carousel drafts cannot target LinkedIn."
        : null;
    }
  }
  return null;
}

export async function POST(request: Request, context: RouteParams) {
  const params = await context.params;
  const workflow = workflowStore.getWorkflow(params.id);
  if (!workflow) {
    return NextResponse.json({ error: "Workflow not found." }, { status: 404 });
  }

  const body = (await request.json().catch(() => ({}))) as PublishBody;
  const draftId = body.draft_id?.trim();
  const platform = body.platform;

  if (!draftId) {
    return NextResponse.json({ error: "Field 'draft_id' is required." }, { status: 400 });
  }

  const platforms: PublishPlatform[] = ["instagram", "linkedin", "facebook", "tiktok"];
  if (!platform || !platforms.includes(platform)) {
    return NextResponse.json(
      {
        error: `Field 'platform' must be one of: ${platforms.join(", ")}.`,
      },
      { status: 400 },
    );
  }

  const draft = workflowStore.getDraft(params.id, draftId);
  if (!draft) {
    return NextResponse.json({ error: "Draft not found." }, { status: 404 });
  }

  const sandbox = process.env.SOCIAL_SANDBOX === "true";
  if (draft.meta.status !== "approved" && !sandbox) {
    return NextResponse.json(
      { error: "Draft must be approved before publishing." },
      { status: 400 },
    );
  }

  const incompatible = publishCompatibilityError(draft, platform);
  if (incompatible) {
    return NextResponse.json({ error: incompatible }, { status: 400 });
  }

  const scheduleRaw = body.schedule_time?.trim();
  const explicitSchedule = Boolean(scheduleRaw);
  const targetDate = scheduleRaw ? new Date(scheduleRaw) : new Date();
  if (Number.isNaN(targetDate.getTime())) {
    return NextResponse.json({ error: "Invalid schedule_time." }, { status: 400 });
  }

  const skewMs = 2000;
  const isFutureScheduled = targetDate.getTime() > Date.now() + skewMs;
  const nextStatus = isFutureScheduled ? "scheduled" : "published";
  const nextPublished = !isFutureScheduled;

  const content = getDraftPlainText(draft);
  const imageUrl = resolveDraftImageUrl(workflow, draft);

  if (!sandbox && isAyrshareProductionBlocked()) {
    return NextResponse.json(
      {
        error:
          "AYRSHARE_API_KEY is required when SOCIAL_SANDBOX is not enabled.",
      },
      { status: 503 },
    );
  }

  workflowStore.addLog(params.id, {
    role: "orchestrator",
    step_id: "social_deployed",
    message:
      sandbox && draft.meta.status !== "approved"
        ? "[Scott]: Sandbox deployment allowed without draft-level approve for demo reliability."
        : "[Scott]: Handshaking deployment bridge - scheduling your approved draft.",
    metadata: { draft_id: draftId, publish_platform: platform },
  });

  let result: SchedulePostResult;
  try {
    result =
      sandbox ?
        createSandboxSchedulePostResult(platform, targetDate)
      : await schedulePost(platform, content, imageUrl, targetDate, {
          explicitSchedule,
        });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Scheduling failed.";
    return NextResponse.json({ error: message }, { status: 503 });
  }

  if (!result.success) {
    return NextResponse.json(
      { error: result.message ?? "Scheduling failed." },
      { status: 503 },
    );
  }

  const deploymentPostId = result.deployment_post_id;
  const scheduledIso = targetDate.toISOString();

  const updated = workflowStore.updateDraft(params.id, draftId, (d) => ({
    ...d,
    meta: {
      ...d.meta,
      status: nextStatus,
      is_published: nextPublished,
      scheduled_at: scheduledIso,
      publish_platform: platform,
      deployment_post_id: deploymentPostId,
    },
  }));

  if (!updated) {
    return NextResponse.json({ error: "Draft not found." }, { status: 404 });
  }

  workflowStore.addLog(params.id, {
    role: "orchestrator",
    step_id: "social_deployed",
    message: `[Scott]: Successfully deployed to ${platform}. Post ID: ${deploymentPostId ?? "unknown"}.`,
    metadata: {
      draft_id: draftId,
      deployment_post_id: deploymentPostId,
      scheduled_at: scheduledIso,
      deployment_status: nextStatus,
    },
  });

  const mockDeploymentStatus =
    nextStatus === "scheduled" ? "scheduled"
    : nextStatus === "published" ? "live"
    : "scheduled";

  return NextResponse.json({
    draft_id: draftId,
    status: nextStatus,
    scheduled_at: scheduledIso,
    publish_platform: platform,
    deployment_post_id: deploymentPostId ?? null,
    sandbox,
    ...(sandbox ?
      {
        mock_deployment_data: {
          status: mockDeploymentStatus,
          platform_link: "https://orbit.social/preview/mock-post",
          confirmation_message:
            "Orbit Sandbox: Handshake successful. Post queued for delivery.",
        },
      }
    : {}),
  });
}
