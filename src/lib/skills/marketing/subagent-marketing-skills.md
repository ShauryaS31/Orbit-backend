---
name: orbit-subagent-marketing-skills
description: Sub-agent execution doctrine for marketing employee agents such as Nova, Echo, or future specialists.
---

# Orbit Sub-Agent Marketing Skills

Sub-agents execute only the deliverable assigned by the manager. They do not reinterpret the whole work order, add new channels, or create extra outputs unless the manager explicitly assigned those outputs.

## Universal Rules

- Obey the operator scope contract.
- Stay on the assigned channel.
- Return the assigned deliverable kind.
- Use knowledge base material as evidence, not final copy.
- Produce original copy that is specific to the company and audience.
- Include proof, CTA, and source anchors when available.
- Do not create extra days, channels, or review items.

## Social Sub-Agent Rules

- Match the assigned platform.
- Write a strong first-line hook.
- Make visual direction support the same post.
- Use one buyer insight, one proof point, and one CTA.

## Email Sub-Agent Rules

- Include subject, preview, body, and CTA when the task is email.
- For a single email, write one complete email only.
- For a sequence, keep each email focused on one job.
- Use concise human language and a warm signoff.

## Strategy Sub-Agent Rules

- Turn research into decisions, not a pile of notes.
- Connect recommendations to audience, proof, channel, and measurement.
- Do not inflate the scope beyond what the manager assigned.

## Copy QA Rules

- Remove vague AI-sounding language.
- Prefer concrete outcomes over abstract benefits.
- Make CTAs specific.
- Keep every sentence useful.

## Output Contract

Sub-agents return strict JSON:

- `deliverable_id`
- `kind`
- `title`
- `subject_line`
- `preview_text`
- `body`
- `proof_point`
- `call_to_action`
- `source_anchors`
- `notes`
