/**
 * Phase 2C–2D — deterministic Heidi LinkedIn brand cards (SVG → JPEG).
 * Phase 2D: polished templates, strict public copy schema, bounded text fitting.
 */

import sharp from "sharp";

import { saveDeterministicCampaignImage } from "@/lib/services/image-generator";
import type { CampaignLinkedInPostDraft, GeneratedCampaignAsset, WorkflowState } from "@/lib/types/orbit";

/** Legacy IDs from planner / channel_post_format mapping (aliases only). */
export type LinkedInCardLegacyTemplateId =
  | "heidi_stat_card"
  | "heidi_partnership_card"
  | "heidi_brand_statement_card"
  | "heidi_report_cover_card"
  | "heidi_clinician_truth_card"
  | "heidi_customer_rollout_card"
  | "heidi_panel_card";

/** Polished renderer IDs stored on assets after Phase 2D. */
export type PolishedHeidiTemplateId =
  | "heidi_partnership_card"
  | "heidi_proof_stat_card"
  | "heidi_clinician_truth_card"
  | "heidi_brand_statement_card";

export type LinkedInCardTemplateId = LinkedInCardLegacyTemplateId | PolishedHeidiTemplateId;

/** Only these fields may appear as visible SVG copy (Phase 2D). */
export type HeidiCardCopy = {
  eyebrow?: string;
  headline: string;
  proofLine?: string;
  supportingLine?: string;
  label?: string;
  footer?: string;
};

export type HeidiVisualBriefLike = {
  prompt: string;
  negative_prompt: string;
  visual_source_anchor: string;
  visual_style_notes: string;
  visual_mode: "photo_real_editorial" | "brand_graphic";
};

const CARD_SIZE = 1080;

export const HEIDI_CARD_TOKENS = {
  yellowBright: "#FFF86B",
  yellowWarm: "#FBF582",
  cream: "#FCFAF8",
  creamPaper: "#FFF8EE",
  burgundy: "#4A1622",
  plum: "#5A1E2D",
  ink: "#28030F",
  lineBeige: "#E8DDC8",
  serifStack: "Georgia, 'Times New Roman', Times, serif",
  sansStack: "Arial, Helvetica, 'Inter', sans-serif",
} as const;

const LEN = {
  eyebrow: 38,
  headline: 56,
  proofLine: 70,
  supportingLine: 90,
  label: 24,
  footer: 32,
} as const;

const INTERNAL_PATTERN_SOURCES = [
  /\bcard\s*:/i,
  /\bimpact\s*\/\s*report/i,
  /\bcustomer\s+rollout\s+card\b/i,
  /\bconference\s*\/\s*panel\s+card\b/i,
  /\bsimple\s+brand\s+statement\s+card\b/i,
  /\bfounder\s*\/\s*doctor\b/i,
  /\bclinician\s+burnout\s+truth\s+post\b/i,
  /\bpartnership\s+announcement\s+card\b/i,
  /\bcaption\s*cadence\b/i,
  /\bchannel\s*_?format\b/i,
  /\bpost\s*_?format\b/i,
  /\bstrategic\s+insight\b/i,
  /\bsource\s+anchor\b/i,
  /\bvisual\s+style\b/i,
  /\bprompt\b/i,
  /\bcampaign\s+angle\b/i,
  /\btemplate\b/i,
  /\bschedule_day\b/i,
];

const VISUAL_LEAK_PATTERN =
  /\b(purple|pixel|arcade|neon|sci[- ]fi|relevance\s*ai|lyra|robot|mech|cybernetic|power\s*armor)\b/i;

export function escapeXml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function normalizeWs(s: string): string {
  return String(s ?? "")
    .trim()
    .replace(/\s+/g, " ")
    .replace(/^[\s`*_#>|]+|[\s`*]+$/g, "");
}

/** Prefer word boundaries — SVG fitting adds ellipsis only when geometry demands it. */
function softTruncateNoEllipsis(s: string, maxLen: number): string {
  const t = normalizeWs(s);
  if (t.length <= maxLen) return t;
  const slice = t.slice(0, maxLen + 1);
  const lastSpace = slice.lastIndexOf(" ");
  if (lastSpace >= Math.floor(maxLen * 0.55)) return slice.slice(0, lastSpace).trim();
  return slice.slice(0, maxLen).trim();
}

export function truncateWords(text: string, maxWords: number): string {
  const words = normalizeWs(text).split(" ").filter(Boolean);
  if (words.length <= maxWords) return words.join(" ");
  return `${words.slice(0, maxWords).join(" ")}…`;
}

/**
 * Greedy wrap by word to <= maxCharsPerLine; caps at maxLines.
 * Oversized tokens are hard-split; surplus words collapse into an ellipsis on the last line.
 */
