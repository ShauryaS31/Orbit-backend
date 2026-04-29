import { NextResponse } from "next/server";

import { fuseBrandIntelligence } from "@/lib/agents/researcher";
import { analyzeVisualBrand } from "@/lib/services/asset-auditor";
import { workflowStore } from "@/lib/state/workflow-store";

interface AnalyzeAssetBody {
  workflow_id?: string;
  image_base64?: string;
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as AnalyzeAssetBody;
  const base64Image = body.image_base64?.trim();
  if (!base64Image) {
    return NextResponse.json({ error: "Field 'image_base64' is required." }, { status: 400 });
  }

  const visualIdentity = await analyzeVisualBrand(base64Image);

  if (body.workflow_id) {
    const workflow = workflowStore.getWorkflow(body.workflow_id);
    if (workflow && workflow.website_intelligence && workflow.brand_kit) {
      const fused = fuseBrandIntelligence(
        workflow.website_intelligence,
        workflow.brand_kit,
        visualIdentity,
      );
      workflowStore.updateWorkflow(body.workflow_id, {
        brand_kit: fused.brand_kit,
        visual_identity: fused.visual_identity,
      });
      workflowStore.addLog(body.workflow_id, {
        role: "researcher",
        step_id: "brand_profile_loaded",
        message: `[Nova]: Visual DNA extracted from your asset — folded into signals for Scott (${visualIdentity.style_description}).`,
      });
    }
  }

  return NextResponse.json({
    visual_identity: visualIdentity,
  });
}
