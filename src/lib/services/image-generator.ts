import OpenAI from "openai";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

import { uploadPublicAsset } from "@/lib/services/supabase-storage";
import type { BrandKit, VisualIdentity } from "@/lib/types/orbit";

const DEFAULT_VISUAL_VIBE = "clean editorial campaign photography with soft lighting";

export const IMAGE_GENERATION_ENABLED = process.env.ENABLE_IMAGE_GEN === "true";
const IMAGE_MODEL = process.env.OPENAI_IMAGE_MODEL ?? "gpt-image-1.5";
const IMAGE_QUALITY = parseImageQuality(process.env.OPENAI_IMAGE_QUALITY);
const IMAGE_SIZE = parseImageSize(process.env.OPENAI_IMAGE_SIZE);

const PLACEHOLDER_BRAND_MOTIF_URL = "/images/placeholder-brand-motif.png";

let dormantCreditNoticeEmitted = false;

export type ImageVisualMode = "photo_real_editorial" | "brand_graphic" | "abstract_background";

export async function generateBrandBackground(
  prompt: string,
  palette: BrandKit,
  visualIdentity?: VisualIdentity,
  visualMode: ImageVisualMode = "brand_graphic",
): Promise<{ image_url: string; full_prompt: string; dormant?: boolean }> {
  const fullPrompt = buildBrandPrompt(prompt, palette, visualIdentity, visualMode);

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
    model: IMAGE_MODEL,
    prompt: fullPrompt,
    size: IMAGE_SIZE,
    quality: IMAGE_QUALITY,
    n: 1,
  });

  const image = result.data?.[0];
  const imageUrl = image?.url;
  if (imageUrl) {
    const savedUrl = await saveRemoteImage(imageUrl);
    return { image_url: savedUrl, full_prompt: fullPrompt };
  }

  if (image?.b64_json) {
    const savedUrl = await saveGeneratedImage(image.b64_json);
    return { image_url: savedUrl, full_prompt: fullPrompt };
  }

  if (!imageUrl) {
    throw new Error("OpenAI did not return an image URL or base64 payload.");
  }

  return { image_url: imageUrl, full_prompt: fullPrompt };
}

async function saveGeneratedImage(base64Image: string): Promise<string> {
  return saveImageBuffer(Buffer.from(base64Image, "base64"));
}

async function saveRemoteImage(imageUrl: string): Promise<string> {
  const response = await fetch(imageUrl);
  if (!response.ok) {
    throw new Error(`Unable to download generated image from OpenAI: ${response.status}`);
  }
  return saveImageBuffer(Buffer.from(await response.arrayBuffer()));
}

async function saveImageBuffer(sourceBuffer: Buffer): Promise<string> {
  const outputDir = path.join(process.cwd(), "public", "generated-images");
  const filename = `${crypto.randomUUID()}.jpg`;
  const jpegBuffer = await sharp(sourceBuffer)
    .resize(1080, 1080, { fit: "cover", position: "center" })
    .jpeg({ quality: 92, mozjpeg: true })
    .toBuffer();

  await mkdir(outputDir, { recursive: true });
  await writeFile(path.join(outputDir, filename), jpegBuffer);

  try {
    return await uploadPublicAsset({
      buffer: jpegBuffer,
      objectPath: `generated-images/${filename}`,
      contentType: "image/jpeg",
    });
  } catch (error) {
    console.warn(
      "[Visual Agent]: Supabase upload failed; falling back to local generated asset.",
      error instanceof Error ? error.message : error,
    );
    return `/generated-images/${filename}`;
  }
}

function parseImageSize(value?: string): "1536x1024" | "auto" | "1024x1024" | "1024x1536" {
  if (value === "auto" || value === "1024x1024" || value === "1024x1536" || value === "1536x1024") {
    return value;
  }
  return "1536x1024";
}

function parseImageQuality(value?: string): "auto" | "low" | "medium" | "high" {
  if (value === "auto" || value === "low" || value === "medium" || value === "high") {
    return value;
  }
  return "medium";
}

function buildBrandPrompt(
  prompt: string,
  palette: BrandKit,
  visualIdentity?: VisualIdentity,
  visualMode: ImageVisualMode = "brand_graphic",
): string {
  const vibe = palette.tone_of_voice.join(", ") || DEFAULT_VISUAL_VIBE;
  const visualDna = visualIdentity
    ? `Visual DNA to preserve: tone=${visualIdentity.visual_tone}; patterns=${visualIdentity.design_patterns.join(", ")}; typography=${visualIdentity.typography_vibes.join(", ")}; color-usage=${visualIdentity.color_usage}.`
    : "Visual DNA to preserve: premium minimal and consistent with source brand assets.";
  const hasDetailedCreativeBrief =
    /subject:|setting:|composition:|camera\/framing:|lighting:|source anchor:/i.test(prompt);

  if (visualMode === "photo_real_editorial") {
    return [
      "Create a hyper-realistic editorial campaign photograph from this creative director brief.",
      "The image must look like a real camera captured a believable scene with natural anatomy, real materials, plausible perspective, and documentary lighting.",
      "Do not make abstract gradients, vector art, isometric art, 3D renders, neon sci-fi motifs, generic AI posters, or decorative brand backgrounds.",
      "Do not include readable text, logos, watermarks, captions, or UI mockups inside the raster unless the brief explicitly requests a physical prop with unreadable markings.",
      "Leave clean negative space where design typography can be overlaid later.",
      `Use the brand HEX system only as subtle art direction/accent color, not as a full-screen gradient: ${palette.primary_hex}, ${palette.secondary_hex}, ${palette.accent_hex}, ${palette.neutral_hex}.`,
      `Brand tone: ${vibe}.`,
      visualDna,
      prompt,
    ].join(" ");
  }

  if (hasDetailedCreativeBrief || visualMode === "brand_graphic") {
    return [
      "Create a premium, high-end editorial campaign image from this creative director brief.",
      "Do not include readable text unless the brief explicitly asks for overlay room; leave clean negative space for UI typography.",
      `Use the brand HEX system: ${palette.primary_hex}, ${palette.secondary_hex}, ${palette.accent_hex}, ${palette.neutral_hex}.`,
      `Brand tone: ${vibe}.`,
      visualDna,
      prompt,
    ].join(" ");
  }

  return [
    "Create a minimalist, high-end abstract background.",
    "DO NOT include any text, people, or UI elements.",
    `Use a professional color scheme strictly following these HEX codes: ${palette.primary_hex}, ${palette.accent_hex}.`,
    `Style: ${vibe}.`,
    visualDna,
    prompt,
  ].join(" ");
}
