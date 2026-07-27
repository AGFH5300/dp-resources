# Revision Village indexing-script recovery

The earlier cleanup preserved too much captured website material. The accompanying recovery command reconstructs a clean, versioned script archive from the cleanup folder in macOS Trash.

It keeps only the actual tools that performed the work:

- versioned indexer packages
- versioned temporary-access diagnostic packages
- versioned question-bank finalizer packages
- `.mjs` and `.command` entry points
- each package's `package.json` and README
- original versioned ZIP archives and SHA-256 manifest

It deliberately excludes captured pages, `raw-next-data`, browser profiles, downloaded site chunks, website source bundles, assets, processed questions and import data.
