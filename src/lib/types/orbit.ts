export type WorkflowStatus =
  | "pending"
  | "needs_validation"
  | "running"
  | "needs_review"
  | "completed"
  | "failed";

export type AgentRole =
  | "orchestrator"
  | "researcher"
  | "strategist"
  | "copywriter"
  | "designer"
  | "analyst"
  | "system"
  | "marketing_manager"
  | "content_specialist"
  | "visual_agent"
  | "carousel_specialist";

/** Consultant Mode UI labels - internal `AgentRole` values are unchanged. */
export interface AgentUiDisplay {
  display_name: "Nova" | "Scott";
  display_role: string;
}

export const AGENT_UI_DISPLAY: Partial<Record<AgentRole, AgentUiDisplay>> = {
  researcher: { display_name: "Nova", display_role: "Brand Research Intern" },
  marketing_manager: { display_name: "Scott", display_role: "Marketing Manager" },
};

/** Surfaced in UI copy as specialist capabilities Scott delegates ("Manager-owned tools"). */
export const SCOTT_OWNED_SKILL_ROLES: readonly AgentRole[] = [
  "content_specialist",
  "visual_agent",
  "carousel_specialist",
  "copywriter",
  "analyst",
];

export function getAgentUiDisplay(role: AgentRole): AgentUiDisplay | undefined {
  return AGENT_UI_DISPLAY[role];
}

export function isScottOwnedSkillRole(role: AgentRole): boolean {
  return SCOTT_OWNED_SKILL_ROLES.includes(role);
}

/** Maps persisted governance `agent_id` strings to Nova vs Scott for demos and `/report`. */
export function governancePersonaDisplayName(agentId: string): "Nova" | "Scott" {
  return agentId === "researcher" ? "Nova" : "Scott";
}

/** Discovery-phase contract for Consultant Mode UI (review Nova before Scott strategies). */
export const NOVAS_RESEARCH_REPORT_TITLE = "Nova's Research Report" as const;

export interface ConsultantDiscoveryMetadata {
  /** Default label: {@link NOVAS_RESEARCH_REPORT_TITLE}. */
  research_report_title: string;
}

export type WorkflowStepId =
  | "request_received"
  | "website_intelligence_gathered"
  | "validation_completed"
  | "brand_profile_loaded"
  | "marketing_context_built"
  | "campaign_draft_generated"
  | "visual_assets_generated"
  | "campaign_package_ready"
  | "social_deployed"
  | "workflow_ready";

export interface CardConfig {
  headline: string;
  subheadline: string;
  logo_placement: "top-left" | "top-right" | "bottom-left" | "bottom-right" | "center";
  brand_color_overlay: string;
}

export type DraftStatus =
  | "pending_review"
  | "approved"
  | "rejected"
  | "revision_requested"
  | "scheduled"
  | "published"
  | "sent";

export type ManagerContentIssueType =
  | "too_close_to_reference"
  | "generic_copy"
  | "unsupported_claim"
  | "wrong_channel_voice"
  | "weak_cta"
  | "repetitive"
  | "reference_summary_not_synthesis"
  | "incomplete_email_draft"
  | "weak_channel_format"
  | "trend_context_ignored";

/** How tightly draft copy may mirror dossier language (Phase 7 — evidence-led synthesis). */
export type ReferenceUsagePolicy = "evidence_only" | "direct_quote_approved" | "unknown";

/** Structured outbound email fields stored under draft meta for QA and exports. */
export interface DraftEmailStructuredParts {
  greeting: string;
  body: string;
  proof_point: string;
  signoff: string;
  full_email: string;
}

export interface ManagerContentIssue {
  type: ManagerContentIssueType;
  severity: "low" | "medium" | "high";
  note: string;
}

/** Scott-owned deterministic content QA attached to each draft after generation (Phase 3 guardrail). */
export interface ManagerContentReview {
  draftId: string;
  reviewerAgentId: "scott";
  reviewerDisplayName: "Scott";
  reviewedAgentId: string;
  reviewedDisplayName?: string;
  decision: "approve" | "revise";
  score: number;
  issues: ManagerContentIssue[];
  revisionInstruction?: string;
  reviewedAt: string;
}

