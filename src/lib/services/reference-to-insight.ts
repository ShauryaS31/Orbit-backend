import type { LyraWarmIntelligence } from "@/lib/types/orbit";

/** Rotated LinkedIn structural IDs — synthesis-led, not recap-led. */
export const LINKEDIN_CHANNEL_FORMAT_IDS = [
  "founder_pov",
  "contrarian_take",
  "mini_case_study",
  "market_observation",
  "teardown_lesson",
  "build_in_public",
  "carousel_thesis",
] as const;

export type LinkedInChannelFormatId = (typeof LINKEDIN_CHANNEL_FORMAT_IDS)[number];

export interface ReferenceToInsightPlan {
  extracted_fact: string;
  strategic_insight: string;
  /** Narrative thesis operators should argue — distinct from operational `content_angle` labels. */
  campaign_angle: string;
  channel_format: string;
  avoid_phrases: string[];
  required_originality_rule: string;
  /** Scene cue for hyper-realistic image prompts (Instagram / shared visual brief). */
  instagram_visual_scene?: string;
}

interface AnchorInsightKernel {
  extracted_fact: string;
  strategic_insight: string;
  campaign_angle: string;
  instagram_visual_scene?: string;
}

function hashAnchor(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i += 1) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

function matchAnchorKernel(source_anchor: string): AnchorInsightKernel {
  const a = source_anchor.toLowerCase();

  const rules: Array<{ test: RegExp; kernel: AnchorInsightKernel }> = [
    {
      test: /anthropic|board game/i,
      kernel: {
        extracted_fact:
          "Lyra opted for a low-formality builder gathering with Anthropic instead of a staged enterprise panel.",
        strategic_insight:
          "Frontier AI trust accrues in dense builder rooms, not in polished sponsor theaters.",
        campaign_angle:
          "The partnerships that compound are the ones that feel like serious builders solving problems shoulder-to-shoulder.",
        instagram_visual_scene:
          "Evening builder table with boards, dice or casual game pieces blurred mid-motion, laptops half-open, warm practical lighting — documentary candid, not event signage.",
      },
    },
    {
      test: /lyra100|fellowship|take-home|hiring/i,
      kernel: {
        extracted_fact:
          "Lyra runs a high-bar hiring motion (Lyra100, Fellowship demand, rigorous take-homes) instead of volume recruiting.",
        strategic_insight:
          "Talent density is an execution advantage because it collapses coordination overhead.",
        campaign_angle:
          "When every adjacent seat is operator-grade, roadmaps compress without adding management theater.",
        instagram_visual_scene:
          "Fellowship cohort review session: laptops, printed rubrics, focused faces, whiteboard sketches — energetic but disciplined.",
      },
    },
    {
      test: /lyrathon|hackathon|student|iftar|community/i,
      kernel: {
        extracted_fact:
          "Lyra invests in sustained builder gravity (Lyrathon, student pipelines, community rituals) beyond hiring ads.",
        strategic_insight:
          "Community becomes a talent and execution flywheel when it ships alongside real technical craft.",
        campaign_angle:
          "The best recruiting signal is a room that already builds together.",
        instagram_visual_scene:
          "Hackathon floor energy: finalist table with messy cables, stickers on laptops, countdown tension on a secondary screen.",
      },
    },
    {
      test: /melbourne|multi-city|expansion/i,
      kernel: {
        extracted_fact:
          "Lyra scaled engineering execution across Sydney and Melbourne rather than centralizing quality in one floor myth.",
        strategic_insight:
          "Multi-city delivery works when standards travel as rituals and reviews, not as slide decks.",
        campaign_angle:
          "Scale should clone judgment and cadence — not dilute ownership.",
        instagram_visual_scene:
          "Melbourne engineering bay: desk pods, architecture diagrams taped up, pairing at one monitor, city dusk through windows.",
      },
    },
    {
      test: /readme|prophecy|hobbes|thunder compute/i,
      kernel: {
        extracted_fact:
          "Public-facing delivery spans regulated, infra-heavy, and product-led contexts — not landing-page fiction.",
        strategic_insight:
          "Operators award trust when proof spans heterogeneous stacks and stakeholder realities.",
        campaign_angle:
          "Show me one messy integration survived — not three polished case studies.",
        instagram_visual_scene:
          "War-room product diagram on glass wall with engineers gesturing at sequence flows and infra boundaries.",
      },
    },
    {
      test: /not a traditional|generic agency|saas startup/i,
      kernel: {
        extracted_fact:
          "Lyra positions as builder-native execution, deliberately rejecting generic agency and SaaS clichés.",
        strategic_insight:
          "Differentiation lives in operating rhythm and proof density — not category labels.",
        campaign_angle:
          "Say less about what you are called and more about how decisions get shipped.",
        instagram_visual_scene:
          "Founder-operator huddle beside whiteboard execution map — subtle exhausted realism, laptops closed halfway.",
      },
    },
  ];

  for (const r of rules) {
    if (r.test.test(a)) return r.kernel;
  }

  return {
    extracted_fact: `Ground truth tied to "${source_anchor}" — operational proof point from approved reference material.`,
    strategic_insight:
      "Execution credibility beats narrative polish when buyers own delivery risk.",
    campaign_angle:
      "Lead with how decisions ship under constraint — keep anecdotes as supporting evidence only.",
    instagram_visual_scene:
      "After-hours engineering table with laptops and architecture sketches — candid documentary framing.",
  };
}

