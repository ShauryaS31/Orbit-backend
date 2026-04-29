import OpenAI from "openai";

import { createGovernanceEntry } from "@/lib/services/governance-logger";
import type {
  BrandDesignSystem,
  BrandKit,
  CompanyIntelligenceValidation,
  GovernanceAuditEntry,
  ProductMarketingContext,
  VisualIdentity,
  WebsiteIntelligence,
} from "@/lib/types/orbit";

export async function validateIntelligence(
  data: WebsiteIntelligence,
): Promise<{
  validation: CompanyIntelligenceValidation;
  inferred_brand_kit: BrandKit;
  inferred_visual_identity: VisualIdentity;
}> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return buildFallbackValidation(data);
  }

  const client = new OpenAI({ apiKey });
  const completion = await client.chat.completions.create({
    model: "gpt-4o-mini",
    temperature: 0.2,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content:
          "You are an elite brand intelligence consultant. Return strict JSON with: confidence_score as integer 0-100 (consultant-grade confidence index), confidence_levels {company_name, mission, audience as high|medium|low}, validated_fields, missing_fields, warnings, review_questions, reviewer_notes, visual_palette_rationale (exactly two sentences explaining why primary/secondary/accent HEX codes fit this brand's hierarchy), brand_voice_descriptors (array of 3-5 single-word adjectives like Professional or Bold), brand_palette { primary, secondary, accent, rationale }.",
      },
      {
        role: "user",
        content: JSON.stringify({
          company_name: data.company_name,
          domain: data.domain,
          audience_summary: data.audience_summary,
          key_value_propositions: data.key_value_propositions,
          discovered_pages: data.discovered_pages,
        }),
      },
    ],
  });

  const raw = completion.choices[0]?.message?.content;
  if (!raw) {
    return buildFallbackValidation(data);
  }

  try {
    const parsed = JSON.parse(raw) as Partial<CompanyIntelligenceValidation> & {
      visual_palette_rationale?: string;
      brand_voice_descriptors?: unknown;
    };
    const confidence_levels: NonNullable<CompanyIntelligenceValidation["confidence_levels"]> = {
      company_name: normalizeConfidence(parsed.confidence_levels?.company_name),
      mission: normalizeConfidence(parsed.confidence_levels?.mission),
      audience: normalizeConfidence(parsed.confidence_levels?.audience),
    };
    const voiceRaw = parsed.brand_voice_descriptors;
    const voiceList =
      Array.isArray(voiceRaw) ?
        voiceRaw.filter((item): item is string => typeof item === "string")
      : [];

    let validation: CompanyIntelligenceValidation = {
      confidence_score: normalizeConfidenceScore(parsed.confidence_score, confidence_levels),
      confidence_levels,
      validated_fields: parsed.validated_fields ?? ["company_name", "audience_summary"],
      missing_fields: parsed.missing_fields ?? [],
      warnings: parsed.warnings ?? [],
      review_questions: ensureReviewQuestions(parsed.review_questions ?? [], parsed.confidence_levels),
      reviewer_notes:
        parsed.reviewer_notes ??
        "Validation complete with mixed confidence. Recommend founder confirmation.",
      brand_palette:
        parsed.brand_palette && isValidPalette(parsed.brand_palette) ?
          parsed.brand_palette
        : undefined,
      visual_palette_rationale:
        typeof parsed.visual_palette_rationale === "string" ?
          parsed.visual_palette_rationale.trim()
        : undefined,
      brand_voice_descriptors: voiceList.length > 0 ? voiceList : undefined,
    };
    validation = enrichPremiumDiscoveryMetadata(data, validation);
    const inferredBrandKit = inferBrandKit(data, validation.brand_palette);
    const visualIdentity = inferVisualIdentity(data);
    return {
      validation,
      inferred_brand_kit: inferredBrandKit,
      inferred_visual_identity: visualIdentity,
    };
  } catch {
    return buildFallbackValidation(data);
  }
}

