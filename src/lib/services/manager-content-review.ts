import type {
  CampaignCarouselDraft,
  CampaignExecutionDraft,
  CampaignLinkedInPostDraft,
  GeneratedCampaignAsset,
  GovernanceAuditEntry,
  LyraWarmIntelligence,
  ManagerContentIssue,
  ManagerContentReview,
  ManagerCritique,
  ManagerCritiqueReasonCode,
  ProductMarketingContext,
  TrendScoutResult,
  WorkflowState,
} from "@/lib/types/orbit";
import { isLyraCompanyUrl } from "@/lib/data/lyra-brand-intelligence";
import {
  collectBannedOnImagePhraseHits,
  countRobotRiskMatches,
  DEFAULT_GENERIC_ON_IMAGE_COPY_PHRASES,
  headlineAlignedWithLinkedInPostFormat,
  HEIDI_AI_LINKEDIN_PLAYBOOK_ID,
  RELEVANCE_AI_LINKEDIN_PLAYBOOK_ID,
  isAwkwardRelevancePublicHeadline,
  isCalendarGenericLinkedInHeadline,
} from "@/lib/services/channel-intelligence";
import {
  buildTrustedEvidenceBlob,
  extractRiskyNumericClaims,
} from "@/lib/services/linkedin-card-renderer";
import { createGovernanceEntry } from "@/lib/services/governance-logger";

const GENERIC_PHRASES = [
  "unlock",
  "game-changer",
  "game changer",
  "streamline",
  "empower",
  "revolutionize",
  "next-gen",
  "next gen",
  "cutting-edge",
  "cutting edge",
  "ai-powered",
  "ai powered",
  "in today's fast-paced",
  "in today’s fast-paced",
  "transform your business",
  "drive innovation",
  "seamless solution",
  "unlock the power",
];

const WEAK_CTAS = ["learn more", "get started", "contact us", "click here", "read more", "discover more", "find out more"];

const REVIEWED_AGENT_ID = "content_specialist";
const REVIEWED_AGENT_NAME = "Nova";

export interface ManagerReviewDraftContext {
  companyName: string;
  businessGoal?: string;
  successMetric?: string;
  brandLearningNotes: string[];
  lyraWarmIntelligence?: LyraWarmIntelligence;
  trendIntelligence?: TrendScoutResult;
  context: ProductMarketingContext;
}

function clampScore(n: number): number {
  return Math.max(0, Math.min(100, Math.round(n)));
}

function severityPenalty(sev: ManagerContentIssue["severity"]): number {
  switch (sev) {
    case "low":
      return 5;
    case "medium":
      return 12;
    case "high":
      return 25;
    default:
      return 0;
  }
}

function decideFromIssues(score: number, issues: ManagerContentIssue[]): "approve" | "revise" {
  const hasHigh = issues.some((i) => i.severity === "high");
  const channelDeterministicBlock = issues.some(
    (i) =>
      (i.severity === "high" || i.severity === "medium") &&
      /\[(channel-visual|channel-intelligence|brand-guardrail)\]/i.test(i.note),
  );
  if (hasHigh || channelDeterministicBlock || score < 75) return "revise";
  return "approve";
}

/** Maps issue types to concise revision asks for operators and downstream rewrite tooling. */
const ISSUE_TYPE_REVISION_HINT: Partial<Record<ManagerContentIssue["type"], string>> = {
  too_close_to_reference: "reduce repeated source-anchor phrasing; keep anchors as citations, not pasted prose",
  generic_copy: "replace generic AI filler with concrete founder/operator language",
  generic_channel_fit:
    "rewrite using the active company's voice and seeded playbook — fix headlines/email signoffs; remove unrelated demo brands (Lyra / Relevance AI / Heidi) unless this workflow is explicitly that brand; drop generic SaaS tone and banned phrases",
  unsupported_claim: "remove or qualify metrics and superlatives against approved proof context only",
  wrong_channel_voice: "tune hook and proof cues to this channel’s audience expectations",
  weak_cta: "strengthen the CTA with a decisive next step aligned to positioning",
  repetitive: "vary headline/anchor/CTA repetition across assets while preserving truth",
  reference_summary_not_synthesis:
    "rewrite as a founder/operator thesis — cite proof anchors once as evidence; no dossier scaffolding or blog recap rhythm",
  incomplete_email_draft:
    "assemble a send-ready email (subject + preview + greeting + multi-paragraph body + proof point + CTA + sign-off)",
  weak_channel_format:
    "assign explicit channel_format / visual_concept so packaging matches native LinkedIn or Instagram expectations",
  trend_context_ignored:
    "use one current public-web trend angle as context (without copying source text) while keeping company proof anchors primary",
};

/**
 * Builds a non-empty revision instruction for every `decision === "revise"` review.
 * Uses severity ordering (high → medium → low) so Scott prioritizes blocking gaps.
 */
export function buildRevisionInstruction(
  review: ManagerContentReview,
  opts: {
    /** First deterministic rewrite already attempted before this review */
    rewriteAttempted?: boolean;
    /** Instruction recorded from {@link rewriteDeterministic} when a rewrite ran */
    priorRewriteInstruction?: string;
  } = {},
): string {
  const ordered = [...review.issues].sort((a, b) => {
    const rank = (s: ManagerContentIssue["severity"]) =>
      s === "high" ? 0 : s === "medium" ? 1 : 2;
    return rank(a.severity) - rank(b.severity);
  });

  const top = ordered.slice(0, 4);
  const hintParts = top.map((i) => {
    const template = ISSUE_TYPE_REVISION_HINT[i.type];
    return template ? `${template} (${i.note.split(".")[0]})` : i.note;
  });

  const issueSentence =
    hintParts.length > 0 ?
      hintParts.join("; ")
    : "tighten proof-led specificity, channel voice, and CTA clarity against guardrail scoring.";

  if (opts.rewriteAttempted && opts.priorRewriteInstruction?.trim()) {
    const prior = opts.priorRewriteInstruction.trim();
    const shortened = prior.length > 160 ? `${prior.slice(0, 157)}…` : prior;
    return (
      `After one deterministic rewrite (${shortened}), further revision is required: ${issueSentence}`
    );
  }

  return `Revise this draft to ${issueSentence}`;
}

function mapIssuesToReasonCodes(issues: ManagerContentIssue[]): ManagerCritiqueReasonCode[] {
  const out = new Set<ManagerCritiqueReasonCode>();
  for (const issue of issues) {
    switch (issue.type) {
      case "too_close_to_reference":
        out.add("too_close_to_reference");
        break;
      case "generic_copy":
        out.add("generic_channel_fit");
        break;
      case "generic_channel_fit":
        out.add("generic_channel_fit");
        break;
      case "unsupported_claim":
        out.add("unsupported_claim");
        out.add("needs_more_research");
        break;
      case "wrong_channel_voice":
        out.add("generic_channel_fit");
        break;
      case "weak_cta":
        out.add("weak_cta");
        break;
      case "repetitive":
        out.add("repetitive");
        break;
      case "reference_summary_not_synthesis":
        out.add("missing_synthesis");
        break;
      case "incomplete_email_draft":
        out.add("incomplete_asset");
        break;
      case "weak_channel_format":
        out.add("visual_too_generic");
        break;
      case "trend_context_ignored":
        out.add("generic_channel_fit");
        break;
      default:
        break;
    }
  }
  return [...out];
}

