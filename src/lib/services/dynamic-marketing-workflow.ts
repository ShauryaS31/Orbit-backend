import OpenAI from "openai";

import { appendGovernanceLog, createGovernanceEntry } from "@/lib/services/governance-logger";
import { workflowStore } from "@/lib/state/workflow-store";
import type {
  CampaignEmailDraft,
  CampaignCarouselDraft,
  CampaignCarouselSlide,
  CampaignExecutionDraft,
  CampaignLinkedInPostDraft,
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

type DynamicStepOwner = "scott" | "nova";
type DynamicDeliverableKind = "email" | "linkedin_post" | "instagram_caption" | "strategy_brief" | "generic_marketing_asset";

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

function resolveAgentModel(): string {
  const configured = process.env.OPENAI_AGENT_MODEL ?? process.env.OPENAI_TEXT_MODEL ?? process.env.OPENAI_MODEL;
  if (configured && !configured.toLowerCase().includes("image")) return configured;
  return "gpt-4o-mini";
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

function compactWorkflowContext(workflow: WorkflowState) {
  const intelligence = workflow.website_intelligence;
  const context = workflow.product_marketing_context;
  return {
    work_order: workflow.work_order ?? null,
    objective: workflow.business_goal ?? "",
    success_metric: workflow.success_metric ?? "",
    brand_learning_notes: workflow.brand_learning_notes ?? [],
    company: {
      name: intelligence?.company_name ?? "Unknown company",
      url: workflow.company_url,
      industry: intelligence?.industry,
      audience_summary: intelligence?.audience_summary,
      key_value_propositions: intelligence?.key_value_propositions ?? [],
      product_offerings: intelligence?.product_offerings ?? [],
      differentiators: intelligence?.differentiators ?? [],
      social_proof: intelligence?.social_proof ?? [],
    },
    marketing_context: context,
    warm_intelligence: workflow.lyra_warm_intelligence ?? null,
  };
}

async function askScottForPlan(workflow: WorkflowState): Promise<ScottPlan> {
  const client = getClient();
  const response = await client.chat.completions.create({
    model: AGENT_MODEL,
    temperature: 0.25,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content:
          "You are Scott, Orbit's marketing manager agent. Read the operator work order and company knowledge base. Decide the execution plan yourself. Return strict JSON only with keys: plan_summary, reasoning, steps, deliverables, final_review_checklist. Steps must be an ordered array of 3-7 steps with id, label, owner (scott|nova), summary, expected_output, depends_on, completion_signal. Deliverables must be the concrete marketing outputs Nova should produce, with id, kind (email|linkedin_post|instagram_caption|strategy_brief|generic_marketing_asset), channel, title, schedule_day, instructions, acceptance_criteria. schedule_day must be a positive integer only when the work order asks for a campaign, multi-day sequence, or dated publishing plan; distribute multiple same-channel deliverables across different days unless the work order explicitly asks for multiple posts on the same day. Do not create a 7-day campaign unless the work order actually asks for a campaign or multi-day package. If the user asks for one email, plan one email.",
      },
      {
        role: "user",
        content: JSON.stringify(compactWorkflowContext(workflow)),
      },
    ],
  });

  const parsed = parseJsonObject<ScottPlan>(response.choices[0]?.message?.content, "Scott plan");
  if (!Array.isArray(parsed.steps) || parsed.steps.length === 0) {
    throw new Error("Scott plan did not include executable steps.");
  }
  if (!Array.isArray(parsed.deliverables) || parsed.deliverables.length === 0) {
    throw new Error("Scott plan did not include deliverables for Nova.");
  }
  return parsed;
}

