from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, Field


ContextSectionId = Literal["common", "marketing", "hr", "finance"]
EditableContextSectionId = Literal["common", "marketing"]
LockedContextSectionId = Literal["hr", "finance"]
DocumentStatus = Literal["indexed", "queued", "locked"]
DocumentSource = Literal["manual", "upload", "system"]
Department = Literal["marketing", "hr", "finance"]
MapDepartmentId = Literal["marketing", "hr", "finance", "sales", "operations"]
WorkOrderStatus = Literal["draft", "queued", "running", "review", "complete", "locked"]
WorkOrderAutonomy = Literal["draft_only", "approval_required", "autonomous"]
WorkOrderOutputType = Literal["campaign_package", "customer_email", "hiring_plan", "finance_report"]
SubtaskOwner = Literal["manager", "employee"]
ManagerPlanRiskLevel = Literal["low", "medium", "high"]
ManagerPlanStepKind = Literal["strategy", "delegation", "production", "review", "assembly"]
LaunchCampaignChannel = Literal["linkedin", "x", "email", "blog", "landing_page"]


class MarketingAgentRosterItem(BaseModel):
    id: str
    name: str
    role: SubtaskOwner
    model: str | None = None
    tools: list[str] = Field(default_factory=list)
    autonomy: int | None = None
    enabled: bool = True


class ContextDocument(BaseModel):
    id: str
    section: ContextSectionId
    name: str
    type: str
    status: DocumentStatus
    uploadedAt: str
    source: DocumentSource


class ContextDocumentCreate(BaseModel):
    name: str
    type: str = "File"
    source: DocumentSource = "upload"


class CompanyProfile(BaseModel):
    name: str = ""
    website: str = ""
    linkedin: str = ""
    genericInfo: str = ""


class ContextBlock(BaseModel):
    section: EditableContextSectionId
    companyProfile: CompanyProfile | None = None
    summary: str
    goals: list[str]
    guidelines: list[str]
    documents: list[ContextDocument]
    updatedAt: str
    version: int = Field(ge=1)


class DepartmentContextLog(BaseModel):
    section: LockedContextSectionId
    lines: list[str]
    expectedInputs: list[str]


class CompanyContextState(BaseModel):
    common: ContextBlock
    marketing: ContextBlock
    hr: DepartmentContextLog
    finance: DepartmentContextLog


class CompiledContextResponse(BaseModel):
    section: ContextSectionId
    agentId: str | None = None
    compiledText: str
    citations: list[str]


class WorkOrderSubtask(BaseModel):
    id: str
    title: str
    owner: SubtaskOwner
    agentId: str
    status: WorkOrderStatus
    summary: str


class WorkOrder(BaseModel):
    id: str
    title: str
    department: Department
    managerAgentId: str
    objective: str
    successMetric: str | None = None
    contextSections: list[ContextSectionId]
    outputType: WorkOrderOutputType
    autonomy: WorkOrderAutonomy
    approvalRequired: bool
    priority: Literal["normal", "high", "urgent"]
    status: WorkOrderStatus
    subtasks: list[WorkOrderSubtask]
    createdAt: str
    workflowId: str | None = None
    workflowStatus: str | None = None
    agentRoster: list[MarketingAgentRosterItem] = Field(default_factory=list)


class WorkOrderCreateRequest(BaseModel):
    title: str
    department: Department
    managerAgentId: str
    objective: str
    successMetric: str | None = None
    contextSections: list[ContextSectionId]
    outputType: WorkOrderOutputType
    autonomy: WorkOrderAutonomy = "approval_required"
    approvalRequired: bool = True
    priority: Literal["normal", "high", "urgent"] = "normal"
    subtasks: list[WorkOrderSubtask] = []
    workflowId: str | None = None
    workflowStatus: str | None = None
    agentRoster: list[MarketingAgentRosterItem] = Field(default_factory=list)


class WorkOrderStatusPatch(BaseModel):
    status: WorkOrderStatus


class WorkOrderWorkflowPatch(BaseModel):
    workflowId: str
    workflowStatus: str | None = None


class WorkOrderEvent(BaseModel):
    id: int
    workOrderId: str
    type: str
    message: str
    createdAt: str


class ManagerPlanRisk(BaseModel):
    id: str
    level: ManagerPlanRiskLevel
    description: str
    mitigation: str


class ManagerPlanStep(BaseModel):
    id: str
    kind: ManagerPlanStepKind
    title: str
    ownerAgentId: str
    ownerRole: SubtaskOwner
    dependsOn: list[str]
    contextRequired: list[ContextSectionId]
    instructions: str
    expectedOutput: str
    acceptanceCriteria: list[str]
    estimatedMinutes: int


class ManagerPlanPreviewRequest(BaseModel):
    workOrderId: str
    managerAgentId: str
    department: Department
    objective: str
    outputType: WorkOrderOutputType
    contextSections: list[ContextSectionId]
    autonomy: WorkOrderAutonomy
    agentRoster: list[MarketingAgentRosterItem] = Field(default_factory=list)


