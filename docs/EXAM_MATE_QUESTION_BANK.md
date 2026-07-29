# Exam-Mate Question Bank source

## Authorization status

The DP Resources project owner holds written authorization from Exam-Mate dated
29 July 2026. The approval covers storing, indexing, processing and displaying
authorised Exam-Mate question-bank content inside the authenticated DP Resources
platform. It expressly includes topical questions, mark schemes, model answers,
worked solutions, diagrams, images, metadata, related assets, automated capture,
deduplication with attribution, worksheet generation and ongoing synchronization.

The original correspondence is private evidence. Do not commit screenshots,
mail exports, cookies, credentials or account details to this public repository.
The capture command can hash a local permission file and records only its filename
and SHA-256 digest; it never copies that evidence into the capture bundle.

## Scope of this phase

This phase is limited to the master Question Bank. It does not yet build Exam-Mate
feature equivalents such as an exam builder, AI marking, mock exams or broader
revision workflows. Those product changes will be designed after all authorised
question sources have been captured, normalized and deduplicated.

Save My Exams notes already stored in the normal subject `Notes` folders remain
part of the private resource library. Their source can be identified from the PDF
content/copyright notice even though the Drive filenames and folders do not carry
a `Save My Exams` label. They must not be mistaken for Question Bank source files
or moved merely to make the source name visible.

## Review-first capture workflow

The first tool is intentionally an inspection capture rather than a production
scraper. It records the real authenticated page structure and representative
network responses so the complete Exam-Mate crawler can be based on verified
selectors and endpoints instead of guesses.

It uses an isolated local Chrome profile and never exports:

- cookies;
- localStorage or sessionStorage;
- passwords;
- raw authorization, cookie or CSRF headers; or
- the Chrome profile itself.

Run from the repository root:

```bash
npm run question-bank:exam-mate:capture -- \
  --acknowledge-authorized-use \
  --authorization-reference "Written approval from Exam-Mate, 29 July 2026"
```

Optionally hash a saved PDF or screenshot of the permission email without copying
it into the bundle:

```bash
npm run question-bank:exam-mate:capture -- \
  --acknowledge-authorized-use \
  --authorization-reference "Written approval from Exam-Mate, 29 July 2026" \
  --permission-file "/private/path/exam-mate-approval.pdf"
```

The tool opens a dedicated Chrome window. Log in, open a representative IB DP or
MYP topical question, switch between Question and Answer/Mark Scheme, try one
recent subscribed question, change one topic filter and visit page 2 when asked.
The resulting directory and ZIP contain sanitized DOM snapshots, screenshots,
network metadata, selected response bodies, checksums and an audit summary.

The dedicated browser profile is stored outside the repository at:

```text
~/.dp-resources/exam-mate-chrome-profile
```

Do not upload or share that profile directory.

## Production safety gate

No Exam-Mate production importer may be enabled until all of the following are
complete:

1. Review the inspection capture and identify stable routes, selectors and APIs.
2. Build the complete DP/MYP crawler with rate limiting and resumability.
3. Run a full capture and produce exact counts and checksums.
4. Pin the reviewed archive digest in the source adapter.
5. Normalize questions, answers, assets, papers, courses and topic placements.
6. Compare against all existing question cores and source associations.
7. Dry-run database and private-R2 operations with zero critical findings.
8. Import append-only and run scoped post-import verification.

Until those gates pass, this tooling cannot write to Supabase or R2.
