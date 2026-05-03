import OpenAI from "openai";

import { isLyraCompanyUrl } from "@/lib/data/lyra-brand-intelligence";
import {
  buildLinkedInHeadlineRulesCompact,
  buildLinkedInVisualRulesForPrompt,
  buildLinkedInVoiceRulesForPrompt,
  HEIDI_AI_LINKEDIN_PLAYBOOK_ID,
  normalizeLinkedInHeadlineWithChannelIntelligence,
  pickLinkedInPostFormatPattern,
  RELEVANCE_AI_LINKEDIN_PLAYBOOK_ID,
  resolveChannelIntelligence,
  summarizeLinkedInIntelligenceForPrompt,
} from "@/lib/services/channel-intelligence";
import {
  appendIssuesToManagerReview,
  appendPlainIssuesToManagerReview,
  augmentManagerReviewWithChannelIntelligence,
  collectDeterministicHeidiUnsupportedNumericIssues,
  collectLinkedInVisualPromptIssues,
  collectPlaybookLinkedInImageAssetIssues,
} from "@/lib/services/manager-content-review";
import { appendGovernanceLog, createGovernanceEntry } from "@/lib/services/governance-logger";
import { generateBrandBackground, generateOpenAiImageFromFullPrompt } from "@/lib/services/image-generator";
import { renderHeidiDeterministicLinkedInCardForWorkflow } from "@/lib/services/linkedin-card-renderer";
import {
  buildPlaybookDrivenLinkedInImagePrompt,
  buildSafeLinkedInVisibleTextContract,
} from "@/lib/services/playbook-linkedin-image-prompt";
import {
  formatManagerSkillBrief,
  formatReviewSkillBrief,
  formatSubAgentSkillBrief,
  marketingSkillIds,
} from "@/lib/services/marketing-skill-registry";
import { workflowStore } from "@/lib/state/workflow-store";
import type {
  CampaignEmailDraft,
  CampaignCarouselDraft,
  CampaignCarouselSlide,
  CampaignExecutionDraft,
  GeneratedCampaignAsset,
  CampaignLinkedInPostDraft,
  MarketingAgentRosterItem,
  ManagerSummaryReport,
  ManagerContentReview,
  ManagerCritique,
  ManagerContentIssueType,
  ManagerCritiqueReasonCode,
  ManagerWorkflowStep,
  ProductMarketingContext,
  WorkflowState,
  WorkflowStepId,
} from "@/lib/types/orbit";

const AGENT_MODEL = resolveAgentModel();
const MAX_REVISIONS = 3;
const LLM_REQUEST_TIMEOUT_MS = resolvePositiveInteger(process.env.OPENAI_AGENT_TIMEOUT_MS, 45_000);
const PLAN_MAX_TOKENS = resolvePositiveInteger(process.env.OPENAI_AGENT_PLAN_MAX_TOKENS, 1_400);
const DRAFT_MAX_TOKENS = resolvePositiveInteger(process.env.OPENAI_AGENT_DRAFT_MAX_TOKENS, 1_800);
const REVIEW_MAX_TOKENS = resolvePositiveInteger(process.env.OPENAI_AGENT_REVIEW_MAX_TOKENS, 900);
const SUMMARY_MAX_TOKENS = resolvePositiveInteger(process.env.OPENAI_AGENT_SUMMARY_MAX_TOKENS, 900);
const VISUAL_PROMPT_MAX_TOKENS = resolvePositiveInteger(process.env.OPENAI_AGENT_VISUAL_PROMPT_MAX_TOKENS, 900);

type DynamicStepOwner = string;
type DynamicDeliverableKind = "email" | "linkedin_post" | "instagram_caption" | "strategy_brief" | "generic_marketing_asset";

interface RuntimeAgent {
  id: string;
  name: string;
  role: "manager" | "employee";
  model?: string;
  tools: string[];
  autonomy?: number;
}

interface DynamicPlanStep {
  id: string;
  label: string;
  owner: DynamicStepOwner;
  summary: string;
  expected_output: string;
  depends_on: string[];
  completion_signal: string;
}

interface DynamicDeliverable {
  id: string;
  kind: DynamicDeliverableKind;
  channel: "email" | "linkedin" | "instagram" | "strategy" | "general";
  title: string;
  schedule_day?: number;
  owner_agent_id?: string;
  instructions: string;
  acceptance_criteria: string[];
}

interface ScottPlan {
  plan_summary: string;
  reasoning: string;
  steps: DynamicPlanStep[];
  deliverables: DynamicDeliverable[];
  final_review_checklist: string[];
}

interface PlanningConstraints {
  allowedChannels: DynamicDeliverable["channel"][];
  requestedOutputCount: number | null;
  singleOutputRequested: boolean;
  forbidMultiDay: boolean;
  visualAssetsAreComponents: boolean;
  /** True when operator notes imply N-day LinkedIn campaign cadence (schedule_day coverage). */
  linkedin_multi_day_campaign: boolean;
}

interface AgentScopeContract {
  requested_channels: DynamicDeliverable["channel"][];
  max_operator_review_outputs: number | null;
  multi_day_allowed: boolean;
  channel_policy: string;
  deliverable_policy: string;
  visual_asset_policy: string;
  reviewer_policy: string;
}

interface NovaOutput {
  deliverable_id: string;
  kind: DynamicDeliverableKind;
  title: string;
  subject_line?: string;
  preview_text?: string;
  body: string;
  proof_point: string;
  call_to_action: string;
  source_anchors: string[];
  notes: string;
}

type RawNovaOutput = Partial<NovaOutput> & {
  cta?: unknown;
  callToAction?: unknown;
  call_to_action?: unknown;
  sourceAnchors?: unknown;
};

interface ScottReview {
  decision: "approve" | "revise";
  score: number;
  critique: string;
  requested_action?: string;
  issues: Array<{
    type: string;
    severity: "low" | "medium" | "high";
    note: string;
  }>;
}

interface ManagerVisualBrief {
  visual_mode: "photo_real_editorial" | "brand_graphic";
  asset_purpose: "instagram_feed_image" | "linkedin_post_image";
  prompt: string;
  negative_prompt: string;
  visual_source_anchor: string;
  visual_style_notes: string;
}

type RawManagerVisualBrief = Partial<ManagerVisualBrief>;

type RawManagerSummaryReport = Partial<Omit<ManagerSummaryReport, "schema_version" | "generated_at" | "workflow_id" | "outputs" | "source_log_ids">> & {
  outputs?: Array<Partial<ManagerSummaryReport["outputs"][number]>>;
  source_log_ids?: unknown;
};

const GENERIC_MARKETING_PHRASES = [
  "unlock",
  "elevate",
  "revolutionize",
  "game-changing",
  "empower",
  "streamline",
  "cutting-edge",
  "top-tier",
  "innovative solutions",
  "in today's fast-paced",
  "i hope this message finds you well",
];

const MANAGER_CONTENT_ISSUE_TYPES = new Set<string>([
  "too_close_to_reference",
  "generic_copy",
  "generic_channel_fit",
  "unsupported_claim",
  "wrong_channel_voice",
  "weak_cta",
  "repetitive",
  "reference_summary_not_synthesis",
  "incomplete_email_draft",
  "weak_channel_format",
  "trend_context_ignored",
]);

function coerceManagerIssueType(raw: unknown): ManagerContentIssueType {
  const t = String(raw ?? "").trim();
  if (MANAGER_CONTENT_ISSUE_TYPES.has(t)) return t as ManagerContentIssueType;
  return "generic_copy";
}

function resolvePositiveInteger(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.round(parsed);
}

function resolveAgentModel(): string {
  const configured = process.env.OPENAI_AGENT_MODEL ?? process.env.OPENAI_TEXT_MODEL ?? process.env.OPENAI_MODEL;
  if (configured && !configured.toLowerCase().includes("image")) return configured;
  return "gpt-4o-mini";
}

function normalizeAgentModelLabel(value: string | undefined): string {
  const model = value?.trim();
  if (!model) return AGENT_MODEL;
  const lower = model.toLowerCase();
  if (lower.includes("image")) return AGENT_MODEL;
  if (lower === "gpt-5.5" || lower === "gpt-5.4" || lower === "gpt-4.1" || lower === "gpt-4o" || lower === "gpt-4o-mini" || lower === "o3-mini") return lower;
  if (lower === "gpt-4.1-mini") return "gpt-4.1-mini";
  return model.startsWith("GPT-") ? lower : model;
}

function linkedinExecutionAddon(workflow: WorkflowState, deliverable: DynamicDeliverable, deliverableIndex: number): string {
  if (deliverable.channel !== "linkedin" || !workflow.channel_intelligence?.linkedin) return "";
  const li = workflow.channel_intelligence.linkedin;
  const pattern = pickLinkedInPostFormatPattern(li, deliverableIndex);
  const headlineDoctrine = buildLinkedInHeadlineRulesCompact(li);
  const franchiseHint =
    li.profile_id === HEIDI_AI_LINKEDIN_PLAYBOOK_ID ?
      "Shape headline + hook to match the assigned post_format_id with Heidi-native editorial rhythm (documentation burden, clinician capacity, patient-facing time, partnerships). Prefer motifs like Relief on the Record, calm proof stats, partnership cards — clinical vocabulary over hype."
    : li.profile_id === RELEVANCE_AI_LINKEDIN_PLAYBOOK_ID ?
      'Shape headline + hook to match the assigned post_format_id and rotate franchises across posts (Level Up, Relevance Live, Agents@Work, AI Ops Bootcamp, AI workforce, GTM operators).'
    : "Shape headline + hook to match the assigned post_format_id and seeded playbook voice.";
  return `\n\nLINKEDIN CHANNEL INTELLIGENCE (mandatory for this deliverable):\n${summarizeLinkedInIntelligenceForPrompt(li)}\n${buildLinkedInVoiceRulesForPrompt(li)}\nAssigned playbook post_format_id for THIS deliverable: "${pattern.id}" (${pattern.label}). Caption cadence hint: ${pattern.caption_cadence_hint}\nHeadline doctrine (follow): ${headlineDoctrine}\nThe JSON field "title" is the PUBLIC LinkedIn headline. Never start with Day 1:, Day 2:, etc. Never use Kickoff Post, Announcement, Thought Leadership Post, Engagement Post, Live Event Announcement, or other calendar worksheet labels.\n${franchiseHint}\nDo not stack repetitive "we're excited" openings. Paraphrase playbook examples — never copy hooks verbatim.`;
}

function linkedinReviewAddon(workflow: WorkflowState, deliverable: DynamicDeliverable, deliverableIndex: number): string {
  if (deliverable.channel !== "linkedin" || !workflow.channel_intelligence?.linkedin) return "";
  const li = workflow.channel_intelligence.linkedin;
  const pattern = pickLinkedInPostFormatPattern(li, deliverableIndex);
  const nativeHints =
    li.profile_id === HEIDI_AI_LINKEDIN_PLAYBOOK_ID ?
      "Reject purple/pixel/arcade motifs in copy cues; reward calm clinical proof and healthcare-operator specificity."
    : li.profile_id === RELEVANCE_AI_LINKEDIN_PLAYBOOK_ID ?
      "Reward Level Up / Relevance Live / Agents@Work / AI Ops Bootcamp native vocabulary when authentic."
    : "Reward playbook-native vocabulary.";
  return `\n\nLINKEDIN NATIVE REVIEW: Score against ${li.profile_id}. Assigned post_format_id: "${pattern.id}". Reject titles beginning with Day N: or containing internal calendar labels (Kickoff Post, Announcement, Thought Leadership, etc.). Headline + opener must match the playbook tile energy. Request revision when copy feels like generic AI SaaS or ignores banned phrases. ${nativeHints}`;
}

function getClient(): OpenAI {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is not configured for dynamic agentic workflow execution.");
  }
  return new OpenAI({ apiKey });
}

function parseJsonObject<T>(raw: string | null | undefined, label: string): T {
  if (!raw?.trim()) throw new Error(`${label} returned empty content.`);
  try {
    return JSON.parse(raw) as T;
  } catch (error) {
    throw new Error(`${label} returned invalid JSON: ${(error as Error).message}`);
  }
}

function normalizeOpenAIError(error: unknown, label: string): Error {
  if (error instanceof Error) {
    if (error.name === "AbortError") {
      return new Error(`${label} timed out after ${Math.round(LLM_REQUEST_TIMEOUT_MS / 1000)}s.`);
    }
    return error;
  }
  return new Error(`${label} failed.`);
}

