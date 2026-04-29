import type {
  BrandKit,
  CampaignCarouselDraft,
  CampaignCarouselSlide,
  CampaignEmailDraft,
  CampaignLinkedInPostDraft,
  DesignArtifact,
  ProductMarketingContext,
  VisualIdentity,
} from "@/lib/types/orbit";
import {
  buildHumanFilterPrompt,
  getFrictionPoint,
  INSTAGRAM_CAROUSEL_EXPERT_SYSTEM_INSTRUCTION,
} from "@/lib/agents/prompts";

export const CANVA_KILLER_LAYOUT_CONFIG = {
  theme: "canva-killer-dark",
  accent: "neon-red-blue",
  text_effect: "glowing",
} as const;

interface DraftInput {
  companyName: string;
  brandKit: BrandKit;
  context: ProductMarketingContext;
  day: number;
  originalPrompt: string;
  visualIdentity?: VisualIdentity;
}

function neonVisualPrompt(sceneFocus: string): string {
  return (
    `${sceneFocus}` +
    ` Render at 4:5 portrait with cinematic three-point lighting on deep charcoal-to-black gradient plates separated by razor-thin neon splits.` +
    ` Electric blue halo bleeds behind bold glassy headline lockups while saturated crimson accent lines carve CTA zones; keep micro-glitch/nebula sparkle only at contrast edges.` +
    ` GPT-image-1 spec: ultra-sharp glowing display type, dramatic shadow falloff, hyperreal specular highlights—no baked paragraph body text in the raster—preserve premium negative space for UI overlay in production.`
  );
}

function designArtifact(
  headline: string,
  body: string,
  sceneFocus: string,
): DesignArtifact {
  return {
    headline,
    body,
    visual_prompt: neonVisualPrompt(sceneFocus),
    layout_config: CANVA_KILLER_LAYOUT_CONFIG,
  };
}

function slideFromArtifact(
  visual_direction: string,
  artifact: DesignArtifact,
): CampaignCarouselSlide {
  return {
    headline: artifact.headline,
    supporting_copy: artifact.body,
    visual_direction,
    visual_prompt: artifact.visual_prompt,
    design_artifact: artifact,
  };
}

/** Generalist Instagram path (4 slides) — DesignArtifact per slide, Duncan Rogoff DNA. */
export function createInstagramCarouselDraft(input: DraftInput): CampaignCarouselDraft {
  const frictionPoint = getFrictionPoint(input.context);
  const mission = input.context.mission_statement;
  const sopPromptBlend = `${INSTAGRAM_CAROUSEL_EXPERT_SYSTEM_INSTRUCTION}\n\n${buildHumanFilterPrompt({
    friction_point: frictionPoint,
    company_name: input.companyName,
  })}\nOUTPUT CONSTRAINT: Exactly four slides — Hook, Problem, Proof, CTA — each slide populated as structured DesignArtifact fields for downstream rendering.`;

  const artifacts: DesignArtifact[] = [
    designArtifact(
      "Still Fighting Admin?",
      `We built ${input.companyName} around ending ${frictionPoint.toLowerCase()} — because founders shouldn't bleed minutes.`,
      `Hero Hook motif for ${input.companyName}: oversized kinetic headline silhouette emerging from charcoal fog with neon rim pulses.`,
    ),
    designArtifact(
      "Common Mistake Exposed",
      `Teams normalize grinding through ${frictionPoint}. Before: fragmented chaos. After: orchestrated clarity.`,
      `Split-panel Before/After metaphor — cold slate chaos versus disciplined cobalt pathways intersecting red focal rails.`,
    ),
    designArtifact(
      "The Quiet Advantage",
      `${mission.slice(0, 140)}${mission.length > 140 ? "…" : ""}`,
      `Secrets reveal slide — orbiting cyan beams tightening toward central prism motif implying proprietary unlock.`,
    ),
    designArtifact(
      "Claim Your Motion",
      `${input.context.primary_cta.toUpperCase()} — tap in, we ship the playbook.`,
      `Massive glowing CTA slab with simulated glassmorphism button, crimson halo pulse, cobalt frame, click- affordance cues.`,
    ),
  ];

  const visualDirs = ["Hook · Motif", "Problem · Before/After", "Proof · Advantage", "CTA · Conversion"];
  const slides: CampaignCarouselSlide[] = artifacts.map((artifact, index) =>
    slideFromArtifact(visualDirs[index] ?? `Slide ${index + 1}`, artifact),
  );

  return {
    meta: {
      id: crypto.randomUUID(),
      day: input.day,
      status: "pending_review",
      channel: "instagram",
      original_prompt: `${sopPromptBlend}\n${input.originalPrompt}`,
      is_published: false,
      carousel_expert_mode: false,
    },
    type: "carousel",
    platform: "instagram",
    slides,
    caption: `${input.companyName} | We built this carousel to replace Canva churn with a design-first viral engine. ${frictionPoint} → controlled outcomes.`,
    primary_hashtags: ["#FounderCarousel", "#DesignFirst", "#OrbitStudio"],
    card_config: {
      headline: slides[0].headline,
      subheadline: slides[1].supporting_copy,
      logo_placement: "top-left",
      brand_color_overlay: input.brandKit.accent_hex,
    },
  };
}

