from __future__ import annotations

from fastapi import APIRouter, HTTPException, Query

from app import database
from app.models import (
    CompanyContextState,
    CompiledContextResponse,
    ContextBlock,
    ContextDocumentCreate,
    ContextSectionId,
    EditableContextSectionId,
)

router = APIRouter(prefix="/api/company-context", tags=["company-context"])


@router.get("", response_model=CompanyContextState)
def get_company_context() -> CompanyContextState:
    return database.get_company_context()


@router.get("/{section}")
def get_company_context_section(section: ContextSectionId):
    block = database.get_context_section(section)
    if block is None:
        raise HTTPException(status_code=404, detail="Context section not found")
    return block


@router.put("/{section}", response_model=ContextBlock)
def update_company_context_section(section: EditableContextSectionId, block: ContextBlock) -> ContextBlock:
    if block.section != section:
        block = block.model_copy(update={"section": section})
    return database.update_context_section(section, block)


@router.post("/{section}/files", response_model=ContextBlock)
def add_context_file_metadata(section: EditableContextSectionId, document: ContextDocumentCreate) -> ContextBlock:
    try:
        return database.add_context_document(section, document)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post("/{section}/compile", response_model=CompiledContextResponse)
def compile_context(section: ContextSectionId, agent_id: str | None = Query(default=None, alias="agentId")) -> CompiledContextResponse:
    try:
        return database.compile_context(section, agent_id)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail="Context section not found") from exc