function buildFallbackValidation(
  data: WebsiteIntelligence,
): {
  validation: CompanyIntelligenceValidation;
  inferred_brand_kit: BrandKit;
  inferred_visual_identity: VisualIdentity;
} {
  const hasPages = (data.discovered_pages?.length ?? 0) >= 3;
  const confidenceLevels: CompanyIntelligenceValidation["confidence_levels"] = {
    company_name: hasPages ? "high" : "medium",
    mission: hasPages ? "medium" : "low",
    audience: hasPages ? "medium" : "low",
  };

  let validation: CompanyIntelligenceValidation = {
    confidence_score: normalizeConfidenceScore(undefined, confidenceLevels),
    confidence_levels: confidenceLevels,
    validated_fields: ["company_name", "domain", "audience_summary"],
    missing_fields: ["mission_statement"],
    warnings: ["Live validation used fallback logic (OpenAI unavailable or parsing failed)."],
    review_questions: ensureReviewQuestions([], confidenceLevels),
    reviewer_notes:
      "We scraped site-level signals but need founder confirmation for mission and audience precision.",
    brand_palette: inferPaletteHeuristic(data),
  };
  validation = enrichPremiumDiscoveryMetadata(data, validation);
  return {
    validation,
    inferred_brand_kit: inferBrandKit(data, validation.brand_palette),
    inferred_visual_identity: inferVisualIdentity(data),
  };
}

function clamp(value: number | undefined, min: number, max: number, fallback: number): number {
  if (typeof value !== "number" || Number.isNaN(value)) return fallback;
  return Math.min(max, Math.max(min, value));
}

type ConfidenceTier = NonNullable<
  CompanyIntelligenceValidation["confidence_levels"]
>["company_name"];

function normalizeConfidence(value: string | undefined): ConfidenceTier {
  if (value === "high" || value === "medium" || value === "low") {
    return value;
  }
  return "medium";
}

function computeConfidenceScoreFromLevels(
  levels: NonNullable<CompanyIntelligenceValidation["confidence_levels"]>,
): number {
  const tier: Record<ConfidenceTier, number> = {
    high: 93,
    medium: 71,
    low: 46,
  };
  const avg =
    (tier[levels.company_name] + tier[levels.mission] + tier[levels.audience]) / 3;
  return Math.round(avg);
}

function normalizeConfidenceScore(
  parsed: number | undefined,
  levels: NonNullable<CompanyIntelligenceValidation["confidence_levels"]>,
): number {
  const fallback = computeConfidenceScoreFromLevels(levels);
  if (typeof parsed !== "number" || Number.isNaN(parsed)) {
    return fallback;
  }
  if (parsed <= 1 && parsed >= 0) {
    return Math.round(parsed * 100);
  }
  return Math.round(clamp(parsed, 0, 100, fallback));
}

function ensureReviewQuestions(
  questions: string[],
  levels?: Partial<CompanyIntelligenceValidation["confidence_levels"]>,
): string[] {
  const list = questions.slice(0, 3);
  const company = levels?.company_name ?? "medium";
  const mission = levels?.mission ?? "medium";
  const audience = levels?.audience ?? "medium";

  if (company !== "high") {
    list.push("Is the detected company name accurate and complete?");
  }
  if (mission !== "high") {
    list.push("How would you describe your mission statement in one sentence?");
  }
  if (audience !== "high") {
    list.push("Who is your highest-priority buyer or audience segment?");
  }

  return Array.from(new Set(list)).slice(0, 3);
}

function inferBrandKit(
  data: WebsiteIntelligence,
  palette?: CompanyIntelligenceValidation["brand_palette"],
): BrandKit {
  const inferred = palette ?? inferPaletteHeuristic(data);
  return {
    brand_name: data.company_name,
    primary_hex: inferred.primary,
    secondary_hex: inferred.secondary,
    accent_hex: inferred.accent,
    neutral_hex: inferred.secondary,
    typography: {
      heading_font: "Inter",
      body_font: "Inter",
    },
    tone_of_voice: inferTone(data.audience_summary),
  };
}

function inferPaletteHeuristic(
  data: WebsiteIntelligence,
): NonNullable<CompanyIntelligenceValidation["brand_palette"]> {
  const visualHex = data.visual_signals?.discovered_hex_codes ?? [];
  const theme = data.visual_signals?.theme_color;
  if (visualHex.length >= 2) {
    return {
      primary: theme ?? visualHex[0],
      secondary: visualHex[1],
      accent: visualHex[2] ?? visualHex[0],
      rationale:
        "Palette inferred from live website CSS and theme-color signals for visual continuity.",
    };
  }

  const audience = data.audience_summary.toLowerCase();
  if (audience.includes("health") || audience.includes("clinic")) {
    return {
      primary: "#1E3A8A",
      secondary: "#F8FAFC",
      accent: "#0EA5E9",
      rationale:
        "No strong hex found, so we used trust-based blues and clinical whites aligned to health audiences.",
    };
  }
  if (audience.includes("developer") || audience.includes("engineer")) {
    return {
      primary: "#0F172A",
      secondary: "#E2E8F0",
      accent: "#3B82F6",
      rationale:
        "No strong hex found, so we used deep navy + electric blue for technical credibility.",
    };
  }
  return {
    primary: "#111827",
    secondary: "#F9FAFB",
    accent: "#6366F1",
    rationale: "No dominant site palette found; selected a premium neutral palette with modern accent.",
  };
}

