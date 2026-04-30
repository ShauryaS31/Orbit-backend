import { NextResponse } from "next/server";

import { workflowStore } from "@/lib/state/workflow-store";
import type { WorkflowState } from "@/lib/types/orbit";

const STALE_WORKFLOW_TIMEOUT_MS = resolvePositiveInteger(process.env.ORBIT_WORKFLOW_STALE_TIMEOUT_MS, 180_000);

interface RouteParams {
  params: Promise<{
    id: string;
  }>;
}

export async function GET(_request: Request, context: RouteParams) {
  const params = await context.params;
  let workflow = workflowStore.getWorkflow(params.id);

  if (!workflow) {
    return NextResponse.json(
      { error: "Workflow not found." },
      { status: 404 },
    );
  }

  workflow = failStaleRunningWorkflow(workflow) ?? workflow;

  return NextResponse.json(workflow);
}

function resolvePositiveInteger(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.round(parsed);
}

function failStaleRunningWorkflow(workflow: WorkflowState): WorkflowState | undefined {
  if (workflow.status !== "running") return workflow;

  const updatedAt = Date.parse(workflow.updated_at);
  if (!Number.isFinite(updatedAt)) return workflow;

  const ageMs = Date.now() - updatedAt;
  if (ageMs < STALE_WORKFLOW_TIMEOUT_MS) return workflow;

  const message = `Workflow timed out after ${Math.round(ageMs / 1000)}s without backend progress.`;
  workflowStore.addLog(workflow.id, {
    role: "marketing_manager",
    step_id: "workflow_ready",
    message: `[Scott]: ${message}`,
    metadata: {
      ui_event: {
        agent_id: "scott",
        state: "error",
        location_hint: "managerHome",
        message: "Timeout",
      },
    },
  });
  return workflowStore.updateWorkflow(workflow.id, {
    status: "failed",
    error_message: message,
  });
}
