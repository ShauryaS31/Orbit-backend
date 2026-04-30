import OpenAI from "openai";

import { appendGovernanceLog, createGovernanceEntry } from "@/lib/services/governance-logger";
import { generateBrandBackground } from "@/lib/services/image-generator";
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
  if (lower === "gpt-4.1" || lower === "gpt-4o" || lower === "gpt-4o-mini" || lower === "o3-mini") return lower;
  if (lower === "gpt-4.1-mini") return "gpt-4.1-mini";
  return model.startsWith("GPT-") ? lower : model;
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
  return {
    work_order: workflow.work_order ?? null,
    objective: workflow.business_goal ?? "",
    success_metric: workflow.success_metric ?? "",
    operator_scope_contract: buildAgentScopeContract(workflow),
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
  const prompt = `${workflow.business_goal ?? ""}\n${workflow.success_metric ?? ""}`.toLowerCase();
  const explicitChannels: DynamicDeliverable["channel"][] = [];
  if (/\b(instagram|ig)\b/.test(prompt)) explicitChannels.push("instagram");
  if (/\b(linkedin|linked\s*in)\b/.test(prompt)) explicitChannels.push("linkedin");
  if (/\b(email|gmail|mail)\b/.test(prompt)) explicitChannels.push("email");

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
    prompt.match(/\b(one|single|two|three|four|five|six|seven|[1-7])\b.{0,40}\b(deliverables?|outputs?|drafts?|assets?|posts?|emails?)\b/) ??
    prompt.match(/\b(deliverables?|outputs?|drafts?|assets?|posts?|emails?)\b.{0,40}\b(one|single|two|three|four|five|six|seven|[1-7])\b/);
  const requestedOutputCountRaw = countMatch?.[1] ?? countMatch?.[2];
  const requestedOutputCount =
    requestedOutputCountRaw ?
      numberWords[requestedOutputCountRaw] ?? Number(requestedOutputCountRaw)
    : null;
  const singleOutputRequested =
    requestedOutputCount === 1 ||
    /\b(one|single|1)\b.{0,50}\b(post|email|draft|asset|caption|message|output)\b/.test(prompt) ||
    /\b(post|email|draft|asset|caption|message|output)\b.{0,50}\b(one|single|1)\b/.test(prompt);
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
          `You are ${roster.manager.name}, Orbit's marketing manager agent. Read the operator work order, company knowledge base, available agent roster, operator_scope_contract, and selected marketing skill briefing. Decide the execution plan yourself, but obey the scope contract exactly. Return strict JSON only with keys: plan_summary, reasoning, steps, deliverables, final_review_checklist. Available agent owners are: ${ownerList}. Steps must be an ordered array of 3-7 steps with id, label, owner, summary, expected_output, depends_on, completion_signal. Every step owner must be one of these exact ids: ${roster.ownerIds.join(", ")}. Deliverables must be the concrete marketing outputs employee agents should produce, with id, kind (email|linkedin_post|instagram_caption|strategy_brief|generic_marketing_asset), channel, title, owner_agent_id, schedule_day, instructions, acceptance_criteria. Every deliverable owner_agent_id must be one of these employee ids: ${employeeList}. Scope contract: ${JSON.stringify(scopeContract)} Selected marketing skill briefing:\n${managerSkillBrief}\nUse multiple employee agents only when the requested scope naturally has multiple independent deliverables. schedule_day must be used only when the scope contract allows a dated sequence. Do not invent campaign length, channels, or extra review outputs.`,
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

async function askEmployeeToExecute(args: {
  workflow: WorkflowState;
  plan: ScottPlan;
  deliverable: DynamicDeliverable;
  assignee: RuntimeAgent;
  revision?: ScottReview;
  previousOutput?: NovaOutput;
}): Promise<NovaOutput> {
  const scopeContract = buildAgentScopeContract(args.workflow);
  const subAgentSkillBrief = formatSubAgentSkillBrief(args.workflow, args.deliverable.channel, args.deliverable.kind);
  const content = await createJsonChatCompletion({
    label: `${args.assignee.name} execution`,
    temperature: args.revision ? 0.35 : 0.45,
    maxTokens: DRAFT_MAX_TOKENS,
    model: args.assignee.model,
    messages: [
      {
        role: "system",
        content:
          `You are ${args.assignee.name}, one of Orbit's marketing sub-agents. Execute only the deliverable Scott assigned to you, and obey the operator_scope_contract. Your configured tools are: ${args.assignee.tools.join(", ") || "general marketing execution"}. Use the selected sub-agent skill briefing below as execution doctrine:\n${subAgentSkillBrief}\nUse the knowledge base as evidence, never as copy-paste source text. Return strict JSON with keys: deliverable_id, kind, title, subject_line, preview_text, body, proof_point, call_to_action, source_anchors, notes. The returned kind must match the assigned deliverable kind. The returned content must stay on the assigned deliverable channel and must not add unrequested channels, campaign days, or extra operator-review outputs. If the deliverable includes supporting visual/image requirements, describe or support them inside the same deliverable instead of creating a separate channel. Never use placeholders like [Founder Name], [Your Name], [Company], or [Contact Information]; write a complete draft the operator could send or publish after only choosing the destination account/recipient. Avoid these generic marketing phrases entirely: ${GENERIC_MARKETING_PHRASES.join(", ")}. For email, body must be a concise outbound email of 90-150 words with greeting, concrete reason to care, proof, one low-friction CTA, and signoff from Lyra. Do not open with "I hope this message finds you well." For Instagram, body must be a publishable caption with a sharp hook, one transformed proof point, clear founder-facing CTA, and no LinkedIn/email language. Do not use any emojis. Do not add hashtags unless the operator explicitly requested hashtags. Make the CTA specific: invite founders to book or reply for a focused strategy conversation about shipping product with forward-deployed engineers.`,
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
        }),
      },
    ],
  });

  const parsed = parseJsonObject<RawNovaOutput>(content, `${args.assignee.name} output`);
  return normalizeEmployeeOutput(parsed, args.deliverable, args.assignee);
}

