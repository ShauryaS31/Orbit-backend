import type { ActivityLog, CampaignExecutionDraft, WorkflowState } from "@/lib/types/orbit";
import fs from "node:fs";
import path from "node:path";

type WorkflowStatePatch = Partial<Omit<WorkflowState, "id" | "created_at">>;

class WorkflowStore {
  private static instance: WorkflowStore | null = null;
  private readonly workflows = new Map<string, WorkflowState>();
  private readonly storagePath = path.join(process.cwd(), ".orbit-workflows.json");

  private constructor() {
    this.loadFromDisk();
  }

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
    this.persistToDisk();
    return workflow;
  }

  getWorkflow(id: string): WorkflowState | undefined {
    if (!this.workflows.has(id)) {
      this.loadFromDisk();
    }
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
    this.persistToDisk();
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
    this.persistToDisk();
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
    this.persistToDisk();

    return updatedDraft;
  }

  private loadFromDisk(): void {
    try {
      if (!fs.existsSync(this.storagePath)) return;
      const raw = fs.readFileSync(this.storagePath, "utf8");
      if (!raw.trim()) return;
      const parsed = JSON.parse(raw) as WorkflowState[];
      this.workflows.clear();
      for (const workflow of parsed) {
        this.workflows.set(workflow.id, workflow);
      }
    } catch (error) {
      console.warn("[workflow-store] Failed to load workflow cache", error);
    }
  }

  private persistToDisk(): void {
    try {
      fs.writeFileSync(
        this.storagePath,
        JSON.stringify([...this.workflows.values()], null, 2),
        "utf8",
      );
    } catch (error) {
      console.warn("[workflow-store] Failed to persist workflow cache", error);
    }
  }
}

export const workflowStore = WorkflowStore.getInstance();
