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

/** Default layout tokens for new carousels — editorial / brand-led (not neon sci-fi). */
export const EDITORIAL_CAROUSEL_LAYOUT_CONFIG = {
  theme: "editorial_photo_real",
  accent: "brand_palette_led",
  text_effect: "clean_typography",
} as const;

interface DraftInput {
  companyName: string;
  brandKit: BrandKit;
  context: ProductMarketingContext;
  day: number;
  originalPrompt: string;
  visualIdentity?: VisualIdentity;
}

function brandPaletteAndDna(input: DraftInput): string {
  const { primary_hex, secondary_hex, accent_hex } = input.brandKit;
  const vi = input.visualIdentity;
  const dna =
    vi ?
      `Visual identity — tone: ${vi.visual_tone}; patterns: ${vi.design_patterns.slice(0, 6).join(", ")}; typography: ${vi.typography_vibes.slice(0, 5).join(", ")}.`
    : "Infer tasteful editorial brand cues from company context (avoid template “startup gradient” wallpaper).";
  return `Brand palette HEX — primary ${primary_hex}, secondary ${secondary_hex}, accent ${accent_hex}. ${dna}`;
}

/**
 * GPT-image-2-ready editorial brief: subject through negative prompt; defaults hyper-realistic unless brand asks otherwise.
 */
function buildHyperRealVisualPrompt(input: DraftInput, sceneSubject: string, narrativeBeat: string): string {
  const paletteBlock = brandPaletteAndDna(input);
  const pillars = input.context.messaging_pillars.slice(0, 3).join(" · ") || input.context.mission_statement.slice(0, 120);
  return [
    "Designed for GPT-image-2 or equivalent high-fidelity image generation — hyper-realistic editorial output unless brand style explicitly specifies illustration, cartoon, or abstract.",
    `Slide narrative beat: ${narrativeBeat}.`,
    `SUBJECT: ${sceneSubject}`,
    "SETTING: Real workspace or believable on-location scene matched to brand (material honesty: wood, paper, matte displays, ceramics — no holographic HUD chrome).",
    "COMPOSITION: 4:5 portrait, editorial campaign framing, intentional negative space for headline/body overlay — do not render long paragraph copy inside the photo.",
    "LIGHTING & CAMERA: natural daylight plus soft practicals, documentary clarity, realistic shadows — avoid neon rim lights, glitch overlays, cosmic/nebula fills.",
    `PALETTE & MOOD: ${paletteBlock} Mood: credible, calm urgency — premium operator brand, not sci-fi poster.`,
    `CAMPAIGN CONTEXT (internal brief): ${input.companyName} — ${pillars}`,
    "NEGATIVE PROMPT: generic robots, neon sci-fi UI, holographic glass morphs, glitch/nebula tunnels, electric cyan-magenta defaults, empty lobby stock smiles, vague blobs, watermark text, surreal AI-slop anatomy.",
  ].join("\n");
}

