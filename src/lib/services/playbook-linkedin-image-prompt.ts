/**
 * Phase 2E / 2F — LinkedIn playbook-aligned GPT image prompts + safe visible text contracts.
 * Phase 2F uses a distilled visual brief only (full playbook MD is never injected into image prompts).
 */

import { LINKEDIN_PLAYBOOK_PROFILE } from "@/lib/services/channel-playbook-loader";
import {
  buildTrustedEvidenceBlob,
  extractRiskyNumericClaims,
} from "@/lib/services/linkedin-card-renderer";
import { DEFAULT_OPENAI_IMAGE_MODEL } from "@/lib/services/image-generator";
import type { CampaignLinkedInPostDraft, LinkedInChannelIntelligence, WorkflowState } from "@/lib/types/orbit";

export type LinkedInVisibleTextContract = {
  headline: string;
  /** Tiny badge (Relevance); Heidi Phase 2F prefers proof_line instead. */
  label?: string;
  /** Short supporting line (Heidi Phase 2F). */
  proof_line?: string;
  footer?: string;
};

export type DistilledLinkedInVisualBrief = {
  positiveBrief: string;
  negativeBrief: string;
  visibleTextRules: string;
  colorRules: string;
  compositionRules: string;
};

const INTERNAL_META = [
  /\bday\s*\d+\b/i,
  /\bkickoff\b/i,
  /\bcampaign\s+recap\b/i,
  /\bimpact\s*\/\s*report\b/i,
  /\bcard\s*:/i,
  /\bchannel\s+format\b/i,
  /\bpost\s+format\b/i,
  /\bconference\s+moment\b/i,
  /\bcalendar\s+worksheet\b/i,
];

/** Phase 2F Heidi — safe headline pool (≤7 words each). */
const HEIDI_SHORT_FALLBACKS = [
  "Documentation steals time from care",
  "More time with patients",
  "Less after-hours paperwork",
  "Capacity returned to care",
  "Your AI care partner",
  "Partnership built for care",
  "Calm admin, better care",
];

/** Heidi proof line — short, source-safe phrases only (≤6 words each). */
const HEIDI_PROOF_PREFERRED = [
  "Less after-hours paperwork",
  "More time with patients",
  "Capacity returned to care",
  "Partnership built for care",
];

const RELEVANCE_SHORT_FALLBACKS = [
  "Level Up",
  "Relevance Live",
  "Agents@Work",
  "AI Ops Bootcamp",
  "GTM Operators",
  "Building agents live",
];

export function getDistilledLinkedInVisualBrief(profileId: string): DistilledLinkedInVisualBrief {
  if (profileId === LINKEDIN_PLAYBOOK_PROFILE.heidi) {
    return {
      positiveBrief:
        "Heidi LinkedIn brand card. Bright lemon-yellow field with cream/off-white panels. Deep burgundy serif headline. Modern healthcare editorial layout. Calm proof-led composition. Clean institutional spacing. Simple abstract Heidi-like loop motif if needed. Minimal visible text.",
      negativeBrief:
        "No black or dark luxury background. No parchment or certificate look. No ornate leaves, ribbons, seals, or trophy motifs. No generic medical icons overload. No sci-fi, robots, purple, pixel art, arcade motifs, or Relevance-style SaaS chrome. No invented statistics.",
      visibleTextRules:
        "Render only the supplied visible strings as readable words. Do not add sentences, captions, or filler. Do not invent statistics. Do not show percentages, hours, or minutes unless explicitly grounded in sourced proof supplied for caption alignment (still keep raster copy ultra-short).",
      colorRules:
        "Bright lemon / pale yellow fields; cream / off-white surfaces; deep burgundy / dark brown type; tiny muted blue accent only when necessary for partner neutrality; avoid black or dark full-bleed backdrops.",
      compositionRules:
        "Square LinkedIn-native card. Large headline, one short proof/supporting line, footer brand word. No paragraphs. No fake logos or fake partner logos. Leave airy institutional whitespace.",
    };
  }

  if (profileId === LINKEDIN_PLAYBOOK_PROFILE.relevance) {
    return {
      positiveBrief:
        "Relevance AI LinkedIn ops brand card. Bold purple-forward SaaS palette with restrained neon accents. Pixel/grid motifs and arcade-live energy allowed at tasteful intensity. Sharp headline typography for GTM operator audiences. Minimal franchise text only.",
      negativeBrief:
        "Do not adopt Heidi calm butter-yellow healthcare editorial, burgundy serif dominance, or clinical ward serenity cues. No parchment, seals, or ornate healthcare laurels.",
      visibleTextRules:
        "Keep readable words strictly to the headline / optional badge / footer strings supplied. No invented statistics or invented partner logos.",
      colorRules:
        "Purple and magenta gradients acceptable; punchy complementary neon accents; maintain contrast-safe headline readability.",
      compositionRules:
        "Square LinkedIn graphic. Bold headline band, optional compact badge, footer brand lockup area — arcade-modern but premium; avoid cluttered icon grids.",
    };
  }

  return {
    positiveBrief:
      "Premium LinkedIn-native square brand graphic with editorial spacing and restrained typography.",
    negativeBrief:
      "No invented statistics, fake logos, sci-fi robots, purple-vs-healthcare palette bleed without brand approval.",
    visibleTextRules:
      "Only render supplied visible strings as readable words.",
    colorRules: "Anchor on brand palette implied by company context.",
    compositionRules: "Square layout; headline-forward; minimal visible copy.",
  };
}