/** Phase 7B — visible manager-worker critique aligned to `manager_review` (no extra regeneration loops). */
export type ManagerCritiqueSeverity = "note" | "pushback" | "blocker";

export type ManagerCritiqueReasonCode =
  | "too_close_to_reference"
  | "missing_synthesis"
  | "generic_channel_fit"
  | "incomplete_asset"
  | "weak_cta"
  | "unsupported_claim"
  | "repetitive"
  | "visual_too_generic"
  | "needs_more_research";

export interface ManagerCritique {
  id: string;
  draftId?: string;
  targetAgentId: string;
  targetAgentDisplayName?: string;
  managerAgentId: "scott";
  managerDisplayName: "Scott";
  severity: ManagerCritiqueSeverity;
  stance: "approve" | "challenge" | "oppose" | "block";
  critique: string;
  requestedAction?: string;
  reasonCodes: ManagerCritiqueReasonCode[];
  linkedReviewScore?: number;
  linkedReviewDecision?: "approve" | "revise";
  createdAt: string;
}

export type TrendScoutStatus =
  | "skipped"
  | "skipped_missing_key"
  | "searched"
  | "failed";

export interface TrendSource {
  title?: string;
  url: string;
  domain?: string;
  snippet?: string;
}

export interface TrendInsight {
  id: string;
  trend: string;
  implication: string;
  recommended_angle: string;
  confidence: number;
  sources: TrendSource[];
}

export interface TrendScoutResult {
  status: TrendScoutStatus;
  enabled: boolean;
  model?: string;
  generated_at: string;
  query_set: string[];
  insights: TrendInsight[];
  sources: TrendSource[];
  notes?: string[];
  error_summary?: string;
}

export interface MarketingWorkOrderRequest {
  id?: string;
  title?: string;
  department?: "marketing";
  manager_agent_id?: string;
  output_type?: "campaign_package" | "customer_email" | string;
  autonomy?: string;
  approval_required?: boolean;
}

export interface MarketingAgentRosterItem {
  id: string;
  name: string;
  role: "manager" | "employee";
  model?: string;
  tools?: string[];
  autonomy?: number;
  enabled?: boolean;
}

/** Audit trail entry for goal-driven orchestration and governance exports. */
export interface GovernanceAuditEntry {
  agent_id: string;
  /** Demo-facing persona label (derived from `agent_id`; Nova = researcher pipeline, Scott = orchestration). */
  display_agent_name?: "Nova" | "Scott";
  step_id: string;
  decision: string;
  rationale: string;
  source_url?: string;
  timestamp: string;
  resulting_asset?: string;
}

export interface DraftMetadata {
  id: string;
  day: number;
  status: DraftStatus;
  /** Human operator approval gate. Scott's QA can approve internally while this remains pending. */
  operator_status?: "pending" | "approved" | "rejected";
  operator_reviewed_at?: string;
  operator_reviewer?: string;
  channel: "instagram" | "linkedin" | "email";
  original_prompt: string;
  /** How this draft ladders to `WorkflowState.success_metric` / business goals. */
  strategic_intent?: string;
  /** Diversity system label to reduce repetitive cross-channel content. */
  content_angle?: string;
  /** Concrete evidence point used to ground this draft (Lyra cache or live proof). */
  source_anchor?: string;
  /** Which buyer objection this draft resolves. */
  buyer_objection?: string;
  /** Channel-specific intent for this draft (proof-led, narrative-led, conversion-led). */
  channel_strategy?: string;
  /** CTA language style to avoid repeating the same phrasing. */
  cta_style?: string;
  /** Detailed visual prompt payload for creative rendering and QA. */
  image_prompt_detailed?: string;
  /** Negative prompt guardrails for visuals. */
  negative_prompt?: string;
  /** Source anchor used to inform visual treatment. */
  visual_source_anchor?: string;
  /** Visual style direction for generator and reviewer alignment. */
  visual_style_notes?: string;
  /** Instagram-specific hook line. */
  hook?: string;
  /** Instagram/story visual concept summary. */
  visual_concept?: string;
  /** Optional sequence for story/reel style narrative frames. */
  story_frame_sequence?: string[];
  /** Optional explicit CTA copy used in post caption/body. */
  cta_text?: string;
  /** True when draft was produced by Carousel Maker (10-slide brand-led editorial expert pass). */
  carousel_expert_mode?: boolean;
  reviewer_note?: string;
  /** True once content has gone live via orchestrator (immediate publish path). */
  is_published: boolean;
  /** ISO timestamp when the post was scheduled or published. */
  scheduled_at?: string;
  /** Target social platform used at publish time (may differ from draft channel during sandbox demos). */
  publish_platform?: "instagram" | "linkedin" | "facebook" | "tiktok";
  deployment_post_id?: string;
  gmail_message_id?: string;
  gmail_thread_id?: string;
  sent_to?: string;
  sent_at?: string;
  /** Manager content QA — does not replace human approve/regenerate APIs. */
  manager_review?: ManagerContentReview;