function inferTone(audienceSummary: string): string[] {
  const text = audienceSummary.toLowerCase();
  if (text.includes("enterprise")) return ["Authoritative", "Precise", "Results-focused"];
  if (text.includes("developer")) return ["Technical", "Direct", "High-context"];
  if (text.includes("health")) return ["Trustworthy", "Clear", "Human"];
  return ["Professional", "Clear", "Confident"];
}

function ensureBrandVoiceDescriptors(descriptors: string[]): string[] {
  const cleaned = [...new Set(descriptors.map((s) => s.trim()).filter(Boolean))];
  const fallbackPool = ["Purpose-driven", "Authentic", "Insight-led"];
  while (cleaned.length < 3 && fallbackPool.length > 0) {
    const next = fallbackPool.shift();
    if (next && !cleaned.includes(next)) cleaned.push(next);
  }
  return cleaned.slice(0, 5);
}

function inferBrandVoiceDescriptors(data: WebsiteIntelligence): string[] {
  const base = inferTone(data.audience_summary);
  const extras: string[] = [];
  const ind = data.industry.toLowerCase();
  const aud = data.audience_summary.toLowerCase();
  if (ind.includes("health") || aud.includes("clinical") || aud.includes("patient")) {
    extras.push("Empathetic", "Trust-forward");
  }
  if (ind.includes("venture") || ind.includes("capital")) {
    extras.push("Institutional", "Measured");
  }
  if (ind.includes("ai") || aud.includes("developer") || aud.includes("engineer")) {
    extras.push("Technical", "Sharp");
  }
  return ensureBrandVoiceDescriptors([...base, ...extras]);
}

function synthesizeVisualPaletteRationale(
  data: WebsiteIntelligence,
  palette: NonNullable<CompanyIntelligenceValidation["brand_palette"]>,
): string {
  const siteLed =
    (data.visual_signals?.discovered_hex_codes?.length ?? 0) >= 2 ||
    Boolean(data.visual_signals?.theme_color);
  const evidence = siteLed ?
    "live CSS/theme extraction from the indexed surfaces"
  : "category cues inferred from positioning language when sampling remained sparse";
  return (
    `${palette.primary} anchors primary surfaces because ${evidence} maps strongest recurring chromatic authority for ${data.company_name}.` +
    ` ${palette.secondary} stabilizes dense editorial UI while ${palette.accent} concentrates CTA emphasis—balancing credibility with activation for ${data.industry} buyers without sacrificing restraint.`
  );
}

function enrichPremiumDiscoveryMetadata(
  data: WebsiteIntelligence,
  validation: CompanyIntelligenceValidation,
): CompanyIntelligenceValidation {
  const palette = validation.brand_palette ?? inferPaletteHeuristic(data);
  const descriptors = ensureBrandVoiceDescriptors(
    validation.brand_voice_descriptors?.length ?
      validation.brand_voice_descriptors
    : inferBrandVoiceDescriptors(data),
  );
  const visual_palette_rationale =
    validation.visual_palette_rationale?.trim() ||
    synthesizeVisualPaletteRationale(data, palette);
  return {
    ...validation,
    brand_palette: palette,
    confidence_score: validation.confidence_score,
    brand_voice_descriptors: descriptors,
    visual_palette_rationale,
  };
}

