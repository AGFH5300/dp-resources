# IB DP Question Bank

## Rollout status

This change is additive and review-first. The migration and importer are included
in the feature branch, but the production migration, database import, and asset
upload have **not** been run. A production operator must review the pull request,
confirm a current database backup or point-in-time recovery window, create the
private object bucket, apply the migration, and then run the staged commands
below.

The source archive itself, decrypted datasets, generated NDJSON, reports, and
question images are ignored by Git and must never be committed.

## Verified source model

The importer preserves the archive's three-level identity model:

- 5,135 question cores, keyed by the source question UUID.
- 12,212 course/topic variants, keyed deterministically by dataset, question,
  source index, and occurrence.
- 12,895 authoritative subtopic placements reconstructed from
  `topics.subtopics[].questions[]`, plus two documented fallback placements for
  occurrences missing from their local arrays.

`question.subtopicId` is retained as canonical-source provenance. It is never
used as the sole browse relationship. This preserves all 596 verified cases in
which that value points to a valid subtopic owned by another dataset.

## Database design

The migration is
`supabase/migrations/20260721172634_question_bank.sql`. It does not modify the
existing Google Drive resource-library tables.

| Group | Tables | Purpose |
| --- | --- | --- |
| Import control | `dp_qb_import_batches`, `dp_qb_import_findings` | Archive identity, expected/actual/operation counts, retained anomalies, verification, and resumable batch history. |
| Catalog | `dp_qb_subjects`, `dp_qb_courses`, `dp_qb_datasets`, `dp_qb_topics`, `dp_qb_subtopics`, `dp_qb_papers`, `dp_qb_course_papers` | Browse hierarchy and course-specific paper definitions. |
| Questions | `dp_qb_questions`, `dp_qb_question_variants`, `dp_qb_question_subtopics` | Invariant cores, dataset/course context, and authoritative/fallback placement. |
| Media | `dp_qb_assets`, `dp_qb_asset_sources`, `dp_qb_variant_assets`, `dp_qb_solution_videos`, `dp_qb_variant_solution_videos` | Content-hash-deduplicated private images, source provenance, and authorized Vimeo references. |
| Discovery | `dp_qb_question_search` | Indexed server-side search document for reference, question text, subject, course, topic, subtopic, and paper. |
| User state | `dp_qb_user_progress`, `dp_qb_saved_questions` | Per-user status, revisit flag, last viewed state, and saved questions. |

All tables have RLS enabled. Shared catalog/content is readable only when the
authenticated user has an existing `dp_resource_memberships` row and is not
suspended, matching current DP Resources access rules. A user can read and
write only their own progress/saved rows. Shared content and import-control
writes are not granted to browser roles; they require the server-only service
role. Admin status views use the existing server authorization convention.

The paginated list, search, and neighbour functions execute with invoker rights
and retain RLS. Indexes cover browse order, filters, user state, reference/hash
lookups, and full-text search.

## Asset storage

The preferred production layout is a dedicated private Cloudflare R2 bucket:

```text
provider: r2
bucket: R2_QUESTION_BANK_BUCKET
object key: question-bank/assets/sha256/<first-two-hash-chars>/<sha256>.<extension>
database: provider, bucket, key, MIME, bytes, SHA-256, upload/verification state
delivery: authenticated /api/question-bank/assets/:assetId proxy
```

The dry run found 4,663 unique physical archive paths and 4,558 unique file
content hashes. Only the latter are uploaded. All 4,769 manifest/source aliases
and 11,805 variant associations remain represented in the database. Objects are
private, non-listable to clients, immutable, and resume checks skip rows already
marked verified. The proxy validates membership and suspension server-side,
rate limits requests, sends private cache headers, and applies a sandbox CSP to
SVG responses. Credentials and signed URLs are never stored in content tables.

A private Supabase Storage bucket is supported as an operational fallback by
setting the provider to `supabase`. Create the bucket as private; do not add a
public read policy. The repository does not create either provider's bucket in
the database migration because the selected production provider is an
environment/deployment decision.

The 6,103 unique solution videos remain Vimeo player URLs and are embedded with
restricted iframe permissions, a sandbox, referrer suppression, and lazy
loading. No videos are downloaded. The 18 formula-booklet URLs are retained as
source metadata; the importer does not download them.

## Environment variables

