from __future__ import annotations

from app.models import (
    CompanyContextState,
    CompanyProfile,
    ContextBlock,
    ContextDocument,
    DepartmentContextLog,
    ManagerPlanPreviewResponse,
    MapPreset,
    OfficeMap,
    OfficeMapAsset,
    OfficeMapAssetCreate,
    OfficeMapDepartment,
    SevenDayLaunchCampaignResponse,
    WorkOrder,
    WorkOrderSubtask,
    GridCoord,
)


CONTEXT_INTAKE_EXAMPLES = {
    "common": [
        "Company profile, website, industry, regions, operating model",
        "Product catalog, pricing basics, approved claims, customer segments",
        "Global brand assets, legal boundaries, security rules, escalation policy",
    ],
    "marketing": [
        "Campaign briefs, personas, channel preferences, content pillars",
        "Examples of approved copy, visual references, brand campaign notes",
        "Growth calendars, offer details, distribution constraints",
    ],
    "hr": [
        "Hiring criteria, onboarding docs, employee handbook, interview rubrics",
        "Internal communication style, benefits policy, compliance constraints",
    ],
    "finance": [
        "Budget rules, revenue model, pricing assumptions, expense categories",
        "Reporting cadence, spend approvals, risk tolerance, forecasting notes",
    ],
}


INITIAL_COMPANY_CONTEXT = CompanyContextState(
    common=ContextBlock(
        section="common",
        companyProfile=CompanyProfile(
            name="Lyra Technologies AU",
            website="https://lyratechnologies.com.au",
            linkedin="https://www.linkedin.com/company/lyra-technologies-au",
            genericInfo=(
                "Lyra is a founder-led, high-velocity product studio that positions itself as "
                "forward-deployed engineering talent for Silicon Valley startups."
            ),
        ),
        summary=(
            "Company-wide source of truth for Lyra: forward-deployed engineering positioning, "
            "venture-backed founder audience, AI/product execution proof, builder-native culture, "
            "and demo-safe warm-cache research boundaries."
        ),
        goals=[
            "Increase qualified founder conversations from venture-backed startups by 20%",
            "Make every marketing decision traceable to Lyra's approved warm-cache dossier",
            "Position Lyra as anti-agency engineering leverage, not a generic dev shop",
            "Connect culture and talent density back to client execution proof",
        ],
        guidelines=[
            "Use warm-cache framing honestly; do not claim full live scraping of blocked social platforms",
            "Do not call Lyra a normal SaaS startup or a basic software agency",
            "Avoid generic AI transformation or corporate consulting language",
            "Tie culture proof to talent density, delivery speed, and founder trust",
        ],
        documents=[
            ContextDocument(id="common-1", section="common", name="LYRA_BRAND_INTELLIGENCE_DOSSIER.md", type="Brand Dossier", status="indexed", uploadedAt="2026-04-29T09:00:00.000Z", source="system"),
            ContextDocument(id="common-2", section="common", name="Product catalog and approved claims", type="Product", status="indexed", uploadedAt="2026-04-29T09:02:00.000Z", source="system"),
            ContextDocument(id="common-3", section="common", name="Global policy and escalation rules", type="Policy", status="indexed", uploadedAt="2026-04-29T09:04:00.000Z", source="system"),
            ContextDocument(id="common-4", section="common", name="Brand assets and identity kit", type="Brand", status="queued", uploadedAt="2026-04-29T09:06:00.000Z", source="upload"),
        ],
        updatedAt="2026-04-29T09:06:00.000Z",
        version=1,
    ),
    marketing=ContextBlock(
        section="marketing",
        summary=(
            "Department-specific context for Lyra's Orbit demo campaign: LinkedIn founder posts, "
            "proof-stack carousel, culture proof, AI execution angle, objection handling, and strategy consultation CTA."
        ),
        goals=[
            "Turn forward-deployed engineering positioning into campaign strategy",
            "Use LinkedIn founder posts and carousel assets to drive strategy conversations",
            "Blend proof, culture, and conversion without sounding like a generic agency",
        ],
        guidelines=[
            "Never contradict Common context",
            "Lead with Forward-Deployed Engineers for Silicon Valley",
            "Use proof points like 75+ client work, 15+ YC companies, AI/B2B portfolio, and builder events",
            "Use culture as credibility, not perks",
            "Avoid vague rocketship, AI revolution, or corporate consulting visuals",
        ],
        documents=[
            ContextDocument(id="marketing-1", section="marketing", name="Audience and persona notes", type="Persona", status="indexed", uploadedAt="2026-04-29T09:08:00.000Z", source="system"),
            ContextDocument(id="marketing-2", section="marketing", name="Content pillars and channel rules", type="Playbook", status="indexed", uploadedAt="2026-04-29T09:10:00.000Z", source="system"),
            ContextDocument(id="marketing-3", section="marketing", name="Campaign examples and visual references", type="Creative", status="queued", uploadedAt="2026-04-29T09:12:00.000Z", source="upload"),
        ],
        updatedAt="2026-04-29T09:12:00.000Z",
        version=1,
    ),
    hr=DepartmentContextLog(
        section="hr",
        lines=[
            "08:14 common_context.company_profile received",
            "08:14 common_context.global_policy received",
            "08:14 hr_policy_adapter waiting for backend contract",
            "08:15 onboarding_rules marked as HR-only department memory",
            "08:17 hiring_workflow locked until HR wing is activated",
        ],
        expectedInputs=CONTEXT_INTAKE_EXAMPLES["hr"],
    ),
    finance=DepartmentContextLog(
        section="finance",
        lines=[
            "08:14 common_context.company_profile received",
            "08:14 common_context.operating_model received",
            "08:15 budget_policy_adapter waiting for backend contract",
            "08:16 spend_limit_rules marked as Finance-only department memory",
            "08:17 forecast_workflow locked until Finance wing is activated",
        ],
        expectedInputs=CONTEXT_INTAKE_EXAMPLES["finance"],
    ),
)


