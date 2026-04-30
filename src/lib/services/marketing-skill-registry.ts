import type { WorkflowState } from "@/lib/types/orbit";

export type MarketingSkillAudience = "manager" | "subagent" | "reviewer";

export interface MarketingSkillCard {
  id: string;
  title: string;
  sourceInspiredBy: string[];
  triggers: string[];
  channels: Array<"email" | "instagram" | "linkedin" | "strategy" | "general">;
  managerUse: string[];
  subAgentUse: string[];
  reviewChecks: string[];
}

const SKILLS: MarketingSkillCard[] = [
  {
    id: "product-marketing-context",
    title: "Product Marketing Context",
    sourceInspiredBy: ["coreyhaines31/marketingskills: product-marketing-context"],
    triggers: ["company context", "positioning", "icp", "audience", "brand", "proof", "objection", "messaging"],
    channels: ["general", "strategy", "email", "instagram", "linkedin"],
    managerUse: [
      "Start every plan by grounding it in product category, ICP, buyer pains, proof, objections, and approved voice.",
      "Treat company context as source material for original thinking, not copy-paste text.",
      "If required positioning inputs are missing, keep the plan narrower instead of inventing facts.",
    ],
    subAgentUse: [
      "Use customer language, proof points, and positioning from company context as evidence anchors.",
      "Do not quote long reference passages or scrape-like blobs into final deliverables.",
      "Tie every output back to one buyer pain, one credible proof point, and one next action.",
    ],
    reviewChecks: [
      "Output reflects the selected ICP and product category.",
      "Claims are traceable to supplied context or public company context.",
      "Knowledge base material is transformed into new copy instead of reused verbatim.",
    ],
  },
  {
    id: "content-strategy",
    title: "Content Strategy",
    sourceInspiredBy: ["coreyhaines31/marketingskills: content-strategy"],
    triggers: ["content strategy", "topics", "calendar", "campaign", "thought leadership", "seo", "shareable"],
    channels: ["strategy", "instagram", "linkedin", "general"],
    managerUse: [
      "Decide whether the work should capture existing demand, create demand, or support conversion.",
      "Translate broad goals into content pillars, buyer-stage intent, and concrete deliverables.",
      "Delegate research, concepting, and final asset production as separate steps only when the operator requested multiple outputs.",
    ],
    subAgentUse: [
      "For each draft, identify the content angle, buyer stage, proof anchor, and conversion goal.",
      "Prefer one sharp insight over a generic summary of the company.",
      "Make each deliverable standalone so it works without hidden context.",
    ],
    reviewChecks: [
      "Content angle matches the operator objective.",
      "Draft has a clear buyer-stage role and does not become a generic brand brochure.",
      "If a content calendar was not requested, the output does not expand into one.",
    ],
  },
  {
    id: "social-content",
    title: "Social Content",
    sourceInspiredBy: ["coreyhaines31/marketingskills: social-content"],
    triggers: ["social", "instagram", "linkedin", "post", "caption", "carousel", "content calendar", "engagement"],
    channels: ["instagram", "linkedin"],
    managerUse: [
      "Assign social work by platform, format, audience, hook type, and business action.",
      "Keep platform scope exact: one requested platform means one platform only.",
      "When a visual supports one post, package it as part of the same deliverable unless the operator asks for a separate asset set.",
    ],
    subAgentUse: [
      "Lead with a hook that fits the platform and audience.",
      "Use a concrete proof point, a human-readable insight, and a clear CTA.",
      "Avoid engagement bait, vague AI claims, and channel-inappropriate voice.",
    ],
    reviewChecks: [
      "Platform matches the work order and assigned deliverable.",
      "Hook, body, visual direction, and CTA form one coherent post.",
      "No accidental LinkedIn/Instagram/email crossover unless explicitly requested.",
    ],
  },
  {
    id: "email-sequence",
    title: "Email Sequence",
    sourceInspiredBy: ["coreyhaines31/marketingskills: email-sequence"],
    triggers: ["email sequence", "drip", "nurture", "lifecycle", "onboarding", "welcome", "follow-up"],
    channels: ["email"],
    managerUse: [
      "Classify sequence type, audience relationship, trigger, goal, length, and exit condition before assigning emails.",
      "Use one email for one job; do not create sequences when the operator asks for one email.",
      "Delegate separate emails only when sequence length is requested or clearly required.",
    ],
    subAgentUse: [
      "Write mobile-readable emails with subject, preview, hook, context, value, one CTA, and warm signoff.",
      "Keep each email focused on one primary action.",
      "Use relationship-appropriate tone: lifecycle emails are warmer than cold outreach.",
    ],
    reviewChecks: [
      "Email count matches requested scope.",
      "Subject and preview text are specific and not clickbait.",
      "Body has one clear CTA and a coherent reason to act.",
    ],
  },
  {
    id: "cold-email",
    title: "Cold Email",
    sourceInspiredBy: ["coreyhaines31/marketingskills: cold-email"],
    triggers: ["cold email", "outbound", "prospecting", "sales email", "lead", "reply", "gmail"],
    channels: ["email"],
    managerUse: [
      "Use cold-email doctrine only for outbound/prospecting tasks, not lifecycle nurture.",
      "Ask sub-agents to anchor personalization to a real buying problem, not a cosmetic compliment.",
      "Prefer short reply-seeking copy over long product explanation.",
    ],
    subAgentUse: [
      "Write like a peer, not a vendor.",
      "Every sentence must move the reader toward a reply or the requested action.",
      "Lead with the prospect's world before introducing the company.",
    ],
    reviewChecks: [
      "Opening line connects to the recipient context or target segment.",
      "Email is concise and specific enough to plausibly get a reply.",
      "CTA is low-friction and singular.",
    ],
  },
  {
    id: "copywriting",
    title: "Conversion Copywriting",
    sourceInspiredBy: ["coreyhaines31/marketingskills: copywriting"],
    triggers: ["copy", "headline", "cta", "landing", "conversion", "rewrite", "value proposition"],
    channels: ["general", "strategy", "email", "instagram", "linkedin"],
    managerUse: [
      "Use copywriting as a quality layer for clarity, buyer pain, benefits, proof, objection handling, and CTA.",
      "Assign copy polish when a deliverable needs persuasion rather than more research.",
      "Do not let copy polish change the requested channel or output count.",
    ],
    subAgentUse: [
      "Make the value proposition concrete and outcome-oriented.",
      "Use active voice, buyer language, and specific benefits.",
      "Replace weak CTAs with action-plus-outcome CTAs.",
    ],
    reviewChecks: [
      "Copy is clear, specific, and action-oriented.",
      "CTA says what the user gets or does next.",
      "No generic filler or inflated claims.",
    ],
  },
  {
    id: "launch-strategy",
    title: "Launch Strategy",
    sourceInspiredBy: ["coreyhaines31/marketingskills: launch-strategy"],
    triggers: ["launch", "gtm", "go-to-market", "announcement", "release", "product hunt", "beta", "waitlist"],
    channels: ["strategy", "email", "instagram", "linkedin"],
    managerUse: [
      "Use only when the operator asks for launch, release, GTM, waitlist, or announcement work.",
      "Separate owned, borrowed, and paid channel motions when a full launch plan is requested.",
      "For single launch assets, keep scope to the requested asset and include launch context inside it.",
    ],
    subAgentUse: [
      "Connect launch copy to timing, audience readiness, proof, and the next conversion action.",
      "Create momentum without pretending every task is a full launch campaign.",
      "Make launch claims concrete and defensible.",
    ],
    reviewChecks: [
      "Launch scope matches the work order.",
      "Plan includes clear channel roles only when multiple channels were requested.",
      "Asset supports momentum and conversion rather than vague hype.",
    ],
  },
  {
    id: "seo-audit",
    title: "SEO Audit",
    sourceInspiredBy: ["coreyhaines31/marketingskills: seo-audit"],
    triggers: ["seo", "search", "ranking", "keywords", "traffic", "indexing", "content gaps"],
    channels: ["strategy", "general"],
    managerUse: [
      "Use for search, ranking, keyword, indexation, content gap, or organic traffic work orders.",
      "Separate technical findings, on-page findings, content findings, and prioritized actions.",
      "Do not use SEO doctrine for social or email tasks unless the operator asks for search discovery.",
    ],
    subAgentUse: [
      "Tie each finding to impact, evidence, and a recommended fix.",
      "Map content ideas to search intent and buyer stage.",
      "Avoid unsupported claims about schema or indexing when evidence is missing.",
    ],
    reviewChecks: [
      "Recommendations are prioritized by impact.",
      "Findings include evidence and concrete fixes.",
      "SEO scope does not leak into unrelated channel deliverables.",
    ],
  },
];