function normalizeWs(s: string): string {
  return String(s ?? "")
    .trim()
    .replace(/\s+/g, " ")
    .replace(/…|\.{3,}/g, "")
    .trim();
}

function wordCount(s: string): number {
  return normalizeWs(s).split(" ").filter(Boolean).length;
}

function takeFirstWords(s: string, maxWords: number): string {
  const w = normalizeWs(s).split(" ").filter(Boolean);
  return w.slice(0, maxWords).join(" ");
}

function hashPick<T>(arr: T[], seed: string): T {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return arr[h % arr.length]!;
}

const HEIDI_HEADLINE_PREFIX_RES = [
  /^impact\s+report\s*:\s*/i,
  /^customer\s+rollout\s*:\s*/i,
  /^conference\s+moment\s*:?\s*/i,
  /^celebrating\s+our\s+clinicians\s*:\s*/i,
  /^healthcare\s+operators\s*[—\-]\s*/i,
];

/** Worksheet / internal cadence tokens — force safe headline swap. */
const HEIDI_WORKSHEET_HEADLINE_RE =
  /\b(report|rollout|conference|agenda|campaign|moment)\b|success\s+stories/i;

function stripHeidiHeadlinePrefixes(raw: string): string {
  let t = normalizeWs(raw);
  for (let i = 0; i < 12; i++) {
    let changed = false;
    for (const re of HEIDI_HEADLINE_PREFIX_RES) {
      const n = t.replace(re, "").trim();
      if (n !== t) {
        t = normalizeWs(n);
        changed = true;
      }
    }
    if (!changed) break;
  }
  return t;
}

function heidiHeadlineInvalidEnding(s: string): boolean {
  return /[—\-:]$/.test(s.trim());
}

function heidiHeadlineViolatesWorksheetWords(s: string): boolean {
  return HEIDI_WORKSHEET_HEADLINE_RE.test(s);
}

function pickHeidiSafeHeadline(seed: string): string {
  return hashPick(HEIDI_SHORT_FALLBACKS, seed);
}

function finalizeHeidiHeadline(headline: string, headlineMax: number, seed: string): string {
  let h = takeFirstWords(normalizeWs(headline), headlineMax);
  if (h.length < 4 || heidiHeadlineInvalidEnding(h) || heidiHeadlineViolatesWorksheetWords(h)) {
    h = pickHeidiSafeHeadline(seed);
  }
  h = takeFirstWords(normalizeWs(h), headlineMax);
  if (heidiHeadlineInvalidEnding(h) || heidiHeadlineViolatesWorksheetWords(h)) {
    h = pickHeidiSafeHeadline(`${seed}-re`);
  }
  return takeFirstWords(normalizeWs(h), headlineMax);
}

/** When footer is Heidi, strip redundant brand lead-ins from the headline (keep tail if usable). */
const HEIDI_BRAND_LEAD_IN_RES = [
  /^Heidi\s+Health\s*[—\-:]\s*(.+)$/i,
  /^Heidi\s*[—\-:]\s*(.+)$/i,
];

const HEIDI_PROOF_FROM_PRACTICES_FR =
  /^proof\s+from\s+practices\s+shipping\s+relief$/i;