function stringField(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function inferCallToAction(output: RawNovaOutput, deliverable: DynamicDeliverable): string {
  const explicit = stringField(output.call_to_action) || stringField(output.callToAction) || stringField(output.cta);
  if (explicit) return explicit;

  const body = stringField(output.body);
  const ctaSentence = body
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .reverse()
    .find((sentence) => /\b(reply|book|dm|message|contact|schedule|start|talk|call|visit)\b/i.test(sentence));
  if (ctaSentence) return ctaSentence.replace(/\s+/g, " ");

  const criteria = Array.isArray(deliverable.acceptance_criteria)
    ? deliverable.acceptance_criteria.map(stringField).find((item) => /\bcta|call to action|reply|book|dm|approve|execute\b/i.test(item))
    : "";
  if (criteria) return criteria;

  return `Review and approve: ${deliverable.title}`;
}

function normalizeEmployeeOutput(parsed: RawNovaOutput, deliverable: DynamicDeliverable, assignee: RuntimeAgent): NovaOutput {
  const body = stringField(parsed.body);
  if (!body) throw new Error(`${assignee.name} output did not include body text.`);

  const sourceAnchors =
    Array.isArray(parsed.source_anchors) ? parsed.source_anchors.map(stringField).filter(Boolean)
    : Array.isArray(parsed.sourceAnchors) ? parsed.sourceAnchors.map(stringField).filter(Boolean)
    : [];

  return {
    deliverable_id: stringField(parsed.deliverable_id) || deliverable.id,
    kind: parsed.kind || deliverable.kind,
    title: stringField(parsed.title) || deliverable.title,
    subject_line: stringField(parsed.subject_line) || undefined,
    preview_text: stringField(parsed.preview_text) || undefined,
    body,
    proof_point: stringField(parsed.proof_point) || stringField(parsed.notes) || body.slice(0, 180),
    call_to_action: inferCallToAction(parsed, deliverable),
    source_anchors: sourceAnchors,
    notes: stringField(parsed.notes) || deliverable.instructions,
  };
}

async function createJsonChatCompletion(args: {
  label: string;
  temperature: number;
  maxTokens: number;
  model?: string;
  messages: OpenAI.Chat.ChatCompletionMessageParam[];
}): Promise<string | null | undefined> {
  const client = getClient();
  const controller = new AbortController();
  let timeout: ReturnType<typeof setTimeout> | undefined;

  try {
    const request = client.chat.completions.create(
      {
        model: normalizeAgentModelLabel(args.model),
        temperature: args.temperature,
        max_tokens: args.maxTokens,
        response_format: { type: "json_object" },
        messages: args.messages,
      },
      {
        signal: controller.signal,
        timeout: LLM_REQUEST_TIMEOUT_MS,
      },
    );

    const response = await Promise.race([
      request,
      new Promise<never>((_, reject) => {
        timeout = setTimeout(() => {
          controller.abort();
          const error = new Error(`${args.label} timed out after ${Math.round(LLM_REQUEST_TIMEOUT_MS / 1000)}s.`);
          error.name = "AbortError";
          reject(error);
        }, LLM_REQUEST_TIMEOUT_MS);
      }),
    ]);
    return response.choices[0]?.message?.content;
  } catch (error) {
    throw normalizeOpenAIError(error, args.label);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

function compactText(value: string | undefined | null, maxLength = 520): string | undefined {
  const text = String(value ?? "").replace(/\s+/g, " ").trim();
  if (!text) return undefined;
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength - 1).trim()}...`;
}

function compactList(values: string[] | undefined, maxItems: number, maxLength = 320): string[] {
  return (values ?? [])
    .map((value) => compactText(value, maxLength))
    .filter((value): value is string => Boolean(value))
    .slice(0, maxItems);
}

function compactMarketingContext(context: ProductMarketingContext | undefined) {
  if (!context) return undefined;
  return {
    mission_statement: compactText(context.mission_statement, 360),
    product_summary: compactText(context.product_summary, 420),
    target_personas: compactList(context.target_personas, 3, 240),
    pains_solved: compactList(context.pains_solved, 4, 240),
    messaging_pillars: compactList(context.messaging_pillars, 4, 280),
    launch_goals: compactList(context.launch_goals, 3, 180),
    primary_cta: compactText(context.primary_cta, 120),
    sop_focus: compactList(context.sop_focus, 3, 180),
    preferred_channels: compactList(context.preferred_channels, 4, 80),
  };
}

function compactWarmIntelligence(workflow: WorkflowState) {
  const warm = workflow.lyra_warm_intelligence;
  if (!warm) return null;
  return {
    cache_label: warm.cache_label,
    core_positioning: compactText(warm.core_positioning, 420),
    buyer_belief: compactText(warm.buyer_belief, 320),
    audience_segments: compactList(warm.audience_segments, 4, 180),
    proof_points: compactList(warm.proof_points, 5, 220),
    content_angles: compactList(warm.content_angles, 5, 160),
    brand_voice: compactList(warm.brand_voice, 5, 120),
    avoid_list: compactList(warm.avoid_list, 6, 140),
    source_anchors: compactList(warm.source_anchors, 5, 160),
  };
}

function compactWorkflowContext(workflow: WorkflowState) {
  const intelligence = workflow.website_intelligence;
  const context = workflow.product_marketing_context;
  const roster = resolveAgentRoster(workflow);
  const li = workflow.channel_intelligence?.linkedin;
  const planning = inferPlanningConstraints(workflow);
  return {
    work_order: workflow.work_order ?? null,
    objective: workflow.business_goal ?? "",
    success_metric: workflow.success_metric ?? "",
    operator_scope_contract: buildAgentScopeContract(workflow),
    planning_inference: {
      inferred_operator_review_output_cap: planning.requestedOutputCount,
      linkedin_multi_day_sequence: planning.linkedin_multi_day_campaign,
    },
    brand_learning_notes: workflow.brand_learning_notes ?? [],
    agent_roster: roster.all.map((agent) => ({
      id: agent.id,
      name: agent.name,
      role: agent.role,
      tools: agent.tools,
      autonomy: agent.autonomy,
      model: agent.model,
    })),
    company: {
      name: intelligence?.company_name ?? "Unknown company",
      url: workflow.company_url,
      industry: intelligence?.industry,
      audience_summary: compactText(intelligence?.audience_summary, 360),
      key_value_propositions: compactList(intelligence?.key_value_propositions, 4, 280),
      product_offerings: compactList(intelligence?.product_offerings, 4, 260),
      differentiators: compactList(intelligence?.differentiators, 4, 240),
      social_proof: compactList(intelligence?.social_proof, 3, 260),
    },
    marketing_context: compactMarketingContext(context),
    warm_intelligence: compactWarmIntelligence(workflow),
    linkedin_channel_intelligence:
      li ?
        {
          profile_id: li.profile_id,
          playbook_summary: summarizeLinkedInIntelligenceForPrompt(li),
          voice_rules: compactText(buildLinkedInVoiceRulesForPrompt(li), 900),
          visual_rules: compactText(buildLinkedInVisualRulesForPrompt(li), 900),
          post_format_ids: li.post_format_patterns.map((p) => p.id),
          banned_phrases: li.generation_rules.banned_phrases,
        }
      : null,
  };
}

function normalizeRosterItem(agent: MarketingAgentRosterItem): RuntimeAgent | null {
  const id = agent.id.trim().toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/^-|-$/g, "");
  const name = agent.name.trim();
  if (!id || !name || agent.enabled === false) return null;

  return {
    id,
    name,
    role: agent.role,
    model: agent.model,
    tools: Array.isArray(agent.tools) ? agent.tools.filter(Boolean) : [],
    autonomy: agent.autonomy,
  };
}

function resolveAgentRoster(workflow: WorkflowState) {
  const configured = (workflow.agent_roster ?? [])
    .map(normalizeRosterItem)
    .filter((agent): agent is RuntimeAgent => Boolean(agent));

  const managerId = workflow.work_order?.manager_agent_id ?? "scott";
  const manager =
    configured.find((agent) => agent.role === "manager" && agent.id === managerId) ??
    configured.find((agent) => agent.role === "manager") ??
    {
      id: "scott",
      name: "Scott",
      role: "manager" as const,
      model: AGENT_MODEL,
      tools: ["strategy", "delegation", "review"],
      autonomy: 4,
    };

  const employees = configured.filter((agent) => agent.role === "employee");
  const resolvedEmployees = employees.length
    ? employees
    : [
        {
          id: "nova",
          name: "Nova",
          role: "employee" as const,
          model: AGENT_MODEL,
          tools: ["research", "copy", "execution"],
          autonomy: 3,
        },
      ];

  const all = [manager, ...resolvedEmployees.filter((agent) => agent.id !== manager.id)];
  const byId = new Map(all.map((agent) => [agent.id, agent]));

  return {
    manager,
    employees: resolvedEmployees,
    all,
    byId,
    ownerIds: all.map((agent) => agent.id),
    employeeIds: resolvedEmployees.map((agent) => agent.id),
  };
}

function agentDisplayName(roster: ReturnType<typeof resolveAgentRoster>, agentId: string): string {
  return roster.byId.get(agentId)?.name ?? agentId;
}

function normalizeOwnerId(value: string | undefined, roster: ReturnType<typeof resolveAgentRoster>, fallback: RuntimeAgent): string {
  const id = String(value ?? "").trim().toLowerCase();
  return roster.byId.has(id) ? id : fallback.id;
}

function employeeForDeliverable(
  deliverable: DynamicDeliverable,
  deliverableIndex: number,
  roster: ReturnType<typeof resolveAgentRoster>,
): RuntimeAgent {
  const preferredId = String(deliverable.owner_agent_id ?? "").trim().toLowerCase();
  const preferred = roster.employees.find((agent) => agent.id === preferredId);
  if (preferred) return preferred;
  return roster.employees[deliverableIndex % roster.employees.length] ?? roster.employees[0];
}

function inferPlanningConstraints(workflow: WorkflowState): PlanningConstraints {
  const prompt = [
    workflow.business_goal,
    workflow.success_metric,
    ...(workflow.brand_learning_notes ?? []),
  ]
    .filter(Boolean)
    .join("\n")
    .toLowerCase();
  const explicitChannels: DynamicDeliverable["channel"][] = [];
  if (/\b(instagram|ig)\b/.test(prompt)) explicitChannels.push("instagram");
  if (/\b(linkedin|linked\s*in)\b/.test(prompt)) explicitChannels.push("linkedin");
  if (/\b(email|gmail|mail)\b/.test(prompt)) explicitChannels.push("email");

  const linkedinExclusive =
    /\blinkedin\b/.test(prompt) &&
    /\b(no email|linkedin[\s-]only|linkedin channel only|exclude email|without email)\b/i.test(prompt);
  if (linkedinExclusive) {
    explicitChannels.length = 0;
    explicitChannels.push("linkedin");
  }

  const numberWords: Record<string, number> = {
    one: 1,
    single: 1,
    two: 2,
    three: 3,
    four: 4,
    five: 5,
    six: 6,
    seven: 7,
  };
  const countMatch =
    prompt.match(/\b(one|single|two|three|four|five|six|seven|[1-9]|1[0-4])\b.{0,40}\b(deliverables?|outputs?|drafts?|assets?|posts?|emails?)\b/) ??
    prompt.match(/\b(deliverables?|outputs?|drafts?|assets?|posts?|emails?)\b.{0,40}\b(one|single|two|three|four|five|six|seven|[1-9]|1[0-4])\b/);
  const requestedOutputCountRaw = countMatch?.[1] ?? countMatch?.[2];
  let requestedOutputCount =
    requestedOutputCountRaw ?
      numberWords[requestedOutputCountRaw] ?? Number(requestedOutputCountRaw)
    : null;

  const spanDaysMatch = prompt.match(/\b([1-9]|1[0-4])[-\s]?day\b/i);
  const spanDaysParsed = spanDaysMatch ? Number(spanDaysMatch[1]) : null;
  const linkedinCampaignLikely =
    /\blinkedin\b/.test(prompt) &&
    (/\b(campaign|sequence|calendar|package)\b/.test(prompt) ||
      /\b(per day|each day|every day|daily)\b/.test(prompt) ||
      /\bposts?\b/.test(prompt));
  const multiDayLinkedInPlan =
    typeof spanDaysParsed === "number" && spanDaysParsed >= 2 && linkedinCampaignLikely;

  if (multiDayLinkedInPlan) {
    requestedOutputCount =
      typeof requestedOutputCount === "number" && Number.isFinite(requestedOutputCount) ?
        Math.max(requestedOutputCount, spanDaysParsed)
      : spanDaysParsed;
  }

  const singleOutputRequested =
    typeof requestedOutputCount === "number" && requestedOutputCount > 1 ? false
    : multiDayLinkedInPlan ? false
    : requestedOutputCount === 1 ||
      ((requestedOutputCount === null || requestedOutputCount === 1) &&
        ((/\b(one|single|1)\b.{0,50}\b(post|email|draft|asset|caption|message|output)\b/.test(prompt) &&
          !/\b(per day|each day|every day|daily)\b/.test(prompt)) ||
          (/\b(post|email|draft|asset|caption|message|output)\b.{0,50}\b(one|single|1)\b/.test(prompt) &&
            !/\b(per day|each day|every day|daily)\b/.test(prompt))));
  const forbidMultiDay =
    /\bdo not\b.{0,60}\b(multi[-\s]?day|7[-\s]?day|seven[-\s]?day|campaign|sequence|calendar)\b/.test(prompt) ||
    /\bnot\b.{0,60}\b(multi[-\s]?day|7[-\s]?day|seven[-\s]?day|campaign|sequence|calendar)\b/.test(prompt);
  const visualAssetsAreComponents =
    /\b(visual|asset|image|creative)\b/.test(prompt) &&
    /\b(post|caption|email|message|draft|deliverable)\b/.test(prompt) &&
    (singleOutputRequested || /\bmatching|supporting|for (the|this|one|single)\b/.test(prompt));

  return {
    allowedChannels: explicitChannels.length ? Array.from(new Set(explicitChannels)) : ["email", "linkedin", "instagram", "strategy", "general"],
    requestedOutputCount:
      typeof requestedOutputCount === "number" && Number.isFinite(requestedOutputCount) && requestedOutputCount > 0 ?
        requestedOutputCount
      : null,
    singleOutputRequested,
    forbidMultiDay,
    visualAssetsAreComponents,
    linkedin_multi_day_campaign: Boolean(multiDayLinkedInPlan),
  };
}

function buildAgentScopeContract(workflow: WorkflowState): AgentScopeContract {
  const constraints = inferPlanningConstraints(workflow);
  const requestedChannels = constraints.allowedChannels;
  const exactlyOneChannel = requestedChannels.length === 1;
  const maxOutputs = constraints.requestedOutputCount ?? (constraints.singleOutputRequested ? 1 : null);

  return {
    requested_channels: requestedChannels,
    max_operator_review_outputs: maxOutputs,
    multi_day_allowed: !constraints.forbidMultiDay && !constraints.singleOutputRequested,
    channel_policy:
      exactlyOneChannel ?
        `Use only the requested channel: ${requestedChannels[0]}. Do not introduce any other channel unless the operator explicitly requested it.`
      : "Use only channels that are explicitly requested, or choose channels only when the work order asks the manager to decide the channel mix.",
    deliverable_policy:
      maxOutputs === 1 ?
        "Produce one operator-reviewable deliverable. Supporting research, images, captions, or notes must be packaged inside that one deliverable when they belong to the same requested output."
      : "Create multiple deliverables only when the operator asks for multiple outputs, a campaign, a sequence, or a multi-channel package.",
    visual_asset_policy:
      constraints.visualAssetsAreComponents ?
        "A requested visual, image, asset, or creative that supports a single post is a component of that post, not a separate social-channel deliverable."
      : "Visual requirements should follow the requested deliverable scope and should not create extra channels by themselves.",
    reviewer_policy:
      "Scott must request revision if an employee output adds an unrequested channel, expands into an unrequested campaign, or splits one requested output into multiple operator-review outputs.",
  };
}

function kindForChannel(channel: DynamicDeliverable["channel"], fallback: DynamicDeliverableKind): DynamicDeliverableKind {
  if (channel === "email") return "email";
  if (channel === "instagram") return "instagram_caption";
  if (channel === "linkedin") return "linkedin_post";
  if (fallback === "email" || fallback === "instagram_caption" || fallback === "linkedin_post" || fallback === "strategy_brief") {
    return fallback;
  }
  return "strategy_brief";
}

function normalizeDeliverableForConstraints(
  deliverable: DynamicDeliverable,
  constraints: PlanningConstraints,
): DynamicDeliverable {
  const requestedChannel =
    constraints.allowedChannels.includes(deliverable.channel) ? deliverable.channel
    : constraints.allowedChannels.length === 1 ? constraints.allowedChannels[0]
    : deliverable.channel;
  const channel = requestedChannel ?? deliverable.channel;
  const kind = kindForChannel(channel, deliverable.kind);

  return {
    ...deliverable,
    kind,
    channel,
    schedule_day: constraints.forbidMultiDay || constraints.singleOutputRequested ? 1 : deliverable.schedule_day,
  };
}

function constrainScottPlan(plan: ScottPlan, workflow: WorkflowState, roster: ReturnType<typeof resolveAgentRoster>): ScottPlan {
  const constraints = inferPlanningConstraints(workflow);
  let deliverables = plan.deliverables
    .filter((deliverable) => {
      if (constraints.allowedChannels.length !== 1) return true;
      return (
        constraints.allowedChannels.includes(deliverable.channel) ||
        deliverable.kind === kindForChannel(constraints.allowedChannels[0], deliverable.kind) ||
        /visual|asset|creative|image|caption|post/i.test(`${deliverable.title} ${deliverable.instructions}`)
      );
    })
    .map((deliverable) => normalizeDeliverableForConstraints(deliverable, constraints));

  if (constraints.allowedChannels.length === 1 && constraints.singleOutputRequested) {
    const channel = constraints.allowedChannels[0];
    const source = deliverables[0] ?? plan.deliverables[0];
    const combinedInstructions = deliverables
      .map((deliverable) => `${deliverable.title}: ${deliverable.instructions}`.trim())
      .filter(Boolean)
      .join("\n");
    const combinedCriteria = deliverables.flatMap((deliverable) => deliverable.acceptance_criteria ?? []);

    deliverables = [
      {
        id: source?.id || `${channel}-single-output`,
        kind: kindForChannel(channel, source?.kind ?? "generic_marketing_asset"),
        channel,
        title: source?.title && !/visual asset/i.test(source.title) ? source.title : `Single ${channel} deliverable`,
        owner_agent_id: source?.owner_agent_id,
        schedule_day: 1,
        instructions: [
          `Produce exactly one ${channel} deliverable for the operator request.`,
          constraints.visualAssetsAreComponents ?
            "If the request mentions a caption, copy, visual, image, or asset for one output, package those pieces inside the same deliverable instead of creating another channel output."
          : "",
          combinedInstructions || source?.instructions || workflow.business_goal || "Create the requested marketing deliverable.",
        ]
          .filter(Boolean)
          .join("\n"),
        acceptance_criteria: Array.from(
          new Set([
            ...combinedCriteria,
            `Stays on ${channel}; do not add LinkedIn, email, or other channels unless the operator asked for them.`,
            constraints.forbidMultiDay ? "Does not expand into a multi-day campaign, calendar, or sequence." : "",
            constraints.singleOutputRequested ? "Returns one operator-reviewable draft only." : "",
          ].filter(Boolean)),
        ),
      },
    ];
  }

  deliverables = deliverables.map((deliverable, index) => ({
    ...deliverable,
    owner_agent_id: employeeForDeliverable(deliverable, index, roster).id,
  }));

  const allowedOwnerIds = new Set(roster.ownerIds);
  const allowedStepChannelNote =
    constraints.allowedChannels.length === 1 ?
      `Keep all execution on ${constraints.allowedChannels[0]}; do not introduce unrelated channels.`
    : "";
  const steps = plan.steps.map((step) => ({
    ...step,
    owner: allowedOwnerIds.has(step.owner) ? step.owner : roster.manager.id,
    summary: [step.summary, allowedStepChannelNote].filter(Boolean).join(" "),
    expected_output:
      constraints.requestedOutputCount ?
        `${step.expected_output} Output must support the ${constraints.requestedOutputCount} requested deliverable(s) only.`
      : constraints.singleOutputRequested ?
        `${step.expected_output} Output must support the single requested deliverable only.`
      : step.expected_output,
  }));

  return {
    ...plan,
    steps,
    deliverables,
    final_review_checklist: Array.from(
      new Set([
        ...(plan.final_review_checklist ?? []),
        constraints.allowedChannels.length === 1 ? `No extra channels beyond ${constraints.allowedChannels[0]}.` : "",
        constraints.singleOutputRequested ? "Exactly one final operator-reviewable output." : "",
        constraints.forbidMultiDay ? "No accidental multi-day campaign expansion." : "",
      ].filter(Boolean)),
    ),
  };
}

async function askScottForPlan(workflow: WorkflowState): Promise<ScottPlan> {
  const roster = resolveAgentRoster(workflow);
  const scopeContract = buildAgentScopeContract(workflow);
  const deliverableBudgetHint =
    typeof scopeContract.max_operator_review_outputs === "number" && scopeContract.max_operator_review_outputs > 1 ?
      `When operator_scope_contract.max_operator_review_outputs is ${scopeContract.max_operator_review_outputs}, deliverables.length MUST equal that integer with distinct ids — use schedule_day 1..${scopeContract.max_operator_review_outputs} for daily cadence outputs unless scope channels forbid it. `
    : "";
  const ownerList = roster.all
    .map((agent) => `${agent.id} (${agent.name}, ${agent.role}, tools: ${agent.tools.join(", ") || "general"})`)
    .join("; ");
  const employeeList = roster.employees.map((agent) => agent.id).join(", ");
  const managerSkillBrief = formatManagerSkillBrief(workflow);
  const content = await createJsonChatCompletion({
    label: "Scott planning",
    temperature: 0.25,
    maxTokens: PLAN_MAX_TOKENS,
    model: roster.manager.model,
    messages: [
      {
        role: "system",
        content:
          `You are ${roster.manager.name}, Orbit's marketing manager agent. Read the operator work order, company knowledge base, available agent roster, operator_scope_contract, and selected marketing skill briefing. Decide the execution plan yourself, but obey the scope contract exactly. Return strict JSON only with keys: plan_summary, reasoning, steps, deliverables, final_review_checklist. Available agent owners are: ${ownerList}. Steps must be an ordered array of 3-7 steps with id, label, owner, summary, expected_output, depends_on, completion_signal. Every step owner must be one of these exact ids: ${roster.ownerIds.join(", ")}. Deliverables must be the concrete marketing outputs employee agents should produce, with id, kind (email|linkedin_post|instagram_caption|strategy_brief|generic_marketing_asset), channel, title, owner_agent_id, schedule_day, instructions, acceptance_criteria. Every deliverable owner_agent_id must be one of these employee ids: ${employeeList}. Scope contract: ${JSON.stringify(scopeContract)} ${deliverableBudgetHint}Selected marketing skill briefing:\n${managerSkillBrief}\nUse multiple employee agents only when the requested scope naturally has multiple independent deliverables. schedule_day must be used only when the scope contract allows a dated sequence. Do not invent channels beyond scope or exceed max_operator_review_outputs.`,
      },
      {
        role: "user",
        content: JSON.stringify(compactWorkflowContext(workflow)),
      },
    ],
  });

  const parsed = parseJsonObject<ScottPlan>(content, "Scott plan");
  if (!Array.isArray(parsed.steps) || parsed.steps.length === 0) {
    throw new Error("Scott plan did not include executable steps.");
  }
  if (!Array.isArray(parsed.deliverables) || parsed.deliverables.length === 0) {
    throw new Error("Scott plan did not include deliverables for employee agents.");
  }
  return constrainScottPlan({
    ...parsed,
    steps: parsed.steps.map((step) => ({
      ...step,
      owner: normalizeOwnerId(step.owner, roster, /draft|write|create|compose|produce/i.test(`${step.label} ${step.summary}`) ? roster.employees[0] : roster.manager),
    })),
    deliverables: parsed.deliverables.map((deliverable, index) => ({
      ...deliverable,
      owner_agent_id: employeeForDeliverable(deliverable, index, roster).id,
    })),
  }, workflow, roster);
}