async function askNovaToExecute(args: {
  workflow: WorkflowState;
  plan: ScottPlan;
  deliverable: DynamicDeliverable;
  revision?: ScottReview;
  previousOutput?: NovaOutput;
}): Promise<NovaOutput> {
  const client = getClient();
  const response = await client.chat.completions.create({
    model: AGENT_MODEL,
    temperature: args.revision ? 0.35 : 0.45,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content:
          "You are Nova, Orbit's marketing sub-agent. Execute only the deliverable Scott assigned. Use the knowledge base as evidence, never as copy-paste source text. Return strict JSON with keys: deliverable_id, kind, title, subject_line, preview_text, body, proof_point, call_to_action, source_anchors, notes. For email, body must be a complete send-ready email body with greeting and signoff. Avoid generic phrases such as unlock, revolutionize, game-changing, empower, streamline, cutting-edge, and in today's fast-paced. For other channels, body must be the final publishable draft.",
      },
      {
        role: "user",
        content: JSON.stringify({
          workflow_context: compactWorkflowContext(args.workflow),
          scott_plan: args.plan,
          assigned_deliverable: args.deliverable,
          revision_request: args.revision ?? null,
          previous_output: args.previousOutput ?? null,
        }),
      },
    ],
  });

  const parsed = parseJsonObject<NovaOutput>(response.choices[0]?.message?.content, "Nova output");
  if (!parsed.body?.trim()) throw new Error("Nova output did not include body text.");
  if (!parsed.call_to_action?.trim()) throw new Error("Nova output did not include a call_to_action.");
  return {
    ...parsed,
    deliverable_id: parsed.deliverable_id || args.deliverable.id,
    kind: parsed.kind || args.deliverable.kind,
    title: parsed.title || args.deliverable.title,
    source_anchors: Array.isArray(parsed.source_anchors) ? parsed.source_anchors : [],
  };
}

async function askScottToReview(args: {
  workflow: WorkflowState;
  plan: ScottPlan;
  deliverable: DynamicDeliverable;
  output: NovaOutput;
}): Promise<ScottReview> {
  const client = getClient();
  const response = await client.chat.completions.create({
    model: AGENT_MODEL,
    temperature: 0.15,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content:
          "You are Scott, Orbit's manager agent. Review Nova's output against the original work order, company knowledge base, and the deliverable acceptance criteria. Return strict JSON with keys: decision (approve|revise), score (0-100), critique, requested_action, issues. Approve if it is usable by the operator, specific to the company, has a concrete CTA, and does not copy the knowledge base. Do not nitpick forever: if the draft is commercially usable with only minor polish, approve with a critique note. If revision is needed, requested_action must be specific enough for Nova to redo the work.",
      },
      {
        role: "user",
        content: JSON.stringify({
          workflow_context: compactWorkflowContext(args.workflow),
          scott_plan: args.plan,
          deliverable: args.deliverable,
          nova_output: args.output,
        }),
      },
    ],
  });

  const parsed = parseJsonObject<ScottReview>(response.choices[0]?.message?.content, "Scott review");
  if (parsed.decision !== "approve" && parsed.decision !== "revise") {
    throw new Error("Scott review did not return decision approve|revise.");
  }
  return {
    ...parsed,
    score: Math.max(0, Math.min(100, Math.round(Number(parsed.score) || 0))),
    issues: Array.isArray(parsed.issues) ? parsed.issues : [],
  };
}

