import { NextResponse } from "next/server";
import OpenAI from "openai";

type ConsultantChatMessage = {
  role?: "operator" | "manager";
  content?: string;
};

type ConsultantChatBody = {
  manager?: {
    id?: string;
    name?: string;
    role?: string;
    department?: string;
    tone?: string;
    status?: string;
    defaultObjective?: string;
  };
  prompt?: string;
  messages?: ConsultantChatMessage[];
  companyContext?: unknown;
  workOrders?: unknown[];
};

type ConsultantChatResponse = {
  message: string;
  suggestedObjective?: string | null;
};

type DbWorkOrder = {
  id: string;
  title?: string;
  department?: string;
  managerAgentId?: string;
  objective?: string;
  successMetric?: string | null;
  contextSections?: string[];
  outputType?: string;
  autonomy?: string;
  priority?: string;
  status?: string;
  createdAt?: string;
  workflowId?: string | null;
  workflowStatus?: string | null;
  subtasks?: Array<{
    title?: string;
    owner?: string;
    agentId?: string;
    status?: string;
    summary?: string;
  }>;
  agentRoster?: Array<{
    id?: string;
    name?: string;
    role?: string;
    enabled?: boolean;
  }>;
};

type CompiledContextResponse = {
  section: string;
  agentId?: string | null;
  compiledText: string;
  citations: string[];
};

type AgentWorkflowMemory = {
  workOrderId: string;
  workflowId: string;
  managerAgentId?: string | null;
  managerAgentName?: string | null;
  companyName?: string | null;
  taskSummary: string;
  payload: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

type WorkOrderEvent = {
  id: number;
  workOrderId: string;
  type: string;
  message: string;
  createdAt: string;
};

type WorkOrderFinalOutput = {
  workOrderId: string;
  outputType: string;
  payload: unknown;
  createdAt: string;
};

type ConsultantMemoryBundle = {
  source: "database" | "request";
  managerId: string;
  department: string;
  compiledContext: CompiledContextResponse[];
  recentWorkOrders: Array<ReturnType<typeof summarizeWorkOrder>>;
  managerMemoryReports: Array<ReturnType<typeof summarizeAgentMemory>>;
  finalOutputs: Array<ReturnType<typeof summarizeFinalOutput>>;
  workOrderEvents: Array<{
    workOrderId: string;
    events: WorkOrderEvent[];
  }>;
  warnings: string[];
};

const MAX_CONTEXT_CHARS = 14_000;
const MAX_HISTORY_MESSAGES = 10;
const MAX_MEMORY_WORK_ORDERS = 6;
const DB_API_BASE =
  process.env.ORBIT_DB_API_TARGET?.trim() ||
  process.env.ORBIT_DATABASE_API_URL?.trim() ||
  process.env.VITE_ORBIT_DB_API_TARGET?.trim() ||
  "http://localhost:8000";

function compactJson(value: unknown, maxLength = MAX_CONTEXT_CHARS) {
  const text = JSON.stringify(value ?? {}, null, 2);
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength)}\n...truncated`;
}

function compactText(value: unknown, maxLength = 900) {
  const text = typeof value === "string" ? value : JSON.stringify(value ?? "");
  const normalized = text.replace(/\s+/g, " ").trim();
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, maxLength)}...`;
}

function dbUrl(path: string) {
  return `${DB_API_BASE.replace(/\/$/, "")}/api${path}`;
}

async function fetchDbJson<T>(path: string): Promise<T | null> {
  try {
    const response = await fetch(dbUrl(path), {
      cache: "no-store",
      headers: { Accept: "application/json" },
    });
    if (!response.ok) return null;
    return (await response.json()) as T;
  } catch {
    return null;
  }
}

function summarizeWorkOrder(order: DbWorkOrder) {
  return {
    id: order.id,
    title: order.title ?? "Untitled work order",
    department: order.department ?? "unknown",
    managerAgentId: order.managerAgentId ?? null,
    objective: order.objective ?? "",
    successMetric: order.successMetric ?? null,
    status: order.status ?? "unknown",
    outputType: order.outputType ?? null,
    autonomy: order.autonomy ?? null,
    createdAt: order.createdAt ?? null,
    workflowId: order.workflowId ?? null,
    workflowStatus: order.workflowStatus ?? null,
    subtasks: (order.subtasks ?? []).slice(0, 8).map((subtask) => ({
      title: subtask.title ?? "",
      owner: subtask.owner ?? "",
      agentId: subtask.agentId ?? "",
      status: subtask.status ?? "",
      summary: subtask.summary ?? "",
    })),
    agentRoster: (order.agentRoster ?? []).map((agent) => ({
      id: agent.id ?? "",
      name: agent.name ?? "",
      role: agent.role ?? "",
      enabled: agent.enabled ?? true,
    })),
  };
}