function channelLabel(draft: CampaignExecutionDraft): string {
  if (draft.meta.channel === "linkedin") return "LinkedIn";
  if (draft.meta.channel === "email") return "email";
  return "Instagram";
}

function summarizeIssueSnippets(issues: ManagerContentIssue[], max = 3): string {
  return issues
    .slice(0, max)
    .map((i) => i.note.split(".")[0]?.trim() ?? i.type)
    .join("; ");
}

/** Builds Phase 7B critique aligned to final `manager_review` — grounded in scored issues only. */
export function buildManagerCritiqueFromReview(
  review: ManagerContentReview,
  draft: CampaignExecutionDraft,
  ctx: ManagerReviewDraftContext,
): ManagerCritique {
  const reasonCodes = mapIssuesToReasonCodes(review.issues);
  const anchorShort =
    draft.meta.source_anchor?.trim().slice(0, 80) ??
    draft.meta.visual_source_anchor?.trim().slice(0, 80) ??
    "the proof anchor";
  const ch = channelLabel(draft);
  const goalHint =
    ctx.businessGoal?.trim() ||
    ctx.successMetric?.trim() ||
    ctx.context.primary_cta ||
    "stated campaign outcomes";

  const hasHigh = review.issues.some((i) => i.severity === "high");
  const highCount = review.issues.filter((i) => i.severity === "high").length;
  const revisionAsk =
    review.decision === "revise" ?
      review.revisionInstruction?.trim() || buildRevisionInstruction(review)
    : undefined;

  const base = {
    id: crypto.randomUUID(),
    draftId: review.draftId,
    targetAgentId: review.reviewedAgentId,
    targetAgentDisplayName: review.reviewedDisplayName,
    managerAgentId: "scott" as const,
    managerDisplayName: "Scott" as const,
    reasonCodes,
    linkedReviewScore: review.score,
    linkedReviewDecision: review.decision,
    createdAt: new Date().toISOString(),
  };

  if (review.decision === "approve" && review.score >= 85) {
    return {
      ...base,
      severity: "note",
      stance: "approve",
      critique: `Approved — ${ch} supports ${goalHint} and keeps "${anchorShort}" as evidence, not dossier recap. Good synthesis versus guardrails.`,
    };
  }

  if (review.decision === "approve") {
    const lead = review.issues[0];
    const caveat = lead ?
      `${lead.type.replace(/_/g, " ")} — ${lead.note.split(".")[0] ?? lead.note}.`
    : "Minor QA notes remain.";
    return {
      ...base,
      severity: "note",
      stance: "challenge",
      critique: `Approved with caveat — ${caveat} Give it one tightening pass before scheduling.`,
      requestedAction:
        lead ?
          ISSUE_TYPE_REVISION_HINT[lead.type] ?
            `${ISSUE_TYPE_REVISION_HINT[lead.type]}.`
          : `${lead.note}`
        : undefined,
    };
  }

  if (!hasHigh) {
    return {
      ...base,
      severity: "pushback",
      stance: "challenge",
      critique: `Nova — this ${ch} draft needs rework: ${summarizeIssueSnippets(review.issues)}. Turn references into founder insight — "${anchorShort}" should cite once, then argue.`,
      requestedAction: revisionAsk,
    };
  }

  const stance: "oppose" | "block" =
    review.score < 68 || highCount >= 2 ? "block" : "oppose";
  const highNotes = review.issues.filter((i) => i.severity === "high");
  const highSummary = summarizeIssueSnippets(highNotes, 4);

  return {
    ...base,
    severity: "blocker",
    stance,
    critique:
      stance === "block" ?
        `Blocking this ${ch} draft — ${highSummary}. Not ready against ${goalHint}; reads too thin or too close to source scaffolding.`
      : `Strong opposition on this ${ch} draft — ${highSummary}. Rewrite before we ship anything downstream.`,
    requestedAction: revisionAsk,
  };
}

function buildCritiqueActivityLogs(critiques: ManagerCritique[], drafts: CampaignExecutionDraft[]): string[] {
  const draftById = new Map(drafts.map((d) => [d.meta.id, d]));
  const logs: string[] = [];
  let cleanApprove = 0;
  let mildApprove = 0;

  for (const c of critiques) {
    const draft = c.draftId ? draftById.get(c.draftId) : undefined;
    const day = draft?.meta.day ?? "?";
    const ch = draft ? channelLabel(draft) : "channel";
    const short = c.critique.length > 140 ? `${c.critique.slice(0, 137)}…` : c.critique;

    if (c.severity === "blocker") {
      logs.push(`[Scott]: Blocking Nova's ${ch} draft (Day ${day}) — ${short}`);
    } else if (c.severity === "pushback") {
      logs.push(`[Scott]: Challenging Nova's ${ch} draft (Day ${day}) — ${short}`);
    } else if (c.stance === "approve") {
      cleanApprove += 1;
    } else if (c.stance === "challenge") {
      mildApprove += 1;
    }
  }

  if (cleanApprove > 0) {
    logs.push(
      `[Scott]: Approved ${cleanApprove} draft(s) — anchors land as evidence with usable synthesis.`,
    );
  }
  if (mildApprove > 0) {
    logs.push(`[Scott]: Approved ${mildApprove} draft(s) with minor caveats — polish before publish.`);
  }

  return logs;
}

function normalizeWhitespace(s: string): string {
  return s.replace(/\s+/g, " ").trim().toLowerCase();
}

function extractDraftPlainText(draft: CampaignExecutionDraft): string {
  if (draft.type === "linkedin_post") {
    return `${draft.headline}\n${draft.body}`;
  }
  if (draft.type === "email") {
    return `${draft.subject_line}\n${draft.preview_text}\n${draft.body_markdown}\n${draft.call_to_action}`;
  }
  const slideText = draft.slides
    .map((s) => `${s.headline}\n${s.supporting_copy}\n${s.design_artifact?.body ?? ""}`)
    .join("\n");
  return `${draft.caption}\n${slideText}`;
}

function extractCtaSnippet(draft: CampaignExecutionDraft): string {
  const meta = draft.meta;
  if (meta.cta_text) return meta.cta_text;
  if (draft.type === "email") return draft.call_to_action;
  if (draft.type === "linkedin_post") {
    const lines = draft.body.split("\n").filter(Boolean);
    return lines[lines.length - 1] ?? "";
  }
  const cap = draft.caption.toLowerCase();
  const m = cap.match(/cta:\s*([^\n]+)/i);
  return m?.[1]?.trim() ?? draft.primary_hashtags.join(" ");
}

function buildReferenceCorpus(ctx: ManagerReviewDraftContext): string {
  const chunks: string[] = [...ctx.brandLearningNotes];
  if (ctx.lyraWarmIntelligence) {
    chunks.push(...ctx.lyraWarmIntelligence.proof_points);
    chunks.push(...ctx.lyraWarmIntelligence.source_anchors);
    chunks.push(...ctx.lyraWarmIntelligence.brand_voice);
    chunks.push(ctx.lyraWarmIntelligence.core_positioning);
  }
  chunks.push(ctx.context.mission_statement);
  chunks.push(...(ctx.context.messaging_pillars ?? []));
  chunks.push(...(ctx.context.target_personas ?? []).slice(0, 2));
  return chunks.filter(Boolean).join("\n\n");
}

