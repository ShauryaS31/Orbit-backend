import { NextResponse } from "next/server";

import { workflowStore } from "@/lib/state/workflow-store";
import {
  governancePersonaDisplayName,
  NOVAS_RESEARCH_REPORT_TITLE,
  type ManagerContentReview,
} from "@/lib/types/orbit";

interface RouteParams {
  params: Promise<{
    id: string;
  }>;
}

export async function GET(_request: Request, context: RouteParams) {
  const params = await context.params;
  const workflow = workflowStore.getWorkflow(params.id);
  if (!workflow) {
    return NextResponse.json({ error: "Workflow not found." }, { status: 404 });
  }

  const markdown = buildReportMarkdown(workflow);
  return new Response(markdown, {
    status: 200,
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
    },
  });
}

function buildReportMarkdown(workflow: NonNullable<ReturnType<typeof workflowStore.getWorkflow>>): string {
  const company = workflow.website_intelligence?.company_name ?? "Unknown Company";
  const mission = workflow.product_marketing_context?.mission_statement ?? "-";
  const audience = workflow.website_intelligence?.audience_summary ?? "-";
  const tone = workflow.brand_kit?.tone_of_voice.join(", ") ?? "-";
  const sopFocus = workflow.product_marketing_context?.sop_focus.join(", ") ?? "-";
  const iv = workflow.intelligence_validation;
  const confidencePct =
    typeof iv?.confidence_score === "number" ? Math.round(iv.confidence_score) : null;
  const palette = iv?.brand_palette ?? {
    primary: workflow.brand_kit?.primary_hex,
    secondary: workflow.brand_kit?.secondary_hex,
    accent: workflow.brand_kit?.accent_hex,
    rationale: undefined as string | undefined,
  };
  const voiceDescriptors =
    iv?.brand_voice_descriptors?.length ?
      iv.brand_voice_descriptors.join(", ")
    : workflow.brand_kit?.tone_of_voice.join(", ") ?? "-";
  const visualSignals = workflow.website_intelligence?.visual_signals;
  const visualIdentity = workflow.visual_identity;

  const strategicBlockquote =
    `Orbit interprets **${company}** as pursuing "${mission.slice(0, 220)}${mission.length > 220 ? "..." : ""}" ` +
    `with primary traction among audiences summarized as: ${audience.slice(0, 280)}${audience.length > 280 ? "..." : ""} ` +
    `Messaging emphasis should reinforce **${sopFocus}** while sustaining voice cues aligned to **${voiceDescriptors}**.`;

  const calendarRows = workflow.campaign_execution_drafts
    .slice()
    .sort((a, b) => a.meta.day - b.meta.day)
    .map((draft) => {
      const headline =
        draft.type === "carousel" ?
          draft.slides[0]?.design_artifact?.headline ?? draft.slides[0]?.headline ?? "Carousel"
        : draft.type === "linkedin_post" ?
          draft.headline
        : draft.subject_line;
      return `| Day ${draft.meta.day} | ${draft.meta.channel} | ${draft.meta.status} | ${escapePipes(headline)} |`;
    })
    .join("\n");

  const assets =
    workflow.generated_campaign_assets.length > 0 ?
      workflow.generated_campaign_assets
        .map(
          (asset) =>
            `- **Day ${asset.day}** (${asset.platform}): [open asset](${asset.image_url})` +
            ` — anchor: ${asset.visual_source_anchor ?? "n/a"}`,
        )
        .join("\n")
    : "_No generated visuals attached yet._";
  const warmAnchors =
    workflow.lyra_warm_intelligence?.source_anchors?.length ?
      workflow.lyra_warm_intelligence.source_anchors.map((anchor) => `- ${anchor}`).join("\n")
    : "_No warm proof anchors attached._";
  const diversityRows = workflow.campaign_execution_drafts
    .slice()
    .sort((a, b) => a.meta.day - b.meta.day)
    .map(
      (draft) =>
        `| Day ${draft.meta.day} | ${draft.meta.channel} | ${escapePipes(draft.meta.content_angle ?? "-")} | ${escapePipes(draft.meta.source_anchor ?? "-")} | ${escapePipes(draft.meta.buyer_objection ?? "-")} | ${escapePipes(draft.meta.channel_strategy ?? "-")} | ${escapePipes(draft.meta.cta_style ?? "-")} |`,
    )
    .join("\n");
  const creativeIntelRows = workflow.campaign_execution_drafts
    .slice()
    .sort((a, b) => a.meta.day - b.meta.day)
    .map((draft) => {
      const m = draft.meta;
      const notes = m.originality_notes ?? "-";
      const notesTrim = notes.length > 240 ? `${notes.slice(0, 237)}…` : notes;
      return `| Day ${draft.meta.day} | ${draft.meta.channel} | ${escapePipes(m.source_anchor ?? "-")} | ${escapePipes(m.extracted_fact ?? "-")} | ${escapePipes(m.strategic_insight ?? "-")} | ${escapePipes(m.campaign_angle ?? "-")} | ${escapePipes(m.channel_format ?? "-")} | ${escapePipes(notesTrim)} |`;
    })
    .join("\n");
  const visualRationaleRows = workflow.generated_campaign_assets
    .map(
      (asset) =>
        `| Day ${asset.day} | ${asset.platform} | ${escapePipes(asset.visual_source_anchor ?? "-")} | ${escapePipes(asset.visual_style_notes ?? "-")} | ${escapePipes(asset.negative_prompt ?? "-")} |`,
    )
    .join("\n");

  const deploymentRows = workflow.campaign_execution_drafts
    .slice()
    .sort((a, b) => a.meta.day - b.meta.day)
    .filter(
      (d) =>
        d.meta.scheduled_at ||
        d.meta.publish_platform ||
        d.meta.deployment_post_id ||
        d.meta.status === "scheduled" ||
        d.meta.status === "published",
    )
    .map((draft) => {
      const headline =
        draft.type === "carousel" ?
          draft.slides[0]?.design_artifact?.headline ?? draft.slides[0]?.headline ?? "Carousel"
        : draft.type === "linkedin_post" ?
          draft.headline
        : draft.subject_line;
      const platform = draft.meta.publish_platform ?? "-";
      const postId = draft.meta.deployment_post_id ?? "-";
      const when = draft.meta.scheduled_at ?? "-";
      const pub =
        draft.meta.is_published === true ? "Live"
        : draft.meta.status === "scheduled" ? "Queued"
        : "-";
      return `| Day ${draft.meta.day} | ${draft.meta.channel} | ${escapePipes(platform)} | ${draft.meta.status} | ${escapePipes(pub)} | ${escapePipes(when)} | ${escapePipes(postId)} | ${escapePipes(headline)} |`;
    })
    .join("\n");

  const checklistRows = [1, 2, 3, 4, 5, 6, 7]
    .map((day) => {
      const draft = workflow.campaign_execution_drafts.find((item) => item.meta.day === day);
      const channel = draft?.meta.channel ?? "pending";
      const action =
        draft ?
          draft.meta.status === "approved" ||
          draft.meta.status === "scheduled" ||
          draft.meta.status === "published" ?
            "Approve creative -> Schedule via Orbit publish API"
          : draft.meta.status === "revision_requested" ?
            "Address reviewer notes -> Request regeneration"
          : "Review draft -> Approve or request revision"
        : "Await draft generation";
      const checked =
        draft?.meta.status === "approved" ||
        draft?.meta.status === "scheduled" ||
        draft?.meta.status === "published" ?
          "[x]"
        : "[ ]";
      const label =
        draft ?
          `${draft.meta.channel} - ${draft.meta.status}`
        : "draft not generated";
      return `| Day ${day} | ${channel} | ${escapePipes(action)} | ${checked} | ${escapePipes(label)} |`;
    })
    .join("\n");

  const researchReportTitle =
    workflow.consultant_discovery?.research_report_title ?? NOVAS_RESEARCH_REPORT_TITLE;

  const govTable =
    (workflow.governance_log?.length ?? 0) === 0 ?
      "_No governance entries recorded yet._"
    : [
        "| Persona | Agent id | Step | Decision | Rationale | Resulting asset | Timestamp | Source |",
        "| --- | --- | --- | --- | --- | --- | --- | --- |",
        ...(workflow.governance_log ?? []).map((g) => {
          const persona =
            g.display_agent_name ?? governancePersonaDisplayName(g.agent_id);
          return `| ${escapePipes(persona)} | ${escapePipes(g.agent_id)} | ${escapePipes(g.step_id)} | ${escapePipes(g.decision)} | ${escapePipes(g.rationale)} | ${escapePipes(g.resulting_asset ?? "-")} | ${escapePipes(g.timestamp)} | ${escapePipes(g.source_url ?? "-")} |`;
        }),
      ].join("\n");

  const paletteRationaleBlock =
    iv?.visual_palette_rationale ?
      iv.visual_palette_rationale
    : palette?.rationale ??
      "Palette aligned to scraped signals and consultant inference where sampling was incomplete.";

  const sections = [
    `# Agency Audit - ${company}`,
    "",
    "---",
    "",
    "> **Executive snapshot:** Orbit synthesized discovery signals into an execution-ready narrative so founders can approve positioning before deployment.",
    "",
    "## Strategic Brand DNA",
    "",
    `### ${researchReportTitle}`,
    "",
    `_Consultant Mode:_ Discovery findings below are framed as **${researchReportTitle}** - founders review Nova before Scott executes strategy.`,
    "",
    "> **Consultant synthesis:**",
    "> ",
    ...strategicBlockquote.split("\n").map((line) => `> ${line}`),
    "",
    "### Premium discovery signals",
    "",
    "| Signal | Consultant reading |",
    "| --- | --- |",
    `| Confidence index | **${confidencePct ?? "-"}** / 100 (automated tier blend + site sampling depth) |`,
    `| Brand voice descriptors | ${escapePipes(voiceDescriptors)} |`,
    "",
    "### Palette rationale",
    "",
    "> " + paletteRationaleBlock.replace(/\n+/g, " "),
    "",
    "### HEX roster",
    "",
    "| Role | HEX | Notes |",
    "| --- | --- | --- |",
    `| Primary | ${palette.primary ?? "-"} | Dominant surfaces / hero treatments |`,
    `| Secondary | ${palette.secondary ?? "-"} | Editorial UI density & whitespace pairing |`,
    `| Accent | ${palette.accent ?? "-"} | Conversion emphasis & highlights |`,
    "",
    "---",
    "",
    "## Campaign operating picture",
    "",
    "| Field | Detail |",
    "| --- | --- |",
    `| Workflow ID | \`${workflow.id}\` |`,
    `| Source URL | ${workflow.company_url} |`,
    `| Pipeline status | **${workflow.status}** |`,
    "| Horizon | 7-day sequence - founder approvals gate automation |",
    "",
    "### Brand narrative anchors",
    "",
    `- **Mission anchor:** ${escapePipes(mission)}`,
    `- **Audience thesis:** ${escapePipes(audience)}`,
    `- **Tone guardrails:** ${escapePipes(tone)}`,
    `- **Execution pillars:** ${escapePipes(sopFocus)}`,
    "",
    "## Governance & Strategic Audit",
    "",
    "**Logic chain:** `[Business Goal]` -> `[Agent Decision]` -> `[Resulting Asset]`",
    "",
    "| Anchor | Value |",
    "| --- | --- |",
    `| Business goal | ${escapePipes(workflow.business_goal ?? "-")} |`,
    `| Success metric | ${escapePipes(workflow.success_metric ?? "-")} |`,
    "",
    govTable,
    "",
    "## Visual intelligence stack",
    "",
    "| Lens | Observation |",
    "| --- | --- |",
    `| Theme color hook | ${visualSignals?.theme_color ?? "Not surfaced"} |`,
    `| Favicon signal | ${visualSignals?.favicon_url ?? "Not discovered"} |`,
    `| Visual posture | ${visualIdentity?.visual_tone ?? "Pending enrichment"} |`,
    `| Spatial grammar | ${visualIdentity?.design_patterns.join("; ") ?? "-"} |`,
    `| Typography posture | ${visualIdentity?.typography_vibes.join("; ") ?? "-"} |`,
    "",
    "## Lyra Proof Anchors Used",
    "",
    warmAnchors,
    "",
    "## Content Diversity Map",
    "",
    "| Day | Channel | Content angle | Source anchor | Buyer objection | Channel strategy | CTA style |",
    "| --- | --- | --- | --- | --- | --- | --- |",
    diversityRows || "| - | - | - | - | - | - | - |",
    "",
    "## Creative Intelligence Upgrade",
    "",
    "_Phase 7 — reference material becomes evidence for an original thesis chain per draft._",
    "",
    "| Day | Channel | Source anchor | Extracted fact | Strategic insight | Campaign angle | Channel format | Originality notes |",
    "| --- | --- | --- | --- | --- | --- | --- | --- |",
    creativeIntelRows || "| - | - | - | - | - | - | - | - |",
    "",
    "## Visual Prompt Rationale",
    "",
    "| Day | Platform | Visual source anchor | Style notes | Negative prompt guardrail |",
    "| --- | --- | --- | --- | --- |",
    visualRationaleRows || "| - | - | - | - | - |",
    "",
    buildManagerReviewGuardrailSection(workflow),
    "---",
    "",
    "## 7-Day Campaign Calendar",
    "",
    "| Day | Channel | Draft status | Headline / subject |",
    "| --- | --- | --- | --- |",
    calendarRows || "| - | - | - | Drafts pending pipeline completion |",
    "",
    "## Generated visual assets",
    "",
    assets,
    "",
    "## Deployment status",
    "",
    "| Day | Channel | Target platform | Draft status | Ship state | Scheduled / deployed | Post ID | Asset headline |",
    "| --- | --- | --- | --- | --- | --- | --- | --- |",
    deploymentRows ||
      "| - | - | - | - | - | - | - | No deployments queued yet |",
    "",
    "---",
    "",
    "## 7-Day Deployment Checklist",
    "",
    "_Complete rows top-down - approvals unlock orchestrator scheduling._",
    "",
    "| Day | Channel | Required action | Done | Proof state |",
    "| --- | --- | --- | --- | --- |",
    checklistRows,
    "",
    "---",
    "",
    `_Generated ${new Date().toISOString()} - Orbit Consultant Mode export._`,
  ];

  return sections.join("\n");
}

