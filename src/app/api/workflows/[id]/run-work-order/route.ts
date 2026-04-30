import { NextResponse } from "next/server";

import { runMarketingWorkOrder } from "@/lib/services/workflow-execution";
import { workflowStore } from "@/lib/state/workflow-store";

interface RouteContext {
  params: Promise<{
    id: string;
  }>;
}

export async function POST(_request: Request, context: RouteContext) {
  const { id } = await context.params;
  const workflow = workflowStore.getWorkflow(id);

  if (!workflow) {
    return NextResponse.json({ error: "Workflow not found." }, { status: 404 });
  }

  if (workflow.status === "completed") {
    return NextResponse.json({ workflow_id: id, status: workflow.status });
  }

  try {
    await runMarketingWorkOrder(id);
    const updated = workflowStore.getWorkflow(id);
    return NextResponse.json({ workflow_id: id, status: updated?.status ?? "completed" });
  } catch (error) {
    workflowStore.updateWorkflow(id, {
      status: "failed",
      error_message: error instanceof Error ? error.message : "Workflow execution failed.",
    });
    workflowStore.addLog(id, {
      role: "marketing_manager",
      step_id: "workflow_ready",
      message: `[Scott]: Workflow failed - ${error instanceof Error ? error.message : "unknown error"}`,
    });
    return NextResponse.json(
      {
        workflow_id: id,
        status: "failed",
        error: error instanceof Error ? error.message : "Workflow execution failed.",
      },
      { status: 500 },
    );
  }
}