function toManagerWorkflowSteps(plan: ScottPlan): ManagerWorkflowStep[] {
  return plan.steps.map((step) => {
    const label = `${step.id} ${step.label} ${step.summary}`.toLowerCase();
    const isBootstrap = /request|receive|read|brief|context|intake/.test(label);
    const isReview = /review|approve|qa|quality|guardrail|final/.test(label);
    const isDraft = step.owner === "nova" || /draft|write|create|compose|produce|asset|post|email|caption/.test(label);
    const completionStepIds: WorkflowStepId[] =
      isReview ? ["campaign_package_ready", "workflow_ready"]
      : isDraft ? ["campaign_draft_generated"]
      : isBootstrap ? ["request_received", "marketing_context_built"]
      : ["marketing_context_built"];

    return {
      id: step.id,
      label: step.label,
      owner_agent_id: step.owner,
      owner_display_name: step.owner === "nova" ? "Nova" : "Scott",
      owner_role: step.owner === "nova" ? "employee" : "manager",
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
      status: review.decision === "approve" ? "approved" : "revision_requested",
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
      status: review.decision === "approve" ? "approved" : "revision_requested",
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
      status: review.decision === "approve" ? "approved" : "revision_requested",
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
    caption: `${output.body}\n\n${output.call_to_action}`,
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
  if (output.kind === "email") return buildEmailDraft(output, review, workflow, day);
  if (output.kind === "instagram_caption") return buildInstagramDraft(output, review, workflow, day);
  return buildLinkedInDraft(output, review, workflow, day);
}

function buildManagerReview(draftId: string, review: ScottReview): ManagerContentReview {
  return {
    draftId,
    reviewerAgentId: "scott",
    reviewerDisplayName: "Scott",
    reviewedAgentId: "nova",
    reviewedDisplayName: "Nova",
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

function buildManagerCritique(draftId: string, review: ScottReview): ManagerCritique {
  const reasonCodes: ManagerCritiqueReasonCode[] =
    review.issues.length > 0 ? review.issues.slice(0, 4).map(() => "missing_synthesis") : [];

  return {
    id: crypto.randomUUID(),
    draftId,
    targetAgentId: "nova",
    targetAgentDisplayName: "Nova",
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
  const steps = toManagerWorkflowSteps(plan);

  workflowStore.updateWorkflow(workflowId, {
    status: "running",
    manager_workflow_steps: steps,
    selected_skills: Array.from(new Set(plan.deliverables.map((d) => d.kind))),
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
  let hasUnapprovedOutput = false;

  for (const [deliverableIndex, deliverable] of plan.deliverables.entries()) {
    workflowStore.addLog(workflowId, {
      role: "marketing_manager",
      step_id: "marketing_context_built",
      message: `[Scott]: Delegating "${deliverable.title}" to Nova.`,
      metadata: {
        ui_event: {
          agent_id: "scott",
          target_agent_id: "nova",
          state: "handoff",
          location_hint: "meetingManager",
          message: "Briefing",
        },
      },
    });

    let novaOutput = await askNovaToExecute({ workflow, plan, deliverable });
    workflowStore.addLog(workflowId, {
      role: "content_specialist",
      step_id: "campaign_draft_generated",
      message: `[Nova]: Drafted "${deliverable.title}" for Scott review.`,
      metadata: {
        ui_event: {
          agent_id: "nova",
          state: "working",
          location_hint: "employeeWork",
          message: "Drafting",
        },
      },
    });

    let review = await askScottToReview({ workflow, plan, deliverable, output: novaOutput });
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
      novaOutput = await askNovaToExecute({
        workflow,
        plan,
        deliverable,
        revision: review,
        previousOutput: novaOutput,
      });
      workflowStore.addLog(workflowId, {
        role: "content_specialist",
        step_id: "campaign_draft_generated",
        message: `[Nova]: Revised "${deliverable.title}" for Scott review.`,
        metadata: {
          ui_event: {
            agent_id: "nova",
            state: "working",
            location_hint: "employeeWork",
            message: "Revising",
          },
        },
      });
      review = await askScottToReview({ workflow, plan, deliverable, output: novaOutput });
      revisionCount += 1;
    }

    const draft = buildDraft(novaOutput, review, workflow, deliverable, deliverableIndex);
    const managerReview = buildManagerReview(draft.meta.id, review);
    const critique = buildManagerCritique(draft.meta.id, review);
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
    if (review.decision !== "approve") {
      hasUnapprovedOutput = true;
    }

    workflowStore.updateWorkflow(workflowId, {
      campaign_execution_drafts: drafts,
      manager_content_reviews: reviews,
      manager_critiques: critiques,
      generated_campaign_assets: [],
    });

    workflowStore.addLog(workflowId, {
      role: "marketing_manager",
      step_id: "campaign_package_ready",
      message:
        review.decision === "approve" ?
          `[Scott]: Approved Nova's "${deliverable.title}" with score ${review.score}.`
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
        "[Scott]: Work order needs operator review; Nova could not satisfy my approval criteria within the revision limit."
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

  workflowStore.updateWorkflow(workflowId, {
    status: hasUnapprovedOutput ? "failed" : "completed",
    ...(hasUnapprovedOutput ? { error_message: "Manager review did not approve all outputs within the revision limit." } : {}),
  });
}
