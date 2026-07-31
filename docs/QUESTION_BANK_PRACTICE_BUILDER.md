# Question Bank Practice Builder

## Status

This document is the implementation contract for the next Question Bank experience. It is intentionally stricter than a UI proposal: database schema, APIs, allocation rules, ownership, deduplication, session immutability and rollout must follow this contract.

The existing imported Question Bank remains the authoritative source-content layer. This feature is additive and must not rename, merge, delete or rewrite imported subjects, courses, topics, subtopics, questions, variants, assets, source provenance or user progress.

## Product model

The Question Bank has two user-facing entry points:

1. **Practise a course** — choose one IB course and optionally narrow its content.
2. **Build a practice set** — combine one or more concepts or whole courses across one or more subjects, with independent course choices and question quotas for every selected block.

Both entry points produce the same persistent, fixed practice session.

A one-concept set is not a separate mode. It is the simplest possible custom practice set.

## Core terms

### Imported taxonomy

The existing source-preserving hierarchy:

`Subject → Course → Topic → Subtopic → Question variant`

It remains untouched and continues to preserve syllabus, level, provider and source provenance.

### Student-facing concept

A reviewed, subject-specific learning concept such as Kinematics, Integration, Market Failure or Cell Respiration. A concept may map to several exact imported topics/subtopics across current, legacy, SL and HL courses.

Concept mappings are explicit. Canonical-name equality may generate review suggestions, but it must never automatically approve a mapping.

### Practice set

A reusable or draft configuration owned by one user. It contains ordered content blocks, global defaults and optional per-block overrides.

### Content block

One requested source of questions. A block is either:

- a concept plus one or more explicitly selected courses belonging to that concept's subject; or
- a whole course.

Every block has its own requested question count. Different concepts in the same subject may select different courses.

### Practice session

A generated, immutable queue snapshot. Regenerating the same practice set creates a new session; refreshing or resuming an existing session never changes its queue.

## Required example

The permanent acceptance fixture is:

| Block | Selection | Allowed courses | Requested |
| --- | --- | --- | ---: |
| 1 | Physics · Kinematics | Physics SL 2025 + Physics SL legacy | 10 |
| 2 | Physics · Forces and Momentum | Physics SL 2025 + Physics HL 2025 | 10 |
| 3 | Mathematics · Integration | Mathematics AA HL | 10 |
| 4 | Chemistry · Stoichiometry | Chemistry SL 2025 + Chemistry HL 2025 | 10 |

A successful generated session contains exactly 40 distinct `question_id` values, and every selected `variant_id` belongs to a course allowed by its allocated block.

## Non-negotiable behaviour

1. Deduplicate by `question_id`, never by reference, text, topic, course or variant.
2. A question matching multiple blocks appears once in a session.
3. Every session item has one primary allocation block and may retain additional matched blocks.
4. A shared question occupies one question slot, not one slot per matched block.
5. Block quotas are fulfilled through overlap-aware allocation; generation must not greedily exhaust candidates needed by a more constrained block.
6. If the requested configuration cannot be fulfilled, return a precise shortage. Never silently include excluded courses, statuses, difficulties or completed questions.
7. Representative variants are selected deterministically from a block's allowed courses.
8. The same configuration and generation seed must produce the same queue.
9. A generated queue is persisted before practice begins.
10. Concept-mapping edits do not mutate existing session queues.
11. Global question progress remains keyed by `question_id`; session-item progress remains independent.
12. Users can only read or modify their own sets and sessions.

## Concept catalogue

The student-facing catalogue is separate from imported taxonomy.

Concepts are grouped hierarchically by subject. Visible terminology may vary by subject—topics, themes, skills, prescribed subjects—but the internal model remains generic.

Mappings support:

- exact topic membership;
- exact subtopic membership;
- explicit per-variant include/exclude overrides;
- review notes and mapping versioning.

A concept may only be presented to members when:

- its status is `approved`;
- every mapped taxonomy row belongs to the same subject;
- at least one render-ready question is available;
- it passes duplicate, orphan and cross-subject validation.

## Practice-set configuration

A practice set stores:

- owner;
- name and draft/saved state;
- schema version and revision;
- ordering mode;
- global default filters;
- ordered blocks.

A concept block stores:

- concept;
- requested question count;
- selected courses and course priority;
- optional filter overrides.

A course block stores:

- course;
- requested question count;
- optional filter overrides.

Global defaults apply unless a block explicitly overrides a supported field.

Initial supported filters:

- progress status;
- saved state;
- revisit state;
- difficulty;
- calculator status;
- paper/section only where unambiguous for the selected courses.

## Preview contract

Preview is read-only and does not generate a queue.

For every block it returns:

- requested count;
- raw matching variants;
- unique matching question cores;
- unique candidates after filters;
- overlap count with other blocks;
- selected-course breakdown;
- shortage, if any.

For the whole set it returns:

- requested total;
- unique available total;
- cross-block overlap total;
- whether the configuration is feasible;
- structured warnings.

Preview and generation must use the same candidate rules. A configuration reported as feasible must not later fail because the generator used different eligibility logic.

## Allocation contract

Allocation is a maximum-cardinality bipartite matching problem:

- left side: one quota slot for each requested question in every block;
- right side: unique question cores;
- edge: a question is eligible for that block and has at least one allowed representative variant.

The implementation may use deterministic augmenting paths or another proven maximum-matching approach. It must not use block-by-block random selection followed by duplicate removal.

Slot processing should prefer constrained blocks, using a stable scarcity ordering such as:

1. candidate count divided by requested count;
2. candidate count;
3. block sort order;
4. block ID.

Within a block, representative candidates use a stable rank:

1. selected course priority;
2. render readiness and verified content requirements;
3. metadata completeness;
4. source order;
5. variant ID.

After allocation, session ordering is a separate operation. Supported ordering modes are:

- mixed;
- grouped by subject/topic;
- interleaved by block;
- easier to harder;
- stable source order.

## Persistence contract

A generated session stores:

- owner and optional originating practice set;
- full configuration snapshot;
- schema version;
- generation seed;
- configuration hash;
- requested and generated totals;
- fixed ordering mode;
- status and timestamps.

Each session item stores:

- fixed position;
- `question_id`;
- representative `variant_id`;
- primary block reference where still available;
- primary-block snapshot;
- independent session-item status and timestamps.

Additional block matches are stored separately with snapshots so deleting or editing the original practice set cannot make the session unauditable.

Required uniqueness:

- `(session_id, position)`;
- `(session_id, question_id)`.

## Question player

The existing question detail, asset, markscheme, examiner-report, video, reporting, saved-state and progress behaviour must be reused.

The current course workspace should be split into a reusable question viewer plus navigation adapters:

- course-list navigation;
- fixed-session navigation.

Temporary answer attempts should move toward `question_id` ownership while retaining the chosen variant for validation. Existing variant-keyed local attempts must remain readable and migrate on next use.

## Security

Shared approved concepts are member-readable and service-role writable.

Users may create, read, update and delete only their own practice-set configuration rows through RLS-protected application paths.

Generated sessions and items are inserted by a reviewed server/API generation path, not by arbitrary browser inserts. Users may read only their own sessions. Session-item mutations must verify ownership server-side.

No API response exposes service-role credentials, object-storage credentials, source URLs, private storage keys or unapproved mappings.

## Performance limits for initial release

- maximum 20 blocks per practice set;
- maximum 10 selected courses per concept block;
- maximum 200 generated questions per session;
- debounced preview requests;
- preview counts before full candidate payloads;
- indexed concept, course, variant, question and ownership joins.

Limits may be raised only after production query plans and latency are reviewed.

## User interface contract

### Landing

Two primary actions:

- Practise a course
- Build a practice set

### Builder

Desktop:

- searchable cross-subject concept/course catalogue;
- selected content blocks;
- live preview and warnings.

Mobile:

1. add content;
2. configure courses;
3. choose quantities and filters;
4. review;
5. start.

Every concept block independently controls its allowed courses. A single global course selector is insufficient and must not replace per-block course selection.

The Start action remains unavailable while the configuration is invalid or has unresolved shortages.

## Rollout

1. Additive foundation schema and validation.
2. Reviewed concept-mapping seed format and audit tools.
3. Read-only catalogue and preview.
4. Deterministic generator and persistent sessions.
5. Reusable player and hidden builder route.
6. Admin/internal testing.
7. Limited member feature flag.
8. Default experience only after observed stability.
9. Existing course routes remain available as rollback/fallback during rollout.

## Release gates

A release cannot proceed unless tests prove:

- 40 requested fixture questions produce 40 unique question cores when feasible;
- overlap cannot starve constrained blocks;
- representative variants always belong to allowed courses;
- impossible configurations report exact shortages;
- the same seed is deterministic;
- refresh/resume preserves order;
- cross-user access is denied;
- imported Question Bank row counts are unchanged by additive migrations;
- existing course practice remains functional.