const DESIGN_SYSTEM_JSON_INSTRUCTION = `Return a single JSON object with this exact shape (all keys required):
{
  "primary_palette": [ { "hex": "#RRGGBB", "label": "Surface" }, ... 5 entries ],
  "secondary_palette": [ { "hex": "#RRGGBB", "label": "Accent" }, ... 3 entries ],
  "typography": { "heading_font": "Name from Google Fonts", "body_font": "Name from Google Fonts", "font_source": "google_fonts" },
  "spacing_scale": { "base_px": 4, "steps": [4,8,12,16,24,32,48,64] },
  "border_radius_scale": { "sm": "4px", "md": "8px", "lg": "16px", "xl": "24px" },
  "buttons": {
    "primary": "Tailwind-oriented description",
    "secondary": "Tailwind-oriented description",
    "ghost": "Tailwind-oriented description"
  },
  "sample_card_component": "Short textual description of a card (title, meta, CTA) suitable for JSX",
  "mood_vibe": [ "word1", "word2", "word3" ]
}`;

function buildDesignSystemPrompt(brandName: string): string {
  return [
    `Build me a complete design system for ${brandName}. Include:`,
    "1. A primary color palette (5 colors with hex codes)",
    "2. A secondary/accent palette (3 colors)",
    "3. Typography pairing (heading + body font from Google Fonts)",
    "4. Spacing scale (4px base)",
    "5. Border radius scale",
    "6. Button styles (primary, secondary, ghost)",
    "7. A sample card component",
    "8. Mood vibe in 3 words.",
    "Output as a structured JSON object.",
    "",
    DESIGN_SYSTEM_JSON_INSTRUCTION,
  ].join("\n");
}

function fallbackDesignSystem(intelligence: WebsiteIntelligence, brandKit: BrandKit): BrandDesignSystem {
  const hexes = intelligence.visual_signals?.discovered_hex_codes?.length ?
    intelligence.visual_signals.discovered_hex_codes
  : [brandKit.primary_hex, brandKit.secondary_hex, brandKit.accent_hex, brandKit.neutral_hex, "#111827"];
  const primary_palette = Array.from({ length: 5 }, (_, i) => ({
    hex: hexes[i % hexes.length] ?? brandKit.primary_hex,
    label: i === 0 ? "Hero" : `Layer ${i + 1}`,
  }));
  const secondary_palette = [
    { hex: brandKit.accent_hex, label: "Accent" },
    { hex: brandKit.secondary_hex, label: "Muted" },
    { hex: "#64748B", label: "Steel" },
  ];
  return {
    primary_palette,
    secondary_palette,
    typography: {
      heading_font: brandKit.typography.heading_font,
      body_font: brandKit.typography.body_font,
      font_source: "google_fonts",
    },
    spacing_scale: {
      base_px: 4,
      steps: [4, 8, 12, 16, 24, 32, 48, 64],
    },
    border_radius_scale: {
      sm: "4px",
      md: "8px",
      lg: "16px",
      xl: "24px",
    },
    buttons: {
      primary: `Solid bg-[${brandKit.primary_hex}] text-white rounded-lg px-5 py-2.5 shadow-md hover:opacity-95`,
      secondary: `Outline border border-[${brandKit.accent_hex}] text-[${brandKit.primary_hex}] rounded-lg px-5 py-2.5`,
      ghost: `text-[${brandKit.primary_hex}] underline-offset-4 hover:underline px-3 py-2`,
    },
    sample_card_component:
      "<Card><Title/><Meta/><Body/><PrimaryButton/></Card> — modular shell with elevated shadow.",
    mood_vibe: ["Professional", intelligence.industry.trim().slice(0, 24) || "Focused", "Clarity"],
  };
}

function padPaletteEntries<T extends { hex: string; label?: string }>(
  items: T[],
  fallback: T[],
  length: number,
): T[] {
  const out = [...items];
  let guard = 0;
  while (out.length < length && guard < length + 10) {
    out.push(fallback[out.length % fallback.length]);
    guard += 1;
  }
  return out.slice(0, length);
}

