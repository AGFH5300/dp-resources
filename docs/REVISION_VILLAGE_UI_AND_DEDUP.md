# Revision Village Question Bank UI and deduplication

This follow-up completes the user-facing support for the audited Revision Village import and hardens the shared Question Bank against exact duplicate cores.

## Interface support

- authenticated audio playback through the existing private Question Bank asset route
- listening transcripts and source durations
- all linked paper references displayed together on the question
- private formula booklets resolved from paper assets before the native fallback
- provider-neutral solution references shown with their provider and identifier when no public URL exists
- existing Vimeo and verified HTTPS solution links remain supported

## Duplicate handling

The production audit found no duplicate rows created by the Revision Village import. It did identify 120 older PESTLE Mathematics AA/AI core pairs with identical audited content and different taxonomy/source metadata.

Migration `20260727174500_question_bank_core_deduplication.sql`:

1. verifies every shared content hash has identical canonical question fields;
2. verifies consolidation cannot create variant, progress, or saved-question collisions;
3. preserves every original core's source metadata on the retained core;
4. repoints variants and all question-level references;
5. removes only the redundant core rows; and
6. adds a unique index on `dp_qb_questions.content_hash` so exact duplicate cores cannot recur.

The migration was applied to production and independently verified with zero duplicate core groups, zero structural duplicate groups, and zero orphan rows.