export function wrapWordsToLines(text: string, maxCharsPerLine: number, maxLines: number): string[] {
  const words = normalizeWs(text).split(" ").filter(Boolean);
  if (words.length === 0 || maxLines < 1) return [];
  const cap = Math.max(4, maxCharsPerLine);
  const lines: string[] = [];
  let wordIdx = 0;

  while (wordIdx < words.length && lines.length < maxLines) {
    const lineWords: string[] = [];
    let lineLen = 0;

    while (wordIdx < words.length) {
      const w = words[wordIdx]!;
      if (w.length > cap) {
        if (lineWords.length) break;
        const sliceLen = lines.length === maxLines - 1 ? cap - 1 : cap;
        lines.push(`${w.slice(0, sliceLen).trimEnd()}…`);
        wordIdx += 1;
        lineLen = 0;
        break;
      }
      const add = lineWords.length ? 1 + w.length : w.length;
      if (lineLen + add <= cap) {
        lineWords.push(w);
        lineLen += add;
        wordIdx += 1;
      } else break;
    }

    if (lineWords.length) lines.push(lineWords.join(" "));
  }

  if (wordIdx < words.length && lines.length > 0) {
    const last = lines[lines.length - 1]!;
    if (!last.endsWith("…")) {
      lines[lines.length - 1] = `${last.slice(0, Math.max(1, cap - 1)).trimEnd()}…`;
    }
  }

  return lines.slice(0, maxLines);
}

function substringPresent(fragment: string, trustedBlob: string): boolean {
  const f = normalizeWs(fragment).toLowerCase();
  if (f.length < 2) return true;
  return normalizeWs(trustedBlob).toLowerCase().includes(f);
}

export function sanitizeCardText(raw: string, trustedBlob: string, maxWords: number): string {
  let t = normalizeWs(raw);
  if (!t) return "";
  const stripPercent = (m: string) => (substringPresent(m, trustedBlob) ? m : "");
  t = t.replace(/\b\d{1,3}(?:\.\d+)?%/g, stripPercent);
  t = t.replace(/\b\d+(?:\.\d+)?\s*(hours?|hrs)\b/gi, (m) => (substringPresent(m, trustedBlob) ? m : ""));
  t = t.replace(/\b\d+\s*minutes?\b/gi, (m) => (substringPresent(m, trustedBlob) ? m : ""));
  t = normalizeWs(t.replace(/\s+/g, " "));
  return truncateWords(t, maxWords);
}

export function extractRiskyNumericClaims(text: string): string[] {
  const hits = new Set<string>();
  const lower = text.toLowerCase();
  const push = (s: string | undefined) => {
    if (s?.trim()) hits.add(s.trim());
  };
  lower.match(/\b\d{1,3}(?:\.\d+)?%/g)?.forEach((p) => push(p));
  lower.match(/\b\d+(?:\.\d+)?\s*(hours?|hrs)\b/g)?.forEach((h) => push(h));
  lower.match(/\b\d+\s*minutes?\b/g)?.forEach((m) => push(m));
  return [...hits];
}

function stripDayLabels(text: string): string {
  return normalizeWs(text.replace(/\bday\s*\d+\b[:,]?\s*/gi, ""));
}

function looksInternalOrInstruction(text: string): boolean {
  const t = text.trim();
  if (!t) return true;
  if (INTERNAL_PATTERN_SOURCES.some((re) => re.test(t))) return true;
  if (/^\s*[\-_•]+\s*$/.test(t)) return true;
  return false;
}

