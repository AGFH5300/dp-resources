# Exam-Mate Question Bank import

## Authorised and reviewed source

DP Resources holds written Exam-Mate authorisation dated 29 July 2026 for the authenticated storage, indexing, processing and display of the authorised question-bank content. The private correspondence is not committed to this public repository.

The importer is pinned to the reviewed source-first capture:

- Audit ZIP SHA-256: `0ba6835f8046af116c589a6545af7f02d472e059cdb8488d7eb4fcd4dd65fa4f`
- `checksums.sha256` SHA-256: `ac4699532e92f6dd40ae79a89bc03b4b2556d2ab3030c766ba84bed70224d361`
- Indexer version: `1.2.2`

The capture contains 14,199 IB Diploma source questions from 11 populated subjects and 31,336 unique physical image files. Review identified 71 source questions that must remain quarantined:

- missing question or answer payloads; or
- one or more referenced images absent from the verified asset manifest.

The resulting import scope is:

- 14,128 importable source questions;
- 71 quarantined source questions;
- 32,093 importable source asset URLs; and
- 31,231 unique importable physical assets.

## Source handling

The adapter verifies the exact audit ZIP and every checksummed metadata file before normalization. It does not trust directory names or mutable source counts.

The complete binary assets are not included in the upload-sized audit ZIP. Asset upload therefore requires the original local capture directory:

```text
~/Desktop/ExamMate-index-20260729-223333
```

The directory must retain its original `assets/sha256` hierarchy.

## Deduplication and provenance

The production resolver is additive. It attempts to reuse an existing question core in this order:

1. identical canonical content hash;
2. one exact existing reference; and
3. an equivalent IB exam reference normalized across Exam-Mate and PESTLE formats.

Exam-Mate provenance is then stored separately in `dp_qb_question_sources` and `dp_qb_variant_sources`, even when an existing question core is reused.

Assets are content-hash deduplicated. Multiple Exam-Mate URLs can point to one canonical asset while retaining individual source rows and question associations.

## Safety gates

Available modes:

- `audit`: verifies the pinned archive and reviewed counts without connecting to production;
- `dry-run`: resolves against production and reports intended rows without writing;
- `database`: appends missing Supabase rows;
- `assets`: uploads and read-back verifies required private R2 objects;
- `all`: database, assets and scoped post-import verification; and
- `verify`: read-only verification of Exam-Mate source associations and assets.

`database`, `assets` and `all` require `--confirm-production`. `assets` and `all` additionally require `--assets-root`.

No mode deletes, replaces or rewrites existing Question Bank content.

## Commands

Audit the reviewed ZIP:

```bash
npm run question-bank:exam-mate -- \
  --archive "$HOME/Desktop/ExamMate-index-20260729-223333/ExamMate-audit-bundle-20260729-234339.zip" \
  --mode audit
```

Resolve against production without writing:

```bash
npm run question-bank:exam-mate -- \
  --archive "$HOME/Desktop/ExamMate-index-20260729-223333/ExamMate-audit-bundle-20260729-234339.zip" \
  --mode dry-run
```

Complete import after reviewing the dry-run report:

```bash
npm run question-bank:exam-mate -- \
  --archive "$HOME/Desktop/ExamMate-index-20260729-223333/ExamMate-audit-bundle-20260729-234339.zip" \
  --assets-root "$HOME/Desktop/ExamMate-index-20260729-223333" \
  --mode all \
  --workers 8 \
  --confirm-production
```

Reports are written under `.question-bank-reports/` unless `--report` is supplied.

## Verification expectations

A successful full run must confirm:

- 14,128 Exam-Mate question-source rows;
- every expected Exam-Mate variant-source row;
- 31,231 verified R2 source assets; and
- no missing source IDs, variant keys or physical hashes.

The 71 quarantined records remain visible in the import findings and are not inserted into the student-facing Question Bank.
