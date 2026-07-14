# Private PDF preview architecture

## Diagnosis

The production problem was not caused only by file size. The exact reported example was identified in the live resource index and inspected without modifying the Drive original:

- Drive file: `Economics - Ellie Tragakes - Third Edition - Cambridge 2020.pdf`
- Drive file ID: `1I6IrD9hMk3P2nVUCertioitIwn_C8ApS`
- Size: 65,463,051 bytes (62.43 MiB)
- Pages: 698
- PDF version: 1.6
- Fast-web-view/linearized: yes
- First linearized section ends near byte 916,926
- Embedded images: JPEG 2000 (`JPXDecode`) throughout the inspected image inventory

The file is already linearized, so requiring roughly 14 MiB before page count or page 1 is not intrinsic to this source. PRs #72–#76 progressively changed PDF.js chunk sizes, authentication, asset configuration and continuous rendering, but the browser still had to discover and fetch source-PDF structures through the application-to-Drive proxy. PR #77 reduced repeated OAuth work and rejected ignored ranges, but replaced the integrated reader with a browser-native iframe. That retained the source-proxy dependency and lost control over rendering, virtualization and the requested DP Resources experience.

The source-PDF range route is served by the main Next.js web service. Even with cached Google credentials, every cache miss occupies the web service while bytes travel from Drive through Render and Cloudflare to the browser. Large conversion or repeated document delivery must not run inside a normal website request.

## Architecture decision

### Private page derivatives: selected

A GitHub Actions preparation job creates one versioned, private JPEG page set per selected Drive PDF. The version key is a SHA-256 of the Drive file ID, normalized modification time and byte size. The original Drive file is never changed and remains the only download source.

Supabase remains the authorization and metadata layer. Each preview document records:

- source identity and version;
- preparation status and page count;
- private storage provider (`supabase` or `r2`);
- private bucket and object prefix;
- page dimensions, object paths, byte sizes and readiness.

Existing derivatives remain in the private Supabase `pdf-previews` bucket. New large textbook derivatives can be written to a private Cloudflare R2 bucket. This is an additive migration; the working Economics derivative is not copied, renamed or regenerated.

The web application performs member/file authorization once, issues a short-lived file-specific HttpOnly cookie containing the signed preview identity and storage location, then serves a compact manifest and individual page images through same-origin authenticated routes. The browser never receives Drive URLs, R2 credentials, Supabase service credentials or public object URLs.

### Custom PDF.js source reader: rejected as the primary path

PR #75 correctly configured worker/WASM/CMaps/ICC/standard-font assets and added continuous lazy rendering. Real behavior on the 62.43 MiB linearized test file still showed a large catalogue/source-fetch delay through the Drive proxy. Further chunk-size tuning does not remove that dependency and cannot guarantee the first-page budget for arbitrary PDF object layouts.

### Native PDF iframe: rejected

The native reader is not an integrated reader, does not provide reliable page-level virtualization or DP Resources controls, and still depends on the proxied original PDF. It remains available only through the authenticated standard-reader fallback for an unprepared PDF.

## Request flow

1. `POST /api/resource/:fileId/pdf-session`
   - authenticates the member;
   - validates the current Drive file and root containment once;
   - records one deduplicated `file_opened` activity;
   - reuses the current prepared derivative or queues its exact normalized version;
   - signs the derivative ID, version, provider, bucket and prefix into a file-scoped HttpOnly cookie.
2. `GET .../pdf-preview/status`
   - verifies the signed cookie locally;
   - returns queue/processing/partial/ready state.
3. `GET .../pdf-preview/manifest`
   - verifies the cookie;
   - returns dimensions and readiness for all pages.
4. `GET .../pdf-preview/page/:pageNumber`
   - verifies the cookie;
   - derives the object key from the signed prefix without another page database lookup;
   - streams the private JPEG from either Supabase Storage or R2 through the same-origin application route.
5. The browser keeps only pages within an IntersectionObserver window active. Distant `<img>` elements are removed while dimensions/placeholders remain, preventing hundreds of decoded full-resolution pages from accumulating in memory.

The original `pdf-content` range route remains available for diagnostics, download-related use and the standard-reader fallback. It is not the primary prepared reader path.

## Preparation path on Render Free

Render Free runs only the Next.js website. Conversion is performed by the manually triggered `Prepare PDF previews` GitHub workflow.

The preparation path:

- selects one exact Drive PDF or the largest likely textbook/reference PDFs;
- excludes obvious question papers, markschemes, worksheets and student notes from automatic textbook batches;
- skips already-ready versions;
- processes books sequentially, never in parallel;
- downloads each selected Drive original directly once;
- validates the downloaded byte size;
- reads page dimensions with `pdfinfo`;
- renders page 1 first with `pdftoppm`;
- uploads pages in bounded concurrent batches;
- records metadata in one database write per rendered batch;
- retries transient uploads with exponential backoff;
- resumes already-ready pages after interruption;
- stops before starting another book when the configured recorded-storage guard is reached;
- writes a GitHub summary with result, page count, duration, per-book preview size and final provider usage.

