import { NextResponse } from "next/server";

import { fuseBrandIntelligence, validateIntelligence } from "@/lib/agents/researcher";
import {
  applyLyraWarmIntelligenceToProfile,
  isLyraCompanyUrl,
  LYRA_WARM_INTELLIGENCE,
} from "@/lib/data/lyra-brand-intelligence";
import { findMockCompanyByUrl } from "@/lib/data/mock-companies";
import { scrapeWebsiteIntelligence } from "@/lib/services/web-scraper";
import { runMarketingWorkOrder } from "@/lib/services/workflow-execution";
import { workflowStore } from "@/lib/state/workflow-store";
import {
  type MarketingAgentRosterItem,
  NOVAS_RESEARCH_REPORT_TITLE,
  type ProductMarketingContext,
  type WorkflowState,
} from "@/lib/types/orbit";

interface StartWorkflowRequestBody {
  company_url?: string;
  demo_mode?: boolean;
  /** Forces design-first 10-slide Instagram expert carousel instead of generalist 7-day mix. */
  carousel_maker?: boolean;
  output_type?: string;
  work_order?: {
    id?: string;
    title?: string;
    department?: "marketing";
    manager_agent_id?: string;
    output_type?: string;
    autonomy?: string;
    approval_required?: boolean;
  };
  business_goal?: string;
  success_metric?: string;
  brand_learning_notes?: string[];
  agent_roster?: MarketingAgentRosterItem[];
}

