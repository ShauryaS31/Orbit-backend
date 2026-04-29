import type {
  BrandDesignSystem,
  BrandKit,
  CampaignCarouselDraft,
  CampaignExecutionDraft,
  CampaignEmailDraft,
  CampaignLinkedInPostDraft,
  GovernanceAuditEntry,
  LyraWarmIntelligence,
  ManagerContentReview,
  ManagerWorkflowStep,
  ProductMarketingContext,
  VisualIdentity,
  WorkflowState,
} from "@/lib/types/orbit";
import { LYRA_WARM_INTELLIGENCE } from "@/lib/data/lyra-brand-intelligence";
import { countEmojis, hasForbiddenPhrase } from "@/lib/agents/prompts";
import {
  buildChannelSopPrompt,
  createEmailDraft,
  createInstagramCarouselDraft,
  createInstagramCarouselExpertDraft,
  createLinkedInPosterDraft,
} from "@/lib/skills/formatting-skill";
import { applyManagerContentReviews } from "@/lib/services/manager-content-review";
import { createGovernanceEntry } from "@/lib/services/governance-logger";
import {
  classifyGoalKind,
  resolveSkillsForGoal,
  type GoalKind,
} from "@/lib/services/skill-catalog";

export interface ManagerInput {
  companyName: string;
  brandKit: BrandKit;
  context: ProductMarketingContext;
  visualIdentity?: VisualIdentity;
  /** Must be produced before drafts when AI Design Studio orchestration runs. */
  designSystem?: BrandDesignSystem;
  /** Design-first expert carousel — single 10-slide pass (Carousel Maker mode). */
  carouselMaker?: boolean;
  /** North-star narrative for skill routing (e.g. Series A fundraising). */
  business_goal?: string;
  /** Measurable outcome drafts should support. */
  success_metric?: string;
  /** Founder notes blended upstream — used by manager content guardrail reference checks. */
  brand_learning_notes?: string[];
  /** Warm-cache dossier — tightens overlap checks without implying extra crawl. */
  lyra_warm_intelligence?: LyraWarmIntelligence;
}

export interface ManagerOutput {
  drafts: CampaignExecutionDraft[];
  logs: string[];
  /** Stable catalog IDs selected for this run (design + channel bundle). */
  selected_skills?: string[];
  workflow_steps?: ManagerWorkflowStep[];
  governance_entries?: GovernanceAuditEntry[];
  /** Phase 3 — deterministic Scott QA summaries (mirrored on each draft.meta.manager_review). */
  manager_content_reviews?: ManagerContentReview[];
}

export interface StrategyDocument {
  filename: "Brand_Strategy_Summary.md" | "Campaign_Brief.md" | "Creative_Brief.md";
  content: string;
}

function mergeManagerReviewPass(
  input: ManagerInput,
  drafts: CampaignExecutionDraft[],
  governanceSoFar: GovernanceAuditEntry[],
): {
  drafts: CampaignExecutionDraft[];
  governance_entries: GovernanceAuditEntry[];
  manager_content_reviews: ManagerContentReview[];
} {
  const out = applyManagerContentReviews(drafts, {
    companyName: input.companyName,
    businessGoal: input.business_goal,
    successMetric: input.success_metric,
    brandLearningNotes: input.brand_learning_notes ?? [],
    lyraWarmIntelligence: input.lyra_warm_intelligence,
    context: input.context,
  });
  return {
    drafts: out.drafts,
    governance_entries: [...governanceSoFar, ...out.governance_entries],
    manager_content_reviews: out.manager_content_reviews,
  };
}

export function runMarketingManagerAgent(input: ManagerInput): ManagerOutput {
  const drafts: CampaignExecutionDraft[] = [];
  const logs: string[] = [];
  const governance_entries: GovernanceAuditEntry[] = [];

  const goalKind = classifyGoalKind(input.business_goal, input.success_metric);
  const selected_skills = resolveSkillsForGoal(goalKind, input.carouselMaker === true);
  const workflow_steps = buildManagerWorkflowSteps(input, selected_skills, input.carouselMaker === true);

  if (input.designSystem) {
    logs.push("[Scott]: AI Design Studio synchronized — generating campaigns against locked tokens.");
  }

  governance_entries.push(
    createGovernanceEntry({
      agent_id: "content_specialist",
      step_id: "marketing_context_built",
      decision: `Calibrated tone and channel ladder for ${goalKind} posture.`,
      rationale: `Drafts explicitly tie back to "${input.success_metric ?? "the stated outcome"}" — edits emphasize clarity over hype and aim to reduce generic AI-style phrasing while increasing founder authenticity.`,
    }),
  );

  if (input.carouselMaker) {
    logs.push("[Scott]: Carousel Maker mode — Duncan Rogoff expert pipeline (single-pass).");
    const sopPrompt = buildChannelSopPrompt(
      "instagram",
      input.context,
      input.visualIdentity,
      input.companyName,
    );
    const carouselIntent = buildStrategicIntent(1, "instagram", goalKind, input.business_goal, input.success_metric);
    const draft = attachStrategicIntent(
      createInstagramCarouselExpertDraft({
        companyName: input.companyName,
        brandKit: input.brandKit,
        context: input.context,
        day: 1,
        originalPrompt: sopPrompt,
        visualIdentity: input.visualIdentity,
      }),
      carouselIntent,
    );
    const qaDraft = qaSelfCorrectDraft(draft, input, logs);
    const reviewedDraft = reviewAndRegenerateDraft(qaDraft, input, logs);
    const enhanced = applyDraftDiversityAndVisualMetadata(
      [attachStrategicIntent(reviewedDraft, carouselIntent)],
      input,
      logs,
    );
    logs.push("[Scott · QA skill]: Brand filter complete.");
    const reviewed = mergeManagerReviewPass(input, enhanced.drafts, [...governance_entries, ...enhanced.governance]);
    return {
      drafts: reviewed.drafts,
      logs,
      selected_skills,
      workflow_steps,
      governance_entries: reviewed.governance_entries,
      manager_content_reviews: reviewed.manager_content_reviews,
    };
  }

  const schedule: Array<{ day: number; channel: "instagram" | "linkedin" | "email" }> = [
    { day: 1, channel: "instagram" },
    { day: 2, channel: "email" },
    { day: 3, channel: "linkedin" },
    { day: 4, channel: "email" },
    { day: 5, channel: "instagram" },
    { day: 6, channel: "email" },
    { day: 7, channel: "linkedin" },
  ];

  logs.push("[Scott]: Assigning channel work to specialist skills.");

  for (const item of schedule) {
    const sopPrompt = buildChannelSopPrompt(
      item.channel,
      input.context,
      input.visualIdentity,
      input.companyName,
    );
    logs.push(
      `[Scott · content skill]: Applying Human-Natural filter for Day ${item.day} ${capitalize(item.channel)} draft...`,
    );
    logs.push(`[Scott · content skill]: SOP active for ${item.channel}: ${summarizeSop(sopPrompt)}`);

    const intent = buildStrategicIntent(item.day, item.channel, goalKind, input.business_goal, input.success_metric);

    if (item.channel === "instagram") {
      drafts.push(
        attachStrategicIntent(
          createInstagramCarouselDraft({
            companyName: input.companyName,
            brandKit: input.brandKit,
            context: input.context,
            day: item.day,
            originalPrompt: sopPrompt,
            visualIdentity: input.visualIdentity,
          }),
          intent,
        ),
      );
      continue;
    }

    if (item.channel === "linkedin") {
      drafts.push(
        attachStrategicIntent(
          createLinkedInPosterDraft({
            companyName: input.companyName,
            brandKit: input.brandKit,
            context: input.context,
            day: item.day,
            originalPrompt: sopPrompt,
            visualIdentity: input.visualIdentity,
          }),
          intent,
        ),
      );
      continue;
    }

    drafts.push(
      attachStrategicIntent(
        createEmailDraft({
          companyName: input.companyName,
          brandKit: input.brandKit,
          context: input.context,
          day: item.day,
          originalPrompt: sopPrompt,
          visualIdentity: input.visualIdentity,
        }),
        intent,
      ),
    );
  }

  const qaDrafts = drafts.map((draft) => qaSelfCorrectDraft(draft, input, logs));
  const reviewedDrafts = qaDrafts.map((draft) => {
    const reviewed = reviewAndRegenerateDraft(draft, input, logs);
    const intent =
      draft.meta.strategic_intent ??
      reviewed.meta.strategic_intent ??
      buildStrategicIntent(draft.meta.day, draft.meta.channel, goalKind, input.business_goal, input.success_metric);
    return attachStrategicIntent(reviewed, intent);
  });
  const enhancedDrafts = applyDraftDiversityAndVisualMetadata(
    reviewedDrafts,
    input,
    logs,
  );
  logs.push("[Scott · QA skill]: Brand filter complete.");

  const reviewed = mergeManagerReviewPass(input, enhancedDrafts.drafts, [...governance_entries, ...enhancedDrafts.governance]);
  return {
    drafts: reviewed.drafts,
    logs,
    selected_skills,
    workflow_steps,
    governance_entries: reviewed.governance_entries,
    manager_content_reviews: reviewed.manager_content_reviews,
  };
}

