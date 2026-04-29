import { NextResponse } from "next/server";

import { regenerateSpecificDraft } from "@/lib/agents/marketing-manager";
import { workflowStore } from "@/lib/state/workflow-store";

interface RouteParams {
  params: Promise<{
    id: string;
    draft_id: string;
  }>;
}

interface RegenerateBody {
  reviewer_note?: string;
}

export async function POST(request: Request, context: RouteParams) {
  const params = await context.params;
  const workflow = workflowStore.getWorkflow(params.id);
  if (!workflow) {
    return NextResponse.json({ error: "Workflow not found." }, { status: 404 });
  }

  const draft = workflowStore.getDraft(params.id, params.draft_id);
  if (!draft) {
    return NextResponse.json({ error: "Draft not found." }, { status: 404 });
  }

  const body = (await request.json().catch(() => ({}))) as RegenerateBody;
  const reviewerNote = body.reviewer_note?.trim() || draft.meta.reviewer_note;
  if (!reviewerNote) {
    return NextResponse.json({ error: "Field 'reviewer_note' is required." }, { status: 400 });
  }

  if (!workflow.brand_kit || !workflow.product_marketing_context || !workflow.website_intelligence) {
    return NextResponse.json(
      { error: "Workflow is missing brand context required for regeneration." },
      { status: 400 },
    );
  }

  workflowStore.addLog(params.id, {
    role: "marketing_manager",
    step_id: "campaign_draft_generated",
    message: `[Scott]: Day ${draft.meta.day} draft is regenerating from founder feedback...`,
  });
  workflowStore.addLog(params.id, {
    role: "content_specialist",
    step_id: "campaign_draft_generated",
    message: `[Scott · content skill]: Re-drafting Day ${draft.meta.day} with founder feedback...`,
  });

  const regenerated = regenerateSpecificDraft(
    draft,
    {
      companyName: workflow.website_intelligence.company_name,
      brandKit: workflow.brand_kit,
      context: workflow.product_marketing_context,
      visualIdentity: workflow.visual_identity,
      designSystem: workflow.design_system,
      carouselMaker: workflow.carousel_maker_mode === true,
      business_goal: workflow.business_goal,
      success_metric: workflow.success_metric,
    },
    reviewerNote,
  );

  const updated = workflowStore.updateDraft(params.id, params.draft_id, () => regenerated);
  if (!updated) {
    return NextResponse.json({ error: "Draft not found during update." }, { status: 404 });
  }

  return NextResponse.json({ draft_id: updated.meta.id, status: updated.meta.status, draft: updated });
}
