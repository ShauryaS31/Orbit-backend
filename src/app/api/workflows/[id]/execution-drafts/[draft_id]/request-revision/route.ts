import { NextResponse } from "next/server";

import { workflowStore } from "@/lib/state/workflow-store";

interface RouteParams {
  params: Promise<{
    id: string;
    draft_id: string;
  }>;
}

interface RequestRevisionBody {
  reviewer_note?: string;
}

export async function POST(request: Request, context: RouteParams) {
  const params = await context.params;
  const workflow = workflowStore.getWorkflow(params.id);
  if (!workflow) {
    return NextResponse.json({ error: "Workflow not found." }, { status: 404 });
  }

  const body = (await request.json().catch(() => ({}))) as RequestRevisionBody;
  const reviewerNote = body.reviewer_note?.trim();
  if (!reviewerNote) {
    return NextResponse.json({ error: "Field 'reviewer_note' is required." }, { status: 400 });
  }

  const updated = workflowStore.updateDraft(params.id, params.draft_id, (draft) => ({
    ...draft,
    meta: {
      ...draft.meta,
      status: "revision_requested",
      reviewer_note: reviewerNote,
    },
  }));

  if (!updated) {
    return NextResponse.json({ error: "Draft not found." }, { status: 404 });
  }

  workflowStore.addLog(params.id, {
    role: "marketing_manager",
    step_id: "campaign_draft_generated",
    message: `[Scott]: Founder reviewed Day ${updated.meta.day}. Revision queued — '${reviewerNote}'.`,
  });

  return NextResponse.json({
    draft_id: params.draft_id,
    status: "revision_requested",
    reviewer_note: reviewerNote,
  });
}