function buildManagerWorkflowSteps(
  input: ManagerInput,
  selectedSkills: string[],
  carouselMaker: boolean,
): ManagerWorkflowStep[] {
  const channelPlan = carouselMaker ? "expert Instagram carousel" : "Instagram, LinkedIn, and email";
  const skillList = selectedSkills.length ? selectedSkills.join(", ") : "content, visual, and QA skills";
  const goal = input.business_goal ?? "the requested growth objective";

  return [
    {
      id: "manager_understands_context",
      label: "Scott reads context",
      owner_agent_id: "scott",
      owner_display_name: "Scott",
      owner_role: "manager",
      summary: `Read ${input.companyName} context and frame the job around ${goal}.`,
      expected_output: "Context-aware manager brief",
      depends_on: [],
      completion_step_ids: ["request_received"],
      completion_log_patterns: ["reading the goal", "demo workflow received"],
    },
    {
      id: "manager_creates_plan",
      label: "Scott creates plan",
      owner_agent_id: "scott",
      owner_display_name: "Scott",
      owner_role: "manager",
      summary: `Create a ${channelPlan} plan and choose the specialist skills needed.`,
      expected_output: "Structured task plan with channel sequence",
      depends_on: ["manager_understands_context"],
      completion_step_ids: ["marketing_context_built"],
      completion_log_patterns: ["breaking the growth objective", "aligning our 7-day strategy"],
    },
    {
      id: "manager_delegates_skills",
      label: "Scott delegates skills",
      owner_agent_id: "scott",
      owner_display_name: "Scott",
      owner_role: "manager",
      summary: `Assign ${skillList} to produce copy, creative direction, and QA.`,
      expected_output: "Specialist assignments",
      depends_on: ["manager_creates_plan"],
      completion_step_ids: ["marketing_context_built"],
      completion_log_patterns: ["assigning"],
    },
    {
      id: "nova_and_skills_produce_drafts",
      label: "Nova produces drafts",
      owner_agent_id: "nova",
      owner_display_name: "Nova",
      owner_role: "employee",
      summary: `Turn Scott's brief into channel-ready ${channelPlan} draft content.`,
      expected_output: "Campaign execution drafts",
      depends_on: ["manager_delegates_skills"],
      completion_step_ids: ["campaign_draft_generated"],
      completion_log_patterns: ["initial drafts packaged", "drafting"],
    },
    {
      id: "nova_generates_visuals",
      label: "Nova prepares visuals",
      owner_agent_id: "nova",
      owner_display_name: "Nova",
      owner_role: "employee",
      summary: "Generate visual briefs and image assets from the approved brand direction.",
      expected_output: "Generated campaign image assets",
      depends_on: ["nova_and_skills_produce_drafts"],
      completion_step_ids: ["visual_assets_generated"],
      completion_log_patterns: ["assets ready", "generating"],
    },
    {
      id: "manager_reviews_package",
      label: "Scott reviews package",
      owner_agent_id: "scott",
      owner_display_name: "Scott",
      owner_role: "manager",
      summary: "Review governance, assemble the workspace, and mark the final package ready.",
      expected_output: "Final growth strategy package",
      depends_on: ["nova_generates_visuals"],
      completion_step_ids: ["campaign_package_ready", "workflow_ready"],
      completion_log_patterns: ["workspace packaged", "workspace is ready"],
    },
  ];
}

function attachStrategicIntent(draft: CampaignExecutionDraft, intent: string): CampaignExecutionDraft {
  return {
    ...draft,
    meta: {
      ...draft.meta,
      strategic_intent: intent,
    },
  };
}

/** Short creative/action framing for the Strategy line (channel + goal posture). */
function creativeStrategyPhrase(
  channel: "instagram" | "linkedin" | "email",
  goalKind: GoalKind,
): string {
  const matrix: Record<GoalKind, Record<typeof channel, string>> = {
    conversion: {
      instagram:
        "Using stacked carousel slides that move from proof to a decisive CTA",
      linkedin: "Using a high-authority founder story",
      email: "Using a concise one-to-one email with a single next step",
    },
    investor: {
      instagram: "Using a credibility-forward carousel arc",
      linkedin: "Using investor-readable storyline hooks in the founder feed",
      email: "Using a tight fundraising-oriented touchpoint",
    },
    awareness: {
      instagram: "Using reach-ready carousel storytelling",
      linkedin: "Using broad-reach founder commentary",
      email: "Using nurture-style amplification",
    },
    general: {
      instagram: "Using modular carousel beats",
      linkedin: "Using disciplined LinkedIn narrative rhythm",
      email: "Using steady email cadence",
    },
  };
  return matrix[goalKind][channel];
}

function buildStrategicIntent(
  day: number,
  channel: "instagram" | "linkedin" | "email",
  goalKind: GoalKind,
  businessGoal?: string,
  successMetric?: string,
): string {
  const bg = businessGoal?.trim();
  const sm = successMetric?.trim();
  const action = creativeStrategyPhrase(channel, goalKind);

  if (bg && sm) {
    return `Strategy: ${action} to drive ${sm}, ultimately supporting the primary goal of ${bg}.`;
  }
  if (bg && !sm) {
    return `Strategy: ${action} on ${channel} (Day ${day}), ultimately supporting the primary goal of ${bg}.`;
  }
  if (!bg && sm) {
    return `Strategy: ${action} to drive ${sm}, anchored to execution on ${channel} (Day ${day}).`;
  }

  const m = "business outcomes";
  switch (goalKind) {
    case "conversion":
      return `Supports "${m}" by sequencing proof → offer on ${channel} (Day ${day}), leaning on carousel/story artifacts where buyers evaluate fast.`;
    case "investor":
      return `Supports "${m}" by stressing credibility and storyline clarity on ${channel} (Day ${day}), sequencing pitch-adjacent beats alongside founder POV.`;
    case "awareness":
      return `Supports "${m}" by widening surface area on ${channel} (Day ${day}) while repeating differentiated pillars without watering positioning.`;
    default:
      return `Supports "${m}" through disciplined rhythm on ${channel} (Day ${day}) mapped to modular studio artifacts.`;
  }
}

