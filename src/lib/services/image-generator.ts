import OpenAI from "openai";

import type { BrandKit, VisualIdentity } from "@/lib/types/orbit";

const DEFAULT_VISUAL_VIBE = "clean editorial abstraction with soft lighting";

export const IMAGE_GENERATION_ENABLED = process.env.ENABLE_IMAGE_GEN === "true";

const PLACEHOLDER_BRAND_MOTIF_URL = "/images/placeholder-brand-motif.png";

let dormantCreditNoticeEmitted = false;

export async function generateBrandBackground(
  prompt: string,
  palette: BrandKit,
  visualIdentity?: VisualIdentity,
): Promise<{ image_url: string; full_prompt: string; dormant?: boolean }> {
  const fullPrompt = buildBrandPrompt(prompt, palette, visualIdentity);

  if (!IMAGE_GENERATION_ENABLED) {
    if (!dormantCreditNoticeEmitted) {
      dormantCreditNoticeEmitted = true;
      console.warn(
        "[Visual Agent]: Image generation is currently in DORMANT mode to save credits.",
      );
    }
    return {
      image_url: PLACEHOLDER_BRAND_MOTIF_URL,
      full_prompt: fullPrompt,
      dormant: true,
    };
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is not configured.");
  }

  const client = new OpenAI({ apiKey });

  const result = await client.images.generate({
    model: "gpt-image-1",
    prompt: fullPrompt,
    size: "1792x1024",
    quality: "standard",
    n: 1,
  });

  const imageUrl = result.data?.[0]?.url;
  if (!imageUrl) {
    throw new Error("OpenAI did not return an image URL.");
  }

  return { image_url: imageUrl, full_prompt: fullPrompt };
}

function buildBrandPrompt(
  prompt: string,
  palette: BrandKit,
  visualIdentity?: VisualIdentity,
): string {
  const vibe = palette.tone_of_voice.join(", ") || DEFAULT_VISUAL_VIBE;
  const visualDna = visualIdentity
    ? `Visual DNA to preserve: tone=${visualIdentity.visual_tone}; patterns=${visualIdentity.design_patterns.join(", ")}; typography=${visualIdentity.typography_vibes.join(", ")}; color-usage=${visualIdentity.color_usage}.`
    : "Visual DNA to preserve: premium minimal and consistent with source brand assets.";
  return [
    "Create a minimalist, high-end abstract background.",
    "DO NOT include any text, people, or UI elements.",
    `Use a professional color scheme strictly following these HEX codes: ${palette.primary_hex}, ${palette.accent_hex}.`,
    `Style: ${vibe}.`,
    visualDna,
    prompt,
  ].join(" ");
}
