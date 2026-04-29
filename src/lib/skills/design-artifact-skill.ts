import { slidePrimaryBody, slidePrimaryHeadline } from "@/lib/agents/draft-utils";
import type {
  BrandDesignSystem,
  CampaignCarouselDraft,
  ProductMarketingContext,
} from "@/lib/types/orbit";

const LINKEDIN_CAROUSEL_SOP_COMMENT =
  "// SOP: Create a 10-slide LinkedIn carousel. Slide 1: Hook, Slides 2-9: Value, Slide 10: CTA. Vertical format (1080x1350).";

const INSTAGRAM_STORY_SOP_COMMENT =
  "// SOP: 9:16 vertical format. Big bold text, clear CTA at bottom.";

const PITCH_DECK_SOP_COMMENT =
  "// SOP: 12-slide structure covering problem, solution, market, traction, team, and ask.";

function dsTokens(ds: BrandDesignSystem): string {
  const primary = ds.primary_palette.map((c) => c.hex).join(", ");
  const secondary = ds.secondary_palette.map((c) => c.hex).join(", ");
  return [
    `Primary palette: ${primary}`,
    `Secondary palette: ${secondary}`,
    `Fonts (Google): heading="${ds.typography.heading_font}", body="${ds.typography.body_font}"`,
    `Spacing base ${ds.spacing_scale.base_px}px · steps [${ds.spacing_scale.steps.join(", ")}]`,
    `Radii: ${JSON.stringify(ds.border_radius_scale)}`,
    `Buttons → primary: ${ds.buttons.primary}`,
    `Sample card motif: ${ds.sample_card_component}`,
    `Mood: ${ds.mood_vibe.join(" · ")}`,
  ].join(" | ");
}