interface DiversityPlan {
  day: number;
  content_angle: string;
  source_anchor: string;
  buyer_objection: string;
  channel_strategy: string;
  cta_style: string;
  cta_text: string;
  hook?: string;
  visual_concept?: string;
  story_frame_sequence?: string[];
}

function isLyraInput(input: ManagerInput): boolean {
  return (
    input.companyName.toLowerCase().includes("lyra") ||
    input.context.mission_statement.toLowerCase().includes("lyra")
  );
}

function lyraDiversityPlan(): DiversityPlan[] {
  return [
    {
      day: 1,
      content_angle: "Talent density -> Lyra100, hiring bar, Fellowship",
      source_anchor: "Lyra100 hiring campaign",
      buyer_objection: "Can Lyra actually field elite engineers fast enough?",
      channel_strategy: "Instagram behind-the-scenes proof-led hook",
      cta_style: "Builder curiosity",
      cta_text: "See how Lyra builds high-density teams",
      hook: "What a builder-native AI company looks like after hours",
      visual_concept: "After-hours engineering floor with dense collaboration",
      story_frame_sequence: [
        "Hook: after-hours engineering table",
        "Proof: talent density and hiring standards",
        "CTA: founder/operator strategy call",
      ],
    },
    {
      day: 2,
      content_angle: "Insight/problem sequence opener",
      source_anchor: "Rigorous take-home hiring process",
      buyer_objection: "Is this just another agency pitch?",
      channel_strategy: "Email 1 insight/problem",
      cta_style: "Low-friction reply CTA",
      cta_text: "Reply if this execution bottleneck sounds familiar",
    },
    {
      day: 3,
      content_angle: "Client proof -> ReadMe, Prophecy Gov, Hobbes, Thunder Compute",
      source_anchor: "Prophecy Gov, Hobbes, Thunder Compute project proof",
      buyer_objection: "Can they ship outside marketing language and deliver real systems?",
      channel_strategy: "LinkedIn founder/operator proof post",
      cta_style: "Evidence-led strategy CTA",
      cta_text: "Book a founder/operator strategy call",
    },
    {
      day: 4,
      content_angle: "Frontier AI proximity -> Anthropic x Lyra",
      source_anchor: "Anthropic x Lyra board game night",
      buyer_objection: "Are they close to frontier AI ecosystems or just trend-following?",
      channel_strategy: "Email 2 proof/case evidence",
      cta_style: "Partnership credibility CTA",
      cta_text: "Ask for the Anthropic-to-delivery playbook",
    },
    {
      day: 5,
      content_angle: "Community gravity -> Lyrathon, Iftar, student societies",
      source_anchor: "Lyrathon community proof",
      buyer_objection: "Does culture content connect to execution, or is it just branding?",
      channel_strategy: "Instagram community/event proof",
      cta_style: "Community-to-execution CTA",
      cta_text: "See how community drives shipping velocity",
      hook: "From Fellowship demand to shipped startup work",
      visual_concept: "Hackathon/community energy with technical artifacts",
      story_frame_sequence: [
        "Hook: Lyrathon community turnout",
        "Proof: Fellowship and student pipeline",
        "CTA: strategy session for execution systems",
      ],
    },
    {
      day: 6,
      content_angle: "Multi-city scale -> Sydney + Melbourne expansion",
      source_anchor: "Melbourne expansion",
      buyer_objection: "Can they scale delivery quality across multiple locations?",
      channel_strategy: "Email 3 conversion/strategy call",
      cta_style: "Direct conversion CTA",
      cta_text: "Schedule a founder/operator strategy call this week",
    },
    {
      day: 7,
      content_angle: "Culture as execution proof + founder trust",
      source_anchor: "Not a traditional SaaS startup or generic agency",
      buyer_objection: "Will they understand founder urgency and operator constraints?",
      channel_strategy: "LinkedIn close with founder/operator trust narrative",
      cta_style: "Decisive founder CTA",
      cta_text: "Start with a build audit",
    },
  ];
}

function buildDetailedImagePrompt(input: ManagerInput, plan: DiversityPlan, channel: string): string {
  const motifs = LYRA_WARM_INTELLIGENCE.visual_motifs.join("; ");
  const avoid = LYRA_WARM_INTELLIGENCE.avoid_list.join(", ");
  return `A high-energy editorial visual for ${input.companyName} focused on "${plan.content_angle}". Subject: ${
    plan.visual_concept ?? "builder-native engineering collaboration"
  }. Setting: Sydney or Melbourne startup office with real shipping cues (whiteboards, architecture notes, laptops, code reviews). Composition: medium-wide with layered foreground-to-background depth and a visible execution focal point. Camera/framing: documentary style with natural perspective and no staged corporate poses. Lighting: warm practical office lighting with high-contrast accent highlights. Color palette: ${input.brandKit.primary_hex}, ${input.brandKit.secondary_hex}, ${input.brandKit.accent_hex}. Typography direction: clean, minimal overlays that leave room for headline/CTA. Brand mood: strategic, technical, founder-first, builder-native. Lyra source anchor: ${plan.source_anchor}. Channel context: ${channel}. Optional motif cues: ${motifs}. Avoid: ${avoid}.`;
}

function buildCarouselSlideCopy(input: ManagerInput, plan: DiversityPlan, sourceAnchor: string) {
  const mission =
    input.context.mission_statement ||
    `${input.companyName} helps high-growth teams turn strategy into shipped work.`;
  const hook = plan.hook ?? "Builder-native execution";

  return [
    {
      headline: hook.length > 30 ? "Look Behind The Build" : hook,
      body: `${plan.content_angle}. This is the proof frame: ${sourceAnchor}.`,
    },
    {
      headline: "The Real Friction",
      body: `${plan.buyer_objection} That is the doubt this post has to answer without hype.`,
    },
    {
      headline: "Proof In Motion",
      body: `${mission.slice(0, 118)}${mission.length > 118 ? "..." : ""}`,
    },
    {
      headline: "Next Step",
      body: plan.cta_text,
    },
  ];
}

