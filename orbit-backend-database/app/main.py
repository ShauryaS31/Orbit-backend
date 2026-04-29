from __future__ import annotations

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.database import init_db
from app.models import HealthResponse
from app.routes.company_context import router as company_context_router
from app.routes.office_maps import router as office_maps_router
from app.routes.work_orders import router as work_orders_router

app = FastAPI(title="Orbit Backend", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:8080",
        "http://127.0.0.1:8080",
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def on_startup() -> None:
    init_db()


@app.get("/api/health", response_model=HealthResponse)
def health() -> HealthResponse:
    return HealthResponse(ok=True, service="orbit-backend")


app.include_router(company_context_router)
app.include_router(office_maps_router)
app.include_router(work_orders_router)
