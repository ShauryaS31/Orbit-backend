import { enrichLinkedInIntelligenceWithPlaybook } from "@/lib/services/channel-playbook-loader";
import type {
  ChannelIntelligence,
  LinkedInChannelIntelligence,
  LinkedInPostFormatPattern,
} from "@/lib/types/orbit";

export const RELEVANCE_AI_LINKEDIN_PLAYBOOK_ID = "relevance_ai_linkedin_playbook_v1";
export const HEIDI_AI_LINKEDIN_PLAYBOOK_ID = "heidi_linkedin_playbook_v1";
const RELEVANCE_PROFILE_ID = RELEVANCE_AI_LINKEDIN_PLAYBOOK_ID;

/** Default banned on-image SaaS clichés when a playbook omits explicit copy bans (telemetry / QA). */
export const DEFAULT_GENERIC_ON_IMAGE_COPY_PHRASES = [
  "boost productivity",
  "increase efficiency",
  "work smarter",
  "transform your business",
  "streamline workflows",
  "ai-powered productivity",
  "automate everything",
] as const;

/** Regex for deterministic robot / mech drift scans (Phase 2b visual QA). */
export const LINKEDIN_ROBOT_RISK_PATTERN =
  /\b(humanoid\s+robot|humanoid\s+android|robot\s+mascot|android\s+face|power\s+armor|mech\s+suit|armored\s+suit|cybernetic\s+(?:body|limbs?)|chrome\s+robot|metal\s+agent)\b/gi;

/** Calendar / internal labels that must never read as public LinkedIn headlines. */
const INTERNAL_CALENDAR_HEADLINE_FRAGMENTS = [
  "kickoff post",
  "live event announcement",
  "thought leadership post",
  "awareness post",
  "engagement post",
  "educational post",
  "conversion post",
  "recap post",
  "campaign recap",
  "community engagement",
  "feature spotlight",
  "proof of impact",
  "community call to action",
  "wrap-up",
  "wrap up",
  "final call",
  "feedback request",
  "join the relevance community",
  "conclusion",
];

function isoNow(): string {
  return new Date().toISOString();
}

function normalizeCompanyKey(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .replace(/\/.*$/, "")
    .replace(/[^a-z0-9.-]+/g, "");
}