function scrubEmailBodyDisallowedDemoSignoff(body: string, workflow: WorkflowState, roster: ReturnType<typeof resolveAgentRoster>): string {
  const allowLyraDemoBrand = Boolean(workflow.lyra_warm_intelligence) || isLyraCompanyUrl(workflow.company_url);
  if (allowLyraDemoBrand) return body;

  const manager = roster.manager.name?.trim() || "Scott";
  const company =
    workflow.website_intelligence?.company_name?.trim() ||
    workflow.brand_kit?.brand_name?.trim() ||
    "";
  const companyTeam = company ? `The ${company.replace(/\s+(Inc\.?|LLC|Ltd|Pty\.?\s*Ltd)\.?$/i, "").trim()} team` : manager;

  let b = body;
  const swaps: Array<[RegExp, string]> = [
    [/\b(best|kind)\s+regards,?\s*\n\s*Lyra\b/gi, `Best regards,\n${manager}`],
    [/\bthanks,?\s*\n\s*Lyra\b/gi, `Thanks,\n${manager}`],
    [/\bwarm\s+regards,?\s*\n\s*Lyra\b/gi, `Warm regards,\n${manager}`],
    [/\bcheers,?\s*\n\s*Lyra\b/gi, `Cheers,\n${manager}`],
    [/\bsincerely,?\s*\n\s*Lyra\b/gi, `Sincerely,\n${manager}`],
    [/\b—\s*Lyra\b/gi, `— ${manager}`],
    [/\nLyra\s*$/m, `\nBest regards,\n${companyTeam}`],
  ];
  for (const [re, rep] of swaps) b = b.replace(re, rep);

  if (/\blyra\b/i.test(b)) {
    if (company) b = b.replace(/\blyra technologies\b/gi, company);
    b = b.replace(/\blyra\b/gi, manager);
  }

  return b;
}

