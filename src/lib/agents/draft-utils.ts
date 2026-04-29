import type { CampaignCarouselSlide, CampaignExecutionDraft } from "@/lib/types/orbit";

export function slidePrimaryHeadline(slide: CampaignCarouselSlide): string {
  return slide.design_artifact?.headline ?? slide.headline;
}

export function slidePrimaryBody(slide: CampaignCarouselSlide): string {
  return slide.design_artifact?.body ?? slide.supporting_copy;
}

export function getDraftPlainText(draft: CampaignExecutionDraft): string {
  if (draft.type === "carousel") {
    return [
      draft.caption,
      "",
      ...draft.slides.map(
        (slide, index) =>
          `Slide ${index + 1}: ${slidePrimaryHeadline(slide)}. ${slidePrimaryBody(slide)}`,
      ),
    ].join("\n");
  }
  if (draft.type === "linkedin_post") {
    return draft.body;
  }
  return `${draft.subject_line}\n\n${draft.body_markdown}`;
}
