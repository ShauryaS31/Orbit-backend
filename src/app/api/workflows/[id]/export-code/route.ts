import { NextResponse } from "next/server";

import {
  enrichCarouselDraftWithStudioExport,
  wrapProductionReadyReactExport,
} from "@/lib/skills/design-artifact-skill";
import type { CampaignCarouselDraft } from "@/lib/types/orbit";
import { workflowStore } from "@/lib/state/workflow-store";

interface RouteParams {
  params: Promise<{
    id: string;
  }>;
}

interface ExportBody {
  draft_id?: string;
}

export async function POST(request: Request, context: RouteParams) {
  const params = await context.params;
  const workflow = workflowStore.getWorkflow(params.id);
  if (!workflow) {
    return NextResponse.json({ error: "Workflow not found." }, { status: 404 });
  }

  const body = (await request.json().catch(() => ({}))) as ExportBody;
  const draftId = body.draft_id?.trim();
  if (!draftId) {
    return NextResponse.json({ error: "Field 'draft_id' is required." }, { status: 400 });
  }

  const draft = workflowStore.getDraft(params.id, draftId);
  if (!draft || draft.type !== "carousel") {
    return NextResponse.json(
      { error: "Carousel draft not found." },
      { status: 404 },
    );
  }

  if (draft.meta.status !== "approved") {
    return NextResponse.json(
      { error: "Draft must be approved before code export." },
      { status: 400 },
    );
  }

  const designSystem = workflow.design_system;
  if (!designSystem) {
    return NextResponse.json(
      {
        error:
          "Workflow has no design_system. Re-run campaign generation after AI Design Studio.",
      },
      { status: 409 },
    );
  }

  const carouselDraft = draft as CampaignCarouselDraft;
  const inner =
    carouselDraft.studio_react_export ??
    enrichCarouselDraftWithStudioExport(designSystem, carouselDraft).studio_react_export;

  if (!inner) {
    return NextResponse.json(
      { error: "Could not produce React export for this draft." },
      { status: 500 },
    );
  }

  const react_tsx = wrapProductionReadyReactExport(inner);

  return NextResponse.json({
    draft_id: draftId,
    react_tsx,
    instruction:
      "Export this design to responsive, production-ready React code using Tailwind CSS.",
  });
}
