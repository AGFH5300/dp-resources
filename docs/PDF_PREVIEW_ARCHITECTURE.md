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

The current source-PDF range route is also served by the main Next.js web service. Even with cached Google credentials, every cache miss occupies the web service while bytes travel from Drive through Render and Cloudflare to the browser. This is the wrong place for large conversion or repeated document delivery and risks another long-running-request/524 incident.

## Architecture decision

### Option A — private page derivatives: selected

A background worker creates one versioned, private JPEG page set per Drive PDF. The version key is a SHA-256 of the Drive file ID, modification time and byte size. The original Drive file is never changed and remains the only download source.

The web application performs member/file authorization once, issues a short-lived file-specific HttpOnly cookie, then serves a compact manifest and individual page images through same-origin authenticated routes. Page routes stream private Supabase Storage objects without exposing service credentials, storage tokens or Drive links.

This option provides deterministic first-page transfer size, eliminates JPEG 2000/OpenJPEG browser failures, supports continuous lazy loading, and keeps conversion work off normal web requests.

### Option B — custom PDF.js source reader: rejected as the primary path

PR #75 correctly configured worker/WASM/CMaps/ICC/standard-font assets and added continuous lazy rendering. Real behavior on the 62.43 MiB linearized test file still showed a large catalogue/source-fetch delay through the Drive proxy. Further chunk-size tuning does not remove that dependency and cannot guarantee the first-page budget for arbitrary PDF object layouts.

### Option C — native PDF iframe: rejected

This is the current PR #77 behavior. It is not an integrated reader, does not provide reliable page-level virtualization or DP Resources controls, and still depends on the proxied original PDF.

## Request flow

1. `POST /api/resource/:fileId/pdf-session`
   - authenticates the member;
   - validates the indexed/Drive file once;
   - records one deduplicated `file_opened` activity;
   - queues the current derivative version if absent;
   - returns preview state and sets a file-scoped HttpOnly cookie.
2. `GET .../pdf-preview/status`
   - verifies the signed cookie locally;
   - returns queue/processing/partial/ready state.
3. `GET .../pdf-preview/manifest`
   - verifies the cookie;
   - returns dimensions and readiness for all pages.
4. `GET .../pdf-preview/page/:pageNumber`
   - verifies the cookie;
   - resolves only the current Drive-version derivative;
   - streams the private JPEG object through the application.
5. The browser keeps only pages within an IntersectionObserver window active. Distant `<img>` elements are removed while dimensions/placeholders remain, preventing hundreds of decoded full-resolution pages from accumulating in memory.

The original `pdf-content` range route remains available for diagnostics and any narrowly scoped original-PDF use. It is no longer the main reader path and now rejects incorrect upstream status, `Content-Range`, or `Content-Length` values.

## Preparation worker

The Render background worker:

- claims work through a PostgreSQL lease using `FOR UPDATE SKIP LOCKED`;
- downloads the Drive original directly once;
- validates the downloaded byte size against the indexed source version;
- reads all page dimensions with `pdfinfo`;
- renders page 1 first with `pdftoppm`;
- uploads page 1 immediately, then renders bounded page batches;
- resumes already uploaded pages after a lease expiry/restart;
- never runs conversion inside a website request.

Default rendering is 150 DPI, progressive JPEG quality 76. On the 698-page benchmark, local Poppler preparation of pages 1–5 took 2.54 seconds with about 308 MB peak RSS. Those five page images totalled 811,998 bytes; page 1 was 144,203 bytes. This benchmark measures conversion after the source PDF is local, not end-to-end production timing.

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

## Before/after evidence

| Observation | Existing production/native path | Derivative path target/evidence |
|---|---:|---:|
| Source size | 65,463,051 B | original unchanged |
| Pages | 698 | 698 manifest placeholders |
| Bytes observed before metadata/page 1 | about 14 MiB, with page 1 still unavailable | page 1 derivative 144,203 B in local benchmark; budget under 2 MiB total |
| Source structure | linearized, first section near 916,926 B | no source-PDF parsing in browser |
| JPEG 2000 | browser/PDF.js WASM dependency | decoded once by Poppler worker |
| Reader | native iframe | integrated continuous vertical reader |
| Conversion in web request | source bytes proxied by web service | none |

Exact authenticated Chrome cold/warm timings must be appended to the PR after the branch deployment is live and the two large PDFs are prepared. CI success alone is not acceptance.

## Deployment

1. Take the normal Supabase backup and record the current production commit.
2. Apply `20260714110000_private_pdf_preview_derivatives.sql`.
3. Deploy the branch web service with the existing Supabase and Google service-account variables. Optionally set a dedicated `PDF_PREVIEW_SESSION_SECRET`.
4. Create a separate Render background worker from the same Docker image with command:

   ```sh
   npm run pdf-previews:worker
   ```

   Give the worker enough memory for Poppler (512 MB minimum; 1 GB preferred). Do not expose it through Cloudflare or an HTTP route.
5. Queue existing PDFs as a one-off job. To prepare all indexed PDFs:

   ```sh
   npm run pdf-previews:queue -- --min-size-mb=0
   ```

   For staged rollout, first queue the largest PDFs with a higher threshold and explicitly verify the 62.43 MiB/698-page Economics file.
6. Wait until the benchmark documents show `ready` before directing production users to this reader.
7. Run the authenticated Chrome benchmark for cold cache, warm cache, cancellation, retry, rapid distant scrolling, zoom and memory. Attach the network export/screenshots to the PR.
8. Confirm the original download route still returns the Drive PDF and activity logging records one open, not one event per page.

## Rollback

1. Stop the PDF preview background worker.
2. Roll the web service back to the recorded pre-deployment commit.
3. Do not delete or change any Drive source files.
4. The private derivative bucket and tables may safely remain while investigating; they are not publicly readable and old versions are not selected for changed Drive files.
5. If schema rollback is required, remove the derivative tables/functions and private bucket only after confirming no deployed web process references them. This does not affect original PDFs or downloads.
6. Re-run login, library, download, activity and non-PDF preview smoke tests.

## Required pre-merge verification

- CI: typecheck, unit/integration tests, lint, production build and high-severity production dependency audit.
- Chrome network evidence for both a roughly 62 MiB PDF and a 690–700-page PDF.
- Exact status codes, TTFB, request count and transferred bytes through visible page 1.
- Cold and warm results.
- Memory observation during extended and rapid scrolling.
- Cancellation by navigating away during loading.
- Page retry after an injected failed page request.

The pull request must remain open until this evidence is recorded.