const HEIDI_SHIPPING_REPLACEMENT_HEADLINES = [
  "Proof in Daily Practice",
  "Capacity Returned to Care",
] as const;

function stripHeidiBrandLeadFromHeadline(headline: string): string {
  let h = normalizeWs(headline);
  for (let i = 0; i < 6; i++) {
    let changed = false;
    for (const re of HEIDI_BRAND_LEAD_IN_RES) {
      const m = h.match(re);
      if (m?.[1]) {
        h = normalizeWs(m[1]);
        changed = true;
      }
    }
    if (!changed) break;
  }
  return h;
}

function heidiHeadlineUsableAfterCleanup(h: string): boolean {
  const t = normalizeWs(h);
  if (t.length < 4) return false;
  if (heidiHeadlineInvalidEnding(t)) return false;
  if (heidiHeadlineViolatesWorksheetWords(t)) return false;
  if (/\bshipping\s+relief\b/i.test(t)) return false;
  return true;
}

/** Heidi-only: remove brand echo in headline + collapse banned “shipping relief” headline. */
function applyHeidiFooterBrandAndShippingCleanup(
  headline: string,
  headlineMax: number,
  seed: string,
): string {
  let h = normalizeWs(headline);
  const beforeBrand = h;
  h = stripHeidiBrandLeadFromHeadline(h);
  if (h !== beforeBrand) {
    h = takeFirstWords(h, headlineMax);
    if (!heidiHeadlineUsableAfterCleanup(h)) {
      h = pickHeidiSafeHeadline(seed);
    }
  }

  h = takeFirstWords(normalizeWs(h), headlineMax);

  if (HEIDI_PROOF_FROM_PRACTICES_FR.test(normalizeWs(h))) {
    h = hashPick([...HEIDI_SHIPPING_REPLACEMENT_HEADLINES], seed);
  } else if (/\bshipping\s+relief\b/i.test(h)) {
    h = pickHeidiSafeHeadline(`${seed}-ship`);
  }

  return takeFirstWords(normalizeWs(h), headlineMax);
}

function trustedHasNumeric(token: string, trusted: string): boolean {
  const t = token.trim().toLowerCase();
  const h = trusted.toLowerCase();
  return t.length >= 2 && h.includes(t);
}

/** Safe short on-image copy — Phase 2F Heidi headline ≤7 words; proof_line ≤6 words; grounded numerics only. */
export function buildSafeLinkedInVisibleTextContract(args: {
  workflow: WorkflowState;
  draft: CampaignLinkedInPostDraft;
  profileId: string;
  day: number;
}): LinkedInVisibleTextContract {
  const { workflow, draft, profileId, day } = args;
  const trusted = buildTrustedEvidenceBlob(workflow, draft);
  const isHeidi = profileId === LINKEDIN_PLAYBOOK_PROFILE.heidi;
  const headlineMax = isHeidi ? 7 : 7;

  let headline = normalizeWs(draft.headline.replace(/^day\s*\d+\s*[:\-–]\s*/i, ""));
  if (isHeidi) {
    headline = stripHeidiHeadlinePrefixes(headline);
  }
  for (const re of INTERNAL_META) {
    if (re.test(headline)) headline = "";
  }
  if (wordCount(headline) > headlineMax) headline = takeFirstWords(headline, headlineMax);

  const riskyInHeadline = extractRiskyNumericClaims(headline);
  for (const r of riskyInHeadline) {
    if (!trustedHasNumeric(r, trusted)) headline = headline.replace(r, "").trim();
  }
  headline = normalizeWs(headline);

  if (!headline || headline.length < 4) {
    headline =
      profileId === LINKEDIN_PLAYBOOK_PROFILE.relevance ?
        hashPick(RELEVANCE_SHORT_FALLBACKS, `${draft.meta.id}-${day}`)
      : hashPick(HEIDI_SHORT_FALLBACKS, `${draft.meta.id}-${day}`);
  }

  let label: string | undefined;
  let proof_line: string | undefined;

  if (profileId === LINKEDIN_PLAYBOOK_PROFILE.relevance) {
    label = "Live";
    proof_line = undefined;
  }

  if (label && wordCount(label) > 2) label = takeFirstWords(label, 2);

  const footer =
    profileId === LINKEDIN_PLAYBOOK_PROFILE.relevance ? "Relevance AI" : "Heidi";

  const hRisk = extractRiskyNumericClaims(headline);
  for (const r of hRisk) {
    if (!trustedHasNumeric(r, trusted)) {
      headline =
        profileId === LINKEDIN_PLAYBOOK_PROFILE.relevance ?
          hashPick(RELEVANCE_SHORT_FALLBACKS, draft.meta.id)
        : hashPick(HEIDI_SHORT_FALLBACKS, draft.meta.id);
      break;
    }
  }

  if (isHeidi && footer === "Heidi") {
    headline = applyHeidiFooterBrandAndShippingCleanup(
      headline,
      headlineMax,
      `${draft.meta.id}-footer-${day}`,
    );
  }

  if (isHeidi) {
    headline = finalizeHeidiHeadline(headline, headlineMax, `${draft.meta.id}-h-${day}`);
    const proofChoices = HEIDI_PROOF_PREFERRED.filter((x) => x.toLowerCase() !== headline.toLowerCase());
    proof_line = hashPick(proofChoices.length ? proofChoices : HEIDI_PROOF_PREFERRED, `${draft.meta.id}-proof-${day}`);
    proof_line = takeFirstWords(normalizeWs(proof_line), 6);
    const pr = extractRiskyNumericClaims(proof_line);
    if (pr.some((x) => !trustedHasNumeric(x, trusted))) {
      proof_line = hashPick(HEIDI_PROOF_PREFERRED, `${draft.meta.id}-proofsafe-${day}`);
    }
  }

  return {
    headline: takeFirstWords(normalizeWs(headline), headlineMax),
    ...(label ? { label } : {}),
    ...(proof_line ? { proof_line: takeFirstWords(normalizeWs(proof_line), 6) } : {}),
    footer,
  };
}

