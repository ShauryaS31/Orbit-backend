import OpenAI from "openai";

import type {
  LyraWarmIntelligence,
  TrendInsight,
  TrendScoutResult,
  TrendSource,
  WebsiteIntelligence,
} from "@/lib/types/orbit";

const TREND_SCOUT_ENABLED = process.env.ENABLE_TREND_SCOUT === "true";
const TREND_SCOUT_EXTERNAL_WEB_ACCESS = process.env.TREND_SCOUT_EXTERNAL_WEB_ACCESS !== "false";
const TREND_SCOUT_MODEL =
  process.env.OPENAI_TREND_MODEL ??
  process.env.OPENAI_MODEL ??
  "gpt-4.1-mini";
const TREND_SCOUT_MAX_QUERIES = clampMaxQueries(process.env.TREND_SCOUT_MAX_QUERIES);

interface RunTrendScoutInput {
  companyName: string;
  companyUrl: string;
  websiteIntelligence?: WebsiteIntelligence;
  businessGoal?: string;
  successMetric?: string;
  brandLearningNotes?: string[];
  lyraWarmIntelligence?: LyraWarmIntelligence;
}

interface ParsedTrendPayload {
  insights?: Array<{
    trend?: string;
    implication?: string;
    recommended_angle?: string;
    confidence?: number;
    sources?: TrendSource[];
  }>;
  notes?: string[];
}

export async function runTrendScout(input: RunTrendScoutInput): Promise<TrendScoutResult> {
  const base: Omit<TrendScoutResult, "status"> = {
    enabled: TREND_SCOUT_ENABLED,
    model: TREND_SCOUT_MODEL,
    generated_at: new Date().toISOString(),
    query_set: buildQuerySet(input),
    insights: [],
    sources: [],
    notes: [],
  };

  if (!TREND_SCOUT_ENABLED) {
    return {
      ...base,
      status: "skipped",
      notes: ["ENABLE_TREND_SCOUT is not true; skipped public web trend scout."],
    };
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return {
      ...base,
      status: "skipped_missing_key",
      notes: ["OPENAI_API_KEY missing; skipped public web trend scout safely."],
    };
  }

  if (!TREND_SCOUT_EXTERNAL_WEB_ACCESS) {
    return {
      ...base,
      status: "skipped",
      notes: ["TREND_SCOUT_EXTERNAL_WEB_ACCESS=false; skipped external web search."],
    };
  }

  try {
    const client = new OpenAI({ apiKey });
    const prompt = buildTrendPrompt(input, base.query_set);

    const response = await client.responses.create({
      model: TREND_SCOUT_MODEL,
      tools: [{ type: "web_search_preview" }],
      tool_choice: "auto",
      include: ["web_search_call.action.sources" as never],
      input: prompt,
    } as never);

    const textOutput = extractOutputText(response);
    const parsed = parseTrendPayload(textOutput);
    const fallbackSources = extractSourcesFromResponse(response);
    const insights = normalizeInsights(parsed.insights, fallbackSources, textOutput);
    const allSources = dedupeSources([
      ...fallbackSources,
      ...insights.flatMap((i) => i.sources),
    ]);

    return {
      ...base,
      status: "searched",
      insights,
      sources: allSources,
      notes: parsed.notes?.length ? parsed.notes : base.notes,
    };
  } catch (error) {
    return {
      ...base,
      status: "failed",
      error_summary: sanitizeError(error),
      notes: ["Trend scout failed safely; workflow should continue with approved company intelligence."],
    };
  }
}

function buildQuerySet(input: RunTrendScoutInput): string[] {
  const company = input.companyName;
  const category = input.websiteIntelligence?.industry ?? "B2B startup marketing";
  const local = input.companyUrl.includes(".com.au") ? "Australia startup ecosystem trends" : "regional startup ecosystem trends";
  const defaults = [
    `${category} founder-led content trends 2026`,
    `B2B operator marketing LinkedIn trend insights`,
    `${local} developer community-led growth`,
  ];
  const lyraHints =
    input.lyraWarmIntelligence ?
      [
        "AI engineering embedded teams market trend",
        "community-led growth developer ecosystem trend",
      ]
    : [];

  const withGoal =
    input.businessGoal || input.successMetric ?
      `${company} strategy-call conversion trend signals`
    : `${company} current public market narrative trends`;

  const all = [withGoal, ...defaults, ...lyraHints];
  return [...new Set(all)].slice(0, TREND_SCOUT_MAX_QUERIES);
}