/** Carousel Days → React/Tailwind slide deck referencing BrandDesignSystem tokens. */
export function buildInstagramCarouselStudioTsx(
  designSystem: BrandDesignSystem,
  draft: CampaignCarouselDraft,
): string {
  const tokenComment = `/* DesignSystem → ${dsTokens(designSystem)} */`;
  const slides = draft.slides.map((slide, index) => {
    const headline = slidePrimaryHeadline(slide).replace(/"/g, "&quot;");
    const body = slidePrimaryBody(slide).replace(/"/g, "&quot;");
    const bg = designSystem.primary_palette[index % designSystem.primary_palette.length]?.hex ?? "#0f172a";
    const fg = index % 2 === 0 ? "#f8fafc" : "#e2e8f0";
    return `
      <section
        className="flex h-[1350px] w-[1080px] max-w-full flex-col justify-between rounded-[${designSystem.border_radius_scale.lg}] p-8 shadow-2xl"
        style={{ backgroundColor: "${bg}", color: "${fg}", fontFamily: "'${designSystem.typography.body_font}', sans-serif" }}
      >
        <header className="text-xs uppercase tracking-[0.35em] opacity-70">Slide ${index + 1}</header>
        <div className="space-y-6">
          <h2 className="text-5xl font-black leading-tight" style={{ fontFamily: "'${designSystem.typography.heading_font}', sans-serif" }}>
            ${headline}
          </h2>
          <p className="text-2xl leading-relaxed opacity-95">${body}</p>
        </div>
        <footer className="text-sm opacity-60">Spacing scale respects ${designSystem.spacing_scale.base_px}px rhythm.</footer>
      </section>`;
  });

  return [
    `"use client";`,
    ``,
    `import React from "react";`,
    ``,
    tokenComment,
    ``,
    `/** Instagram carousel artifact — code-first layout aligned to Claude Design Studio tokens */`,
    `export function InstagramCarouselArtifact() {`,
    `  return (`,
    `    <div className="flex flex-col gap-10 bg-neutral-950 p-8 text-slate-50">`,
    `      <div className="mx-auto flex w-full max-w-[1080px] flex-col gap-12">`,
    ...slides.map((s) => `      ${s.trim()}`),
    `      </div>`,
    `    </div>`,
    `  );`,
    `}`,
  ].join("\n");
}

export function enrichCarouselDraftWithStudioExport(
  designSystem: BrandDesignSystem,
  draft: CampaignCarouselDraft,
): CampaignCarouselDraft {
  return {
    ...draft,
    studio_react_export: buildInstagramCarouselStudioTsx(designSystem, draft),
  };
}

export function buildLinkedInCarouselTenSlidesTsx(
  designSystem: BrandDesignSystem,
  context: ProductMarketingContext,
  brandName: string,
): string {
  const hook = context.messaging_pillars[0] ?? context.mission_statement.slice(0, 120);
  const valueCore = context.pains_solved.slice(0, 6).join(" • ") || context.product_summary.slice(0, 240);
  const cta = context.primary_cta;
  const accent = designSystem.secondary_palette[0]?.hex ?? "#38bdf8";

  const valueSlides = Array.from({ length: 8 }, (_, i) => ({
    title: `Value ${i + 1}`,
    body:
      valueCore.slice(i * 40, i * 40 + 140) || `Structured narrative beat ${String(i + 1)}`,
  }));

  const slideRecords = [
    { title: "Hook", body: `${brandName}: ${hook}` },
    ...valueSlides,
    { title: "CTA", body: cta },
  ];

  const slideLines = slideRecords.map(
    (slide) => `  { title: ${JSON.stringify(slide.title)}, body: ${JSON.stringify(slide.body)} },`,
  );

  return [
    `"use client";`,
    ``,
    `import React from "react";`,
    ``,
    `/**`,
    ` * ${LINKEDIN_CAROUSEL_SOP_COMMENT.slice(3)}`,
    ` * Tokens → ${dsTokens(designSystem)}`,
    ` */`,
    ``,
    `const slides = [`,
    ...slideLines,
    `];`,
    ``,
    `export default function LinkedInCarouselDeck() {`,
    `  return (`,
    `    <div className="flex flex-col gap-10 bg-slate-950 p-10 text-white">`,
    `      <header className="text-sm uppercase tracking-[0.4em] text-slate-400">LinkedIn · 1080 × 1350</header>`,
    `      <div className="mx-auto flex max-w-[1080px] flex-col gap-8">`,
    `        {slides.map((slide, index) => (`,
    `          <article`,
    `            key={slide.title + index}`,
    `            className="flex min-h-[640px] flex-col justify-between rounded-3xl border border-white/10 p-12 shadow-xl"`,
    `            style={{ borderColor: "${accent}", backgroundColor: "${designSystem.primary_palette[0]?.hex ?? "#020617"}" }}`,
    `          >`,
    `            <p className="text-xs uppercase tracking-[0.5em] text-white/60">{slide.title}</p>`,
    `            <p className="text-4xl font-semibold leading-snug" style={{ fontFamily: "'${designSystem.typography.heading_font}', sans-serif" }}>{slide.body}</p>`,
    `            <span className="text-sm text-white/50">{brandName}</span>`,
    `          </article>`,
    `        ))}`,
    `      </div>`,
    `    </div>`,
    `  );`,
    `}`,
  ].join("\n");
}

export function buildInstagramStoryNineSixteenTsx(
  designSystem: BrandDesignSystem,
  context: ProductMarketingContext,
): string {
  const hero = context.mission_statement.slice(0, 160);
  const accent = designSystem.secondary_palette[1]?.hex ?? "#f97316";

  return [
    `"use client";`,
    ``,
    `import React from "react";`,
    ``,
    `/**`,
    ` * ${INSTAGRAM_STORY_SOP_COMMENT.slice(3)}`,
    ` * Tokens → ${dsTokens(designSystem)}`,
    ` */`,
    ``,
    `export default function InstagramStoryBoard() {`,
    `  return (`,
    `    <div`,
    `      className="flex min-h-[812px] w-full max-w-[420px] flex-col justify-between rounded-[32px] bg-black p-10 text-white shadow-2xl"`,
    `      style={{ aspectRatio: "9 / 16" }}`,
    `    >`,
    `      <div className="text-xs uppercase tracking-[0.6em] text-white/60">Story Mode</div>`,
    `      <div className="space-y-8">`,
    `        <h1 className="text-6xl font-black leading-none" style={{ fontFamily: "'${designSystem.typography.heading_font}', sans-serif", color: "${accent}" }}>`,
    `          BIG`,
    `        </h1>`,
    `        <p className="text-3xl font-semibold">${hero}</p>`,
    `      </div>`,
    `      <button`,
    `        type="button"`,
    `        className="w-full rounded-full py-4 text-center text-lg font-bold uppercase tracking-wide text-black"`,
    `        style={{ backgroundColor: "${designSystem.secondary_palette[0]?.hex ?? "#fde047"}" }}`,
    `      >`,
    `        ${context.primary_cta}`,
    `      </button>`,
    `    </div>`,
    `  );`,
    `}`,
  ].join("\n");
}

export function buildPitchDeckTwelveSlidesTsx(
  designSystem: BrandDesignSystem,
  context: ProductMarketingContext,
  brandName: string,
): string {
  const pitchSummary = context.product_summary.slice(0, 220).replace(/\\/g, "\\\\").replace(/`/g, "\\`");

  const agenda = [
    "Problem",
    "Solution",
    "Market",
    "Traction",
    "Team",
    "Ask",
    "Roadmap",
    "Moat",
    "Financials",
    "Vision",
    "Appendix",
    "Closing",
  ];

  const paletteHexLiteral = JSON.stringify(
    designSystem.primary_palette.map((entry) => entry.hex),
  );

  return [
    `"use client";`,
    ``,
    `import React from "react";`,
    ``,
    `/**`,
    ` * ${PITCH_DECK_SOP_COMMENT.slice(3)}`,
    ` * Tokens → ${dsTokens(designSystem)}`,
    ` */`,
    ``,
    `const slides = ${JSON.stringify(agenda)};`,
    `const paletteHex = ${paletteHexLiteral} as const;`,
    ``,
    `export default function PitchDeckTwelve() {`,
    `  return (`,
    `    <div className="grid gap-8 bg-slate-900 p-10 text-white lg:grid-cols-2">`,
    `      {slides.map((title, idx) => (`,
    `        <article`,
    `          key={title}`,
    `          className="flex min-h-[360px] flex-col justify-between rounded-3xl border border-white/10 p-10"`,
    `          style={{ backgroundColor: paletteHex[idx % paletteHex.length] }}`,
    `        >`,
    `          <p className="text-xs uppercase tracking-[0.5em]">{title}</p>`,
    `          <div>`,
    `            <h3 className="text-4xl font-semibold" style={{ fontFamily: "'${designSystem.typography.heading_font}', sans-serif" }}>{brandName}</h3>`,
    `            <p className="mt-4 text-lg text-white/80">${pitchSummary}</p>`,
    `          </div>`,
    `        </article>`,
    `      ))}`,
    `    </div>`,
    `  );`,
    `}`,
  ].join("\n");
}

export function buildDesignStudioExportsBundle(
  designSystem: BrandDesignSystem,
  context: ProductMarketingContext,
  brandName: string,
): {
  linkedin_carousel_tsx: string;
  instagram_story_tsx: string;
  pitch_deck_tsx: string;
} {
  return {
    linkedin_carousel_tsx: buildLinkedInCarouselTenSlidesTsx(designSystem, context, brandName),
    instagram_story_tsx: buildInstagramStoryNineSixteenTsx(designSystem, context),
    pitch_deck_tsx: buildPitchDeckTwelveSlidesTsx(designSystem, context, brandName),
  };
}

function stripDuplicateModulePreamble(src: string): string {
  let s = src.trim();
  const firstLine = s.split("\n")[0]?.trim() ?? "";
  if (firstLine === `"use client";` || firstLine === `'use client';`) {
    s = s.slice(s.indexOf("\n") + 1).trimStart();
  }
  s = s.replace(/^import React from ["']react["'];?\s*\r?\n?/, "");
  return s.trim();
}

/** Wraps arbitrary JSX-capable strings into a production-ready module scaffold (Tailwind-ready). */
export function wrapProductionReadyReactExport(innerModuleBody: string): string {
  const body = stripDuplicateModulePreamble(innerModuleBody);
  return [
    `"use client";`,
    ``,
    `import React from "react";`,
    ``,
    `/**`,
    ` * Export this design to responsive, production-ready React code using Tailwind CSS.`,
    ` */`,
    ``,
    body,
  ].join("\n");
}
