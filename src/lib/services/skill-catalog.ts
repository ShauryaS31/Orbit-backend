/**
 * Stable skill IDs for the Design Artifact / channel catalog. The Marketing Manager
 * routes by ID (not display names) so exports and logs stay deterministic.
 */
export const SKILL_IDS = {
  instagram_carousel_expert: "instagram_carousel_expert",
  instagram_carousel_generalist: "instagram_carousel_generalist",
  linkedin_carousel_artifact: "linkedin_carousel_artifact",
  instagram_story_artifact: "instagram_story_artifact",
  premium_pitch_deck: "premium_pitch_deck",
  multi_channel_social_bundle: "multi_channel_social_bundle",
  linkedin_founder_post: "linkedin_founder_post",
  email_conversion_sequence: "email_conversion_sequence",
} as const;

export type StableSkillId = (typeof SKILL_IDS)[keyof typeof SKILL_IDS];

export type GoalKind = "conversion" | "investor" | "awareness" | "general";

export function classifyGoalKind(businessGoal?: string, successMetric?: string): GoalKind {
  const blob = `${businessGoal ?? ""} ${successMetric ?? ""}`.toLowerCase();
  if (/invest|fund|raise|deck|pitch|venture|series|capital|ask/.test(blob)) return "investor";
  if (/aware|brand|reach|top.{0,18}funnel|impression|visibility/.test(blob)) return "awareness";
  if (/convert|conversion|demo|book|trial|signup|pipeline|sql|revenue|meeting/.test(blob)) {
    return "conversion";
  }
  return "general";
}

/** Priority order reflects goal → modular artifact emphasis (design-artifact-skill bundle). */
export function resolveSkillsForGoal(goalKind: GoalKind, carouselMaker: boolean): StableSkillId[] {
  const conversionFirst: StableSkillId[] = [
    SKILL_IDS.linkedin_carousel_artifact,
    SKILL_IDS.instagram_story_artifact,
    SKILL_IDS.email_conversion_sequence,
    SKILL_IDS.linkedin_founder_post,
    SKILL_IDS.multi_channel_social_bundle,
    SKILL_IDS.instagram_carousel_generalist,
    SKILL_IDS.premium_pitch_deck,
  ];
  const investorFirst: StableSkillId[] = [
    SKILL_IDS.premium_pitch_deck,
    SKILL_IDS.linkedin_carousel_artifact,
    SKILL_IDS.linkedin_founder_post,
    SKILL_IDS.instagram_story_artifact,
    SKILL_IDS.multi_channel_social_bundle,
    SKILL_IDS.instagram_carousel_generalist,
    SKILL_IDS.email_conversion_sequence,
  ];
  const awarenessFirst: StableSkillId[] = [
    SKILL_IDS.multi_channel_social_bundle,
    SKILL_IDS.instagram_carousel_generalist,
    SKILL_IDS.linkedin_founder_post,
    SKILL_IDS.instagram_story_artifact,
    SKILL_IDS.linkedin_carousel_artifact,
    SKILL_IDS.email_conversion_sequence,
    SKILL_IDS.premium_pitch_deck,
  ];

  let base: StableSkillId[];
  switch (goalKind) {
    case "investor":
      base = investorFirst;
      break;
    case "awareness":
      base = awarenessFirst;
      break;
    case "conversion":
      base = conversionFirst;
      break;
    default:
      base = conversionFirst;
  }

  if (carouselMaker) {
    return [
      SKILL_IDS.instagram_carousel_expert,
      ...base.filter((id) => id !== SKILL_IDS.instagram_carousel_generalist),
    ];
  }
  return base;
}
