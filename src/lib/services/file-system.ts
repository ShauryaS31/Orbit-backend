import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { slidePrimaryBody, slidePrimaryHeadline } from "@/lib/agents/draft-utils";
import { buildStrategyDocuments } from "@/lib/agents/marketing-manager";
import type { CampaignExecutionDraft, WorkflowState } from "@/lib/types/orbit";

export async function createCampaignWorkspace(workflow: WorkflowState): Promise<string> {
  const companyName = workflow.website_intelligence?.company_name ?? "Unknown_Company";
  const safeCompany = sanitizeName(companyName);
  const root = path.join(process.cwd(), "output", safeCompany);
  const strategyDir = path.join(root, "strategy");
  const assetsDir = path.join(root, "assets");

  await mkdir(strategyDir, { recursive: true });
  await mkdir(assetsDir, { recursive: true });

  const docs = buildStrategyDocuments(workflow);
  await Promise.all(
    docs.map((doc) => writeFile(path.join(strategyDir, doc.filename), doc.content, "utf8")),
  );

  for (const draft of workflow.campaign_execution_drafts) {
    const folderName = `Day_${draft.meta.day}_${capitalize(draft.meta.channel)}`;
    const dayDir = path.join(assetsDir, folderName);
    await mkdir(dayDir, { recursive: true });

    const postCopy = getPostCopy(draft);
    await writeFile(path.join(dayDir, "post_copy.txt"), postCopy, "utf8");

    const matchingAsset = workflow.generated_campaign_assets.find(
      (asset) => asset.day === draft.meta.day,
    );
    if (!matchingAsset) {
      continue;
    }

    try {
      const response = await fetch(matchingAsset.image_url);
      if (!response.ok) {
        throw new Error(`Failed with status ${response.status}`);
      }
      const bytes = Buffer.from(await response.arrayBuffer());
      await writeFile(path.join(dayDir, "visual.png"), bytes);
    } catch {
      await writeFile(path.join(dayDir, "visual.url.txt"), matchingAsset.image_url, "utf8");
    }
  }

  return root;
}

function getPostCopy(draft: CampaignExecutionDraft): string {
  if (draft.type === "carousel") {
    return [
      `Caption: ${draft.caption}`,
      "",
      ...draft.slides.map(
        (slide, index) =>
          `Slide ${index + 1}\nHeadline: ${slidePrimaryHeadline(slide)}\nCopy: ${slidePrimaryBody(slide)}\nDesignArtifact.visual_prompt: ${slide.design_artifact?.visual_prompt ?? slide.visual_prompt ?? "N/A"}\nlayout_config: ${slide.design_artifact ? JSON.stringify(slide.design_artifact.layout_config) : "N/A"}`,
      ),
    ].join("\n\n");
  }
  if (draft.type === "linkedin_post") {
    return draft.body;
  }
  return [`Subject: ${draft.subject_line}`, "", draft.body_markdown].join("\n");
}

function sanitizeName(value: string): string {
  return value.replace(/[^a-zA-Z0-9]+/g, "_").replace(/^_+|_+$/g, "") || "Campaign";
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
