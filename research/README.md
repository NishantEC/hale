# Research Knowledge Base — Index

This directory holds the long-form research that informs design and engineering decisions for the noop strap stack. The split is by audience, not by topic:

| File | Scope | Best for |
|---|---|---|
| [`../RESEARCH_KNOWLEDGE_BASE.md`](../RESEARCH_KNOWLEDGE_BASE.md) | Algorithm primitives, open-source libraries, public datasets, papers, codebase status & roadmap | "What does the literature say about computing X?" / "What library should we adopt?" / "Where do we stand on each metric?" |
| [`whoop-features-deep-dive.md`](./whoop-features-deep-dive.md) | Every shipped WHOOP feature with inputs, methodology, citations, and a gap-vs-noop column | "How does WHOOP compute X?" / "What product features are we missing?" |

The two files are intentionally separate. The top-level KB is library- and algorithm-centric; the WHOOP deep-dive is product- and feature-centric. They cross-reference each other rather than duplicate.

## When to update

- **`RESEARCH_KNOWLEDGE_BASE.md`** — when a new open-source library/dataset/paper changes our roadmap, or when our codebase capabilities change (status table in §6.1, session learnings appended as new §6.x).
- **`whoop-features-deep-dive.md`** — when WHOOP ships a new feature, when a reverse-engineering paper publishes a better understanding of an existing one, or when we close a gap on our side (mark the row in the §0 summary table).

## Conventions

- Inline markdown links for citations: `([WHOOP blog](url), [paper](url))`.
- Where the actual algorithm is proprietary, name the closest peer-reviewed analog and link both.
- Dates: use ISO `YYYY-MM-DD`. Convert relative dates ("last year") to absolute when writing.
- Don't duplicate. If something is in `RESEARCH_KNOWLEDGE_BASE.md`, link to it from `whoop-features-deep-dive.md` and vice-versa.

## Recent updates

- **2026-05-11** — added `whoop-features-deep-dive.md` (28 sections, ~7.8k words, ~60 citations) covering Healthspan / WHOOP Age, Day Strain, Recovery, Sleep Need, Stress Monitor, Heart Screener, IHRN, Health Monitor, Menstrual Cycle Insights, Pregnancy Coaching, Strength Trainer, WHOOP Coach, Daily Outlook, Journal correlations, Strain Coach, HRV-CV, Auto-detected workouts, Recovery Activities, Performance Assessment, HR accuracy, Blood Pressure Insights, Advanced Labs, May 2026 membership tiers, and an end-of-doc gap analysis vs our stack.
- **2026-05-11** — `RESEARCH_KNOWLEDGE_BASE.md` §6.1 updated (quantile-v1 sleep stager and warmup-gated recovery formula now flagged Working), §3.1 sleep-staging matrix added our row, new §6.7 captured five bugs found+fixed in the 2026-05-11 session.