function normalize(value: string | undefined | null): string {
  return String(value ?? "").toLowerCase();
}

function workflowText(workflow: WorkflowState): string {
  return [
    workflow.business_goal,
    workflow.success_metric,
    workflow.work_order?.title,
    workflow.work_order?.output_type,
    ...(workflow.brand_learning_notes ?? []),
  ]
    .filter(Boolean)
    .join("\n")
    .toLowerCase();
}

function channelHints(text: string): Set<MarketingSkillCard["channels"][number]> {
  const channels = new Set<MarketingSkillCard["channels"][number]>();
  if (/\b(instagram|ig|reel|carousel)\b/.test(text)) channels.add("instagram");
  if (/\b(linkedin|linked\s*in)\b/.test(text)) channels.add("linkedin");
  if (/\b(email|gmail|mail|outbound|prospecting)\b/.test(text)) channels.add("email");
  if (/\b(strategy|plan|gtm|go-to-market|launch|positioning|seo)\b/.test(text)) channels.add("strategy");
  return channels;
}

export function selectMarketingSkills(workflow: WorkflowState): MarketingSkillCard[] {
  const text = workflowText(workflow);
  const channels = channelHints(text);
  const selected = SKILLS.filter((skill) => {
    const triggerHit = skill.triggers.some((trigger) => text.includes(normalize(trigger)));
    const channelHit = channels.size > 0 && skill.channels.some((channel) => channels.has(channel));
    return skill.id === "product-marketing-context" || triggerHit || channelHit;
  });

  const unique = new Map(selected.map((skill) => [skill.id, skill]));
  return Array.from(unique.values()).slice(0, 5);
}

