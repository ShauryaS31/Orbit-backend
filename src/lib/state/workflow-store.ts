import type { ActivityLog, CampaignExecutionDraft, WorkflowState } from "@/lib/types/orbit";

type WorkflowStatePatch = Partial<Omit<WorkflowState, "id" | "created_at">>;

class WorkflowStore {
  private static instance: WorkflowStore | null = null;
  private readonly workflows = new Map<string, WorkflowState>();

  private constructor() {}

  static getInstance(): WorkflowStore {
    if (!WorkflowStore.instance) {
      WorkflowStore.instance = new WorkflowStore();
    }
    return WorkflowStore.instance;
  }

  createWorkflow(initial: Omit<WorkflowState, "created_at" | "updated_at">): WorkflowState {
    const now = new Date().toISOString();
    const workflow: WorkflowState = {
      ...initial,
      created_at: now,
      updated_at: now,
    };
    this.workflows.set(workflow.id, workflow);
    return workflow;
  }

  getWorkflow(id: string): WorkflowState | undefined {
    return this.workflows.get(id);
  }

  updateWorkflow(id: string, partialState: WorkflowStatePatch): WorkflowState | undefined {
    const existing = this.workflows.get(id);
    if (!existing) {
      return undefined;
    }

    const updated: WorkflowState = {
      ...existing,
      ...partialState,
      updated_at: new Date().toISOString(),
    };

    this.workflows.set(id, updated);
    return updated;
  }

  addLog(id: string, log: Omit<ActivityLog, "id" | "created_at" | "workflow_id">): ActivityLog | undefined {
    const existing = this.workflows.get(id);
    if (!existing) {
      return undefined;
    }

    const newLog: ActivityLog = {
      id: crypto.randomUUID(),
      workflow_id: id,
      created_at: new Date().toISOString(),
      ...log,
    };

    const updatedWorkflow: WorkflowState = {
      ...existing,
      updated_at: new Date().toISOString(),
      activity_logs: [...existing.activity_logs, newLog],
    };

    this.workflows.set(id, updatedWorkflow);
    return newLog;
  }

  getDraft(workflowId: string, draftId: string): CampaignExecutionDraft | undefined {
    const workflow = this.workflows.get(workflowId);
    return workflow?.campaign_execution_drafts.find((draft) => draft.meta.id === draftId);
  }

  updateDraft(
    workflowId: string,
    draftId: string,
    updater: (draft: CampaignExecutionDraft) => CampaignExecutionDraft,
  ): CampaignExecutionDraft | undefined {
    const existing = this.workflows.get(workflowId);
    if (!existing) {
      return undefined;
    }

    let updatedDraft: CampaignExecutionDraft | undefined;
    const drafts = existing.campaign_execution_drafts.map((draft) => {
      if (draft.meta.id !== draftId) {
        return draft;
      }
      updatedDraft = updater(draft);
      return updatedDraft;
    });

    if (!updatedDraft) {
      return undefined;
    }

    this.workflows.set(workflowId, {
      ...existing,
      campaign_execution_drafts: drafts,
      updated_at: new Date().toISOString(),
    });

    return updatedDraft;
  }
}

export const workflowStore = WorkflowStore.getInstance();