/** Full seeded playbook — Relevance AI LinkedIn-native style (reference only for generation). */
export function getRelevanceLinkedInIntelligence(): LinkedInChannelIntelligence {
  const now = isoNow();
  const postFormats: LinkedInPostFormatPattern[] = [
    {
      id: "gartner_authority_recognition_card",
      label: "Recognition / authority card",
      description: "Dark enterprise proof tile citing analyst or category momentum without hype.",
      caption_cadence_hint: "Lead with momentum signal + why operators care + invite to proof.",
      visual_card_type: "Dark navy recognition strip with arcade accent border",
    },
    {
      id: "relevance_live_event_card",
      label: "Relevance Live event card",
      description: "Live build session / community announcement with date-first energy.",
      caption_cadence_hint: "We're going live… + what we will build + who it is for + CTA.",
      visual_card_type: "Relevance Live stage card with pixel accent and magenta keyline",
    },
    {
      id: "level_up_meetup_poster",
      label: "Level Up meetup poster",
      description: "Community meetup poster-style post for GTM operators.",
      caption_cadence_hint: "Level Up is… + city/virt + what we practice + RSVP CTA.",
      visual_card_type: "Arcade poster layout, pixel avatar frame, violet background",
    },
    {
      id: "pixel_speaker_lineup",
      label: "Pixel-art speaker lineup",
      description: "Speaker grid with pixel portraits and agenda hook.",
      caption_cadence_hint: "Short intro + lineup tease + why agent-building matters + tune-in CTA.",
      visual_card_type: "Pixel portraits in a horizontal lineup on dark purple",
    },
    {
      id: "ai_ops_bootcamp_community_card",
      label: "AI Ops Bootcamp community card",
      description: "Training-forward post for practitioners building agents.",
      caption_cadence_hint: "Most teams don’t fail at AI because… + practice-led promise + join/build CTA.",
      visual_card_type: "Bootcamp badge + pixel mascot + lavender panels",
    },
    {
      id: "agents_at_work_case_study_carousel_hint",
      label: "Agents@Work enterprise case study",
      description: "Proof-led enterprise narrative with ops outcomes.",
      caption_cadence_hint: "Problem operators feel + agent workflow outcome + crisp metric + demo CTA.",
      visual_card_type: "Dark enterprise case-study panel with neon yellow stats accent",
    },
    {
      id: "product_ui_pixel_character_mockup",
      label: "Product UI mockup with pixel character",
      description: "SuperGTM-style workflow UI still with playful pixel guide.",
      caption_cadence_hint: "Ship/agents headline + workflow specificity + screenshot-safe framing.",
      visual_card_type: "Product UI chrome + pixel operator avatar overlay",
    },
  ];

  return {
    profile_id: RELEVANCE_PROFILE_ID,
    company_name: "Relevance AI",
    channel: "linkedin",
    source_mode: "seeded",
    visual_profile: {
      summary:
        "Electric purple, violet, magenta, lavender against dark navy/black with crisp white type; occasional neon yellow accents for stats.",
      palette: ["#7C3AED", "#A855F7", "#E879F9", "#DDD6FE", "#0F172A", "#020617", "#F8FAFC", "#FACC15"],
      motifs: [
        "pixel-art avatars",
        "arcade title typography",
        "Level Up wordmark rhythm",
        "Relevance Live stage framing",
        "GTM operator community tables",
        "dark enterprise proof cards",
      ],
      typography_style: ["Bold condensed arcade/display for headlines", "Clean geometric sans for supporting lines"],
      scene_types: [
        "community war-room",
        "live build stage",
        "operator meetup poster",
        "enterprise proof dashboard tile",
        "product UI hero with pixel mascot",
      ],
      avoid_visuals: [
        "humanoid robots",
        "robot mascots",
        "android faces",
        "power armor, mech suits, or armored sci-fi suits",
        "cybernetic chrome limbs or metal agent characters",
        "stock handshake photography",
        "generic blue SaaS gradients",
        "healthcare editorial serif vibe",
        "vague glowing AI brains",
        "generic productivity slogans as on-image headline text",
      ],
      image_generation_negative_rules: [
        "Do not use humanoid robots.",
        "Do not use robot mascots.",
        "Do not use android faces.",
        "Do not use power armor, armored suits, mech suits, cybernetic bodies, chrome robot limbs, or metal agent characters.",
        "Pixel avatars must read as human operators, speakers, community members, GTM leaders, product builders, or customers.",
      ],
      approved_on_image_text_motifs: [
        "Level Up",
        "Relevance Live",
        "Agents@Work",
        "AI Ops Bootcamp",
        "GTM Operators",
        "AI Workforce",
        "Live Agent Building",
        "Operator Build",
        "Agent Builder",
        "Case Study",
        "Speaker Lineup",
      ],
    },
    voice_profile: {
      summary:
        "Short, direct, energetic captions for GTM operators and AI-agent builders; category-building confidence with proof-led specificity.",
      tone_markers: ["community-led", "operator-native", "playful-but-serious", "proof-forward"],
      vocabulary: [
        "AI workforce",
        "AI agents",
        "agent-building",
        "agentic AI",
        "GTM operators",
        "Level Up",
        "Relevance Live",
        "Agents@Work",
        "live agent building",
        "operator workflows",
      ],
      opening_cadence_examples: [
        "We're excited to…",
        "We're going live…",
        "Level Up is…",
        "Most enterprises don't fail at AI because…",
      ],
      audience: "Founders, GTM leaders, RevOps, and builders shipping agentic workflows.",
    },
    post_format_patterns: postFormats,
    generation_rules: {
      headline_rules: [
        "Never start public headlines with “Day 1”, “Day 2”, or any Day N calendar prefix.",
        "Never use internal labels as headlines: Kickoff Post, Announcement, Awareness Post, Engagement Post, Thought Leadership Post, Educational Post, Conversion Post, Recap Post, Live Event Announcement.",
        "Prefer native shells: Level Up: [topic], Relevance Live: [session], Agents@Work: [proof], AI Ops Bootcamp: [community angle], The AI Workforce: [POV], Most [team type] don’t fail because [reason], Build [workflow/agent] live — not in slides.",
        "Avoid lecture titles like “Introduction to…” — substitute category-forward hooks tied to AI workforce / agent teams.",
        "Keep headlines short (under ~90 characters), punchy, operator-readable.",
        "Rotate headline archetypes across the sequence — do not repeat the same franchise line every day.",
        "Never emit awkward merges like “Build Join…” — community CTAs belong in captions, not glued into Build‑in‑Product shells.",
        "Pixel-art figures must scan as human operators, speakers, community members, GTM leaders, product builders, or customers — never humanoid robots or chrome mascots.",
      ],
      body_rules: [
        "Short paragraphs; one proof point minimum",
        "Use community and operator vocabulary; no generic SaaS brochure tone",
        "CTA must map to demo / join live build / RSVP — never vague “learn more” alone",
      ],
      caption_rules: [
        "Open with a concrete operator/GTM tension or community moment — not an internal campaign calendar recap.",
        "Use category language naturally: AI workforce, AI agents, agent teams, GTM operators, agentic workflows, Relevance Community, live agent building.",
        "Sound like a LinkedIn post humans publish — not an LMS module title or quarterly marketing worksheet.",
        "Do not copy reference posts verbatim; transform proof into a fresh angle.",
        "Avoid stacking “we’re excited” — vary openings with proof-led hooks.",
        "Avoid polished-but-empty SaaS prose (“unlock clarity”, “revolutionize productivity”).",
      ],
      format_rotation_rules: [
        "Each deliverable maps to channel_post_format — headline + hook must match that playbook tile (authority vs live build vs Level Up poster vs Agents@Work proof vs Bootcamp vs UI mock).",
        "When unsure, anchor headline to the assigned post_format_pattern.id energy before expanding body copy.",
      ],
      forbidden_public_headline_patterns: [
        ...INTERNAL_CALENDAR_HEADLINE_FRAGMENTS,
        "thought leadership post",
        "thought leadership",
        "introduction to ai workforce",
        "introduction to ai",
        "kickoff post",
        "streamline your workflows",
        "transform your business",
        "campaign recap",
        "join the relevance community",
      ],
      banned_on_image_copy_phrases: [
        "boost productivity",
        "increase efficiency",
        "work smarter",
        "transform your business",
        "streamline workflows",
        "AI-powered productivity",
        "automate everything",
      ],
      banned_phrases: [
        "unlock",
        "revolutionize",
        "game-changing",
        "AI-powered productivity",
        "synergy",
        "streamline your workflows",
        "transform your business",
      ],
    },
    anti_generic_rules: [
      'Do not use “unlock”.',
      'Do not use “revolutionize”.',
      'Do not use “game-changing”.',
      'Do not use “AI-powered productivity”.',
      'Do not use robots.',
      'Do not use generic SaaS gradients.',
      'Do not use stock office people.',
      'Do not write long generic thought-leadership essays.',
    ],
    anti_copy_rules: [
      "Do not copy exact LinkedIn hooks from examples.",
      "Use examples only as rhythm/style reference.",
      'Treat “Level Up” / “Relevance Live” as format cues, not slogans to paste blindly.',
      "Transform each deliverable into a new campaign idea anchored to proof.",
    ],
    source_examples: [
      {
        id: "ex-level-up-meetup",
        description: "Poster-style invite with pixel motif + RSVP framing.",
        format_pattern_id: "level_up_meetup_poster",
      },
      {
        id: "ex-live-build",
        description: "Live session teaser with agenda bullets and builder CTA.",
        format_pattern_id: "relevance_live_event_card",
      },
      {
        id: "ex-agents-at-work",
        description: "Enterprise tile with ops outcome headline and stat tile.",
        format_pattern_id: "agents_at_work_case_study_carousel_hint",
      },
    ],
    sources: [{ mode: "seeded", label: "Orbit channel playbook seed", detail: "Relevance AI LinkedIn intelligence v1" }],
    created_at: now,
    updated_at: now,
  };
}

