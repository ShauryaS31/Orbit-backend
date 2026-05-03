/**
 * Phase 2E — Company LinkedIn style playbooks (Markdown) as source of truth for image prompts.
 */

import { readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";

import { DEFAULT_OPENAI_IMAGE_MODEL } from "@/lib/services/image-generator";
import { extractRiskyNumericClaims } from "@/lib/services/linkedin-card-renderer";
import type { LinkedInChannelIntelligence, WorkflowState } from "@/lib/types/orbit";

export const HEIDI_LINKEDIN_PLAYBOOK_RELATIVE = "src/lib/channel-playbooks/heidi-linkedin.md";
export const RELEVANCE_AI_LINKEDIN_PLAYBOOK_RELATIVE = "src/lib/channel-playbooks/relevance-ai-linkedin.md";

/** Matches `HEIDI_AI_LINKEDIN_PLAYBOOK_ID` / `RELEVANCE_AI_LINKEDIN_PLAYBOOK_ID` without importing channel-intelligence (avoid cycles). */
export const LINKEDIN_PLAYBOOK_PROFILE = {
  heidi: "heidi_linkedin_playbook_v1",
  relevance: "relevance_ai_linkedin_playbook_v1",
} as const;

export type CompanyLinkedInPlaybook = {
  profile_id: string;
  company_name: string;
  playbook_markdown_path: string;
  markdown: string;
  playbook_summary: string;
  image_prompt_contract: string;
};

const playbookDir = () => path.join(process.cwd(), "src", "lib", "channel-playbooks");

const mdCache = new Map<string, string>();

export async function readPlaybookFile(relativePathFromRepoRoot: string): Promise<string> {
  const full = path.join(
    /* turbopackIgnore: true */ process.cwd(),
    ...relativePathFromRepoRoot.split("/"),
  );
  const hit = mdCache.get(full);
  if (hit) return hit;
  const text = await readFile(full, "utf-8");
  mdCache.set(full, text);
  return text;
}

function readPlaybookFileSync(relativePathFromRepoRoot: string): string {
  const full = path.join(
    /* turbopackIgnore: true */ process.cwd(),
    ...relativePathFromRepoRoot.split("/"),
  );
  const hit = mdCache.get(full);
  if (hit) return hit;
  const text = readFileSync(full, "utf-8");
  mdCache.set(full, text);
  return text;
}

export function getPlaybookMarkdown(profileId: string): string {
  switch (profileId) {
    case LINKEDIN_PLAYBOOK_PROFILE.heidi:
      return readPlaybookFileSync(HEIDI_LINKEDIN_PLAYBOOK_RELATIVE);
    case LINKEDIN_PLAYBOOK_PROFILE.relevance:
      return readPlaybookFileSync(RELEVANCE_AI_LINKEDIN_PLAYBOOK_RELATIVE);
    default:
      return "";
  }
}

export function summarizePlaybookForPrompt(markdown: string, maxChars = 6000): string {
  const t = markdown.trim();
  if (t.length <= maxChars) return t;
  return `${t.slice(0, maxChars).trim()}\n\n[Playbook truncated for prompt length]`;
}

export function extractPlaybookRules(markdown: string): {
  avoidLines: string[];
  goodDirections: string[];
  badDirections: string[];
} {
  const avoid = extractSectionBullets(markdown, "## 9. What To Avoid", "## 10.");
  const good = extractSectionBullets(markdown, "## 10. Good Visual Directions", "## 11.");
  const bad = extractSectionBullets(markdown, "## 11. Bad Visual Directions", "## 12.");
  return { avoidLines: avoid, goodDirections: good, badDirections: bad };
}

function extractSectionBullets(md: string, start: string, end: string): string[] {
  const i0 = md.indexOf(start);
  if (i0 < 0) return [];
  const i1 = md.indexOf(end, i0 + start.length);
  const slice = i1 > 0 ? md.slice(i0, i1) : md.slice(i0);
  return slice
    .split("\n")
    .map((l) => l.replace(/^[-*]\s*/, "").trim())
    .filter((l) => l.length > 3 && !l.startsWith("#"));
}

export function extractImagePromptContractSection(markdown: string): string {
  const m = markdown.match(/## 12\. Image Prompt Contract[\s\S]*?(?=\n## 13\.|$)/i);
  return m ? m[0].trim() : "";
}

export async function loadCompanyLinkedInPlaybook(
  companyName: string,
  companyUrl: string,
): Promise<CompanyLinkedInPlaybook | null> {
  const name = companyName.trim().toLowerCase();
  const url = companyUrl.trim().toLowerCase();
  if (name.includes("heidi") || url.includes("heidihealth")) {
    const markdown = await readPlaybookFile(HEIDI_LINKEDIN_PLAYBOOK_RELATIVE);
    return {
      profile_id: LINKEDIN_PLAYBOOK_PROFILE.heidi,
      company_name: "Heidi",
      playbook_markdown_path: HEIDI_LINKEDIN_PLAYBOOK_RELATIVE,
      markdown,
      playbook_summary: summarizePlaybookForPrompt(markdown, 4000),
      image_prompt_contract: extractImagePromptContractSection(markdown),
    };
  }
  if (name.includes("relevance") || url.includes("relevanceai.com") || url.includes("relevance.ai")) {
    const markdown = await readPlaybookFile(RELEVANCE_AI_LINKEDIN_PLAYBOOK_RELATIVE);
    return {
      profile_id: LINKEDIN_PLAYBOOK_PROFILE.relevance,
      company_name: "Relevance AI",
      playbook_markdown_path: RELEVANCE_AI_LINKEDIN_PLAYBOOK_RELATIVE,
      markdown,
      playbook_summary: summarizePlaybookForPrompt(markdown, 4000),
      image_prompt_contract: extractImagePromptContractSection(markdown),
    };
  }
  return null;
}

/** Attach playbook paths + compact summary/contract to seeded LinkedIn intelligence (sync). */
export function enrichLinkedInIntelligenceWithPlaybook(li: LinkedInChannelIntelligence): LinkedInChannelIntelligence {
  if (li.profile_id === LINKEDIN_PLAYBOOK_PROFILE.heidi) {
    const md = getPlaybookMarkdown(li.profile_id);
    return {
      ...li,
      playbook_markdown_path: HEIDI_LINKEDIN_PLAYBOOK_RELATIVE,
      playbook_summary: summarizePlaybookForPrompt(md, 2500),
      image_prompt_contract: extractImagePromptContractSection(md),
    };
  }
  if (li.profile_id === LINKEDIN_PLAYBOOK_PROFILE.relevance) {
    const md = getPlaybookMarkdown(li.profile_id);
    return {
      ...li,
      playbook_markdown_path: RELEVANCE_AI_LINKEDIN_PLAYBOOK_RELATIVE,
      playbook_summary: summarizePlaybookForPrompt(md, 2500),
      image_prompt_contract: extractImagePromptContractSection(md),
    };
  }
  return li;
}

/** Phase 2E — `/report` telemetry for playbook-driven LinkedIn GPT images. */
export function computePhase2eLinkedInPlaybookTelemetry(workflow: WorkflowState): {
  renderModeEnv: string;
  playbookMarkdownPath: string;
  imageModelRequested: string;
  imageModelsUsed: string[];
  fallbackUsedCount: number;
  playbookDrivenAssetCount: number;
  deterministicLinkedInAssetCount: number;
  otherOpenAiLinkedInCount: number;
  playbookViolationPromptHints: number;
  unsupportedNumericVisibleTokenCount: number;
} {
  const renderModeEnv = process.env.ORBIT_LINKEDIN_VISUAL_RENDER_MODE ?? "deterministic";
  const imageModelRequested = process.env.OPENAI_IMAGE_MODEL ?? DEFAULT_OPENAI_IMAGE_MODEL;
  const li = workflow.channel_intelligence?.linkedin;
  const playbookMarkdownPath = li?.playbook_markdown_path ?? "—";

  const assets = workflow.generated_campaign_assets ?? [];
  const models = new Set<string>();
  let fallbackUsedCount = 0;
  let playbookDrivenAssetCount = 0;
  let deterministicLinkedInAssetCount = 0;
  let otherOpenAiLinkedInCount = 0;
  let playbookViolationPromptHints = 0;
  let unsupportedNumericVisibleTokenCount = 0;

  for (const a of assets) {
    if (a.platform !== "linkedin") continue;
    if (a.openai_image_model_used) models.add(a.openai_image_model_used);
    if (a.openai_image_fallback_used) fallbackUsedCount += 1;
    if (a.playbook_driven && a.rendering_method === "openai_image") {
      playbookDrivenAssetCount += 1;
      if (/\blong\s+paragraph|wall\s+of\s+text|multiple\s+paragraphs/i.test(a.prompt)) {
        playbookViolationPromptHints += 1;
      }
      if (a.visible_text_contract) {
        unsupportedNumericVisibleTokenCount += extractRiskyNumericClaims(a.visible_text_contract).length;
      }
    } else if (a.rendering_method === "deterministic_svg_template") {
      deterministicLinkedInAssetCount += 1;
    } else if (a.rendering_method === "openai_image") {
      otherOpenAiLinkedInCount += 1;
    }
  }

  return {
    renderModeEnv,
    playbookMarkdownPath,
    imageModelRequested,
    imageModelsUsed: [...models],
    fallbackUsedCount,
    playbookDrivenAssetCount,
    deterministicLinkedInAssetCount,
    otherOpenAiLinkedInCount,
    playbookViolationPromptHints,
    unsupportedNumericVisibleTokenCount,
  };
}