# Demo seed row for fresh installs — frontend treats id wo-launch-001 as Sample; keep id stable if referenced.
INITIAL_WORK_ORDERS = [
    WorkOrder(
        id="wo-launch-001",
        title="Lyra 7-day market growth strategy",
        department="marketing",
        managerAgentId="scott",
        objective="Create a 7-day market growth strategy for Lyra that increases qualified founder conversations from venture-backed startups by 20%.",
        contextSections=["common", "marketing"],
        outputType="campaign_package",
        autonomy="approval_required",
        approvalRequired=True,
        priority="high",
        status="queued",
        createdAt="2026-04-29T09:30:00.000Z",
        subtasks=[
            WorkOrderSubtask(id="wo-launch-001-plan", title="Manager plan", owner="manager", agentId="scott", status="queued", summary="Scott reads context and defines growth angle, channels, and review criteria."),
            WorkOrderSubtask(id="wo-launch-001-copy", title="Copy calendar", owner="employee", agentId="leo", status="draft", summary="Leo drafts 7 posts, email beats, and CTA variants."),
            WorkOrderSubtask(id="wo-launch-001-visuals", title="Visual direction", owner="employee", agentId="iris", status="draft", summary="Iris creates visual prompts and asset direction for the strategy package."),
            WorkOrderSubtask(id="wo-launch-001-review", title="Manager review and assembly", owner="manager", agentId="scott", status="draft", summary="Scott reviews all outputs against Common and Marketing context before the final growth package."),
        ],
    )
]