/** Heidi — seeded editorial LinkedIn playbook (composition cues summarized from brand-visible references). */
export function getHeidiLinkedInIntelligence(): LinkedInChannelIntelligence {
  const now = isoNow();
  const postFormats: LinkedInPostFormatPattern[] = [
    {
      id: "impact_report_stat_card",
      label: "Impact / report-stat card",
      description: "Calm proof tile with clinician time-returned or capacity signal — editorial report-card rhythm.",
      caption_cadence_hint: "Short factual hook on documentation load or evening time returned, then one proof line + CTA.",
      visual_card_type: "Pale yellow report card with burgundy serif headline and single stat ribbon",
    },
    {
      id: "partnership_announcement_card",
      label: "Partnership announcement card",
      description: "Institutional partnership tile with restrained logo frames and serif title.",
      caption_cadence_hint: "What the partnership enables for clinicians + what stays steady on the floor + next step.",
      visual_card_type: "Cream partnership panel, burgundy title, minimal blue only for partner marks",
    },
    {
      id: "clinician_burnout_truth_post",
      label: "Clinician burnout truth post",
      description: "Direct statement on admin load, capacity, or after-hours documentation — proof-led, no hype.",
      caption_cadence_hint: "Name the tension (paperwork/capacity) + one tangible outcome + calm CTA.",
      visual_card_type: "Soft yellow editorial panel, serif headline, subtle corner line-art",
    },
    {
      id: "founder_or_doctor_recognition_card",
      label: "Founder / doctor recognition card",
      description: "Recognition tile celebrating a clinician leader or founder moment — institutional, warm.",
      caption_cadence_hint: "Who + why they matter to care teams + humble proof + invite to conversation.",
      visual_card_type: "Cream role-safe card layout (stylized silhouette cues — no stock portraits), burgundy type",
    },
    {
      id: "conference_panel_card",
      label: "Conference / panel card",
      description: "Session or panel announcement with agenda clarity and healthcare context.",
      caption_cadence_hint: "Session focus on documentation or operations + audience + register/visit CTA.",
      visual_card_type: "Butter-yellow panel, agenda hints, serif titles",
    },
    {
      id: "customer_rollout_card",
      label: "Customer rollout card",
      description: "Care network or practice rollout proof with operational specifics.",
      caption_cadence_hint: "Rollout scope + clinician benefit + one grounded reassurance where relevant.",
      visual_card_type: "Report-card stat + abstract regional motif (no readable map labels)",
    },
    {
      id: "simple_brand_statement_card",
      label: "Simple brand statement card",
      description: "Minimal brand philosophy or product truth — one sentence institutional energy.",
      caption_cadence_hint: "One calm thesis on time returned to care + optional proof footnote.",
      visual_card_type: "Cream minimalist card, Heidi loop motif, burgundy serif headline",
    },
  ];

  return {
    profile_id: HEIDI_AI_LINKEDIN_PLAYBOOK_ID,
    company_name: "Heidi",
    channel: "linkedin",
    source_mode: "seeded",
    visual_profile: {
      summary:
        "Warm pale butter-yellow fields and cream/off-white surfaces with deep burgundy or dark brown serif headlines; institutional healthcare editorial cards with soft corner line-art and a subtle Heidi flower-loop motif — calm proof-forward layouts.",
      palette: ["#FFF9E6", "#FEFCE8", "#FCFAF8", "#F5F0E8", "#5C1A1B", "#3D2419", "#28030F", "#E8F1FB"],
      motifs: [
        "Heidi flower-loop glyph",
        "soft botanical line-art in corners",
        "report-card and healthcare proof tiles",
        "partnership announcement strips",
        "clinician time-returned stat ribbons",
      ],
      typography_style: ["Serif editorial headlines readable on yellow/cream", "Clean humanist sans for supporting facts"],
      scene_types: [
        "editorial report-card hero",
        "partnership announcement panel",
        "clinician proof/stat ribbon layout",
        "conference agenda tile",
        "minimal institutional statement card",
      ],
      avoid_visuals: [
        "neon gradients",
        "arcade or pixel art",
        "sci-fi holographic UI",
        "robots or AI brain blobs",
        "stock office photography",
        "purple SaaS dashboards",
        "hyperbolic AI hype imagery",
        "generic blue gradient SaaS backgrounds",
      ],
      image_generation_negative_rules: [
        "No neon, arcade, pixel art, sci-fi chrome, robots, stock office photography, generic AI brains, or purple SaaS dashboard motifs.",
        "Anchor palette on pale yellow/butter yellow and cream/off-white with burgundy/dark brown type; minimal blue accents only when partner-logo neutrality requires it.",
      ],
      approved_on_image_text_motifs: [
        "Relief on the Record",
        "Your AI care partner",
        "59 minutes",
        "Documentation steals time from care",
        "Partnership",
        "Clinicians get their evenings back",
        "Capacity returned to care",
      ],
    },
    voice_profile: {
      summary:
        "Clinical, direct, calm, proof-led voice for clinicians and healthcare operators — foreground paperwork burden, capacity, and patient-facing time.",
      tone_markers: ["clinical", "direct", "calm", "proof-led", "trust-forward"],
      vocabulary: [
        "clinicians",
        "documentation",
        "patient care",
        "capacity",
        "paperwork",
        "burnout",
        "after-hours notes",
        "care teams",
        "clinical operations",
      ],
      opening_cadence_examples: [
        "Clinicians lose minutes at the keyboard…",
        "Documentation pulls attention away from patients…",
        "When evenings disappear to charts…",
      ],
      audience:
        "Healthcare operators, clinical leads, practice managers, and clinician champions evaluating documentation burden.",
    },
    post_format_patterns: postFormats,
    generation_rules: {
      headline_rules: [
        "Never start headlines with Day N: calendar scaffolding.",
        "Keep headlines short (~90 characters), factual, editorial-readable.",
        "Prefer hooks tied to documentation load, capacity returned to care, partnerships, or clinician time.",
        "Never paste internal worksheet labels (Kickoff Post, Campaign Recap, Summary, Conclusion, Feedback Request).",
      ],
      body_rules: [
        "Short factual caption first, then proof — avoid hype stacking.",
        "Ground claims in clinician-centric pains: paperwork, burnout, capacity, evenings returned.",
      ],
      caption_rules: [
        "Lead with a concrete healthcare operations tension or outcome.",
        "Mention clinicians, documentation, patient care, or capacity where natural.",
        "Avoid AI hype framing — describe workflow relief and evidence.",
        "Do not copy reference rhythms verbatim; paraphrase into fresh angles.",
      ],
      format_rotation_rules: [
        "Each deliverable maps to channel_post_format — headline + hook must match that editorial tile (stat vs partnership vs recognition vs rollout).",
      ],
      forbidden_public_headline_patterns: [...INTERNAL_CALENDAR_HEADLINE_FRAGMENTS, "campaign recap"],
      banned_on_image_copy_phrases: [...DEFAULT_GENERIC_ON_IMAGE_COPY_PHRASES],
      banned_phrases: [
        "unlock",
        "revolutionize",
        "game-changing",
        "future of work",
        "AI-powered productivity",
        "streamline workflows",
        "next-gen AI",
      ],
    },
    anti_generic_rules: [
      'Avoid “unlock”, “revolutionize”, “game-changing”, “future of work”.',
      "Avoid neon, arcade, pixel, sci-fi, robots, stock offices, generic AI brains.",
      "No gradient SaaS brochure backgrounds.",
      "Prefer institutional editorial calm over hype.",
    ],
    anti_copy_rules: [
      "Do not mirror example posts verbatim.",
      "Use motifs as rhythm cues — paraphrase every hook.",
      "Composition references are seeded summaries — never claim live web scraping.",
    ],
    source_examples: [
      {
        id: "ex-heidi-report-card",
        description: "Butter-yellow editorial stat tile emphasizing clinician time relief.",
        format_pattern_id: "impact_report_stat_card",
      },
      {
        id: "ex-heidi-partnership",
        description: "Cream partnership announcement with restrained serif headline.",
        format_pattern_id: "partnership_announcement_card",
      },
      {
        id: "ex-heidi-truth-post",
        description: "Direct clinician-documentation tension post with calm proof strip.",
        format_pattern_id: "clinician_burnout_truth_post",
      },
    ],
    sources: [{ mode: "seeded", label: "Orbit channel playbook seed", detail: "Heidi LinkedIn intelligence v1" }],
    created_at: now,
    updated_at: now,
  };
}