async function askEmployeeToExecute(args: {
  workflow: WorkflowState;
  plan: ScottPlan;
  deliverable: DynamicDeliverable;
  deliverableIndex: number;
  assignee: RuntimeAgent;
  revision?: ScottReview;
  previousOutput?: NovaOutput;
}): Promise<NovaOutput> {
  const scopeContract = buildAgentScopeContract(args.workflow);
  const rosterExec = resolveAgentRoster(args.workflow);
  const lyraDemoBrandOk = Boolean(args.workflow.lyra_warm_intelligence) || isLyraCompanyUrl(args.workflow.company_url);
  const emailSignoffDoctrine =
    lyraDemoBrandOk ?
      `For email, body must be a concise outbound email of 90-150 words with greeting, concrete reason to care, proof, one low-friction CTA, and a professional signoff using "Lyra" only when Lyra is the actual client brand in workflow_context (warm dossier attached); otherwise sign as ${args.assignee.name}, manager "${rosterExec.manager.name}", or "The [exact company_name from workflow_context] team". Never invent unrelated demo brands as the sender.`
    : `For email, body must be a concise outbound email of 90-150 words with greeting, concrete reason to care, proof, one low-friction CTA, and a professional signoff using ${args.assignee.name}, manager "${rosterExec.manager.name}", or "The [exact company_name from workflow_context] team". Never sign as Lyra or any unrelated operator/client brand name that is not workflow_context.company_name.`;
  const linkedInCtaTail =
    args.workflow.channel_intelligence?.linkedin?.profile_id === HEIDI_AI_LINKEDIN_PLAYBOOK_ID ?
      " Make the CTA operator-grounded for healthcare/clinical workflows (documentation burden, capacity, partnerships, conversations with healthcare ops leads)."
    : lyraDemoBrandOk ?
      " Make the CTA specific: invite founders to book or reply for a focused strategy conversation when that matches workflow_context."
    : " Make the CTA specific to workflow_context personas and proof anchors — avoid unrelated demo narratives.";
  const subAgentSkillBrief = formatSubAgentSkillBrief(args.workflow, args.deliverable.channel, args.deliverable.kind);
  const li = args.workflow.channel_intelligence?.linkedin;
  const linkedInSlot =
    li && args.deliverable.channel === "linkedin" ?
      (() => {
        const pattern = pickLinkedInPostFormatPattern(li, args.deliverableIndex);
        return {
          deliverable_index: args.deliverableIndex,
          post_format_id: pattern.id,
          post_format_label: pattern.label,
          caption_cadence_hint: pattern.caption_cadence_hint,
          visual_card_type_hint: pattern.visual_card_type,
          headline_rules: li.generation_rules.headline_rules,
          caption_rules: li.generation_rules.caption_rules ?? [],
          forbidden_headline_crumbs: li.generation_rules.forbidden_public_headline_patterns ?? [],
        };
      })()
    : null;
  const content = await createJsonChatCompletion({
    label: `${args.assignee.name} execution`,
    temperature: args.revision ? 0.35 : 0.45,
    maxTokens: DRAFT_MAX_TOKENS,
    model: args.assignee.model,
    messages: [
      {
        role: "system",
        content:
          `You are ${args.assignee.name}, one of Orbit's marketing sub-agents. Execute only the deliverable Scott assigned to you, and obey the operator_scope_contract. Your configured tools are: ${args.assignee.tools.join(", ") || "general marketing execution"}. Use the selected sub-agent skill briefing below as execution doctrine:\n${subAgentSkillBrief}\nUse the knowledge base as evidence, never as copy-paste source text. Return strict JSON with keys: deliverable_id, kind, title, subject_line, preview_text, body, proof_point, call_to_action, source_anchors, notes. The returned kind must match the assigned deliverable kind. The returned content must stay on the assigned deliverable channel and must not add unrequested channels, campaign days, or extra operator-review outputs. If the deliverable includes supporting visual/image requirements, describe or support them inside the same deliverable instead of creating a separate channel. Never use placeholders like [Founder Name], [Your Name], [Company], or [Contact Information]; write a complete draft the operator could send or publish after only choosing the destination account/recipient. Avoid these generic marketing phrases entirely: ${GENERIC_MARKETING_PHRASES.join(", ")}. ${emailSignoffDoctrine} Do not open with "I hope this message finds you well." For Instagram, body must be a publishable caption with a sharp hook, one transformed proof point, clear founder-facing CTA, and no LinkedIn/email language. Do not use any emojis. Do not add hashtags unless the operator explicitly requested hashtags. For LinkedIn, obey linkedin_native_execution_slot when present — align title + body hook to post_format_id and caption_rules.${linkedInCtaTail}${linkedinExecutionAddon(args.workflow, args.deliverable, args.deliverableIndex)}`,
      },
      {
        role: "user",
        content: JSON.stringify({
          workflow_context: compactWorkflowContext(args.workflow),
          operator_scope_contract: scopeContract,
          scott_plan: args.plan,
          assigned_deliverable: args.deliverable,
          assignee: args.assignee,
          revision_request: args.revision ?? null,
          previous_output: args.previousOutput ?? null,
          linkedin_native_execution_slot: linkedInSlot,
        }),
      },
    ],
  });

  const parsed = parseJsonObject<RawNovaOutput>(content, `${args.assignee.name} output`);
  let output = normalizeEmployeeOutput(parsed, args.deliverable, args.assignee);
  if (args.deliverable.channel === "email") {
    output = {
      ...output,
      body: scrubEmailBodyDisallowedDemoSignoff(output.body, args.workflow, rosterExec),
    };
  }
  return output;
}

async function askScottToReview(args: {
  workflow: WorkflowState;
  plan: ScottPlan;
  deliverable: DynamicDeliverable;
  deliverableIndex: number;
  assignee: RuntimeAgent;
  output: NovaOutput;
}): Promise<ScottReview> {
  const scopeContract = buildAgentScopeContract(args.workflow);
  const reviewSkillBrief = formatReviewSkillBrief(args.workflow);
  const content = await createJsonChatCompletion({
    label: "Scott review",
    temperature: 0.15,
    maxTokens: REVIEW_MAX_TOKENS,
    model: resolveAgentRoster(args.workflow).manager.model,
    messages: [
      {
        role: "system",
        content:
          `You are Scott, Orbit's manager agent. Review ${args.assignee.name}'s output against the original work order, operator_scope_contract, company knowledge base, selected skill review checks, and the deliverable acceptance criteria. Selected skill review checks:\n${reviewSkillBrief}\nReturn strict JSON with keys: decision (approve|revise), score (0-100), critique, requested_action, issues. You must request revision if the output violates the scope contract: wrong channel, extra channel, unrequested multi-day sequence, or splitting one requested output into multiple operator-review deliverables. You must also request revision for placeholder tokens like [Founder Name]/[Your Name], copied knowledge-base phrasing, weak CTAs, or these banned phrases: ${GENERIC_MARKETING_PHRASES.join(", ")}. For Instagram, request revision if there are emojis or unrequested hashtags. Approve only when it is usable by the operator, specific to the company, has a concrete CTA, obeys the scope contract, follows selected skill checks, and transforms source material into original copy. Do not nitpick forever: if the draft is commercially usable with only minor polish and obeys scope, approve with a critique note. If revision is needed, requested_action must be specific enough for ${args.assignee.name} to redo the work.${linkedinReviewAddon(args.workflow, args.deliverable, args.deliverableIndex)}`,
      },
      {
        role: "user",
        content: JSON.stringify({
          workflow_context: compactWorkflowContext(args.workflow),
          operator_scope_contract: scopeContract,
          scott_plan: args.plan,
          deliverable: args.deliverable,
          employee_agent: args.assignee,
          employee_output: args.output,
        }),
      },
    ],
  });

  const parsed = parseJsonObject<ScottReview>(content, "Scott review");
  if (parsed.decision !== "approve" && parsed.decision !== "revise") {
    throw new Error("Scott review did not return decision approve|revise.");
  }
  return {
    ...parsed,
    score: Math.max(0, Math.min(100, Math.round(Number(parsed.score) || 0))),
    issues: normalizeReviewIssues(parsed.issues),
  };
}

function normalizeReviewIssues(issues: ScottReview["issues"] | undefined): ScottReview["issues"] {
  if (!Array.isArray(issues)) return [];
  return issues.map((issue) => ({
    type: issue?.type || "quality_gap",
    severity: issue?.severity === "high" || issue?.severity === "medium" || issue?.severity === "low" ? issue.severity : "medium",
    note: issue?.note || "Manager requested a more specific, less generic revision.",
  }));
}

function fallbackManagerVisualBrief(args: {
  workflow: WorkflowState;
  draft: CampaignExecutionDraft;
  output: NovaOutput;
  platform: "instagram" | "linkedin";
}): ManagerVisualBrief {
  const company = args.workflow.website_intelligence?.company_name ?? args.workflow.brand_kit?.brand_name ?? "the company";
  const sourceAnchor = args.output.source_anchors[0] ?? args.draft.meta.source_anchor ?? args.draft.meta.visual_source_anchor ?? "approved company proof";
  const visualConcept =
    args.draft.meta.visual_concept ??
    args.draft.meta.campaign_angle ??
    args.output.title ??
    "operator-led product work in a real workspace";
  const channelFrame =
    args.platform === "instagram"
      ? "square/portrait social feed composition with a clear subject and negative space for caption design"
      : "professional LinkedIn post hero image, credible founder/operator editorial style";

  const li = args.workflow.channel_intelligence?.linkedin;
  if (li && args.platform === "linkedin") {
    const vf = li.visual_profile;
    const formatHint = args.draft.meta.channel_post_format ?? args.draft.meta.channel_format ?? "linkedin_native_card";
    const playbookVisual = buildLinkedInVisualRulesForPrompt(li);
    const negExtras = [...vf.avoid_visuals, ...(vf.image_generation_negative_rules ?? [])];

    if (li.profile_id === HEIDI_AI_LINKEDIN_PLAYBOOK_ID) {
      return {
        visual_mode: "brand_graphic",
        asset_purpose: "linkedin_post_image",
        prompt: [
          `SUBJECT: ${visualConcept} — LinkedIn editorial card (${formatHint}) for ${company}; ${vf.summary}`,
          `SETTING: Pale butter-yellow or cream/off-white surfaces; deep burgundy or dark-brown serif headline typography; subtle Heidi flower-loop motif with soft botanical line-art in corners; report-card, healthcare proof/stat tile, partnership announcement, or institutional statement layout — editorial brand_graphic only.`,
          `COMPOSITION: Calm institutional hierarchy with serif headline band, proof/stat ribbon or partnership strip, generous cream negative space; minimal cool-blue accents only when abstract partner-logo neutrality is implied.`,
          `CAMERA/FRAMING: Flat editorial illustration / premium institutional graphic — crisp layout geometry; never documentary photography.`,
          `LIGHTING: Soft warm daylight on yellow/cream fields; restrained shadows; high burgundy-on-cream contrast.`,
          `SOURCE ANCHOR: ${sourceAnchor}. Treat as internal evidence — abstract into shapes, not readable signage.`,
          `CAMPAIGN CONTEXT: ${args.output.proof_point}. ${args.output.notes}`,
          playbookVisual,
          "NEGATIVE PROMPT: neon, arcade, pixel art, sci-fi chrome UI, robots or android mascots, purple SaaS dashboards, stock office photography, generic AI brains, gradient SaaS brochure backgrounds, hyper-real portraits, watermarks.",
        ].join("\n"),
        negative_prompt: [
          "neon gradients",
          "arcade or pixel art",
          "purple or lavender SaaS dashboards",
          "sci-fi holographic chrome UI",
          "robots android mascots mech armor",
          "stock office photography",
          "generic AI brain blobs",
          "photo-real executive portraits",
          "gradient SaaS brochure backgrounds",
          "watermarks",
          ...negExtras,
        ].join(", "),
        visual_source_anchor: sourceAnchor,
        visual_style_notes: `LinkedIn Channel Intelligence (${li.profile_id}) — butter/cream editorial report-card hero aligned to ${formatHint}.`,
      };
    }

    if (li.profile_id === RELEVANCE_AI_LINKEDIN_PLAYBOOK_ID) {
      return {
        visual_mode: "brand_graphic",
        asset_purpose: "linkedin_post_image",
        prompt: [
          `SUBJECT: ${visualConcept} — LinkedIn-native card (${formatHint}) for ${company}; ${vf.summary}`,
          `SETTING: Dark navy/black base (${vf.palette.slice(0, 5).join(", ")}) with electric purple/violet/magenta panels; pixel-art human operators/speakers/builders or arcade poster typography — stylized brand worlds, not stock photography.`,
          `COMPOSITION: Social proof layout with headline band, pixel human avatar tiles or speaker grid, generous contrast for white type; scene matches playbook: ${vf.scene_types.slice(0, 3).join("; ")}.`,
          `CAMERA/FRAMING: Flat / slight isometric illustration or premium vector-social texture allowed; crisp edges, poster hierarchy, confident negative space.`,
          `LIGHTING: Soft bloom on magenta/violet accents; restrained neon yellow only for KPI/stat callouts when relevant.`,
          `SOURCE ANCHOR: ${sourceAnchor}. Treat as internal evidence — abstract into shapes, not readable signage.`,
          `CAMPAIGN CONTEXT: ${args.output.proof_point}. ${args.output.notes}`,
          playbookVisual,
          "NEGATIVE PROMPT: humanoid robots, robot mascots, android faces, power armor, mech suits, cybernetic chrome limbs, corporate stock office photography, generic blue SaaS gradients, healthcare editorial serif layouts, vague glowing AI brains, hyper-real documentary stock smiles, watermarks.",
        ].join("\n"),
        negative_prompt: [
          "humanoid robots",
          "robot mascots",
          "android faces",
          "power armor mech suits cybernetic chrome limbs metal agent characters",
          "corporate stock office photography",
          "generic blue SaaS gradients",
          "healthcare editorial serif vibe",
          "vague glowing AI brain graphics",
          "abstract meaningless gradients without brand hierarchy",
          "boost productivity streamline workflows AI-powered productivity clichés as readable image text",
          "watermarks",
          ...negExtras,
        ].join(", "),
        visual_source_anchor: sourceAnchor,
        visual_style_notes: `LinkedIn Channel Intelligence (${li.profile_id}) — purple/pixel/arcade-native hero aligned to ${formatHint}.`,
      };
    }

    return {
      visual_mode: "brand_graphic",
      asset_purpose: "linkedin_post_image",
      prompt: [
        `SUBJECT: ${visualConcept} — LinkedIn playbook card (${formatHint}) for ${company}; ${vf.summary}`,
        `SETTING: Follow playbook palette (${vf.palette.slice(0, 6).join(", ")}) with motifs: ${vf.motifs.slice(0, 4).join("; ")}.`,
        `COMPOSITION: Scene aligned to ${vf.scene_types.slice(0, 3).join("; ")} — crisp hierarchy, readable negative space.`,
        `CAMERA/FRAMING: Stylized brand-graphic illustration consistent with playbook typography (${vf.typography_style.join("; ")}).`,
        `LIGHTING: Coherent with palette — avoid unrelated stock-photo realism.`,
        `SOURCE ANCHOR: ${sourceAnchor}. Treat as internal evidence — abstract into shapes, not readable signage.`,
        `CAMPAIGN CONTEXT: ${args.output.proof_point}. ${args.output.notes}`,
        playbookVisual,
        `NEGATIVE PROMPT: ${vf.avoid_visuals.join(", ")}, watermarks.`,
      ].join("\n"),
      negative_prompt: [...negExtras, "watermarks"].join(", "),
      visual_source_anchor: sourceAnchor,
      visual_style_notes: `LinkedIn Channel Intelligence (${li.profile_id}) — playbook-aligned brand_graphic hero for ${formatHint}.`,
    };
  }

  return {
    visual_mode: "photo_real_editorial",
    asset_purpose: args.platform === "instagram" ? "instagram_feed_image" : "linkedin_post_image",
    prompt: [
      `SUBJECT: ${visualConcept}.`,
      `SETTING: A believable real workspace connected to ${company}; use concrete human work cues such as desks, laptops, notebooks, product diagrams, team review boards, phone screens, and realistic room materials.`,
      `COMPOSITION: ${channelFrame}; medium-wide editorial framing, layered foreground and background, one clear execution focal point, clean negative space for later typography.`,
      "CAMERA/FRAMING: hyper-realistic documentary photography, natural perspective, 35mm editorial lens feel, no staged corporate poses.",
      "LIGHTING: natural daylight mixed with warm practical office lighting, realistic shadows, subtle brand-color accents only.",
      `SOURCE ANCHOR: ${sourceAnchor}. Treat this as internal evidence; do not render it as readable signage.`,
      `CAMPAIGN CONTEXT: ${args.output.proof_point}. ${args.output.notes}`,
      "NEGATIVE PROMPT: abstract gradients, vector illustration, isometric 3D, neon sci-fi, holographic UI, generic robots, stock-smile corporate photography, unreadable pseudo-text, watermarks, distorted hands, surreal anatomy.",
    ].join("\n"),
    negative_prompt:
      "abstract gradients, vector illustration, isometric 3D, neon sci-fi, holographic UI, generic robots, stock-smile corporate photography, unreadable pseudo-text, watermarks, distorted hands, surreal anatomy",
    visual_source_anchor: sourceAnchor,
    visual_style_notes: `${args.platform} visual brief generated by Scott from the approved draft, source anchor, and company memory. Hyper-realistic editorial only.`,
  };
}

