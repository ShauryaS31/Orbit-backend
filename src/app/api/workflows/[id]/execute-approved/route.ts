import { NextResponse } from "next/server";

import { getDraftPlainText } from "@/lib/agents/draft-utils";
import type { SchedulePostResult } from "@/lib/services/social-orchestrator";
import {
  createSandboxSchedulePostResult,
  schedulePost,
} from "@/lib/services/social-orchestrator";
import { resolveAbsoluteAssetUrl } from "@/lib/services/public-assets";
import type { CampaignExecutionDraft } from "@/lib/types/orbit";
import { workflowStore } from "@/lib/state/workflow-store";

interface RouteParams {
  params: Promise<{
    id: string;
  }>;
}

type PublishPlatform = "instagram" | "linkedin" | "facebook" | "tiktok";

interface ExecuteApprovedBody {
  schedule_time?: string;
  platforms?: Partial<Record<string, PublishPlatform>>;
}

function resolveDraftImageUrl(
  workflow: NonNullable<ReturnType<typeof workflowStore.getWorkflow>>,
  draft: CampaignExecutionDraft,
): string {
  const asset = workflow.generated_campaign_assets.find((a) => a.day === draft.meta.day);
  return resolveAbsoluteAssetUrl(asset?.image_url ?? "/images/placeholder-brand-motif.png");
}

function defaultPlatformForDraft(draft: CampaignExecutionDraft): PublishPlatform | null {
  if (draft.type === "email") return null;
  if (draft.type === "linkedin_post") return "linkedin";
  if (draft.type === "carousel") return draft.platform === "linkedin" ? "linkedin" : "instagram";
  return null;
}

function isExecutableDraft(draft: CampaignExecutionDraft): boolean {
  return (
    draft.type !== "email" &&
    draft.meta.status === "approved" &&
    draft.meta.operator_status === "approved" &&
    !draft.meta.deployment_post_id
  );
}

export async function POST(request: Request, context: RouteParams) {
  const params = await context.params;
  const workflow = workflowStore.getWorkflow(params.id);
  if (!workflow) {
    return NextResponse.json({ error: "Workflow not found." }, { status: 404 });
  }

  const body = (await request.json().catch(() => ({}))) as ExecuteApprovedBody;
  const scheduleRaw = body.schedule_time?.trim();
  const targetDate = scheduleRaw ? new Date(scheduleRaw) : new Date();
  if (Number.isNaN(targetDate.getTime())) {
    return NextResponse.json({ error: "Invalid schedule_time." }, { status: 400 });
  }

  const approvedDrafts = workflow.campaign_execution_drafts.filter(isExecutableDraft);
  if (approvedDrafts.length === 0) {
    return NextResponse.json(
      {
        error: "No approved social drafts are ready for execution.",
        skipped: workflow.campaign_execution_drafts.map((draft) => ({
          draft_id: draft.meta.id,
          type: draft.type,
          status: draft.meta.status,
          operator_status: draft.meta.operator_status ?? "pending",
          reason:
            draft.type === "email" ? "email_not_social_publish_target"
            : draft.meta.operator_status !== "approved" ? "operator_approval_required"
            : "not_approved_or_already_deployed",
        })),
      },
      { status: 400 },
    );
  }

  const sandbox = process.env.SOCIAL_SANDBOX === "true";
  const explicitSchedule = Boolean(scheduleRaw);
  const isFutureScheduled = targetDate.getTime() > Date.now() + 2000;
  const nextStatus = isFutureScheduled ? "scheduled" : "published";
  const nextPublished = !isFutureScheduled;
  const scheduledIso = targetDate.toISOString();
  const results: Array<{
    draft_id: string;
    platform: PublishPlatform;
    status: string;
    deployment_post_id?: string;
    message?: string;
  }> = [];

  workflowStore.addLog(params.id, {
    role: "orchestrator",
    step_id: "social_deployed",
    message: `[Scott]: Execution bridge received ${approvedDrafts.length} approved social draft(s).`,
  });

  for (const draft of approvedDrafts) {
    const platform = body.platforms?.[draft.meta.id] ?? defaultPlatformForDraft(draft);
    if (!platform) continue;

    const content = getDraftPlainText(draft);
    const imageUrl = resolveDraftImageUrl(workflow, draft);

    let result: SchedulePostResult;
    try {
      result =
        sandbox ?
          createSandboxSchedulePostResult(platform, targetDate)
        : await schedulePost(platform, content, imageUrl, targetDate, { explicitSchedule });
    } catch (error) {
      results.push({
        draft_id: draft.meta.id,
        platform,
        status: "failed",
        message: error instanceof Error ? error.message : "Deployment failed.",
      });
      continue;
    }

    workflowStore.updateDraft(params.id, draft.meta.id, (current) => ({
      ...current,
      meta: {
        ...current.meta,
        status: nextStatus,
        is_published: nextPublished,
        scheduled_at: scheduledIso,
        publish_platform: platform,
        deployment_post_id: result.deployment_post_id,
      },
    }));

    results.push({
      draft_id: draft.meta.id,
      platform,
      status: nextStatus,
      deployment_post_id: result.deployment_post_id,
      message: result.message,
    });

    workflowStore.addLog(params.id, {
      role: "orchestrator",
      step_id: "social_deployed",
      message: `[Scott]: Executed approved draft ${draft.meta.id} on ${platform}.`,
      metadata: {
        draft_id: draft.meta.id,
        publish_platform: platform,
        deployment_post_id: result.deployment_post_id,
        deployment_status: nextStatus,
      },
    });
  }

  const failed = results.filter((result) => result.status === "failed");
  return NextResponse.json({
    workflow_id: params.id,
    sandbox,
    status: failed.length ? "partial_failure" : "executed",
    scheduled_at: scheduledIso,
    results,
  });
}
