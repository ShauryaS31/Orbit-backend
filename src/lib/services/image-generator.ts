import OpenAI from "openai";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

import { uploadPublicAsset } from "@/lib/services/supabase-storage";
import type { BrandKit, VisualIdentity } from "@/lib/types/orbit";

const DEFAULT_VISUAL_VIBE = "clean editorial campaign photography with soft lighting";

export const IMAGE_GENERATION_ENABLED = process.env.ENABLE_IMAGE_GEN === "true";

/** Default when `OPENAI_IMAGE_MODEL` is unset — Phase 2F ships `gpt-image-1.5` until org access supports newer tiers reliably. */
export const DEFAULT_OPENAI_IMAGE_MODEL = "gpt-image-1.5";

const IMAGE_MODEL = process.env.OPENAI_IMAGE_MODEL ?? DEFAULT_OPENAI_IMAGE_MODEL;
const IMAGE_QUALITY = parseImageQuality(process.env.OPENAI_IMAGE_QUALITY);
const IMAGE_SIZE = parseImageSize(process.env.OPENAI_IMAGE_SIZE);

const PLACEHOLDER_BRAND_MOTIF_URL = "/images/placeholder-brand-motif.png";

let dormantCreditNoticeEmitted = false;

export type ImageVisualMode = "photo_real_editorial" | "brand_graphic" | "abstract_background";

export type BrandBackgroundResult = {
  image_url: string;
  full_prompt: string;
  dormant?: boolean;
  model_used?: string;
  fallback_used?: boolean;
  /** Present when primary model failed and fallback produced the raster. */
  openai_image_primary_failure_sanitized?: string;
};

/** Resilience fallback when the primary model is rejected by the API (e.g. capability/account). */
const FALLBACK_IMAGE_MODEL = "gpt-image-1.5";

type OpenAiImageSize = "1536x1024" | "auto" | "1024x1024" | "1024x1536";

function sanitizeOpenAiErrorMessage(msg: string): string {
  return msg
    .replace(/\bsk-[a-zA-Z0-9]{20,}\b/g, "[redacted]")
    .replace(/\bBearer\s+[a-zA-Z0-9._-]+\b/gi, "Bearer [redacted]")
    .slice(0, 800);
}

async function generateOpenAiImageWithModelFallback(args: {
  prompt: string;
  size: OpenAiImageSize;
  quality: ReturnType<typeof parseImageQuality>;
}): Promise<{
  image_url: string;
  model_used: string;
  fallback_used: boolean;
  primary_error_sanitized?: string;
}> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is not configured.");
  }
  const client = new OpenAI({ apiKey });
  const requested = IMAGE_MODEL;
  let modelUsed = requested;
  let fallbackUsed = false;
  let result;
  try {
    result = await client.images.generate({
      model: requested,
      prompt: args.prompt,
      size: args.size,
      quality: args.quality,
      n: 1,
    });
  } catch (firstError) {
    const msg = firstError instanceof Error ? firstError.message : String(firstError);
    const safe = sanitizeOpenAiErrorMessage(msg);
    const modelish =
      /\b(model|unsupported|does not exist|invalid|unknown)\b/i.test(msg) ||
      /\b403\b/.test(msg) ||
      /must be verified|organization must be verified/i.test(msg);
    if (requested !== FALLBACK_IMAGE_MODEL && modelish) {
      console.warn(
        `[Visual Agent]: IMAGE_MODEL=${requested} FAILED — primary OpenAI image model error (sanitized): ${safe}`,
      );
      console.warn(
        `[Visual Agent]: FALLBACK_USED=true — retrying with ${FALLBACK_IMAGE_MODEL}. Smoke QA must treat this as not a pure ${requested} success.`,
      );
      fallbackUsed = true;
      modelUsed = FALLBACK_IMAGE_MODEL;
      result = await client.images.generate({
        model: FALLBACK_IMAGE_MODEL,
        prompt: args.prompt,
        size: args.size,
        quality: args.quality,
        n: 1,
      });
      const image = result.data?.[0];
      const imageUrl = image?.url;
      if (imageUrl) {
        const savedUrl = await saveRemoteImage(imageUrl);
        return {
          image_url: savedUrl,
          model_used: modelUsed,
          fallback_used: fallbackUsed,
          primary_error_sanitized: safe,
        };
      }
      if (image?.b64_json) {
        const savedUrl = await saveGeneratedImage(image.b64_json);
        return {
          image_url: savedUrl,
          model_used: modelUsed,
          fallback_used: fallbackUsed,
          primary_error_sanitized: safe,
        };
      }
      throw new Error("OpenAI did not return an image URL or base64 payload.");
    } else {
      throw firstError;
    }
  }

  const image = result.data?.[0];
  const imageUrl = image?.url;
  if (imageUrl) {
    const savedUrl = await saveRemoteImage(imageUrl);
    return { image_url: savedUrl, model_used: modelUsed, fallback_used: fallbackUsed };
  }

  if (image?.b64_json) {
    const savedUrl = await saveGeneratedImage(image.b64_json);
    return { image_url: savedUrl, model_used: modelUsed, fallback_used: fallbackUsed };
  }

  throw new Error("OpenAI did not return an image URL or base64 payload.");
}

