import { NextResponse } from "next/server";

import { sendGmailMessage } from "@/lib/services/gmail-integration";
import { workflowStore } from "@/lib/state/workflow-store";

interface RouteParams {
  params: Promise<{
    id: string;
    draft_id: string;
  }>;
}

interface SendGmailDraftBody {
  to?: string;
}

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export async function POST(request: Request, context: RouteParams) {
  const params = await context.params;
  const workflow = workflowStore.getWorkflow(params.id);
  if (!workflow) {
    return NextResponse.json({ error: "Workflow not found." }, { status: 404 });
  }

  const draft = workflowStore.getDraft(params.id, params.draft_id);
  if (!draft) {
    return NextResponse.json({ error: "Draft not found." }, { status: 404 });
  }

  if (draft.type !== "email") {
    return NextResponse.json({ error: "Only email drafts can be sent through Gmail." }, { status: 400 });
  }

  if (draft.meta.status !== "approved" || draft.meta.operator_status !== "approved") {
    return NextResponse.json({ error: "Email draft must be operator-approved before sending." }, { status: 400 });
  }

  if (draft.meta.gmail_message_id) {
    return NextResponse.json({ error: "Email draft has already been sent." }, { status: 409 });
  }

  const body = (await request.json().catch(() => ({}))) as SendGmailDraftBody;
  const to = body.to?.trim() || process.env.GOOGLE_TEST_RECIPIENT || process.env.GMAIL_TEST_TO;
  if (!to || !isValidEmail(to)) {
    return NextResponse.json({ error: "Provide a valid recipient email in field 'to'." }, { status: 400 });
  }

  try {
    const result = await sendGmailMessage({
      to,
      subject: draft.subject_line,
      text: draft.meta.email_detail?.full_email ?? draft.body_markdown,
    });
    const sentAt = new Date().toISOString();

    workflowStore.updateDraft(params.id, params.draft_id, (current) => ({
      ...current,
      meta: {
        ...current.meta,
        status: "sent",
        sent_to: to,
        sent_at: sentAt,
        gmail_message_id: result.id,
        gmail_thread_id: result.threadId,
      },
    }));

    workflowStore.addLog(params.id, {
      role: "orchestrator",
      step_id: "social_deployed",
      message: `[Scott]: Sent approved email draft ${params.draft_id} through Gmail.`,
      metadata: {
        draft_id: params.draft_id,
        provider: "gmail",
        to,
        gmail_message_id: result.id,
        gmail_thread_id: result.threadId,
      },
    });

    return NextResponse.json({
      workflow_id: params.id,
      draft_id: params.draft_id,
      status: "sent",
      provider: "gmail",
      to,
      messageId: result.id,
      threadId: result.threadId,
      sentAt,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to send approved Gmail draft." },
      { status: 500 },
    );
  }
}
