# Revision Village question-bank import

The authorized 2026-07-27 source archive is imported additively into the
existing DP Resources Question Bank. The source ZIP, decrypted NDJSON and media
are never committed to Git.

The importer verifies the pinned archive SHA-256 and every bundled file before
reading production. It then performs a read-only comparison, reuses exact
question cores and course/topic variants, records Revision Village provenance,
and appends only missing rows.

Private media is content-hash deduplicated and stored in Cloudflare R2 under:

```text
question-bank/assets/sha256/<first-two-hash-chars>/<sha256>.<extension>
```

Every new object is read back and verified by byte size and SHA-256 before its
Supabase asset row is marked verified. Listening clips retain transcripts and
duration metadata. Provider video IDs are stored without fabricating Vimeo or
public URLs.

Production write modes require `--confirm-production`:

```bash
npm run question-bank:revision-village -- \
  --archive /secure/path/RevisionVillage-question-bank-import-20260727T104233-audited-media.zip \
  --mode all \
  --storage-provider r2 \
  --confirm-production
```

The importer is idempotent and batch-audited. It does not overwrite existing
question cores, user progress or saved-question state.