/** Carousel Maker / expert pass — full 10-slide viral sequence in one design-first payload. */
export function createInstagramCarouselExpertDraft(input: DraftInput): CampaignCarouselDraft {
  const frictionPoint = getFrictionPoint(input.context);
  const mission = input.context.mission_statement;
  const pillarA = input.context.messaging_pillars[0] ?? "Signal over noise";
  const pillarB = input.context.messaging_pillars[1] ?? "Velocity with guardrails";
  const pillarC = input.context.messaging_pillars[2] ?? "Proof in the workflow";
  const proofPoint =
    input.context.launch_goals[1] ??
    input.context.target_personas[0] ??
    "Momentum indicators trending orchestrated throughput versus reactive drift.";
  const keywordToken = input.context.primary_cta.split(/\s+/).find((w) => w.length > 3);
  const keyword =
    (keywordToken ? keywordToken.toUpperCase().replace(/[^A-Z]/g, "") : "") || "STRATEGY";

  const expertPrompt = `${INSTAGRAM_CAROUSEL_EXPERT_SYSTEM_INSTRUCTION}\n\n${buildHumanFilterPrompt({
    friction_point: frictionPoint,
    company_name: input.companyName,
  })}\nMODE: Carousel Maker — emit the complete 10-slide sequence with synchronized DesignArtifact payloads.`;

  const roles = [
    "Hook · motif",
    "Problem · painful truth",
    "Secret · tension pivot",
    "Value · step 1",
    "Value · step 2",
    "Value · step 3",
    "Value · step 4",
    "Proof · outcome chart",
    "Recap · steal format",
    "CTA · comment keyword",
  ];

  const artifacts: DesignArtifact[] = [
    designArtifact(
      "Stop Bleeding Minutes",
      `${input.companyName} interrupts ${frictionPoint} before it silently taxes revenue.`,
      roles[0] ?? "Slide 1",
    ),
    designArtifact(
      "Teams Normalize Chaos",
      `Most operators excuse ${frictionPoint}. Visibility tanks before blame arrives.`,
      roles[1] ?? "Slide 2",
    ),
    designArtifact(
      "Flip The Lever",
      `${pillarA}. Introduce disciplined rhythm instead of heroic slog.`,
      roles[2] ?? "Slide 3",
    ),
    designArtifact(
      "Signal Stack Step 1",
      `${pillarB}. Anchor rituals—measure adoption weekly.`,
      roles[3] ?? "Slide 4",
    ),
    designArtifact(
      "Signal Stack Step 2",
      `${pillarC}. Instrument outcomes—not vibes.`,
      roles[4] ?? "Slide 5",
    ),
    designArtifact(
      "Signal Stack Step 3",
      `${mission.slice(0, 110)}${mission.length > 110 ? "…" : ""}`,
      roles[5] ?? "Slide 6",
    ),
    designArtifact(
      "Compound Velocity",
      `${input.context.launch_goals[0] ?? "Ship predictable traction"} inside governed loops.`,
      roles[6] ?? "Slide 7",
    ),
    designArtifact(
      "Proof Snapshot",
      `${proofPoint ?? "Momentum indicators trending toward orchestrated throughput vs. reactive chaos."}`,
      roles[7] ?? "Slide 8",
    ),
    designArtifact(
      "Steal This Rhythm",
      `One takeaway: discipline beats hustle—packaged as cinematic neon storytelling.`,
      roles[8] ?? "Slide 9",
    ),
    designArtifact(
      `COMMENT ${keyword}`,
      `COMMENT ${keyword} FOR SECRET STRATEGY · Big bold faux-button capture.`,
      roles[9] ?? "Slide 10",
    ),
  ].map((artifact, index) =>
    index === roles.length - 1 ?
      {
        ...artifact,
        headline: `COMMENT ${keyword}`,
        body: `COMMENT ${keyword} FOR SECRET STRATEGY`,
      }
    : artifact,
  );

  const slides: CampaignCarouselSlide[] = artifacts.map((artifact, index) =>
    slideFromArtifact(roles[index] ?? `Slide ${index + 1}`, artifact),
  );

  return {
    meta: {
      id: crypto.randomUUID(),
      day: input.day,
      status: "pending_review",
      channel: "instagram",
      original_prompt: `${expertPrompt}\n${input.originalPrompt}`,
      is_published: false,
      carousel_expert_mode: true,
    },
    type: "carousel",
    platform: "instagram",
    slides,
    caption: `${input.companyName} · Duncan Rogoff Canva-Killer carousel · ${frictionPoint} demolished with neon discipline.`,
    primary_hashtags: ["#CarouselMaker", "#DesignFirst", "#NeonMemo"],
    card_config: {
      headline: slides[0].headline,
      subheadline: slides[1].supporting_copy,
      logo_placement: "top-left",
      brand_color_overlay: input.brandKit.accent_hex,
    },
  };
}

