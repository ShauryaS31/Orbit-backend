import { applyBrandLearning, generateDesignSystem } from "@/lib/agents/researcher";
import { runMarketingManagerAgent } from "@/lib/agents/marketing-manager";
import {
  buildDesignStudioExportsBundle,
  enrichCarouselDraftWithStudioExport,
} from "@/lib/skills/design-artifact-skill";
import { createCampaignWorkspace } from "@/lib/services/file-system";
import { appendGovernanceLog, createGovernanceEntry } from "@/lib/services/governance-logger";
import { SKILL_IDS } from "@/lib/services/skill-catalog";
import { generateBrandBackground } from "@/lib/services/image-generator";
import { workflowStore } from "@/lib/state/workflow-store";
import type { CampaignExecutionDraft, GeneratedCampaignAsset } from "@/lib/types/orbit";

export async function runCampaignGeneration(workflowId: string): Promise<void> {
  let workflow = workflowStore.getWorkflow(workflowId);
  if (!workflow || !workflow.website_intelligence || !workflow.brand_kit || !workflow.product_marketing_context) {
    throw new Error("Workflow missing required context for campaign generation.");
  }

  if (workflow.brand_learning_notes?.length) {
    const blended = applyBrandLearning(
      workflow.website_intelligence,
      workflow.brand_learning_notes,
      workflow.product_marketing_context,
    );
    workflowStore.updateWorkflow(workflowId, {
      website_intelligence: blended.intelligence,
      ...(blended.marketing ? { product_marketing_context: blended.marketing } : {}),
    });
    for (const entry of blended.governanceDelta) {
      appendGovernanceLog(workflowId, entry);
    }
    workflow = workflowStore.getWorkflow(workflowId)!;
    if (!workflow.website_intelligence || !workflow.brand_kit || !workflow.product_marketing_context) {
      throw new Error("Workflow missing required context after brand learning merge.");
    }
  }

  workflowStore.addLog(workflowId, {
    role: "researcher",
    step_id: "brand_profile_loaded",
    message:
      "[Nova]: Diving into the company DNA to find brand signals for Scott...",
  });
  await thinkTime(workflow.demo_mode && !workflow.carousel_maker_mode);

  workflowStore.addLog(workflowId, {
    role: "researcher",
    step_id: "brand_profile_loaded",
    message: "[Nova]: Organizing palette and audience data from internal memory...",
  });
  await thinkTime(workflow.demo_mode && !workflow.carousel_maker_mode);

  const designSystem = await generateDesignSystem({
    intelligence: workflow.website_intelligence,
    brandKit: workflow.brand_kit,
  });

  workflowStore.updateWorkflow(workflowId, {
    design_system: designSystem,
  });

  appendGovernanceLog(
    workflowId,
    createGovernanceEntry({
      agent_id: "researcher",
      step_id: "brand_profile_loaded",
      decision: "Grounded palette and typography tokens before downstream TSX artifacts.",
      rationale: `Fonts (${designSystem.typography.heading_font}, ${designSystem.typography.body_font}) pair with crawl HEX anchors and mood spine (${designSystem.mood_vibe.join(", ")}) so layouts inherit coherent hierarchy without drifting off-brand.`,
      resulting_asset: "design_system",
      source_url: workflow.company_url,
    }),
  );

  workflowStore.addLog(workflowId, {
    role: "marketing_manager",
    step_id: "brand_profile_loaded",
    message:
      "[Scott]: Nova's palette tokens are locked — downstream assets stay on-brand.",
  });
  await thinkTime(workflow.demo_mode && !workflow.carousel_maker_mode);

  workflowStore.addLog(workflowId, {
    role: "marketing_manager",
    step_id: "marketing_context_built",
    message: `[Scott]: Nova's research is in. Aligning our 7-day strategy to ${workflow.business_goal ?? "your stated outcomes"}...`,
  });
  await thinkTime(workflow.demo_mode && !workflow.carousel_maker_mode);

  if (workflow.carousel_maker_mode) {
    workflowStore.addLog(workflowId, {
      role: "carousel_specialist",
      step_id: "campaign_draft_generated",
      message:
        "[Scott]: Deploying Carousel Maker skill — Neon Red/Blue DNA across ten slides.",
    });
  }

  const managerOutput = runMarketingManagerAgent({
    companyName: workflow.website_intelligence.company_name,
    brandKit: workflow.brand_kit,
    context: workflow.product_marketing_context,
    visualIdentity: workflow.visual_identity,
    designSystem,
    carouselMaker: workflow.carousel_maker_mode === true,
    business_goal: workflow.business_goal,
    success_metric: workflow.success_metric,
  });

  for (const entry of managerOutput.governance_entries ?? []) {
    appendGovernanceLog(workflowId, entry);
  }

  for (const skillId of managerOutput.selected_skills ?? []) {
    workflowStore.addLog(workflowId, {
      role: "marketing_manager",
      step_id: "marketing_context_built",
      message: `[Scott]: Assigning '${skillId}' skill toward '${workflow.business_goal ?? "Growth narrative"}'.`,
    });
  }

  workflowStore.addLog(workflowId, {
    role: "marketing_manager",
    step_id: "campaign_draft_generated",
    message: `[Scott]: Manager review complete. Deploying specialists for ${workflow.success_metric ?? "your success metric"}...`,
  });

  workflowStore.addLog(workflowId, {
    role: "visual_agent",
    step_id: "campaign_draft_generated",
    message:
      "[Scott · visual skill]: Synthesizing carousel artifact bundle (React/Tailwind)...",
  });

  const designStudioExports = buildDesignStudioExportsBundle(
    designSystem,
    workflow.product_marketing_context,
    workflow.website_intelligence.company_name,
  );

  appendGovernanceLog(
    workflowId,
    createGovernanceEntry({
      agent_id: "design_artifact_skill",
      step_id: "campaign_draft_generated",
      decision: "Bundled modular TSX outputs for carousel, Instagram story (9:16), and pitch narratives.",
      rationale: describeDesignArtifactBundle(managerOutput.selected_skills ?? []),
      resulting_asset: "design_studio_exports",
      source_url: workflow.company_url,
    }),
  );

  const draftsWithStudio: CampaignExecutionDraft[] = managerOutput.drafts.map((draft) =>
    draft.type === "carousel" ?
      enrichCarouselDraftWithStudioExport(designSystem, draft)
    : draft,
  );

  const generatedAssets = await generateVisualAssets(workflowId, {
    companyName: workflow.website_intelligence.company_name,
    brandKit: workflow.brand_kit,
    context: workflow.product_marketing_context,
    visualIdentity: workflow.visual_identity,
  });

  workflowStore.updateWorkflow(workflowId, {
    status: "running",
    campaign_execution_drafts: draftsWithStudio,
    generated_campaign_assets: generatedAssets,
    design_studio_exports: designStudioExports,
    selected_skills: managerOutput.selected_skills,
  });

  workflowStore.addLog(workflowId, {
    role: "copywriter",
    step_id: "campaign_draft_generated",
    message:
      "[Scott · content skill]: Initial drafts packaged — channel SOPs applied.",
  });
  const dayOneLinkedIn = draftsWithStudio.find(
    (draft) => draft.meta.day === 1 && draft.meta.channel === "linkedin",
  );
  workflowStore.addLog(workflowId, {
    role: "content_specialist",
    step_id: "campaign_draft_generated",
    message: `[Scott · content skill]: Drafting LinkedIn Founder Story (Day 1)...${dayOneLinkedIn ? " Complete." : ""}`,
  });
  await thinkTime(workflow.demo_mode && !workflow.carousel_maker_mode);

  workflowStore.addLog(workflowId, {
    role: "visual_agent",
    step_id: "visual_assets_generated",
    message:
      "[Scott · visual skill]: Rendering high-fidelity abstract backgrounds...",
  });
  await thinkTime(workflow.demo_mode && !workflow.carousel_maker_mode);

  workflowStore.addLog(workflowId, {
    role: "analyst",
    step_id: "campaign_draft_generated",
    message:
      "[Scott · QA skill]: Verifying brand compliance and emoji limits...",
  });

  for (const contentLog of managerOutput.logs) {
    const contentSkill =
      contentLog.includes("[Scott · content skill]") ||
      contentLog.includes("[Scott · QA skill]");
    workflowStore.addLog(workflowId, {
      role: contentSkill ? "content_specialist" : "marketing_manager",
      step_id: "campaign_draft_generated",
      message: contentLog,
    });
  }
  workflowStore.addLog(workflowId, {
    role: "visual_agent",
    step_id: "visual_assets_generated",
    message: "[Scott · visual skill]: Assets ready for founder review.",
  });

  const latestWorkflow = workflowStore.getWorkflow(workflowId);
  if (latestWorkflow) {
    try {
      await createCampaignWorkspace(latestWorkflow);
      workflowStore.addLog(workflowId, {
        role: "marketing_manager",
        step_id: "campaign_package_ready",
        message: `[Scott]: Workspace packaged on server — assets organized for ${latestWorkflow.website_intelligence?.company_name ?? "the company"}.`,
      });
    } catch (error) {
      workflowStore.addLog(workflowId, {
        role: "marketing_manager",
        step_id: "campaign_package_ready",
        message: `[Scott]: Workspace packaging warning — ${(error as Error).message}`,
      });
    }
  }

  workflowStore.addLog(workflowId, {
    role: "marketing_manager",
    step_id: "workflow_ready",
    message: "[Scott]: Campaign workspace is ready for the UI.",
  });
}

