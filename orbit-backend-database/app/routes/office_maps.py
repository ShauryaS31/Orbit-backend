from __future__ import annotations

from fastapi import APIRouter, HTTPException, Query

from app import database
from app.models import (
    ApplyMapPresetRequest,
    MapPreset,
    OfficeMap,
    OfficeMapAsset,
    OfficeMapAssetCreate,
    OfficeMapCreate,
    OfficeMapUpdate,
)

router = APIRouter(prefix="/api/office-maps", tags=["office-maps"])


@router.get("", response_model=list[OfficeMap])
def list_office_maps(user_id: str | None = Query(default=None, alias="userId")) -> list[OfficeMap]:
    return database.list_office_maps(user_id)


@router.post("", response_model=OfficeMap)
def create_office_map(request: OfficeMapCreate) -> OfficeMap:
    return database.create_office_map(request)


@router.get("/presets/library", response_model=list[MapPreset])
def list_map_presets() -> list[MapPreset]:
    return database.list_map_presets()


@router.get("/{map_id}", response_model=OfficeMap)
def get_office_map(map_id: str) -> OfficeMap:
    office_map = database.get_office_map(map_id)
    if not office_map:
        raise HTTPException(status_code=404, detail="Office map not found")
    return office_map


@router.put("/{map_id}", response_model=OfficeMap)
def update_office_map(map_id: str, request: OfficeMapUpdate) -> OfficeMap:
    office_map = database.update_office_map(map_id, request)
    if not office_map:
        raise HTTPException(status_code=404, detail="Office map not found")
    return office_map


@router.get("/{map_id}/assets", response_model=list[OfficeMapAsset])
def list_office_map_assets(map_id: str) -> list[OfficeMapAsset]:
    if not database.get_office_map(map_id):
        raise HTTPException(status_code=404, detail="Office map not found")
    return database.list_office_map_assets(map_id)


@router.post("/{map_id}/assets", response_model=OfficeMapAsset)
def add_office_map_asset(map_id: str, request: OfficeMapAssetCreate) -> OfficeMapAsset:
    asset = database.add_office_map_asset(map_id, request)
    if not asset:
        raise HTTPException(status_code=404, detail="Office map not found")
    return asset


@router.post("/{map_id}/apply-preset", response_model=OfficeMap)
def apply_map_preset(map_id: str, request: ApplyMapPresetRequest) -> OfficeMap:
    office_map = database.get_office_map(map_id)
    if not office_map:
        raise HTTPException(status_code=404, detail="Office map not found")

    preset = database.get_map_preset(request.presetId)
    if not preset:
        raise HTTPException(status_code=404, detail="Map preset not found")

    # MVP behavior: insert preset assets as relative/stub instances.
    # The frontend map engine can later resolve sockets, offsets, and validation.
    for asset_request in preset.assets:
        database.add_office_map_asset(map_id, asset_request.model_copy(update={"departmentId": request.departmentId}))

    updated = database.get_office_map(map_id)
    if not updated:
        raise HTTPException(status_code=404, detail="Office map not found")
    return updated