function buildProofAllowlistBlob(ctx: ManagerReviewDraftContext): string {
  return normalizeWhitespace(
    [
      ctx.context.mission_statement,
      ...(ctx.context.messaging_pillars ?? []),
      ...(ctx.lyraWarmIntelligence?.proof_points ?? []),
      ...(ctx.lyraWarmIntelligence?.source_anchors ?? []),
      ...ctx.brandLearningNotes,
    ].join(" "),
  );
}

function flagTooCloseToReference(copy: string, referenceCorpus: string): ManagerContentIssue[] {
  const issues: ManagerContentIssue[] = [];
  const draftLower = copy.toLowerCase();
  const sentences = referenceCorpus.split(/[\n.]+/).map((s) => s.trim()).filter((s) => s.length >= 48);
  let longHits = 0;
  for (const sentence of sentences.slice(0, 80)) {
    const slug = sentence.slice(0, Math.min(sentence.length, 220)).toLowerCase();
    if (slug.length >= 48 && draftLower.includes(slug)) longHits += 1;
  }

  const words = referenceCorpus.toLowerCase().split(/\s+/).filter((w) => w.length > 6);
  const wordSet = new Set(words);
  const draftWords = copy.toLowerCase().split(/\s+/);
  let overlap = 0;
  for (const w of draftWords) {
    if (wordSet.has(w)) overlap += 1;
  }
  const ratio = draftWords.length ? overlap / draftWords.length : 0;

  if (longHits >= 3) {
    issues.push({
      type: "too_close_to_reference",
      severity: "high",
      note: `Multiple long phrases match reference/learning text (${longHits} hits). Rewrite in a new voice while keeping anchors as evidence.`,
    });
  } else if (longHits >= 1 || ratio > 0.28) {
    issues.push({
      type: "too_close_to_reference",
      severity: "medium",
      note: "Copy overlaps reference material heavily; tighten into original campaign lines and cite anchors briefly.",
    });
  }

  if (/\bthis (article|post|blog|summary)\b/i.test(copy) && /\b(key takeaway|in conclusion)\b/i.test(copy)) {
    issues.push({
      type: "too_close_to_reference",
      severity: "low",
      note: "Tone resembles a recap/summary rather than campaign copy.",
    });
  }

  return issues;
}

function flagGenericCopy(copy: string): ManagerContentIssue[] {
  const issues: ManagerContentIssue[] = [];
  const lower = copy.toLowerCase();
  for (const phrase of GENERIC_PHRASES) {
    if (lower.includes(phrase)) {
      issues.push({
        type: "generic_copy",
        severity: "medium",
        note: `Contains generic filler phrasing (“${phrase}”). Replace with concrete operator language.`,
      });
      break;
    }
  }
  return issues;
}