function normalizeBrandDesignSystem(
  raw: Record<string, unknown>,
  fallback: BrandDesignSystem,
): BrandDesignSystem {
  const mood = raw.mood_vibe;
  const moodTriple: [string, string, string] =
    Array.isArray(mood) && mood.length >= 3 ?
      [String(mood[0]), String(mood[1]), String(mood[2])]
    : fallback.mood_vibe;

  const pp = raw.primary_palette;
  const primary_palette =
    Array.isArray(pp) && pp.length > 0 ?
      (pp as Array<Record<string, unknown>>).map((c, index) => ({
        hex: typeof c.hex === "string" ? c.hex : fallback.primary_palette[index % 5]?.hex ?? "#111827",
        label: typeof c.label === "string" ? c.label : fallback.primary_palette[index % 5]?.label,
      }))
    : fallback.primary_palette;

  const sp = raw.secondary_palette;
  const secondary_palette =
    Array.isArray(sp) && sp.length > 0 ?
      (sp as Array<Record<string, unknown>>).map((c, index) => ({
        hex: typeof c.hex === "string" ? c.hex : fallback.secondary_palette[index % 3]?.hex ?? "#64748B",
        label: typeof c.label === "string" ? c.label : fallback.secondary_palette[index % 3]?.label,
      }))
    : fallback.secondary_palette;

  const typo = raw.typography;
  const typography =
    typo && typeof typo === "object" ?
      {
        heading_font:
          typeof (typo as Record<string, unknown>).heading_font === "string" ?
            String((typo as Record<string, unknown>).heading_font)
          : fallback.typography.heading_font,
        body_font:
          typeof (typo as Record<string, unknown>).body_font === "string" ?
            String((typo as Record<string, unknown>).body_font)
          : fallback.typography.body_font,
        font_source: "google_fonts" as const,
      }
    : fallback.typography;

  const spacing = raw.spacing_scale;
  const spacing_scale =
    spacing && typeof spacing === "object" ?
      {
        base_px: 4 as const,
        steps:
          Array.isArray((spacing as Record<string, unknown>).steps) ?
            ((spacing as Record<string, unknown>).steps as number[]).map((n) => Number(n))
          : fallback.spacing_scale.steps,
      }
    : fallback.spacing_scale;

  const br = raw.border_radius_scale;
  const border_radius_scale =
    br && typeof br === "object" && !Array.isArray(br) ?
      { ...(br as Record<string, string>) }
    : fallback.border_radius_scale;

  const bt = raw.buttons;
  const buttons =
    bt && typeof bt === "object" ?
      {
        primary:
          typeof (bt as Record<string, unknown>).primary === "string" ?
            String((bt as Record<string, unknown>).primary)
          : fallback.buttons.primary,
        secondary:
          typeof (bt as Record<string, unknown>).secondary === "string" ?
            String((bt as Record<string, unknown>).secondary)
          : fallback.buttons.secondary,
        ghost:
          typeof (bt as Record<string, unknown>).ghost === "string" ?
            String((bt as Record<string, unknown>).ghost)
          : fallback.buttons.ghost,
      }
    : fallback.buttons;

  const sample =
    typeof raw.sample_card_component === "string" ?
      raw.sample_card_component
    : fallback.sample_card_component;

  return {
    primary_palette: padPaletteEntries(primary_palette, fallback.primary_palette, 5),
    secondary_palette: padPaletteEntries(secondary_palette, fallback.secondary_palette, 3),
    typography,
    spacing_scale,
    border_radius_scale,
    buttons,
    sample_card_component: sample,
    mood_vibe: moodTriple,
  };
}

/**
 * Generates the "soul" brand design system token set (AI Design Studio) for downstream React/Tailwind artifacts.
 */
export async function generateDesignSystem(input: {
  intelligence: WebsiteIntelligence;
  brandKit: BrandKit;
}): Promise<BrandDesignSystem> {
  const brandName = input.intelligence.company_name;
  const fallback = fallbackDesignSystem(input.intelligence, input.brandKit);
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return fallback;
  }

  const client = new OpenAI({ apiKey });
  const userPrompt = buildDesignSystemPrompt(brandName);
  const completion = await client.chat.completions.create({
    model: "gpt-4o-mini",
    temperature: 0.35,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content:
          "You are a principal product designer. Output only valid JSON matching the required design-system contract. No prose outside JSON.",
      },
      { role: "user", content: userPrompt },
    ],
  });

  const raw = completion.choices[0]?.message?.content;
  if (!raw) {
    return fallback;
  }

  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    return normalizeBrandDesignSystem(parsed, fallback);
  } catch {
    return fallback;
  }
}

export function fuseBrandIntelligence(
  websiteIntelligence: WebsiteIntelligence,
  inferredBrandKit: BrandKit,
  visualIdentity?: VisualIdentity,
): { brand_kit: BrandKit; visual_identity: VisualIdentity } {
  const fallbackVisual = inferVisualIdentity(websiteIntelligence);
  const mergedVisual = visualIdentity ?? fallbackVisual;
  const mergedBrandKit: BrandKit = {
    ...inferredBrandKit,
    tone_of_voice: Array.from(
      new Set([
        ...inferredBrandKit.tone_of_voice,
        mergedVisual.visual_tone.toLowerCase(),
        ...mergedVisual.design_patterns.slice(0, 2).map((pattern) => pattern.toLowerCase()),
      ]),
    ),
  };

  return {
    brand_kit: mergedBrandKit,
    visual_identity: mergedVisual,
  };
}