# Demo narrative aligned with seeded work order wo-launch-001 — not generic agent output for every WO.
DEMO_SEED_LYRA_MANAGER_PLAN = ManagerPlanPreviewResponse(
    workOrderId="wo-launch-001",
    managerAgentId="scott",
    department="marketing",
    objective="Create a 7-day market growth strategy for Lyra that increases qualified founder conversations from venture-backed startups by 20%.",
    outputType="campaign_package",
    contextSections=["common", "marketing"],
    planSummary="Scott will create a market growth strategy, delegate specialist production, then review all outputs against Common and Marketing context before assembling the growth strategy package.",
    assumptions=[
        "Common context contains approved product claims and target customer language.",
        "Marketing context contains channel preferences and campaign voice examples.",
        "The operator wants a reviewable package, not direct publishing.",
    ],
    risks=[{"id": "risk-claims", "level": "medium", "description": "Growth strategy copy may imply customer proof or metrics that are not in Common context.", "mitigation": "Scott flags unsupported claims during manager review and rewrites them as product capabilities."}],
    steps=[
        {"id": "strategy", "kind": "strategy", "title": "Define growth angle and channel plan", "ownerAgentId": "scott", "ownerRole": "manager", "dependsOn": [], "contextRequired": ["common", "marketing"], "instructions": "Read company facts, approved claims, audience notes, and growth preferences. Produce the growth angle, channel mix, and review criteria.", "expectedOutput": "Growth strategy brief", "acceptanceCriteria": ["Uses only approved claims", "Names target audience", "Defines LinkedIn, X, and email roles"], "estimatedMinutes": 4},
        {"id": "copy", "kind": "delegation", "title": "Delegate copy calendar", "ownerAgentId": "leo", "ownerRole": "employee", "dependsOn": ["strategy"], "contextRequired": ["common", "marketing"], "instructions": "Draft seven channel-specific growth messages using the manager strategy and approved company context.", "expectedOutput": "Seven-day copy calendar", "acceptanceCriteria": ["One clear CTA per asset", "No unsupported proof", "Matches Lyra's voice"], "estimatedMinutes": 6},
        {"id": "visuals", "kind": "production", "title": "Create visual direction", "ownerAgentId": "iris", "ownerRole": "employee", "dependsOn": ["strategy"], "contextRequired": ["common", "marketing"], "instructions": "Create visual prompt direction and asset notes for the growth calendar.", "expectedOutput": "Visual direction board", "acceptanceCriteria": ["Matches brand assets", "Supports each channel", "Avoids generic stock imagery"], "estimatedMinutes": 5},
        {"id": "review", "kind": "review", "title": "Review and assemble final package", "ownerAgentId": "scott", "ownerRole": "manager", "dependsOn": ["copy", "visuals"], "contextRequired": ["common", "marketing"], "instructions": "Check copy and visuals against Common and Marketing context, resolve inconsistencies, and assemble the final growth strategy package.", "expectedOutput": "Final growth strategy package", "acceptanceCriteria": ["All claims trace to context", "All assets have owner and CTA", "Final checklist is complete"], "estimatedMinutes": 4},
    ],
    finalReviewChecklist=["Approved claims only", "Channel-specific CTAs", "Visual direction attached", "Operator approval required before publishing"],
    needsOperatorApproval=True,
)


DEMO_SEED_LYRA_CAMPAIGN = SevenDayLaunchCampaignResponse(
    workOrderId="wo-launch-001",
    campaignName="Lyra Velocity Sprint",
    positioning="Lyra Technologies AU helps founding engineering teams remove process drag and ship product at startup speed.",
    targetAudience="Founding engineers and technical co-founders scaling seed to Series B product teams.",
    primaryGoal="Drive qualified pilot conversations from venture-backed engineering teams.",
    messagingPillars=["Build fast with quality", "Engineer-owned execution", "No process theatre"],
    channels=["linkedin", "x", "email"],
    assets=[
        {"id": "day-1-linkedin", "day": 1, "channel": "linkedin", "title": "Founder pain opener", "objective": "Name the engineering delivery drag problem.", "draftCopy": "Your best product momentum does not die because the team lacks talent. It dies when senior engineers get buried in process drag.", "visualDirection": "Isometric engineering desk resolving from scattered tickets into a clean release path.", "cta": "Book a founder-to-founder session", "ownerAgentId": "leo"},
        {"id": "day-2-x", "day": 2, "channel": "x", "title": "Workflow reveal", "objective": "Show the Lyra operating loop.", "draftCopy": "Remove process drag. Keep engineers close to execution. Ship the work that proves the product is moving.", "visualDirection": "Four-step engineering velocity flow card.", "cta": "See the operating model", "ownerAgentId": "leo"},
        {"id": "day-3-linkedin", "day": 3, "channel": "linkedin", "title": "Before and after", "objective": "Contrast process-heavy delivery with engineer-owned execution.", "draftCopy": "Before Lyra: delivery rituals slow the founding team down. After Lyra: execution stays engineer-owned and release-ready.", "visualDirection": "Split-screen before/after engineering workflow.", "cta": "Book a pilot conversation", "ownerAgentId": "leo"},
        {"id": "day-4-email", "day": 4, "channel": "email", "title": "Founder email", "objective": "Convert warm founder interest into pilot conversations.", "draftCopy": "Subject: Ship faster without process theatre. Body: Lyra helps founding teams reduce delivery drag while keeping senior engineers close to execution.", "visualDirection": "Simple product operations board with release-ready emphasis.", "cta": "Reserve a pilot slot", "ownerAgentId": "leo"},
        {"id": "day-5-x", "day": 5, "channel": "x", "title": "Objection handling", "objective": "Address speed versus quality tension.", "draftCopy": "Velocity does not mean losing quality. Lyra keeps senior engineers close to execution while removing delivery drag.", "visualDirection": "Human approval checkpoint in an engineering workflow.", "cta": "Ask for the operating model", "ownerAgentId": "leo"},
        {"id": "day-6-linkedin", "day": 6, "channel": "linkedin", "title": "Use case thread", "objective": "Make the product concrete through a release ritual.", "draftCopy": "A weekly release ritual should create momentum, not process debt. Lyra keeps owners, blockers, and decisions tied to shipping outcomes.", "visualDirection": "Engineering standup transformed into release board.", "cta": "Watch the workflow", "ownerAgentId": "leo"},
        {"id": "day-7-email", "day": 7, "channel": "email", "title": "Founder CTA", "objective": "Close the growth sprint with a pilot CTA.", "draftCopy": "Lyra pilot sessions are open for teams that need venture-backed speed without approval-heavy delivery drag.", "visualDirection": "Growth package card with pilot CTA.", "cta": "Claim a pilot session", "ownerAgentId": "leo"},
    ],
    managerReviewNotes=["No unsupported revenue or customer claims included.", "All assets use Common + Marketing context.", "Operator approval required before publishing."],
    finalPackageChecklist=["Strategy brief", "Seven growth assets", "Visual directions", "CTA map", "Manager review notes"],
)


