import type { ProductMarketingContext } from "@/lib/types/orbit";

const FORBIDDEN_PHRASES = [
  "unlocking",
  "unlocking potential",
  "game-changer",
  "streamline",
  "empower",
  "delivering results",
  "revolutionizing",
  "in today's fast-paced",
  "ai-powered",
  "next-gen ai",
  "cutting-edge ai",
] as const;

export interface HumanFilterConfig {
  friction_point: string;
  company_name?: string;
}

export function buildHumanFilterPrompt(config: HumanFilterConfig): string {
  const toneDirective = getCompanyToneDirective(config.company_name);
  return [
    "HUMAN-NATURAL FILTER (MANDATORY)",
    "Write like a founder talking after a big win.",
    "Use short, punchy sentences.",
    "Use variable sentence length to avoid robotic cadence.",
    "Use first-person plural voice (We).",
    toneDirective,
    `Anchor the message to this real friction point: ${config.friction_point}.`,
    `ABSOLUTELY FORBIDDEN phrases: ${FORBIDDEN_PHRASES.map((phrase) => `"${phrase}"`).join(", ")}.`,
    "Do not sound like a PR agency. Keep it direct and specific.",
  ].join("\n");
}

export function getFrictionPoint(context: ProductMarketingContext): string {
  return context.pains_solved[0] ?? "daily operational friction";
}

export function hasForbiddenPhrase(value: string): boolean {
  const normalized = value.toLowerCase();
  return FORBIDDEN_PHRASES.some((phrase) => normalized.includes(phrase));
}

export function countEmojis(value: string): number {
  const matches = value.match(
    /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{1F1E6}-\u{1F1FF}]/gu,
  );
  return matches?.length ?? 0;
}

function getCompanyToneDirective(companyName?: string): string {
  if (!companyName) {
    return "Tone profile: founder-led, clear, and human.";
  }
  const normalized = companyName.toLowerCase();
  if (normalized.includes("relevance ai")) {
    return "Tone profile: Visionary/Aggressive.";
  }
  if (normalized.includes("heidi health")) {
    return "Tone profile: Empathetic/Quietly Confident.";
  }
  return "Tone profile: founder-led, clear, and human.";
}

export const INSTAGRAM_CAROUSEL_EXPERT_SYSTEM_INSTRUCTION = `YOU ARE AN EXPERT INSTAGRAM CAROUSEL CREATOR. YOUR GOAL IS A POLISHED, BRAND-SPECIFIC CAROUSEL THAT CONVERTS WITHOUT LOOKING LIKE GENERIC AI ART.

VISUAL STANDARD (DEFAULT — GPT-IMAGE-2 OR EQUIVALENT HIGH-FIDELITY IMAGE GENERATION):
- Default to hyper-realistic editorial / commercial campaign photography unless the supplied brand identity explicitly calls for illustration, cartoon, collage, or abstract art.
- Aspect ratio: 4:5 portrait for feed carousels.
- Use the company's visual identity when provided; otherwise infer tasteful editorial cues from category and positioning.
- Anchor every slide's visual_prompt to subject, setting, composition, lighting, palette, mood, and a clear negative prompt. Keep copy short; reserve clean negative space for headline/CTA overlays — do not describe long paragraphs baked into the raster.
- Avoid: generic AI robots, neon sci-fi glow, holographic chrome UI, glitch/nebula motifs, empty glass atriums, stock-photo smiles, vague gradient-only backgrounds — unless the brand brief explicitly demands them.

CONTENT ARC (STILL HIGH-CONVERTING, NOT “VIRAL NEON”):
- Concise slide headlines (aim ≤5 words).
- Every slide has a job: hook, tension, insight, proof, and CTA (expand the middle beats across slides as needed).
- Slide 1 — Hook: sharp claim or question tied to buyer reality.
- Slide 2 — Tension / problem: painful truth or mistake; visual can show real before/after context, not sci-fi metaphor.
- Slide 3 — Insight / pivot: the reframing or lever they were missing.
- Slides 4–7 — Value: numbered steps or pillars; concrete operator language.
- Slide 8 — Proof: credible outcome snapshot (real dashboard printout, annotated screenshot blur, credible chart prop — still editorial photo-real).
- Slide 9 — Recap: one-line takeaway + optional “save this framework” — still editorial, not gimmick filters.
- Slide 10 — CTA: decisive next step (e.g. COMMENT [KEYWORD] pattern allowed but describe the visual as real UI/device thumb-zone affordance, not a glowing arcade button).

Populate design_artifact per slide: headline, body, visual_prompt (per structure above), layout_config aligned to editorial_photo_real / brand_palette_led / clean_typography defaults when emitted programmatically.
---`;