function applyDraftDiversityAndVisualMetadata(
  drafts: CampaignExecutionDraft[],
  input: ManagerInput,
  logs: string[],
): { drafts: CampaignExecutionDraft[]; governance: GovernanceAuditEntry[] } {
  if (drafts.length === 0) return { drafts, governance: [] };

  const governance: GovernanceAuditEntry[] = [];
  const lyraMode = isLyraInput(input);
  const plan = lyraMode ? lyraDiversityPlan() : [];

  const enhanced = drafts.map((draft, index) => {
    const draftPlan =
      plan.find((item) => item.day === draft.meta.day) ??
      ({
        day: draft.meta.day,
        content_angle: `Channel-specific conversion angle for day ${draft.meta.day}`,
        source_anchor: `Workflow proof anchor ${draft.meta.day}`,
        buyer_objection: "Will this improve operator outcomes materially?",
        channel_strategy: `${draft.meta.channel} conversion sequencing`,
        cta_style: "Outcome-led",
        cta_text: input.context.primary_cta,
      } as DiversityPlan);

    const previous = plan.find((item) => item.day === draft.meta.day - 1);
    const sourceAnchor =
      previous?.source_anchor === draftPlan.source_anchor ?
        `${draftPlan.source_anchor} (alternate evidence cut)`
      : draftPlan.source_anchor;

    const imagePromptDetailed = buildDetailedImagePrompt(
      input,
      { ...draftPlan, source_anchor: sourceAnchor },
      draft.meta.channel,
    );
    const negativePrompt = LYRA_WARM_INTELLIGENCE.avoid_list.join(", ");
    const visualStyleNotes = `Use real execution motifs tied to ${sourceAnchor}; avoid generic AI startup stock imagery.`;

    if (draft.type === "linkedin_post") {
      const headlineByAngle = `${draftPlan.content_angle.split("->")[0].trim()}: ${input.companyName} proof`;
      const body = [
        `Most founder teams are not blocked by ideas. They are blocked by execution friction and weak proof chains.`,
        `Lyra anchor: ${sourceAnchor}.`,
        `Angle: ${draftPlan.content_angle}.`,
        `Objection addressed: ${draftPlan.buyer_objection}.`,
        `This is why Lyra is not a generic agency story. It is a builder-native execution system with concrete project outcomes.`,
        `${draftPlan.cta_text}.`,
      ].join("\n\n");
      return {
        ...draft,
        headline: headlineByAngle,
        body,
        meta: {
          ...draft.meta,
          content_angle: draftPlan.content_angle,
          source_anchor: sourceAnchor,
          buyer_objection: draftPlan.buyer_objection,
          channel_strategy: draftPlan.channel_strategy,
          cta_style: draftPlan.cta_style,
          cta_text: draftPlan.cta_text,
          image_prompt_detailed: imagePromptDetailed,
          negative_prompt: negativePrompt,
          visual_source_anchor: sourceAnchor,
          visual_style_notes: visualStyleNotes,
        },
      };
    }

    if (draft.type === "email") {
      const emailStage =
        draft.meta.day <= 2 ? "email 1: insight/problem"
        : draft.meta.day <= 4 ? "email 2: proof/case evidence"
        : "email 3: conversion/strategy call";
      const subject =
        emailStage === "email 1: insight/problem" ? "where founder teams lose execution speed"
        : emailStage === "email 2: proof/case evidence" ? "proof from real lyra delivery work"
        : "quick strategy call on your execution bottlenecks";
      const body = [
        `This is ${emailStage}.`,
        `Problem/angle: ${draftPlan.content_angle}.`,
        `Proof anchor: ${sourceAnchor}.`,
        `Buyer objection we're resolving: ${draftPlan.buyer_objection}.`,
        `Why this matters: Lyra's culture-to-execution model translates into faster shipping and clearer accountability.`,
        `CTA: ${draftPlan.cta_text}.`,
      ].join("\n\n");
      return {
        ...draft,
        subject_line: subject,
        preview_text: draftPlan.content_angle,
        body_markdown: body,
        call_to_action: draftPlan.cta_text,
        meta: {
          ...draft.meta,
          content_angle: draftPlan.content_angle,
          source_anchor: sourceAnchor,
          buyer_objection: draftPlan.buyer_objection,
          channel_strategy: `${draftPlan.channel_strategy} (${emailStage})`,
          cta_style: draftPlan.cta_style,
          cta_text: draftPlan.cta_text,
          image_prompt_detailed: imagePromptDetailed,
          negative_prompt: negativePrompt,
          visual_source_anchor: sourceAnchor,
          visual_style_notes: visualStyleNotes,
        },
      };
    }

    const slideNarrative =
      draftPlan.story_frame_sequence ??
      ["Hook", "Proof", "Execution signal", "CTA"];
    const slideCopy = buildCarouselSlideCopy(input, draftPlan, sourceAnchor);
    const slides = draft.slides.map((slide, slideIdx) => {
      const label = slideNarrative[slideIdx] ?? `Frame ${slideIdx + 1}`;
      const detailed = `${imagePromptDetailed} Frame: ${label}.`;
      const copy = slideCopy[slideIdx] ?? {
        headline: `Frame ${slideIdx + 1}`,
        body: `${draftPlan.content_angle}. ${draftPlan.cta_text}.`,
      };
      return {
        ...slide,
        headline: copy.headline,
        supporting_copy: copy.body,
        visual_direction: `${slide.visual_direction} | ${label}`,
        visual_prompt: detailed,
        design_artifact:
          slide.design_artifact ?
            {
              ...slide.design_artifact,
              headline: copy.headline,
              body: copy.body,
              visual_prompt: detailed,
            }
          : slide.design_artifact,
      };
    });
    return {
      ...draft,
      caption: `${draftPlan.hook ?? "Builder-native execution"}\n\n${draftPlan.content_angle}\nSource: ${sourceAnchor}\nCTA: ${draftPlan.cta_text}`,
      slides,
      card_config: {
        ...draft.card_config,
        headline: slides[0]?.headline ?? draft.card_config.headline,
        subheadline: slides[1]?.supporting_copy ?? draft.card_config.subheadline,
      },
      meta: {
        ...draft.meta,
        content_angle: draftPlan.content_angle,
        source_anchor: sourceAnchor,
        buyer_objection: draftPlan.buyer_objection,
        channel_strategy: draftPlan.channel_strategy,
        cta_style: draftPlan.cta_style,
        cta_text: draftPlan.cta_text,
        hook: draftPlan.hook,
        visual_concept: draftPlan.visual_concept,
        story_frame_sequence: slideNarrative,
        image_prompt_detailed: imagePromptDetailed,
        negative_prompt: negativePrompt,
        visual_source_anchor: sourceAnchor,
        visual_style_notes: visualStyleNotes,
      },
    };
  });

  if (lyraMode) {
    logs.push(
      "[Scott]: Applied Lyra content diversity map across all drafts (angle, proof anchor, objection, channel strategy, CTA style).",
    );
    governance.push(
      createGovernanceEntry({
        agent_id: "marketing_manager",
        step_id: "campaign_draft_generated",
        decision: "Selected non-repeating Lyra content angles and source anchors across the 7-day sequence.",
        rationale:
          "Prevented repetitive cross-channel messaging by rotating talent density, client proof, frontier proximity, community gravity, multi-city scale, and founder trust frames.",
        resulting_asset: "campaign_execution_drafts",
      }),
    );
    governance.push(
      createGovernanceEntry({
        agent_id: "visual_agent",
        step_id: "visual_assets_generated",
        decision: "Used detailed Lyra motif prompts instead of generic AI startup imagery.",
        rationale:
          "Visual prompts are anchored to dossier proof points (Fellowship, Lyrathon, Anthropic, Melbourne, client delivery) and include explicit avoid-lists.",
        resulting_asset: "image_prompt_detailed",
      }),
    );
  }

  return { drafts: enhanced, governance };
}