export function getSeededLinkedInIntelligenceForCompany(companyNameOrUrl: string): LinkedInChannelIntelligence | undefined {
  const key = normalizeCompanyKey(companyNameOrUrl);
  const lower = companyNameOrUrl.toLowerCase();
  if (key.includes("heidi") || lower.includes("heidi")) {
    return getHeidiLinkedInIntelligence();
  }
  if (
    key === "relevanceai.com" ||
    key.endsWith("relevanceai.com") ||
    key.includes("relevanceai") ||
    lower.includes("relevance ai") ||
    lower.includes("relevanceai")
  ) {
    return getRelevanceLinkedInIntelligence();
  }
  return undefined;
}

export type ResolveChannelIntelligenceInput = {
  companyUrl: string;
  companyName?: string;
};

/** Resolves optional channel intelligence — only attaches when a seeded playbook exists. */
export function resolveChannelIntelligence(input: ResolveChannelIntelligenceInput): ChannelIntelligence | undefined {
  const fromUrl = getSeededLinkedInIntelligenceForCompany(input.companyUrl);
  const fromName = input.companyName ? getSeededLinkedInIntelligenceForCompany(input.companyName) : undefined;
  const linkedin = fromUrl ?? fromName;
  if (!linkedin) return undefined;
  return { linkedin: enrichLinkedInIntelligenceWithPlaybook(linkedin) };
}

/** Compact summary for LLM system prompts (Nova / Scott). */
export function summarizeLinkedInIntelligenceForPrompt(intelligence: LinkedInChannelIntelligence): string {
  const vf = intelligence.visual_profile;
  const vo = intelligence.voice_profile;
  const vocab = vo.vocabulary.slice(0, 12).join(", ");
  const motifs = vf.motifs.slice(0, 6).join("; ");
  const formats = intelligence.post_format_patterns.map((p) => `${p.id}: ${p.label}`).join(" | ");
  const gr = intelligence.generation_rules;
  return [
    `LinkedIn Channel Intelligence (${intelligence.profile_id}, ${intelligence.source_mode}).`,
    `Company: ${intelligence.company_name}.`,
    `Voice: ${vo.summary}`,
    `Use vocabulary cues where natural: ${vocab}.`,
    `Avoid banned phrases: ${gr.banned_phrases.join(", ")}.`,
    gr.banned_on_image_copy_phrases?.length ?
      `Banned readable on-image clichés: ${gr.banned_on_image_copy_phrases.slice(0, 10).join(", ")}.`
    : "",
    `Headline doctrine: ${gr.headline_rules.slice(0, 6).join(" ")}`,
    gr.caption_rules?.length ? `Caption doctrine: ${gr.caption_rules.slice(0, 4).join(" ")}` : "",
    gr.format_rotation_rules?.length ? `Format rotation: ${gr.format_rotation_rules.join(" ")}` : "",
    `Preferred post formats (rotate ideas): ${formats}.`,
    `Visual motifs for references when describing imagery: ${motifs}.`,
    intelligence.anti_copy_rules.join(" "),
  ]
    .filter(Boolean)
    .join("\n");
}

export function buildLinkedInVisualRulesForPrompt(intelligence: LinkedInChannelIntelligence): string {
  const vf = intelligence.visual_profile;
  const gr = intelligence.generation_rules;
  const lines = [
    "VISUAL STANDARD — LinkedIn hero image:",
    vf.summary,
    `Palette cues: ${vf.palette.slice(0, 8).join(", ")}.`,
    `Motifs: ${vf.motifs.join("; ")}.`,
    `Typography: ${vf.typography_style.join("; ")}.`,
    `Scene types: ${vf.scene_types.join("; ")}.`,
    `NEGATIVE / AVOID: ${vf.avoid_visuals.join("; ")}.`,
  ];
  if (vf.image_generation_negative_rules?.length) {
    lines.push(`IMAGE-GEN HARD NEGATIVES — ${vf.image_generation_negative_rules.join(" ")}`);
  }
  if (vf.approved_on_image_text_motifs?.length) {
    lines.push(`Approved SHORT on-image franchises when native (never long SaaS slogans): ${vf.approved_on_image_text_motifs.join(", ")}.`);
  }
  if (gr.banned_on_image_copy_phrases?.length) {
    lines.push(`Never render readable on-image boilerplate such as: ${gr.banned_on_image_copy_phrases.join("; ")}.`);
  }
  return lines.join("\n");
}