function escapePipes(value: string): string {
  return value.replace(/\|/g, "\\|");
}

function buildManagerReviewGuardrailSection(
  workflow: NonNullable<ReturnType<typeof workflowStore.getWorkflow>>,
): string {
  const fromWorkflow = workflow.manager_content_reviews ?? [];
  const fromMeta = workflow.campaign_execution_drafts
    .map((d) => d.meta.manager_review)
    .filter((r): r is ManagerContentReview => Boolean(r));
  const list =
    fromWorkflow.length ? fromWorkflow
    : fromMeta.length ? fromMeta
    : [];

  if (list.length === 0) {
    return [
      "## Manager Review Guardrail",
      "",
      "_No manager content reviews recorded on this workflow yet._",
      "",
    ].join("\n");
  }

  const approved = list.filter((r) => r.decision === "approve").length;
  const revised = list.filter((r) => r.decision === "revise").length;
  const avg = list.reduce((s, r) => s + r.score, 0) / list.length;

  const sorted = [...list].sort((a, b) => {
    const da =
      workflow.campaign_execution_drafts.find((d) => d.meta.id === a.draftId)?.meta.day ?? 0;
    const db =
      workflow.campaign_execution_drafts.find((d) => d.meta.id === b.draftId)?.meta.day ?? 0;
    return da - db;
  });

  const rows = sorted
    .map((r) => {
      const draft = workflow.campaign_execution_drafts.find((d) => d.meta.id === r.draftId);
      const day = draft ? String(draft.meta.day) : "-";
      const channel = draft?.meta.channel ?? "-";
      const topTypes =
        r.issues.length ? r.issues.slice(0, 4).map((i) => i.type).join(", ") : "-";
      const revNote =
        r.revisionInstruction ?
          escapePipes(r.revisionInstruction.slice(0, 140)) + (r.revisionInstruction.length > 140 ? "…" : "")
        : "-";
      return `| ${day} | ${escapePipes(channel)} | ${r.decision} | ${r.score} | ${escapePipes(topTypes)} | ${revNote} |`;
    })
    .join("\n");

  return [
    "## Manager Review Guardrail",
    "",
    `- **Drafts reviewed:** ${list.length}`,
    `- **Approved:** ${approved}`,
    `- **Revise:** ${revised}`,
    `- **Average score:** ${avg.toFixed(1)}`,
    "",
    "| Day | Channel | Decision | Score | Top issue types | Revision instruction |",
    "| --- | --- | --- | --- | --- | --- |",
    rows,
    "",
  ].join("\n");
}
