import type {
  BrandKit,
  CompanyIntelligenceValidation,
  LyraWarmIntelligence,
  ProductMarketingContext,
  WebsiteIntelligence,
} from "@/lib/types/orbit";

const LYRA_MATCH_TERMS = [
  "lyratechnologies.com.au",
  "lyra technologies",
  "lyra",
];

export const LYRA_WARM_INTELLIGENCE: LyraWarmIntelligence = {
  cache_label: "Lyra Warm Intelligence Cache",
  cache_source: "Approved demo research dossier",
  core_positioning:
    "Lyra is a builder-native engineering execution partner, not a traditional SaaS startup or generic agency.",
  buyer_belief:
    "Elite technical teams trust partners that prove talent density, real delivery outcomes, and founder-proximate execution rhythm.",
  audience_segments: [
    "Founders and technical co-founders in venture-backed startups",
    "Operator leaders accountable for product velocity",
    "Engineering leaders scaling teams across Sydney and Melbourne",
    "AI-native teams seeking frontier proximity without corporate theater",
  ],
  proof_points: [
    "Lyra100 hiring campaign and high talent-bar signaling",
    "Rigorous take-home hiring process and Fellowship demand",
    "Lyrathon participation and builder-community gravity",
    "Anthropic x Lyra board game night partnership signal",
    "ReadMe client visit evidence and face-to-face delivery trust",
    "Prophecy Gov, Hobbes, Thunder Compute project execution proof",
    "Melbourne expansion and multi-city engineering floor scale",
    "Iftar and student community events showing durable local trust",
  ],
  content_angles: [
    "Talent density and hiring bar",
    "Client execution proof",
    "Frontier AI proximity",
    "Community gravity",
    "Multi-city scale",
    "Founder/operator trust",
    "Culture as execution proof",
  ],
  brand_voice: [
    "Strategic",
    "Technical",
    "Founder-first",
    "Operator-led",
    "Concrete",
    "Builder-native",
  ],
  visual_motifs: [
    "After-hours engineering table with laptops and whiteboards",
    "Fellowship cohort workshop scenes",
    "Hackathon / Lyrathon builder floor energy",
    "Board game night as frontier-community signal",
    "Sydney-to-Melbourne expansion cues",
    "Office rituals and low-ego shipping culture",
  ],
  avoid_list: [
    "Generic AI agency language",
    "Stock-smile corporate photo style",
    "Vague robot or sci-fi visual tropes",
    "Claims without source anchors",
    "Founder messaging detached from execution proof",
  ],
  source_anchors: [
    "Lyra100 hiring campaign",
    "Rigorous take-home hiring process",
    "Lyra Fellowship with thousands of applicants",
    "Lyrathon community proof",
    "Anthropic x Lyra board game night",
    "ReadMe client visits",
    "Prophecy Gov project delivery",
    "Hobbes project delivery",
    "Thunder Compute project delivery",
    "Melbourne expansion",
    "Iftar and student community events",
    "Builder-native culture and office rituals",
    "Not a traditional SaaS startup or generic agency",
  ],
};

export function isLyraCompanyUrl(value?: string): boolean {
  if (!value) return false;
  const normalized = value.toLowerCase();
  return LYRA_MATCH_TERMS.some((term) => normalized.includes(term));
}

export function applyLyraWarmIntelligenceToProfile(input: {
  website_intelligence: WebsiteIntelligence;
  intelligence_validation: CompanyIntelligenceValidation;
  brand_kit: BrandKit;
  product_marketing_context: ProductMarketingContext;
}): {
  website_intelligence: WebsiteIntelligence;
  intelligence_validation: CompanyIntelligenceValidation;
  brand_kit: BrandKit;
  product_marketing_context: ProductMarketingContext;
} {
  const mergedWebsite: WebsiteIntelligence = {
    ...input.website_intelligence,
    company_name: "Lyra Technologies AU",
    audience_summary:
      "Founders, operators, and engineering leaders at venture-backed startups who need execution velocity without process theater.",
    key_value_propositions: [
      "Builder-native execution model for venture-backed product teams",
      "Talent density and shipping rigor validated through hiring and fellowship signals",
      "Concrete delivery proof across Prophecy Gov, Hobbes, Thunder Compute, and ReadMe-facing work",
    ],
    social_proof: [...new Set([...(input.website_intelligence.social_proof ?? []), ...LYRA_WARM_INTELLIGENCE.proof_points])],
    differentiators: [
      "Not a traditional SaaS startup or generic agency",
      "Culture is treated as an execution system, not employer branding theater",
      "Sydney + Melbourne engineering floor and frontier partnership proximity",
    ],
  };

  const mergedValidation: CompanyIntelligenceValidation = {
    ...input.intelligence_validation,
    confidence_score: Math.max(input.intelligence_validation.confidence_score ?? 90, 95),
    reviewer_notes:
      "Warm cache applied from approved Lyra research dossier. Positioning and proof anchors were reinforced for demo reliability.",
    warnings: [
      ...(input.intelligence_validation.warnings ?? []),
      "Warm intelligence cache used for known Lyra demo profile; verify live details before external publication.",
    ],
    brand_voice_descriptors: LYRA_WARM_INTELLIGENCE.brand_voice.slice(0, 5),
  };

  const mergedBrandKit: BrandKit = {
    ...input.brand_kit,
    brand_name: "Lyra Technologies AU",
    tone_of_voice: [...new Set([...(input.brand_kit.tone_of_voice ?? []), ...LYRA_WARM_INTELLIGENCE.brand_voice])],
  };

  const mergedContext: ProductMarketingContext = {
    ...input.product_marketing_context,
    mission_statement:
      "Lyra helps venture-backed teams ship faster by combining elite engineering talent density with builder-native execution systems.",
    target_personas: [...new Set([...(input.product_marketing_context.target_personas ?? []), ...LYRA_WARM_INTELLIGENCE.audience_segments])],
    pains_solved: [
      "Execution drag in high-growth startup teams",
      "Low-confidence hiring and ramp in early-stage engineering orgs",
      "Founder skepticism toward generic agency claims without technical proof",
    ],
    messaging_pillars: [
      "Talent density as delivery advantage",
      "Client proof over generic positioning",
      "Builder culture as execution infrastructure",
    ],
    launch_goals: [
      "Increase qualified founder and operator strategy-call bookings",
      "Grow high-intent inbound from technical startup teams",
    ],
    primary_cta: "Book a founder/operator strategy call",
    sop_focus: [
      "proof anchors",
      "builder-native execution",
      "culture-to-delivery link",
      "non-generic AI positioning",
    ],
    preferred_channels: ["LinkedIn (founder/operator)", "Instagram (builder-community)", "Email (proof sequence)"],
  };

  return {
    website_intelligence: mergedWebsite,
    intelligence_validation: mergedValidation,
    brand_kit: mergedBrandKit,
    product_marketing_context: mergedContext,
  };
}
