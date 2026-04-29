import { NextResponse } from "next/server";

import { workflowStore } from "@/lib/state/workflow-store";

interface RouteParams {
  params: Promise<{
    id: string;
    draft_id: string;
  }>;
}

export async function POST(_request: Request, context: RouteParams) {
  const params = await context.params;
  const workflow = workflowStore.getWorkflow(params.id);
  if (!workflow) {
    return NextResponse.json({ error: "Workflow not found." }, { status: 404 });
  }

  const updated = workflowStore.updateDraft(params.id, params.draft_id, (draft) => ({
    ...draft,
    meta: {
      ...draft.meta,
      status: "approved",
    },
  }));

  if (!updated) {
    return NextResponse.json({ error: "Draft not found." }, { status: 404 });
  }

  const allApproved = workflowStore
    .getWorkflow(params.id)
    ?.campaign_execution_drafts.every((draft) => draft.meta.status === "approved");

  if (allApproved) {
    workflowStore.addLog(params.id, {
      role: "marketing_manager",
      step_id: "workflow_ready",
      message:
        "[Scott]: Campaign fully approved — generating final audit export for your files.",
    });
  }

  return NextResponse.json({ draft_id: params.draft_id, status: "approved" });
}