function normalizeManagerVisualBrief(raw: RawManagerVisualBrief, fallback: ManagerVisualBrief): ManagerVisualBrief {
  const prompt = stringField(raw.prompt);
  const negativePrompt = stringField(raw.negative_prompt);
  const visualSourceAnchor = stringField(raw.visual_source_anchor);
  const visualStyleNotes = stringField(raw.visual_style_notes);
  const promptHasRequiredSections =
    /subject:/i.test(prompt) &&
    /setting:/i.test(prompt) &&
    /composition:/i.test(prompt) &&
    /camera\/framing:/i.test(prompt) &&
    /lighting:/i.test(prompt) &&
    /source anchor:/i.test(prompt);
  const normalizedPrompt = promptHasRequiredSections ? prompt : fallback.prompt;
  const visualMode =
    raw.visual_mode === "brand_graphic" || raw.visual_mode === "photo_real_editorial" ? raw.visual_mode : fallback.visual_mode;
  return {
    visual_mode: visualMode,
    asset_purpose:
      raw.asset_purpose === "linkedin_post_image" || raw.asset_purpose === "instagram_feed_image"
        ? raw.asset_purpose
        : fallback.asset_purpose,
    prompt: normalizedPrompt,
    negative_prompt: negativePrompt || fallback.negative_prompt,
    visual_source_anchor: visualSourceAnchor || fallback.visual_source_anchor,
    visual_style_notes: visualStyleNotes || fallback.visual_style_notes,
  };
}

async function askScottForVisualBrief(args: {
  workflowId: string;
  workflow: WorkflowState;
  plan: ScottPlan;
  deliverable: DynamicDeliverable;
  draft: CampaignExecutionDraft;
  output: NovaOutput;
  platform: "instagram" | "linkedin";
}): Promise<ManagerVisualBrief> {
  const fallback = fallbackManagerVisualBrief(args);
  const roster = resolveAgentRoster(args.workflow);
  const linkedInPlaybook =
    args.workflow.channel_intelligence?.linkedin && args.platform === "linkedin" ?
      {
        summary: summarizeLinkedInIntelligenceForPrompt(args.workflow.channel_intelligence.linkedin),
        visual_rules: buildLinkedInVisualRulesForPrompt(args.workflow.channel_intelligence.linkedin),
      }
    : null;

  try {
    const liProfileId = args.workflow.channel_intelligence?.linkedin?.profile_id;
    const linkedInNativeInstructions =
      linkedInPlaybook ?
        liProfileId === HEIDI_AI_LINKEDIN_PLAYBOOK_ID ?
          [
            `You are ${roster.manager.name}, Orbit's manager agent and creative director.`,
            "LinkedIn Channel Intelligence is active for Heidi: produce ONE warm editorial hero brief — pale butter-yellow/cream surfaces, burgundy/dark-brown serif headlines, institutional report-card or healthcare proof/partnership layouts, subtle floral loop motif — brand_graphic only.",
            "visual_mode must be brand_graphic. Never stock photography, neon, arcade, pixel art, sci-fi chrome UI, purple SaaS dashboards, robots, generic AI brains, or gradient SaaS brochure backgrounds.",
            "Return strict JSON only with keys: visual_mode, asset_purpose, prompt, negative_prompt, visual_source_anchor, visual_style_notes.",
            "asset_purpose must be linkedin_post_image.",
            "The prompt must include explicit sections named SUBJECT, SETTING, COMPOSITION, CAMERA/FRAMING, LIGHTING, SOURCE ANCHOR, CAMPAIGN CONTEXT, and NEGATIVE PROMPT.",
            "Embed the visual_rules faithfully. Negative prompt must reinforce bans on neon/purple/pixel/arcade/sci‑fi/robots/stock offices/generic AI hype visuals.",
            "Do not invent readable signage, fake logos, or real-person likenesses.",
          ].join("\n")
        : liProfileId === RELEVANCE_AI_LINKEDIN_PLAYBOOK_ID ?
          [
            `You are ${roster.manager.name}, Orbit's manager agent and creative director.`,
            "LinkedIn Channel Intelligence is active for Relevance AI: produce ONE stylized LinkedIn-native hero card brief (purple/violet/magenta/lavender/dark navy world; pixel-art human operators/speakers/builders or arcade typography when native to the tile).",
            "visual_mode must be brand_graphic for illustrated / premium social-card compositions — not stock photography.",
            "Return strict JSON only with keys: visual_mode, asset_purpose, prompt, negative_prompt, visual_source_anchor, visual_style_notes.",
            "asset_purpose must be linkedin_post_image.",
            "The prompt must include explicit sections named SUBJECT, SETTING, COMPOSITION, CAMERA/FRAMING, LIGHTING, SOURCE ANCHOR, CAMPAIGN CONTEXT, and NEGATIVE PROMPT.",
            "Embed the visual_rules into CAMPAIGN CONTEXT or SETTING faithfully. Negative prompt must ban humanoid robots, robot mascots, android faces, power armor/mech/cybernetic chrome agents, generic blue SaaS gradients, corporate stock office photos, healthcare serif editorial vibes, vague AI brains, and generic productivity slogans as readable image text.",
            "Do not invent readable signage, fake logos, or real-person likenesses.",
          ].join("\n")
        : [
            `You are ${roster.manager.name}, Orbit's manager agent and creative director.`,
            "LinkedIn Channel Intelligence is active: produce ONE playbook-faithful LinkedIn hero card brief matching the seeded visual_profile (brand_graphic).",
            "Return strict JSON only with keys: visual_mode, asset_purpose, prompt, negative_prompt, visual_source_anchor, visual_style_notes.",
            "asset_purpose must be linkedin_post_image.",
            "The prompt must include explicit sections named SUBJECT, SETTING, COMPOSITION, CAMERA/FRAMING, LIGHTING, SOURCE ANCHOR, CAMPAIGN CONTEXT, and NEGATIVE PROMPT.",
            "Honor visual_rules and anti-generic negatives from the playbook.",
            "Do not invent readable signage, fake logos, or real-person likenesses.",
          ].join("\n")
      : [
          `You are ${roster.manager.name}, Orbit's manager agent and creative director.`,
          "Create one hyper-realistic image-generation brief for the approved social draft.",
          "The result must be a realistic editorial photograph, not an abstract background, graphic poster, 3D render, vector illustration, isometric scene, neon sci-fi image, or generic AI startup visual.",
          "Return strict JSON only with keys: visual_mode, asset_purpose, prompt, negative_prompt, visual_source_anchor, visual_style_notes.",
          "visual_mode must be photo_real_editorial.",
          "asset_purpose must be instagram_feed_image or linkedin_post_image.",
          "The prompt must include explicit sections named SUBJECT, SETTING, COMPOSITION, CAMERA/FRAMING, LIGHTING, SOURCE ANCHOR, CAMPAIGN CONTEXT, and NEGATIVE PROMPT.",
          "Use concrete people/action/props/space details from the company memory, work order, employee output, proof point, and source anchors. Do not invent readable signage, claims, fake logos, or real person likenesses.",
        ].join("\n");

    const content = await createJsonChatCompletion({
      label: "Scott visual brief",
      temperature: 0.35,
      maxTokens: VISUAL_PROMPT_MAX_TOKENS,
      model: roster.manager.model,
      messages: [
        {
          role: "system",
          content: linkedInNativeInstructions,
        },
        {
          role: "user",
          content: JSON.stringify({
            workflow_context: compactWorkflowContext(args.workflow),
            scott_plan: args.plan,
            deliverable: args.deliverable,
            social_platform: args.platform,
            draft: args.draft,
            employee_output: args.output,
            linkedin_channel_playbook: linkedInPlaybook,
            fallback_example: fallback,
          }),
        },
      ],
    });

    return normalizeManagerVisualBrief(parseJsonObject<RawManagerVisualBrief>(content, "Scott visual brief"), fallback);
  } catch (error) {
    workflowStore.addLog(args.workflowId, {
      role: "visual_agent",
      step_id: "visual_assets_generated",
      message: `[${roster.manager.name} visual skill]: Visual prompt fell back to structured workflow evidence - ${
        error instanceof Error ? error.message : "unknown error"
      }`,
    });
    return fallback;
  }
}

function draftMeta(draft: CampaignExecutionDraft): Record<string, unknown> {
  return draft.meta as unknown as Record<string, unknown>;
}

function draftId(draft: CampaignExecutionDraft): string {
  return String(draft.meta.id || crypto.randomUUID());
}

function draftChannel(draft: CampaignExecutionDraft): string {
  const meta = draftMeta(draft);
  const channel = meta.channel || ("platform" in draft ? draft.platform : draft.type);
  return String(channel || draft.type || "marketing");
}

function draftTitle(draft: CampaignExecutionDraft): string {
  if ("subject_line" in draft) return draft.subject_line;
  if ("headline" in draft) return draft.headline;
  if ("slides" in draft && draft.slides[0]?.headline) return draft.slides[0].headline;
  return String(draftMeta(draft).content_angle || "Generated output");
}

function draftBody(draft: CampaignExecutionDraft): string {
  if ("body_markdown" in draft) return draft.body_markdown;
  if ("body" in draft) return draft.body;
  if ("caption" in draft) return draft.caption;
  return "";
}

function normalizeReportDecision(value: unknown): ManagerSummaryReport["outputs"][number]["decision"] {
  const decision = String(value ?? "").toLowerCase();
  if (decision === "approve" || decision === "revise" || decision === "blocked" || decision === "pending") return decision;
  return "pending";
}

