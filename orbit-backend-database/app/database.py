from __future__ import annotations

import json
import sqlite3
from datetime import datetime, timezone
from pathlib import Path
from uuid import uuid4

from app.models import (
    CompanyContextState,
    CompiledContextResponse,
    ContextBlock,
    ContextDocument,
    ContextDocumentCreate,
    ContextSectionId,
    DepartmentContextLog,
    EditableContextSectionId,
    AgentWorkflowMemory,
    MapPreset,
    MarketingAgentRosterItem,
    OfficeMap,
    OfficeMapAsset,
    OfficeMapAssetCreate,
    OfficeMapCreate,
    OfficeMapDepartment,
    OfficeMapUpdate,
    WorkOrder,
    WorkOrderCreateRequest,
    WorkOrderEvent,
    WorkOrderOutput,
    WorkOrderStatus,
    WorkflowActivityLogSnapshot,
    WorkflowRunSnapshot,
    WorkflowSnapshotSyncRequest,
    WorkflowSnapshotSyncResponse,
    WorkflowTaskSnapshot,
)
from app.seed_data import INITIAL_COMPANY_CONTEXT, INITIAL_MAP_PRESETS, INITIAL_OFFICE_MAPS, INITIAL_WORK_ORDERS

BASE_DIR = Path(__file__).resolve().parents[1]
DATA_DIR = BASE_DIR / "data"
DB_PATH = DATA_DIR / "orbit.sqlite"


SCHEMA = """
CREATE TABLE IF NOT EXISTS context_sections (
  section TEXT PRIMARY KEY,
  payload TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS work_orders (
  id TEXT PRIMARY KEY,
  payload TEXT NOT NULL,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS manager_plan_previews (
  work_order_id TEXT PRIMARY KEY,
  payload TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS work_order_outputs (
  work_order_id TEXT PRIMARY KEY,
  output_type TEXT NOT NULL,
  payload TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS work_order_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  work_order_id TEXT NOT NULL,
  type TEXT NOT NULL,
  message TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS workflow_runs (
  workflow_id TEXT PRIMARY KEY,
  work_order_id TEXT NOT NULL,
  status TEXT NOT NULL,
  payload TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS workflow_tasks (
  id TEXT PRIMARY KEY,
  workflow_id TEXT NOT NULL,
  work_order_id TEXT NOT NULL,
  type TEXT NOT NULL,
  channel TEXT,
  status TEXT NOT NULL,
  operator_status TEXT NOT NULL,
  title TEXT NOT NULL,
  payload TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS workflow_activity_logs (
  id TEXT PRIMARY KEY,
  workflow_id TEXT NOT NULL,
  work_order_id TEXT NOT NULL,
  role TEXT,
  step_id TEXT,
  message TEXT NOT NULL,
  payload TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS agent_workflow_memory (
  workflow_id TEXT PRIMARY KEY,
  work_order_id TEXT NOT NULL,
  manager_agent_id TEXT,
  manager_agent_name TEXT,
  company_name TEXT,
  task_summary TEXT NOT NULL,
  payload TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS office_maps (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  version INTEGER NOT NULL,
  active_department_ids TEXT NOT NULL,
  payload TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS office_map_departments (
  id TEXT NOT NULL,
  map_id TEXT NOT NULL,
  name TEXT NOT NULL,
  status TEXT NOT NULL,
  grid_col INTEGER NOT NULL,
  grid_row INTEGER NOT NULL,
  agent_ids TEXT NOT NULL,
  payload TEXT NOT NULL,
  PRIMARY KEY (id, map_id)
);

CREATE TABLE IF NOT EXISTS office_map_assets (
  id TEXT PRIMARY KEY,
  map_id TEXT NOT NULL,
  department_id TEXT NOT NULL,
  src TEXT NOT NULL,
  label TEXT NOT NULL,
  kind TEXT NOT NULL,
  grid_col INTEGER,
  grid_row INTEGER,
  x INTEGER NOT NULL,
  y INTEGER NOT NULL,
  width INTEGER NOT NULL,
  z INTEGER NOT NULL,
  payload TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS map_presets (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  department_id TEXT NOT NULL,
  payload TEXT NOT NULL
);
"""


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def dumps_model(model) -> str:
    return model.model_dump_json()


def dumps_dict(payload: dict) -> str:
    return json.dumps(payload, separators=(",", ":"))


