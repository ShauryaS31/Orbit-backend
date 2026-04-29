# Orbit API - Handover for UI (Lovable)

Base URL matches your deployed Next.js host (local default: `http://localhost:3000`). All routes return JSON unless noted.

### Consultant Mode personas (demo UI)

Two primary characters surface in **`activity_logs` messages**, **`governance_log[].display_agent_name`**, and **`consultant_discovery`** metadata:

| Persona | Maps from internal roles | Role label |
| --- | --- | --- |
| **Nova** | `researcher` | Brand Research Intern |
| **Scott** | `marketing_manager` | Marketing Manager |

Specialist pipelines (**Content**, **Visual**, **Carousel**, **QA/analyst/copywriter** in logs) remain **internal `AgentRole` ids** - present them in the UI as **skills/tools Scott delegates** ("Manager-owned tools"), not separate named characters.

Discovery packaging includes **`consultant_discovery.research_report_title`** (default **Nova's Research Report**) so founders review Nova's crawl output before Scott runs strategy.

### Frontend teammate checklist (Consultant Mode UI)

| UI concern | Source field |
| --- | --- |
| Discovery phase title | `consultant_discovery.research_report_title` |
| Governance persona label | `governance_log[].display_agent_name` (Nova \| Scott); keep internal `agent_id` + `step_id` for audit rows |
| Visible skill routing | `selected_skills` |
| Per-draft rationale | `campaign_execution_drafts[].meta.strategic_intent` |
| Raw React/Tailwind artifact | `campaign_execution_drafts[].studio_react_export` (carousel) - **must not be `eval`'d or compiled in the browser**; show as a static Design Artifact code panel with syntax highlighting |

Preview UI should render from structured draft fields (headlines, body, palette hex from `brand_kit` / `design_system`, linked `generated_campaign_assets[].image_url`), not from executing `studio_react_export`.

**Local sandbox publish:** With **`SOCIAL_SANDBOX=true`** in `.env`, `POST /api/workflows/[id]/publish` returns **`mock_deployment_data`** (`status`, `platform_link`, `confirmation_message`) without calling Ayrshare.

**Dev troubleshooting:** If `Cannot find module './948.js'` appears after switching branches or interrupted builds, run **`npm run clean`** then **`npm run build`**, then restart `npm run dev`.

---

## 1. `GET /api/workflows/[id]`

**Purpose:** Load the full workflow payload for Consultant Mode - discovery outputs (`website_intelligence`, `intelligence_validation` with premium fields like `confidence_score` 0-100, `visual_palette_rationale`, `brand_voice_descriptors`), optional **`consultant_discovery`** (`research_report_title` for Nova's discovery framing), `brand_kit`, `product_marketing_context`, optional goal fields (`business_goal`, `success_metric`), optional `brand_learning_notes`, append-only `governance_log` (includes **`display_agent_name`**: Nova \| Scott alongside stable **`agent_id`**), optional `selected_skills`, `campaign_execution_drafts`, `generated_campaign_assets`, `activity_logs`, and status.

**Use when:** Hydrating dashboard panels, draft review UI, or asset galleries after `marketing/start` returns a workflow id.

**Backward compatibility:** New fields are optional; clients that ignore them keep working unchanged.

---

## 2. `POST /api/workflows/marketing/start`

**Purpose:** Bootstrap discovery or run **demo mode** (`demo_mode: true`) so campaign execution can attach assets server-side.

**Required:** `company_url`

**Optional:** `demo_mode`, `carousel_maker`, `business_goal`, `success_metric`, `brand_learning_notes` (array of strings). Goal fields steer Marketing Manager skill routing; founder notes merge into crawl-derived intelligence during execution with governance audit rows.

**Response:** `{ "workflow_id": "<id>", "status": "started" }`

---

## 3. `POST /api/workflows/[id]/validate`

**Purpose:** Founder/consultant approval of discovery - kicks off campaign execution.

**Body (one of):**

```json
{ "approved": true }
```

or

```json
{ "answers": ["answer one", "answer two"] }
```

**Response:** `{ "workflow_id": "<id>", "status": "running" }`

**Use when:** User confirms scraped intelligence / questionnaire step so Orbit can generate drafts and assets server-side.

---

## 4. `POST /api/workflows/[id]/publish`

**Purpose:** Schedule or publish a draft through the Social Orchestrator (Ayrshare when `SOCIAL_SANDBOX` is false; instant sandbox mock when true).

**Body:**

```json
{
  "draft_id": "<uuid>",
  "platform": "instagram | linkedin | facebook | tiktok",
  "schedule_time": "2026-05-01T12:00:00.000Z"
}
```

`schedule_time` is optional (immediate publish path when omitted).

**Sandbox (`SOCIAL_SANDBOX=true`):** Response includes `mock_deployment_data` (`status`, `platform_link`, `confirmation_message`) for premium UI previews without hitting external APIs.

**Use when:** Deploy step after drafts are approved - surfaces deployment IDs and sandbox preview links.

### Publish approval behavior

- Non-sandbox (`SOCIAL_SANDBOX=false`): publish requires draft-level approval (`meta.status === "approved"`).
- Sandbox (`SOCIAL_SANDBOX=true`): publish allows a provided `draft_id` even if the draft-specific approve route was not called yet.
- This keeps demo flow reliable with Option A:
  - `validate workflow` -> `publish selected draft`
- Option B also remains supported:
  - `validate workflow` -> `approve draft` -> `publish selected draft`

### Workflow persistence behavior

- Workflow state is in-memory (`workflowStore`).
- Workflows do not survive backend restart.
- In `next dev`, hot reload/recompile can clear in-memory workflow state.
- For stable demo testing:
  - `npm run clean`
  - `npm run build`
  - `SOCIAL_SANDBOX=true`
  - `npx next start -p 3000`

---

_See also:_ `GET /api/workflows/[id]/report` for Markdown agency audit export.