function buildFallbackManagerSummaryReport(args: {
  workflow: WorkflowState;
  plan: ScottPlan;
  drafts: CampaignExecutionDraft[];
  reviews: ManagerContentReview[];
  roster: ReturnType<typeof resolveAgentRoster>;
  hasUnapprovedOutput: boolean;
}): ManagerSummaryReport {
  const reviewByDraftId = new Map(args.reviews.map((review) => [review.draftId, review]));
  const outputs: ManagerSummaryReport["outputs"] = args.drafts.map((draft) => {
    const id = draftId(draft);
    const review = reviewByDraftId.get(id);
    const assignedAgentId = review?.reviewedAgentId ?? String(draftMeta(draft).assigned_agent_id || "employee");
    const assignedAgent = args.roster.byId.get(assignedAgentId);
    const decision: ManagerSummaryReport["outputs"][number]["decision"] =
      review?.decision === "approve" ? "approve" : review?.decision === "revise" ? "revise" : "pending";
    return {
      draft_id: id,
      title: draftTitle(draft),
      channel: draftChannel(draft),
      assigned_agent_id: assignedAgentId,
      assigned_agent_name: review?.reviewedDisplayName ?? assignedAgent?.name ?? assignedAgentId,
      decision,
      score: review?.score,
      output_summary: compactText(draftBody(draft), 260) ?? "The sub-agent returned a generated marketing output.",
      manager_review_summary: compactText(review?.revisionInstruction || review?.issues?.map((issue) => issue.note).join(" ") || "Manager review completed.", 260) ?? "Manager review completed.",
    };
  });

  return {
    schema_version: "manager_summary_report.v1",
    generated_at: new Date().toISOString(),
    workflow_id: args.workflow.id,
    work_order_id: args.workflow.work_order?.id,
    manager_agent_id: args.roster.manager.id,
    manager_agent_name: args.roster.manager.name,
    company_name: args.workflow.website_intelligence?.company_name ?? "Unknown company",
    task_summary:
      compactText(args.workflow.business_goal, 420) ??
      compactText(args.workflow.work_order?.title, 420) ??
      "The operator asked Orbit to complete a marketing work order.",
    delegation_summary:
      args.plan.deliverables
        .map((deliverable) => {
          const assignee = args.roster.byId.get(String(deliverable.owner_agent_id || ""));
          return `${assignee?.name ?? deliverable.owner_agent_id ?? "Sub-agent"} handled ${deliverable.title} for ${deliverable.channel}.`;
        })
        .join(" "),
    sub_agent_return_summary:
      outputs.length > 0 ?
        outputs.map((output) => `${output.assigned_agent_name} returned ${output.channel}: ${output.title}.`).join(" ")
      : "No sub-agent outputs were returned.",
    manager_review_summary:
      args.reviews.length > 0 ?
        args.reviews.map((review) => `${review.reviewerDisplayName} ${review.decision}d ${review.reviewedDisplayName}'s draft with score ${review.score}.`).join(" ")
      : "No manager reviews were recorded.",
    final_status_summary:
      args.hasUnapprovedOutput ?
        "The workflow needs operator review because one or more outputs did not pass manager approval."
      : "The workflow completed and approved outputs are ready for operator review or execution.",
    outputs,
    source_log_ids: args.workflow.activity_logs.map((log) => log.id),
  };
}

function normalizeManagerSummaryReport(
  raw: RawManagerSummaryReport,
  fallback: ManagerSummaryReport,
): ManagerSummaryReport {
  const outputFallbacks = fallback.outputs;
  const outputs = Array.isArray(raw.outputs) && raw.outputs.length > 0 ?
    raw.outputs.map((output, index) => {
      const fallbackOutput = outputFallbacks[index] ?? outputFallbacks[0];
      return {
        draft_id: stringField(output.draft_id) || fallbackOutput?.draft_id || `draft-${index + 1}`,
        title: stringField(output.title) || fallbackOutput?.title || `Output ${index + 1}`,
        channel: stringField(output.channel) || fallbackOutput?.channel || "marketing",
        assigned_agent_id: stringField(output.assigned_agent_id) || fallbackOutput?.assigned_agent_id || "employee",
        assigned_agent_name: stringField(output.assigned_agent_name) || fallbackOutput?.assigned_agent_name || "Sub-agent",
        decision: normalizeReportDecision(output.decision ?? fallbackOutput?.decision),
        score: Number.isFinite(Number(output.score ?? fallbackOutput?.score)) ? Math.round(Number(output.score ?? fallbackOutput?.score)) : undefined,
        output_summary: stringField(output.output_summary) || fallbackOutput?.output_summary || "Generated output returned.",
        manager_review_summary: stringField(output.manager_review_summary) || fallbackOutput?.manager_review_summary || "Manager review completed.",
      };
    })
  : outputFallbacks;

  return {
    ...fallback,
    manager_agent_id: stringField(raw.manager_agent_id) || fallback.manager_agent_id,
    manager_agent_name: stringField(raw.manager_agent_name) || fallback.manager_agent_name,
    company_name: stringField(raw.company_name) || fallback.company_name,
    task_summary: stringField(raw.task_summary) || fallback.task_summary,
    delegation_summary: stringField(raw.delegation_summary) || fallback.delegation_summary,
    sub_agent_return_summary: stringField(raw.sub_agent_return_summary) || fallback.sub_agent_return_summary,
    manager_review_summary: stringField(raw.manager_review_summary) || fallback.manager_review_summary,
    final_status_summary: stringField(raw.final_status_summary) || fallback.final_status_summary,
    outputs,
  };
}

async function askScottForSummaryReport(args: {
  workflow: WorkflowState;
  plan: ScottPlan;
  drafts: CampaignExecutionDraft[];
  reviews: ManagerContentReview[];
  roster: ReturnType<typeof resolveAgentRoster>;
  hasUnapprovedOutput: boolean;
}): Promise<ManagerSummaryReport> {
  const fallback = buildFallbackManagerSummaryReport(args);
  try {
    const content = await createJsonChatCompletion({
      label: `${args.roster.manager.name} memory report`,
      temperature: 0.2,
      maxTokens: SUMMARY_MAX_TOKENS,
      model: args.roster.manager.model,
      messages: [
        {
          role: "system",
          content:
            `You are ${args.roster.manager.name}, Orbit's manager agent. Write a concise operator-facing memory report for this completed workflow. Return strict JSON only with keys: task_summary, delegation_summary, sub_agent_return_summary, manager_review_summary, final_status_summary, outputs. Each output must include draft_id, title, channel, assigned_agent_id, assigned_agent_name, decision, score, output_summary, manager_review_summary. The report is durable history for Consultant Mode, so be factual and mention what happened, not what should happen next.`,
        },
        {
          role: "user",
          content: JSON.stringify({
            workflow_context: compactWorkflowContext(args.workflow),
            manager_plan: args.plan,
            outputs: fallback.outputs,
            reviews: args.reviews,
            final_status_summary: fallback.final_status_summary,
            activity_logs: args.workflow.activity_logs.map((log) => ({
              id: log.id,
              role: log.role,
              step_id: log.step_id,
              message: log.message,
            })),
          }),
        },
      ],
    });
    return normalizeManagerSummaryReport(parseJsonObject<RawManagerSummaryReport>(content, "Scott memory report"), fallback);
  } catch (error) {
    workflowStore.addLog(args.workflow.id, {
      role: "marketing_manager",
      step_id: "workflow_ready",
      message: `[${args.roster.manager.name}]: Memory report fell back to structured workflow evidence - ${(error as Error).message}`,
    });
    return fallback;
  }
}

function toManagerWorkflowSteps(plan: ScottPlan, roster: ReturnType<typeof resolveAgentRoster>): ManagerWorkflowStep[] {
  return plan.steps.map((step) => {
    const label = `${step.id} ${step.label} ${step.summary}`.toLowerCase();
    const owner = roster.byId.get(step.owner) ?? roster.manager;
    const isBootstrap = /request|receive|read|brief|context|intake/.test(label);
    const isReview = /review|approve|qa|quality|guardrail|final/.test(label);
    const isDraft = owner.role === "employee" || /draft|write|create|compose|produce|asset|post|email|caption/.test(label);
    const completionStepIds: WorkflowStepId[] =
      isReview ? ["campaign_package_ready", "workflow_ready"]
      : isDraft ? ["campaign_draft_generated"]
      : isBootstrap ? ["request_received", "marketing_context_built"]
      : ["marketing_context_built"];

    return {
      id: step.id,
      label: step.label,
      owner_agent_id: step.owner,
      owner_display_name: owner.name,
      owner_role: owner.role,
      summary: step.summary,
      expected_output: step.expected_output,
      depends_on: step.depends_on ?? [],
      completion_step_ids: completionStepIds,
      completion_log_patterns: [step.completion_signal, step.label].filter(Boolean),
      completion_signals: {
        step_ids: completionStepIds,
        log_patterns: [step.completion_signal, step.label].filter(Boolean),
      },
    };
  });
}

function resolveDeliverableDay(deliverable: DynamicDeliverable, fallbackIndex: number): number {
  const plannedDay = Number(deliverable.schedule_day);
  if (Number.isFinite(plannedDay) && plannedDay > 0) return Math.round(plannedDay);
  return fallbackIndex + 1;
}

function buildEmailDraft(output: NovaOutput, review: ScottReview, workflow: WorkflowState, day: number): CampaignEmailDraft {
  const subject = output.subject_line?.trim() || output.title;
  const preview = output.preview_text?.trim() || output.proof_point;
  const roster = resolveAgentRoster(workflow);
  const managerLine = roster.manager.name?.trim() || "Scott";
  const defaultClosing = `Best regards,\n${managerLine}`;
  const signoffIncluded = /\n(best|thanks|regards|cheers|sincerely)[,\s]/i.test(output.body);
  const fullEmail = signoffIncluded ? output.body : `${output.body.trim()}\n\n${defaultClosing}`;

  return {
    meta: {
      id: crypto.randomUUID(),
      day,
      status: review.decision === "approve" ? "pending_review" : "revision_requested",
      operator_status: review.decision === "approve" ? "pending" : "rejected",
      channel: "email",
      original_prompt: workflow.business_goal ?? "",
      strategic_intent: output.notes,
      content_angle: output.title,
      source_anchor: output.source_anchors[0],
      channel_strategy: "LLM-planned one-to-one email deliverable.",
      cta_text: output.call_to_action,
      is_published: false,
      extracted_fact: output.proof_point,
      strategic_insight: output.notes,
      campaign_angle: output.title,
      channel_format: "manager_planned_email",
      originality_notes: "Reviewed by Scott against the work order and company knowledge base.",
      reference_usage_policy: "evidence_only",
      email_detail: {
        greeting: fullEmail.split("\n")[0] ?? "Hi,",
        body: output.body,
        proof_point: output.proof_point,
        signoff: signoffIncluded ? "" : defaultClosing,
        full_email: fullEmail,
      },
    },
    type: "email",
    subject_line: subject,
    preview_text: preview,
    body_markdown: output.body,
    call_to_action: output.call_to_action,
    card_config: {
      headline: output.title,
      subheadline: output.call_to_action,
      logo_placement: "top-left",
      brand_color_overlay: workflow.brand_kit?.accent_hex ?? "#3B82F6",
    },
  };
}

function buildLinkedInDraft(
  output: NovaOutput,
  review: ScottReview,
  workflow: WorkflowState,
  day: number,
  deliverableIndex: number,
  deliverable: DynamicDeliverable,
): CampaignLinkedInPostDraft {
  const li = workflow.channel_intelligence?.linkedin;
  const pattern = li ? pickLinkedInPostFormatPattern(li, deliverableIndex) : null;
  const channelFormatId = pattern?.id ?? "manager_planned_linkedin_post";
  const publicHeadline =
    li && pattern ?
      normalizeLinkedInHeadlineWithChannelIntelligence({
        intelligence: li,
        rawHeadline: output.title,
        pattern,
        deliverableIndex,
        day,
        proofSnippet: output.proof_point,
        deliverableTitle: deliverable.title,
      })
    : output.title.trim();

  const strategicInsight =
    pattern ?
      `${pattern.label}: ${pattern.description} ${output.notes}`.slice(0, 520)
    : output.notes;
  const campaignAngle = pattern ? `${pattern.label} — ${publicHeadline}`.slice(0, 240) : publicHeadline;
  const styleReason =
    li && pattern ?
      `Applied ${li.profile_id} playbook pattern "${pattern.id}" (${pattern.visual_card_type}); Phase 2 native headline normalization for feed-facing title.`
    : undefined;
  const voiceApplied = li ? compactText(buildLinkedInVoiceRulesForPrompt(li), 420) ?? "" : undefined;
  const visualApplied = li ? compactText(buildLinkedInVisualRulesForPrompt(li), 420) ?? "" : undefined;

  return {
    meta: {
      id: crypto.randomUUID(),
      day,
      status: review.decision === "approve" ? "pending_review" : "revision_requested",
      operator_status: review.decision === "approve" ? "pending" : "rejected",
      channel: "linkedin",
      original_prompt: workflow.business_goal ?? "",
      strategic_intent: output.notes,
      content_angle: publicHeadline,
      source_anchor: output.source_anchors[0],
      channel_strategy: li ? "LinkedIn native — Channel Intelligence playbook." : "LLM-planned LinkedIn deliverable.",
      cta_text: output.call_to_action,
      is_published: false,
      extracted_fact: output.proof_point,
      strategic_insight: strategicInsight,
      campaign_angle: campaignAngle,
      channel_format: channelFormatId,
      originality_notes:
        li ? li.anti_copy_rules.join(" ") : "Reviewed by Scott against the work order and company knowledge base.",
      reference_usage_policy: "evidence_only",
      ...(li ?
        {
          channel_intelligence_profile_id: li.profile_id,
          channel_post_format: channelFormatId,
          channel_style_match_reason: styleReason,
          channel_originality_note: li.anti_copy_rules[0],
          channel_voice_rules_applied: voiceApplied,
          channel_visual_style_applied: visualApplied,
        }
      : {}),
    },
    type: "linkedin_post",
    headline: publicHeadline,
    body: output.body,
    card_config: {
      headline: publicHeadline,
      subheadline: output.call_to_action,
      logo_placement: "top-right",
      brand_color_overlay: workflow.brand_kit?.accent_hex ?? workflow.brand_kit?.primary_hex ?? "#111827",
    },
  };
}

