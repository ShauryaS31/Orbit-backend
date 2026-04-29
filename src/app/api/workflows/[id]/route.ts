import { NextResponse } from "next/server";

import { workflowStore } from "@/lib/state/workflow-store";

interface RouteParams {
  params: {
    id: string;
  };
}

export async function GET(_request: Request, { params }: RouteParams) {
  const workflow = workflowStore.getWorkflow(params.id);

  if (!workflow) {
    return NextResponse.json(
      { error: "Workflow not found." },
      { status: 404 },
    );
  }

  return NextResponse.json(workflow);
}
