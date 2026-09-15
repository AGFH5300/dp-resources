# RevisionDojo full crawl

Run from the DP Resources repository root:

```bash
node scripts/revision-dojo-full-crawl.mjs \
  --write-state \
  --origins pirateib_sh,pirateib_su \
  --max-urls 100000 \
  --max-depth 50 \
  --concurrency 12 \
  --timeout-ms 15000
```

Outputs:

- `audits/revision-dojo-full-manifest.json`
- `audits/revision-dojo-full-delta.json`
- `audits/revision-dojo-full-state.json`

The crawler recursively follows same-origin HTML routes and records route metadata, resource candidates, asset URLs, page hashes and mirror-deduplicated logical resources. It intentionally does not download or persist third-party protected question text, PDFs, markschemes, notes, images, flashcards, or exemplar bodies. Any later import should use an authorized source archive and run source-independent content dedupe against the existing DP Resources Question Bank and Library before writing production data.