def starter_asset(
    asset_id: str,
    src: str,
    label: str,
    x: int,
    y: int,
    width: int,
    z: int,
    kind: str,
    grid_col: int | None = None,
    grid_row: int | None = None,
    rotation_x: int = 0,
    rotation_y: int = 0,
    rotation: int = 0,
    flip_x: bool = False,
    blocks_movement: bool = False,
    requires_floor: bool = False,
) -> OfficeMapAsset:
    return OfficeMapAsset(
        id=asset_id,
        mapId="map-demo-marketing",
        departmentId="marketing",
        src=src,
        label=label,
        kind=kind,
        grid=GridCoord(col=grid_col, row=grid_row) if grid_col is not None and grid_row is not None else None,
        x=x,
        y=y,
        width=width,
        z=z,
        rotationX=rotation_x,
        rotationY=rotation_y,
        rotation=rotation,
        flipX=flip_x,
        blocksMovement=blocks_movement,
        requiresFloor=requires_floor,
        footprint=GridCoord(col=1, row=1),
        createdAt="2026-04-29T10:00:00.000Z",
    )


STARTER_MARKETING_ASSETS = [
    starter_asset("floor-001", "tiles/floor-tile-2x2.png", "Tile: Floor Patch 2x2", 440, 157, 160, 60, "floor", 0, 0),
    starter_asset("floor-002", "tiles/floor-tile-2x2.png", "Tile: Floor Patch 2x2", 366, 197, 160, 60, "floor", -1, 1),
    starter_asset("floor-003", "tiles/floor-tile-2x2.png", "Tile: Floor Patch 2x2", 514, 198, 160, 60, "floor", 1, 1),
    starter_asset("floor-004", "tiles/floor-tile-2x2.png", "Tile: Floor Patch 2x2", 439, 237, 160, 60, "floor", 0, 2),
    starter_asset("floor-005", "tiles/floor-tile-2x2.png", "Tile: Floor Patch 2x2", 291, 236, 160, 60, "floor", -2, 2),
    starter_asset("floor-006", "tiles/floor-tile-2x2.png", "Tile: Floor Patch 2x2", 364, 278, 160, 60, "floor", -1, 3),
    starter_asset("floor-007", "tiles/floor-tile-2x2.png", "Tile: Floor Patch 2x2", 217, 275, 160, 60, "floor", -3, 3),
    starter_asset("floor-008", "tiles/floor-tile-2x2.png", "Tile: Floor Patch 2x2", 291, 318, 160, 60, "floor", -2, 4),
    starter_asset("floor-009", "tiles/floor-tile-2x2.png", "Tile: Floor Patch 2x2", 588, 239, 160, 60, "floor", 2, 2),
    starter_asset("floor-010", "tiles/floor-tile-2x2.png", "Tile: Floor Patch 2x2", 513, 279, 160, 60, "floor", 1, 3),
    starter_asset("floor-011", "tiles/floor-tile-2x2.png", "Tile: Floor Patch 2x2", 438, 319, 160, 60, "floor", 0, 4),
    starter_asset("floor-012", "tiles/floor-tile-2x2.png", "Tile: Floor Patch 2x2", 366, 360, 160, 60, "floor", -1, 5),
    starter_asset("floor-013", "tiles/floor-tile-2x2.png", "Tile: Floor Patch 2x2", 664, 279, 160, 60, "floor", 3, 3),
    starter_asset("floor-014", "tiles/floor-tile-2x2.png", "Tile: Floor Patch 2x2", 589, 319, 160, 60, "floor", 2, 4),
    starter_asset("floor-015", "tiles/floor-tile-2x2.png", "Tile: Floor Patch 2x2", 515, 359, 160, 60, "floor", 1, 5),
    starter_asset("floor-016", "tiles/floor-tile-2x2.png", "Tile: Floor Patch 2x2", 441, 400, 160, 60, "floor", 0, 6),
    starter_asset("wall-left", "walls/side-wall.png", "Wall: Side Wall", 193, 56, 264, 60, "wall", blocks_movement=True),
    starter_asset("wall-right", "walls/side-wall.png", "Wall: Side Wall Mirrored", 507, 17, 264, 60, "wall", flip_x=True, blocks_movement=True),
    starter_asset("manager-desk", "furniture/manager-desk.png", "Furniture: Manager Desk", 254, 212, 176, 65, "furniture", blocks_movement=True, requires_floor=True),
    starter_asset("content-desk", "furniture/content-desk.png", "Furniture: Content Desk", 566, 172, 196, 65, "furniture", blocks_movement=True, requires_floor=True),
    starter_asset("document-stack", "props/document-stack.png", "Prop: Document Stack", 662, 275, 76, 60, "prop", rotation_y=-33, requires_floor=True),
    starter_asset("campaign-calendar", "marketing/campaign-calendar.png", "Marketing: Campaign Calendar", 351, 136, 116, 62, "panel", rotation_y=136, blocks_movement=True),
    starter_asset("growth-panel", "marketing/growth-panel.png", "Marketing: Growth Panel", 249, 152, 69, 60, "panel", rotation_x=-38, rotation_y=-145, flip_x=True, blocks_movement=True),
    starter_asset("creative-canvas", "marketing/creative-canvas.png", "Marketing: Creative Canvas", 524, 86, 210, 60, "panel", rotation_x=-49, rotation_y=-38, blocks_movement=True),
]


