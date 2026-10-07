-- Phase 10: storage limits for direct uploads.
--
-- Files are now uploaded from the browser straight to the private "documents"
-- bucket (the app server only registers them), so the size and type limits
-- must be enforced by storage itself rather than by the app.
--
--   1. The bucket refuses files over 10 MB and anything that is not a PDF or
--      plain text. Until now the storage policy let a signed-in user put a
--      file of any size or type into their own folder.
--   2. A stored file can back at most one document row.
--
-- No existing data is changed. Run in the Supabase SQL editor (one transaction).

begin;

update storage.buckets
set file_size_limit = 10485760,                                  -- 10 MB
    allowed_mime_types = array['application/pdf', 'text/plain']
where id = 'documents';

create unique index documents_storage_path_key
  on public.documents (storage_path)
  where storage_path is not null;

commit;
