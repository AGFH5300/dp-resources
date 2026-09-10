# PirateIB Village question indexer

The preferred Village completeness audit now runs **locally in Chromium/Google Chrome**, because the live app constructs and loads its question data dynamically in the browser.

## Recommended Mac run

From the DP Resources repository root:

```bash
bash scripts/question-bank/run-village-browser-indexer.command
```

Or equivalently:

```bash
npm run question-bank:village-browser
```

The runner:

- launches a separate temporary Chrome/Chromium profile;
- opens `https://village.pirateib.su/`;
- detects Village's `*.questionData.js` chunk catalogue from `main.js`;
- watches the page through the Chrome DevTools Protocol;
- fingerprints question records after Village parses them in the browser;
- shows live `loaded chunks / expected chunks` and captured source-question counts in Terminal;
- never writes question text, markscheme text, or media to disk.

Browse Village normally in the opened browser window. Open the subjects/topics/question-bank areas you want covered. When you are satisfied with coverage, return to Terminal and press Enter. If every discovered question-data chunk has already been observed, the indexer can finish automatically.

## Output

The default output folder is created on the Desktop:

```text
~/Desktop/VILLAGE-index-<timestamp>/
```

It contains:

```text
summary.json
checksums.sha256
source/
  runtime.json
  chunk-coverage.json
index/
  questions.ndjson
```

`summary.json` reports, among other things:

- expected Village question-data chunks;
- loaded question-data chunks;
- chunk coverage percentage;
- missing chunk IDs;
- unique captured source-question IDs;
- fingerprint conflicts.

`index/questions.ndjson` contains metadata and SHA-256 fingerprints only. It deliberately excludes source question text, markscheme text, and media.

After the run, send the generated `VILLAGE-index-...` folder back to ChatGPT, or at minimum:

```text
summary.json
source/chunk-coverage.json
index/questions.ndjson
```

We can then compare the live Village capture against DP Resources' existing Revision Village provenance and identify anything genuinely missing.

## Browser detection

The indexer automatically checks common macOS Chrome/Chromium locations. To use a specific browser executable:

```bash
npm run question-bank:village-browser -- --browser "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
```

Chromium works as well:

```bash
npm run question-bank:village-browser -- --browser "/Applications/Chromium.app/Contents/MacOS/Chromium"
```

## Static fallback

The earlier static source-discovery indexer remains available for diagnostics and fixtures:

```bash
npm run question-bank:village-index
```

For the live Village app, the Chromium runner is preferred because it observes data after the site's own runtime has loaded and parsed it.

## Safety / production

- No production writes.
- No Supabase changes.
- No Render/deployment changes.
- No Chrome profile reuse; a temporary browser profile is used by default.
- No question text, markscheme text, or media is persisted in the audit output.
