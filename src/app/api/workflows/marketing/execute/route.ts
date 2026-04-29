import { runCampaignGeneration } from "@/lib/services/workflow-execution";
import { workflowStore } from "@/lib/state/workflow-store";
import type { CampaignExecutionDraft } from "@/lib/types/orbit";

interface ExecuteBody {
  workflow_id?: string;
}

type StreamEvent =
  | { type: "log"; payload: { message: string; role: string; created_at: string } }
  | { type: "draft_start"; payload: { day: number; channel: string; draft_id: string } }
  | { type: "draft_chunk"; payload: { day: number; draft_id: string; chunk: string } }
  | { type: "asset_ready"; payload: { day: number; image_url: string } };

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as ExecuteBody;
  const workflowId = body.workflow_id;
  if (!workflowId) {
    return new Response(JSON.stringify({ error: "Field 'workflow_id' is required." }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const workflow = workflowStore.getWorkflow(workflowId);
  if (!workflow) {
    return new Response(JSON.stringify({ error: "Workflow not found." }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  }

  await runCampaignGeneration(workflowId);
  const hydrated = workflowStore.getWorkflow(workflowId);
  if (!hydrated) {
    return new Response(JSON.stringify({ error: "Workflow not found after execution." }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      for (const log of hydrated.activity_logs.slice(-30)) {
        emit(controller, encoder, {
          type: "log",
          payload: {
            message: log.message,
            role: log.role,
            created_at: log.created_at,
          },
        });
        await sleep(120);
      }

      const sortedDrafts = hydrated.campaign_execution_drafts
        .slice()
        .sort((a, b) => a.meta.day - b.meta.day);

      for (const draft of sortedDrafts) {
        emit(controller, encoder, {
          type: "draft_start",
          payload: {
            day: draft.meta.day,
            channel: draft.meta.channel,
            draft_id: draft.meta.id,
          },
        });
        const fullText = getDraftText(draft);
        for (const chunk of chunkText(fullText, 90)) {
          emit(controller, encoder, {
            type: "draft_chunk",
            payload: {
              day: draft.meta.day,
              draft_id: draft.meta.id,
              chunk,
            },
          });
          await sleep(70);
        }
      }

      const assets = hydrated.generated_campaign_assets.slice().sort((a, b) => a.day - b.day);
      for (const asset of assets) {
        emit(controller, encoder, {
          type: "asset_ready",
          payload: {
            day: asset.day,
            image_url: asset.image_url,
          },
        });
        await sleep(80);
      }

      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}

function emit(
  controller: ReadableStreamDefaultController<Uint8Array>,
  encoder: TextEncoder,
  event: StreamEvent,
): void {
  controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
}

function getDraftText(draft: CampaignExecutionDraft): string {
  if (draft.type === "carousel") {
    return draft.slides
      .map((slide) => {
        const headline = slide.design_artifact?.headline ?? slide.headline;
        const body = slide.design_artifact?.body ?? slide.supporting_copy;
        return `${headline}. ${body}`;
      })
      .join(" ");
  }
  if (draft.type === "linkedin_post") {
    return draft.body;
  }
  return `${draft.subject_line}. ${draft.body_markdown}`;
}

function chunkText(value: string, chunkSize: number): string[] {
  const chunks: string[] = [];
  for (let i = 0; i < value.length; i += chunkSize) {
    chunks.push(value.slice(i, i + chunkSize));
  }
  return chunks;
}

async function sleep(ms: number): Promise<void> {
  await new Promise<void>((resolve) => setTimeout(resolve, ms));
}
