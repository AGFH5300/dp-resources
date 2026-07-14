-- Exact PDF search geometry is stored as small private JSON objects beside
-- existing page JPEGs. Keep the bucket private and preserve its size limit.
update storage.buckets
set allowed_mime_types = array['image/jpeg', 'application/json']
where id = 'pdf-previews';
