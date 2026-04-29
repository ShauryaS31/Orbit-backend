import OpenAI from "openai";

import type { VisualIdentity } from "@/lib/types/orbit";

export async function analyzeVisualBrand(base64Image: string): Promise<VisualIdentity> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is not configured.");
  }

  const client = new OpenAI({ apiKey });
  const normalizedImage = normalizeBase64Image(base64Image);

  const response = await client.chat.completions.create({
    model: "gpt-4o",
    temperature: 0.2,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content:
          "You are a brand design analyst. Return strict JSON with fields: visual_tone, design_patterns (array), typography_vibes (array), color_usage, style_description.",
      },
      {
        role: "user",
        content: [
          {
            type: "text",
            text: "Analyze this marketing asset and extract visual tone, design patterns, typography vibes, and color usage.",
          },
          {
            type: "image_url",
            image_url: {
              url: normalizedImage,
            },
          },
        ],
      },
    ],
  });

  const raw = response.choices[0]?.message?.content;
  if (!raw) {
    throw new Error("Vision model did not return analysis content.");
  }

  const parsed = JSON.parse(raw) as Partial<VisualIdentity>;
  return {
    visual_tone: parsed.visual_tone ?? "Minimalist",
    design_patterns: parsed.design_patterns ?? ["Whitespace emphasis"],
    typography_vibes: parsed.typography_vibes ?? ["Modern Sans"],
    color_usage: parsed.color_usage ?? "Primary appears in backgrounds, accent used for emphasis.",
    style_description:
      parsed.style_description ??
      "Clean modern composition with structured hierarchy and restrained color accents.",
  };
}

function normalizeBase64Image(input: string): string {
  const trimmed = input.trim();
  if (trimmed.startsWith("data:image/")) {
    return trimmed;
  }
  return `data:image/png;base64,${trimmed}`;
}