INITIAL_OFFICE_MAPS = [
    OfficeMap(
        id="map-demo-marketing",
        userId="demo-user",
        name="Demo Marketing Office",
        version=1,
        activeDepartmentIds=["marketing"],
        departments=[
            OfficeMapDepartment(
                id="marketing",
                name="Marketing",
                status="active",
                grid=GridCoord(col=0, row=0),
                agentIds=["scott", "nova"],
            )
        ],
        assets=STARTER_MARKETING_ASSETS,
        createdAt="2026-04-29T10:00:00.000Z",
        updatedAt="2026-04-29T10:00:00.000Z",
    )
]


INITIAL_MAP_PRESETS = [
    MapPreset(
        id="department-base-marketing",
        name="Department Base: Marketing",
        departmentId="marketing",
        description="Starter Marketing room with manager zone, employee zone, walls, floor footprint, and campaign boards.",
        assets=[
            OfficeMapAssetCreate(
                departmentId=asset.departmentId,
                src=asset.src,
                label=asset.label,
                kind=asset.kind,
                grid=asset.grid,
                x=asset.x,
                y=asset.y,
                width=asset.width,
                z=asset.z,
                rotationX=asset.rotationX,
                rotationY=asset.rotationY,
                rotation=asset.rotation,
                flipX=asset.flipX,
                blocksMovement=asset.blocksMovement,
                requiresFloor=asset.requiresFloor,
                footprint=asset.footprint,
            )
            for asset in STARTER_MARKETING_ASSETS
        ],
        sockets=["frontLeft", "frontRight", "backWall", "openDeskSocket"],
    ),
    MapPreset(
        id="employee-seat-1",
        name="Employee Seat",
        departmentId="shared",
        description="Small expansion kit: floor extension, workstation, deterministic prop, and agent spawn slot.",
        assets=[
            OfficeMapAssetCreate(departmentId="marketing", src="tiles/floor-tile-2x2.png", label="Tile: Floor Patch 2x2", kind="floor", grid=GridCoord(col=0, row=0), x=0, y=0, width=160, z=60),
            OfficeMapAssetCreate(departmentId="marketing", src="furniture/content-desk.png", label="Furniture: Content Desk", kind="furniture", grid=GridCoord(col=0, row=0), x=0, y=0, width=196, z=65, blocksMovement=True, requiresFloor=True),
            OfficeMapAssetCreate(departmentId="marketing", src="props/laptop.png", label="Prop: Laptop", kind="prop", grid=GridCoord(col=0, row=0), x=0, y=0, width=92, z=66, requiresFloor=True),
        ],
        sockets=["deskSurface", "agentSpawn", "frontRight"],
    ),
]