async function askScottToReview(args: {
  workflow: WorkflowState;
  plan: ScottPlan;
  deliverable: DynamicDeliverable;
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
          `You are Scott, Orbit's manager agent. Review ${args.assignee.name}'s output against the original work order, operator_scope_contract, company knowledge base, selected skill review checks, and the deliverable acceptance criteria. Selected skill review checks:\n${reviewSkillBrief}\nReturn strict JSON with keys: decision (approve|revise), score (0-100), critique, requested_action, issues. You must request revision if the output violates the scope contract: wrong channel, extra channel, unrequested multi-day sequence, or splitting one requested output into multiple operator-review deliverables. You must also request revision for placeholder tokens like [Founder Name]/[Your Name], copied knowledge-base phrasing, weak CTAs, or these banned phrases: ${GENERIC_MARKETING_PHRASES.join(", ")}. For Instagram, request revision if there are emojis or unrequested hashtags. Approve only when it is usable by the operator, specific to the company, has a concrete CTA, obeys the scope contract, follows selected skill checks, and transforms source material into original copy. Do not nitpick forever: if the draft is commercially usable with only minor polish and obeys scope, approve with a critique note. If revision is needed, requested_action must be specific enough for ${args.assignee.name} to redo the work.`,
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
  const signoffIncluded = /\n(best|thanks|regards|cheers|sincerely)[,\s]/i.test(output.body);
  const fullEmail = signoffIncluded ? output.body : `${output.body.trim()}\n\nBest,\nNova`;

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
        signoff: signoffIncluded ? "" : "Best,\nNova",
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

function buildLinkedInDraft(output: NovaOutput, review: ScottReview, workflow: WorkflowState, day: number): CampaignLinkedInPostDraft {
  return {
    meta: {
      id: crypto.randomUUID(),
      day,
      status: review.decision === "approve" ? "pending_review" : "revision_requested",
      operator_status: review.decision === "approve" ? "pending" : "rejected",
      channel: "linkedin",
      original_prompt: workflow.business_goal ?? "",
      strategic_intent: output.notes,
      content_angle: output.title,
      source_anchor: output.source_anchors[0],
      channel_strategy: "LLM-planned LinkedIn deliverable.",
      cta_text: output.call_to_action,
      is_published: false,
      extracted_fact: output.proof_point,
      strategic_insight: output.notes,
      campaign_angle: output.title,
      channel_format: "manager_planned_linkedin_post",
      originality_notes: "Reviewed by Scott against the work order and company knowledge base.",
      reference_usage_policy: "evidence_only",
    },
    type: "linkedin_post",
    headline: output.title,
    body: output.body,
    card_config: {
      headline: output.title,
      subheadline: output.call_to_action,
      logo_placement: "top-right",
      brand_color_overlay: workflow.brand_kit?.primary_hex ?? "#111827",
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
  return buildLinkedInDraft(alignedOutput, review, workflow, day);
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
      type: "generic_copy",
      severity: issue.severity,
      note: `${issue.type}: ${issue.note}`,
    })),
    revisionInstruction: review.decision === "revise" ? review.requested_action : undefined,
    reviewedAt: new Date().toISOString(),
  };
}