export function marketingSkillIds(workflow: WorkflowState): string[] {
  return selectMarketingSkills(workflow).map((skill) => skill.id);
}

export function formatManagerSkillBrief(workflow: WorkflowState): string {
  return selectMarketingSkills(workflow)
    .map((skill) => {
      const guidance = skill.managerUse.map((item) => `- ${item}`).join("\n");
      return `### ${skill.id}: ${skill.title}\n${guidance}`;
    })
    .join("\n\n");
}

export function formatSubAgentSkillBrief(workflow: WorkflowState, channel: string, kind: string): string {
  const channelName = normalize(channel);
  const kindName = normalize(kind);
  return selectMarketingSkills(workflow)
    .filter((skill) => {
      if (skill.id === "product-marketing-context" || skill.id === "copywriting") return true;
      return skill.channels.some((skillChannel) => channelName.includes(skillChannel) || kindName.includes(skillChannel));
    })
    .map((skill) => {
      const guidance = skill.subAgentUse.map((item) => `- ${item}`).join("\n");
      return `### ${skill.id}: ${skill.title}\n${guidance}`;
    })
    .join("\n\n");
}

export function formatReviewSkillBrief(workflow: WorkflowState): string {
  return selectMarketingSkills(workflow)
    .map((skill) => {
      const checks = skill.reviewChecks.map((item) => `- ${item}`).join("\n");
      return `### ${skill.id}: ${skill.title}\n${checks}`;
    })
    .join("\n\n");
}
