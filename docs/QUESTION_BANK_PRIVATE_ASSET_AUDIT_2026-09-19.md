# Question Bank private asset audit — 19 September 2026

## Outcome

The Question Bank no longer renders imported supporting images directly from third-party source websites. Imported diagrams and markscheme images are served through the existing authenticated DP Resources asset route and private storage pipeline.

## Production reconciliation

- Remote image references staged for reconciliation: **2,919**
- Successfully internalized or matched to an existing verified DP Resources asset: **2,880**
- Source references that could not be recovered because the upstream object was missing, inaccessible, invalid, or corrupt: **39**
- Canonical questions affected by those unrecoverable references: **33**
- Variants withheld because required supporting imagery is unavailable: **68**
- Remaining remote Markdown image references in Question Bank question content: **0**
- Remaining remote Markdown image references in Question Bank markschemes: **0**

Unrecoverable questions remain quarantined with `missing_question_image` and/or `missing_markscheme_image` instead of falling back to a provider-hosted image.

## Compression

The one-off finalization run reused the production Question Bank optimizer:

- Optimized assets in this repair run: **2,682**
- Original bytes for those optimized assets: **610,759,673**
- Verified delivery bytes: **205,228,963**
- Bytes saved: **405,530,710** (about **66.4%**)
- Optimized objects were read back and checked for byte length and SHA-256 before acceptance.

Across the complete production optimization table after this repair:

- Verified optimized assets: **12,879**
- Original bytes represented: **1,167,175,975**
- Optimized bytes: **417,183,899**
- Total verified bytes saved: **749,992,076**

Canonical source objects remain private and verified. Optimized copies are used only when the optimizer produces a meaningful saving.

## Final live Question Bank state

- Canonical questions: **42,166**
- Total variants: **57,820**
- Ready/live variants: **57,675**
- Quarantined variants: **145**
- Question-source rows: **44,371**
- Variant-source rows: **59,068**

Ready variants by reviewed source:

- RevisionDojo: **15,503**
- Exam-Mate: **13,374**
- PESTLE: **13,190**
- Revision Town: **12,172**
- Revision Village: **4,173**
- CBS: **302**
- Save My Exams: **44**

Source totals can overlap because a variant may have provenance from more than one source.

## Cleanup

- Temporary remote-asset staging table removed.
- Temporary backfill control table removed.
- Temporary claim function removed.
- One-off Edge Function retired and returns HTTP 410.
- Temporary browser hotlink renderer removed.
- Temporary external image CSP allowances removed.
- One-off GitHub workflow and finalizer script removed after completion.
- No Render deployment was performed as part of this repair.