  /** Phase 7B — Scott critique narrative aligned to `manager_review`. */
  manager_critique?: ManagerCritique;

  /** Phase 7 — factual extraction from evidence (not pasted prose). */
  extracted_fact?: string;
  /** Phase 7 — inferred thesis operators argue. */
  strategic_insight?: string;
  /** Phase 7 — creative stance / headline thesis (distinct from diversity `content_angle` labels). */
  campaign_angle?: string;
  /** Phase 7 — structural intent (`linkedin_*`, email sequence label, carousel arc). */
  channel_format?: string;
  /** Phase 7 — guardrail notes on originality / synthesis expectations. */
  originality_notes?: string;
  reference_usage_policy?: ReferenceUsagePolicy;

  /** Phase 7 — usable outbound email decomposition + assembled message. */
  email_detail?: DraftEmailStructuredParts;
  /** Optional trend context applied by Nova Trend Scout (Phase 7D). */
  trend_insight_id?: string;
  trend_angle?: string;
  trend_sources?: TrendSource[];
  trend_selection_reason?: string;
}

export interface WebsiteIntelligence {
  website_url: string;
  company_name: string;
  domain: string;
  industry: string;
  audience_summary: string;
  key_value_propositions: string[];
  product_offerings: string[];
  seo_keywords: string[];
  social_proof: string[];
  differentiators: string[];
  discovered_pages?: Array<{
    path: string;
    title: string;
    headings: string[];
    key_paragraphs: string[];
  }>;
  visual_signals?: {
    theme_color?: string;
    discovered_hex_codes: string[];
    style_color_samples: string[];
    favicon_url?: string;
  };
}

export interface CompanyIntelligenceValidation {
  /** Aggregated discovery confidence on a 0-100 scale (Consultant Mode index). */
  confidence_score: number;
  confidence_levels?: {
    company_name: "high" | "medium" | "low";
    mission: "high" | "medium" | "low";
    audience: "high" | "medium" | "low";
  };
  validated_fields: string[];
  missing_fields: string[];
  warnings: string[];
  review_questions?: string[];
  reviewer_notes: string;
  /** Two concise sentences explaining why the inferred HEX palette fits this brand's surface hierarchy. */
  visual_palette_rationale?: string;
  /** 3-5 adjectives capturing perceived brand voice from positioning + audience signals. */
  brand_voice_descriptors?: string[];
  brand_palette?: {
    primary: string;
    secondary: string;
    accent: string;
    rationale: string;
  };
}

export interface BrandKit {
  brand_name: string;
  primary_hex: string;
  secondary_hex: string;
  accent_hex: string;
  neutral_hex: string;
  typography: {
    heading_font: string;
    body_font: string;
  };
  tone_of_voice: string[];
}

