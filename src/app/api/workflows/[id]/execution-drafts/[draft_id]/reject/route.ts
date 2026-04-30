import { NextResponse } from "next/server";

import { workflowStore } from "@/lib/state/workflow-store";

interface RouteParams {
  params: Promise<{
    id: string;
    draft_id: string;
  }>;
}

interface RejectDraftBody {
  reviewer_note?: string;
}

export async function POST(request: Request, context: RouteParams) {
  const params = await context.params;
  const workflow = workflowStore.getWorkflow(params.id);
  if (!workflow) {
    return NextResponse.json({ error: "Workflow not found." }, { status: 404 });
  }

  const body = (await request.json().catch(() => ({}))) as RejectDraftBody;
  const reviewerNote = body.reviewer_note?.trim() || "Rejected by operator.";
  const reviewedAt = new Date().toISOString();

  const updated = workflowStore.updateDraft(params.id, params.draft_id, (draft) => ({
    ...draft,
    meta: {
      ...draft.meta,
      status: "rejected",
      operator_status: "rejected",
      operator_reviewed_at: reviewedAt,
      operator_reviewer: "human_operator",
      reviewer_note: reviewerNote,
    },
  }));

  if (!updated) {
    return NextResponse.json({ error: "Draft not found." }, { status: 404 });
  }

  workflowStore.addLog(params.id, {
    role: "orchestrator",
    step_id: "campaign_package_ready",
    message: `[Scott]: Operator rejected draft ${params.draft_id} - ${reviewerNote}`,
    metadata: {
      draft_id: params.draft_id,
      operator_status: "rejected",
      reviewer_note: reviewerNote,
    },
  });

  return NextResponse.json({
    draft_id: params.draft_id,
    status: "rejected",
    operator_status: "rejected",
    operator_reviewed_at: reviewedAt,
    reviewer_note: reviewerNote,
  });
}