export function createLinkedInPosterDraft(input: DraftInput): CampaignLinkedInPostDraft {
  const frictionPoint = getFrictionPoint(input.context);
  const paragraph1 = `We hit a wall with ${frictionPoint.toLowerCase()}. We fixed it in the product, not in a deck.`;
  const paragraph2 = `We listened to users. We cut the noise. We rebuilt around one mission: ${input.context.mission_statement}.`;
  const visualTone = input.visualIdentity?.visual_tone;
  const paragraph2WithTone = visualTone
    ? `${paragraph2} We kept the delivery ${visualTone.toLowerCase()} and consistent with the brand system.`
    : paragraph2;
  const paragraph3 = `We ship this way because outcomes matter. ${input.context.primary_cta}.`;

  const postBody = [paragraph1, paragraph2WithTone, paragraph3].join("\n\n");

  return {
    meta: {
      id: crypto.randomUUID(),
      day: input.day,
      status: "pending_review",
      channel: "linkedin",
      original_prompt: input.originalPrompt,
      is_published: false,
    },
    type: "linkedin_post",
    headline: "Opinionated insight",
    body: postBody,
    card_config: {
      headline: "Founder note",
      subheadline: input.context.mission_statement,
      logo_placement: "top-right",
      brand_color_overlay: input.brandKit.primary_hex,
    },
  };
}

export function createEmailDraft(input: DraftInput): CampaignEmailDraft {
  const conversionGoal = input.context.primary_cta;
  const frictionPoint = getFrictionPoint(input.context);

  return {
    meta: {
      id: crypto.randomUUID(),
      day: input.day,
      status: "pending_review",
      channel: "email",
      original_prompt: input.originalPrompt,
      is_published: false,
    },
    type: "email",
    subject_line: `quick question re ${input.companyName}`.toLowerCase(),
    preview_text: `One goal: ${conversionGoal}.`,
    body_markdown: [
      `We focused this campaign on one conversion goal: ${conversionGoal}.`,
      "",
      `The friction point we are addressing is: ${frictionPoint}.`,
      "",
      "We wrote this to be direct, human, and specific.",
    ].join("\n"),
    call_to_action: conversionGoal,
    card_config: {
      headline: "Personal outreach",
      subheadline: conversionGoal,
      logo_placement: "top-left",
      brand_color_overlay: input.brandKit.accent_hex,
    },
  };
}

export function buildChannelSopPrompt(
  channel: "instagram" | "linkedin" | "email",
  context: ProductMarketingContext,
  visualIdentity?: VisualIdentity,
  companyName?: string,
): string {
  const base = buildHumanFilterPrompt({
    friction_point: getFrictionPoint(context),
    company_name: companyName,
  });
  const visualDnaInstruction = visualIdentity
    ? `Use Visual DNA: tone=${visualIdentity.visual_tone}; patterns=${visualIdentity.design_patterns.join(", ")}; typography=${visualIdentity.typography_vibes.join(", ")}.`
    : "Use brand-consistent visual DNA inferred from the website.";

  if (channel === "instagram") {
    return `${INSTAGRAM_CAROUSEL_EXPERT_SYSTEM_INSTRUCTION}\n${base}\n${visualDnaInstruction}\nDESIGN-FIRST PIPELINE: Populate design_artifact per slide with headline (≤5 words), body (1–2 lines), visual_prompt (GPT-image-1 neon cinematic spec), layout_config { theme: 'canva-killer-dark', accent: 'neon-red-blue', text_effect: 'glowing' }.`;
  }
  if (channel === "linkedin") {
    return `${base}\n${visualDnaInstruction}\nSOP: First-person founder narrative. Short punchy paragraphs. NO AI tropes (avoid: unlocking, revolutionizing, in today's fast-paced).`;
  }
  return `${base}\n${visualDnaInstruction}\nSOP: One-to-one outreach only. Avoid newsletter language. Subject line must be lower-case and informal.`;
}