def ensure_workflow_tables(db: sqlite3.Connection) -> None:
    db.executescript(
        """
        CREATE TABLE IF NOT EXISTS workflow_runs (
          workflow_id TEXT PRIMARY KEY,
          work_order_id TEXT NOT NULL,
          status TEXT NOT NULL,
          payload TEXT NOT NULL,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS workflow_tasks (
          id TEXT PRIMARY KEY,
          workflow_id TEXT NOT NULL,
          work_order_id TEXT NOT NULL,
          type TEXT NOT NULL,
          channel TEXT,
          status TEXT NOT NULL,
          operator_status TEXT NOT NULL,
          title TEXT NOT NULL,
          payload TEXT NOT NULL,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS workflow_activity_logs (
          id TEXT PRIMARY KEY,
          workflow_id TEXT NOT NULL,
          work_order_id TEXT NOT NULL,
          role TEXT,
          step_id TEXT,
          message TEXT NOT NULL,
          payload TEXT NOT NULL,
          created_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS agent_workflow_memory (
          workflow_id TEXT PRIMARY KEY,
          work_order_id TEXT NOT NULL,
          manager_agent_id TEXT,
          manager_agent_name TEXT,
          company_name TEXT,
          task_summary TEXT NOT NULL,
          payload TEXT NOT NULL,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );
        """
    )


def connect() -> sqlite3.Connection:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    connection = sqlite3.connect(DB_PATH)
    connection.row_factory = sqlite3.Row
    return connection


def init_db() -> None:
    with connect() as db:
      db.executescript(SCHEMA)
      ensure_workflow_tables(db)
      seed_if_empty(db)
      seed_maps_if_empty(db)
      backfill_work_order_agent_rosters(db)


def seed_if_empty(db: sqlite3.Connection) -> None:
    existing = db.execute("SELECT COUNT(*) AS count FROM context_sections").fetchone()["count"]
    if existing:
        return

    timestamp = now_iso()
    context = INITIAL_COMPANY_CONTEXT
    for section in ("common", "marketing", "hr", "finance"):
        block = getattr(context, section)
        db.execute(
            "INSERT INTO context_sections (section, payload, updated_at) VALUES (?, ?, ?)",
            (section, dumps_model(block), timestamp),
        )

    for work_order in INITIAL_WORK_ORDERS:
        db.execute(
            "INSERT INTO work_orders (id, payload, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
            (work_order.id, dumps_model(work_order), work_order.status, work_order.createdAt, timestamp),
        )
        add_event(db, work_order.id, "seeded", "Seed work order loaded.")


def backfill_work_order_agent_rosters(db: sqlite3.Connection) -> None:
    rows = db.execute("SELECT id, payload FROM work_orders").fetchall()
    seed_rosters = {work_order.id: work_order.agentRoster for work_order in INITIAL_WORK_ORDERS}

    for row in rows:
        payload = json.loads(row["payload"])
        if payload.get("agentRoster"):
            continue

        workflow_roster: list[MarketingAgentRosterItem] = []
        workflow_id = payload.get("workflowId")
        if workflow_id:
            workflow_row = db.execute("SELECT payload FROM workflow_runs WHERE workflow_id = ?", (workflow_id,)).fetchone()
            if workflow_row:
                workflow_roster = _coerce_agent_roster(json.loads(workflow_row["payload"]).get("agent_roster"))

        roster = workflow_roster or seed_rosters.get(row["id"], [])
        if not roster:
            manager_id = str(payload.get("managerAgentId") or "scott").strip().lower()
            roster = [MarketingAgentRosterItem(id=manager_id, name=manager_id.title(), role="manager")]

        work_order = WorkOrder(**payload).model_copy(update={"agentRoster": roster})
        timestamp = now_iso()
        db.execute(
            "UPDATE work_orders SET payload = ?, updated_at = ? WHERE id = ?",
            (dumps_model(work_order), timestamp, row["id"]),
        )


def seed_maps_if_empty(db: sqlite3.Connection) -> None:
    existing = db.execute("SELECT COUNT(*) AS count FROM office_maps").fetchone()["count"]
    if existing:
        return

    for office_map in INITIAL_OFFICE_MAPS:
        insert_office_map_rows(db, office_map)

    for preset in INITIAL_MAP_PRESETS:
        db.execute(
            "INSERT INTO map_presets (id, name, department_id, payload) VALUES (?, ?, ?, ?)",
            (preset.id, preset.name, preset.departmentId, dumps_model(preset)),
        )