Values must be configured only in the server/runtime environment:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `QUESTION_BANK_STORAGE_PROVIDER` (`r2` preferred; `supabase` supported)
- `R2_QUESTION_BANK_BUCKET` when using R2
- `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`
- `R2_ENDPOINT` only when the account-specific endpoint must be overridden
- `QUESTION_BANK_SUPABASE_BUCKET` when using Supabase Storage

Never expose the service-role key or object-storage credentials with a
`NEXT_PUBLIC_` prefix.

## Import commands

All commands accept a ZIP path or an already extracted directory. Reports are
written under `.question-bank-reports/` by default and are ignored by Git.

Audit source integrity without database/storage access:

```bash
npm run question-bank:audit -- --archive /secure/path/processed-20260721-222121.zip
```

Normalize every row and hash every asset without production writes:

```bash
npm run question-bank:dry-run -- --archive /secure/path/processed-20260721-222121.zip --workers 8
```

After migration review and application, import database rows only:

```bash
npm run question-bank:import -- --archive /secure/path/processed-20260721-222121.zip --mode database --batch-size 250 --confirm-production
```

Upload and verify assets only:

```bash
npm run question-bank:import -- --archive /secure/path/processed-20260721-222121.zip --mode assets --storage-provider r2 --workers 4 --confirm-production
```

Run database import, asset upload, and verification in one reviewed operation:

```bash
npm run question-bank:import -- --archive /secure/path/processed-20260721-222121.zip --mode all --storage-provider r2 --workers 4 --batch-size 250 --confirm-production
```

Read-only verification of an existing import:

```bash
npm run question-bank:import -- --archive /secure/path/processed-20260721-222121.zip --mode verify
```

Resume an interrupted asset upload. Verified object rows are skipped, and
pending/failed rows are retried:

```bash
npm run question-bank:import -- --archive /secure/path/processed-20260721-222121.zip --mode assets --storage-provider r2 --workers 4 --resume --confirm-production
```

Write modes fail unless `--confirm-production` is supplied. Critical archive
verification, database verification, or upload failures produce a non-zero
exit status. Logs and reports omit credentials and signed URLs.

## Dry-run result for the authorized archive

Archive SHA-256:
`e91b6f5752b67626b278b34858ff0f11444bcb11bf0324e4cba1a5edad14a64d`

| Measure | Verified |
| --- | ---: |
| Datasets / topics | 177 / 177 |
| Subtopics | 706 |
| Question occurrences / cores / variants | 12,212 / 5,135 / 12,212 |
| Authoritative / fallback / stored placements | 12,895 / 2 / 12,897 |
| Image manifest aliases / physical paths / content objects | 4,769 / 4,663 / 4,558 |
| Variant-to-asset associations | 11,805 |
| Unique Vimeo URLs / variant-video associations | 6,103 / 14,058 |
| Formula-booklet URLs | 18 |
| Cross-dataset canonical subtopics | 596 |
| Blank question occurrences | 4 |

The verification status was `passed`. No database row or storage object was
written.

Retained findings include the four blank Psychology occurrences (`PS0215` and
`PS0219`), two fallback placements, unusual section values including `NONE`,
`50`, and `OPTION C`, 31 identical-content groups spanning different source
IDs, and 12 question-asset reference occurrences whose file UUID was not found
in the supplied manifest/files. Missing source references remain explicit and
render as unavailable; they are not silently dropped or substituted.

## Production rollout and rollback

1. Confirm the current production backup/PITR window and record the pre-change
   database state.
2. Create the private bucket and configure only server-side credentials.
3. Apply the new timestamped migration. Do not edit an already applied
   migration.
4. Run audit and dry-run against the exact production archive and compare the
   SHA/counts above.
5. Run the database-only import, inspect the protected admin status page, then
   run the resumable asset upload and final verification.
6. Deploy the application only after all required validation and smoke checks.

Practical rollback is batch-scoped and does not touch accounts or the existing
resource library. Disable the Question Bank route/navigation for immediate UI
rollback. Before deleting database rows, preserve the batch report, delete user
state for imported variants if required, delete shared rows whose
`created_by_batch_id` matches the target batch in reverse foreign-key order,
and mark the batch `rolled_back`. Delete only object keys referenced exclusively
by assets created by that batch. Object deletion must be performed through the
configured private storage API; never delete a bucket broadly. The additive
tables and migration can remain dormant, which is the lowest-risk rollback.