export function buildLinkedInVoiceRulesForPrompt(intelligence: LinkedInChannelIntelligence): string {
  const vo = intelligence.voice_profile;
  const gr = intelligence.generation_rules;
  return [
    "VOICE STANDARD — LinkedIn copy:",
    vo.summary,
    `Tone markers: ${vo.tone_markers.join(", ")}.`,
    `Audience: ${vo.audience}.`,
    `Banned phrases: ${gr.banned_phrases.join(", ")}.`,
    `HEADLINE RULES: ${gr.headline_rules.join(" | ")}`,
    ...(gr.caption_rules?.length ? [`CAPTION RULES: ${gr.caption_rules.join(" | ")}`] : []),
    ...(gr.forbidden_public_headline_patterns?.length ?
      [`Forbidden headline crumbs: ${gr.forbidden_public_headline_patterns.slice(0, 14).join(", ")}.`]
    : []),
    `Anti-generic: ${intelligence.anti_generic_rules.slice(0, 6).join(" ")}`,
  ].join("\n");
}

export function buildLinkedInHeadlineRulesCompact(intelligence: LinkedInChannelIntelligence): string {
  const gr = intelligence.generation_rules;
  return [
    ...gr.headline_rules,
    ...(gr.forbidden_public_headline_patterns ?? []).slice(0, 12).map((p) => `Never put "${p}" in the public headline.`),
  ].join(" ");
}

/** Removes Day N calendar prefixes from headline stubs. */
export function stripCalendarPrefix(headline: string): string {
  return headline.replace(/^\s*day\s*\d+\s*[:;\-–—]\s*/i, "").trim();
}

function shortenTopic(text: string, max = 42): string {
  const t = text.replace(/\s+/g, " ").trim();
  if (t.length <= max) return t;
  return `${t.slice(0, Math.max(0, max - 1)).trim()}…`;
}

const PRODUCT_UI_FALLBACK_HEADLINES = [
  "Build the AI Workforce in Product, Not in Docs",
  "Ship Agent Workflows From the Product",
  "Turn Agent Work Into a Product Moment",
] as const;

/** Phase 2b — scrub awkward Relevance public headlines (模板 merges, calendar crumbs). */
export function scrubAwkwardRelevancePublicHeadline(
  headline: string,
  patternId: string,
  day: number,
  deliverableIndex: number,
  topicSeed: string,
): string {
  let h = headline.trim();
  const lower = h.toLowerCase();

  const badSeedInProductUi =
    patternId === "product_ui_pixel_character_mockup" &&
    /\bbuild\b/i.test(h) &&
    /\bin\s+product\b/i.test(lower) &&
    (/join\b/i.test(lower) || /\brelevance\s+community\b/i.test(lower));

  const awkward =
    badSeedInProductUi ||
    /^build\s+join\b/i.test(h) ||
    /\bbuild\s+join\b/i.test(h) ||
    /^build\s+final\s+call\b/i.test(lower) ||
    /\bfinal\s+call\b/i.test(lower) ||
    /\bfeedback\s+request\b/i.test(lower) ||
    /\bcampaign\s+recap\b/i.test(lower) ||
    /^wrap-up\b/i.test(lower) ||
    /^wrap\s+up\b/i.test(lower) ||
    /^summary\b/i.test(lower) ||
    /\bconclusion\b/i.test(lower);

  if (!awkward) return shortenTopic(h, 90);

  if (patternId === "product_ui_pixel_character_mockup") {
    const pool = PRODUCT_UI_FALLBACK_HEADLINES;
    return pool[headlineRotationIndex(day, deliverableIndex, `${topicSeed}|p2b`) % pool.length]!;
  }

  const cleanedTopic =
    /\b(join|community\s+call|final\s+call|feedback)\b/i.test(topicSeed) ?
      "Agent Teams & Operator Workflows"
    : topicSeed;
  return chooseRelevanceHeadlinePattern(patternId, cleanedTopic, day, deliverableIndex + 11);
}

/** Deterministic QA — Relevance headlines that must never ship as public titles. */
export function isAwkwardRelevancePublicHeadline(headline: string): boolean {
  const h = headline.trim();
  const lower = h.toLowerCase();
  if (/^\s*day\s*\d+\b/i.test(h)) return true;
  if (/build\s+join\b/i.test(lower)) return true;
  if (/^build\s+final\s+call\b/i.test(lower)) return true;
  if (/\bfinal\s+call\b/i.test(lower)) return true;
  if (/\bfeedback\s+request\b/i.test(lower)) return true;
  return false;
}

