# PirateIB Village question indexer

This tooling inventories the public `https://village.pirateib.su/` app for DP Resources completeness checks.

It is intentionally **read-only** and **metadata/fingerprint-only**:

- discovers the Village app HTML and same/PirateIB-hosted JavaScript bundles;
- discovers JSON/NDJSON question-bank endpoints, including Pestle-style `fileNameMap` structures;
- parses nested question objects without persisting third-party question text, markschemes, or media;
- records source question IDs, subject/course/level/paper/session metadata, topics/subtopics, content lengths, and SHA-256 fingerprints;
- deduplicates repeated source question IDs while retaining occurrence/source information;
- can compare the current Village source IDs against the existing production `revision_village` provenance using **read-only** Supabase queries;
- writes checksums and a compact audit ZIP for later review.

## Run

```bash
npm run question-bank:village-index -- --open
```

If the normal app points to a separate PirateIB JSON asset host that cannot be inferred automatically, pass one or more bases:

```bash
npm run question-bank:village-index -- \
  --candidate-base https://example-assets.pirateib.sh/banks/ \
  --open
```

The indexer only accepts HTTPS sources on the Village host or `*.pirateib.su` / `*.pirateib.sh`.

## Production comparison

With the existing DP Resources Supabase environment variables available:

```bash
npm run question-bank:village-index -- --compare-production --open
```

Required variables:

- `NEXT_PUBLIC_SUPABASE_URL` or `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

The comparison only reads `dp_qb_question_sources` rows where `provider = 'revision_village'` and reports:

- Village source IDs;
- production Revision Village source IDs;
- IDs present in both;
- IDs new in Village;
- production IDs not observed in the current Village capture.

It does **not** insert, update, or delete any production data.

## Output

The default output directory is `~/Desktop/VILLAGE-index-<timestamp>` and contains:

```text
summary.json
checksums.sha256
source/
  source-manifest.json
  json-candidates.json
index/
  questions.ndjson
  source-summary.json
  failures.json
comparison/
  production-source-id-comparison.json   # only when comparison is enabled
VILLAGE-audit-bundle-<timestamp>.zip
```

`index/questions.ndjson` deliberately excludes question/markscheme text. It contains hashes and metadata only.

## Validation

The Vitest coverage verifies:

- strict HTTPS/PirateIB host filtering;
- JavaScript bundle discovery;
- Pestle-style filename-map JSON discovery;
- nested question record detection;
- fingerprint-only output;
- source-ID comparison logic.

The live site is not required for the unit tests; fixture mode is available with `--fixture-dir` for offline structural regression tests.