function designArtifact(
  headline: string,
  body: string,
  sceneSubject: string,
  input: DraftInput,
  narrativeBeat: string,
): DesignArtifact {
  return {
    headline,
    body,
    visual_prompt: buildHyperRealVisualPrompt(input, sceneSubject, narrativeBeat),
    layout_config: EDITORIAL_CAROUSEL_LAYOUT_CONFIG,
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
  const artifacts: DesignArtifact[] = [
    designArtifact(
      "Still Fighting Admin?",
      `We built ${input.companyName} around ending ${frictionPoint.toLowerCase()} — because founders shouldn't bleed minutes.`,
      `Founder at a real desk, sharp foreground on messy calendar tabs on laptop — daylight window spill, authentic clutter`,
      input,
      "Hook — pattern interrupt",
    ),
    designArtifact(
      "Common Mistake Exposed",
      `Teams normalize grinding through ${frictionPoint}. Before: fragmented chaos. After: orchestrated clarity.`,
      `Split editorial frame — left: chaotic sticky notes and cables; right: calm checklist on paper beside closed laptop`,
      input,
      "Tension — before / after (photo-real)",
    ),
    designArtifact(
      "The Quiet Advantage",
      `${mission.slice(0, 140)}${mission.length > 140 ? "…" : ""}`,
      `Hands pinning a printed one-pager beside espresso cup — shallow depth-of-field, credible studio lighting`,
      input,
      "Insight — proprietary rhythm",
    ),
    designArtifact(
      "Claim Your Motion",
      `${input.context.primary_cta.toUpperCase()} — tap in, we ship the playbook.`,
      `Thumb hovering over phone DM sheet — subtle brand accent only on UI chrome, realistic OLED glare`,
      input,
      "CTA — decisive next step",
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
      original_prompt: `${input.originalPrompt}\nOUTPUT: Exactly four slides (hook → tension → insight → CTA). Each slide: DesignArtifact with GPT-image-2-ready editorial visual_prompt + layout_config editorial_photo_real.`,
      is_published: false,
      carousel_expert_mode: false,
    },
    type: "carousel",
    platform: "instagram",
    slides,
    caption: `${input.companyName} | Editorial carousel — hook → tension → insight → CTA. Built around ${frictionPoint} with brand-real visuals (not generic AI art).`,
    primary_hashtags: ["#BrandCarousel", "#FounderLed", "#EditorialMarketing"],
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
      `Founder at standing desk leaning into curved monitor — Slack or ops tool bokeh, daylight side window`,
      input,
      roles[0] ?? "Slide 1",
    ),
    designArtifact(
      "Teams Normalize Chaos",
      `Most operators excuse ${frictionPoint}. Visibility tanks before blame arrives.`,
      `Editorial split desk — scattered printouts versus one clean numbered checklist pinned above keyboard`,
      input,
      roles[1] ?? "Slide 2",
    ),
    designArtifact(
      "Flip The Lever",
      `${pillarA}. Introduce disciplined rhythm instead of heroic slog.`,
      `Whiteboard pivot moment — dry-erase arcs, founder hand mid-gesture, believable marker smudge`,
      input,
      roles[2] ?? "Slide 3",
    ),
    designArtifact(
      "Signal Stack Step 1",
      `${pillarB}. Anchor rituals—measure adoption weekly.`,
      `Over-shoulder laptop — calendar blocks and weekly review doc, practical task light`,
      input,
      roles[3] ?? "Slide 4",
    ),
    designArtifact(
      "Signal Stack Step 2",
      `${pillarC}. Instrument outcomes—not vibes.`,
      `Notebook with handwritten KPI table beside phone timer — tactile proof of measurement habit`,
      input,
      roles[4] ?? "Slide 5",
    ),
    designArtifact(
      "Signal Stack Step 3",
      `${mission.slice(0, 110)}${mission.length > 110 ? "…" : ""}`,
      `Team huddle around one laptop — candid expressions, concrete product UI blur (no fake neon UI)`,
      input,
      roles[5] ?? "Slide 6",
    ),
    designArtifact(
      "Compound Velocity",
      `${input.context.launch_goals[0] ?? "Ship predictable traction"} inside governed loops.`,
      `Late-day office — warm tungsten practicals, engineer closing a PR on screen, grounded energy`,
      input,
      roles[6] ?? "Slide 7",
    ),
    designArtifact(
      "Proof Snapshot",
      `${proofPoint ?? "Momentum indicators trending toward orchestrated throughput vs. reactive chaos."}`,
      `Printed metric chart clipped to pegboard OR believable dashboard on monitor — paper texture visible`,
      input,
      roles[7] ?? "Slide 8",
    ),
    designArtifact(
      "Steal This Rhythm",
      `One takeaway: discipline beats hustle — ship it as tight editorial framing, not spectacle.`,
      `Single sticky note on matte laptop lid — sharp handwritten headline blur, daylight gradient wall`,
      input,
      roles[8] ?? "Slide 9",
    ),
    designArtifact(
      `COMMENT ${keyword}`,
      `COMMENT ${keyword} to get the playbook — describe thumb-zone tap on real IG/chrome UI (no arcade glow).`,
      `Close crop smartphone — thumb above comment affordance, OLED reflections, neutral metals`,
      input,
      roles[9] ?? "Slide 10",
    ),
  ].map((artifact, index) =>
    index === roles.length - 1 ?
      {
        ...artifact,
        headline: `COMMENT ${keyword}`,
        body: `COMMENT ${keyword} — we'll DM the playbook (keep UI photo-real, no glowing faux button).`,
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
      original_prompt: `${input.originalPrompt}\nCAROUSEL MAKER — single 10-slide pass; synchronized DesignArtifacts per Instagram expert rules above (editorial_photo_real / GPT-image-2-ready visual_prompts).`,
      is_published: false,
      carousel_expert_mode: true,
    },
    type: "carousel",
    platform: "instagram",
    slides,
    caption: `${input.companyName} · Carousel Maker · Editorial 10-slide arc on ${frictionPoint} — photo-real campaign frames, brand palette-led.`,
    primary_hashtags: ["#CarouselMaker", "#BrandCampaign", "#EditorialCreative"],
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
    return `${INSTAGRAM_CAROUSEL_EXPERT_SYSTEM_INSTRUCTION}\n${base}\n${visualDnaInstruction}\nDESIGN-FIRST PIPELINE: Populate design_artifact per slide with headline (≤5 words), body (1–2 lines), visual_prompt (GPT-image-2-ready: subject, setting, composition, lighting, palette, mood, negative prompt — hyper-realistic editorial unless brand requests otherwise), layout_config { theme: 'editorial_photo_real', accent: 'brand_palette_led', text_effect: 'clean_typography' }.`;
  }
  if (channel === "linkedin") {
    return `${base}\n${visualDnaInstruction}\nSOP: First-person founder narrative. Short punchy paragraphs. NO AI tropes (avoid: unlocking, revolutionizing, in today's fast-paced).`;
  }
  return `${base}\n${visualDnaInstruction}\nSOP: One-to-one outreach only. Avoid newsletter language. Subject line must be lower-case and informal.`;
}