class ManagerPlanPreviewResponse(BaseModel):
    schemaVersion: Literal["manager_plan_preview.v1"] = "manager_plan_preview.v1"
    workOrderId: str
    managerAgentId: str
    department: Department
    objective: str
    outputType: WorkOrderOutputType
    contextSections: list[ContextSectionId]
    planSummary: str
    assumptions: list[str]
    risks: list[ManagerPlanRisk]
    steps: list[ManagerPlanStep]
    finalReviewChecklist: list[str]
    needsOperatorApproval: bool


class LaunchCampaignAsset(BaseModel):
    id: str
    day: int
    channel: LaunchCampaignChannel
    title: str
    objective: str
    draftCopy: str
    visualDirection: str | None = None
    cta: str
    ownerAgentId: str


class SevenDayLaunchCampaignResponse(BaseModel):
    schemaVersion: Literal["seven_day_launch_campaign.v1"] = "seven_day_launch_campaign.v1"
    workOrderId: str
    campaignName: str
    positioning: str
    targetAudience: str
    primaryGoal: str
    messagingPillars: list[str]
    channels: list[LaunchCampaignChannel]
    assets: list[LaunchCampaignAsset]
    managerReviewNotes: list[str]
    finalPackageChecklist: list[str]


class WorkOrderOutput(BaseModel):
    workOrderId: str
    outputType: WorkOrderOutputType | str
    payload: dict
    createdAt: str


class FinalOutputRequest(BaseModel):
    outputType: WorkOrderOutputType
    payload: dict | None = None


class WorkflowTaskSnapshot(BaseModel):
    id: str
    workflowId: str
    workOrderId: str
    type: str
    channel: str | None = None
    status: str
    operatorStatus: Literal["pending", "approved", "rejected"]
    title: str
    payload: dict[str, Any]
    updatedAt: str


class WorkflowRunSnapshot(BaseModel):
    workflowId: str
    workOrderId: str
    status: str
    payload: dict[str, Any]
    updatedAt: str


class WorkflowActivityLogSnapshot(BaseModel):
    id: str
    workflowId: str
    workOrderId: str
    role: str | None = None
    stepId: str | None = None
    message: str
    payload: dict[str, Any]
    createdAt: str


class WorkflowSnapshotSyncRequest(BaseModel):
    workflowId: str
    status: str
    workflow: dict[str, Any]
    tasks: list[dict[str, Any]] = []
    activityLogs: list[dict[str, Any]] = []
    finalOutput: dict[str, Any] | None = None
    outputType: WorkOrderOutputType | str | None = None


class WorkflowSnapshotSyncResponse(BaseModel):
    workOrder: WorkOrder
    workflow: WorkflowRunSnapshot
    tasks: list[WorkflowTaskSnapshot]
    activityLogsStored: int
    finalOutputStored: bool


class HealthResponse(BaseModel):
    ok: bool
    service: str


class GridCoord(BaseModel):
    col: int
    row: int


class OfficeMapDepartment(BaseModel):
    id: MapDepartmentId
    name: str
    status: Literal["active", "idle", "standby"]
    grid: GridCoord
    agentIds: list[str]


class OfficeMapAsset(BaseModel):
    id: str
    mapId: str
    departmentId: MapDepartmentId
    src: str
    label: str
    kind: Literal["floor", "wall", "furniture", "prop", "panel", "edge"]
    grid: GridCoord | None = None
    x: int
    y: int
    width: int
    z: int
    rotationX: int = 0
    rotationY: int = 0
    rotation: int = 0
    flipX: bool = False
    blocksMovement: bool = False
    requiresFloor: bool = False
    footprint: GridCoord = Field(default_factory=lambda: GridCoord(col=1, row=1))
    createdAt: str


class OfficeMapAssetCreate(BaseModel):
    departmentId: MapDepartmentId
    src: str
    label: str
    kind: Literal["floor", "wall", "furniture", "prop", "panel", "edge"]
    grid: GridCoord | None = None
    x: int
    y: int
    width: int
    z: int
    rotationX: int = 0
    rotationY: int = 0
    rotation: int = 0
    flipX: bool = False
    blocksMovement: bool = False
    requiresFloor: bool = False
    footprint: GridCoord = Field(default_factory=lambda: GridCoord(col=1, row=1))


class OfficeMap(BaseModel):
    id: str
    userId: str
    name: str
    version: int
    activeDepartmentIds: list[MapDepartmentId]
    departments: list[OfficeMapDepartment]
    assets: list[OfficeMapAsset]
    createdAt: str
    updatedAt: str


class OfficeMapCreate(BaseModel):
    userId: str = "demo-user"
    name: str
    activeDepartmentIds: list[MapDepartmentId] = ["marketing"]


class OfficeMapUpdate(BaseModel):
    name: str | None = None
    activeDepartmentIds: list[MapDepartmentId] | None = None
    departments: list[OfficeMapDepartment] | None = None
    assets: list[OfficeMapAsset] | None = None


class MapPreset(BaseModel):
    id: str
    name: str
    departmentId: MapDepartmentId | Literal["shared"]
    description: str
    assets: list[OfficeMapAssetCreate]
    sockets: list[str]


class ApplyMapPresetRequest(BaseModel):
    presetId: str
    departmentId: MapDepartmentId
    attachTo: str = "openDeskSocket"
    employeeIndex: int | None = None