function describeDesignArtifactBundle(skillIds: string[]): string {
  const parts: string[] = [];
  if (skillIds.includes(SKILL_IDS.premium_pitch_deck)) {
    parts.push("Pitch deck export prioritizes investor storyline scaffolding.");
  }
  if (skillIds.includes(SKILL_IDS.linkedin_carousel_artifact)) {
    parts.push("LinkedIn carousel artifact preserves vertical sequencing for proof→CTA beats.");
  }
  if (skillIds.includes(SKILL_IDS.instagram_story_artifact)) {
    parts.push("Instagram story artifact biases thumb-zone emphasis for mobile discovery.");
  }
  if (skillIds.includes(SKILL_IDS.multi_channel_social_bundle)) {
    parts.push("Multi-channel posture repeats pillars across surfaces without copying verbatim.");
  }
  parts.push("Spacing/radius primitives remain anchored to locked BrandDesignSystem tokens.");
  return parts.join(" ");
}

async function generateVisualAssets(
  workflowId: string,
  managerInput: Parameters<typeof runMarketingManagerAgent>[0],
): Promise<GeneratedCampaignAsset[]> {
  const days: Array<1 | 3 | 5> = [1, 3, 5];
  const assets: GeneratedCampaignAsset[] = [];

  workflowStore.addLog(workflowId, {
    role: "visual_agent",
    step_id: "visual_assets_generated",
    message: `[Scott · visual skill]: Analyzing ${managerInput.companyName} palette for background synthesis...`,
  });

  for (const day of days) {
    workflowStore.addLog(workflowId, {
      role: "visual_agent",
      step_id: "visual_assets_generated",
      message: `[Scott · visual skill]: Generating abstract motif for Instagram Carousel Day ${day}...`,
    });

    try {
      const response = await generateBrandBackground(
        `Campaign background for Instagram Carousel Day ${day}. Context: ${managerInput.context.mission_statement}.`,
        managerInput.brandKit,
        managerInput.visualIdentity,
      );

      assets.push({
        id: crypto.randomUUID(),
        draft_type: "carousel",
        platform: "instagram",
        day,
        prompt: response.full_prompt,
        image_url: response.image_url,
        created_at: new Date().toISOString(),
      });
      await thinkTime(
        workflowStore.getWorkflow(workflowId)?.demo_mode === true &&
          workflowStore.getWorkflow(workflowId)?.carousel_maker_mode !== true,
      );
    } catch (error) {
      workflowStore.addLog(workflowId, {
        role: "visual_agent",
        step_id: "visual_assets_generated",
        message: `[Scott · visual skill]: Generation failed for Day ${day}. ${(error as Error).message}`,
      });
    }
  }

  const wf = workflowStore.getWorkflow(workflowId);
  appendGovernanceLog(
    workflowId,
    createGovernanceEntry({
      agent_id: "visual_agent",
      step_id: "visual_assets_generated",
      decision: "Rendered abstract campaign backgrounds aligned to chromatic hierarchy.",
      rationale: `Motifs amplify palette contrast (${managerInput.brandKit.primary_hex} ↔ ${managerInput.brandKit.accent_hex}) while reinforcing ${wf?.visual_identity?.visual_tone ?? "brand"} posture—abstract only (no figurative overlays).`,
      resulting_asset: "generated_campaign_assets",
    }),
  );

  return assets;
}

async function thinkTime(isDemoMode: boolean): Promise<void> {
  if (!isDemoMode) {
    return;
  }
  const delayMs = 500 + Math.floor(Math.random() * 501);
  await new Promise<void>((resolve) => {
    setTimeout(() => resolve(), delayMs);
  });
}