export function buildStrategyDocuments(workflow: WorkflowState): StrategyDocument[] {
  const company = workflow.website_intelligence?.company_name ?? "Unknown Company";
  const intelligence = workflow.website_intelligence;
  const mission =
    workflow.product_marketing_context?.mission_statement ??
    intelligence?.key_value_propositions[0] ??
    "Deliver measurable value through a tightly scoped offering.";
  const category = intelligence?.industry ?? "B2B technology";
  const audience = intelligence?.audience_summary ?? "Operators and decision-makers with measurable KPIs.";
  const brand = workflow.brand_kit;
  const visual = workflow.visual_identity;
  const validation = workflow.intelligence_validation;
  const goal = workflow.business_goal ?? "Strengthen pipeline quality with conversion-focused campaign execution.";
  const metric = workflow.success_metric ?? "Qualified response rate across owned channels";
  const selectedSkills = workflow.selected_skills ?? [];
  const learningNotes = workflow.brand_learning_notes ?? [];
  const governance = workflow.governance_log ?? [];
  const drafts = workflow.campaign_execution_drafts.slice().sort((a, b) => a.meta.day - b.meta.day);
  const pains = workflow.product_marketing_context?.pains_solved ?? intelligence?.differentiators ?? [];
  const pillarsRaw = workflow.product_marketing_context?.messaging_pillars ?? intelligence?.key_value_propositions ?? [];
  const cta = workflow.product_marketing_context?.primary_cta ?? "Book a strategy call";
  const toneList = brand?.tone_of_voice ?? validation?.brand_voice_descriptors ?? ["Precise", "Operator-led", "Credible"];
  const voiceDescriptors = validation?.brand_voice_descriptors ?? toneList.slice(0, 5);
  const strategicTension = inferStrategicTension(category, pains, learningNotes);
  const conversionOpportunity = inferConversionOpportunity(metric, drafts, selectedSkills);
  const personas = workflow.product_marketing_context?.target_personas ?? [audience];
  const paletteRationale =
    validation?.visual_palette_rationale ??
    validation?.brand_palette?.rationale ??
    visual?.color_usage ??
    "Palette should separate authority surfaces from action surfaces so high-intent buyers can recognize priority moments instantly.";

  const primaryAudience = personas[0] ?? audience;
  const secondaryAudience = personas[1] ?? "Adjacent budget owner involved in final approval";
  const urgencyTrigger =
    pains[0] ??
    intelligence?.differentiators[0] ??
    "Workflow friction is suppressing conversion velocity and visibility.";
  const trustBuilder =
    intelligence?.social_proof[0] ??
    "Specific, measurable proof and implementation clarity at each buyer touchpoint.";
  const objection =
    intelligence?.differentiators[1] ??
    "Skepticism that a new workflow can integrate fast enough to justify immediate switching cost.";

  const messagingPillars = buildMessagingPillars(pillarsRaw, mission, cta, primaryAudience, company);
  const architectureRows = buildCampaignArchitectureRows(drafts, cta, company, primaryAudience, goal, metric);
  const draftStrategyRows = drafts
    .map((draft) => {
      const headline =
        draft.type === "carousel" ?
          draft.slides[0]?.design_artifact?.headline ?? draft.slides[0]?.headline ?? "Carousel narrative"
        : draft.type === "linkedin_post" ?
          draft.headline
        : draft.subject_line;
      return `| Day ${draft.meta.day} | ${draft.meta.channel} | ${escapeMdCell(headline)} | ${escapeMdCell(draft.meta.strategic_intent ?? "Intent not available.")} |`;
    })
    .join("\n");
  const governanceImpacts =
    governance.length > 0 ?
      governance
        .slice(0, 5)
        .map((entry) => `- **${entry.display_agent_name ?? entry.agent_id}:** ${entry.decision}`)
        .join("\n")
    : "- No governance decisions logged yet. Use current strategy assumptions as baseline.";
  const selectedSkillNarrative =
    selectedSkills.length > 0 ?
      selectedSkills
        .map((skill) => `- \`${skill}\`: ${describeSkillChoice(skill, goal, metric)}`)
        .join("\n")
    : "- No explicit skills selected; defaulting to balanced conversion sequence.";
  const deploymentChecklistRows = drafts
    .map((draft) => {
      const owner =
        draft.meta.channel === "email" ? "Scott · content skill"
        : draft.meta.channel === "linkedin" ? "Scott · content skill"
        : "Scott · visual skill";
      const asset =
        draft.type === "carousel" ? "Carousel + caption"
        : draft.type === "linkedin_post" ? "LinkedIn founder post"
        : "Email sequence draft";
      const proof =
        draft.meta.status === "approved" || draft.meta.status === "scheduled" || draft.meta.status === "published" ?
          "Approved in workflow state"
        : "Pending founder approval";
      return `| Day ${draft.meta.day} | ${owner} | ${asset} | ${draft.meta.channel} | ${proof} |`;
    })
    .join("\n");

  const brandStrategy = [
    `# Brand Strategy Summary: ${company}`,
    "",
    "## Executive Read",
    "",
    `${company} is operating inside the ${category} category where buyers reward specificity, implementation confidence, and evidence of outcome reliability. The current signal set shows a brand with real product strength, but its category language must do more than describe capability; it needs to map directly to buyer risk reduction and measurable operational lift. Orbit's recommendation is to frame every message as a decision aid for an operator who is balancing delivery pressure, stakeholder scrutiny, and execution speed.`,
    "",
    `In this market, the difference between momentum and stall is not visibility alone; it is message precision under buying pressure. The campaign should therefore translate mission-level language into decision-ready claims that show what improves, how quickly it improves, and what remains under customer control. This is especially important for the primary audience (${primaryAudience}), who likely reads content while evaluating whether a new approach can be operationalized without introducing fragility.`,
    "",
    `The strategic position for this sprint is clear: hold a high-authority narrative while making conversion pathways concrete. That means campaign language should retain an executive posture but always resolve to a tangible next step tied to ${metric}. The resulting position is a premium but practical brand voice: confident, technically grounded, and explicit about operator outcomes rather than abstract promise statements.`,
    "",
    "## Brand DNA",
    "",
    "| Element | Definition |",
    "| --- | --- |",
    `| Mission | ${escapeMdCell(mission)} |`,
    `| Primary audience | ${escapeMdCell(primaryAudience)} |`,
    `| Category | ${escapeMdCell(category)} |`,
    `| Core promise | ${escapeMdCell(intelligence?.key_value_propositions[0] ?? "Translate product capability into reliable buyer outcomes.")} |`,
    `| Tone | ${escapeMdCell(toneList.join(", "))} |`,
    `| Strategic tension | ${escapeMdCell(strategicTension)} |`,
    `| Conversion opportunity | ${escapeMdCell(conversionOpportunity)} |`,
    "",
    "## Messaging Pillars",
    "",
    ...messagingPillars.map((pillar) =>
      [
        `### ${pillar.name}`,
        `- **What it means:** ${pillar.meaning}`,
        `- **Why it matters to the buyer:** ${pillar.buyerRelevance}`,
        `- **Example message:** ${pillar.example}`,
        "",
      ].join("\n"),
    ),
    "## Audience Psychology",
    "",
    `- **Buyer pain:** ${pains[0] ?? "Execution drag from fragmented processes and unclear ownership paths."}`,
    `- **Urgency trigger:** ${urgencyTrigger}`,
    `- **Likely objections:** ${objection}`,
    `- **What builds trust:** ${trustBuilder}`,
    `- **What makes them click / book / demo:** A clear path from message to action, backed by concrete operator outcomes and low-friction implementation confidence.`,
    "",
    "## Visual Identity",
    "",
    "| Color role | HEX |",
    "| --- | --- |",
    `| Primary | ${brand?.primary_hex ?? validation?.brand_palette?.primary ?? "N/A"} |`,
    `| Secondary | ${brand?.secondary_hex ?? validation?.brand_palette?.secondary ?? "N/A"} |`,
    `| Accent | ${brand?.accent_hex ?? validation?.brand_palette?.accent ?? "N/A"} |`,
    `| Neutral | ${brand?.neutral_hex ?? "#F5F7FA"} |`,
    "",
    `- **Palette rationale:** ${paletteRationale}`,
    `- **Brand voice descriptors:** ${(voiceDescriptors ?? []).join(", ") || "Precise, grounded, clear"}`,
    `- **Visual mood:** ${visual?.visual_tone ?? "High-contrast, systems-oriented, editorial minimalism"}`,
    `- **What to avoid:** Decorative ambiguity, generic AI iconography, and any visual treatment that weakens operator credibility or CTA clarity.`,
    "",
    "## Market Positioning Interpretation",
    "",
    `${company} is most likely being evaluated against two flawed alternatives: generic automation tooling that lacks orchestration depth, and heavyweight enterprise platforms that create implementation drag before value appears. Orbit should frame positioning against both without naming competitors directly: first, by proving that multi-agent execution can be governed with precision; second, by showing that adoption speed does not require strategic compromise. This interpretation should anchor outbound copy in concrete operator language, where each message resolves into measurable workflow outcomes rather than conceptual platform narratives.`,
    "",
    `The campaign should also exploit timing asymmetry. Many AI operations buyers are currently re-assessing tool sprawl, so a coherent "autonomous workforce" narrative can outperform fragmented point-solution messaging if it is backed by a clear rollout path. Positioning therefore needs a dual thread: strategic confidence for executives and implementation realism for operators. That dual-thread approach turns category curiosity into conversion momentum by reducing perceived decision risk at every stage.`,
    "",
    "## Orbit Recommendation",
    "",
    `Position ${company} as the operationally credible choice for teams that value measurable execution over category hype. Keep every narrative beat anchored to operator outcomes, then route that authority directly into conversion actions tied to ${metric} and the primary goal of ${goal}.`,
  ].join("\n");

  const campaignBrief = [
    `# Campaign Brief: ${company}`,
    "",
    "## Campaign Objective",
    "",
    `- **Business goal:** ${goal}`,
    `- **Success metric:** ${metric}`,
    "",
    "## Strategic Thesis",
    "",
    `${company} should win this cycle by showing that category expertise can translate into immediate operational leverage. The campaign thesis is to combine technical authority with a concrete conversion path: prove buyer-relevant outcomes in high-credibility channels, then reduce friction to the ${cta} action with explicit context for implementation and decision confidence.`,
    "",
    "## Target Audience",
    "",
    `- **Primary buyer:** ${primaryAudience}`,
    `- **Secondary buyer:** ${secondaryAudience}`,
    `- **Buying context:** Evaluating options while balancing delivery commitments, internal alignment, and risk controls.`,
    `- **Trigger moments:** ${urgencyTrigger}`,
    "",
    "## Channel Strategy",
    "",
    selectedSkillNarrative,
    "",
    "## 7-Day Campaign Architecture",
    "",
    "| Day | Channel | Campaign role | Core message | CTA | Success signal |",
    "| --- | --- | --- | --- | --- | --- |",
    architectureRows,
    "",
    "## Founder / Brand Learning Notes",
    "",
    ...(learningNotes.length > 0 ?
      learningNotes.map((note) => `- ${note}`)
    : ["- No founder overrides provided."]),
    "",
    "### How notes changed the campaign",
    "",
    ...(learningNotes.length > 0 ?
      learningNotes.map((note) => `- Orbit translated this note into message constraints and review criteria: ${note}`)
    : ["- Baseline inference remains active until founder guidance is supplied."]),
    "",
    "### Governance-linked adjustments",
    "",
    governanceImpacts,
    "",
    "## Draft Strategy",
    "",
    "| Day | Channel | Draft headline / subject | Strategic intent |",
    "| --- | --- | --- | --- |",
    draftStrategyRows || "| — | — | — | Drafts pending generation |",
    "",
    "## Deployment Checklist",
    "",
    "| Day | Owner | Asset | Channel | Proof state |",
    "| --- | --- | --- | --- | --- |",
    deploymentChecklistRows || "| — | — | — | — | Awaiting draft generation |",
  ].join("\n");

  const creativeBrief = [
    `# Creative Brief: ${company}`,
    "",
    "## Creative Direction",
    "",
    `${company} should present as technically advanced but operationally practical. The visual system needs to communicate control, speed, and implementation confidence at first glance. Use high-contrast hierarchy, restrained motion cues, and decisive CTA treatment so creative work reads like an execution engine rather than a generic innovation brand.`,
    "",
    "## Design Principles",
    "",
    "- Prioritize outcome clarity over decorative novelty in every hero frame.",
    "- Use contrast to separate authority statements from CTA moments.",
    "- Keep typography disciplined: headline for decision framing, body for implementation proof.",
    "- Design every asset as part of a sequence, not a standalone poster.",
    "- Ensure visual cadence supports scanning behavior on mobile and LinkedIn feed contexts.",
    "- Maintain a consistent anchor motif so multi-day assets feel like one operating system.",
    "- Prevent ambiguous symbolism that could dilute technical credibility.",
    "",
    "## Palette System",
    "",
    "| Color | HEX | Role | Usage guidance |",
    "| --- | --- | --- | --- |",
    `| Primary | ${brand?.primary_hex ?? validation?.brand_palette?.primary ?? "N/A"} | Authority surfaces | Dominant background or hero blocks where claims need trust weight. |`,
    `| Secondary | ${brand?.secondary_hex ?? validation?.brand_palette?.secondary ?? "N/A"} | Structure and rhythm | Secondary panels, separators, and sequencing beats in carousels. |`,
    `| Accent | ${brand?.accent_hex ?? validation?.brand_palette?.accent ?? "N/A"} | Conversion signal | CTA buttons, directional cues, and urgency highlights only. |`,
    `| Neutral | ${brand?.neutral_hex ?? "#F5F7FA"} | Breathing room | Negative space and readability scaffolding for dense information. |`,
    "",
    "## Visual Motifs",
    "",
    ...buildVisualMotifs(visual, mission).map((motif, idx) =>
      [
        `### Motif ${idx + 1}: ${motif.name}`,
        `- **Description:** ${motif.description}`,
        `- **Why it fits the brand:** ${motif.fit}`,
        `- **Where to use it:** ${motif.where}`,
        `- **What to avoid:** ${motif.avoid}`,
        "",
      ].join("\n"),
    ),
    "## Artifact Guidance",
    "",
    ...buildArtifactGuidance(selectedSkills, drafts, cta).map((block) =>
      [
        `### ${block.skill}`,
        `- **Format:** ${block.format}`,
        `- **Layout direction:** ${block.layout}`,
        `- **Content hierarchy:** ${block.hierarchy}`,
        `- **CTA treatment:** ${block.ctaTreatment}`,
        `- **Visual risk to avoid:** ${block.risk}`,
        "",
      ].join("\n"),
    ),
    "## Image / Background Prompt Rules",
    "",
    "- Anchor prompts in operational outcomes, not abstract futurism.",
    "- Require abstract, text-free backgrounds for generated motif assets.",
    "- Mention palette intent explicitly (primary for authority, accent for CTA).",
    "- Reference visual tone and design patterns from validated brand signals before generation.",
    "- Reject prompts that imply generic AI iconography, stock-human scenes, or novelty-for-novelty gradients.",
    "",
    "## Do Not Do",
    "",
    "- Do not use vague “future of AI” language without an operator outcome attached.",
    "- Do not overload slides with parallel CTAs that compete for attention.",
    "- Do not introduce unrelated illustration styles that break visual continuity.",
    "- Do not flatten hierarchy by giving proof points and headlines equal visual weight.",
    "- Do not publish artifacts where accent color dominates non-conversion surfaces.",
  ].join("\n");

  return [
    { filename: "Brand_Strategy_Summary.md", content: brandStrategy },
    { filename: "Campaign_Brief.md", content: campaignBrief },
    { filename: "Creative_Brief.md", content: creativeBrief },
  ];
}