function isValidPalette(value: unknown): value is NonNullable<CompanyIntelligenceValidation["brand_palette"]> {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.primary === "string" &&
    typeof candidate.secondary === "string" &&
    typeof candidate.accent === "string" &&
    typeof candidate.rationale === "string"
  );
}

function inferVisualIdentity(data: WebsiteIntelligence): VisualIdentity {
  const patterns = data.visual_signals?.style_color_samples ?? [];
  const hasRounded = patterns.some((sample) => sample.includes("border-radius"));
  const hasGrid = data.discovered_pages?.some((page) =>
    page.headings.some((heading) => /platform|dashboard|system/i.test(heading)),
  );

  return {
    visual_tone: hasGrid ? "Corporate" : "Minimalist",
    design_patterns: [
      hasRounded ? "Rounded corners" : "Sharp geometry",
      hasGrid ? "Grid-based composition" : "Whitespace-led layout",
      "Hierarchy-driven information blocks",
    ],
    typography_vibes: ["Modern Sans", "Functional UI-centric"],
    color_usage:
      data.visual_signals?.theme_color != null
        ? `Theme color ${data.visual_signals.theme_color} appears as a dominant surface anchor with accents in CTAs.`
        : "Primary color likely used for major surfaces, accent color for highlights and action states.",
    style_description:
      "Visual DNA inferred from live website structure, color declarations, and composition patterns.",
  };
}

/**
 * Blends founder notes into crawl-derived intelligence before campaign execution.
 * Explicit directives override conflicting crawl messaging pillars when flagged by language cues.
 */
export function applyBrandLearning(
  intelligence: WebsiteIntelligence,
  notes: string[],
  marketing?: ProductMarketingContext,
): {
  intelligence: WebsiteIntelligence;
  marketing?: ProductMarketingContext;
  governanceDelta: GovernanceAuditEntry[];
} {
  const trimmed = notes.map((n) => n.trim()).filter(Boolean);
  const governanceDelta: GovernanceAuditEntry[] = [];
  if (trimmed.length === 0) {
    return { intelligence, marketing, governanceDelta };
  }

  const learningBlock = `\n\n### Founder brand learning (human priority)\n${trimmed.map((n) => `- ${n}`).join("\n")}`;
  const directives = trimmed.filter((n) =>
    /prefer|must|never|instead|tone:|always use|do not use|override/i.test(n),
  );
  const directiveSnippets = directives.map((d) => d.replace(/^[\-\*\d.\s]+/, "").slice(0, 160)).filter(Boolean);

  const basePillars = marketing?.messaging_pillars ?? intelligence.key_value_propositions;
  let overridden = false;
  let messagingMerged = [...basePillars];

  if (directiveSnippets.length > 0) {
    overridden = true;
    messagingMerged = [
      ...directiveSnippets,
      ...basePillars.filter(
        (p) =>
          !directiveSnippets.some((d) => p.toLowerCase().includes(d.slice(0, 22).toLowerCase())),
      ),
    ].slice(0, 12);
  }

  const nextIntel: WebsiteIntelligence = {
    ...intelligence,
    audience_summary: `${intelligence.audience_summary}${learningBlock}`,
    ...(overridden ? { key_value_propositions: messagingMerged } : {}),
  };

  let nextMarketing = marketing;
  if (marketing) {
    nextMarketing = {
      ...marketing,
      ...(overridden ? { messaging_pillars: messagingMerged } : {}),
      product_summary: `${marketing.product_summary}${learningBlock}`,
    };
  }

  governanceDelta.push(
    createGovernanceEntry({
      agent_id: "researcher",
      step_id: overridden ? "brand_learning_override" : "brand_learning_applied",
      decision: overridden
        ? "Applied founder directives over conflicting crawl-derived messaging pillars."
        : "Merged founder-supplied brand learning into discovery narrative.",
      rationale: trimmed.join("; "),
    }),
  );

  return { intelligence: nextIntel, marketing: nextMarketing, governanceDelta };
}
