# Cloudflare R2 setup for private PDF previews

This setup is intentionally limited to PDF page derivatives. Google Drive originals remain unchanged, Supabase remains the metadata and authorization layer, and the existing Economics preview remains in private Supabase Storage.

## 1. Create the private bucket

Create one dedicated R2 bucket, for example:

```text
dp-pdf-previews
```

Keep public access and any public development URL disabled. The website reads objects only through its authenticated same-origin page route.

## 2. Create two bucket-scoped API tokens

Use separate least-privilege S3-compatible credentials:

### GitHub Actions token

Scope it only to the PDF-preview bucket with **Object Read & Write** permission. GitHub Actions needs write access to upload pages and delete its tiny preflight object.

Record:

```text
Access Key ID
Secret Access Key
```

### Render token

Scope it only to the same bucket with **Object Read** permission. The Render web service never needs to upload or delete preview objects.

Record its separate:

```text
Access Key ID
Secret Access Key
```

Do not use an account-wide administrative token for either environment.

## 3. GitHub Actions secrets

In the repository, open:

```text
Settings → Secrets and variables → Actions
```

Add:

```text
R2_ACCOUNT_ID
R2_ACCESS_KEY_ID
R2_SECRET_ACCESS_KEY
R2_PDF_PREVIEW_BUCKET
```

Use the GitHub Actions read/write token values. Set `R2_PDF_PREVIEW_BUCKET` to the exact bucket name.

`R2_ENDPOINT` is optional. Leave it unset for a normal bucket. Set it only when Cloudflare provides a jurisdiction-specific S3 endpoint.

The workflow runs a tiny write/read/delete preflight before downloading any textbook. Invalid credentials therefore fail before expensive conversion begins.

## 4. Render environment variables

In the existing DP Resources Web Service, add:

```text
R2_ACCOUNT_ID
R2_ACCESS_KEY_ID
R2_SECRET_ACCESS_KEY
R2_PDF_PREVIEW_BUCKET
PDF_PREVIEW_DEFAULT_STORAGE_PROVIDER=r2
```

Use the separate Render read-only token values. `R2_ENDPOINT` follows the same optional rule.

Never prefix these secrets with `NEXT_PUBLIC_`.

Do not create a Render Background Worker. Render Free continues running only the website.

## 5. Apply the additive Supabase migration

Run the full contents of:

```text
supabase/migrations/20260714150000_pdf_preview_r2_storage.sql
```

This adds provider and bucket metadata, provider-aware queueing, and storage-reporting functions. Existing rows are backfilled to:

```text
storage_provider = supabase
storage_bucket = pdf-previews
```

The migration does not delete or move existing objects.

## 6. Deploy and verify the existing preview first

After merging the provider-aware PR, deploy the latest `main` commit to Render. Before generating an R2 book, reopen the Economics textbook and confirm its existing 698-page Supabase-backed preview still loads normally.

## 7. Prepare one R2-backed smoke-test book

In GitHub:

```text
Actions → Prepare PDF previews → Run workflow
```

Use:

```text
selection: single_pdf
storage_provider: r2
maximum_books: 1
```

Recommended first Drive file ID:

```text
10MA8BA8-MrMygcXh9BS-oYVkt_Rvn4eh
```

This is the Mathematics HL Applications and Interpretation Oxford textbook already inspected during the original viewer investigation.

The workflow should complete its R2 preflight, prepare the exact normalized source version, upload pages, and report page count, duration and derivative size.

## 8. Production smoke test

Confirm:

- page 1 loads through the integrated continuous reader;
- a middle page and a page near the end load;
- zoom, fullscreen and original download work;
- browser requests remain same-origin;
- no R2 endpoint, Access Key ID, Secret Access Key, Supabase service key or Drive URL appears in browser responses;
- the original download still returns the Google Drive PDF;
- the Economics preview remains unaffected.

## 9. Prepare controlled textbook batches

After the single-book test passes, run:

```text
selection: largest_textbooks
minimum_size_mib: 20
maximum_books: 3
storage_provider: r2
```

The selector skips completed exact versions, excludes obvious question papers and markschemes, and processes books one at a time. Review the workflow summary after every batch before starting the next one.

Do not run overlapping preparation workflows. Repository-level workflow concurrency already queues them rather than running them simultaneously.

## Rollback

If the R2-backed reader fails:

1. Stop starting preparation workflows.
2. Roll Render back to the previous deployment.
3. Leave both private derivative stores in place while investigating.
4. Do not remove provider columns/functions while deployed code may reference them.
5. Do not modify or delete any Google Drive original.