function buildManagerCritique(draftId: string, review: ScottReview, assignee: RuntimeAgent): ManagerCritique {
  const reasonCodes: ManagerCritiqueReasonCode[] =
    review.issues.length > 0 ? review.issues.slice(0, 4).map(() => "missing_synthesis") : [];

  return {
    id: crypto.randomUUID(),
    draftId,
    targetAgentId: assignee.id,
    targetAgentDisplayName: assignee.name,
    managerAgentId: "scott",
    managerDisplayName: "Scott",
    severity: review.decision === "approve" ? "note" : review.score < 70 ? "blocker" : "pushback",
    stance: review.decision === "approve" ? "approve" : review.score < 70 ? "block" : "challenge",
    critique: review.critique,
    requestedAction: review.requested_action,
    reasonCodes,
    linkedReviewScore: review.score,
    linkedReviewDecision: review.decision,
    createdAt: new Date().toISOString(),
  };
}

export async function runDynamicMarketingWorkOrder(workflowId: string): Promise<void> {
  const workflow = workflowStore.getWorkflow(workflowId);
  if (!workflow || !workflow.website_intelligence || !workflow.product_marketing_context) {
    throw new Error("Workflow missing required context for dynamic marketing execution.");
  }
  const roster = resolveAgentRoster(workflow);

  workflowStore.addLog(workflowId, {
    role: "marketing_manager",
    step_id: "request_received",
    message: `[Scott]: Reading the work order and company memory for ${workflow.website_intelligence.company_name}.`,
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

    let novaOutput = await askEmployeeToExecute({ workflow, plan, deliverable, assignee });
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

    let review = await askScottToReview({ workflow, plan, deliverable, assignee, output: novaOutput });
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
      review = await askScottToReview({ workflow, plan, deliverable, assignee, output: novaOutput });
      revisionCount += 1;
    }

    const draft = buildDraft(novaOutput, review, workflow, deliverable, deliverableIndex);
    const managerReview = buildManagerReview(draft.meta.id, review, assignee);
    const critique = buildManagerCritique(draft.meta.id, review, assignee);
    const draftWithReview: CampaignExecutionDraft = {
      ...draft,
      meta: {
        ...draft.meta,
        manager_review: managerReview,
        manager_critique: critique,
      },
    };

    drafts.push(draftWithReview);
    reviews.push(managerReview);
    critiques.push(critique);
    if (draftWithReview.type === "carousel" && draftWithReview.platform === "instagram") {
      const asset = await generateInstagramAssetForDraft(workflowId, workflow, draftWithReview, novaOutput);
      if (asset) {
        generatedAssets.push(asset);
      }
    }
    if (review.decision !== "approve") {
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
        state: hasUnapprovedOutput ? "error" : "complete",
        location_hint: "managerHome",
        message: hasUnapprovedOutput ? "Needs review" : "Complete",
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
    status: hasUnapprovedOutput ? "failed" : "completed",
    manager_summary_report: managerSummaryReport,
    ...(hasUnapprovedOutput ? { error_message: "Manager review did not approve all outputs within the revision limit." } : {}),
  });
}

async function generateInstagramAssetForDraft(
  workflowId: string,
  workflow: WorkflowState,
  draft: CampaignCarouselDraft,
  output: NovaOutput,
): Promise<GeneratedCampaignAsset | null> {
  if (!workflow.brand_kit) {
    workflowStore.addLog(workflowId, {
      role: "visual_agent",
      step_id: "visual_assets_generated",
      message: "[Scott · visual skill]: Skipped Instagram image generation because brand kit is missing.",
    });
    return null;
  }

  const slide = draft.slides[0];
  const prompt = [
    "Create a square Instagram feed image for this approved marketing caption.",
    "No readable text inside the image. Leave clean negative space for the final caption to carry the message.",
    `Company: ${workflow.website_intelligence?.company_name ?? workflow.brand_kit.brand_name}.`,
    `Campaign angle: ${draft.meta.campaign_angle ?? output.title}.`,
    `Proof point: ${output.proof_point}.`,
    `Visual direction: ${slide?.design_artifact?.visual_prompt ?? slide?.visual_direction ?? "premium editorial brand image"}.`,
  ].join(" ");

  workflowStore.addLog(workflowId, {
    role: "visual_agent",
    step_id: "visual_assets_generated",
    message: `[Scott · visual skill]: Generating Supabase-backed Instagram image for "${draft.meta.content_angle}".`,
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
    const response = await generateBrandBackground(prompt, workflow.brand_kit, workflow.visual_identity);
    return {
      id: crypto.randomUUID(),
      draft_type: draft.type,
      platform: "instagram",
      day: draft.meta.day as GeneratedCampaignAsset["day"],
      prompt: response.full_prompt,
      image_prompt_detailed: prompt,
      visual_style_notes: "Generated for dynamic Instagram work-order execution.",
      image_url: response.image_url,
      created_at: new Date().toISOString(),
    };
  } catch (error) {
    workflowStore.addLog(workflowId, {
      role: "visual_agent",
      step_id: "visual_assets_generated",
      message: `[Scott · visual skill]: Instagram image generation failed - ${
        error instanceof Error ? error.message : "unknown error"
      }`,
    });
    return null;
  }
}