/** Claude-style structured brand UI tokens ("AI Design Studio") - generated via researcher.generateDesignSystem. */
export interface BrandDesignSystem {
  primary_palette: Array<{ hex: string; label?: string }>;
  secondary_palette: Array<{ hex: string; label?: string }>;
  typography: {
    heading_font: string;
    body_font: string;
    font_source: "google_fonts";
  };
  spacing_scale: {
    base_px: 4;
    steps: number[];
  };
  border_radius_scale: Record<string, string>;
  buttons: {
    primary: string;
    secondary: string;
    ghost: string;
  };
  sample_card_component: string;
  mood_vibe: [string, string, string];
}

export interface VisualIdentity {
  visual_tone: string;
  design_patterns: string[];
  typography_vibes: string[];
  color_usage: string;
  style_description: string;
}

export interface ProductMarketingContext {
  mission_statement: string;
  product_summary: string;
  target_personas: string[];
  pains_solved: string[];
  messaging_pillars: string[];
  launch_goals: string[];
  primary_cta: string;
  sop_focus: string[];
  preferred_channels: string[];
}

export interface ActivityLog {
  id: string;
  workflow_id: string;
  created_at: string;
  role: AgentRole;
  step_id: WorkflowStepId;
  message: string;
  metadata?: Record<string, unknown>;
}

/** Completion cues derived from activity_logs step_ids + message text (Phase 6 shared contract). */
export interface ManagerWorkflowCompletionSignals {
  step_ids: WorkflowStepId[];
  log_patterns?: string[];
}

export interface ManagerWorkflowStep {
  id: string;
  label: string;
  owner_agent_id: string;
  owner_display_name: string;
  owner_role: "manager" | "employee" | "skill";
  summary: string;
  expected_output: string;
  depends_on: string[];
  completion_step_ids: WorkflowStepId[];
  completion_log_patterns?: string[];
  /** Mirrors completion_* fields for API clarity — same arrays as completion_step_ids / completion_log_patterns. */
  completion_signals?: ManagerWorkflowCompletionSignals;
}

export interface ManagerSummaryReportOutput {
  draft_id: string;
  title: string;
  channel: string;
  assigned_agent_id: string;
  assigned_agent_name: string;
  decision: "approve" | "revise" | "blocked" | "pending";
  score?: number;
  output_summary: string;
  manager_review_summary: string;
}

export interface ManagerSummaryReport {
  schema_version: "manager_summary_report.v1";
  generated_at: string;
  workflow_id: string;
  work_order_id?: string;
  manager_agent_id: string;
  manager_agent_name: string;
  company_name: string;
  task_summary: string;
  delegation_summary: string;
  sub_agent_return_summary: string;
  manager_review_summary: string;
  final_status_summary: string;
  outputs: ManagerSummaryReportOutput[];
  source_log_ids: string[];
}

export interface CampaignEmailDraft {
  meta: DraftMetadata;
  type: "email";
  subject_line: string;
  preview_text: string;
  body_markdown: string;
  call_to_action: string;
  card_config: CardConfig;
}

export interface CarouselLayoutConfig {
  /** Editorial photo-real campaign default; legacy neon preset retained for decoded older payloads. */
  theme: "editorial_photo_real" | "canva-killer-dark";
  accent: "brand_palette_led" | "neon-red-blue";
  text_effect: "clean_typography" | "glowing";
}

/** Design-first slide contract for GPT-image-2-class generators and UI overlays. */
export interface DesignArtifact {
  headline: string;
  body: string;
  visual_prompt: string;
  layout_config: CarouselLayoutConfig;
}

export interface CampaignCarouselSlide {
  headline: string;
  supporting_copy: string;
  visual_direction: string;
  visual_prompt?: string;
  design_artifact?: DesignArtifact;
}

export interface CampaignCarouselDraft {
  meta: DraftMetadata;
  type: "carousel";
  platform: "linkedin" | "instagram";
  slides: CampaignCarouselSlide[];
  caption: string;
  primary_hashtags: string[];
  card_config: CardConfig;
  /** Production-oriented React/Tailwind artifact produced by Design Artifact Skill (carousel Days). */
  studio_react_export?: string;
}