export function visibleTextContractToPromptBlock(v: LinkedInVisibleTextContract): string {
  const lines = [
    `- Headline (max 7 words): "${v.headline}"`,
    ...(v.proof_line ? [`- Proof line (max 6 words): "${v.proof_line}"`] : []),
    ...(v.label ? [`- Optional badge (max 2 words): "${v.label}"`] : []),
    ...(v.footer ? [`- Footer: "${v.footer}"`] : []),
  ];
  return ["VISIBLE TEXT — render exactly these strings as readable words (nothing else):", ...lines].join("\n");
}

export function buildPlaybookDrivenLinkedInImagePrompt(args: {
  companyName: string;
  draft: CampaignLinkedInPostDraft;
  channelIntelligence: LinkedInChannelIntelligence;
  /** @deprecated Phase 2F — ignored; playbook MD stays documentation/report-only for image prompts. */
  playbookMarkdown?: string;
  formatPattern?: string;
  visibleText: LinkedInVisibleTextContract;
  sourceProof?: string;
  visualBriefHints?: { source_anchor?: string; negative_prompt?: string };
}): { prompt: string; negativePrompt: string } {
  const profileId = args.channelIntelligence.profile_id;
  const d = getDistilledLinkedInVisualBrief(profileId);
  const fmt = args.formatPattern ?? String(args.draft.meta.channel_post_format ?? "native_linkedin");
  const vt = visibleTextContractToPromptBlock(args.visibleText);

  const proof =
    args.sourceProof?.trim() ?
      `Trusted caption-only proof context (do NOT render as a paragraph on-image): ${args.sourceProof.trim().slice(0, 220)}`
    : "";

  const neg = [
    d.negativeBrief,
    args.visualBriefHints?.negative_prompt ?? "",
    "No fake logos, fake partner logos, invented statistics, dense paragraphs, or cropped unreadable micro-text.",
  ]
    .filter(Boolean)
    .join("\n");

  const prompt = [
    "[LinkedIn image prompt · Phase 2F distilled brief · full playbook MD NOT injected]",
    "",
    `Create a square LinkedIn brand graphic for ${args.companyName}.`,
    "",
    "Art direction:",
    d.positiveBrief,
    "",
    "Color:",
    d.colorRules,
    "",
    "Composition:",
    d.compositionRules,
    "",
    vt,
    "",
    `Visible copy rules: ${d.visibleTextRules}`,
    "",
    `Format cue (layout hint only — do not print internal labels): ${fmt}.`,
    proof ? `${proof}\n` : "",
    "Hard constraints:",
    ...(profileId === LINKEDIN_PLAYBOOK_PROFILE.heidi ?
      [
        "- Do not use black or dark luxury full-bleed backgrounds; keep lemon-yellow/cream editorial fields.",
      ]
    : []),
    "- Do not add words beyond the visible text strings above.",
    "- Do not invent statistics or speculative metrics on-image.",
    `- Visual intent (non-text): ${args.visualBriefHints?.source_anchor ?? "brand-native LinkedIn editorial square"}`,
    "",
    "Negative / avoidance:",
    neg,
  ]
    .filter(Boolean)
    .join("\n");

  return { prompt, negativePrompt: neg };
}

