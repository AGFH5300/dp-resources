# Post-production release audit — 16 September 2026

Production baseline: `400999180c4f89f6aaa4f9178af9a465b022dded` (13 September attachment release, currently live on Render during this audit).

Audit scope: every completed user-facing change after that production SHA through 16 September 2026, cross-checked against GitHub history, live Supabase state, applied Supabase migrations, and DP Resources ChatGPT work history. Staging-only, abandoned, or unfinished experiments are excluded from public release notes.

## Live data/content changes that GitHub history alone does not capture

- **15 Sep — first Question Bank deduplication:** 415 redundant canonical rows consolidated in live Supabase: 384 confirmed Revision Village/cross-source duplicates and 31 exact Pestle duplicates. Provenance, variants/topic placements, assets, papers/videos, saved questions and user progress were preserved. Sixteen ambiguous Revision Village reference collisions were intentionally left separate. Post-audit: zero high-confidence duplicate candidates, zero exact same-reference/content duplicate groups, and zero orphaned source/variant/progress/saved-question rows.
- **16 Sep — RevisionDojo production import:** 12,306 visible questions audited; 11,832 source IDs accepted; 474 excluded; 28 canonical merges; 3 empty placeholders removed. Current live attribution is 11,763 distinct canonical questions, 15,571 distinct variants and 15,645 RevisionDojo variant-source links. The import also produced 19,898 placements and passed duplicate, empty-question, placement, provenance and search-integrity checks.
- **16 Sep — second global Question Bank cleanup:** another 191 redundant canonical rows were consolidated, reducing 42,189 to 41,998 canonical questions before CBS was added. The cleanup preserved 44,095 question-source and 58,714 variant-source provenance rows plus saved questions, progress, practice and shared-practice references. Final exact, normalized/markup-only, same-placement, duplicate-variant and orphan checks were zero.
- **16 Sep — CBS Physics import and final QA:** 341 exact PDF/source occurrences were reconciled into 232 CBS source groups and 217 distinct canonical questions. Of those, 91 reused existing canonical questions and 126 were genuinely new. CBS now has 302 live variants across Physics A.1–A.5 (137 HL and 165 SL) and 310 CBS variant-source provenance links. Final QA reports 302 ready / 0 quarantined, zero import flags, zero blank questions/markschemes, zero invalid marks, zero missing source IDs, zero duplicate links and no temporary import tables left behind.
- **Current post-CBS Question Bank state:** 42,124 canonical questions, 57,776 variants, 44,327 question-source rows and 59,024 variant-source rows.

## GitHub/application changes since production

- New 12-step guided onboarding across Library, IB Resource Library, Question Bank, Search, Practice Builder, Sources, Recent, Saved and Settings.
- Replayable tutorial from Settings, required-click cues, background lock, stable target tracking, loading-shell targets and faster cross-route transitions.
- Practice Builder light-mode selection/completed-state polish and clearer eligible-question feedback.
- Question Bank/Practice Builder timeout resilience, fail-soft optional counts, reduced speculative prefetching and source-count query/index improvements.
- CH0007 duplicate repair with Revision Town/Revision Village provenance preserved.
- Imported answer-macro/rendering compatibility repair.
- Dark-mode readability improvements for Support/resource-report attachment controls.

## Public release-note policy

The Changelog is exhaustive for completed user-facing changes in this production-to-now window. What’s New is shorter, but must headline the large RevisionDojo and CBS additions, the live deduplication work, and the major product/UI improvements. Internal-only CI mechanics, temporary import helpers, staging tables and abandoned experiments remain excluded.
