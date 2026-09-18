# Save My Exams Physics A.1 production audit — 18 September 2026

## Final imported set

The Save My Exams Physics A.1 Kinematics source set contained **44 question rows** across six source PDFs:

- 30 multiple-choice variants: 10 Easy, 10 Medium, 10 Hard.
- 14 long-response variants: 5 Easy, 5 Medium, 4 Hard.
- 42 rows became new canonical questions.
- 2 rows reused existing canonical questions after matching, avoiding duplicate question cores.
- All 44 source rows resolve to distinct live Save My Exams variants.

## Production integrity

The completed import has **44 ready variants** and zero quarantined variants. Every imported variant has a course, dataset, topic, source attribution, variant-topic membership and subtopic placement. The final asset stage contained 35 assets; all 35 exist in the live asset table and all 35 are linked to live variants.

The visual audit found no render issue codes. Three rows were conservatively flagged as visually dependent by staging heuristics but do not contain an unresolved protected image reference in the rendered question, so they remain safe to display.

One reused multiple-choice question had a stale zero mark in the canonical row despite an existing answer and a one-mark source question. Its maximum mark was corrected to 1 during finalization.

## Answer availability

The supplied Save My Exams files are question papers, not mark-scheme papers. The 42 newly imported canonical questions therefore do not claim a source-provided mark scheme. DP Resources renders those questions as non-interactive or self-assessed practice rather than fabricating an answer. The two reused questions retain their existing canonical answer data.

## Final Question Bank state

After the import:

- **42,166** canonical questions.
- **57,820** total variants.
- **57,740** ready variants.
- **44,371** question-source rows.
- **59,068** variant-source rows.
- **44** Save My Exams ready variants.
- **302** CBS ready variants.
- CBS and Save My Exams have zero overlapping variant IDs in this imported Physics coverage, giving 346 unique variants across those two source sets.

## Cleanup

The public SME question and asset staging tables were removed after verification. The import-only public staging RPC and the three private SME matching/staging tables were also removed. The final Supabase security advisor no longer reports any SME-specific function or staging-table finding.

The profile-repair portion of the finalization migration backfills only missing public profiles whose username and full name can be recovered from the account's own Auth metadata without a username or email conflict. Conflicting legacy accounts are deliberately left untouched for manual identity resolution.

## UI synchronization

The Practice Builder loading shell was refreshed after the import to use the same reviewed source counts as production, including CBS and Save My Exams, so onboarding no longer presents stale placeholder source totals. The related tutorial and release regressions are included in the final production validation.

Diagnostic validation is being used to isolate the remaining repository test-runner stall before final sign-off.
