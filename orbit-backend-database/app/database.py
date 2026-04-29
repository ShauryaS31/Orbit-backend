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
    MapPreset,
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


def connect() -> sqlite3.Connection:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    connection = sqlite3.connect(DB_PATH)
    connection.row_factory = sqlite3.Row
    return connection


def init_db() -> None:
    with connect() as db:
      db.executescript(SCHEMA)
      seed_if_empty(db)
      seed_maps_if_empty(db)


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