function inferStrategicTension(category: string, pains: string[], notes: string[]): string {
  const pain = pains[0] ?? "buyers need implementation certainty before committing.";
  const note = notes[0] ?? "the brand must sound authoritative without drifting into hype.";
  return `${category} buyers demand measurable execution while marketing narratives often stay abstract; this campaign must resolve that gap by proving concrete outcomes around "${pain}" and honoring guidance that "${note}".`;
}

function inferConversionOpportunity(
  metric: string,
  drafts: CampaignExecutionDraft[],
  selectedSkills: string[],
): string {
  const channels = Array.from(new Set(drafts.map((d) => d.meta.channel))).join(", ") || "multi-channel sequence";
  const skills = selectedSkills.slice(0, 3).join(", ") || "conversion-aligned specialist routing";
  return `Concentrate high-authority proof across ${channels}, then compress decision friction with ${skills} to improve ${metric}.`;
}

interface PillarBlock {
  name: string;
  meaning: string;
  buyerRelevance: string;
  example: string;
}

function buildMessagingPillars(
  pillarsRaw: string[],
  mission: string,
  cta: string,
  audience: string,
  company: string,
): PillarBlock[] {
  const base = pillarsRaw.length > 0 ? pillarsRaw : [mission];
  const seeded = base.slice(0, 4).map((pillar, idx) => ({
    name: humanizePillarName(pillar, idx, company),
    meaning: `${pillar}. Translate this into a before/after operating shift that a buyer can picture inside a real workflow review.`,
    buyerRelevance: `For ${audience}, this matters because the buying decision is less about abstract AI promise and more about whether the workflow can deliver operator leverage without adding governance risk.`,
    example: buildPillarExample(pillar, cta, company),
  }));
  while (seeded.length < 3) {
    seeded.push({
      name: "Operator Confidence That Converts",
      meaning: "Position the product as a dependable operating layer rather than an experimental add-on.",
      buyerRelevance: "Buyers act faster when implementation risk is clearly bounded.",
      example: `Lead with operational control, then move to ${cta}.`,
    });
  }
  return seeded;
}

