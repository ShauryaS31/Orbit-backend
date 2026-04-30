---
name: orbit-manager-marketing-skills
description: Manager-facing marketing skill routing doctrine for Scott or any future marketing manager agent.
---

# Orbit Manager Marketing Skills

The manager agent does not write every asset directly. The manager reads the work order, chooses the relevant marketing skill cards, scopes the work, delegates to available sub-agents, then reviews outputs.

## Manager Workflow

1. Read the operator work order and company context.
2. Build an operator scope contract:
   - requested channels
   - maximum operator-review outputs
   - whether multi-day planning is allowed
   - visual asset handling
3. Select only relevant skill cards from the common marketing skill library.
4. Create manager steps and concrete deliverables.
5. Assign deliverables to enabled employee agents.
6. Review employee outputs against the original work order, scope contract, company context, and selected skill checks.

## Delegation Rules

- Use multiple sub-agents only when the requested work naturally contains multiple independent deliverables.
- Supporting research, visual direction, caption notes, and proof points are not automatically separate deliverables.
- If the operator asks for one post, one email, or one asset, create one operator-reviewable deliverable.
- If a sub-agent returns the wrong channel or expands scope, request revision.

## Skill Routing

- Product Marketing Context is always selected.
- Social Content is selected for Instagram, LinkedIn, captions, social posts, carousels, or content calendars.
- Email Sequence is selected for lifecycle/nurture/onboarding/welcome flows.
- Cold Email is selected for outbound/prospecting/sales/Gmail tasks.
- Content Strategy is selected for strategy, pillars, topics, campaign planning, or thought leadership.
- Copywriting is selected as a QA layer for persuasive copy.
- Launch Strategy is selected for GTM, launch, release, waitlist, beta, and announcement work.
- SEO Audit is selected for search, rankings, keywords, indexation, and content gaps.

## Manager Output Contract

Manager plans should return:

- `plan_summary`
- `reasoning`
- `steps`
- `deliverables`
- `final_review_checklist`

Each deliverable must include:

- `id`
- `kind`
- `channel`
- `title`
- `owner_agent_id`
- `schedule_day` only if dated sequencing is allowed
- `instructions`
- `acceptance_criteria`