export async function POST(request: Request) {
  let body: StartWorkflowRequestBody;

  try {
    body = (await request.json()) as StartWorkflowRequestBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const companyUrl = body.company_url?.trim();
  const demoMode = Boolean(body.demo_mode);
  const carouselMaker = Boolean(body.carousel_maker);
  const workOrder =
    body.work_order || body.output_type ?
      {
        ...(body.work_order ?? {}),
        output_type: body.work_order?.output_type ?? body.output_type,
      }
    : undefined;
  const businessGoal = body.business_goal?.trim();
  const successMetric = body.success_metric?.trim();
  const brandLearningNotes =
    Array.isArray(body.brand_learning_notes) ?
      body.brand_learning_notes.map((n) => String(n).trim()).filter(Boolean)
    : undefined;
  const agentRoster = normalizeAgentRoster(body.agent_roster);

  if (!companyUrl) {
    return NextResponse.json(
      { error: "Field 'company_url' is required." },
      { status: 400 },
    );
  }

  const workflowId = crypto.randomUUID();

  if (demoMode) {
    const lyraMode = isLyraCompanyUrl(companyUrl);
    const mockCompany = findMockCompanyByUrl(companyUrl);
    if (!mockCompany) {
      return NextResponse.json(
        { error: "No demo company found for the provided URL." },
        { status: 404 },
      );
    }
    const warmProfile =
      lyraMode ?
        applyLyraWarmIntelligenceToProfile({
          website_intelligence: mockCompany.website_intelligence,
          intelligence_validation: mockCompany.intelligence_validation,
          brand_kit: mockCompany.brand_kit,
          product_marketing_context: mockCompany.product_marketing_context,
        })
      : null;

    const initialState: Omit<WorkflowState, "created_at" | "updated_at"> = {
      id: workflowId,
      status: "running",
      company_url: companyUrl,
      demo_mode: true,
      ...(workOrder ? { work_order: workOrder } : {}),
      carousel_maker_mode: carouselMaker,
      ...(businessGoal ? { business_goal: businessGoal } : {}),
      ...(successMetric ? { success_metric: successMetric } : {}),
      ...(brandLearningNotes?.length ? { brand_learning_notes: brandLearningNotes } : {}),
      ...(agentRoster.length ? { agent_roster: agentRoster } : {}),
      website_intelligence: warmProfile?.website_intelligence ?? mockCompany.website_intelligence,
      intelligence_validation: warmProfile?.intelligence_validation ?? mockCompany.intelligence_validation,
      brand_kit: warmProfile?.brand_kit ?? mockCompany.brand_kit,
      product_marketing_context: warmProfile?.product_marketing_context ?? mockCompany.product_marketing_context,
      ...(lyraMode ? { lyra_warm_intelligence: LYRA_WARM_INTELLIGENCE } : {}),
      campaign_execution_drafts: [],
      generated_campaign_assets: [],
      activity_logs: [],
      consultant_discovery: {
        research_report_title: NOVAS_RESEARCH_REPORT_TITLE,
      },
    };

    workflowStore.createWorkflow(initialState);
    workflowStore.addLog(workflowId, {
      role: "marketing_manager",
      step_id: "request_received",
      message: "[Scott]: Work order received - Nova's company memory is staged.",
    });
    runWorkflowInBackground(workflowId);
    return NextResponse.json({ workflow_id: workflowId, status: "started" });
  }

  workflowStore.createWorkflow({
    id: workflowId,
    status: "running",
    company_url: companyUrl,
    demo_mode: false,
    ...(workOrder ? { work_order: workOrder } : {}),
    carousel_maker_mode: carouselMaker,
    ...(businessGoal ? { business_goal: businessGoal } : {}),
    ...(successMetric ? { success_metric: successMetric } : {}),
    ...(brandLearningNotes?.length ? { brand_learning_notes: brandLearningNotes } : {}),
    ...(agentRoster.length ? { agent_roster: agentRoster } : {}),
    campaign_execution_drafts: [],
    generated_campaign_assets: [],
    activity_logs: [],
    consultant_discovery: {
      research_report_title: NOVAS_RESEARCH_REPORT_TITLE,
    },
  });

  workflowStore.addLog(workflowId, {
    role: "marketing_manager",
    step_id: "request_received",
    message: "[Scott]: Workflow started - Nova is crawling your site for Consultant Mode.",
  });

  try {
    const scrapeResult = await scrapeWebsiteIntelligence(companyUrl);
    for (const event of scrapeResult.crawl_events) {
      workflowStore.addLog(workflowId, {
        role: "researcher",
        step_id: "website_intelligence_gathered",
        message: `[Nova]: Inspecting ${event.path}... ${event.found_hint ?? "Captured page signals for Scott."}`,
      });
    }

    const validationResult = await validateIntelligence(scrapeResult.intelligence);
    const fused = fuseBrandIntelligence(
      scrapeResult.intelligence,
      validationResult.inferred_brand_kit,
      validationResult.inferred_visual_identity,
    );
    workflowStore.updateWorkflow(workflowId, {
      status: "running",
      website_intelligence: scrapeResult.intelligence,
      intelligence_validation: validationResult.validation,
      brand_kit: fused.brand_kit,
      visual_identity: fused.visual_identity,
      product_marketing_context: buildFallbackMarketingContext(scrapeResult.intelligence),
      consultant_discovery: {
        research_report_title: NOVAS_RESEARCH_REPORT_TITLE,
      },
    });
    workflowStore.addLog(workflowId, {
      role: "researcher",
      step_id: "validation_completed",
      message: "[Nova]: Discovery complete - Scott can execute the work order now.",
    });

    runWorkflowInBackground(workflowId);
  } catch (error) {
    workflowStore.updateWorkflow(workflowId, {
      status: "failed",
      error_message: (error as Error).message,
    });
    workflowStore.addLog(workflowId, {
      role: "researcher",
      step_id: "validation_completed",
      message: `[Nova]: Discovery failed - ${(error as Error).message}`,
    });
  }

  return NextResponse.json({ workflow_id: workflowId, status: "started" });
}

function normalizeAgentRoster(value: unknown): MarketingAgentRosterItem[] {
  if (!Array.isArray(value)) return [];

  const seen = new Set<string>();
  return value
    .map((item): MarketingAgentRosterItem | null => {
      if (!item || typeof item !== "object") return null;
      const record = item as Record<string, unknown>;
      const id = String(record.id ?? "")
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9_-]+/g, "-")
        .replace(/^-|-$/g, "");
      const name = String(record.name ?? "").trim();
      const role = record.role === "manager" ? "manager" : record.role === "employee" ? "employee" : null;
      if (!id || !name || !role || seen.has(id)) return null;
      seen.add(id);

      const tools = Array.isArray(record.tools)
        ? record.tools.map((tool) => String(tool).trim()).filter(Boolean).slice(0, 20)
        : undefined;
      const autonomy = Number(record.autonomy);

      return {
        id,
        name,
        role,
        ...(typeof record.model === "string" && record.model.trim() ? { model: record.model.trim() } : {}),
        ...(tools?.length ? { tools } : {}),
        ...(Number.isFinite(autonomy) ? { autonomy: Math.max(1, Math.min(5, Math.round(autonomy))) } : {}),
        ...(typeof record.enabled === "boolean" ? { enabled: record.enabled } : {}),
      };
    })
    .filter((item): item is MarketingAgentRosterItem => Boolean(item));
}

function runWorkflowInBackground(workflowId: string): void {
  void runMarketingWorkOrder(workflowId).catch((error) => {
    workflowStore.updateWorkflow(workflowId, {
      status: "failed",
      error_message: (error as Error).message,
    });
    workflowStore.addLog(workflowId, {
      role: "marketing_manager",
      step_id: "workflow_ready",
      message: `[Scott]: Workflow failed - ${(error as Error).message}`,
    });
  });
}

function buildFallbackMarketingContext(
  intelligence: WorkflowState["website_intelligence"],
): ProductMarketingContext {
  return {
    mission_statement:
      intelligence?.key_value_propositions[0] ??
      "Clarify value and deliver measurable outcomes for customers.",
    product_summary:
      intelligence?.product_offerings[0] ??
      "Core product summary inferred from website discovery.",
    target_personas: [intelligence?.audience_summary ?? "Primary buyer persona to be validated"],
    pains_solved:
      intelligence?.differentiators.slice(0, 3) ??
      ["Pain points to be validated with founder feedback"],
    messaging_pillars: intelligence?.key_value_propositions.slice(0, 3) ?? ["Clear value", "Fast time-to-value"],
    launch_goals: ["Acquire qualified demand", "Improve campaign conversion confidence"],
    primary_cta: "Book a discovery session",
    sop_focus: ["validation-first positioning"],
    preferred_channels: ["LinkedIn"],
  };
}