export async function generateBrandBackground(
  prompt: string,
  palette: BrandKit,
  visualIdentity?: VisualIdentity,
  visualMode: ImageVisualMode = "brand_graphic",
): Promise<BrandBackgroundResult> {
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

  const out = await generateOpenAiImageWithModelFallback({
    prompt: fullPrompt,
    size: IMAGE_SIZE,
    quality: IMAGE_QUALITY,
  });
  return {
    image_url: out.image_url,
    full_prompt: fullPrompt,
    model_used: out.model_used,
    fallback_used: out.fallback_used,
    ...(out.primary_error_sanitized ?
      { openai_image_primary_failure_sanitized: out.primary_error_sanitized }
    : {}),
  };
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

/** Saves a pre-rendered JPEG (e.g. deterministic SVG raster) under `public/generated-images`. */
export async function saveDeterministicCampaignImage(sourceBuffer: Buffer): Promise<{
  image_url: string;
  relative_public_path: string;
}> {
  const outputDir = path.join(process.cwd(), "public", "generated-images");
  const filename = `${crypto.randomUUID()}.jpg`;
  const jpegBuffer = await sharp(sourceBuffer)
    .resize(1080, 1080, { fit: "cover", position: "center" })
    .jpeg({ quality: 92, mozjpeg: true })
    .toBuffer();

  await mkdir(outputDir, { recursive: true });
  const diskPath = path.join(outputDir, filename);
  await writeFile(diskPath, jpegBuffer);

  try {
    const url = await uploadPublicAsset({
      buffer: jpegBuffer,
      objectPath: `generated-images/${filename}`,
      contentType: "image/jpeg",
    });
    return { image_url: url, relative_public_path: path.join("public", "generated-images", filename) };
  } catch (error) {
    console.warn(
      "[Visual Agent]: Supabase upload failed; falling back to local generated asset.",
      error instanceof Error ? error.message : error,
    );
    return {
      image_url: `/generated-images/${filename}`,
      relative_public_path: path.join("public", "generated-images", filename),
    };
  }
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

/** Phase 2E — full creative prompt without brand-kit wrapper (LinkedIn playbook is source of truth). */
export async function generateOpenAiImageFromFullPrompt(args: {
  prompt: string;
  size?: "1024x1024" | "1536x1024" | "1024x1536" | "auto";
}): Promise<{
  image_url: string;
  full_prompt: string;
  model_used: string;
  fallback_used: boolean;
  openai_image_primary_failure_sanitized?: string;
}> {
  const resolvedSize =
    args.size ??
    parseImageSize(
      process.env.OPENAI_LINKEDIN_IMAGE_SIZE ?? process.env.OPENAI_IMAGE_SIZE,
    );
  if (!IMAGE_GENERATION_ENABLED) {
    if (!dormantCreditNoticeEmitted) {
      dormantCreditNoticeEmitted = true;
      console.warn(
        "[Visual Agent]: Image generation is currently in DORMANT mode to save credits.",
      );
    }
    return {
      image_url: PLACEHOLDER_BRAND_MOTIF_URL,
      full_prompt: args.prompt,
      model_used: IMAGE_MODEL,
      fallback_used: false,
    };
  }
  const out = await generateOpenAiImageWithModelFallback({
    prompt: args.prompt,
    size: resolvedSize,
    quality: IMAGE_QUALITY,
  });
  return {
    image_url: out.image_url,
    full_prompt: args.prompt,
    model_used: out.model_used,
    fallback_used: out.fallback_used,
    ...(out.primary_error_sanitized ?
      { openai_image_primary_failure_sanitized: out.primary_error_sanitized }
    : {}),
  };
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
