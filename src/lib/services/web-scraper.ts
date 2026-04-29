import type { WebsiteIntelligence } from "@/lib/types/orbit";

const MAX_PAGES = 8;

export interface CrawlEvent {
  path: string;
  title?: string;
  found_hint?: string;
}

export interface ScrapeResult {
  intelligence: WebsiteIntelligence;
  crawl_events: CrawlEvent[];
}

export async function scrapeWebsiteIntelligence(companyUrl: string): Promise<ScrapeResult> {
  const startUrl = normalizeStartUrl(companyUrl);
  const base = new URL(startUrl);
  const queue: URL[] = [base];
  const seen = new Set<string>();

  const pages: WebsiteIntelligence["discovered_pages"] = [];
  const crawlEvents: CrawlEvent[] = [];
  const discoveredHex = new Set<string>();
  const styleSamples = new Set<string>();
  let themeColor: string | undefined;
  let faviconUrl: string | undefined;

  while (queue.length > 0 && pages.length < MAX_PAGES) {
    const target = queue.shift();
    if (!target) {
      break;
    }

    const key = canonicalize(target);
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);

    try {
      const html = await fetchHtml(target.toString());
      const title = extractTitle(html);
      const headings = extractHeadings(html).slice(0, 8);
      const paragraphs = extractParagraphs(html).slice(0, 10);
      const pagePath = target.pathname || "/";
      const foundHint = inferHintFromContent(title, headings, paragraphs);
      const visualSignals = extractVisualSignals(html, target);
      if (!themeColor && visualSignals.theme_color) {
        themeColor = visualSignals.theme_color;
      }
      if (!faviconUrl && visualSignals.favicon_url) {
        faviconUrl = visualSignals.favicon_url;
      }
      for (const hex of visualSignals.discovered_hex_codes) {
        discoveredHex.add(hex);
      }
      for (const sample of visualSignals.style_color_samples) {
        styleSamples.add(sample);
      }

      pages.push({
        path: pagePath,
        title,
        headings,
        key_paragraphs: paragraphs.slice(0, 4),
      });
      crawlEvents.push({
        path: pagePath,
        title,
        found_hint: foundHint,
      });

      const links = extractLinks(html, target, base.hostname);
      for (const link of links) {
        if (!seen.has(canonicalize(link)) && queue.length + pages.length < MAX_PAGES * 3) {
          queue.push(link);
        }
      }
    } catch {
      crawlEvents.push({
        path: target.pathname || "/",
        found_hint: "Page fetch failed or blocked",
      });
    }
  }

  const aggregateText = pages.flatMap((page) => [...page.headings, ...page.key_paragraphs]);
  const domain = base.hostname.replace(/^www\./, "");
  const companyName = inferCompanyName(pages, domain);

  const intelligence: WebsiteIntelligence = {
    website_url: base.origin,
    company_name: companyName,
    domain,
    industry: inferIndustry(aggregateText),
    audience_summary: inferAudience(aggregateText),
    key_value_propositions: aggregateText.filter(isValueProposition).slice(0, 5),
    product_offerings: inferOfferings(aggregateText),
    seo_keywords: inferKeywords(aggregateText),
    social_proof: aggregateText.filter(isSocialProof).slice(0, 4),
    differentiators: aggregateText.filter(isDifferentiator).slice(0, 4),
    discovered_pages: pages,
    visual_signals: {
      theme_color: themeColor,
      discovered_hex_codes: Array.from(discoveredHex).slice(0, 20),
      style_color_samples: Array.from(styleSamples).slice(0, 20),
      favicon_url: faviconUrl,
    },
  };

  return { intelligence, crawl_events: crawlEvents };
}

async function fetchHtml(url: string): Promise<string> {
  const response = await fetch(url, {
    headers: { "User-Agent": "OrbitBot/1.0 (Website Discovery)" },
  });
  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}`);
  }
  return response.text();
}

function extractTitle(html: string): string {
  const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return sanitize(match?.[1] ?? "Untitled");
}

function extractHeadings(html: string): string[] {
  const matches = html.matchAll(/<(h1|h2)[^>]*>([\s\S]*?)<\/\1>/gi);
  return Array.from(matches, (match) => sanitize(match[2])).filter(Boolean);
}

function extractParagraphs(html: string): string[] {
  const matches = html.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/gi);
  return Array.from(matches, (match) => sanitize(match[1]))
    .filter((text) => text.length > 30)
    .slice(0, 20);
}

function extractLinks(html: string, current: URL, hostname: string): URL[] {
  const matches = html.matchAll(/<a[^>]+href=["']([^"'#]+)["']/gi);
  const urls: URL[] = [];
  for (const match of matches) {
    try {
      const candidate = new URL(match[1], current);
      if (candidate.hostname.replace(/^www\./, "") !== hostname.replace(/^www\./, "")) {
        continue;
      }
      if (["http:", "https:"].includes(candidate.protocol)) {
        urls.push(candidate);
      }
    } catch {
      // Ignore malformed links.
    }
  }
  return dedupeUrls(urls).slice(0, 20);
}

function dedupeUrls(urls: URL[]): URL[] {
  const map = new Map<string, URL>();
  for (const url of urls) {
    map.set(canonicalize(url), url);
  }
  return Array.from(map.values());
}

function canonicalize(url: URL): string {
  return `${url.origin}${url.pathname}`.replace(/\/$/, "").toLowerCase();
}

function normalizeStartUrl(value: string): string {
  if (!/^https?:\/\//i.test(value)) {
    return `https://${value}`;
  }
  return value;
}