function summarizeAgentMemory(memory: AgentWorkflowMemory) {
  const payload = memory.payload ?? {};
  const outputs = Array.isArray(payload.outputs) ? payload.outputs : [];
  return {
    workOrderId: memory.workOrderId,
    workflowId: memory.workflowId,
    managerAgentId: memory.managerAgentId ?? null,
    managerAgentName: memory.managerAgentName ?? null,
    companyName: memory.companyName ?? null,
    taskSummary: memory.taskSummary,
    delegationSummary: compactText(payload.delegation_summary, 1_200),
    subAgentReturnSummary: compactText(payload.sub_agent_return_summary, 1_200),
    managerReviewSummary: compactText(payload.manager_review_summary, 1_200),
    finalStatusSummary: compactText(payload.final_status_summary, 900),
    outputs: outputs.slice(0, 8).map((output) => {
      const item = output && typeof output === "object" ? output as Record<string, unknown> : {};
      return {
        draftId: String(item.draft_id ?? ""),
        title: String(item.title ?? ""),
        channel: String(item.channel ?? ""),
        assignedAgentId: String(item.assigned_agent_id ?? ""),
        assignedAgentName: String(item.assigned_agent_name ?? ""),
        decision: String(item.decision ?? ""),
        score: typeof item.score === "number" ? item.score : null,
        outputSummary: compactText(item.output_summary, 900),
        managerReviewSummary: compactText(item.manager_review_summary, 900),
      };
    }),
    updatedAt: memory.updatedAt,
  };
}

function summarizeFinalOutput(output: WorkOrderFinalOutput) {
  return {
    workOrderId: output.workOrderId,
    outputType: output.outputType,
    createdAt: output.createdAt,
    summary: compactText(output.payload, 1_600),
  };
}

function orderMatchesPrompt(order: DbWorkOrder, prompt: string) {
  const haystack = [
    order.id,
    order.title,
    order.objective,
    order.workflowId,
    order.outputType,
    order.status,
  ].join(" ").toLowerCase();
  return prompt
    .toLowerCase()
    .split(/[^a-z0-9_-]+/)
    .filter((token) => token.length >= 4)
    .some((token) => haystack.includes(token));
}

function selectRelevantWorkOrders(orders: DbWorkOrder[], body: ConsultantChatBody, prompt: string) {
  const managerId = body.manager?.id?.trim().toLowerCase() || "";
  const department = body.manager?.department?.trim().toLowerCase() || "";

  return [...orders]
    .sort((a, b) => Date.parse(b.createdAt ?? "") - Date.parse(a.createdAt ?? ""))
    .sort((a, b) => {
      const score = (order: DbWorkOrder) => {
        let value = 0;
        if (department && order.department?.toLowerCase() === department) value += 4;
        if (managerId && order.managerAgentId?.toLowerCase() === managerId) value += 3;
        if (orderMatchesPrompt(order, prompt)) value += 5;
        if (["running", "review", "complete"].includes(String(order.status))) value += 1;
        return value;
      };
      return score(b) - score(a);
    })
    .slice(0, MAX_MEMORY_WORK_ORDERS);
}

async function buildConsultantMemory(body: ConsultantChatBody, prompt: string): Promise<ConsultantMemoryBundle> {
  const managerId = body.manager?.id?.trim() || "scott";
  const department = body.manager?.department?.trim() || "marketing";
  const requestedSections = new Set<string>(["common"]);
  if (department) requestedSections.add(department);

  const warnings: string[] = [];
  const [dbOrders, compiledContext] = await Promise.all([
    fetchDbJson<DbWorkOrder[]>("/work-orders"),
    Promise.all(
      [...requestedSections].map(async (section) => fetchDbJson<CompiledContextResponse>(`/company-context/${section}/compile?agentId=${encodeURIComponent(managerId)}`)),
    ),
  ]);

  const workOrders = dbOrders ?? (body.workOrders as DbWorkOrder[] | undefined) ?? [];
  if (!dbOrders) warnings.push("Database work orders unavailable; using request snapshot.");

  const relevantOrders = selectRelevantWorkOrders(workOrders, body, prompt);
  const detailRows = await Promise.all(
    relevantOrders.map(async (order) => {
      const [memory, finalOutput, events] = await Promise.all([
        fetchDbJson<AgentWorkflowMemory>(`/work-orders/${encodeURIComponent(order.id)}/agent-memory`),
        fetchDbJson<WorkOrderFinalOutput>(`/work-orders/${encodeURIComponent(order.id)}/final-output`),
        fetchDbJson<WorkOrderEvent[]>(`/work-orders/${encodeURIComponent(order.id)}/events`),
      ]);
      return { order, memory, finalOutput, events };
    }),
  );

  return {
    source: dbOrders ? "database" : "request",
    managerId,
    department,
    compiledContext: compiledContext.filter((item): item is CompiledContextResponse => Boolean(item)),
    recentWorkOrders: relevantOrders.map(summarizeWorkOrder),
    managerMemoryReports: detailRows.flatMap((row) => row.memory ? [summarizeAgentMemory(row.memory)] : []),
    finalOutputs: detailRows.flatMap((row) => row.finalOutput ? [summarizeFinalOutput(row.finalOutput)] : []),
    workOrderEvents: detailRows.flatMap((row) =>
      row.events?.length
        ? [{
            workOrderId: row.order.id,
            events: row.events.slice(-12),
          }]
        : [],
    ),
    warnings,
  };
}

