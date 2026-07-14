# PDF toolbar, search and large-PDF rollout

This change is limited to the PDF preview subsystem.

## Viewer controls

The integrated continuous reader provides direct page-number entry, zoom out/reset/in, fit to width, rotation, authenticated document search, browser-local pen/highlighter/eraser annotations with undo/redo, one download control, print/open-original, and fullscreen.

Annotations are stored only in the current browser under a file-version-specific localStorage key. They never alter the Google Drive original and are not included in the original PDF download or print view.

Print opens the authenticated original PDF at the current page so the browser-native reader can provide its reliable print dialog without forcing all derivative images to load in the web app.

## Search migration

Apply `supabase/migrations/20260714193000_pdf_preview_search_text.sql` before deploying the code. It adds page search text and service-role-only functions. Existing page images are unchanged.

Run the preparation workflow once for an already-prepared PDF to add its text index. The resumable worker detects existing page images and does not regenerate or re-upload them.

## Large PDFs

The manual workflow supports:

- `single_pdf`
- `largest_textbooks`
- `all_large_pdfs`

`all_large_pdfs` selects indexed PDFs at or above the chosen source-size threshold, skips versions that are already fully prepared and searchable, processes sequentially, and stops before starting another PDF once the configured storage guard has been reached.

Recommended first production batch:

- selection: `all_large_pdfs`
- minimum size: `20` MiB
- maximum PDFs: `10`
- provider: `r2`
- storage guard: `8` GiB

Review the workflow summary and R2 usage after each batch before starting the next one.
