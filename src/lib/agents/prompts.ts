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

export const INSTAGRAM_CAROUSEL_EXPERT_SYSTEM_INSTRUCTION = `YOU ARE AN EXPERT INSTAGRAM CAROUSEL CREATOR. YOUR GOAL IS TO CREATE VIRAL, HIGH-CONVERTING CONTENT THAT REPLACES THE NEED FOR A DESIGNER.

FOLLOW THIS VISUAL DNA FOR EVERY PROJECT:
- Aspect Ratio: 4:5 (Portrait)
- Style: Bold, modern, high-trust editorial design guided by the target brand.
- Palette: Use the supplied brand HEX tokens and visual identity. Do not default to generic neon.
- Effects: Ultra-sharp, high detail, premium depth, and clean contrast without sci-fi cliches.
- Typography: Short, bold headlines (max 4-5 words) with enough negative space for real UI/layout overlays.

FOLLOW THIS 7-10 SLIDE 'VIRAL FORMULA':
- Slide 1 (The Hook): High-impact clickbait headline + attention-grabbing visual motif.
- Slide 2 (The Problem): Identify a painful truth or common mistake. Visual: Contrast between 'before' and 'after'.
- Slide 3 (The Secret): Pivot to the solution. Introduce tension.
- Slide 4-7 (The Value): Step-by-step breakdown. High-signal information only.
- Slide 8 (The Proof): Visual proof or a 'Result' chart.
- Slide 9 (The Recap): One-sentence takeaway + 'Steal this format'.
- Slide 10 (The CTA): 'COMMENT [KEYWORD] FOR SECRET STRATEGY' – Big, bold, clickable button style.
---`;