/** Topic seed for Heidi headline templates — strips calendar / recap crumbs. */
export function extractTopicSeedForHeidiHeadline(rawTitle: string, proofSnippet?: string, deliverableTitle?: string): string {
  let s = stripCalendarPrefix(rawTitle).trim();
  const lower = s.toLowerCase();
  for (const frag of INTERNAL_CALENDAR_HEADLINE_FRAGMENTS) {
    if (frag.length >= 4 && lower.includes(frag)) {
      s = s.replace(new RegExp(frag.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi"), " ");
    }
  }
  s = s.replace(/\s+/g, " ").trim();
  if (s.length >= 10) return shortenTopic(s, 52);

  const proof = proofSnippet?.replace(/\s+/g, " ").trim() ?? "";
  if (proof.length >= 12) return shortenTopic(proof, 52);

  const dt = deliverableTitle?.replace(/\s+/g, " ").trim() ?? "";
  const cleanedDt = stripCalendarPrefix(dt).replace(/^linkedin\s+post\s*:?\s*/i, "").trim();
  if (cleanedDt.length >= 12 && !/^day\s*\d+/i.test(cleanedDt)) return shortenTopic(cleanedDt, 52);

  return "Clinical documentation load";
}

/** Topic seed for {{TOPIC}} templates — avoids calendar crumbs. */
export function extractTopicSeedForRelevanceHeadline(rawTitle: string, proofSnippet?: string, deliverableTitle?: string): string {
  let s = stripCalendarPrefix(rawTitle).trim();
  const lower = s.toLowerCase();
  for (const frag of INTERNAL_CALENDAR_HEADLINE_FRAGMENTS) {
    if (frag.length >= 4 && lower.includes(frag)) {
      s = s.replace(new RegExp(frag.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi"), " ");
    }
  }
  s = s.replace(/\s+/g, " ").trim();
  if (s.length >= 10) return shortenTopic(s);

  const proof = proofSnippet?.replace(/\s+/g, " ").trim() ?? "";
  if (proof.length >= 12) return shortenTopic(proof);

  const dt = deliverableTitle?.replace(/\s+/g, " ").trim() ?? "";
  const cleanedDt = stripCalendarPrefix(dt).replace(/^linkedin\s+post\s*:?\s*/i, "").trim();
  if (cleanedDt.length >= 12 && !/^(day\s*\d+)/i.test(cleanedDt)) return shortenTopic(cleanedDt);

  return "Agent Teams & Operator Workflows";
}

function headlineRotationIndex(day: number, deliverableIndex: number, seed: string): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i += 1) h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
  return Math.abs(day * 524287 + deliverableIndex * 131071 + h);
}

/** True when headline reads like internal calendar scaffolding. */
export function isCalendarGenericLinkedInHeadline(headline: string, intelligence?: LinkedInChannelIntelligence): boolean {
  const h = headline.trim();
  if (/^\s*day\s*\d+\b/i.test(h)) return true;

  const lower = h.toLowerCase();
  const forbidden = [
    ...INTERNAL_CALENDAR_HEADLINE_FRAGMENTS,
    ...(intelligence?.generation_rules.forbidden_public_headline_patterns ?? []),
  ].filter(Boolean);

  for (const frag of forbidden) {
    if (frag.length >= 5 && lower.includes(frag.toLowerCase())) return true;
  }

  if (
    /\bkickoff post\b|\beducational post\b|\bconversion post\b|\bawareness post\b|\bengagement post\b|\bthought leadership post\b|\blive event announcement\b|\bcommunity call to action\b/i.test(
      lower,
    )
  ) {
    return true;
  }

  return false;
}

function replaceTopic(template: string, topic: string): string {
  return template.replace(/\{\{TOPIC\}\}/g, topic).replace(/\s+/g, " ").trim();
}

/**
 * Deterministic headline pick from playbook format id + rotation (Phase 2).
 * Uses channel_post_format pattern id from Phase 1 seeds.
 */
export function chooseRelevanceHeadlinePattern(
  patternId: string,
  topicSeed: string,
  day: number,
  deliverableIndex: number,
): string {
  const topic = shortenTopic(topicSeed, 46);
  const ix = headlineRotationIndex(day, deliverableIndex, `${patternId}|${topic}`);
  const pools: Record<string, readonly string[]> = {
    gartner_authority_recognition_card: [
      "Category Signal: AI Workforce Momentum",
      "Analyst Moment for Agent Teams",
      "Proof the AI Workforce Left the Slide Deck",
      "The AI Workforce Earned Its Analyst Mention",
    ],
    relevance_live_event_card: [
      "Relevance Live: Build Agents in Public",
      "Relevance Live — Live Agent Building Session",
      "Build Agents Live, Not in Slides",
      "We’re Going Live: Operator Agent Build",
    ],
    level_up_meetup_poster: [
      "Level Up: {{TOPIC}}",
      "Level Up — GTM Operators Building Agents",
      "Level Up Meetup Energy for Agent Builders",
      "Level Up: Operator Workflows & Agent Teams",
    ],
    pixel_speaker_lineup: [
      "Relevance Live Lineup — Pixel Speakers + Agent Builds",
      "Who’s Shipping Agents Next — Speaker Grid",
      "Pixel Speakers + Live Agent Blueprints",
      "Operator Lineup: Builders on the Arcade Stage",
    ],
    ai_ops_bootcamp_community_card: [
      "AI Ops Bootcamp: Build the Workflow, Not the Deck",
      "Most RevOps Teams Don’t Fail Because the Stack Breaks",
      "Bootcamp Mode for Agent Builders",
      "Practice Agentic Workflows With Operators Who Ship",
    ],
    agents_at_work_case_study_carousel_hint: [
      "Agents@Work: {{TOPIC}}",
      "Agents@Work Proof — {{TOPIC}}",
      "{{TOPIC}} — Agents@Work Signal",
      "Enterprise Agents@Work — Ops Outcomes First",
    ],
    product_ui_pixel_character_mockup: [
      "Ship Agent Workflows Without Another Slide Deck",
      "SuperGTM Energy — UI Meet Pixel Operator Guide",
      "Build {{TOPIC}} in Product, Not in Docs",
      "Agent Console Preview — Operators in the Loop",
    ],
  };

  const pool = pools[patternId] ?? pools.level_up_meetup_poster!;
  const raw = pool[ix % pool.length]!;
  const filled = raw.includes("{{TOPIC}}") ? replaceTopic(raw, topic) : raw;
  return shortenTopic(filled, 90);
}

export function buildRelevanceNativeHeadline(
  patternId: string,
  topicSeed: string,
  day: number,
  deliverableIndex: number,
): string {
  return chooseRelevanceHeadlinePattern(patternId, topicSeed, day, deliverableIndex);
}

export function chooseHeidiHeadlinePattern(
  patternId: string,
  topicSeed: string,
  day: number,
  deliverableIndex: number,
): string {
  const topic = shortenTopic(topicSeed, 44);
  const ix = headlineRotationIndex(day, deliverableIndex, `heidi|${patternId}|${topic}`);
  const pools: Record<string, readonly string[]> = {
    impact_report_stat_card: [
      "Relief on the Record — {{TOPIC}}",
      "{{TOPIC}} — Time Returned to Patient Care",
      "Capacity Returned Where Clinicians Need It",
      "Clinical Minutes Stay With Patients",
    ],
    partnership_announcement_card: [
      "Partnership — Extending Care Without Adding Noise",
      "{{TOPIC}} — Clinical Documentation, Calmly Scaled",
      "Partnership Built for Frontline Clinicians",
      "Healthcare Operators Deserve Quieter Rollouts",
    ],
    clinician_burnout_truth_post: [
      "Documentation Steals Minutes From Patient Eyes",
      "{{TOPIC}} — Paperwork Pulls Capacity Away From Beds",
      "Evenings Lost to Charts Aren't Abstract",
      "Burnout Shows Up as Minutes, Not Slogans",
    ],
    founder_or_doctor_recognition_card: [
      "Recognition — Leaders Keeping Care Humane",
      "{{TOPIC}} — Clinical Credibility, Quietly Earned",
      "Honoring Operators Who Protect Patient Face-Time",
      "Medical Leaders Bearing Admin Load Truthfully",
    ],
    conference_panel_card: [
      "Panel — Documentation Load Meets Practical Relief",
      "{{TOPIC}} — Clinical Ops on Stage",
      "Healthcare Operators — Capacity on the Agenda",
      "Conference Moment — Notes Without the Noise",
    ],
    customer_rollout_card: [
      "Rollout — Care Teams Getting Evenings Back",
      "{{TOPIC}} — Structured Notes Without the Theater",
      "Clinical Networks Choosing Quieter Admin",
      "Proof From Practices Shipping Relief",
    ],
    simple_brand_statement_card: [
      "Your AI Care Partner — Grounded in Clinical Workflow",
      "{{TOPIC}} — Proof-Led Documentation Relief",
      "Calm Healthcare Statements Win Operator Trust",
      "Heidi — Time Returned to Care",
    ],
  };
  const pool = pools[patternId] ?? pools.impact_report_stat_card!;
  const raw = pool[ix % pool.length]!;
  const filled = raw.includes("{{TOPIC}}") ? replaceTopic(raw, topic) : raw;
  return shortenTopic(filled, 90);
}

export function buildHeidiNativeHeadline(
  patternId: string,
  topicSeed: string,
  day: number,
  deliverableIndex: number,
): string {
  return chooseHeidiHeadlinePattern(patternId, topicSeed, day, deliverableIndex);
}

function scrubHeidiPublicHeadline(
  headline: string,
  day: number,
  deliverableIndex: number,
  intelligence: LinkedInChannelIntelligence,
): string {
  const h = headline.trim();
  if (/^\s*day\s*\d+\b/i.test(h) || isCalendarGenericLinkedInHeadline(h, intelligence)) {
    const pool = [
      "Documentation Shouldn't Steal Patient-Facing Minutes",
      "Capacity Belongs in the Clinic, Not the Inbox",
      "Relief on the Record — Evenings Returned to Clinicians",
    ] as const;
    return pool[headlineRotationIndex(day, deliverableIndex, "heidi-fallback") % pool.length]!;
  }
  return shortenTopic(stripCalendarPrefix(h), 90);
}

/** Phase 2 — coerce Nova headline into feed-native headline when Relevance playbook is active. */
/** Whether headline roughly matches assigned playbook tile energy (post-normalization QA). */
export function headlineAlignedWithLinkedInPostFormat(headline: string, formatId: string): boolean {
  const h = headline.toLowerCase();
  const checks: Record<string, RegExp> = {
    gartner_authority_recognition_card: /category|analyst|proof|workforce|signal|moment|deck|agent|ai workforce/i,
    relevance_live_event_card: /relevance live|live|build|slides|public|session|operator/i,
    level_up_meetup_poster: /level up|operator|meetup|pixel|arcade|agent/i,
    pixel_speaker_lineup: /lineup|speaker|pixel|stage|build|operator/i,
    ai_ops_bootcamp_community_card: /bootcamp|revops|workflow|practice|deck|fail|agent/i,
    agents_at_work_case_study_carousel_hint: /agents@work|agents at work|proof|enterprise|signal/i,
    product_ui_pixel_character_mockup: /ship|deck|product|console|workflow|supergtm|ui|agent/i,
    impact_report_stat_card: /relief|record|capacity|clinical|patient|care|documentation|minute|proof|heidi/i,
    partnership_announcement_card: /partnership|clinical|healthcare|care|operator|rollout|heidi/i,
    clinician_burnout_truth_post: /documentation|burnout|paperwork|evening|chart|clinician|capacity|patient/i,
    founder_or_doctor_recognition_card: /recognition|clinical|leader|founder|doctor|care|honor|heidi/i,
    conference_panel_card: /panel|conference|clinical|capacity|documentation|healthcare|operator/i,
    customer_rollout_card: /rollout|practice|clinical|network|care|proof|relief/i,
    simple_brand_statement_card: /care|clinical|documentation|heidi|partner|trust|proof|statement/i,
  };
  const re = checks[formatId];
  return re ? re.test(h) : true;
}

export function normalizeLinkedInHeadlineWithChannelIntelligence(args: {
  intelligence: LinkedInChannelIntelligence;
  rawHeadline: string;
  pattern: LinkedInPostFormatPattern;
  deliverableIndex: number;
  day: number;
  proofSnippet?: string;
  deliverableTitle?: string;
}): string {
  if (args.intelligence.profile_id === RELEVANCE_AI_LINKEDIN_PLAYBOOK_ID) {
    const topicSeed = extractTopicSeedForRelevanceHeadline(args.rawHeadline, args.proofSnippet, args.deliverableTitle);
    const built = buildRelevanceNativeHeadline(args.pattern.id, topicSeed, args.day, args.deliverableIndex);
    return scrubAwkwardRelevancePublicHeadline(built, args.pattern.id, args.day, args.deliverableIndex, topicSeed);
  }
  if (args.intelligence.profile_id === HEIDI_AI_LINKEDIN_PLAYBOOK_ID) {
    const topicSeed = extractTopicSeedForHeidiHeadline(args.rawHeadline, args.proofSnippet, args.deliverableTitle);
    const built = buildHeidiNativeHeadline(args.pattern.id, topicSeed, args.day, args.deliverableIndex);
    return scrubHeidiPublicHeadline(built, args.day, args.deliverableIndex, args.intelligence);
  }

  return args.rawHeadline.trim();
}

export function countRobotRiskMatches(text: string): number {
  const re = new RegExp(LINKEDIN_ROBOT_RISK_PATTERN.source, "gi");
  return (text.match(re) ?? []).length;
}

export function collectBannedOnImagePhraseHits(text: string, phrases: readonly string[]): string[] {
  const lower = text.toLowerCase();
  const hits: string[] = [];
  for (const p of phrases) {
    if (p.length >= 4 && lower.includes(p.toLowerCase())) hits.push(p);
  }
  return hits;
}

/** Phase 2b — aggregate robot-risk / generic on-image / awkward headline counts for workflow reports. */
export function computePhase2bVisualTelemetry(workflow: {
  channel_intelligence?: ChannelIntelligence;
  campaign_execution_drafts: Array<{ type?: string; headline?: string }>;
  generated_campaign_assets: Array<{
    platform?: string;
    image_prompt_detailed?: string;
    negative_prompt?: string;
    visual_style_notes?: string;
  }>;
}): {
  channelProfileId: string | null;
  visualProfileId: string | null;
  robotRiskTermCount: number;
  genericOnImagePhraseCount: number;
  awkwardHeadlineCount: number;
  assetsByPlatform: Record<string, number>;
  sampleVisualStyleReasons: string[];
} {
  const li = workflow.channel_intelligence?.linkedin;
  const bannedPool = [
    ...(li?.generation_rules.banned_on_image_copy_phrases ?? []),
    ...DEFAULT_GENERIC_ON_IMAGE_COPY_PHRASES,
  ];

  let robotRiskTermCount = 0;
  let genericOnImagePhraseCount = 0;
  for (const a of workflow.generated_campaign_assets) {
    const blob = `${a.image_prompt_detailed ?? ""}\n${a.negative_prompt ?? ""}`;
    robotRiskTermCount += countRobotRiskMatches(blob);
    genericOnImagePhraseCount += collectBannedOnImagePhraseHits(blob, bannedPool).length;
  }

  let awkwardHeadlineCount = 0;
  for (const d of workflow.campaign_execution_drafts) {
    if (d.type !== "linkedin_post") continue;
    const hl = String(d.headline ?? "");
    if (li?.profile_id === RELEVANCE_AI_LINKEDIN_PLAYBOOK_ID) {
      if (isAwkwardRelevancePublicHeadline(hl) || isCalendarGenericLinkedInHeadline(hl, li)) awkwardHeadlineCount += 1;
    } else if (li?.profile_id === HEIDI_AI_LINKEDIN_PLAYBOOK_ID) {
      if (/^\s*day\s*\d+\b/i.test(hl) || isCalendarGenericLinkedInHeadline(hl, li)) awkwardHeadlineCount += 1;
    }
  }

  const assetsByPlatform: Record<string, number> = {};
  for (const a of workflow.generated_campaign_assets) {
    const k = a.platform ?? "unknown";
    assetsByPlatform[k] = (assetsByPlatform[k] ?? 0) + 1;
  }

  const sampleVisualStyleReasons = workflow.generated_campaign_assets
    .map((a) => a.visual_style_notes)
    .filter((s): s is string => Boolean(s))
    .slice(0, 8);

  return {
    channelProfileId: li?.profile_id ?? null,
    visualProfileId: li?.profile_id ?? null,
    robotRiskTermCount,
    genericOnImagePhraseCount,
    awkwardHeadlineCount,
    assetsByPlatform,
    sampleVisualStyleReasons,
  };
}

/** Report helpers — headline QA across LinkedIn drafts. */
export function linkedInHeadlineTelemetryForWorkflow(workflow: {
  campaign_execution_drafts: Array<{ type?: string; headline?: string; meta?: { channel_post_format?: string; channel_style_match_reason?: string; day?: number } }>;
}): {
  linkedinRows: Array<{ day: number; headline: string; channel_post_format?: string }>;
  calendarGenericHeadlineCount: number;
  draftsWithChannelPostFormat: number;
  draftsWithChannelStyleReason: number;
  distinctHeadlineBuckets: number;
} {
  const linkedinRows = workflow.campaign_execution_drafts
    .filter((d) => d.type === "linkedin_post")
    .map((d) => ({
      day: d.meta?.day ?? 0,
      headline: String(d.headline ?? "").trim(),
      channel_post_format: d.meta?.channel_post_format,
    }))
    .sort((a, b) => a.day - b.day);

  let calendarGenericHeadlineCount = 0;
  for (const row of linkedinRows) {
    if (/^\s*day\s*\d+\b/i.test(row.headline) || isCalendarGenericLinkedInHeadline(row.headline)) {
      calendarGenericHeadlineCount += 1;
    }
  }

  const draftsWithChannelPostFormat = linkedinRows.filter((r) => Boolean(r.channel_post_format)).length;
  const draftsWithChannelStyleReason = workflow.campaign_execution_drafts.filter((d) =>
    Boolean(d.meta?.channel_style_match_reason),
  ).length;

  const buckets = new Set(
    linkedinRows.map((r) => {
      const [bucket] = r.headline.split(":");
      return bucket?.trim().toLowerCase().slice(0, 48) ?? r.headline.toLowerCase().slice(0, 48);
    }),
  );

  return {
    linkedinRows,
    calendarGenericHeadlineCount,
    draftsWithChannelPostFormat,
    draftsWithChannelStyleReason,
    distinctHeadlineBuckets: buckets.size,
  };
}

/** Count banned playbook phrases appearing in LinkedIn draft headline+body (lowercase scan). */
export function countBannedPhrasesInLinkedInDrafts(
  drafts: Array<{ type?: string; headline?: string; body?: string }>,
  banned: string[],
): number {
  let hits = 0;
  const patterns = banned.map((p) => p.toLowerCase()).filter((p) => p.length >= 4);
  for (const d of drafts) {
    if (d.type !== "linkedin_post") continue;
    const blob = `${d.headline ?? ""}\n${d.body ?? ""}`.toLowerCase();
    for (const p of patterns) {
      if (blob.includes(p)) hits += 1;
    }
  }
  return hits;
}

/** Picks a playbook format for deterministic rotation across deliverables. */
export function pickLinkedInPostFormatPattern(
  intelligence: LinkedInChannelIntelligence,
  deliverableIndex: number,
): LinkedInPostFormatPattern {
  const patterns = intelligence.post_format_patterns;
  return patterns[deliverableIndex % patterns.length]!;
}