function buildCampaignArchitectureRows(
  drafts: CampaignExecutionDraft[],
  cta: string,
  company: string,
  audience: string,
  goal: string,
  metric: string,
): string {
  return drafts
    .map((draft) => {
      const role =
        draft.meta.day <= 2 ? "Problem framing + authority"
        : draft.meta.day <= 4 ? "Proof sequencing + objection handling"
        : draft.meta.day <= 6 ? "Conversion acceleration"
        : "Closing narrative + CTA reinforcement";
      const coreMessage = buildCoreCampaignMessage(draft, company, audience, goal, metric);
      const signal =
        draft.meta.channel === "email" ? "Reply quality and CTA click depth"
        : draft.meta.channel === "linkedin" ? "Carousel/post click-through + profile intent"
        : "Caption CTA clicks + save/share quality";
      return `| Day ${draft.meta.day} | ${draft.meta.channel} | ${role} | ${escapeMdCell(coreMessage)} | ${cta} | ${signal} |`;
    })
    .join("\n");
}

function buildCoreCampaignMessage(
  draft: CampaignExecutionDraft,
  company: string,
  audience: string,
  goal: string,
  metric: string,
): string {
  const audienceShort = audience.toLowerCase();
  const goalShort = goal.replace(/^Increase /i, "increase ");
  const metricShort = metric.replace(/^Click-through rate on /i, "");

  if (draft.meta.channel === "instagram") {
    return `${company}'s autonomous AI workforce story translated into concrete workflow wins for ${audienceShort}, turning operator curiosity into ${goalShort} through a stronger ${metricShort}.`;
  }
  if (draft.meta.channel === "linkedin") {
    return `Operator-first POV for GTM, sales ops, and AI operations teams: show how autonomous agents create operational leverage and why concrete workflows outperform vague AI hype before asking for the demo click.`;
  }
  return `Direct-response follow-up that reframes autonomous AI workforce claims as specific workflow outcomes, reducing skepticism and moving high-intent buyers toward demo booking.`;
}

function humanizePillarName(pillar: string, idx: number, company: string): string {
  const lower = pillar.toLowerCase();
  if (lower.includes("agent")) return "From AI Experiments to Operational Workforce";
  if (lower.includes("deploy")) return "Speed Without Workflow Fragility";
  if (lower.includes("orches")) return "Orchestration That Operations Teams Can Trust";
  if (lower.includes("workflow")) return "Concrete Workflow Outcomes Over AI Hype";
  const names = [
    `${company} as the Operator's Control Layer`,
    "Operational Leverage, Not Prompt Theatre",
    "Execution Clarity That Earns the Demo Click",
    "Technical Authority With a Conversion Path",
  ];
  return names[idx] ?? "Operational Leverage With Buyer Specificity";
}

function buildPillarExample(pillar: string, cta: string, company: string): string {
  const lower = pillar.toLowerCase();
  if (lower.includes("agent")) {
    return `${company} helps ops teams move from isolated AI experiments to an autonomous workforce that can own repeatable revenue workflows. ${cta}.`;
  }
  if (lower.includes("deploy")) {
    return `Deploy AI agents into live GTM and sales ops workflows without waiting through a heavyweight replatforming cycle. ${cta}.`;
  }
  if (lower.includes("orches")) {
    return `Coordinate multiple agents across real workflows with the control and visibility serious operators expect. ${cta}.`;
  }
  return `Replace vague AI promise language with a workflow-specific claim, then ask the buyer to ${cta}.`;
}

interface VisualMotifBlock {
  name: string;
  description: string;
  fit: string;
  where: string;
  avoid: string;
}

function buildVisualMotifs(visual: VisualIdentity | undefined, mission: string): VisualMotifBlock[] {
  const tone = visual?.visual_tone ?? "Minimalist operator-grade";
  const patterns = visual?.design_patterns ?? ["Whitespace-led layout", "Hierarchy-driven blocks"];
  return [
    {
      name: "Signal Lanes",
      description: "Linear bands and directional overlays that suggest workflow progression.",
      fit: `Matches ${tone} posture and reinforces execution momentum.`,
      where: "Carousel openers, transition slides, and demo CTA panels.",
      avoid: "Overly decorative paths that distract from headline hierarchy.",
    },
    {
      name: "Control Grid",
      description: `Structured modular grid informed by patterns such as ${patterns.join(", ")}.`,
      fit: "Communicates technical rigor and controlled complexity.",
      where: "LinkedIn carousel value slides and dashboard-like stat frames.",
      avoid: "Crowded matrices with no visual anchor for the CTA.",
    },
    {
      name: "Mission Spotlight",
      description: `High-contrast focus zone that reinforces mission anchor: ${mission}.`,
      fit: "Keeps narrative coherence across channels and days.",
      where: "Day 1 hooks, Day 5 conversion push, final reinforcement assets.",
      avoid: "Generic hero compositions that could belong to any AI vendor.",
    },
  ];
}

interface ArtifactGuidanceBlock {
  skill: string;
  format: string;
  layout: string;
  hierarchy: string;
  ctaTreatment: string;
  risk: string;
}

