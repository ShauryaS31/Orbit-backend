import type {
  BrandKit,
  CompanyIntelligenceValidation,
  ProductMarketingContext,
  WebsiteIntelligence,
} from "@/lib/types/orbit";

export interface MockCompanyProfile {
  company_url: string;
  website_intelligence: WebsiteIntelligence;
  intelligence_validation: CompanyIntelligenceValidation;
  brand_kit: BrandKit;
  product_marketing_context: ProductMarketingContext;
}

const MOCK_COMPANIES: MockCompanyProfile[] = [
  {
    company_url: "https://heidihealth.com",
    website_intelligence: {
      website_url: "https://heidihealth.com",
      company_name: "Heidi Health",
      domain: "heidihealth.com",
      industry: "AI MedTech",
      audience_summary:
        "Clinicians and care teams who want to spend less time on documentation and more time with patients.",
      key_value_propositions: [
        "Ambient notes reduce typing during consults.",
        "Clinical documentation stays structured and compliant.",
        "Doctors keep eye contact while records stay accurate.",
      ],
      product_offerings: ["AI Scribe", "Clinical Notes", "Practice Integrations"],
      seo_keywords: ["ai medical scribe", "clinical documentation", "medtech ai"],
      social_proof: [
        "Adopted by progressive care teams across ANZ.",
        "Clinicians report less after-hours paperwork.",
      ],
      differentiators: [
        "Healthcare safety guardrails designed for real clinics.",
        "Fast onboarding for private practices and care networks.",
      ],
    },
    intelligence_validation: {
      confidence_score: 94,
      confidence_levels: {
        company_name: "high",
        mission: "high",
        audience: "medium",
      },
      validated_fields: ["company_name", "industry", "offerings", "audience"],
      missing_fields: ["public pricing"],
      warnings: ["Claims should be reviewed against latest regulatory guidance."],
      reviewer_notes: "Strong positioning clarity and product-market fit signal.",
      visual_palette_rationale:
        "#28030F anchors Heidi Health because dark plum reads deliberate against noisy AI-med tropes while preserving warmth in-care contexts. #FCFAF8 keeps dense clinical UI breathable and #FBF582 concentrates optimism exactly where conversions must feel humane—not hype-led.",
      brand_voice_descriptors: ["Clinical", "Empathetic", "Precise", "Human", "Trust-forward"],
    },
    brand_kit: {
      brand_name: "Heidi Health",
      primary_hex: "#28030F",
      secondary_hex: "#FCFAF8",
      accent_hex: "#FBF582",
      neutral_hex: "#FCFAF8",
      typography: {
        heading_font: "Inter",
        body_font: "Inter",
      },
      tone_of_voice: ["warm", "human", "clinical", "decent"],
    },
    product_marketing_context: {
      mission_statement: "Return joy to care by eliminating clinical admin.",
      product_summary:
        "Heidi Health is an AI documentation assistant that captures and structures consult notes in real time.",
      target_personas: [
        "Busy general practitioner",
        "Practice manager focused on throughput",
        "Clinical operations lead at multi-site practice",
      ],
      pains_solved: [
        "Doctors losing eye contact with patients due to note taking",
        "Clinical admin spilling into after-hours work",
        "Inconsistent notes slowing follow-up care",
      ],
      messaging_pillars: ["Safety first AI", "Workflow-native", "Measurable time savings"],
      launch_goals: [
        "Increase qualified demo bookings",
        "Drive trial starts among independent practices",
      ],
      primary_cta: "Book a clinical walkthrough",
      sop_focus: ["eye contact", "clinician burnout"],
      preferred_channels: ["LinkedIn (Professional)", "Instagram (Human-centric)"],
    },
  },
  {
    company_url: "https://lyratechnologies.com.au",
    website_intelligence: {
      website_url: "https://lyratechnologies.com.au",
      company_name: "Lyra Technologies AU",
      domain: "lyratechnologies.com.au",
      industry: "Forward-Deployed Engineering Studio",
      audience_summary:
        "Venture-backed founders, operators, and product/engineering leads who need to ship faster without hiring a full internal team or managing a slow agency.",
      key_value_propositions: [
        "Forward-deployed founding engineers for Silicon Valley startups.",
        "Senior product engineering, design craft, and infrastructure discipline without traditional agency drag.",
        "AI-native product execution across agents, data platforms, workflow automation, and startup infrastructure.",
      ],
      product_offerings: ["Forward-Deployed Engineering", "AI Product Execution", "Design-To-Engineering Delivery", "Startup Infrastructure"],
      seo_keywords: ["forward deployed engineers", "startup product studio", "AI product execution", "founding engineers", "venture backed startups"],
      social_proof: [
        "75+ client work and 15+ YC companies.",
        "Clients backed by YC, Accel, A16z, Sequoia, Founders Fund, Lightspeed, and General Catalyst.",
        "Offices and community presence across San Francisco, Sydney, and Melbourne.",
        "Lyrathon, fellowship, and builder events show a durable engineering talent engine.",
      ],
      differentiators: [
        "Anti-agency positioning: not a dev shop queue, but founder-caliber engineers deployed into the build.",
        "Culture is used as proof of talent density, not as a lifestyle side story.",
        "Portfolio depth across AI/ML, B2B SaaS, data, sales workflows, cybersecurity, health, fintech, and startup infrastructure.",
        "Public operating diary shows hiring velocity, client execution, community gravity, and category clarity.",
      ],
    },
    intelligence_validation: {
      confidence_score: 96,
      confidence_levels: {
        company_name: "high",
        mission: "high",
        audience: "high",
      },
      validated_fields: ["company_name", "positioning", "audience", "portfolio themes", "culture signals", "social proof"],
      missing_fields: ["Direct Instagram and TikTok post-level analysis was blocked in the research environment."],
      warnings: [
        "Use the warm-cache framing honestly; do not claim full live scraping of blocked social platforms.",
        "Avoid calling Lyra a normal SaaS startup or a basic software agency.",
      ],
      reviewer_notes:
        "Lyra's strongest public positioning is forward-deployed engineers for Silicon Valley. Its brand story converts culture and talent density into buyer confidence for fast product execution.",
      visual_palette_rationale:
        "#1E67FF, #5254FF, and #7E45FF create a high-energy electric blue/violet system that fits Lyra's startup polish, motion accents, and builder-native culture. Neutral dark and white surfaces keep the brand credible for founders while the saturated accents preserve velocity and community energy.",
      brand_voice_descriptors: ["Ambitious", "Fast-moving", "Founder-first", "Technical", "Playful"],
    },
    brand_kit: {
      brand_name: "Lyra Technologies AU",
      primary_hex: "#1E67FF",
      secondary_hex: "#5254FF",
      accent_hex: "#7E45FF",
      neutral_hex: "#F8FAFC",
      typography: {
        heading_font: "Sora",
        body_font: "Inter",
      },
      tone_of_voice: ["ambitious", "fast-moving", "founder-first", "technical", "playful"],
    },
    product_marketing_context: {
      mission_statement:
        "Help ambitious startups design, build, and ship incredible products with the speed, craft, and judgment of founding engineers.",
      product_summary:
        "Lyra gives venture-backed founders forward-deployed engineering and design firepower so they can move from idea to production without the drag of a traditional agency.",
      target_personas: [
        "Venture-backed startup founder",
        "YC-backed founder",
        "AI startup founder",
        "Product or engineering lead at a high-growth startup",
        "Operator with more roadmap than engineering bandwidth",
      ],
      pains_solved: [
        "Traditional agencies are too slow or too junior",
        "Internal teams are overloaded and hiring takes too long",
        "Founders need product intuition, not just ticket execution",
        "AI and infrastructure work requires senior judgment under startup constraints",
      ],
      messaging_pillars: [
        "Forward-deployed founding engineers",
        "Product velocity without quality debt",
        "AI-native product execution",
        "Extension of the team",
        "Culture as talent magnet",
      ],
      launch_goals: ["Increase qualified founder conversations from venture-backed startups by 20%", "Convert strategy conversations into pilot engagements"],
      primary_cta: "Book a strategy conversation",
      sop_focus: ["forward-deployed engineers", "anti-agency positioning", "talent density", "AI execution proof"],
      preferred_channels: ["LinkedIn founder posts", "LinkedIn carousel", "Instagram culture proof", "Email/DM sequence"],
    },
  },
  {
    company_url: "https://openai.com",
    website_intelligence: {
      website_url: "https://openai.com",
      company_name: "OpenAI",
      domain: "openai.com",
      industry: "AI Research and Deployment",
      audience_summary:
        "Developers, enterprises, and the public using frontier AI systems responsibly.",
      key_value_propositions: [
        "Frontier models available through practical products and APIs.",
        "Safety and alignment remain first-order constraints.",
        "Research and deployment progress in tandem.",
      ],
      product_offerings: ["ChatGPT", "API Platform", "Enterprise AI"],
      seo_keywords: ["agi safety", "frontier ai", "ai models api"],
      social_proof: [
        "Global adoption by users and builders.",
        "Broad ecosystem integration across industries.",
      ],
      differentiators: [
        "High research depth with strong product execution.",
        "Safety architecture embedded in release process.",
      ],
    },
    intelligence_validation: {
      confidence_score: 98,
      confidence_levels: {
        company_name: "high",
        mission: "high",
        audience: "medium",
      },
      validated_fields: ["company_name", "industry", "offerings", "brand positioning"],
      missing_fields: [],
      warnings: ["Model capability claims require strict version references."],
      reviewer_notes: "High clarity on mission and safety posture.",
      visual_palette_rationale:
        "Black-and-white restraint communicates frontier seriousness without sensational graphics—critical when discussing societal-scale outcomes. Neutral chromatics preserve accessibility across surfaces while reserving accent chrome for calibrated emphasis.",
      brand_voice_descriptors: ["Authoritative", "Minimal", "Safety-conscious", "Global", "Measured"],
    },
    brand_kit: {
      brand_name: "OpenAI",
      primary_hex: "#000000",
      secondary_hex: "#FFFFFF",
      accent_hex: "#747474",
      neutral_hex: "#FFFFFF",
      typography: {
        heading_font: "Sohne",
        body_font: "Sohne",
      },
      tone_of_voice: ["authoritative", "minimalist", "safe"],
    },
    product_marketing_context: {
      mission_statement: "Ensuring AGI benefits all of humanity.",
      product_summary:
        "OpenAI builds and deploys advanced AI systems while prioritizing broad societal benefit and safety.",
      target_personas: [
        "AI application developer",
        "Enterprise innovation leader",
        "Policy and safety stakeholder",
      ],
      pains_solved: [
        "Teams blocked by low-capability automation tools",
        "Difficulty shipping AI safely at scale",
        "Unclear path from AI experimentation to production value",
      ],
      messaging_pillars: ["Capability with safety", "Practical deployment", "Responsible progress"],
      launch_goals: ["Increase enterprise adoption", "Expand trusted developer usage"],
      primary_cta: "Build with OpenAI",
      sop_focus: ["safety", "technical leadership"],
      preferred_channels: ["X", "Reddit", "LinkedIn"],
    },
  },
  {
    company_url: "https://january.capital",
    website_intelligence: {
      website_url: "https://january.capital",
      company_name: "January Capital",
      domain: "january.capital",
      industry: "Venture Capital",
      audience_summary:
        "Founders and infrastructure operators scaling core systems across APAC.",
      key_value_propositions: [
        "Capital structured for long-term infrastructure outcomes.",
        "High-conviction partnerships with operators building durable assets.",
        "Regional expertise across APAC growth markets.",
      ],
      product_offerings: ["Growth Capital", "Strategic Advisory", "Infrastructure Investing"],
      seo_keywords: ["apac capital", "infrastructure investment", "venture apac"],
      social_proof: [
        "Portfolio partnerships across Southeast Asia and Australia.",
        "Track record in scaling infrastructure-led businesses.",
      ],
      differentiators: [
        "Bespoke capital models for complex infrastructure plays.",
        "Operator perspective blended with financial discipline.",
      ],
    },
    intelligence_validation: {
      confidence_score: 92,
      confidence_levels: {
        company_name: "high",
        mission: "medium",
        audience: "high",
      },
      validated_fields: ["company_name", "industry", "audience", "offerings"],
      missing_fields: ["fund performance disclosures"],
      warnings: ["Investment language should remain compliance-safe."],
      reviewer_notes: "Clear APAC infrastructure specialization.",
      visual_palette_rationale:
        "#0A2342 communicates institutional endurance suited to multi-year infrastructure bets. Bright aqua accents punctuate milestones responsibly—accent saturation stays disciplined so investor narratives remain sober, not speculative.",
      brand_voice_descriptors: ["Institutional", "Patient", "Operator-led", "Measured", "Ambitious"],
    },
    brand_kit: {
      brand_name: "January Capital",
      primary_hex: "#0A2342",
      secondary_hex: "#FFFFFF",
      accent_hex: "#00D1FF",
      neutral_hex: "#FFFFFF",
      typography: {
        heading_font: "Manrope",
        body_font: "Inter",
      },
      tone_of_voice: ["pragmatic", "ambitious", "measured"],
    },
    product_marketing_context: {
      mission_statement: "Bespoke capital for APAC infrastructure.",
      product_summary:
        "January Capital backs infrastructure builders in APAC with bespoke capital and strategic guidance.",
      target_personas: [
        "Infrastructure-focused founder",
        "Growth-stage CEO in APAC",
        "Operator seeking strategic capital partner",
      ],
      pains_solved: [
        "One-size-fits-all funding terms for complex infrastructure businesses",
        "Capital partners without regional operating depth",
        "Pressure to scale without strategic execution support",
      ],
      messaging_pillars: [
        "Bespoke capital structures",
        "APAC infrastructure depth",
        "Operator-first partnership",
      ],
      launch_goals: ["Increase founder introductions", "Expand qualified deal flow"],
      primary_cta: "Start a strategic conversation",
      sop_focus: ["APAC growth", "localized demand"],
      preferred_channels: ["LinkedIn (Institutional)"],
    },
  },
  {
    company_url: "https://inara.technology",
    website_intelligence: {
      website_url: "https://inara.technology",
      company_name: "Inara Technology",
      domain: "inara.technology",
      industry: "Urban Infrastructure Intelligence",
      audience_summary:
        "City leaders, urban planners, and infrastructure policymakers shaping sustainable growth.",
      key_value_propositions: [
        "Decision intelligence for complex city infrastructure planning.",
        "Cross-system visibility for transport, utilities, and growth pressure.",
        "Evidence-based strategy for long-term urban resilience.",
      ],
      product_offerings: ["Urban Intelligence Platform", "Policy Simulation", "City Dashboard"],
      seo_keywords: ["smart cities", "urban infrastructure intelligence", "city sustainability data"],
      social_proof: [
        "Pilots with municipal strategy teams.",
        "Used in forward planning for fast-growing districts.",
      ],
      differentiators: [
        "Systems-level modelling built for policy and execution.",
        "Bridges technical analysis with executive decision workflows.",
      ],
    },
    intelligence_validation: {
      confidence_score: 90,
      confidence_levels: {
        company_name: "high",
        mission: "medium",
        audience: "medium",
      },
      validated_fields: ["company_name", "industry", "offerings", "value proposition"],
      missing_fields: ["peer-reviewed clinical benchmarking references"],
      warnings: ["Performance claims must stay evidence-based."],
      reviewer_notes: "Strong positioning for public-sector strategic planning.",
      visual_palette_rationale:
        "Near-black typography-forward framing mirrors municipal seriousness while sand neutrals reduce fatigue across documentation-heavy personas. Accent gold stays restrained—authority before spectacle when briefing policymakers.",
      brand_voice_descriptors: ["Evidence-led", "Strategic", "Civic-minded", "Visionary", "Grounded"],
    },
    brand_kit: {
      brand_name: "Inara Technology",
      primary_hex: "#1B1B1B",
      secondary_hex: "#F9F9F9",
      accent_hex: "#E6B325",
      neutral_hex: "#F9F9F9",
      typography: {
        heading_font: "Space Grotesk",
        body_font: "Inter",
      },
      tone_of_voice: ["visionary", "academic", "future-ready"],
    },
    product_marketing_context: {
      mission_statement: "Empowering city leaders for tomorrow's urban infrastructure.",
      product_summary:
        "Inara Technology equips urban leaders with intelligence tools to plan resilient and sustainable cities.",
      target_personas: [
        "City innovation director",
        "Urban planning strategist",
        "Government infrastructure advisor",
      ],
      pains_solved: [
        "Disconnected planning across transport, housing, and utilities",
        "Low confidence in long-horizon urban infrastructure bets",
        "Difficulty balancing growth with sustainability mandates",
      ],
      messaging_pillars: [
        "Smart city foresight",
        "Evidence-led sustainability planning",
        "Future-ready infrastructure governance",
      ],
      launch_goals: ["Increase city pilot deployments", "Expand planning authority partnerships"],
      primary_cta: "Book an urban intelligence briefing",
      sop_focus: ["Smart Cities", "Sustainability"],
      preferred_channels: ["LinkedIn (Government/Urban Planning)"],
    },
  },
  {
    company_url: "https://relevanceai.com",
    website_intelligence: {
      website_url: "https://relevanceai.com",
      company_name: "Relevance AI",
      domain: "relevanceai.com",
      industry: "AI Workforce Platform",
      audience_summary:
        "GTM and sales operations leaders deploying multi-agent systems to scale revenue workflows.",
      key_value_propositions: [
        "Build and orchestrate AI agents for real business workflows.",
        "Deploy AI teammates with governance and observability.",
        "Accelerate automation without heavy engineering overhead.",
      ],
      product_offerings: ["AI Agent Builder", "Workforce Orchestration", "Agent Ops Analytics"],
      seo_keywords: ["ai workforce", "multi agent platform", "agent orchestration"],
      social_proof: [
        "Adopted by modern teams automating customer and ops workflows.",
        "Strong traction in agent-native automation use cases.",
      ],
      differentiators: [
        "End-to-end workflow builder optimized for multi-agent collaboration.",
        "Fast deployment loop from prototype to production ops.",
      ],
    },
    intelligence_validation: {
      confidence_score: 95,
      confidence_levels: {
        company_name: "high",
        mission: "high",
        audience: "high",
      },
      validated_fields: ["company_name", "industry", "offerings", "differentiators"],
      missing_fields: ["public benchmark metrics by vertical"],
      warnings: ["Automation ROI claims should be measurable and specific."],
      reviewer_notes: "Clear market signal in AI workforce category.",
      visual_palette_rationale:
        "Deep navy communicates automation seriousness without enterprise clichés while pale neutrals keep workflow canvases readable during orchestration-heavy demos. Violet accents cue innovation-forward urgency aligned with revenue ops narratives.",
      brand_voice_descriptors: ["Confident", "Energetic", "Systems-minded", "Outcome-led", "Bold"],
    },
    brand_kit: {
      brand_name: "Relevance AI",
      primary_hex: "#000383",
      secondary_hex: "#F6F3EE",
      accent_hex: "#9646E5",
      neutral_hex: "#F6F3EE",
      typography: {
        heading_font: "Inter",
        body_font: "Inter",
      },
      tone_of_voice: ["confident", "energetic", "multi-agent focused"],
    },
    product_marketing_context: {
      mission_statement: "Building the world's autonomous AI workforce.",
      product_summary:
        "Relevance AI helps teams design, deploy, and manage coordinated AI agents that execute core business workflows.",
      target_personas: [
        "Operations leader scaling processes",
        "Growth manager automating outreach and qualification",
        "AI product owner building internal copilots",
      ],
      pains_solved: [
        "Teams stuck with one-off automations that do not scale",
        "AI workflows breaking without agent orchestration and oversight",
        "Long implementation cycles for repeatable process automation and growth ops",
      ],
      messaging_pillars: ["Agent-native operations", "Rapid deployment", "Scalable orchestration"],
      launch_goals: ["Increase qualified enterprise demos", "Grow active AI workforce deployments"],
      primary_cta: "Build your AI workforce",
      sop_focus: ["Multi-agent orchestration", "doubling human prosperity"],
      preferred_channels: ["LinkedIn (GTM/Sales)"],
    },
  },
];

export function getMockCompanies(): MockCompanyProfile[] {
  return MOCK_COMPANIES;
}

export function findMockCompanyByUrl(
  companyUrl: string,
): MockCompanyProfile | undefined {
  const normalizedInput = normalizeUrl(companyUrl);
  return MOCK_COMPANIES.find((company) => {
    return normalizeUrl(company.company_url) === normalizedInput;
  });
}

function normalizeUrl(value: string): string {
  try {
    const parsed = new URL(value);
    const normalizedHost = parsed.hostname.replace(/^www\./, "");
    return `${parsed.protocol}//${normalizedHost}`.replace(/\/$/, "").toLowerCase();
  } catch {
    return value.trim().toLowerCase().replace(/\/$/, "").replace(/^https?:\/\/www\./, "https://");
  }
}