function stripMarkdownNoise(text: string): string {
  return normalizeWs(text.replace(/\*\*|`|#/g, "").replace(/\[(.*?)]\([^)]*\)/g, "$1"));
}

/** Phase 2D — only public-facing strings; strips meta/template leakage. */
export function sanitizePublicCardCopy(input: Partial<HeidiCardCopy>, trustedBlob: string): HeidiCardCopy {
  const clean = (field: keyof HeidiCardCopy, raw: string | undefined, maxLen: number): string => {
    let s = stripMarkdownNoise(stripDayLabels(normalizeWs(raw ?? "")));
    if (looksInternalOrInstruction(s)) {
      return "";
    }
    if (VISUAL_LEAK_PATTERN.test(s)) {
      s = s.replace(VISUAL_LEAK_PATTERN, "").trim();
    }
    s = sanitizeCardText(s, trustedBlob, 48);
    if (s.length > maxLen) s = softTruncateNoEllipsis(s, maxLen);
    return s;
  };

  let headline = clean("headline", input.headline, LEN.headline);
  let eyebrow = input.eyebrow ? clean("eyebrow", input.eyebrow, LEN.eyebrow) : "";
  let proofLine = input.proofLine ? clean("proofLine", input.proofLine, LEN.proofLine) : "";
  let supportingLine = input.supportingLine ? clean("supportingLine", input.supportingLine, LEN.supportingLine) : "";
  let label = input.label ? clean("label", input.label, LEN.label) : "";
  let footer = input.footer ? clean("footer", input.footer, LEN.footer) : "";

  /* Numeric grounding */
  for (const token of extractRiskyNumericClaims(`${headline} ${proofLine} ${supportingLine}`)) {
    if (!substringPresent(token, trustedBlob)) {
      headline = headline.replace(token, "").trim();
      proofLine = proofLine.replace(token, "").trim();
      supportingLine = supportingLine.replace(token, "").trim();
    }
  }

  headline = normalizeWs(headline).slice(0, LEN.headline);
  proofLine = normalizeWs(proofLine).slice(0, LEN.proofLine);
  supportingLine = normalizeWs(supportingLine).slice(0, LEN.supportingLine);

  return {
    ...(eyebrow ? { eyebrow } : {}),
    headline,
    ...(proofLine ? { proofLine } : {}),
    ...(supportingLine ? { supportingLine } : {}),
    ...(label ? { label } : {}),
    ...(footer ? { footer } : {}),
  };
}

function fallbackCopy(template: PolishedHeidiTemplateId): HeidiCardCopy {
  switch (template) {
    case "heidi_partnership_card":
      return {
        headline: "Partnership built for calmer care",
        proofLine: "Clinical workflows · calmly scaled",
        label: "Partnership",
        footer: "Heidi Health",
      };
    case "heidi_proof_stat_card":
      return {
        headline: "Capacity returned to care",
        proofLine: "Less after-hours paperwork",
        supportingLine: "More time with patients",
        label: "Proof",
        footer: "Heidi Health",
      };
    case "heidi_clinician_truth_card":
      return {
        headline: "Documentation steals time from care",
        proofLine: "Capacity returned to patient-facing work",
        label: "Clinician insight",
        footer: "Heidi Health",
      };
    case "heidi_brand_statement_card":
      return {
        headline: "Your AI care partner",
        supportingLine: "Grounded in clinical workflow",
        label: "Brand",
        footer: "Heidi Health",
      };
    default:
      return { headline: "Heidi Health", label: "Brand", footer: "Heidi Health" };
  }
}

function ensureCopyComplete(copy: HeidiCardCopy, template: PolishedHeidiTemplateId): HeidiCardCopy {
  const fb = fallbackCopy(template);
  const out: HeidiCardCopy = {
    headline: copy.headline?.trim() || fb.headline,
    ...(copy.eyebrow ? { eyebrow: copy.eyebrow } : fb.eyebrow ? { eyebrow: fb.eyebrow } : {}),
    ...(copy.proofLine || fb.proofLine ?
      { proofLine: copy.proofLine?.trim() || fb.proofLine }
    : {}),
    ...(copy.supportingLine || fb.supportingLine ?
      { supportingLine: copy.supportingLine?.trim() || fb.supportingLine }
    : {}),
    label: copy.label?.trim() || fb.label,
    footer: copy.footer?.trim() || fb.footer || "Heidi Health",
  };
  return out;
}

/** First sentence under maxLen chars from plain marketing prose only. */
function extractPublicSentence(raw: string | undefined, trustedBlob: string, maxLen: number): string {
  if (!raw?.trim()) return "";
  const stripped = stripMarkdownNoise(raw.replace(/\n+/g, " "));
  if (looksInternalOrInstruction(stripped)) return "";
  const one = stripped.split(/(?<=[.!?])\s+/)[0]?.trim() ?? stripped;
  const cleaned = sanitizeCardText(one, trustedBlob, 40);
  return cleaned.length > maxLen ? softTruncateNoEllipsis(cleaned, maxLen) : cleaned;
}

export function mapHeidiPostFormatToLegacyTemplate(channelPostFormat?: string): LinkedInCardLegacyTemplateId {
  const fmt = String(channelPostFormat ?? "").trim().toLowerCase();
  switch (fmt) {
    case "impact_report_stat_card":
      return "heidi_stat_card";
    case "partnership_announcement_card":
      return "heidi_partnership_card";
    case "simple_brand_statement_card":
      return "heidi_brand_statement_card";
    case "founder_or_doctor_recognition_card":
      return "heidi_report_cover_card";
    case "clinician_burnout_truth_post":
      return "heidi_clinician_truth_card";
    case "customer_rollout_card":
      return "heidi_customer_rollout_card";
    case "conference_panel_card":
      return "heidi_panel_card";
    default:
      return "heidi_stat_card";
  }
}

/** Maps legacy Phase 2C IDs → polished Phase 2D templates. */
export function mapLegacyTemplateToPolished(legacy: LinkedInCardLegacyTemplateId): PolishedHeidiTemplateId {
  switch (legacy) {
    case "heidi_partnership_card":
    case "heidi_customer_rollout_card":
      return "heidi_partnership_card";
    case "heidi_clinician_truth_card":
      return "heidi_clinician_truth_card";
    case "heidi_brand_statement_card":
      return "heidi_brand_statement_card";
    case "heidi_panel_card":
      return "heidi_clinician_truth_card";
    case "heidi_stat_card":
    case "heidi_report_cover_card":
    default:
      return "heidi_proof_stat_card";
  }
}

export function buildTrustedEvidenceBlob(workflow: WorkflowState, draft: CampaignLinkedInPostDraft): string {
  const parts = [
    draft.headline,
    draft.body,
    draft.meta.extracted_fact,
    draft.meta.source_anchor,
    draft.meta.strategic_insight,
    draft.meta.content_angle,
    draft.meta.campaign_angle,
    ...(workflow.brand_learning_notes ?? []),
    workflow.website_intelligence?.social_proof?.join(" ") ?? "",
    workflow.product_marketing_context?.messaging_pillars?.join(" ") ?? "",
  ];
  return parts.filter(Boolean).join("\n");
}

function labelForPolishedTemplate(id: PolishedHeidiTemplateId): string {
  switch (id) {
    case "heidi_partnership_card":
      return "Partnership";
    case "heidi_proof_stat_card":
      return "Proof";
    case "heidi_clinician_truth_card":
      return "Clinician insight";
    case "heidi_brand_statement_card":
      return "Brand";
    default:
      return "";
  }
}

/** Builds public card fields from draft — never uses strategic_insight/format scaffolding as visible copy. */
export function buildHeidiCardCopyFromDraft(
  workflow: WorkflowState,
  draft: CampaignLinkedInPostDraft,
  polishedTemplateId: PolishedHeidiTemplateId,
): HeidiCardCopy {
  const trusted = buildTrustedEvidenceBlob(workflow, draft);
  const company =
    workflow.website_intelligence?.company_name ?? workflow.brand_kit?.brand_name ?? "Heidi Health";

  const headlineRaw = stripDayLabels(draft.headline || "");
  const headline = sanitizeCardText(headlineRaw, trusted, 14).slice(0, LEN.headline);

  let proofLine = "";
  const ef = draft.meta.extracted_fact ?? "";
  if (ef && !looksInternalOrInstruction(ef)) {
    proofLine = extractPublicSentence(ef, trusted, LEN.proofLine);
  }
  if (!proofLine && draft.body) {
    proofLine = extractPublicSentence(draft.body, trusted, LEN.proofLine);
  }

  let supportingLine = "";
  if (draft.body) {
    const sentences = stripMarkdownNoise(draft.body.replace(/\n+/g, " "))
      .split(/(?<=[.!?])\s+/)
      .map((s) => s.trim())
      .filter(Boolean);
    supportingLine =
      sentences.length > 1 ?
        extractPublicSentence(sentences.slice(1).join(" "), trusted, LEN.supportingLine)
      : "";
  }

  let eyebrow: string | undefined =
    polishedTemplateId === "heidi_partnership_card" ?
      `${truncateWords(company.replace(/\s+(Inc\.?|LLC)$/i, ""), 3)} · Operators`
    : undefined;

  const label = labelForPolishedTemplate(polishedTemplateId);

  const draftCopy: HeidiCardCopy = {
    ...(eyebrow ? { eyebrow } : {}),
    headline: headline || fallbackCopy(polishedTemplateId).headline,
    ...(proofLine ? { proofLine } : {}),
    ...(supportingLine ? { supportingLine } : {}),
    label,
    footer: truncateWords(company, 4),
  };

  const sanitized = sanitizePublicCardCopy(draftCopy, trusted);
  return ensureCopyComplete(sanitized, polishedTemplateId);
}

/** Validates assembled copy; emits warnings and replaces offending slices with fallbacks. */
export function validateAndHardenPublicCopy(
  copy: HeidiCardCopy,
  template: PolishedHeidiTemplateId,
  trustedBlob: string,
): { copy: HeidiCardCopy; warnings: string[] } {
  const warnings: string[] = [];
  const blob = `${copy.headline}\n${copy.eyebrow ?? ""}\n${copy.proofLine ?? ""}\n${copy.supportingLine ?? ""}\n${copy.label ?? ""}\n${copy.footer ?? ""}`;
  const forbiddenMetaLeak =
    INTERNAL_PATTERN_SOURCES.some((re) => re.test(blob)) ||
    /\bcard\s*:/i.test(blob) ||
    /\b(?:channel|post|visual)\s+format\b/i.test(blob) ||
    /\bformat\s+description\b/i.test(blob);
  if (forbiddenMetaLeak) warnings.push("Internal/template phrase detected — applying fallback fields.");
  const risky = extractRiskyNumericClaims(blob);
  for (const r of risky) {
    if (!substringPresent(r, trustedBlob)) warnings.push(`Unsupported numeric removed: ${r}`);
  }
  if (VISUAL_LEAK_PATTERN.test(blob)) warnings.push("Cross-brand wording stripped.");

  let next = sanitizePublicCardCopy(copy, trustedBlob);
  next = ensureCopyComplete(next, template);
  if (forbiddenMetaLeak || risky.some((r) => !substringPresent(r, trustedBlob))) {
    const fb = fallbackCopy(template);
    next = ensureCopyComplete(
      {
        headline: next.headline && !looksInternalOrInstruction(next.headline) ? next.headline : fb.headline,
        ...(next.eyebrow && !looksInternalOrInstruction(next.eyebrow) ? { eyebrow: next.eyebrow } : {}),
        proofLine:
          next.proofLine && !looksInternalOrInstruction(next.proofLine) ? next.proofLine : fb.proofLine,
        supportingLine:
          next.supportingLine && !looksInternalOrInstruction(next.supportingLine) ?
            next.supportingLine
          : fb.supportingLine,
        label:
          next.label && !looksInternalOrInstruction(next.label) ? next.label : (fb.label ?? next.label),
        footer: next.footer || fb.footer || "Heidi Health",
      },
      template,
    );
  }
  return { copy: next, warnings };
}

function svgBoilerplate(inner: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${CARD_SIZE}" height="${CARD_SIZE}" viewBox="0 0 ${CARD_SIZE} ${CARD_SIZE}">${inner}</svg>`;
}

type TextFitOpts = {
  x: number;
  yTop: number;
  width: number;
  maxLines: number;
  maxFontSize: number;
  minFontSize: number;
  lineHeightMul: number;
  fill: string;
  weight: number;
  anchor: "start" | "middle" | "end";
  font: "serif" | "sans";
  /** Inclusive vertical bound (SVG y) — text baseline + descenders must stay below this. */
  maxBottom?: number;
};

/** Approximate avg char width factor for wrapping (deterministic heuristic). */
function charWidthFactor(font: "serif" | "sans"): number {
  return font === "sans" ? 0.52 : 0.5;
}

/** Fits text into horizontal wrap + optional vertical bound by shrinking font deterministically. */
function renderTextBlockFit(text: string, opts: TextFitOpts): string {
  const raw = normalizeWs(text);
  if (!raw) return "";
  const fontFamily =
    opts.font === "sans" ? HEIDI_CARD_TOKENS.sansStack : HEIDI_CARD_TOKENS.serifStack;
  let fontSize = opts.maxFontSize;
  let lines: string[] = [];

  while (fontSize >= opts.minFontSize) {
    const cpl = Math.max(6, Math.floor(opts.width / (fontSize * charWidthFactor(opts.font))));
    lines = wrapWordsToLines(raw, cpl, opts.maxLines);
    const lh = fontSize * opts.lineHeightMul;
    const bottom =
      opts.yTop + fontSize + Math.max(0, lines.length - 1) * lh + fontSize * 0.28;
    const fitsVert = opts.maxBottom === undefined || bottom <= opts.maxBottom;
    const fitsLines = lines.length <= opts.maxLines && lines.length > 0;
    if (fitsLines && fitsVert) break;
    fontSize -= 2;
  }

  if (!lines.length) {
    lines = [raw.slice(0, Math.min(raw.length, 32))];
    fontSize = opts.minFontSize;
  }

  const lh = fontSize * opts.lineHeightMul;
  const anchor = opts.anchor;
  const parts = lines.map((line, i) => {
    const y = opts.yTop + fontSize + i * lh;
    return `<tspan x="${opts.x}" y="${y}">${escapeXml(line)}</tspan>`;
  });
  return `<text font-family="${escapeXml(fontFamily)}" font-size="${fontSize}" font-weight="${opts.weight}" fill="${opts.fill}" text-anchor="${anchor}">${parts.join("")}</text>`;
}

function minimalLoopMotif(cx: number, cy: number): string {
  const ink = HEIDI_CARD_TOKENS.ink;
  return `<g opacity="0.18">${["0,-20", "18,10", "-18,10"]
    .map(
      (off, i) =>
        `<circle cx="${cx + Number(off.split(",")[0])}" cy="${cy + Number(off.split(",")[1])}" r="14" fill="none" stroke="${ink}" stroke-width="5"/>`,
    )
    .join("")}</g>`;
}

function svgPartnership(copy: HeidiCardCopy): string {
  const cx = CARD_SIZE / 2;
  const headline = copy.headline;
  const eyebrow = copy.eyebrow ?? "";
  const proof = copy.proofLine ?? "";
  const supporting = copy.supportingLine?.trim() ?? "";
  return svgBoilerplate(`
    <rect width="${CARD_SIZE}" height="${CARD_SIZE}" fill="${HEIDI_CARD_TOKENS.yellowBright}"/>
    ${eyebrow ?
      renderTextBlockFit(eyebrow, {
        x: cx,
        yTop: 52,
        width: 920,
        maxLines: 1,
        maxFontSize: 22,
        minFontSize: 18,
        lineHeightMul: 1.2,
        fill: HEIDI_CARD_TOKENS.ink,
        weight: 600,
        anchor: "middle",
        font: "sans",
        maxBottom: 112,
      })
    : ""}
    <rect x="${cx - 118}" y="118" width="236" height="50" rx="25" fill="${HEIDI_CARD_TOKENS.ink}"/>
    <text x="${cx}" y="154" font-family="${escapeXml(HEIDI_CARD_TOKENS.sansStack)}" font-size="26" font-weight="600" fill="${HEIDI_CARD_TOKENS.cream}" text-anchor="middle">${escapeXml(copy.label ?? "Partnership")}</text>
    ${renderTextBlockFit(headline, {
      x: cx,
      yTop: 228,
      width: 920,
      maxLines: 2,
      maxFontSize: 52,
      minFontSize: 30,
      lineHeightMul: 1.22,
      fill: HEIDI_CARD_TOKENS.burgundy,
      weight: 700,
      anchor: "middle",
      font: "serif",
      maxBottom: 532,
    })}
    ${proof ?
      renderTextBlockFit(proof, {
        x: cx,
        yTop: 548,
        width: 880,
        maxLines: supporting ? 2 : 3,
        maxFontSize: 28,
        minFontSize: 18,
        lineHeightMul: 1.25,
        fill: HEIDI_CARD_TOKENS.plum,
        weight: 600,
        anchor: "middle",
        font: "serif",
        maxBottom: supporting ? 760 : 988,
      })
    : ""}
    ${supporting ?
      renderTextBlockFit(supporting, {
        x: cx,
        yTop: proof ? 788 : 548,
        width: 840,
        maxLines: 2,
        maxFontSize: 24,
        minFontSize: 17,
        lineHeightMul: 1.28,
        fill: HEIDI_CARD_TOKENS.plum,
        weight: 600,
        anchor: "middle",
        font: "serif",
        maxBottom: 988,
      })
    : ""}
    ${renderTextBlockFit(copy.footer ?? "Heidi Health", {
      x: cx,
      yTop: 1018,
      width: 600,
      maxLines: 1,
      maxFontSize: 22,
      minFontSize: 16,
      lineHeightMul: 1.2,
      fill: HEIDI_CARD_TOKENS.ink,
      weight: 600,
      anchor: "middle",
      font: "sans",
      maxBottom: 1074,
    })}
  `);
}

function svgProofStat(copy: HeidiCardCopy): string {
  const leftW = Math.round(CARD_SIZE * 0.38);
  const gutter = 48;
  const rightX = leftW + 32;
  const rightW = CARD_SIZE - rightX - gutter;
  const proof = copy.proofLine?.trim() ?? "";
  const support = copy.supportingLine?.trim() ?? "";
  const proofFallback = "Less paperwork · More patient-facing time · Calm clinical proof";
  const proofPaint = proof || (!support ? proofFallback : "");
  return svgBoilerplate(`
    <rect width="${CARD_SIZE}" height="${CARD_SIZE}" fill="${HEIDI_CARD_TOKENS.creamPaper}"/>
    <rect x="0" y="0" width="${leftW}" height="${CARD_SIZE}" fill="${HEIDI_CARD_TOKENS.yellowBright}"/>
    <rect x="${leftW}" y="0" width="14" height="${CARD_SIZE}" fill="${HEIDI_CARD_TOKENS.lineBeige}"/>
    ${renderTextBlockFit(copy.headline, {
      x: gutter,
      yTop: 128,
      width: leftW - gutter * 2,
      maxLines: 4,
      maxFontSize: 38,
      minFontSize: 22,
      lineHeightMul: 1.22,
      fill: HEIDI_CARD_TOKENS.ink,
      weight: 700,
      anchor: "start",
      font: "serif",
      maxBottom: 1036,
    })}
    ${renderTextBlockFit(copy.label ?? "Proof", {
      x: rightX,
      yTop: 92,
      width: rightW,
      maxLines: 1,
      maxFontSize: 20,
      minFontSize: 16,
      lineHeightMul: 1.2,
      fill: HEIDI_CARD_TOKENS.ink,
      weight: 700,
      anchor: "start",
      font: "sans",
      maxBottom: 132,
    })}
    ${proofPaint ?
      renderTextBlockFit(proofPaint, {
        x: rightX,
        yTop: 168,
        width: rightW,
        maxLines: 3,
        maxFontSize: 28,
        minFontSize: 20,
        lineHeightMul: 1.28,
        fill: HEIDI_CARD_TOKENS.burgundy,
        weight: 600,
        anchor: "start",
        font: "serif",
        maxBottom: proof && support ? 520 : 988,
      })
    : ""}
    ${support ?
      renderTextBlockFit(support, {
        x: rightX,
        yTop: proof ? 548 : 168,
        width: rightW,
        maxLines: 3,
        maxFontSize: 26,
        minFontSize: 18,
        lineHeightMul: 1.28,
        fill: HEIDI_CARD_TOKENS.plum,
        weight: 600,
        anchor: "start",
        font: "serif",
        maxBottom: 988,
      })
    : ""}
    ${renderTextBlockFit(copy.footer ?? "Heidi Health", {
      x: rightX,
      yTop: 1018,
      width: rightW,
      maxLines: 1,
      maxFontSize: 22,
      minFontSize: 16,
      lineHeightMul: 1.2,
      fill: HEIDI_CARD_TOKENS.ink,
      weight: 600,
      anchor: "start",
      font: "sans",
      maxBottom: 1074,
    })}
  `);
}

function svgClinicianTruth(copy: HeidiCardCopy): string {
  const bandY = 700;
  const bandH = CARD_SIZE - bandY;
  const headlineBottomCap = copy.supportingLine?.trim() ? 372 : 648;
  return svgBoilerplate(`
    <rect width="${CARD_SIZE}" height="${CARD_SIZE}" fill="${HEIDI_CARD_TOKENS.cream}"/>
    ${renderTextBlockFit(copy.headline, {
      x: CARD_SIZE / 2,
      yTop: 108,
      width: 936,
      maxLines: 3,
      maxFontSize: 44,
      minFontSize: 26,
      lineHeightMul: 1.22,
      fill: HEIDI_CARD_TOKENS.ink,
      weight: 700,
      anchor: "middle",
      font: "serif",
      maxBottom: headlineBottomCap,
    })}
    ${copy.supportingLine ?
      renderTextBlockFit(copy.supportingLine, {
        x: CARD_SIZE / 2,
        yTop: 392,
        width: 880,
        maxLines: 2,
        maxFontSize: 26,
        minFontSize: 18,
        lineHeightMul: 1.25,
        fill: HEIDI_CARD_TOKENS.plum,
        weight: 600,
        anchor: "middle",
        font: "serif",
        maxBottom: 668,
      })
    : ""}
    <rect x="0" y="${bandY}" width="${CARD_SIZE}" height="${bandH}" fill="${HEIDI_CARD_TOKENS.yellowBright}"/>
    ${renderTextBlockFit(copy.proofLine ?? copy.headline, {
      x: CARD_SIZE / 2,
      yTop: bandY + 56,
      width: 920,
      maxLines: 2,
      maxFontSize: 30,
      minFontSize: 22,
      lineHeightMul: 1.28,
      fill: HEIDI_CARD_TOKENS.burgundy,
      weight: 700,
      anchor: "middle",
      font: "serif",
      maxBottom: 1068,
    })}
    ${renderTextBlockFit(copy.footer ?? "Heidi Health", {
      x: 72,
      yTop: 1028,
      width: 400,
      maxLines: 1,
      maxFontSize: 22,
      minFontSize: 16,
      lineHeightMul: 1.2,
      fill: HEIDI_CARD_TOKENS.ink,
      weight: 600,
      anchor: "start",
      font: "sans",
      maxBottom: 1074,
    })}
  `);
}

function svgBrandStatement(copy: HeidiCardCopy): string {
  const cx = CARD_SIZE / 2;
  return svgBoilerplate(`
    <rect width="${CARD_SIZE}" height="${CARD_SIZE}" fill="${HEIDI_CARD_TOKENS.creamPaper}"/>
    ${minimalLoopMotif(cx, 860)}
    ${renderTextBlockFit(copy.headline, {
      x: cx,
      yTop: 292,
      width: 920,
      maxLines: 2,
      maxFontSize: 52,
      minFontSize: 32,
      lineHeightMul: 1.2,
      fill: HEIDI_CARD_TOKENS.burgundy,
      weight: 700,
      anchor: "middle",
      font: "serif",
      maxBottom: 508,
    })}
    ${renderTextBlockFit(copy.supportingLine ?? copy.proofLine ?? "", {
      x: cx,
      yTop: 524,
      width: 880,
      maxLines: 3,
      maxFontSize: 28,
      minFontSize: 20,
      lineHeightMul: 1.28,
      fill: HEIDI_CARD_TOKENS.plum,
      weight: 600,
      anchor: "middle",
      font: "serif",
      maxBottom: 932,
    })}
    ${renderTextBlockFit(copy.footer ?? "Heidi Health", {
      x: cx,
      yTop: 1018,
      width: 560,
      maxLines: 1,
      maxFontSize: 24,
      minFontSize: 16,
      lineHeightMul: 1.2,
      fill: HEIDI_CARD_TOKENS.ink,
      weight: 600,
      anchor: "middle",
      font: "sans",
      maxBottom: 1074,
    })}
  `);
}

function renderPolishedSvg(template: PolishedHeidiTemplateId, copy: HeidiCardCopy): string {
  switch (template) {
    case "heidi_partnership_card":
      return svgPartnership(copy);
    case "heidi_proof_stat_card":
      return svgProofStat(copy);
    case "heidi_clinician_truth_card":
      return svgClinicianTruth(copy);
    case "heidi_brand_statement_card":
      return svgBrandStatement(copy);
    default:
      return svgProofStat(copy);
  }
}

export function heidiCardCopyToFlatSummary(copy: HeidiCardCopy): string {
  return [
    copy.eyebrow,
    copy.headline,
    copy.proofLine,
    copy.supportingLine,
    copy.label,
    copy.footer,
  ]
    .filter(Boolean)
    .join("\n");
}

export async function renderHeidiPolishedDeterministicCard(args: {
  copy: HeidiCardCopy;
  polishedTemplateId: PolishedHeidiTemplateId;
  legacyTemplateId: LinkedInCardLegacyTemplateId;
  channelPostFormat?: string;
  companyName: string;
  warnings: string[];
}): Promise<{
  image_url: string;
  local_path?: string;
  rendering_method: "deterministic_svg_template";
  template_id: PolishedHeidiTemplateId;
  full_prompt: string;
}> {
  const svg = renderPolishedSvg(args.polishedTemplateId, args.copy);
  const jpegBuffer = await sharp(Buffer.from(svg, "utf-8"))
    .resize(CARD_SIZE, CARD_SIZE)
    .jpeg({ quality: 93, mozjpeg: true })
    .toBuffer();

  const saved = await saveDeterministicCampaignImage(jpegBuffer);
  const summary = heidiCardCopyToFlatSummary(args.copy);
  const full_prompt = [
    "DETERMINISTIC HEIDI LINKEDIN CARD (Phase 2D polished)",
    `polished_template_id: ${args.polishedTemplateId}`,
    `legacy_channel_template_hint: ${args.legacyTemplateId}`,
    `channel_post_format: ${args.channelPostFormat ?? "—"}`,
    `companyName: ${args.companyName}`,
    ...(args.warnings.length ? [`render_warnings: ${args.warnings.join(" | ")}`] : []),
    "--- Public card copy ---",
    summary,
  ].join("\n");

  return {
    image_url: saved.image_url,
    local_path: saved.relative_public_path,
    rendering_method: "deterministic_svg_template",
    template_id: args.polishedTemplateId,
    full_prompt,
  };
}

export async function renderHeidiDeterministicLinkedInCardForWorkflow(args: {
  workflow: WorkflowState;
  draft: CampaignLinkedInPostDraft;
  visualBrief: HeidiVisualBriefLike;
  profileId: string;
}): Promise<{ asset: GeneratedCampaignAsset; deterministic_visible_copy: string }> {
  const { workflow, draft, visualBrief, profileId } = args;
  const trusted = buildTrustedEvidenceBlob(workflow, draft);
  const companyName =
    workflow.website_intelligence?.company_name ?? workflow.brand_kit?.brand_name ?? "Heidi Health";

  const legacyId = mapHeidiPostFormatToLegacyTemplate(draft.meta.channel_post_format);
  const polishedId = mapLegacyTemplateToPolished(legacyId);

  let cardCopy = buildHeidiCardCopyFromDraft(workflow, draft, polishedId);
  const hardened = validateAndHardenPublicCopy(cardCopy, polishedId, trusted);
  cardCopy = hardened.copy;
  const allWarnings = hardened.warnings;

  const rendered = await renderHeidiPolishedDeterministicCard({
    copy: cardCopy,
    polishedTemplateId: polishedId,
    legacyTemplateId: legacyId,
    channelPostFormat: draft.meta.channel_post_format,
    companyName,
    warnings: allWarnings,
  });

  const deterministic_visible_copy = JSON.stringify(cardCopy);
  const compactRule = `${visualBrief.prompt.slice(0, 120)}…`;

  const asset: GeneratedCampaignAsset = {
    id: crypto.randomUUID(),
    draft_type: draft.type,
    platform: "linkedin",
    day: draft.meta.day,
    prompt: rendered.full_prompt,
    image_prompt_detailed: rendered.full_prompt,
    negative_prompt: visualBrief.negative_prompt,
    visual_source_anchor: visualBrief.visual_source_anchor,
    visual_style_notes:
      "Deterministic Heidi LinkedIn template (Phase 2D) — polished layout; bounded public copy only.",
    visual_mode: "brand_template",
    rendering_method: rendered.rendering_method,
    template_id: rendered.template_id,
    source_draft_id: draft.meta.id,
    channel_visual_profile_id: profileId,
    channel_visual_prompt_rule: compactRule,
    channel_style_match_reason: `Phase 2D polished ${polishedId} (legacy map ${legacyId}) for channel_post_format ${String(draft.meta.channel_post_format ?? "")}.`,
    image_url: rendered.image_url,
    deterministic_visible_copy,
    deterministic_card_copy: {
      eyebrow: cardCopy.eyebrow,
      headline: cardCopy.headline,
      proof_line: cardCopy.proofLine,
      supporting_line: cardCopy.supportingLine,
      label: cardCopy.label,
      footer: cardCopy.footer,
    },
    deterministic_render_warnings: allWarnings.length ? allWarnings : undefined,
    local_path: rendered.local_path,
    created_at: new Date().toISOString(),
  };

  return { asset, deterministic_visible_copy };
}

const INTERNAL_SCAN_RE =
  /\bcard\s*:|customer\s+rollout\s+card|conference\s*\/\s*panel\s+card|simple\s+brand\s+statement\s+card|impact\s*\/\s*report/i;

/** Phase 2D telemetry for `/report`. */
export function computePhase2dRendererTelemetry(workflow: {
  generated_campaign_assets: GeneratedCampaignAsset[];
}): {
  deterministicCardsRendered: number;
  polishedTemplateCounts: Record<string, number>;
  renderWarningsTotal: number;
  internalPhraseLeakHits: number;
  unsupportedNumericHints: number;
} {
  let deterministicCardsRendered = 0;
  const polishedTemplateCounts: Record<string, number> = {};
  let renderWarningsTotal = 0;
  let internalPhraseLeakHits = 0;
  let unsupportedNumericHints = 0;

  for (const a of workflow.generated_campaign_assets) {
    if (a.rendering_method !== "deterministic_svg_template" || a.platform !== "linkedin") continue;
    deterministicCardsRendered += 1;
    const tid = a.template_id ?? "unknown";
    polishedTemplateCounts[tid] = (polishedTemplateCounts[tid] ?? 0) + 1;
    const warns = a.deterministic_render_warnings ?? [];
    renderWarningsTotal += warns.length;

    let scanBlob = "";
    if (a.deterministic_card_copy) {
      scanBlob = Object.values(a.deterministic_card_copy).filter(Boolean).join("\n");
    } else if (a.deterministic_visible_copy?.startsWith("{")) {
      try {
        const o = JSON.parse(a.deterministic_visible_copy) as Record<string, string>;
        scanBlob = Object.values(o).join("\n");
      } catch {
        scanBlob = a.deterministic_visible_copy;
      }
    } else {
      scanBlob = a.deterministic_visible_copy ?? "";
    }

    if (INTERNAL_SCAN_RE.test(scanBlob)) internalPhraseLeakHits += 1;
    unsupportedNumericHints += extractRiskyNumericClaims(scanBlob).length;
  }

  return {
    deterministicCardsRendered,
    polishedTemplateCounts,
    renderWarningsTotal,
    internalPhraseLeakHits,
    unsupportedNumericHints,
  };
}

/** Phase 2C telemetry — unchanged counting semantics for methods/templates. */
export function computePhase2cRenderingTelemetry(workflow: {
  generated_campaign_assets: GeneratedCampaignAsset[];
}): {
  methodCounts: Record<string, number>;
  templateCounts: Record<string, number>;
  placeholderCount: number;
  deterministicRiskyNumericTokenCount: number;
  linkedInDeterministicCount: number;
} {
  const methodCounts: Record<string, number> = {};
  const templateCounts: Record<string, number> = {};
  let placeholderCount = 0;
  let deterministicRiskyNumericTokenCount = 0;
  let linkedInDeterministicCount = 0;

  for (const a of workflow.generated_campaign_assets) {
    const isPlaceholder = a.image_url.includes("placeholder-brand-motif");
    const method =
      a.rendering_method ?? (isPlaceholder ? "placeholder" : "openai_image");
    methodCounts[method] = (methodCounts[method] ?? 0) + 1;
    if (a.template_id) {
      templateCounts[a.template_id] = (templateCounts[a.template_id] ?? 0) + 1;
    }
    if (isPlaceholder) placeholderCount += 1;
    if (a.rendering_method === "deterministic_svg_template" && a.platform === "linkedin") {
      linkedInDeterministicCount += 1;
      const blob =
        a.deterministic_visible_copy ?
          a.deterministic_visible_copy
        : JSON.stringify(a.deterministic_card_copy ?? {});
      deterministicRiskyNumericTokenCount += extractRiskyNumericClaims(blob).length;
    }
  }

  return {
    methodCounts,
    templateCounts,
    placeholderCount,
    deterministicRiskyNumericTokenCount,
    linkedInDeterministicCount,
  };
}

/* Back-compat export name for channel code that referenced mapHeidiPostFormatToTemplate */
export const mapHeidiPostFormatToTemplate = mapHeidiPostFormatToLegacyTemplate;
