# Orbit FastAPI Backend

Small standalone backend for the Orbit Company Context and Work Orders pages.

This lives outside `orbit-autonomous-office` so it can be merged into the Python backend separately.

## What It Provides

- SQLite persistence for company context sections
- Metadata-only context document intake
- Work order creation and status updates
- Manager plan preview contract endpoint
- Final output contract endpoint for the Lyra 7-day launch campaign
- Event log endpoint for work orders
- Office map persistence for the modular 2.5D map engine
- Map asset, department, and preset library endpoints

## Run

```powershell
cd "C:\Users\Adit Vikram Mishra\Desktop\OpenAI Hackathon\orbit-backend"
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

If your teammate already has a FastAPI app, they can copy the `app/models.py`, `app/routes`, `app/services`, and `app/database.py` pieces into their backend instead.

## Core Endpoints

```txt
GET  /api/health

GET  /api/company-context
GET  /api/company-context/{section}
PUT  /api/company-context/{section}
POST /api/company-context/{section}/files
POST /api/company-context/{section}/compile

GET   /api/work-orders
POST  /api/work-orders
GET   /api/work-orders/{id}
PATCH /api/work-orders/{id}/status
POST  /api/work-orders/{id}/manager-plan
POST  /api/work-orders/{id}/final-output
GET   /api/work-orders/{id}/events

GET  /api/office-maps
POST /api/office-maps
GET  /api/office-maps/{id}
PUT  /api/office-maps/{id}
GET  /api/office-maps/{id}/assets
POST /api/office-maps/{id}/assets
GET  /api/office-maps/presets/library
POST /api/office-maps/{id}/apply-preset
```

## Database

SQLite file is created automatically at:

```txt
orbit-backend/data/orbit.sqlite
```

The schema uses multiple SQLite tables:

```txt
context_sections
work_orders
manager_plan_previews
work_order_outputs
work_order_events
office_maps
office_map_departments
office_map_assets
map_presets
```

Most rows also store a full JSON payload. This is intentional for the hackathon: the API contract is stable, while the internal storage can be replaced later with richer relational tables, Postgres, or a vector-backed memory layer.

## Sharing The Database With Another Agent

Give the other agent either:

```txt
C:\Users\Adit Vikram Mishra\Desktop\OpenAI Hackathon\orbit-backend
```

or the SQLite file after the server has initialized:

```txt
C:\Users\Adit Vikram Mishra\Desktop\OpenAI Hackathon\orbit-backend\data\orbit.sqlite
```

Prefer the API over direct SQLite writes when possible. Direct reads are fine for inspection, but API writes keep the JSON payload and normalized map tables in sync.

## API Docs

After running the server:

```txt
http://localhost:8000/docs
```
