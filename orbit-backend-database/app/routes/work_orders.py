from __future__ import annotations

from fastapi import APIRouter, HTTPException

from app import database
from app.models import (
    FinalOutputRequest,
    ManagerPlanPreviewRequest,
    ManagerPlanPreviewResponse,
    WorkOrder,
    WorkOrderCreateRequest,
    WorkOrderEvent,
    WorkOrderOutput,
    WorkOrderStatusPatch,
    WorkOrderWorkflowPatch,
)
from app.services.manager_plan import build_final_output, build_manager_plan

router = APIRouter(prefix="/api/work-orders", tags=["work-orders"])


@router.get("", response_model=list[WorkOrder])
def list_work_orders() -> list[WorkOrder]:
    return database.list_work_orders()


@router.post("", response_model=WorkOrder)
def create_work_order(request: WorkOrderCreateRequest) -> WorkOrder:
    return database.create_work_order(request)


@router.get("/{work_order_id}", response_model=WorkOrder)
def get_work_order(work_order_id: str) -> WorkOrder:
    work_order = database.get_work_order(work_order_id)
    if not work_order:
        raise HTTPException(status_code=404, detail="Work order not found")
    return work_order


@router.patch("/{work_order_id}/status", response_model=WorkOrder)
def update_work_order_status(work_order_id: str, patch: WorkOrderStatusPatch) -> WorkOrder:
    work_order = database.update_work_order_status(work_order_id, patch.status)
    if not work_order:
        raise HTTPException(status_code=404, detail="Work order not found")
    return work_order


@router.patch("/{work_order_id}/workflow", response_model=WorkOrder)
def link_work_order_workflow(work_order_id: str, patch: WorkOrderWorkflowPatch) -> WorkOrder:
    work_order = database.update_work_order_workflow(work_order_id, patch.workflowId, patch.workflowStatus)
    if not work_order:
        raise HTTPException(status_code=404, detail="Work order not found")
    return work_order


@router.post("/{work_order_id}/manager-plan", response_model=ManagerPlanPreviewResponse)
def create_manager_plan_preview(work_order_id: str, request: ManagerPlanPreviewRequest) -> ManagerPlanPreviewResponse:
    work_order = database.get_work_order(work_order_id)
    if not work_order:
        raise HTTPException(status_code=404, detail="Work order not found")

    request = request.model_copy(update={"workOrderId": work_order_id})
    plan = build_manager_plan(request, work_order)
    database.save_manager_plan(work_order_id, plan.model_dump())
    return plan


@router.post("/{work_order_id}/final-output")
def create_final_output(work_order_id: str, request: FinalOutputRequest):
    work_order = database.get_work_order(work_order_id)
    if not work_order:
        raise HTTPException(status_code=404, detail="Work order not found")

    output = request.payload if request.payload is not None else build_final_output(request, work_order)
    payload = output.model_dump() if hasattr(output, "model_dump") else output
    database.save_work_order_output(work_order_id, request.outputType, payload)
    return output


@router.get("/{work_order_id}/final-output", response_model=WorkOrderOutput)
def get_final_output(work_order_id: str) -> WorkOrderOutput:
    if not database.get_work_order(work_order_id):
        raise HTTPException(status_code=404, detail="Work order not found")

    output = database.get_work_order_output(work_order_id)
    if not output:
        raise HTTPException(status_code=404, detail="Final output not found")
    return output


@router.get("/{work_order_id}/events", response_model=list[WorkOrderEvent])
def list_work_order_events(work_order_id: str) -> list[WorkOrderEvent]:
    if not database.get_work_order(work_order_id):
        raise HTTPException(status_code=404, detail="Work order not found")
    return database.list_work_order_events(work_order_id)