function buildInstagramDraft(output: NovaOutput, review: ScottReview, workflow: WorkflowState, day: number): CampaignCarouselDraft {
  const slide: CampaignCarouselSlide = {
    headline: output.title.slice(0, 42),
    supporting_copy: output.proof_point || output.body.slice(0, 140),
    visual_direction: "Brand-led editorial proof card for Instagram feed.",
    design_artifact: {
      headline: output.title.slice(0, 42),
      body: output.proof_point || output.body.slice(0, 140),
      visual_prompt:
        "Create a polished brand-safe Instagram editorial card with clean typography space, realistic business context, and no readable generated text inside the image.",
      layout_config: {
        theme: "editorial_photo_real",
        accent: "brand_palette_led",
        text_effect: "clean_typography",
      },
    },
  };

  return {
    meta: {
      id: crypto.randomUUID(),
      day,
      status: review.decision === "approve" ? "pending_review" : "revision_requested",
      operator_status: review.decision === "approve" ? "pending" : "rejected",
      channel: "instagram",
      original_prompt: workflow.business_goal ?? "",
      strategic_intent: output.notes,
      content_angle: output.title,
      source_anchor: output.source_anchors[0],
      channel_strategy: "LLM-planned Instagram execution deliverable.",
      cta_text: output.call_to_action,
      is_published: false,
      extracted_fact: output.proof_point,
      strategic_insight: output.notes,
      campaign_angle: output.title,
      channel_format: "manager_planned_instagram_caption",
      originality_notes: "Reviewed by Scott against the work order and company knowledge base.",
      reference_usage_policy: "evidence_only",
      visual_concept: "Editorial proof card with caption-led execution.",
    },
    type: "carousel",
    platform: "instagram",
    slides: [slide],
    caption: output.body.includes(output.call_to_action) ? output.body : `${output.body}\n\n${output.call_to_action}`,
    primary_hashtags: ["#MarketingExecution", "#FounderLed", "#AIWorkflows"],
    card_config: {
      headline: output.title,
      subheadline: output.call_to_action,
      logo_placement: "top-left",
      brand_color_overlay: workflow.brand_kit?.accent_hex ?? "#3B82F6",
    },
  };
}

function buildDraft(
  output: NovaOutput,
  review: ScottReview,
  workflow: WorkflowState,
  deliverable: DynamicDeliverable,
  deliverableIndex: number,
): CampaignExecutionDraft {
  const day = resolveDeliverableDay(deliverable, deliverableIndex);
  const kind = kindForChannel(deliverable.channel, deliverable.kind);
  const alignedOutput: NovaOutput = {
    ...output,
    kind,
    title: output.title || deliverable.title,
  };
  if (kind === "email") return buildEmailDraft(alignedOutput, review, workflow, day);
  if (kind === "instagram_caption") return buildInstagramDraft(alignedOutput, review, workflow, day);
  return buildLinkedInDraft(alignedOutput, review, workflow, day, deliverableIndex, deliverable);
}

function buildManagerReview(draftId: string, review: ScottReview, assignee: RuntimeAgent): ManagerContentReview {
  return {
    draftId,
    reviewerAgentId: "scott",
    reviewerDisplayName: "Scott",
    reviewedAgentId: assignee.id,
    reviewedDisplayName: assignee.name,
    decision: review.decision,
    score: review.score,
    issues: review.issues.map((issue) => ({
      type: coerceManagerIssueType(issue.type),
      severity: issue.severity,
      note: `${issue.type}: ${issue.note}`,
    })),
    revisionInstruction: review.decision === "revise" ? review.requested_action : undefined,
    reviewedAt: new Date().toISOString(),
  };
}

function critiqueReasonFromIssueType(type: ManagerContentIssueType): ManagerCritiqueReasonCode {
  switch (type) {
    case "generic_copy":
    case "generic_channel_fit":
    case "wrong_channel_voice":
      return "generic_channel_fit";
    case "weak_channel_format":
      return "visual_too_generic";
    case "unsupported_claim":
      return "unsupported_claim";
    case "weak_cta":
      return "weak_cta";
    case "repetitive":
      return "repetitive";
    case "too_close_to_reference":
      return "too_close_to_reference";
    default:
      return "missing_synthesis";
  }
}

function alignDraftMetaWithFinalReview(draft: CampaignExecutionDraft, managerReview: ManagerContentReview): CampaignExecutionDraft {
  if (managerReview.decision === "approve") return draft;
  return {
    ...draft,
    meta: {
      ...draft.meta,
      status: "revision_requested",
      operator_status: "rejected",
    },
  };
}

function buildManagerCritiqueFromAugmentedReview(
  draftId: string,
  managerReview: ManagerContentReview,
  scottReview: ScottReview,
  assignee: RuntimeAgent,
): ManagerCritique {
  const reasonCodes: ManagerCritiqueReasonCode[] =
    managerReview.issues.length > 0 ?
      Array.from(new Set(managerReview.issues.slice(0, 10).map((i) => critiqueReasonFromIssueType(i.type))))
    : [];

  const playbookFriction = managerReview.issues
    .map((i) => i.note)
    .filter((n) => n.includes("[channel-intelligence]") || n.includes("[channel-visual]"));
  let critique = scottReview.critique;
  if (playbookFriction.length > 0) {
    critique = `${critique} Channel playbook QA: ${playbookFriction.slice(0, 5).join("; ")}`;
  }

  const requestedAction =
    managerReview.decision === "revise" ?
      managerReview.revisionInstruction ?? scottReview.requested_action
    : scottReview.requested_action;

  return {
    id: crypto.randomUUID(),
    draftId,
    targetAgentId: assignee.id,
    targetAgentDisplayName: assignee.name,
    managerAgentId: "scott",
    managerDisplayName: "Scott",
    severity:
      managerReview.decision === "approve" ? "note"
      : managerReview.score < 70 ? "blocker"
      : "pushback",
    stance:
      managerReview.decision === "approve" ? "approve"
      : managerReview.score < 70 ? "block"
      : "challenge",
    critique,
    requestedAction,
    reasonCodes,
    linkedReviewScore: managerReview.score,
    linkedReviewDecision: managerReview.decision,
    createdAt: new Date().toISOString(),
  };
}

export async function runDynamicMarketingWorkOrder(workflowId: string): Promise<void> {
  let workflow = workflowStore.getWorkflow(workflowId);
  if (!workflow || !workflow.website_intelligence || !workflow.product_marketing_context) {
    throw new Error("Workflow missing required context for dynamic marketing execution.");
  }

  const channelIntel = resolveChannelIntelligence({
    companyUrl: workflow.company_url,
    companyName: workflow.website_intelligence.company_name,
  });
  if (channelIntel) {
    workflowStore.updateWorkflow(workflowId, { channel_intelligence: channelIntel });
    workflow = workflowStore.getWorkflow(workflowId) ?? workflow;
    workflowStore.addLog(workflowId, {
      role: "marketing_manager",
      step_id: "brand_profile_loaded",
      message: `[Scott]: Loaded LinkedIn Channel Intelligence playbook (${channelIntel.linkedin?.profile_id ?? "native"}).`,
    });
    appendGovernanceLog(
      workflowId,
      createGovernanceEntry({
        agent_id: "marketing_manager",
        display_agent_name: "Scott",
        step_id: "brand_profile_loaded",
        decision: "Attached seeded LinkedIn Channel Intelligence for native post/visual alignment.",
        rationale:
          channelIntel.linkedin ?
            `Playbook ${channelIntel.linkedin.profile_id} (${channelIntel.linkedin.source_mode}) — voice/visual/post-format constraints active for LinkedIn deliverables.`
          : "Channel intelligence envelope attached.",
        resulting_asset: "channel_intelligence",
        source_url: workflow.company_url,
      }),
    );
  }

  const roster = resolveAgentRoster(workflow);

  workflowStore.addLog(workflowId, {
    role: "marketing_manager",
    step_id: "request_received",
    message: `[Scott]: Reading the work order and company memory for ${workflow.website_intelligence?.company_name ?? "the company"}.`,
    metadata: {
      ui_event: {
        agent_id: "scott",
        state: "reading_context",
        location_hint: "managerHome",
        message: "Reading",
      },
    },
  });

  const plan = await askScottForPlan(workflow);
  const steps = toManagerWorkflowSteps(plan, roster);

  workflowStore.updateWorkflow(workflowId, {
    status: "running",
    manager_workflow_steps: steps,
    selected_skills: Array.from(new Set([...marketingSkillIds(workflow), ...plan.deliverables.map((d) => d.kind)])),
  });

  workflowStore.addLog(workflowId, {
    role: "marketing_manager",
    step_id: "marketing_context_built",
    message: `[Scott]: Plan ready - ${plan.plan_summary}`,
    metadata: {
      ui_event: {
        agent_id: "scott",
        state: "planning",
        location_hint: "managerReview",
        message: "Planning",
      },
    },
  });
  appendGovernanceLog(
    workflowId,
    createGovernanceEntry({
      agent_id: "marketing_manager",
      display_agent_name: "Scott",
      step_id: "marketing_context_built",
      decision: "Generated dynamic manager plan from work order.",
      rationale: plan.reasoning,
      resulting_asset: "manager_workflow_steps",
      source_url: workflow.company_url,
    }),
  );

  const drafts: CampaignExecutionDraft[] = [];
  const reviews: ManagerContentReview[] = [];
  const critiques: ManagerCritique[] = [];
  const generatedAssets: GeneratedCampaignAsset[] = [];
  let hasUnapprovedOutput = false;

  for (const [deliverableIndex, deliverable] of plan.deliverables.entries()) {
    const assignee = employeeForDeliverable(deliverable, deliverableIndex, roster);
    workflowStore.addLog(workflowId, {
      role: "marketing_manager",
      step_id: "marketing_context_built",
      message: `[Scott]: Delegating "${deliverable.title}" to ${assignee.name}.`,
      metadata: {
        ui_event: {
          agent_id: "scott",
          target_agent_id: assignee.id,
          state: "handoff",
          location_hint: "meetingManager",
          message: "Briefing",
        },
      },
    });

    let novaOutput = await askEmployeeToExecute({ workflow, plan, deliverable, deliverableIndex, assignee });
    workflowStore.addLog(workflowId, {
      role: "content_specialist",
      step_id: "campaign_draft_generated",
      message: `[${assignee.name}]: Drafted "${deliverable.title}" for Scott review.`,
      metadata: {
        ui_event: {
          agent_id: assignee.id,
          state: "working",
          location_hint: "employeeWork",
          message: "Drafting",
        },
      },
    });

    let review = await askScottToReview({ workflow, plan, deliverable, deliverableIndex, assignee, output: novaOutput });
    let revisionCount = 0;

    while (review.decision === "revise" && revisionCount < MAX_REVISIONS) {
      workflowStore.addLog(workflowId, {
        role: "marketing_manager",
        step_id: "campaign_package_ready",
        message: `[Scott]: Revision requested for "${deliverable.title}" - ${review.requested_action ?? review.critique}`,
        metadata: {
          ui_event: {
            agent_id: "scott",
            state: "reviewing",
            location_hint: "managerReview",
            message: "Revising",
          },
        },
      });
      novaOutput = await askEmployeeToExecute({
        workflow,
        plan,
        deliverable,
        deliverableIndex,
        assignee,
        revision: review,
        previousOutput: novaOutput,
      });
      workflowStore.addLog(workflowId, {
        role: "content_specialist",
        step_id: "campaign_draft_generated",
        message: `[${assignee.name}]: Revised "${deliverable.title}" for Scott review.`,
        metadata: {
          ui_event: {
            agent_id: assignee.id,
            state: "working",
            location_hint: "employeeWork",
            message: "Revising",
          },
        },
      });
      review = await askScottToReview({ workflow, plan, deliverable, deliverableIndex, assignee, output: novaOutput });
      revisionCount += 1;
    }

    const draft = buildDraft(novaOutput, review, workflow, deliverable, deliverableIndex);
    const wfForReview = workflowStore.getWorkflow(workflowId) ?? workflow;
    let managerReview = augmentManagerReviewWithChannelIntelligence(
      buildManagerReview(draft.meta.id, review, assignee),
      draft,
      wfForReview,
    );

    const { asset, visualBrief, deterministicVisibleCopy } = await generateSocialAssetForDraft({
      workflowId,
      workflow,
      plan,
      deliverable,
      draft,
      output: novaOutput,
    });
    const wfAfterVisual = workflowStore.getWorkflow(workflowId) ?? workflow;
    if (visualBrief && wfAfterVisual.channel_intelligence?.linkedin) {
      const skipHeidiGptCue =
        asset?.rendering_method === "deterministic_svg_template" || Boolean(asset?.playbook_driven);
      const promptForLiQa =
        asset?.playbook_driven && asset.prompt ? asset.prompt : visualBrief.prompt;
      const negForLiQa =
        asset?.playbook_driven && asset.negative_prompt ?
          asset.negative_prompt
        : visualBrief.negative_prompt;
      managerReview = appendIssuesToManagerReview(
        managerReview,
        collectLinkedInVisualPromptIssues(wfAfterVisual, promptForLiQa, negForLiQa, {
          skipHeidiGptVisualCueCheck: skipHeidiGptCue,
        }),
      );
      if (deterministicVisibleCopy && draft.type === "linkedin_post") {
        managerReview = appendPlainIssuesToManagerReview(
          managerReview,
          collectDeterministicHeidiUnsupportedNumericIssues(
            deterministicVisibleCopy,
            wfAfterVisual,
            draft,
          ),
        );
      }
      if (asset?.playbook_driven && draft.type === "linkedin_post") {
        managerReview = appendPlainIssuesToManagerReview(
          managerReview,
          collectPlaybookLinkedInImageAssetIssues(wfAfterVisual, asset, draft),
        );
      }
    }

    const critique = buildManagerCritiqueFromAugmentedReview(draft.meta.id, managerReview, review, assignee);
    const draftAligned = alignDraftMetaWithFinalReview(draft, managerReview);
    const draftWithReview: CampaignExecutionDraft = {
      ...draftAligned,
      meta: {
        ...draftAligned.meta,
        manager_review: managerReview,
        manager_critique: critique,
      },
    };

    drafts.push(draftWithReview);
    reviews.push(managerReview);
    critiques.push(critique);
    if (asset) {
      generatedAssets.push(asset);
    }
    if (managerReview.decision !== "approve") {
      hasUnapprovedOutput = true;
    }

    workflowStore.updateWorkflow(workflowId, {
      campaign_execution_drafts: drafts,
      manager_content_reviews: reviews,
      manager_critiques: critiques,
      generated_campaign_assets: generatedAssets,
    });

    workflowStore.addLog(workflowId, {
      role: "marketing_manager",
      step_id: "campaign_package_ready",
      message:
        review.decision === "approve" ?
          `[Scott]: Approved ${assignee.name}'s "${deliverable.title}" with score ${review.score}.`
        : `[Scott]: Returned "${deliverable.title}" after ${MAX_REVISIONS} revisions with score ${review.score}.`,
      metadata: {
        ui_event: {
          agent_id: "scott",
          state: "reviewing",
          location_hint: "managerReview",
          message: review.decision === "approve" ? "Approved" : "Blocked",
        },
      },
    });
  }

  workflowStore.addLog(workflowId, {
    role: "marketing_manager",
    step_id: "workflow_ready",
    message:
      hasUnapprovedOutput ?
        "[Scott]: Work order needs operator review; one or more sub-agents could not satisfy my approval criteria within the revision limit."
      : "[Scott]: Work order complete; approved outputs are ready for the UI.",
    metadata: {
      ui_event: {
        agent_id: "scott",
        state: hasUnapprovedOutput ? "waiting_approval" : "complete",
        location_hint: "managerHome",
        message: hasUnapprovedOutput ? "Review" : "Complete",
      },
    },
  });

  const latestWorkflow = workflowStore.getWorkflow(workflowId) ?? workflow;
  const managerSummaryReport = await askScottForSummaryReport({
    workflow: latestWorkflow,
    plan,
    drafts,
    reviews,
    roster,
    hasUnapprovedOutput,
  });

  workflowStore.updateWorkflow(workflowId, {
    status: hasUnapprovedOutput ? "needs_review" : "completed",
    manager_summary_report: managerSummaryReport,
    ...(hasUnapprovedOutput ?
      { error_message: "Manager review did not approve all outputs within the revision limit." }
    : { error_message: undefined }),
  });
}