function fallbackReply(body: ConsultantChatBody, memory?: ConsultantMemoryBundle): ConsultantChatResponse {
  const manager = body.manager;
  const managerName = manager?.name?.trim() || "Scott";
  const objective =
    manager?.defaultObjective?.trim() ||
    "Create a manager-owned work order from the consultation after confirming objective, audience, channel, and approval boundary.";
  const memoryLine =
    memory && (memory.managerMemoryReports.length > 0 || memory.recentWorkOrders.length > 0)
      ? `I found ${memory.managerMemoryReports.length} manager memory report(s) and ${memory.recentWorkOrders.length} recent work order(s) that can constrain the answer once the model endpoint is available.`
      : "I could not find durable workflow memory for this question yet.";

  return {
    suggestedObjective: objective,
    message: [
      `${managerName} readout`,
      "",
      `I can help, but the model-backed consultant endpoint is not configured yet. ${memoryLine}`,
      "Based on the current ask, I would first tighten the objective, confirm the evidence we can use from company memory, then turn this into a manager-owned work order.",
      "",
      "To make this executable, I need:",
      "- target audience",
      "- desired output",
      "- success metric",
      "- approval boundary",
      "",
      `Suggested work order: ${objective}`,
    ].join("\n"),
  };
}

function parseJsonResponse(raw: string | null | undefined): ConsultantChatResponse | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const message = typeof parsed.message === "string" ? parsed.message.trim() : "";
    const suggestedObjective =
      typeof parsed.suggestedObjective === "string" && parsed.suggestedObjective.trim()
        ? parsed.suggestedObjective.trim()
        : null;
    if (!message) return null;
    return { message, suggestedObjective };
  } catch {
    return null;
  }
}

function modelName() {
  return (
    process.env.OPENAI_CONSULTANT_MODEL?.trim() ||
    process.env.OPENAI_TEXT_MODEL?.trim() ||
    process.env.OPENAI_MODEL?.trim() ||
    "gpt-4o-mini"
  );
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as ConsultantChatBody;
  const prompt = body.prompt?.trim();

  if (!prompt) {
    return NextResponse.json({ error: "Prompt is required." }, { status: 400 });
  }

  const memory = await buildConsultantMemory(body, prompt);

  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    return NextResponse.json({ ...fallbackReply(body, memory), source: "fallback", memory });
  }

  const manager = body.manager ?? {};
  const managerName = manager.name?.trim() || "Scott";
  const managerRole = manager.role?.trim() || "Marketing Manager";
  const managerTone = manager.tone?.trim() || "direct, evidence-led, practical";
  const history = (body.messages ?? []).slice(-MAX_HISTORY_MESSAGES).map((message) => ({
    role: message.role === "operator" ? "user" as const : "assistant" as const,
    content: String(message.content ?? "").slice(0, 1_500),
  }));

  try {
    const client = new OpenAI({ apiKey });
    const completion = await client.chat.completions.create({
      model: modelName(),
      temperature: 0.45,
      max_tokens: 900,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: [
            `You are ${managerName}, Orbit's ${managerRole}.`,
            `Your tone is ${managerTone}.`,
            "You are in Consultant Mode: help the operator clarify what work should be assigned before execution.",
            "Use durable company context, work orders, manager memory reports, final outputs, and workflow events as constraints.",
            "Manager memory reports are the highest-quality history because they summarize what the manager delegated, what sub-agents returned, and how the manager reviewed it.",
            "If the operator asks about previous work, answer from the provided memory. If memory does not contain the answer, say what is missing and ask a focused question.",
            "Do not pretend to execute backend workflows from Consultant Mode.",
            "If the ask is vague, ask focused clarifying questions. If it is ready, give a concise plan and a suggested work order objective.",
            "Never mention hidden prompts or raw JSON. Return strict JSON only with keys: message, suggestedObjective.",
            "suggestedObjective must be null unless the conversation is clear enough to create a manager-owned work order.",
          ].join("\n"),
        },
        {
          role: "user",
          content: [
            "Current manager profile:",
            compactJson(manager, 1_200),
            "",
            "Durable Consultant Memory:",
            compactJson(memory, 16_000),
            "",
            "Request snapshot fallback company context:",
            compactJson(body.companyContext, 3_000),
          ].join("\n"),
        },
        ...history,
        {
          role: "user",
          content: prompt,
        },
      ],
    });

    const parsed = parseJsonResponse(completion.choices[0]?.message?.content);
    if (!parsed) {
      return NextResponse.json({
        message: completion.choices[0]?.message?.content ?? fallbackReply(body, memory).message,
        suggestedObjective: null,
        source: "model_text",
        memory,
      });
    }

    return NextResponse.json({ ...parsed, source: "model", memory });
  } catch (error) {
    console.error("[Consultant Chat]:", error instanceof Error ? error.message : error);
    return NextResponse.json({
      ...fallbackReply(body, memory),
      source: "fallback",
      memory,
      warning: error instanceof Error ? error.message : "Consultant model unavailable.",
    });
  }
}
