# Exam-Mate Question Bank import

## Authorised and reviewed source

DP Resources holds written Exam-Mate authorisation dated 29 July 2026 for the authenticated storage, indexing, processing and display of the authorised question-bank content. The private correspondence is not committed to this public repository.

The importer is pinned to two reviewed inputs.

### Source capture

- Source audit ZIP SHA-256: `0ba6835f8046af116c589a6545af7f02d472e059cdb8488d7eb4fcd4dd65fa4f`
- `checksums.sha256` SHA-256: `ac4699532e92f6dd40ae79a89bc03b4b2556d2ab3030c766ba84bed70224d361`
- Indexer version: `1.2.2`
- Captured questions: `14,199`
- Importable questions: `14,128`
- Quarantined questions: `71`
- Importable source asset URLs: `32,093`
- Importable original physical assets: `31,231`

### Local lossless optimization

- Optimization audit ZIP SHA-256: `e9f5ef0767d2404caabf6d8b328e7b16361cc308841fd964fa99b513b2f3a4b8`
- `optimization-checksums.sha256` SHA-256: `3a7729dcf1cc7db10a1e57bcaa9df4fb7ffaa2e4e940e025efeee2b0d6f73883`
- Upload-plan SHA-256: `4d43d7eeff8bfba65463d72d0d300482d52c0c5cf9df1e3dc7db10ec933f8b74`
- Optimizer version: `1.0.2`
- Full capture assets reviewed: `31,336`
- Selected lossless WebP assets: `31,328`
- Exact verified original PNG assets retained: `8`
- Retained after encoder errors: `2` of the 8 PNGs
- Original bytes: `2,212,998,664`
- Selected bytes: `863,895,760`
- Bytes saved: `1,349,102,904` (`60.962662%`)
- Failed assets: `0`

The optimization pipeline did not alter or delete the originals. Every selected WebP passed decoded-pixel verification. Every retained PNG is selected by its exact original SHA-256 and byte size.

## Required local directory

The binary assets are intentionally excluded from the audit ZIPs. Asset upload requires the complete local capture directory:

```text
~/Desktop/ExamMate-index-20260729-223333
```

Keep both directories until production verification is complete:

```text
assets/sha256/
optimized-assets/sha256/
```

The importer reads the selected path, hash, content type and byte size from:

```text
index/asset-upload-plan.ndjson
```

It does not upload all original PNGs. It uploads the selected lossless WebP for optimized rows and the exact original PNG for the eight retained rows.

## Deduplication and provenance

The production resolver remains additive. It attempts to reuse an existing question core in this order:

1. identical canonical content hash;
2. one exact existing reference; and
3. an equivalent IB exam reference normalized across Exam-Mate and PESTLE formats.

Exam-Mate provenance is stored separately in `dp_qb_question_sources` and `dp_qb_variant_sources`, even when an existing question core is reused.

Assets are deduplicated by the **selected stored content hash**. Exam-Mate source URLs and source-file aliases still point to the selected canonical asset, preserving the original provider provenance while serving the smaller verified file.

## Safety gates

Available modes:

- `audit`: verifies both pinned audit archives and the complete optimization mapping without connecting to production;
- `dry-run`: resolves optimized rows against production and reports intended changes without writing;
- `database`: appends missing Supabase rows;
- `assets`: uploads and read-back verifies the selected private R2 objects;
- `all`: database, selected asset upload and scoped post-import verification; and
- `verify`: read-only verification of Exam-Mate source associations and selected assets.

`database`, `assets` and `all` require `--confirm-production`. `assets` and `all` additionally require `--assets-root`.

No mode deletes or replaces existing Question Bank content. No mode deletes the local original files.

## Commands

Set the reviewed paths:

```bash
ROOT="$HOME/Desktop/ExamMate-index-20260729-223333"
SOURCE_AUDIT="$ROOT/ExamMate-audit-bundle-20260729-234339.zip"
OPTIMIZATION_AUDIT="$ROOT/ExamMate-optimization-audit-20260730-153128.zip"
```

Verify both audits without production access:

```bash
npm run question-bank:exam-mate -- \
  --archive "$SOURCE_AUDIT" \
  --optimization-audit "$OPTIMIZATION_AUDIT" \
  --mode audit
```

Resolve against production without writing:

```bash
npm run question-bank:exam-mate -- \
  --archive "$SOURCE_AUDIT" \
  --optimization-audit "$OPTIMIZATION_AUDIT" \
  --mode dry-run
```

Complete the production import only after reviewing the dry-run report:

```bash
npm run question-bank:exam-mate -- \
  --archive "$SOURCE_AUDIT" \
  --optimization-audit "$OPTIMIZATION_AUDIT" \
  --assets-root "$ROOT" \
  --mode all \
  --workers 8 \
  --confirm-production
```

Reports are written under `.question-bank-reports/` unless `--report` is supplied.

## Verification expectations

A successful full run must confirm:

- `14,128` Exam-Mate question-source rows;
- every expected Exam-Mate variant-source row;
- every selected import asset verified in private R2 by SHA-256 and byte size;
- no missing source IDs, variant keys or selected physical hashes; and
- the `71` quarantined records remain outside the student-facing Question Bank.

Do not remove the original or optimized local asset directories until the final production verification report passes and representative questions have been opened in the live site.