function sanitize(value: string): string {
  return value
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/\s+/g, " ")
    .trim();
}

function inferCompanyName(
  pages: WebsiteIntelligence["discovered_pages"],
  domain: string,
): string {
  const homeTitle = pages?.[0]?.title ?? "";
  const token = homeTitle.split("|")[0]?.split("-")[0]?.trim();
  if (token && token.length > 1) {
    return token;
  }
  return domain
    .split(".")[0]
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function inferIndustry(lines: string[]): string {
  const text = lines.join(" ").toLowerCase();
  if (text.includes("fintech") || text.includes("bank")) return "Fintech";
  if (text.includes("health") || text.includes("clinic")) return "HealthTech";
  if (text.includes("developer") || text.includes("api")) return "Developer Platform";
  if (text.includes("infrastructure") || text.includes("city")) return "Infrastructure";
  return "Technology";
}

function inferAudience(lines: string[]): string {
  const line =
    lines.find((value) => /for\s+[a-z]/i.test(value) && value.length > 50) ??
    lines.find((value) => value.length > 60) ??
    "Audience signals identified from website messaging.";
  return line;
}

function inferOfferings(lines: string[]): string[] {
  return lines
    .filter((line) => /(platform|product|service|solution|tool)/i.test(line))
    .slice(0, 5);
}

function inferKeywords(lines: string[]): string[] {
  const text = lines.join(" ").toLowerCase();
  const candidates = [
    "ai",
    "automation",
    "platform",
    "infrastructure",
    "analytics",
    "security",
    "workflow",
    "growth",
  ];
  return candidates.filter((keyword) => text.includes(keyword)).slice(0, 6);
}

function isValueProposition(line: string): boolean {
  return /(help|enable|improve|faster|better|reduce|increase|real-time)/i.test(line);
}

function isSocialProof(line: string): boolean {
  return /(trusted|customers|teams|used by|case study|partners)/i.test(line);
}

function isDifferentiator(line: string): boolean {
  return /(only|unique|first|differentiat|specialized|built for)/i.test(line);
}

function inferHintFromContent(title: string, headings: string[], paragraphs: string[]): string {
  const joined = [title, ...headings, ...paragraphs].join(" ").toLowerCase();
  if (joined.includes("mission")) return "Found mission statement";
  if (joined.includes("about")) return "Found company background";
  if (joined.includes("customer") || joined.includes("case study")) return "Found social proof";
  return "Captured headings and key paragraphs";
}

function extractVisualSignals(
  html: string,
  currentUrl: URL,
): NonNullable<WebsiteIntelligence["visual_signals"]> {
  const theme = html.match(
    /<meta[^>]+name=["']theme-color["'][^>]+content=["']([^"']+)["'][^>]*>/i,
  )?.[1];

  const faviconHref =
    html.match(/<link[^>]+rel=["'][^"']*icon[^"']*["'][^>]+href=["']([^"']+)["'][^>]*>/i)?.[1] ??
    html.match(/<link[^>]+href=["']([^"']+)["'][^>]+rel=["'][^"']*icon[^"']*["'][^>]*>/i)?.[1];

  const styleBlocks = Array.from(html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)).map(
    (match) => match[1],
  );
  const inlineButtonHeaderAnchorStyles = Array.from(
    html.matchAll(/<(button|header|a)\b[^>]*style=["']([^"']+)["'][^>]*>/gi),
  ).map((match) => match[2]);

  const styleCorpus = [...styleBlocks, ...inlineButtonHeaderAnchorStyles].join("\n");
  const discoveredHex = extractHexColors([theme ?? "", styleCorpus]);
  const colorSamples = extractColorSamples(styleCorpus);

  return {
    theme_color: normalizeHex(theme),
    discovered_hex_codes: discoveredHex,
    style_color_samples: colorSamples,
    favicon_url: faviconHref ? new URL(faviconHref, currentUrl).toString() : undefined,
  };
}

function extractHexColors(input: string[]): string[] {
  const set = new Set<string>();
  const pattern = /#[0-9a-fA-F]{3,8}\b/g;
  for (const block of input) {
    const matches = block.match(pattern) ?? [];
    for (const match of matches) {
      const normalized = normalizeHex(match);
      if (normalized) {
        set.add(normalized);
      }
    }
  }
  return Array.from(set);
}

function extractColorSamples(styleCorpus: string): string[] {
  const samples = new Set<string>();
  const regex = /(background(?:-color)?|color)\s*:\s*([^;}{]+)/gi;
  for (const match of styleCorpus.matchAll(regex)) {
    const value = match[2].trim();
    if (value) {
      samples.add(`${match[1]}: ${value}`);
    }
  }
  return Array.from(samples).slice(0, 30);
}

function normalizeHex(value?: string): string | undefined {
  if (!value) return undefined;
  const matched = value.trim().match(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/);
  if (!matched) return undefined;
  if (matched[1].length === 3) {
    const chars = matched[1].split("");
    return `#${chars.map((char) => char + char).join("").toUpperCase()}`;
  }
  return `#${matched[1].toUpperCase()}`;
}
