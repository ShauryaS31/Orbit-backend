import type {
  CampaignCarouselDraft,
  CampaignExecutionDraft,
  GovernanceAuditEntry,
  LyraWarmIntelligence,
  ManagerContentIssue,
  ManagerContentReview,
  ProductMarketingContext,
} from "@/lib/types/orbit";
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
  if (hasHigh || score < 75) return "revise";
  return "approve";
}

/** Maps issue types to concise revision asks for operators and downstream rewrite tooling. */
const ISSUE_TYPE_REVISION_HINT: Partial<Record<ManagerContentIssue["type"], string>> = {
  too_close_to_reference: "reduce repeated source-anchor phrasing; keep anchors as citations, not pasted prose",
  generic_copy: "replace generic AI filler with concrete founder/operator language",
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
      : `${draft.subject_line} · ${draft.meta.day}`;
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
    `${carousel.caption}\n\nCTA: ${primaryCta}\nEvidence anchor: ${anchor} (cite, don't paste reference paragraphs).`,
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

export function applyManagerContentReviews(
  drafts: CampaignExecutionDraft[],
  ctx: ManagerReviewDraftContext,
): {
  drafts: CampaignExecutionDraft[];
  manager_content_reviews: ManagerContentReview[];
  governance_entries: GovernanceAuditEntry[];
} {
  if (drafts.length === 0) {
    return { drafts, manager_content_reviews: [], governance_entries: [] };
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

  return {
    drafts: working,
    manager_content_reviews: finals,
    governance_entries,
  };
}