export interface CampaignLinkedInPostDraft {
  meta: DraftMetadata;
  type: "linkedin_post";
  headline: string;
  body: string;
  card_config: CardConfig;
}

export interface GeneratedCampaignAsset {
  id: string;
  draft_type: CampaignExecutionDraft["type"];
  platform: "instagram" | "linkedin" | "email";
  day: 1 | 3 | 5;
  prompt: string;
  image_prompt_detailed?: string;
  negative_prompt?: string;
  visual_source_anchor?: string;
  visual_style_notes?: string;
  image_url: string;
  created_at: string;
}

export interface LyraWarmIntelligence {
  cache_label: string;
  cache_source: string;
  core_positioning: string;
  buyer_belief: string;
  audience_segments: string[];
  proof_points: string[];
  content_angles: string[];
  brand_voice: string[];
  visual_motifs: string[];
  avoid_list: string[];
  source_anchors: string[];
}

export type CampaignExecutionDraft =
  | CampaignEmailDraft
  | CampaignCarouselDraft
  | CampaignLinkedInPostDraft;

export interface WorkflowState {
  id: string;
  created_at: string;
  updated_at: string;
  status: WorkflowStatus;
  company_url: string;
  demo_mode: boolean;
  /** Original operator work-order envelope; Scott infers execution steps from this and the objective. */
  work_order?: MarketingWorkOrderRequest;
  /** Operator-configured visible agent roster used for manager delegation. */
  agent_roster?: MarketingAgentRosterItem[];
  /** North-star outcome for orchestration (e.g. investor meetings booked). */
  business_goal?: string;
  /** Measurable outcome the Manager drafts against (optional). */
  success_metric?: string;
  /** Founder-supplied corrections; blended during execution before drafts (human overrides crawl where noted). */
  brand_learning_notes?: string[];
  /** Append-only governance trail for audits and `/report`. */
  governance_log?: GovernanceAuditEntry[];
  /** Consultant Mode - discovery framing so founders review Nova before Scott executes strategy. */
  consultant_discovery?: ConsultantDiscoveryMetadata;
  /** Stable skill IDs last chosen by Marketing Manager (goal-driven orchestration). */
  selected_skills?: string[];
  /** Manager-authored plan for UI workflow progress. */
  manager_workflow_steps?: ManagerWorkflowStep[];
  /** Manager-authored durable memory summary for Consultant Mode and operator review. */
  manager_summary_report?: ManagerSummaryReport;
  /** Optional structured warm cache used in demo mode for known company profiles. */
  lyra_warm_intelligence?: LyraWarmIntelligence;
  /** When true, campaign generation runs-design-first expert carousel (10 slides) instead of generalist 7-day mix. */
  carousel_maker_mode?: boolean;
  website_intelligence?: WebsiteIntelligence;
  intelligence_validation?: CompanyIntelligenceValidation;
  brand_kit?: BrandKit;
  visual_identity?: VisualIdentity;
  product_marketing_context?: ProductMarketingContext;
  /** Structured tokens locked before Marketing Manager drafts (AI Design Studio). */
  design_system?: BrandDesignSystem;
  /** Additional React/Tailwind bundles keyed by canonical Claude Design Guide SOPs. */
  design_studio_exports?: {
    linkedin_carousel_tsx: string;
    instagram_story_tsx: string;
    pitch_deck_tsx: string;
  };
  campaign_execution_drafts: CampaignExecutionDraft[];
  generated_campaign_assets: GeneratedCampaignAsset[];
  activity_logs: ActivityLog[];
  /** Final manager review payload per draft (mirrors draft.meta.manager_review for audit exports). */
  manager_content_reviews?: ManagerContentReview[];
  /** Phase 7B — aggregated Scott critiques (same order as reviews / drafts after QA). */
  manager_critiques?: ManagerCritique[];
  /** Phase 7D — optional public-web trend enrichment (env gated; workflow remains resilient if skipped/failed). */
  trend_intelligence?: TrendScoutResult;
  error_message?: string;
}