function buildArtifactGuidance(
  selectedSkills: string[],
  drafts: CampaignExecutionDraft[],
  cta: string,
): ArtifactGuidanceBlock[] {
  const skills = selectedSkills.length > 0 ? selectedSkills : ["multi_channel_social_bundle"];
  return skills.slice(0, 6).map((skill) => {
    const draft = drafts.find((d) => d.meta.strategic_intent?.includes(skill)) ?? drafts[0];
    const channel = draft?.meta.channel ?? "multi-channel";
    return {
      skill: skill.replace(/_/g, " "),
      format:
        skill.includes("carousel") ? "Multi-frame sequential narrative"
        : skill.includes("story") ? "9:16 vertical story progression"
        : skill.includes("email") ? "Concise conversion email"
        : skill.includes("pitch") ? "Slide-led executive narrative"
        : "Cross-channel conversion artifact",
      layout:
        channel === "instagram" ? "Hook-first visual hierarchy with rapid scan blocks"
        : channel === "linkedin" ? "Authority headline followed by proof stacks"
        : "Problem → implication → action flow with one primary move",
      hierarchy: "Headline claim, supporting proof, objection release, then conversion move.",
      ctaTreatment: `Keep a single CTA expression (${cta}) with accent-color emphasis and no competing secondary action.`,
      risk: "Do not let visual novelty outrun buyer clarity; if a frame does not advance decision confidence, remove it.",
    };
  });
}

function escapeMdCell(value: string): string {
  return value.replace(/\|/g, "\\|").replace(/\n/g, " ");
}

function describeSkillChoice(skill: string, goal: string, metric: string): string {
  if (skill.includes("linkedin_carousel")) {
    return `Chosen to sequence authority + proof in the channel most aligned with ${metric}.`;
  }
  if (skill.includes("instagram_story")) {
    return `Used to create fast narrative compression and high-contrast CTA moments tied to ${goal}.`;
  }
  if (skill.includes("email_conversion")) {
    return "Adds direct-response follow-through so high-intent clicks can be converted into booked conversations.";
  }
  if (skill.includes("linkedin_founder")) {
    return "Builds founder/operator credibility and reduces perceived implementation risk.";
  }
  if (skill.includes("pitch_deck")) {
    return "Supports executive alignment with structured narrative scaffolding.";
  }
  return `Supports campaign conversion architecture against ${metric}.`;
}

export function regenerateSpecificDraft(
  draft: CampaignExecutionDraft,
  input: ManagerInput,
  reviewerNote: string,
): CampaignExecutionDraft {
  const reinforcedPrompt = `${draft.meta.original_prompt}\nFounder feedback: ${reviewerNote}\nRewrite only this draft while preserving SOP and palette.`;

  if (draft.type === "carousel") {
    const regenerated =
      draft.meta.carousel_expert_mode ?
        createInstagramCarouselExpertDraft({
          companyName: input.companyName,
          brandKit: input.brandKit,
          context: input.context,
          day: draft.meta.day,
          originalPrompt: reinforcedPrompt,
          visualIdentity: input.visualIdentity,
        })
      : createInstagramCarouselDraft({
          companyName: input.companyName,
          brandKit: input.brandKit,
          context: input.context,
          day: draft.meta.day,
          originalPrompt: reinforcedPrompt,
          visualIdentity: input.visualIdentity,
        });
    return {
      ...regenerated,
      meta: {
        ...regenerated.meta,
        id: draft.meta.id,
        strategic_intent: draft.meta.strategic_intent ?? regenerated.meta.strategic_intent,
        reviewer_note: reviewerNote,
        status: "pending_review",
        is_published: false,
        scheduled_at: undefined,
        publish_platform: undefined,
        deployment_post_id: undefined,
      },
    };
  }
  if (draft.meta.channel === "linkedin") {
    const regenerated = createLinkedInPosterDraft({
      companyName: input.companyName,
      brandKit: input.brandKit,
      context: input.context,
      day: draft.meta.day,
      originalPrompt: reinforcedPrompt,
      visualIdentity: input.visualIdentity,
    });
    return {
      ...regenerated,
      meta: {
        ...regenerated.meta,
        id: draft.meta.id,
        strategic_intent: draft.meta.strategic_intent ?? regenerated.meta.strategic_intent,
        reviewer_note: reviewerNote,
        status: "pending_review",
        is_published: false,
        scheduled_at: undefined,
        publish_platform: undefined,
        deployment_post_id: undefined,
      },
    };
  }
  const regenerated = createEmailDraft({
    companyName: input.companyName,
    brandKit: input.brandKit,
    context: input.context,
    day: draft.meta.day,
    originalPrompt: reinforcedPrompt,
    visualIdentity: input.visualIdentity,
  });
  return {
    ...regenerated,
    meta: {
      ...regenerated.meta,
      id: draft.meta.id,
      strategic_intent: draft.meta.strategic_intent ?? regenerated.meta.strategic_intent,
      reviewer_note: reviewerNote,
      status: "pending_review",
      is_published: false,
      scheduled_at: undefined,
      publish_platform: undefined,
      deployment_post_id: undefined,
    },
  };
}

function summarizeSop(sop: string): string {
  return sop.split("\n").slice(-1)[0] ?? "SOP loaded";
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function reviewAndRegenerateDraft(
  draft: CampaignExecutionDraft,
  input: ManagerInput,
  logs: string[],
): CampaignExecutionDraft {
  const serialized = JSON.stringify(draft);
  const emojiCount = countEmojis(serialized);
  const hasAiSpeak = hasForbiddenPhrase(serialized);
  if (emojiCount <= 2 && !hasAiSpeak) {
    return draft;
  }

  logs.push(
    `[Scott · QA skill]: Violation detected (emojis=${emojiCount}, ai_speak=${hasAiSpeak}). Regenerating with mission anchor.`,
  );

  if (draft.type === "carousel") {
    return regenerateCarouselFromMission(draft, input.context.mission_statement);
  }
  if (draft.type === "linkedin_post") {
    return regenerateLinkedInFromMission(draft, input.context.mission_statement);
  }
  return regenerateEmailFromMission(draft, input.context.mission_statement);
}

function qaSelfCorrectDraft(
  draft: CampaignExecutionDraft,
  input: ManagerInput,
  logs: string[],
): CampaignExecutionDraft {
  if (!hasForbiddenPhrase(JSON.stringify(draft))) {
    return draft;
  }
  logs.push(
    `[Scott · QA skill]: Forbidden trope detected in Day ${draft.meta.day}. Running self-correction pass.`,
  );

  return regenerateSpecificDraft(
    draft,
    input,
    `Self-correction required. Ground on mission: ${input.context.mission_statement}. Keep tone founder-written and human.`,
  );
}

function regenerateCarouselFromMission(
  draft: CampaignCarouselDraft,
  mission: string,
): CampaignCarouselDraft {
  const leadBody = `We build around one mission: ${mission}`;
  return {
    ...draft,
    slides: draft.slides.map((slide, index) => {
      if (index !== 0) {
        return slide;
      }
      const artifact = slide.design_artifact;
      return {
        ...slide,
        supporting_copy: leadBody,
        design_artifact:
          artifact ?
            {
              ...artifact,
              body: leadBody,
            }
          : artifact,
      };
    }),
    caption: `Mission anchored: ${mission}`,
  };
}

function regenerateLinkedInFromMission(
  draft: CampaignLinkedInPostDraft,
  mission: string,
): CampaignLinkedInPostDraft {
  const paragraphs = [
    `We took a hard problem head on. We solved it in the product.`,
    `We kept one anchor the whole time: ${mission}`,
    "We will keep shipping this way.",
  ];

  return {
    ...draft,
    body: paragraphs.join("\n\n"),
  };
}

function regenerateEmailFromMission(
  draft: CampaignEmailDraft,
  mission: string,
): CampaignEmailDraft {
  return {
    ...draft,
    subject_line: draft.subject_line.toLowerCase(),
    body_markdown: `We are reaching out one-to-one.\n\nMission anchor: ${mission}\n\nIf useful, we can share concrete next steps.`,
  };
}