Default rendering remains 150 DPI, progressive JPEG quality 76, 40-page render batches and six concurrent object uploads. These values preserve the visual profile already verified on the Economics book.

## R2 security model

The R2 bucket must remain private. Use an R2 S3-compatible API token scoped only to the preview bucket with **Object Read & Write** permission. Do not use an account-wide administrative token.

The application and GitHub Actions use the S3-compatible endpoint:

```text
https://<ACCOUNT_ID>.r2.cloudflarestorage.com
```

The signing region is `auto`. A jurisdiction-specific bucket may instead use `R2_ENDPOINT` with its corresponding endpoint. Credentials are server-side secrets only.

Required GitHub Actions secrets for R2 preparation:

```text
R2_ACCOUNT_ID
R2_ACCESS_KEY_ID
R2_SECRET_ACCESS_KEY
R2_PDF_PREVIEW_BUCKET
```

`R2_ENDPOINT` is optional unless the bucket uses a jurisdiction-specific endpoint.

Required Render environment variables for private R2 reads and default future queueing:

```text
R2_ACCOUNT_ID
R2_ACCESS_KEY_ID
R2_SECRET_ACCESS_KEY
R2_PDF_PREVIEW_BUCKET
PDF_PREVIEW_DEFAULT_STORAGE_PROVIDER=r2
```

`R2_ENDPOINT` is optional under the same rule. Never prefix these variables with `NEXT_PUBLIC_`.

## Controlled workflow inputs

`Prepare PDF previews` supports:

- `selection=single_pdf` with a Drive file ID;
- `selection=largest_textbooks` for automatic largest-unprepared selection;
- minimum source size in MiB;
- maximum books per run (1–20);
- storage provider (`r2` or `supabase`);
- recorded provider-storage guard in GiB.

The automatic selector intentionally does not process all indexed PDFs. The resource index contains thousands of past papers and small worksheets; only likely textbook/reference candidates above the selected threshold are included.

## Performance budget

The deployment should be rejected or rolled back if an already prepared preview exceeds these normal broadband targets:

| Metric | Budget |
|---|---:|
| Authenticated preview session | under 1.0 s warm; under 2.0 s cold |
| First network byte for manifest/page 1 | under 750 ms each |
| Metadata/page count available | under 1.5 s warm |
| Page 1 visibly rendered | under 3.0 s warm; under 5.0 s cold |
| Bytes before page 1 | under 2 MiB; target under 750 KiB |
| Requests before page 1 | no more than 5 after the HTML document |
| Active decoded pages during normal scroll | target 4–12, never the full document |
| Rapid distant scrolling | no full-document fetch; only nearby page requests |

No ETA is shown. A percentage is shown only when both page count and a real number of prepared pages are available.

## Deployment sequence

1. Record the current production commit and take the normal Supabase backup.
2. In Cloudflare R2, create a private bucket dedicated to PDF previews.
3. Create a bucket-scoped **Object Read & Write** R2 S3 API token and record its Access Key ID and Secret Access Key.
4. Apply `supabase/migrations/20260714150000_pdf_preview_r2_storage.sql` after the original derivative migration.
5. Add the R2 secrets to GitHub Actions.
6. Add the R2 variables and `PDF_PREVIEW_DEFAULT_STORAGE_PROVIDER=r2` to Render.
7. Deploy the provider-aware web code. Existing Supabase-hosted Economics pages continue to use their recorded Supabase provider.
8. Run `Prepare PDF previews` first with:
   - selection: `single_pdf`;
   - a new large textbook Drive ID;
   - provider: `r2`.
9. Confirm the workflow summary, R2 object count, database row and production reader before running automatic batches.
10. Run `largest_textbooks` in small batches, initially three books, while checking recorded R2 usage and browser quality.
11. Keep the bucket private and retain the authenticated standard-reader fallback for unprepared files.

## Rollback

1. Stop starting new GitHub preparation workflows.
2. Roll the web service back to the recorded pre-deployment commit if the page-read path fails.
3. Do not delete or change any Drive source files.
4. Existing Supabase and R2 derivative objects may remain private while investigating.
5. Do not remove the provider columns or functions until no deployed code references them.
6. Re-run login, library, original download, activity logging and non-PDF preview smoke tests.

## Required verification

- CI: typecheck, unit/integration tests, lint, production build and high-severity production dependency audit.
- Existing Economics preview still opens from Supabase Storage.
- One new large R2-backed textbook reaches `ready` and opens through the same reader.
- R2 credentials and endpoint never appear in browser requests or responses.
- Original download still returns the Drive PDF.
- Automatic selection excludes obvious past papers and processes books sequentially.
- A failed or cancelled preparation resumes existing pages on the next run.
- GitHub summary reports page count, duration, per-book bytes and final provider usage.
- Cold and warm browser timings, rapid scrolling, retry and memory observations remain within the established budget.
