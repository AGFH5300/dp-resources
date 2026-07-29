# Question Bank asset compression

## Why this is separate from the source importers

Question Bank media is content-hash deduplicated and linked to thousands of
question variants through stable asset UUIDs. Replacing canonical rows or
changing their source hashes would risk breaking those relationships and would
also weaken the existing archive verification model.

The compression pipeline therefore leaves `dp_qb_assets` unchanged and stores a
verified delivery variant in `dp_qb_asset_optimizations`. The authenticated
asset route serves the optimized object when that row is verified and otherwise
falls back to the canonical object.

## Production inventory before optimization

The production table contained 12,335 assets totaling approximately 655 MB when
this pipeline was prepared. The useful optimization target is overwhelmingly
raster images:

| Type | Files | Stored bytes |
| --- | ---: | ---: |
| PNG | 10,230 | 549,458,357 |
| SVG | 1,607 | 19,699,199 |
| JPEG | 401 | 26,779,716 |
| Audio | 89 | 59,298,618 |
| PDF | 7 | 8,582,890 |
| ICO | 1 | 47,582 |

Audio, PDFs and icons are not recompressed. M4A/MP3 and PDF are already
compressed formats, the single WAV file requires a separate listening-quality
review before conversion, and ICO is negligible.

## Compression rules

- PNG: compare maximum-effort optimized PNG with lossless WebP and retain the
  smaller result.
- JPEG: convert to WebP at quality 92 with high-effort encoding.
- SVG: remove comments and inter-tag whitespace conservatively without changing
  visible text spacing or path data.
- Adopt a variant only when it saves at least 1,024 bytes and at least 5% by
  default.
- Verify every original against its canonical byte size and SHA-256 before
  processing.
- Upload to a content-addressed optimized key, then read the object back and
  verify its byte size and SHA-256 before recording it as verified.

Optimized keys use:

```text
question-bank/assets/optimized/sha256/<first-two-hash-chars>/<sha256>.<extension>
```

## Required rollout order

1. Merge and deploy the migration and asset-route support.
2. Run a read-only dry run and inspect the report.
3. Run a small canary optimization, normally 100 assets.
4. Smoke-test representative Mathematics, Physics, Chemistry, Biology,
   Geography, History and language/listening questions in production.
5. Run the full optimization.
6. Leave canonical objects in place during the observation period.
7. Only after optimized delivery is confirmed stable, run a canary cleanup and
   then the full cleanup to remove canonical objects that have verified
   optimized replacements.

Cleanup is deliberately separate and requires both `--confirm-production` and
`--delete-originals`. It verifies the optimized object again immediately before
removing the canonical R2 object.

## Commands

Read-only measurement:

```bash
npm run question-bank:optimize-assets -- --mode dry-run
```

Canary upload:

```bash
npm run question-bank:optimize-assets -- \
  --mode optimize \
  --limit 100 \
  --confirm-production
```

Full upload:

```bash
npm run question-bank:optimize-assets -- \
  --mode optimize \
  --confirm-production
```

Canary original-object cleanup after deployment and smoke testing:

```bash
npm run question-bank:optimize-assets -- \
  --mode cleanup \
  --limit 100 \
  --confirm-production \
  --delete-originals
```

The manual GitHub Actions workflow **Optimize Question Bank assets** exposes the
same guarded stages and uploads the generated JSON report as a workflow
artifact.

## Rollback

Before cleanup, rollback is immediate: remove or mark the optimization row
failed and the existing asset route falls back to the canonical object.

After cleanup, the optimized object remains verified and continues serving under
the same asset UUID. Restoring the canonical object requires rerunning the
appropriate checksum-pinned source importer or re-uploading the exact authorized
source bytes. For that reason, cleanup must not be run during the initial
optimization rollout.