/** Phase 2F — `/report` telemetry for distilled-brief LinkedIn GPT images (no full MD injection). */
export function computePhase2fLinkedInImageTelemetry(workflow: WorkflowState): {
  renderModeEnv: string;
  imageModelRequested: string;
  imageModelsUsed: string[];
  fallbackUsedCount: number;
  playbookDistilledAssetCount: number;
  fullMdInjectedAssetCount: number;
  distilledBriefMarkerAssetCount: number;
  promptsAvoidDarkBackgroundExplicitCount: number;
  suspiciousDarkBackgroundLexicalHits: number;
  unsupportedNumericVisibleTokenCount: number;
  distilledBriefSnippet: string;
} {
  const renderModeEnv = process.env.ORBIT_LINKEDIN_VISUAL_RENDER_MODE ?? "deterministic";
  const imageModelRequested = process.env.OPENAI_IMAGE_MODEL ?? DEFAULT_OPENAI_IMAGE_MODEL;
  const assets = workflow.generated_campaign_assets ?? [];
  const models = new Set<string>();
  let fallbackUsedCount = 0;
  let playbookDistilledAssetCount = 0;
  let fullMdInjectedAssetCount = 0;
  let distilledBriefMarkerAssetCount = 0;
  let promptsAvoidDarkBackgroundExplicitCount = 0;
  let suspiciousDarkBackgroundLexicalHits = 0;
  let unsupportedNumericVisibleTokenCount = 0;

  const liProfile = workflow.channel_intelligence?.linkedin?.profile_id ?? "";
  const distilledBriefSnippet =
    getDistilledLinkedInVisualBrief(liProfile || LINKEDIN_PLAYBOOK_PROFILE.heidi).positiveBrief.slice(0, 240);

  const darkPositive = /\b(?:solid|pure|full[-\s]?bleed)?\s*black\s+background\b|\bdark\s+luxury\s+background\b/i;

  for (const a of assets) {
    if (a.platform !== "linkedin") continue;
    if (a.openai_image_model_used) models.add(a.openai_image_model_used);
    if (a.openai_image_fallback_used) fallbackUsedCount += 1;

    const p = `${a.image_prompt_detailed ?? ""}\n${a.prompt ?? ""}`;

    const isDistilledPlaybook =
      a.playbook_driven &&
      a.rendering_method === "openai_image" &&
      (a.linkedin_image_full_md_injected === false ||
        /\[LinkedIn image prompt · Phase 2F distilled brief/i.test(p));

    if (isDistilledPlaybook) playbookDistilledAssetCount += 1;

    if (a.playbook_driven && a.rendering_method === "openai_image") {
      if (/SOURCE OF TRUTH — Company LinkedIn playbook/i.test(p)) fullMdInjectedAssetCount += 1;
      if (/\[LinkedIn image prompt · Phase 2F distilled brief/i.test(p)) distilledBriefMarkerAssetCount += 1;

      if (/do\s+not\s+use\s+black|avoid\s+black|dark\s+luxury\s+full-bleed/i.test(p)) {
        promptsAvoidDarkBackgroundExplicitCount += 1;
      }

      if (darkPositive.test(p) && !/do\s+not\s+use\s+black|avoid\s+black/i.test(p)) {
        suspiciousDarkBackgroundLexicalHits += 1;
      }

      if (a.visible_text_contract) {
        unsupportedNumericVisibleTokenCount += extractRiskyNumericClaims(a.visible_text_contract).length;
      }
    }
  }

  return {
    renderModeEnv,
    imageModelRequested,
    imageModelsUsed: [...models],
    fallbackUsedCount,
    playbookDistilledAssetCount,
    fullMdInjectedAssetCount,
    distilledBriefMarkerAssetCount,
    promptsAvoidDarkBackgroundExplicitCount,
    suspiciousDarkBackgroundLexicalHits,
    unsupportedNumericVisibleTokenCount,
    distilledBriefSnippet,
  };
}