def insert_office_map_rows(db: sqlite3.Connection, office_map: OfficeMap) -> None:
    db.execute(
        """
        INSERT OR REPLACE INTO office_maps
          (id, user_id, name, version, active_department_ids, payload, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            office_map.id,
            office_map.userId,
            office_map.name,
            office_map.version,
            dumps_dict({"activeDepartmentIds": office_map.activeDepartmentIds}),
            dumps_model(office_map),
            office_map.createdAt,
            office_map.updatedAt,
        ),
    )
    db.execute("DELETE FROM office_map_departments WHERE map_id = ?", (office_map.id,))
    db.execute("DELETE FROM office_map_assets WHERE map_id = ?", (office_map.id,))

    for department in office_map.departments:
        db.execute(
            """
            INSERT INTO office_map_departments
              (id, map_id, name, status, grid_col, grid_row, agent_ids, payload)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                department.id,
                office_map.id,
                department.name,
                department.status,
                department.grid.col,
                department.grid.row,
                dumps_dict({"agentIds": department.agentIds}),
                dumps_model(department),
            ),
        )

    for asset in office_map.assets:
        insert_office_map_asset_row(db, asset)


def insert_office_map_asset_row(db: sqlite3.Connection, asset: OfficeMapAsset) -> None:
    db.execute(
        """
        INSERT OR REPLACE INTO office_map_assets
          (id, map_id, department_id, src, label, kind, grid_col, grid_row, x, y, width, z, payload, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            asset.id,
            asset.mapId,
            asset.departmentId,
            asset.src,
            asset.label,
            asset.kind,
            asset.grid.col if asset.grid else None,
            asset.grid.row if asset.grid else None,
            asset.x,
            asset.y,
            asset.width,
            asset.z,
            dumps_model(asset),
            asset.createdAt,
        ),
    )


def get_company_context() -> CompanyContextState:
    with connect() as db:
        rows = db.execute("SELECT section, payload FROM context_sections").fetchall()
    payloads = {row["section"]: json.loads(row["payload"]) for row in rows}
    return CompanyContextState(
        common=ContextBlock(**payloads["common"]),
        marketing=ContextBlock(**payloads["marketing"]),
        hr=DepartmentContextLog(**payloads["hr"]),
        finance=DepartmentContextLog(**payloads["finance"]),
    )


def get_context_section(section: ContextSectionId):
    with connect() as db:
        row = db.execute("SELECT payload FROM context_sections WHERE section = ?", (section,)).fetchone()
    if not row:
        return None
    payload = json.loads(row["payload"])
    if section in ("common", "marketing"):
        return ContextBlock(**payload)
    return DepartmentContextLog(**payload)


def update_context_section(section: EditableContextSectionId, block: ContextBlock) -> ContextBlock:
    payload = block.model_copy(update={"section": section, "updatedAt": now_iso(), "version": block.version + 1})
    with connect() as db:
        db.execute(
            "UPDATE context_sections SET payload = ?, updated_at = ? WHERE section = ?",
            (dumps_model(payload), payload.updatedAt, section),
        )
    return payload


def add_context_document(section: EditableContextSectionId, document: ContextDocumentCreate) -> ContextBlock:
    block = get_context_section(section)
    if not isinstance(block, ContextBlock):
        raise ValueError("Section is not editable")

    created = ContextDocument(
        id=f"{section}-{uuid4().hex[:10]}",
        section=section,
        name=document.name,
        type=document.type,
        status="queued",
        uploadedAt=now_iso(),
        source=document.source,
    )
    next_block = block.model_copy(
        update={
            "documents": [created, *block.documents],
            "updatedAt": now_iso(),
            "version": block.version + 1,
        }
    )
    with connect() as db:
        db.execute(
            "UPDATE context_sections SET payload = ?, updated_at = ? WHERE section = ?",
            (dumps_model(next_block), next_block.updatedAt, section),
        )
    return next_block


def compile_context(section: ContextSectionId, agent_id: str | None = None) -> CompiledContextResponse:
    block = get_context_section(section)
    if block is None:
        raise KeyError(section)

    if isinstance(block, ContextBlock):
        profile_lines = []
        if block.companyProfile is not None:
            profile_lines = [
                "Company Profile:",
                f"- Name: {block.companyProfile.name}",
                f"- Website: {block.companyProfile.website}",
                f"- LinkedIn: {block.companyProfile.linkedin}",
                f"- Generic info: {block.companyProfile.genericInfo}",
            ]
        compiled = "\n".join(
            [
                f"Section: {block.section}",
                *profile_lines,
                f"Summary: {block.summary}",
                "Goals:",
                *[f"- {goal}" for goal in block.goals],
                "Guidelines:",
                *[f"- {guideline}" for guideline in block.guidelines],
            ]
        )
        citations = [document.name for document in block.documents if document.status == "indexed"]
    else:
        compiled = "\n".join([f"Section: {block.section}", *block.lines])
        citations = block.expectedInputs

    return CompiledContextResponse(section=section, agentId=agent_id, compiledText=compiled, citations=citations)


def list_work_orders() -> list[WorkOrder]:
    with connect() as db:
        rows = db.execute("SELECT payload FROM work_orders ORDER BY created_at DESC").fetchall()
    return [WorkOrder(**json.loads(row["payload"])) for row in rows]


def get_work_order(work_order_id: str) -> WorkOrder | None:
    with connect() as db:
        row = db.execute("SELECT payload FROM work_orders WHERE id = ?", (work_order_id,)).fetchone()
    return WorkOrder(**json.loads(row["payload"])) if row else None


def create_work_order(request: WorkOrderCreateRequest) -> WorkOrder:
    created_at = now_iso()
    work_order = WorkOrder(
        id=f"wo-{uuid4().hex[:10]}",
        title=request.title,
        department=request.department,
        managerAgentId=request.managerAgentId,
        objective=request.objective,
        successMetric=request.successMetric,
        contextSections=request.contextSections,
        outputType=request.outputType,
        autonomy=request.autonomy,
        approvalRequired=request.approvalRequired,
        priority=request.priority,
        status="queued",
        subtasks=request.subtasks,
        createdAt=created_at,
        workflowId=request.workflowId,
        workflowStatus=request.workflowStatus,
        agentRoster=request.agentRoster,
    )
    with connect() as db:
        db.execute(
            "INSERT INTO work_orders (id, payload, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
            (work_order.id, dumps_model(work_order), work_order.status, created_at, created_at),
        )
        add_event(db, work_order.id, "created", "Work order created by operator.")
    return work_order


def update_work_order_status(work_order_id: str, status: WorkOrderStatus) -> WorkOrder | None:
    work_order = get_work_order(work_order_id)
    if not work_order:
        return None
    updated = work_order.model_copy(update={"status": status})
    timestamp = now_iso()
    with connect() as db:
        db.execute(
            "UPDATE work_orders SET payload = ?, status = ?, updated_at = ? WHERE id = ?",
            (dumps_model(updated), status, timestamp, work_order_id),
        )
        add_event(db, work_order_id, "status", f"Work order status changed to {status}.")
    return updated


def update_work_order_workflow(work_order_id: str, workflow_id: str, workflow_status: str | None = None) -> WorkOrder | None:
    work_order = get_work_order(work_order_id)
    if not work_order:
        return None
    updated = work_order.model_copy(
        update={
            "workflowId": workflow_id,
            "workflowStatus": workflow_status,
            "status": "running",
        }
    )
    timestamp = now_iso()
    with connect() as db:
        db.execute(
            "UPDATE work_orders SET payload = ?, status = ?, updated_at = ? WHERE id = ?",
            (dumps_model(updated), updated.status, timestamp, work_order_id),
        )
        add_event(db, work_order_id, "workflow_linked", f"Agentic workflow linked: {workflow_id}.")
    return updated


def save_manager_plan(work_order_id: str, payload: dict) -> None:
    timestamp = now_iso()
    with connect() as db:
        db.execute(
            "INSERT OR REPLACE INTO manager_plan_previews (work_order_id, payload, created_at) VALUES (?, ?, ?)",
            (work_order_id, dumps_dict(payload), timestamp),
        )
        add_event(db, work_order_id, "manager_plan", "Manager plan preview generated.")


def save_work_order_output(work_order_id: str, output_type: str, payload: dict) -> None:
    timestamp = now_iso()
    with connect() as db:
        db.execute(
            "INSERT OR REPLACE INTO work_order_outputs (work_order_id, output_type, payload, created_at) VALUES (?, ?, ?, ?)",
            (work_order_id, output_type, dumps_dict(payload), timestamp),
        )
        add_event(db, work_order_id, "final_output", f"Final output generated: {output_type}.")


def get_work_order_output(work_order_id: str):
    with connect() as db:
        row = db.execute(
            "SELECT work_order_id, output_type, payload, created_at FROM work_order_outputs WHERE work_order_id = ?",
            (work_order_id,),
        ).fetchone()
    if not row:
        return None
    return WorkOrderOutput(
        workOrderId=row["work_order_id"],
        outputType=row["output_type"],
        payload=json.loads(row["payload"]),
        createdAt=row["created_at"],
    )


def get_agent_workflow_memory(work_order_id: str) -> AgentWorkflowMemory | None:
    with connect() as db:
        ensure_workflow_tables(db)
        row = db.execute(
            """
            SELECT
              work_order_id,
              workflow_id,
              manager_agent_id,
              manager_agent_name,
              company_name,
              task_summary,
              payload,
              created_at,
              updated_at
            FROM agent_workflow_memory
            WHERE work_order_id = ?
            ORDER BY updated_at DESC
            LIMIT 1
            """,
            (work_order_id,),
        ).fetchone()
    if not row:
        return None
    return AgentWorkflowMemory(
        workOrderId=row["work_order_id"],
        workflowId=row["workflow_id"],
        managerAgentId=row["manager_agent_id"],
        managerAgentName=row["manager_agent_name"],
        companyName=row["company_name"],
        taskSummary=row["task_summary"],
        payload=json.loads(row["payload"]),
        createdAt=row["created_at"],
        updatedAt=row["updated_at"],
    )


def add_event(db: sqlite3.Connection, work_order_id: str, event_type: str, message: str) -> None:
    db.execute(
        "INSERT INTO work_order_events (work_order_id, type, message, created_at) VALUES (?, ?, ?, ?)",
        (work_order_id, event_type, message, now_iso()),
    )


def list_work_order_events(work_order_id: str) -> list[WorkOrderEvent]:
    with connect() as db:
        rows = db.execute(
            "SELECT id, work_order_id, type, message, created_at FROM work_order_events WHERE work_order_id = ? ORDER BY id ASC",
            (work_order_id,),
        ).fetchall()
    return [
        WorkOrderEvent(
            id=row["id"],
            workOrderId=row["work_order_id"],
            type=row["type"],
            message=row["message"],
            createdAt=row["created_at"],
        )
        for row in rows
    ]


def _nested_value(payload: dict, *path: str):
    current = payload
    for key in path:
        if not isinstance(current, dict):
            return None
        current = current.get(key)
    return current


def _coerce_agent_roster(value) -> list[MarketingAgentRosterItem]:
    if not isinstance(value, list):
        return []

    roster: list[MarketingAgentRosterItem] = []
    seen: set[str] = set()
    for item in value:
        if not isinstance(item, dict):
            continue
        agent_id = str(item.get("id") or "").strip().lower()
        role = str(item.get("role") or "").strip().lower()
        if not agent_id or agent_id in seen or role not in {"manager", "employee"}:
            continue
        tools = item.get("tools")
        roster.append(
            MarketingAgentRosterItem(
                id=agent_id,
                name=str(item.get("name") or agent_id.title()),
                role=role,  # type: ignore[arg-type]
                model=str(item.get("model")) if item.get("model") else None,
                tools=[str(tool) for tool in tools] if isinstance(tools, list) else [],
                autonomy=item.get("autonomy") if isinstance(item.get("autonomy"), int) else None,
                enabled=bool(item.get("enabled", True)),
            )
        )
        seen.add(agent_id)
    return roster


def _task_id(task: dict, fallback_index: int) -> str:
    return str(task.get("draft_id") or _nested_value(task, "meta", "id") or task.get("id") or f"draft-{fallback_index}")


def _task_status(task: dict) -> str:
    return str(task.get("status") or _nested_value(task, "meta", "status") or "pending_review")


def _operator_status(task: dict) -> str:
    value = str(_nested_value(task, "meta", "operator_status") or task.get("operatorStatus") or "").lower()
    if value in {"approved", "rejected"}:
        return value
    if _task_status(task) == "rejected":
        return "rejected"
    return "pending"


def _task_channel(task: dict) -> str | None:
    value = task.get("channel") or _nested_value(task, "meta", "channel") or task.get("platform") or task.get("type")
    return str(value) if value else None


def _task_title(task: dict, fallback_index: int) -> str:
    value = (
        task.get("headline")
        or task.get("subject_line")
        or task.get("title")
        or _nested_value(task, "slides", "0", "headline")
    )
    return str(value or f"Generated task {fallback_index + 1}")


def _log_id(log: dict, fallback_index: int, workflow_id: str) -> str:
    return str(log.get("id") or f"{workflow_id}-log-{fallback_index}")


def _log_created_at(log: dict) -> str:
    value = log.get("created_at") or log.get("timestamp")
    return str(value or now_iso())


def _status_from_workflow(workflow_status: str, tasks: list[dict]) -> WorkOrderStatus:
    normalized = workflow_status.lower()
    if normalized in {"running", "started", "processing"}:
        return "running"
    if normalized in {"failed", "error"}:
        return "review"
    if any(_operator_status(task) == "pending" for task in tasks):
        return "review"
    return "complete"


def _manager_summary_report(workflow: dict) -> dict | None:
    report = workflow.get("manager_summary_report")
    return report if isinstance(report, dict) else None


def _report_text(report: dict, key: str, fallback: str = "") -> str:
    value = report.get(key)
    return str(value).strip() if value is not None and str(value).strip() else fallback


def sync_workflow_snapshot(work_order_id: str, request: WorkflowSnapshotSyncRequest) -> WorkflowSnapshotSyncResponse | None:
    work_order = get_work_order(work_order_id)
    if not work_order:
        return None

    timestamp = now_iso()
    workflow_status = request.status or str(request.workflow.get("status") or "running")
    next_status = _status_from_workflow(workflow_status, request.tasks)
    workflow_roster = _coerce_agent_roster(request.workflow.get("agent_roster"))
    updated_work_order = work_order.model_copy(
        update={
            "status": next_status,
            "workflowId": request.workflowId,
            "workflowStatus": workflow_status,
            "agentRoster": workflow_roster or work_order.agentRoster,
        }
    )

    task_snapshots: list[WorkflowTaskSnapshot] = []
    log_snapshots: list[WorkflowActivityLogSnapshot] = []
    memory_stored = False

    with connect() as db:
        ensure_workflow_tables(db)
        workflow_updated_at = str(request.workflow.get("updated_at") or timestamp)
        existing_run = db.execute(
            "SELECT status, updated_at FROM workflow_runs WHERE workflow_id = ?",
            (request.workflowId,),
        ).fetchone()
        existing_task_rows = db.execute(
            "SELECT id, status, operator_status, json_extract(payload, '$.meta.gmail_message_id') AS gmail_message_id FROM workflow_tasks WHERE workflow_id = ?",
            (request.workflowId,),
        ).fetchall()
        existing_tasks = {
            row["id"]: {
                "status": row["status"],
                "operator_status": row["operator_status"],
                "gmail_message_id": row["gmail_message_id"],
            }
            for row in existing_task_rows
        }
        existing_log_count = db.execute(
            "SELECT COUNT(*) AS count FROM workflow_activity_logs WHERE workflow_id = ?",
            (request.workflowId,),
        ).fetchone()["count"]
        sync_changed = (
            existing_run is None
            or existing_run["status"] != workflow_status
            or existing_run["updated_at"] != workflow_updated_at
            or existing_log_count != len(request.activityLogs)
            or len(existing_tasks) != len(request.tasks)
        )
        db.execute(
            """
            INSERT INTO workflow_runs (workflow_id, work_order_id, status, payload, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?)
            ON CONFLICT(workflow_id) DO UPDATE SET
              work_order_id = excluded.work_order_id,
              status = excluded.status,
              payload = excluded.payload,
              updated_at = excluded.updated_at
            """,
            (
                request.workflowId,
                work_order_id,
                workflow_status,
                dumps_dict(request.workflow),
                request.workflow.get("created_at") or timestamp,
                workflow_updated_at,
            ),
        )

        for index, task in enumerate(request.tasks):
            task_id = _task_id(task, index)
            task_type = str(task.get("type") or "task")
            channel = _task_channel(task)
            status = _task_status(task)
            operator_status = _operator_status(task)
            title = _task_title(task, index)
            task_updated_at = str(_nested_value(task, "meta", "operator_reviewed_at") or request.workflow.get("updated_at") or timestamp)
            previous_task = existing_tasks.get(task_id)
            task_gmail_message_id = _nested_value(task, "meta", "gmail_message_id")
            if (
                previous_task is None
                or previous_task["status"] != status
                or previous_task["operator_status"] != operator_status
                or str(previous_task["gmail_message_id"] or "") != str(task_gmail_message_id or "")
            ):
                sync_changed = True
            db.execute(
                """
                INSERT INTO workflow_tasks (
                  id, workflow_id, work_order_id, type, channel, status, operator_status, title, payload, created_at, updated_at
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(id) DO UPDATE SET
                  workflow_id = excluded.workflow_id,
                  work_order_id = excluded.work_order_id,
                  type = excluded.type,
                  channel = excluded.channel,
                  status = excluded.status,
                  operator_status = excluded.operator_status,
                  title = excluded.title,
                  payload = excluded.payload,
                  updated_at = excluded.updated_at
                """,
                (
                    task_id,
                    request.workflowId,
                    work_order_id,
                    task_type,
                    channel,
                    status,
                    operator_status,
                    title,
                    dumps_dict(task),
                    task_updated_at,
                    task_updated_at,
                ),
            )
            task_snapshots.append(
                WorkflowTaskSnapshot(
                    id=task_id,
                    workflowId=request.workflowId,
                    workOrderId=work_order_id,
                    type=task_type,
                    channel=channel,
                    status=status,
                    operatorStatus=operator_status,  # type: ignore[arg-type]
                    title=title,
                    payload=task,
                    updatedAt=task_updated_at,
                )
            )

        for index, log in enumerate(request.activityLogs):
            log_id = _log_id(log, index, request.workflowId)
            created_at = _log_created_at(log)
            role = log.get("role")
            step_id = log.get("step_id")
            message = str(log.get("message") or "")
            db.execute(
                """
                INSERT INTO workflow_activity_logs (id, workflow_id, work_order_id, role, step_id, message, payload, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(id) DO UPDATE SET
                  workflow_id = excluded.workflow_id,
                  work_order_id = excluded.work_order_id,
                  role = excluded.role,
                  step_id = excluded.step_id,
                  message = excluded.message,
                  payload = excluded.payload,
                  created_at = excluded.created_at
                """,
                (
                    log_id,
                    request.workflowId,
                    work_order_id,
                    str(role) if role else None,
                    str(step_id) if step_id else None,
                    message,
                    dumps_dict(log),
                    created_at,
                ),
            )
            log_snapshots.append(
                WorkflowActivityLogSnapshot(
                    id=log_id,
                    workflowId=request.workflowId,
                    workOrderId=work_order_id,
                    role=str(role) if role else None,
                    stepId=str(step_id) if step_id else None,
                    message=message,
                    payload=log,
                    createdAt=created_at,
                )
            )

        db.execute(
            "UPDATE work_orders SET payload = ?, status = ?, updated_at = ? WHERE id = ?",
            (dumps_model(updated_work_order), next_status, timestamp, work_order_id),
        )

        if request.finalOutput is not None and request.outputType:
            db.execute(
                "INSERT OR REPLACE INTO work_order_outputs (work_order_id, output_type, payload, created_at) VALUES (?, ?, ?, ?)",
                (work_order_id, request.outputType, dumps_dict(request.finalOutput), timestamp),
            )

        manager_report = _manager_summary_report(request.workflow)
        if manager_report is not None:
            report_created_at = _report_text(manager_report, "generated_at", timestamp)
            manager_agent_id = _report_text(manager_report, "manager_agent_id", None)  # type: ignore[arg-type]
            manager_agent_name = _report_text(manager_report, "manager_agent_name", None)  # type: ignore[arg-type]
            company_name = _report_text(manager_report, "company_name", None)  # type: ignore[arg-type]
            task_summary = _report_text(manager_report, "task_summary", work_order.objective)
            db.execute(
                """
                INSERT INTO agent_workflow_memory (
                  workflow_id,
                  work_order_id,
                  manager_agent_id,
                  manager_agent_name,
                  company_name,
                  task_summary,
                  payload,
                  created_at,
                  updated_at
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(workflow_id) DO UPDATE SET
                  work_order_id = excluded.work_order_id,
                  manager_agent_id = excluded.manager_agent_id,
                  manager_agent_name = excluded.manager_agent_name,
                  company_name = excluded.company_name,
                  task_summary = excluded.task_summary,
                  payload = excluded.payload,
                  updated_at = excluded.updated_at
                """,
                (
                    request.workflowId,
                    work_order_id,
                    manager_agent_id,
                    manager_agent_name,
                    company_name,
                    task_summary,
                    dumps_dict(manager_report),
                    report_created_at,
                    timestamp,
                ),
            )
            memory_stored = True

        if sync_changed:
            add_event(db, work_order_id, "workflow_synced", f"Workflow snapshot synced: {request.workflowId} ({workflow_status}).")

    return WorkflowSnapshotSyncResponse(
        workOrder=updated_work_order,
        workflow=WorkflowRunSnapshot(
            workflowId=request.workflowId,
            workOrderId=work_order_id,
            status=workflow_status,
            payload=request.workflow,
            updatedAt=str(request.workflow.get("updated_at") or timestamp),
        ),
        tasks=task_snapshots,
        activityLogsStored=len(log_snapshots),
        finalOutputStored=request.finalOutput is not None and request.outputType is not None,
        memoryStored=memory_stored,
    )


def row_to_office_map(row: sqlite3.Row) -> OfficeMap:
    payload = json.loads(row["payload"])
    office_map = OfficeMap(**payload)
    departments = list_office_map_departments(office_map.id)
    assets = list_office_map_assets(office_map.id)
    return office_map.model_copy(update={"departments": departments, "assets": assets})


def list_office_maps(user_id: str | None = None) -> list[OfficeMap]:
    with connect() as db:
        if user_id:
            rows = db.execute("SELECT payload FROM office_maps WHERE user_id = ? ORDER BY updated_at DESC", (user_id,)).fetchall()
        else:
            rows = db.execute("SELECT payload FROM office_maps ORDER BY updated_at DESC").fetchall()
    return [row_to_office_map(row) for row in rows]


def get_office_map(map_id: str) -> OfficeMap | None:
    with connect() as db:
        row = db.execute("SELECT payload FROM office_maps WHERE id = ?", (map_id,)).fetchone()
    return row_to_office_map(row) if row else None


def list_office_map_departments(map_id: str):
    with connect() as db:
        rows = db.execute("SELECT payload FROM office_map_departments WHERE map_id = ? ORDER BY grid_row ASC, grid_col ASC", (map_id,)).fetchall()
    return [OfficeMapDepartment(**json.loads(row["payload"])) for row in rows]


def list_office_map_assets(map_id: str) -> list[OfficeMapAsset]:
    with connect() as db:
        rows = db.execute("SELECT payload FROM office_map_assets WHERE map_id = ? ORDER BY z ASC, y ASC, x ASC", (map_id,)).fetchall()
    return [OfficeMapAsset(**json.loads(row["payload"])) for row in rows]


def create_office_map(request: OfficeMapCreate) -> OfficeMap:
    timestamp = now_iso()
    office_map = OfficeMap(
        id=f"map-{uuid4().hex[:10]}",
        userId=request.userId,
        name=request.name,
        version=1,
        activeDepartmentIds=request.activeDepartmentIds,
        departments=[],
        assets=[],
        createdAt=timestamp,
        updatedAt=timestamp,
    )
    with connect() as db:
        insert_office_map_rows(db, office_map)
    return office_map


def update_office_map(map_id: str, update: OfficeMapUpdate) -> OfficeMap | None:
    current = get_office_map(map_id)
    if current is None:
        return None

    timestamp = now_iso()
    next_map = current.model_copy(
        update={
            "name": update.name if update.name is not None else current.name,
            "activeDepartmentIds": update.activeDepartmentIds if update.activeDepartmentIds is not None else current.activeDepartmentIds,
            "departments": update.departments if update.departments is not None else current.departments,
            "assets": update.assets if update.assets is not None else current.assets,
            "version": current.version + 1,
            "updatedAt": timestamp,
        }
    )
    with connect() as db:
        insert_office_map_rows(db, next_map)
    return next_map


def add_office_map_asset(map_id: str, request: OfficeMapAssetCreate) -> OfficeMapAsset | None:
    office_map = get_office_map(map_id)
    if office_map is None:
        return None

    asset = OfficeMapAsset(
        id=f"asset-{uuid4().hex[:10]}",
        mapId=map_id,
        departmentId=request.departmentId,
        src=request.src,
        label=request.label,
        kind=request.kind,
        grid=request.grid,
        x=request.x,
        y=request.y,
        width=request.width,
        z=request.z,
        rotationX=request.rotationX,
        rotationY=request.rotationY,
        rotation=request.rotation,
        flipX=request.flipX,
        blocksMovement=request.blocksMovement,
        requiresFloor=request.requiresFloor,
        footprint=request.footprint,
        createdAt=now_iso(),
    )
    with connect() as db:
        insert_office_map_asset_row(db, asset)
        updated = office_map.model_copy(update={"assets": [*office_map.assets, asset], "version": office_map.version + 1, "updatedAt": now_iso()})
        db.execute(
            "UPDATE office_maps SET payload = ?, version = ?, updated_at = ? WHERE id = ?",
            (dumps_model(updated), updated.version, updated.updatedAt, map_id),
        )
    return asset


def list_map_presets() -> list[MapPreset]:
    with connect() as db:
        rows = db.execute("SELECT payload FROM map_presets ORDER BY name ASC").fetchall()
    return [MapPreset(**json.loads(row["payload"])) for row in rows]


def get_map_preset(preset_id: str) -> MapPreset | None:
    with connect() as db:
        row = db.execute("SELECT payload FROM map_presets WHERE id = ?", (preset_id,)).fetchone()
    return MapPreset(**json.loads(row["payload"])) if row else None