function buildTrendPrompt(input: RunTrendScoutInput, querySet: string[]): string {
  const brandNotes = (input.brandLearningNotes ?? []).slice(0, 8).join("; ");
  const warmAnchors = (input.lyraWarmIntelligence?.source_anchors ?? []).slice(0, 6).join("; ");
  return [
    "You are Nova Trend Scout for Orbit.",
    "Use PUBLIC WEB SEARCH results only for current context.",
    "Do NOT claim private LinkedIn/Instagram/TikTok feed access.",
    "Do NOT copy source text verbatim. Synthesize strategic implications.",
    "Prefer recent, credible public sources. If source quality is weak, say so in notes.",
    "Return JSON only with this shape:",
    "{",
    '  "insights": [',
    '    { "trend": string, "implication": string, "recommended_angle": string, "confidence": number (0-100), "sources": [{ "title": string, "url": string, "domain": string, "snippet": string }] }',
    "  ],",
    '  "notes": [string]',
    "}",
    "",
    `Company: ${input.companyName} (${input.companyUrl})`,
    `Industry/category context: ${input.websiteIntelligence?.industry ?? "unknown"}`,
    `Business goal: ${input.businessGoal ?? "not provided"}`,
    `Success metric: ${input.successMetric ?? "not provided"}`,
    `Brand learning notes: ${brandNotes || "none"}`,
    `Reference anchors (internal context only): ${warmAnchors || "none"}`,
    `Search query set (${querySet.length}):`,
    ...querySet.map((q, i) => `${i + 1}. ${q}`),
  ].join("\n");
}

function parseTrendPayload(text: string): ParsedTrendPayload {
  const trimmed = text.trim();
  if (!trimmed) return {};
  try {
    const parsed = JSON.parse(trimmed) as ParsedTrendPayload;
    return parsed ?? {};
  } catch {
    const block = extractJsonBlock(trimmed);
    if (block) {
      try {
        const parsed = JSON.parse(block) as ParsedTrendPayload;
        return parsed ?? {};
      } catch {
        return {};
      }
    }
    return {};
  }
}

function normalizeInsights(
  insightsRaw: ParsedTrendPayload["insights"],
  fallbackSources: TrendSource[],
  text: string,
): TrendInsight[] {
  const normalized = (insightsRaw ?? [])
    .filter((i) => i && typeof i === "object")
    .map((i) => ({
      id: crypto.randomUUID(),
      trend: safeText(i.trend, "Public trend signal observed in current web coverage."),
      implication: safeText(i.implication, "Implication needs tighter validation against additional sources."),
      recommended_angle: safeText(i.recommended_angle, "Use this trend as context, then ground with company proof anchors."),
      confidence: clampConfidence(i.confidence),
      sources: dedupeSources((i.sources ?? []).filter((s) => s?.url)),
    }));

  if (normalized.length > 0) {
    return normalized.slice(0, 5);
  }

  const fallbackText = text.slice(0, 420).trim();
  if (!fallbackText) return [];
  return [
    {
      id: crypto.randomUUID(),
      trend: "Trend scout returned non-JSON narrative output.",
      implication: "Use this as soft context only; corroborate before major narrative pivots.",
      recommended_angle: fallbackText,
      confidence: 45,
      sources: dedupeSources(fallbackSources).slice(0, 3),
    },
  ];
}

function extractOutputText(response: unknown): string {
  const maybe = response as {
    output_text?: string;
    output?: Array<{ content?: Array<{ text?: string }> }>;
  };
  if (typeof maybe.output_text === "string" && maybe.output_text.trim()) {
    return maybe.output_text;
  }
  const chunks: string[] = [];
  for (const o of maybe.output ?? []) {
    for (const c of o.content ?? []) {
      if (typeof c.text === "string") chunks.push(c.text);
    }
  }
  return chunks.join("\n").trim();
}

function extractSourcesFromResponse(response: unknown): TrendSource[] {
  const out: TrendSource[] = [];
  const text = JSON.stringify(response);
  const urlRegex = /https?:\/\/[^\s"']+/g;
  const urls = text.match(urlRegex) ?? [];
  for (const url of urls) {
    if (!/^https?:\/\//i.test(url)) continue;
    out.push({
      url: stripPunctuation(url),
      domain: parseDomain(url),
    });
  }
  return dedupeSources(out).slice(0, 20);
}

function dedupeSources(sources: TrendSource[]): TrendSource[] {
  const map = new Map<string, TrendSource>();
  for (const s of sources) {
    const key = (s.url ?? "").trim();
    if (!key) continue;
    if (!map.has(key)) {
      map.set(key, {
        title: s.title?.trim() || undefined,
        url: key,
        domain: s.domain?.trim() || parseDomain(key),
        snippet: s.snippet?.trim() || undefined,
      });
    }
  }
  return [...map.values()];
}

function extractJsonBlock(text: string): string | null {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end <= start) return null;
  return text.slice(start, end + 1);
}

function parseDomain(url: string): string | undefined {
  try {
    return new URL(url).hostname;
  } catch {
    return undefined;
  }
}

function stripPunctuation(url: string): string {
  return url.replace(/[),.;]+$/g, "");
}

function clampConfidence(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return 55;
  return Math.max(0, Math.min(100, Math.round(n)));
}

function safeText(value: unknown, fallback: string): string {
  if (typeof value !== "string") return fallback;
  const t = value.trim();
  return t.length > 0 ? t : fallback;
}

function sanitizeError(error: unknown): string {
  const raw =
    error instanceof Error ? error.message
    : typeof error === "string" ? error
    : "Unknown trend scout error.";
  return raw.replace(/\s+/g, " ").slice(0, 280);
}

function clampMaxQueries(value: string | undefined): number {
  const n = Number(value ?? "3");
  if (!Number.isFinite(n)) return 3;
  return Math.max(1, Math.min(6, Math.round(n)));
}
