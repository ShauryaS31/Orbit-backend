import { NextResponse } from "next/server";

import { runCampaignGeneration } from "@/lib/services/workflow-execution";
import { workflowStore } from "@/lib/state/workflow-store";

interface RouteParams {
  params: {
    id: string;
  };
}

interface ValidateBody {
  answers?: string[];
  approved?: boolean;
}

export async function POST(request: Request, { params }: RouteParams) {
  const workflow = workflowStore.getWorkflow(params.id);
  if (!workflow) {
    return NextResponse.json({ error: "Workflow not found." }, { status: 404 });
  }

  const body = (await request.json().catch(() => ({}))) as ValidateBody;
  const hasAnswers = Array.isArray(body.answers) && body.answers.length > 0;
  const isApproved = body.approved === true || hasAnswers;
  if (!isApproved) {
    return NextResponse.json(
      { error: "Provide { approved: true } or non-empty { answers: string[] }." },
      { status: 400 },
    );
  }

  workflowStore.updateWorkflow(params.id, {
    status: "running",
  });
  workflowStore.addLog(params.id, {
    role: "marketing_manager",
    step_id: "validation_completed",
    message: hasAnswers
      ? "[Scott]: Founder answered Nova's prompts - standing by to run execution with specialist skills."
      : "[Scott]: Founder approved Nova's research - kicking off execution now.",
    metadata: hasAnswers ? { answers: body.answers } : undefined,
  });

  await runCampaignGeneration(params.id);
  return NextResponse.json({ workflow_id: params.id, status: "running" });
}