function flagUnsupportedClaims(copy: string, allowBlob: string): ManagerContentIssue[] {
  const issues: ManagerContentIssue[] = [];
  const patterns: RegExp[] = [
    /\b\d+x\b/i,
    /\bguaranteed\b/i,
    /\b(?:number\s*one|#\s*1|top\s*ranked)\b/i,
    /\bindustry[- ]leading\b/i,
    /\$\s*\d+[mk]?\b.*\b(revenue|arr)\b/i,
    /\b\d+%\s+(growth|lift|conversion)\b/i,
  ];
  for (const re of patterns) {
    const m = copy.match(re);
    if (!m) continue;
    const fragment = m[0].toLowerCase();
    if (!allowBlob.includes(fragment) && !allowBlob.includes(fragment.replace(/\s+/g, ""))) {
      issues.push({
        type: "unsupported_claim",
        severity: "high",
        note: `Possible unsupported metric/superlative (“${m[0]}”). Tie claims to approved proof context only.`,
      });
      break;
    }
  }
  return issues;
}

function flagWrongChannelVoice(draft: CampaignExecutionDraft, copy: string): ManagerContentIssue[] {
  const issues: ManagerContentIssue[] = [];
  const ch = draft.meta.channel;

  if (ch === "linkedin") {
    const hasProofCue =
      /\b(proof|founder|operator|delivery|customer|project|ship|case)\b/i.test(copy) ||
      /\b(YC|venture|series)\b/i.test(copy);
    if (!hasProofCue && copy.length > 120) {
      issues.push({
        type: "wrong_channel_voice",
        severity: "medium",
        note: "LinkedIn copy should lean founder/operator proof-led (delivery cues, outcomes).",
      });
    }
  }

  if (ch === "email") {
    if (/\b(dear reader|weekly newsletter|digest)\b/i.test(copy)) {
      issues.push({
        type: "wrong_channel_voice",
        severity: "medium",
        note: "Email reads newsletter-style; tighten to one-to-one operator cadence.",
      });
    }
    if ((copy.match(/\n-/g) ?? []).length > 6) {
      issues.push({
        type: "wrong_channel_voice",
        severity: "low",
        note: "Heavy bullet formatting may feel broadcast-y for a direct email.",
      });
    }
  }

  if (ch === "instagram") {
    const hook = draft.type === "carousel" ? draft.caption.slice(0, 280) : copy.slice(0, 280);
    if (hook.length > 20 && !/[?!]/.test(hook)) {
      issues.push({
        type: "wrong_channel_voice",
        severity: "low",
        note: "Instagram hook could be sharper with a tension question or decisive statement.",
      });
    }
  }

  return issues;
}

function flagWeakCta(draft: CampaignExecutionDraft): ManagerContentIssue[] {
  const issues: ManagerContentIssue[] = [];
  const raw = extractCtaSnippet(draft).trim().toLowerCase();
  if (!raw) {
    issues.push({
      type: "weak_cta",
      severity: "high",
      note: "CTA missing or empty; add a decisive next step aligned to channel.",
    });
    return issues;
  }
  for (const w of WEAK_CTAS) {
    if (raw === w || raw.startsWith(`${w} `)) {
      issues.push({
        type: "weak_cta",
        severity: "high",
        note: `CTA is vague (“${raw}”). Replace with a concrete offer tied to approved positioning.`,
      });
      return issues;
    }
  }
  if (raw.split(/\s+/).length <= 2) {
    issues.push({
      type: "weak_cta",
      severity: "low",
      note: "CTA is extremely short; ensure intent is explicit.",
    });
  }
  return issues;
}

function flagReferenceSummaryNotSynthesis(draft: CampaignExecutionDraft, copy: string): ManagerContentIssue[] {
  const issues: ManagerContentIssue[] = [];
  const lower = copy.toLowerCase();

  if (!draft.meta.strategic_insight?.trim() || !draft.meta.campaign_angle?.trim()) {
    issues.push({
      type: "reference_summary_not_synthesis",
      severity: "medium",
      note: "Strategic synthesis metadata missing — attach insight + angle before treating draft as campaign-ready.",
    });
  }

  if (
    /\blyra anchor\b|\bangle:\s/i.test(lower) ||
    /\bthis is email\b/i.test(lower) ||
    /\bproblem\/angle\b/i.test(lower)
  ) {
    issues.push({
      type: "reference_summary_not_synthesis",
      severity: "high",
      note: "Reads like dossier labels or recap scaffolding instead of operator-authored synthesis.",
    });
  }

  const anchor = draft.meta.source_anchor?.trim();
  if (anchor && anchor.length > 12) {
    let hits = 0;
    let idx = lower.indexOf(anchor.toLowerCase());
    while (idx !== -1) {
      hits += 1;
      idx = lower.indexOf(anchor.toLowerCase(), idx + anchor.length);
    }
    if (hits >= 5) {
      issues.push({
        type: "reference_summary_not_synthesis",
        severity: "medium",
        note: "Source anchor repeated excessively — cite once as evidence, then argue from insight.",
      });
    }
  }

  if (/\b(key takeaway|in conclusion|according to (?:our )?blog)\b/i.test(copy)) {
    issues.push({
      type: "reference_summary_not_synthesis",
      severity: "medium",
      note: "Blog-summary cadence detected — rewrite into a crisp thesis with anchors supporting the claim.",
    });
  }

  return issues;
}

function flagIncompleteEmailDraft(draft: CampaignExecutionDraft): ManagerContentIssue[] {
  if (draft.type !== "email") return [];
  const structured = draft.meta.email_detail;
  const full = structured?.full_email?.trim() ?? "";

  if (!structured?.greeting?.trim() || !structured?.proof_point?.trim() || !structured?.signoff?.trim()) {
    return [
      {
        type: "incomplete_email_draft",
        severity: "high",
        note: "Email missing structured greeting/proof/signoff assembly — unusable as outbound.",
      },
    ];
  }

  if (full.length < 220 || !/\bHi\b/i.test(full)) {
    return [
      {
        type: "incomplete_email_draft",
        severity: "high",
        note: "Email reads like fragments — expand into greeting, thesis paragraphs, proof point, CTA, and sign-off.",
      },
    ];
  }

  return [];
}

function flagWeakChannelFormat(draft: CampaignExecutionDraft): ManagerContentIssue[] {
  const issues: ManagerContentIssue[] = [];

  if (draft.meta.channel === "linkedin" && !draft.meta.channel_format?.trim()) {
    issues.push({
      type: "weak_channel_format",
      severity: "medium",
      note: "LinkedIn packaging lacks explicit channel_format (founder POV / teardown / etc.).",
    });
  }

  if (draft.meta.channel === "instagram" && draft.type === "carousel") {
    if (!draft.meta.visual_concept?.trim()) {
      issues.push({
        type: "weak_channel_format",
        severity: "medium",
        note: "Instagram visual_concept missing — anchor captions to a concrete scene.",
      });
    }
    if (!draft.meta.image_prompt_detailed?.trim()) {
      issues.push({
        type: "weak_channel_format",
        severity: "low",
        note: "Instagram draft missing detailed image prompt payload.",
      });
    }
  }

  return issues;
}

function flagTrendContextIgnored(
  draft: CampaignExecutionDraft,
  ctx: ManagerReviewDraftContext,
): ManagerContentIssue[] {
  const trend = ctx.trendIntelligence;
  if (!trend || trend.status !== "searched" || trend.insights.length === 0) return [];
  if (draft.meta.trend_angle?.trim()) return [];
  return [
    {
      type: "trend_context_ignored",
      severity: "low",
      note: "Trend scout context is available but this draft does not reference any trend angle.",
    },
  ];
}

function flagRepetitive(
  draft: CampaignExecutionDraft,
  allDrafts: CampaignExecutionDraft[],
): ManagerContentIssue[] {
  const issues: ManagerContentIssue[] = [];
  const anchor = (draft.meta.source_anchor ?? "").trim().toLowerCase();
  if (anchor) {
    const others = allDrafts.filter((d) => d.meta.id !== draft.meta.id && (d.meta.source_anchor ?? "").trim().toLowerCase() === anchor);
    if (others.length >= 1) {
      issues.push({
        type: "repetitive",
        severity: others.length >= 2 ? "high" : "medium",
        note: `Source anchor repeats across assets (${anchor}). Vary proof framing while keeping truth.`,
      });
    }
  }

  const headline =
    draft.type === "linkedin_post" ? draft.headline.toLowerCase().trim()
    : draft.type === "email" ? draft.subject_line.toLowerCase().trim()
    : (draft.slides[0]?.headline ?? "").toLowerCase().trim();

  if (headline) {
    const dup = allDrafts.filter((d) => {
      if (d.meta.id === draft.meta.id) return false;
      const h =
        d.type === "linkedin_post" ? d.headline.toLowerCase().trim()
        : d.type === "email" ? d.subject_line.toLowerCase().trim()
        : (d.slides[0]?.headline ?? "").toLowerCase().trim();
      return h === headline && h.length > 6;
    });
    if (dup.length) {
      issues.push({
        type: "repetitive",
        severity: "high",
        note: "Headline/subject overlaps another asset—vary hook while preserving intent.",
      });
    }
  }

  const cta = (draft.meta.cta_text ?? "").trim().toLowerCase();
  if (cta.length > 8) {
    const sameCta = allDrafts.filter(
      (d) => d.meta.id !== draft.meta.id && (d.meta.cta_text ?? "").trim().toLowerCase() === cta,
    );
    if (sameCta.length >= 2) {
      issues.push({
        type: "repetitive",
        severity: "medium",
        note: "Same CTA text reused across multiple assets; diversify CTAs within guardrails.",
      });
    }
  }

  return issues;
}

export function reviewDraftAsManager(args: {
  draft: CampaignExecutionDraft;
  allDrafts: CampaignExecutionDraft[];
  ctx: ManagerReviewDraftContext;
}): ManagerContentReview {
  const { draft, allDrafts, ctx } = args;
  const copy = extractDraftPlainText(draft);
  const referenceCorpus = buildReferenceCorpus(ctx);
  const allowBlob = buildProofAllowlistBlob(ctx);

  const issueBuckets: ManagerContentIssue[] = [
    ...flagTooCloseToReference(copy, referenceCorpus),
    ...flagGenericCopy(copy),
    ...flagUnsupportedClaims(copy, allowBlob),
    ...flagWrongChannelVoice(draft, copy),
    ...flagWeakCta(draft),
    ...flagRepetitive(draft, allDrafts),
    ...flagReferenceSummaryNotSynthesis(draft, copy),
    ...flagIncompleteEmailDraft(draft),
    ...flagWeakChannelFormat(draft),
    ...flagTrendContextIgnored(draft, ctx),
  ];

  let score = 100;
  for (const issue of issueBuckets) {
    score -= severityPenalty(issue.severity);
  }
  score = clampScore(score);

  const decision = decideFromIssues(score, issueBuckets);

  return {
    draftId: draft.meta.id,
    reviewerAgentId: "scott",
    reviewerDisplayName: "Scott",
    reviewedAgentId: REVIEWED_AGENT_ID,
    reviewedDisplayName: REVIEWED_AGENT_NAME,
    decision,
    score,
    issues: issueBuckets,
    reviewedAt: new Date().toISOString(),
  };
}

function stripGenericPhrases(text: string): string {
  let out = text;
  for (const phrase of GENERIC_PHRASES) {
    const re = new RegExp(`\\b${phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "gi");
    out = out.replace(re, "");
  }
  return out.replace(/\s{2,}/g, " ").trim();
}

function rewriteDeterministic(
  draft: CampaignExecutionDraft,
  ctx: ManagerReviewDraftContext,
  priorIssues: ManagerContentIssue[],
): { draft: CampaignExecutionDraft; instruction: string } {
  const primaryCta = ctx.context.primary_cta || draft.meta.cta_text || `Book a strategy conversation with ${ctx.companyName}`;
  const anchor = draft.meta.source_anchor ?? ctx.companyName;

  const notes = priorIssues.map((i) => i.type).join(", ");
  let instruction = `Targeted rewrite for: ${notes}. Anchor stays "${anchor}" as evidence, not pasted prose.`;

  if (draft.type === "linkedin_post") {
    let body = stripGenericPhrases(draft.body);
    body = `${body}\n\nProof cue: tie execution back to "${anchor}" with one concrete buyer takeaway.\n${primaryCta}`;
    const headline =
      draft.headline.toLowerCase().includes("proof") ?
        `${ctx.companyName}: execution proof (${draft.meta.day})`
      : `${draft.headline} · Day ${draft.meta.day}`;
    return {
      draft: { ...draft, headline, body },
      instruction,
    };
  }

  if (draft.type === "email") {
    let body = stripGenericPhrases(draft.body_markdown);
    body = `${body}\n\n---\nNext step: ${primaryCta}`;
    const subject =
      draft.subject_line.includes(String(draft.meta.day)) ?
        draft.subject_line
      : `${draft.subject_line} - ${draft.meta.day}`;
    const detail = draft.meta.email_detail;
    const mergedDetail =
      detail ?
        {
          ...detail,
          body: stripGenericPhrases(detail.body),
          full_email: stripGenericPhrases(
            `${detail.greeting}\n\n${detail.body}\n\n${detail.proof_point}\n\n${primaryCta}\n\n${detail.signoff}`,
          ),
        }
      : undefined;
    return {
      draft: {
        ...draft,
        subject_line: subject,
        body_markdown: body,
        call_to_action: primaryCta,
        meta: {
          ...draft.meta,
          email_detail: mergedDetail ?? draft.meta.email_detail,
        },
      },
      instruction,
    };
  }

  const carousel = draft as CampaignCarouselDraft;
  const slides = carousel.slides.map((slide, idx) => {
    const supporting = stripGenericPhrases(slide.supporting_copy);
    const patched =
      idx === 0 ?
        `${supporting}\n\nHook: why "${anchor}" matters to founders this week.`
      : `${supporting}`;
    return {
      ...slide,
      supporting_copy: patched,
      design_artifact:
        slide.design_artifact ?
          {
            ...slide.design_artifact,
            body: patched,
          }
        : slide.design_artifact,
    };
  });
  const caption = stripGenericPhrases(
    `${carousel.caption}\n\n${primaryCta}`,
  );
  return {
    draft: {
      ...carousel,
      slides,
      caption,
      card_config: {
        ...carousel.card_config,
        headline: slides[0]?.headline ?? carousel.card_config.headline,
      },
      meta: {
        ...carousel.meta,
        reviewer_note: `Internal QA note: keep "${anchor}" as evidence-only grounding; do not paste reference paragraphs.`,
      },
    },
    instruction,
  };
}

function attachReviewMeta(draft: CampaignExecutionDraft, review: ManagerContentReview): CampaignExecutionDraft {
  return {
    ...draft,
    meta: {
      ...draft.meta,
      manager_review: review,
    },
  };
}

function summarizeTopReasonCodes(critiques: ManagerCritique[], limit = 6): string {
  const tally = new Map<string, number>();
  for (const c of critiques) {
    for (const code of c.reasonCodes) {
      tally.set(code, (tally.get(code) ?? 0) + 1);
    }
  }
  return [...tally.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([k, v]) => `${k}×${v}`)
    .join(", ") || "none";
}

/**
 * Deterministic checks against seeded LinkedIn Channel Intelligence (dynamic workflow overlay).
 */
export function collectLinkedInChannelIntelligenceIssues(
  workflow: WorkflowState,
  draft: CampaignExecutionDraft,
): ManagerContentIssue[] {
  const li = workflow.channel_intelligence?.linkedin;
  if (!li || draft.type !== "linkedin_post") return [];

  const linked = draft as CampaignLinkedInPostDraft;
  const headline = linked.headline ?? "";
  const body = linked.body ?? "";
  const combined = `${headline}\n${body}`.toLowerCase();
  const issues: ManagerContentIssue[] = [];

  const banned = new Set(
    [...li.generation_rules.banned_phrases.map((p) => p.toLowerCase()), ...GENERIC_PHRASES.map((p) => p.toLowerCase())].filter(
      Boolean,
    ),
  );
  for (const phrase of banned) {
    if (phrase.length >= 4 && combined.includes(phrase)) {
      issues.push({
        type: "generic_channel_fit",
        severity: "high",
        note: `Banned or off-playbook phrase detected for ${li.company_name} LinkedIn voice: "${phrase}".`,
      });
      break;
    }
  }

  if (li.profile_id === RELEVANCE_AI_LINKEDIN_PLAYBOOK_ID && isCalendarGenericLinkedInHeadline(headline, li)) {
    issues.push({
      type: "generic_channel_fit",
      severity: "high",
      note:
        "Headline reads like internal campaign scaffolding (Kickoff Post, Announcement, Thought Leadership, Live Event Announcement, etc.). Use Level Up, Relevance Live, Agents@Work, AI Ops Bootcamp, AI workforce, or GTM operator framing per channel_post_format.",
    });
  }

  if (li.profile_id === RELEVANCE_AI_LINKEDIN_PLAYBOOK_ID && isAwkwardRelevancePublicHeadline(headline)) {
    issues.push({
      type: "generic_channel_fit",
      severity: "high",
      note:
        'LinkedIn headline contains forbidden awkward scaffolding (Day N prefixes, “Build Join…”, Final Call, Feedback Request). Normalize using playbook shells — never paste calendar/recap crumbs publicly.',
    });
  }

  const fmt = linked.meta.channel_post_format;
  if (
    fmt &&
    li.profile_id === RELEVANCE_AI_LINKEDIN_PLAYBOOK_ID &&
    !headlineAlignedWithLinkedInPostFormat(headline, fmt)
  ) {
    issues.push({
      type: "generic_channel_fit",
      severity: "medium",
      note: `Headline energy does not match assigned channel_post_format "${fmt}". Align hook to that playbook tile.`,
    });
  }

  const excitedOpens = (body.match(/\bwe(?:'|’)re excited\b/gi) ?? []).length;
  if (excitedOpens >= 2) {
    issues.push({
      type: "generic_channel_fit",
      severity: "low",
      note:
        "Body overuses “we're excited” openings — vary hooks with proof-led or operator-tension opens per playbook caption_rules.",
    });
  }

  if (li.profile_id === RELEVANCE_AI_LINKEDIN_PLAYBOOK_ID) {
    const vocabHits = li.voice_profile.vocabulary.filter((v) => combined.includes(v.toLowerCase()));
    if (body.length > 140 && vocabHits.length === 0) {
      issues.push({
        type: "generic_channel_fit",
        severity: "medium",
        note:
          "LinkedIn body lacks seeded channel vocabulary (e.g. AI workforce, agents, GTM operators, Level Up / Relevance Live motifs). Rewrite with playbook cues.",
      });
    }
  }

  if (li.profile_id === HEIDI_AI_LINKEDIN_PLAYBOOK_ID) {
    const clinicalHints = ["clinician", "clinical", "documentation", "patient", "care", "capacity", "paperwork", "burnout"];
    const hits = clinicalHints.filter((w) => combined.includes(w));
    if (body.length > 160 && hits.length === 0) {
      issues.push({
        type: "generic_channel_fit",
        severity: "medium",
        note:
          "Heidi LinkedIn body lacks clinical-operator vocabulary (clinicians, documentation, patient care, capacity, paperwork, burnout). Ground copy in healthcare proof.",
      });
    }
    if (
      fmt &&
      !headlineAlignedWithLinkedInPostFormat(headline, fmt)
    ) {
      issues.push({
        type: "generic_channel_fit",
        severity: "medium",
        note: `Headline energy does not match assigned Heidi channel_post_format "${fmt}". Align to editorial proof/partnership/report-card rhythm.`,
      });
    }
  }

  return issues;
}

function workflowAllowsLyraContent(workflow: WorkflowState): boolean {
  return Boolean(workflow.lyra_warm_intelligence) || isLyraCompanyUrl(workflow.company_url);
}

function workflowAllowsHeidiBrand(workflow: WorkflowState): boolean {
  const cn = workflow.website_intelligence?.company_name?.toLowerCase() ?? "";
  const url = workflow.company_url.toLowerCase();
  return (
    workflow.channel_intelligence?.linkedin?.profile_id === HEIDI_AI_LINKEDIN_PLAYBOOK_ID ||
    url.includes("heidi") ||
    cn.includes("heidi")
  );
}

function workflowAllowsRelevanceBrand(workflow: WorkflowState): boolean {
  const blob = `${workflow.company_url} ${workflow.website_intelligence?.company_name ?? ""}`.toLowerCase();
  return (
    workflow.channel_intelligence?.linkedin?.profile_id === RELEVANCE_AI_LINKEDIN_PLAYBOOK_ID ||
    blob.includes("relevanceai") ||
    blob.includes("relevance ai")
  );
}

function draftVisibleLeakageBlob(draft: CampaignExecutionDraft): string {
  const chunks: string[] = [];
  if ("headline" in draft && draft.headline) chunks.push(String(draft.headline));
  if ("body" in draft && draft.body) chunks.push(String(draft.body));
  if ("body_markdown" in draft && draft.body_markdown) chunks.push(String(draft.body_markdown));
  if ("subject_line" in draft && draft.subject_line) chunks.push(String(draft.subject_line));
  if ("preview_text" in draft && draft.preview_text) chunks.push(String(draft.preview_text));
  if ("caption" in draft && draft.caption) chunks.push(String(draft.caption));
  if (draft.type === "email" && draft.meta.email_detail?.full_email) chunks.push(String(draft.meta.email_detail.full_email));
  if (draft.meta.manager_review?.revisionInstruction) chunks.push(String(draft.meta.manager_review.revisionInstruction));
  return chunks.join("\n");
}

/** Blocks accidental demo-brand bleed (Lyra / Relevance / Heidi) into unrelated workflows. */
export function collectCrossCompanyBrandLeakageIssues(
  workflow: WorkflowState,
  draft: CampaignExecutionDraft,
): ManagerContentIssue[] {
  const blob = draftVisibleLeakageBlob(draft);
  if (!blob.trim()) return [];

  const issues: ManagerContentIssue[] = [];
  const companyHint =
    workflow.website_intelligence?.company_name ?? workflow.brand_kit?.brand_name ?? "this workflow's company";

  if (!workflowAllowsLyraContent(workflow) && /\blyra\b/i.test(blob)) {
    issues.push({
      type: "generic_channel_fit",
      severity: "high",
      note: `Cross-company leakage: visible copy references "Lyra" but this workflow is not the Lyra demo brand. Replace signatures/sender lines with "${companyHint}", manager "Scott", or "The ${companyHint} team".`,
    });
  }

  if (!workflowAllowsRelevanceBrand(workflow) && /\brelevance\s*ai\b|\brelevanceai\b/i.test(blob)) {
    issues.push({
      type: "generic_channel_fit",
      severity: "high",
      note: `Cross-company leakage: copy references Relevance AI off-brand for ${companyHint}. Remove Relevance-specific naming unless this workflow is seeded for Relevance AI.`,
    });
  }

  if (!workflowAllowsHeidiBrand(workflow) && /\bheidi\b/i.test(blob)) {
    issues.push({
      type: "generic_channel_fit",
      severity: "high",
      note: `Cross-company leakage: copy references Heidi off-brand for ${companyHint}. Remove Heidi-specific naming unless this workflow is Heidi-branded.`,
    });
  }

  return issues;
}

/** Merges channel-intelligence issues into Scott's LLM review and may downgrade score / force revise. */
export function augmentManagerReviewWithChannelIntelligence(
  review: ManagerContentReview,
  draft: CampaignExecutionDraft,
  workflow: WorkflowState,
): ManagerContentReview {
  const taggedLinkedIn = collectLinkedInChannelIntelligenceIssues(workflow, draft).map((i) => ({
    ...i,
    note: `[channel-intelligence] ${i.note}`,
  }));
  const taggedBrand = collectCrossCompanyBrandLeakageIssues(workflow, draft).map((i) => ({
    ...i,
    note: `[brand-guardrail] ${i.note}`,
  }));
  const extra = [...taggedLinkedIn, ...taggedBrand];
  if (extra.length === 0) return review;

  return mergeExtraIssuesIntoReview(review, extra);
}

/** Appends deterministic issues (e.g. visual brief checks) and recomputes score / decision. */
export function appendIssuesToManagerReview(
  review: ManagerContentReview,
  extra: ManagerContentIssue[],
): ManagerContentReview {
  if (extra.length === 0) return review;
  const tagged = extra.map((i) => ({ ...i, note: `[channel-visual] ${i.note}` }));
  return mergeExtraIssuesIntoReview(review, tagged);
}

function mergeExtraIssuesIntoReview(review: ManagerContentReview, taggedExtra: ManagerContentIssue[]): ManagerContentReview {
  const mergedIssues = [...review.issues, ...taggedExtra];
  let score = review.score;
  for (const i of taggedExtra) score -= severityPenalty(i.severity);
  score = clampScore(score);
  const decision = decideFromIssues(score, mergedIssues);

  return {
    ...review,
    decision,
    score,
    issues: mergedIssues,
    ...(decision === "revise" ?
      {
        revisionInstruction: buildRevisionInstruction(
          { ...review, decision: "revise", issues: mergedIssues, score },
          {},
        ),
      }
    : { revisionInstruction: review.revisionInstruction }),
  };
}

/** Merges QA issues without `[channel-visual]` prefix (e.g. deterministic card numeric grounding). */
export function appendPlainIssuesToManagerReview(
  review: ManagerContentReview,
  extra: ManagerContentIssue[],
): ManagerContentReview {
  return mergeExtraIssuesIntoReview(review, extra);
}

function normalizedEvidenceIncludes(fragment: string, haystack: string): boolean {
  const f = fragment.trim().toLowerCase().replace(/\s+/g, " ");
  const h = haystack.trim().toLowerCase().replace(/\s+/g, " ");
  return f.length >= 2 && h.includes(f);
}

/** Flatten Phase 2D JSON card copy or legacy plain strings for QA scans. */
function flattenDeterministicVisibleCopyForScan(raw: string): string {
  const t = raw.trim();
  if (!t.startsWith("{")) return raw;
  try {
    const o = JSON.parse(t) as Record<string, unknown>;
    return Object.values(o)
      .filter((v): v is string => typeof v === "string")
      .join("\n");
  } catch {
    return raw;
  }
}

/** Flags numeric claims rendered onto Heidi deterministic cards that are not grounded in trusted workflow evidence. */
export function collectDeterministicHeidiUnsupportedNumericIssues(
  deterministicVisibleCopy: string,
  workflow: WorkflowState,
  draft: CampaignExecutionDraft,
): ManagerContentIssue[] {
  const li = workflow.channel_intelligence?.linkedin;
  if (li?.profile_id !== HEIDI_AI_LINKEDIN_PLAYBOOK_ID || draft.type !== "linkedin_post") return [];

  const trusted = buildTrustedEvidenceBlob(workflow, draft);
  const scanText = flattenDeterministicVisibleCopyForScan(deterministicVisibleCopy);
  const risks = extractRiskyNumericClaims(scanText);
  const issues: ManagerContentIssue[] = [];
  for (const token of risks) {
    if (!normalizedEvidenceIncludes(token, trusted)) {
      issues.push({
        type: "unsupported_claim",
        severity: "high",
        note: `Deterministic Heidi card contains numeric/stat fragment "${token}" that is not grounded in extracted workflow evidence — replace with qualitative proof language.`,
      });
    }
  }

  const lowerCopy = scanText.toLowerCase();
  const relevancePositive = /\b(purple|pixel|arcade|neon|sci[- ]fi|relevance\s*ai)\b/i.test(lowerCopy);
  if (relevancePositive) {
    issues.push({
      type: "generic_channel_fit",
      severity: "high",
      note:
        "Deterministic Heidi card copy references Relevance/sci‑fi visual vocabulary — remove; use butter yellow / cream / burgundy editorial language only.",
    });
  }

  return issues;
}

/** Phase 2E — playbook-driven GPT LinkedIn image QA (visible contract length, cross-brand drift, paragraph asks). */
export function collectPlaybookLinkedInImageAssetIssues(
  workflow: WorkflowState,
  asset: GeneratedCampaignAsset,
  draft: CampaignExecutionDraft,
): ManagerContentIssue[] {
  if (!asset.playbook_driven || asset.platform !== "linkedin" || draft.type !== "linkedin_post") return [];

  const issues: ManagerContentIssue[] = [];
  const li = workflow.channel_intelligence?.linkedin;
  const promptBlob = `${asset.prompt}\n${asset.image_prompt_detailed ?? ""}\n${asset.negative_prompt ?? ""}`;

  if (/\blong\s+paragraph|wall\s+of\s+text|render\s+(?:a\s+)?full\s+paragraph/i.test(asset.prompt)) {
    issues.push({
      type: "weak_channel_format",
      severity: "medium",
      note:
        "[channel-visual] Playbook image prompt asks for long on-image paragraphs — visible copy must stay within the provided contract only.",
    });
  }

  if (asset.visible_text_contract) {
    let headline = "";
    try {
      const o = JSON.parse(asset.visible_text_contract) as { headline?: string; label?: string };
      headline = o.headline ?? "";
      if (headline.split(/\s+/).filter(Boolean).length > 10) {
        issues.push({
          type: "weak_channel_format",
          severity: "medium",
          note: "[channel-visual] visible_text_contract headline exceeds short on-image target (~8 words).",
        });
      }
    } catch {
      /* ignore malformed JSON */
    }
    const trusted = buildTrustedEvidenceBlob(workflow, draft as CampaignLinkedInPostDraft);
    for (const token of extractRiskyNumericClaims(asset.visible_text_contract)) {
      if (!trusted.toLowerCase().includes(token.toLowerCase().trim())) {
        issues.push({
          type: "unsupported_claim",
          severity: "high",
          note: `Playbook visible text includes "${token}" — not clearly grounded in extracted workflow evidence.`,
        });
      }
    }
  }

  if (li?.profile_id === HEIDI_AI_LINKEDIN_PLAYBOOK_ID) {
    if (/\b(level\s*up|relevance\s*live|pixel-?art|arcade\s+marquee|violet\s+pixel\s+world)\b/i.test(promptBlob)) {
      issues.push({
        type: "generic_channel_fit",
        severity: "high",
        note:
          "[channel-visual] Heidi playbook image prompt includes Relevance/arcade/pixel-forward motifs — keep Heidi yellow/cream/burgundy editorial direction.",
      });
    }
  }

  if (li?.profile_id === RELEVANCE_AI_LINKEDIN_PLAYBOOK_ID) {
    if (/\b(butter\s*yellow|heidi\s+loop|clinical\s+report\s+card|pale\s+lemon\s+yellow\s+field)\b/i.test(promptBlob)) {
      issues.push({
        type: "generic_channel_fit",
        severity: "high",
        note:
          "[channel-visual] Relevance playbook image prompt drifts toward Heidi clinical editorial cues — use purple/pixel/arcade/event energy per playbook.",
      });
    }
  }

  return issues;
}

/** Flags LinkedIn visual prompts that drift off seeded Channel Intelligence (Phase 2b). */
export function collectLinkedInVisualPromptIssues(
  workflow: WorkflowState,
  prompt: string,
  negativePrompt: string,
  opts?: { skipHeidiGptVisualCueCheck?: boolean },
): ManagerContentIssue[] {
  const li = workflow.channel_intelligence?.linkedin;
  if (!li) return [];

  const combined = `${prompt}\n${negativePrompt}`;
  const lowerP = prompt.toLowerCase();
  const lowerN = negativePrompt.toLowerCase();
  const issues: ManagerContentIssue[] = [];

  const robotHits = countRobotRiskMatches(combined);
  if (robotHits > 0) {
    issues.push({
      type: "weak_channel_format",
      severity: "high",
      note: `Robot/mech/android drift in visual brief (${robotHits} signal${robotHits === 1 ? "" : "s"}) — remove humanoid robots, mascots, power armor, mech suits, cybernetic chrome agents.`,
    });
  }

  const bannedOnImage = [
    ...(li.generation_rules.banned_on_image_copy_phrases ?? []),
    ...DEFAULT_GENERIC_ON_IMAGE_COPY_PHRASES,
  ];
  const prodHits = collectBannedOnImagePhraseHits(prompt, bannedOnImage);
  if (prodHits.length > 0) {
    issues.push({
      type: "weak_channel_format",
      severity: "medium",
      note: `Generic productivity/on-image SaaS clichés detected in prompt: ${prodHits.slice(0, 5).join(", ")}.`,
    });
  }

  if (li.profile_id === RELEVANCE_AI_LINKEDIN_PLAYBOOK_ID) {
    const playbookCue =
      /\b(purple|violet|magenta|lavender|pixel|arcade|neon|navy|level\s+up|relevance\s+live|agents@work|bootcamp|community|live\s+agent)\b/i.test(
        prompt,
      );
    if (!playbookCue) {
      issues.push({
        type: "weak_channel_format",
        severity: "medium",
        note:
          "Relevance visual brief lacks native cues (purple/violet/magenta/lavender palette, pixel-art human operators or arcade typography, Level Up / Relevance Live / live-agent community framing).",
      });
    }
    if (
      /\b(butter\s+yellow|pale\s+yellow|burgundy\s+serif|report[- ]card\s+editorial|cream\s+institutional\s+card)\b/i.test(
        lowerP,
      )
    ) {
      issues.push({
        type: "weak_channel_format",
        severity: "medium",
        note:
          "Relevance LinkedIn brief reads Heidi-yellow/editorial — restore purple/pixel/arcade-native world per playbook.",
      });
    }
  }

  if (li.profile_id === HEIDI_AI_LINKEDIN_PLAYBOOK_ID) {
    if (!opts?.skipHeidiGptVisualCueCheck) {
      const heidiCue =
        /\b(pale\s+yellow|butter\s+yellow|cream|off[- ]white|burgundy|dark\s+brown|serif|report[- ]card|healthcare|clinical|documentation|partnership\s+announcement|deterministic\s+heidi)\b/i.test(
          prompt,
        );
      if (!heidiCue) {
        issues.push({
          type: "weak_channel_format",
          severity: "medium",
          note:
            "Heidi brief lacks editorial cues (pale/butter yellow, cream/off-white, burgundy serif type, report-card/partnership/proof layouts, healthcare/clinical/documentation language).",
        });
      }
    }
    if (!opts?.skipHeidiGptVisualCueCheck) {
      if (
        /\b(purple|violet|magenta|lavender|pixel|arcade|neon|sci[- ]fi|cyber|mech|robot)\b/i.test(lowerP)
      ) {
        issues.push({
          type: "weak_channel_format",
          severity: "high",
          note:
            "Heidi LinkedIn brief contains Relevance/sci‑fi bleed (purple/pixel/arcade/neon/robot vocabulary) — use butter/cream/burgundy institutional editorial only.",
        });
      }
    }
  }

  const negativeCoverage = [/robot|android|mech|armor/, /stock/, /gradient|saas/, /neon|sci|pixel|arcade/, /brain/].filter(
    (re) => re.test(lowerN),
  ).length;
  if (negativeCoverage < 3) {
    issues.push({
      type: "weak_channel_format",
      severity: "low",
      note:
        "Negative prompt should reinforce rejecting robots/mech, stock photography, generic SaaS gradients, neon/pixel/arcade drift (profile-dependent), and vague AI brains.",
    });
  }

  return issues;
}

export function applyManagerContentReviews(
  drafts: CampaignExecutionDraft[],
  ctx: ManagerReviewDraftContext,
): {
  drafts: CampaignExecutionDraft[];
  manager_content_reviews: ManagerContentReview[];
  manager_critiques: ManagerCritique[];
  critique_logs: string[];
  governance_entries: GovernanceAuditEntry[];
} {
  if (drafts.length === 0) {
    return {
      drafts,
      manager_content_reviews: [],
      manager_critiques: [],
      critique_logs: [],
      governance_entries: [],
    };
  }

  let working = drafts.map((d) => ({ ...d })) as CampaignExecutionDraft[];
  const finals: ManagerContentReview[] = [];

  for (let i = 0; i < working.length; i += 1) {
    let draft = working[i];
    let review = reviewDraftAsManager({ draft, allDrafts: working, ctx });

    if (review.decision === "revise") {
      const { draft: revised, instruction } = rewriteDeterministic(draft, ctx, review.issues);
      working[i] = revised;
      draft = revised;

      const second = reviewDraftAsManager({ draft, allDrafts: working, ctx });

      const mergedReview: ManagerContentReview =
        second.decision === "revise" ?
          {
            ...second,
            revisionInstruction: buildRevisionInstruction(second, {
              rewriteAttempted: true,
              priorRewriteInstruction: instruction,
            }),
          }
        : second;

      finals.push(mergedReview);
      working[i] = attachReviewMeta(draft, mergedReview);
    } else {
      finals.push(review);
      working[i] = attachReviewMeta(draft, review);
    }
  }

  const critiques = finals.map((r, idx) => buildManagerCritiqueFromReview(r, working[idx]!, ctx));
  for (let i = 0; i < working.length; i += 1) {
    working[i] = {
      ...working[i]!,
      meta: {
        ...working[i]!.meta,
        manager_critique: critiques[i],
      },
    };
  }

  const critique_logs = buildCritiqueActivityLogs(critiques, working);

  const governance_entries: GovernanceAuditEntry[] = [];
  const approved = finals.filter((r) => r.decision === "approve").length;
  const revised = finals.filter((r) => r.decision === "revise").length;
  const avg =
    finals.length ? finals.reduce((s, r) => s + r.score, 0) / finals.length : 0;

  governance_entries.push(
    createGovernanceEntry({
      agent_id: "marketing_manager",
      display_agent_name: "Scott",
      step_id: "campaign_draft_generated",
      decision: `Manager content guardrail reviewed ${finals.length} drafts (${approved} approve / ${revised} revise).`,
      rationale: `Deterministic QA against reference overlap, generic AI phrasing, proof claims, channel voice, CTA strength, and cross-asset repetition. Average score ${avg.toFixed(1)}.`,
      resulting_asset: "campaign_execution_drafts",
    }),
  );

  const reviseSamples = finals
    .filter((r) => r.decision === "revise")
    .flatMap((r) => r.issues.filter((i) => i.severity === "high").map((i) => i.type))
    .slice(0, 5);

  if (reviseSamples.length) {
    governance_entries.push(
      createGovernanceEntry({
        agent_id: "marketing_manager",
        display_agent_name: "Scott",
        step_id: "campaign_draft_generated",
        decision: "Applied one deterministic rewrite pass where revise decisions triggered.",
        rationale: `Primary drivers included: ${reviseSamples.join(", ")}.`,
        resulting_asset: "manager_review",
      }),
    );
  }

  const blockerCritiques = critiques.filter((c) => c.severity === "blocker");
  const pushbackCritiques = critiques.filter((c) => c.severity === "pushback");
  governance_entries.push(
    createGovernanceEntry({
      agent_id: "marketing_manager",
      display_agent_name: "Scott",
      step_id: "campaign_draft_generated",
      decision: `Manager critique loop — ${critiques.length} critiques (${pushbackCritiques.length} pushbacks, ${blockerCritiques.length} blockers).`,
      rationale: `Top reason codes: ${summarizeTopReasonCodes(critiques)}. One bounded rewrite already applied where revise fired; critiques expose Scott ↔ Nova disagreement for judges.`,
      resulting_asset: "manager_critiques",
    }),
  );

  for (const c of blockerCritiques.slice(0, 5)) {
    governance_entries.push(
      createGovernanceEntry({
        agent_id: "marketing_manager",
        display_agent_name: "Scott",
        step_id: "campaign_draft_generated",
        decision: `Scott critique blocker on draft ${c.draftId ?? "unknown"}`,
        rationale: c.requestedAction ? `${c.critique.slice(0, 200)} Action: ${c.requestedAction.slice(0, 160)}` : c.critique.slice(0, 280),
        resulting_asset: "manager_critique",
      }),
    );
  }

  return {
    drafts: working,
    manager_content_reviews: finals,
    manager_critiques: critiques,
    critique_logs,
    governance_entries,
  };
}
