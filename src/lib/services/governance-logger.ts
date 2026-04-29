import { workflowStore } from "@/lib/state/workflow-store";
import { governancePersonaDisplayName, type GovernanceAuditEntry } from "@/lib/types/orbit";

export function createGovernanceEntry(
  partial: Omit<GovernanceAuditEntry, "timestamp"> & { timestamp?: string },
): GovernanceAuditEntry {
  const display_agent_name =
    partial.display_agent_name ?? governancePersonaDisplayName(partial.agent_id);
  return {
    ...partial,
    display_agent_name,
    timestamp: partial.timestamp ?? new Date().toISOString(),
  };
}

/** Appends one audit row using existing workflow persistence (immutable merge via updateWorkflow). */
export function appendGovernanceLog(workflowId: string, entry: GovernanceAuditEntry): void {
  const wf = workflowStore.getWorkflow(workflowId);
  if (!wf) return;
  workflowStore.updateWorkflow(workflowId, {
    governance_log: [...(wf.governance_log ?? []), entry],
  });
}
