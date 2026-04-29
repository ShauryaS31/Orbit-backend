from __future__ import annotations

from app.models import (
    FinalOutputRequest,
    ManagerPlanPreviewRequest,
    ManagerPlanPreviewResponse,
    SevenDayLaunchCampaignResponse,
    WorkOrder,
)
from app.seed_data import SYNC_PILOT_CAMPAIGN, SYNC_PILOT_MANAGER_PLAN


def build_manager_plan(request: ManagerPlanPreviewRequest, work_order: WorkOrder | None) -> ManagerPlanPreviewResponse:
    if request.workOrderId == "wo-launch-001":
        return SYNC_PILOT_MANAGER_PLAN

    manager_id = request.managerAgentId
    return ManagerPlanPreviewResponse(
        workOrderId=request.workOrderId,
        managerAgentId=manager_id,
        department=request.department,
        objective=request.objective,
        outputType=request.outputType,
        contextSections=request.contextSections,
        planSummary=f"{manager_id} will read context, create an execution plan, delegate production work, then review and assemble {request.outputType}.",
        assumptions=[
            "The requested context sections are available and compiled.",
            "The operator wants a reviewable output before external action.",
        ],
        risks=[
            {
                "id": "risk-context-gap",
                "level": "medium",
                "description": "The work order may require facts that are not present in company context.",
                "mitigation": "The manager records missing facts as assumptions and asks for operator review.",
            }
        ],
        steps=[
            {
                "id": "strategy",
                "kind": "strategy",
                "title": "Create manager plan",
                "ownerAgentId": manager_id,
                "ownerRole": "manager",
                "dependsOn": [],
                "contextRequired": request.contextSections,
                "instructions": "Read common context first, then department context. Create a concrete task plan.",
                "expectedOutput": "Manager strategy and task brief",
                "acceptanceCriteria": ["Uses only supplied context", "Names dependencies", "Defines review criteria"],
                "estimatedMinutes": 4,
            },
            {
                "id": "production",
                "kind": "production",
                "title": "Produce assigned work",
                "ownerAgentId": manager_id,
                "ownerRole": "manager",
                "dependsOn": ["strategy"],
                "contextRequired": request.contextSections,
                "instructions": "Create the first draft or delegate specialist tasks if employee agents are available.",
                "expectedOutput": request.outputType,
                "acceptanceCriteria": ["Matches objective", "Follows context constraints", "Ready for manager review"],
                "estimatedMinutes": 8,
            },
            {
                "id": "review",
                "kind": "review",
                "title": "Review and assemble output",
                "ownerAgentId": manager_id,
                "ownerRole": "manager",
                "dependsOn": ["production"],
                "contextRequired": request.contextSections,
                "instructions": "Check output against company context, resolve conflicts, and assemble final package.",
                "expectedOutput": "Reviewed final package",
                "acceptanceCriteria": ["No unsupported claims", "All sections complete", "Approval state is clear"],
                "estimatedMinutes": 4,
            },
        ],
        finalReviewChecklist=["Context constraints applied", "Assumptions listed", "Final output ready for operator review"],
        needsOperatorApproval=request.autonomy != "autonomous",
    )


def build_final_output(request: FinalOutputRequest, work_order: WorkOrder) -> SevenDayLaunchCampaignResponse | dict:
    if work_order.id == "wo-launch-001" or request.outputType == "campaign_package":
        return SYNC_PILOT_CAMPAIGN.model_copy(update={"workOrderId": work_order.id})

    return {
        "schemaVersion": "generic_work_order_output.v1",
        "workOrderId": work_order.id,
        "outputType": request.outputType,
        "title": work_order.title,
        "summary": f"Placeholder final output for {work_order.objective}",
        "managerAgentId": work_order.managerAgentId,
        "reviewNotes": ["Generated from work order context.", "Replace with department-specific agent output."],
    }