function socialPlatformForDraft(draft: CampaignExecutionDraft): "instagram" | "linkedin" | null {
  if (draft.type === "linkedin_post") return "linkedin";
  if (draft.type === "carousel" && draft.platform === "instagram") return "instagram";
  if (draft.type === "carousel" && draft.platform === "linkedin") return "linkedin";
  return null;
}

async function generateSocialAssetForDraft(args: {
  workflowId: string;
  workflow: WorkflowState;
  plan: ScottPlan;
  deliverable: DynamicDeliverable;
  draft: CampaignExecutionDraft;
  output: NovaOutput;
}): Promise<{
  asset: GeneratedCampaignAsset | null;
  visualBrief: ManagerVisualBrief | null;
  deterministicVisibleCopy?: string;
}> {
  const platform = socialPlatformForDraft(args.draft);
  if (!platform) return { asset: null, visualBrief: null };

  const { workflowId, workflow, plan, deliverable, draft, output } = args;
  if (!workflow.brand_kit) {
    workflowStore.addLog(workflowId, {
      role: "visual_agent",
      step_id: "visual_assets_generated",
      message: `[Scott visual skill]: Skipped ${platform} image generation because brand kit is missing.`,
    });
    return { asset: null, visualBrief: null };
  }

  const visualBrief = await askScottForVisualBrief({
    workflowId,
    workflow,
    plan,
    deliverable,
    draft,
    output,
    platform,
  });

  const li = workflow.channel_intelligence?.linkedin;
  const linkedInVisualRenderMode = (
    process.env.ORBIT_LINKEDIN_VISUAL_RENDER_MODE ?? "deterministic"
  ).toLowerCase();
  const useHeidiDeterministicLinkedInCard =
    platform === "linkedin" &&
    draft.type === "linkedin_post" &&
    li?.profile_id === HEIDI_AI_LINKEDIN_PLAYBOOK_ID &&
    linkedInVisualRenderMode === "deterministic";

  const usePlaybookImageModelLinkedIn =
    platform === "linkedin" &&
    draft.type === "linkedin_post" &&
    li &&
    (li.profile_id === HEIDI_AI_LINKEDIN_PLAYBOOK_ID ||
      li.profile_id === RELEVANCE_AI_LINKEDIN_PLAYBOOK_ID) &&
    linkedInVisualRenderMode === "image_model";

  workflowStore.addLog(workflowId, {
    role: "visual_agent",
    step_id: "visual_assets_generated",
    message:
      useHeidiDeterministicLinkedInCard ?
        `[Scott visual skill]: Rendering deterministic Heidi LinkedIn brand template for "${draft.meta.content_angle ?? draftTitle(draft)}".`
      : usePlaybookImageModelLinkedIn ?
        `[Scott visual skill]: ORBIT_LINKEDIN_VISUAL_RENDER_MODE=image_model — Phase 2F distilled-brief GPT image for "${draft.meta.content_angle ?? draftTitle(draft)}".`
      : `[Scott visual skill]: Generating ${platform} ${visualBrief.visual_mode} image for "${draft.meta.content_angle ?? draftTitle(draft)}".`,
    metadata: {
      ui_event: {
        agent_id: "scott",
        state: "working",
        location_hint: "managerReview",
        message: "Visual",
      },
    },
  });

  try {
    if (useHeidiDeterministicLinkedInCard && li) {
      const rendered = await renderHeidiDeterministicLinkedInCardForWorkflow({
        workflow,
        draft,
        visualBrief,
        profileId: li.profile_id,
      });
      return {
        asset: rendered.asset,
        visualBrief,
        deterministicVisibleCopy: rendered.deterministic_visible_copy,
      };
    }

    if (usePlaybookImageModelLinkedIn && li && draft.type === "linkedin_post") {
      const liDraft = draft as CampaignLinkedInPostDraft;
      const contract = buildSafeLinkedInVisibleTextContract({
        workflow,
        draft: liDraft,
        profileId: li.profile_id,
        day: draft.meta.day,
      });
      const fmtId = draft.meta.channel_post_format;
      const fmtLabel =
        li.post_format_patterns.find((x) => x.id === fmtId)?.label ??
        String(fmtId ?? "linkedin_native");
      const { prompt: pbPrompt, negativePrompt } = buildPlaybookDrivenLinkedInImagePrompt({
        companyName:
          workflow.website_intelligence?.company_name ?? workflow.brand_kit?.brand_name ?? "Company",
        draft: liDraft,
        channelIntelligence: li,
        formatPattern: fmtLabel,
        visibleText: contract,
        sourceProof: draft.meta.extracted_fact,
        visualBriefHints: {
          source_anchor: visualBrief.visual_source_anchor,
          negative_prompt: visualBrief.negative_prompt,
        },
      });
      const fullPromptForAsset = [pbPrompt, "", "Negative / avoidance constraints:", negativePrompt].join("\n");
      const img = await generateOpenAiImageFromFullPrompt({
        prompt: fullPromptForAsset,
        size: "1024x1024",
      });
      const channelExtras = {
        channel_visual_profile_id: li.profile_id,
        channel_visual_prompt_rule: compactText(buildLinkedInVisualRulesForPrompt(li), 360),
        channel_style_match_reason: `Phase 2F distilled visual brief GPT image (${li.profile_id}) format ${String(fmtId ?? "")}; render_mode=image_model; MD not injected.`,
      };
      return {
        asset: {
          id: crypto.randomUUID(),
          draft_type: draft.type,
          platform,
          day: draft.meta.day,
          prompt: fullPromptForAsset,
          image_prompt_detailed: pbPrompt,
          negative_prompt: [visualBrief.negative_prompt, negativePrompt].filter(Boolean).join("\n"),
          visual_source_anchor: visualBrief.visual_source_anchor,
          visual_style_notes: `LinkedIn Phase 2F — distilled playbook brief + compact visible copy (full MD not in image prompt). ${visualBrief.visual_style_notes ?? ""}`.trim(),
          visual_mode: "brand_graphic" as const,
          rendering_method: "openai_image" as const,
          source_draft_id: draft.meta.id,
          ...channelExtras,
          playbook_markdown_path: li.playbook_markdown_path,
          playbook_driven: true,
          linkedin_image_full_md_injected: false,
          visible_text_contract: JSON.stringify(contract),
          openai_image_model_used: img.model_used,
          openai_image_fallback_used: img.fallback_used,
          ...(img.openai_image_primary_failure_sanitized ?
            { openai_image_primary_failure_sanitized: img.openai_image_primary_failure_sanitized }
          : {}),
          image_url: img.image_url,
          created_at: new Date().toISOString(),
        },
        visualBrief,
      };
    }

    const imageVisualMode = visualBrief.visual_mode === "brand_graphic" ? "brand_graphic" : "photo_real_editorial";
    const response = await generateBrandBackground(
      visualBrief.prompt,
      workflow.brand_kit,
      workflow.visual_identity,
      imageVisualMode,
    );
    const channelExtras =
      platform === "linkedin" && li ?
        {
          channel_visual_profile_id: li.profile_id,
          channel_visual_prompt_rule: compactText(buildLinkedInVisualRulesForPrompt(li), 360),
          channel_style_match_reason: `Applied ${li.profile_id} visual playbook for LinkedIn format ${String(draft.meta.channel_post_format ?? draft.meta.channel_format ?? "")}.`,
        }
      : {};

    return {
      asset: {
        id: crypto.randomUUID(),
        draft_type: draft.type,
        platform,
        day: draft.meta.day,
        prompt: response.full_prompt,
        image_prompt_detailed: visualBrief.prompt,
        negative_prompt: visualBrief.negative_prompt,
        visual_source_anchor: visualBrief.visual_source_anchor,
        visual_style_notes: visualBrief.visual_style_notes,
        visual_mode: visualBrief.visual_mode,
        rendering_method: "openai_image",
        source_draft_id: draft.meta.id,
        ...channelExtras,
        image_url: response.image_url,
        ...(response.model_used ? { openai_image_model_used: response.model_used } : {}),
        ...(response.fallback_used !== undefined ?
          { openai_image_fallback_used: response.fallback_used }
        : {}),
        ...(response.openai_image_primary_failure_sanitized ?
          {
            openai_image_primary_failure_sanitized: response.openai_image_primary_failure_sanitized,
          }
        : {}),
        created_at: new Date().toISOString(),
      },
      visualBrief,
    };
  } catch (error) {
    workflowStore.addLog(workflowId, {
      role: "visual_agent",
      step_id: "visual_assets_generated",
      message: `[Scott visual skill]: ${platform} image generation failed - ${
        error instanceof Error ? error.message : "unknown error"
      }`,
    });
    return { asset: null, visualBrief };
  }
}
