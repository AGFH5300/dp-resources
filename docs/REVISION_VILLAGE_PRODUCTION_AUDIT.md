# Revision Village Question Bank production audit

Audit date: 28 July 2026  
Import batch: `2a07bc8c-ae3d-4b41-a695-d97a45bbe413`

## Scope

The audit covered every Revision Village record currently associated with the Question Bank:

- 2,369 unique source question cores
- 4,308 course-level variants
- question content, markschemes and examiner reports
- topic/subtopic placement and search rows
- interactive option banks and answer groups
- images and every captured source alias
- audio directives, stored audio and transcript/duration metadata
- solution-video associations
- browser attempt persistence
- imported formatting and table syntax

## Results

### Database completeness

- Blank question content: 0
- Blank markschemes: 0
- Missing search rows: 0
- Missing placements: 0
- Missing Revision Village source associations: 0
- Failed or unverified attached assets: 0
- Broken solution-video rows: 0

### Interaction audit

The corpus contains 1,152 actual MCQ or multi-select option-bank variants across Biology, Chemistry, Physics, Psychology, English B, French B and Spanish B. Every one has a parseable source answer group. Three History source tables resemble A/B option rows but do not have answer groups and intentionally remain non-interactive.

The production parser:

- renders every confidently mapped choice section in its original location
- supports multiple independent choice sections
- enforces exact multi-select counts
- compares answer sets without depending on click order
- keeps repeated option letters isolated by section
- maps explicit answers by numbered/range references
- falls back to the complete reveal-only question whenever mapping is ambiguous

### Audio audit

- Audio directives: 170
- Directives with a source identifier: 170
- Directives resolving to one verified attached asset: 170
- Missing or ambiguous directive associations: 0
- Unique audio assets: 89
- Unverified, empty or wrong-content-type audio: 0

Twelve source recordings have no transcript and eight have no duration metadata. Both fields are optional; authenticated playback remains available.

### Image audit

Every image reference is resolved by either:

1. a verified asset attached to the variant, including all deduplicated source aliases; or
2. one of four audited fallbacks for source files that were absent from the captured archive.

The four absent source IDs cover:

- a Viking sailing-route map
- the BU 6635 displaced-persons photograph
- two ESS system-diagram markscheme illustrations

The database audit migration recognizes both source aliases and these four fallbacks, then re-audits only the 12 affected variants instead of blindly forcing their status.

### Imported rendering syntax

The final renderer normalizes all syntax families found in the corpus, including:

- audio directives
- answer, mark, underline, bold, superscript and span directives
- source boxes and the one subscript directive
- center/centre, left, indent and table containers
- copied `<no link>` URL markers
- incomplete pipe-table rows inside explicit table blocks

### Evidence retained in the pull request

Regression coverage includes:

- EB0143 composite listening structure
- EB0382 and EB0383 exact-count multi-select behavior
- independent grouped browser state
- conflicting numbered answer references
- textual and UUID audio identifiers
- per-segment audio ordering
- deduplicated source-image aliases
- all four curated source-image fallbacks
- copied-link cleanup and incomplete imported table rows

The fresh review is required to examine the entire final diff, including the API alias handoff, renderer compatibility layers, database audit migration and all regression tests. Earlier reviews of partial commits are not sufficient for the production gate.

## Production gate

The pull request must not be merged until all of the following pass against the final squashed head:

1. TypeScript typecheck
2. Complete Vitest suite
3. ESLint
4. Next.js production build
5. High-severity production dependency audit
6. Fresh automated code review with no unresolved findings
7. Signed-in Replit smoke test using the representative URLs supplied with the pull request