function baseAvoidPhrases(warm?: LyraWarmIntelligence | null): string[] {
  const recap = [
    "we are excited to announce",
    "thrilled to announce",
    "join us for",
    "last night we hosted",
    "key takeaway",
    "in conclusion",
    "article recap",
    "according to the blog",
    "unlocking",
    "revolutionizing",
    "game-changer",
  ];
  const fromWarm = warm?.avoid_list ?? [];
  return [...new Set([...recap, ...fromWarm])];
}

export interface BuildReferenceToInsightPlanArgs {
  channel: "instagram" | "linkedin" | "email";
  source_anchor: string;
  content_angle?: string;
  business_goal?: string;
  success_metric?: string;
  lyraWarmIntelligence?: LyraWarmIntelligence | null;
  brand_learning_notes?: string[];
  day: number;
}

/**
 * Deterministic reference → synthesis kernel for campaign drafts.
 * No extra LLM — callers weave this into channel copy as the primary thesis layer.
 */
export function buildReferenceToInsightPlan(args: BuildReferenceToInsightPlanArgs): ReferenceToInsightPlan {
  const kernel = matchAnchorKernel(args.source_anchor);

  let channel_format: string;
  if (args.channel === "linkedin") {
    const idx = (args.day * 17 + hashAnchor(args.source_anchor)) % LINKEDIN_CHANNEL_FORMAT_IDS.length;
    channel_format = LINKEDIN_CHANNEL_FORMAT_IDS[idx]!;
  } else if (args.channel === "email") {
    channel_format = "one_to_one_operator_sequence";
  } else {
    channel_format = "visual_proof_carousel";
  }

  const goalHint =
    args.business_goal?.trim() || args.success_metric?.trim() ?
      ` Tie lightly to campaign targets (${[args.business_goal, args.success_metric].filter(Boolean).join("; ")}) without sounding like a KPI memo.`
    : "";

  const required_originality_rule =
    `Treat "${args.source_anchor}" as cited evidence only — infer one thesis line competitors would disagree with.${goalHint}` +
    ` Never reconstruct blog paragraph order or paste dossier sentences.`;

  return {
    extracted_fact: kernel.extracted_fact,
    strategic_insight: kernel.strategic_insight,
    campaign_angle: kernel.campaign_angle,
    channel_format,
    instagram_visual_scene: kernel.instagram_visual_scene,
    avoid_phrases: baseAvoidPhrases(args.lyraWarmIntelligence ?? undefined),
    required_originality_rule,
  };
}
