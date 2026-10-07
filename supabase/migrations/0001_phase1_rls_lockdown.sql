-- Phase 1: lock down data that is currently readable without signing in.
--
-- What this does
--   1. Drops every existing RLS policy on the app tables listed below
--      (some of them are evidently permissive) and enables RLS.
--   2. Recreates owner-only policies. Child tables are authorised through
--      their parent (messages -> chats, chunks -> documents, ...).
--   3. Makes the "documents" storage bucket private and restricts objects to
--      the user whose id is the first path segment ({user_id}/{skill_id}/{file}).
--
-- Side effects to be aware of
--   * Rows with a NULL owner (e.g. chats without user_id) become invisible to
--     clients. They are not deleted.
--   * Existing public file links stored in documents.file_url stop working.
--     The app does not use them; later phases will issue signed URLs.
--   * Anything using the service-role key is unaffected (it bypasses RLS).
--
-- Run in the Supabase SQL editor. It is wrapped in a transaction: if any
-- statement fails, nothing is changed.

begin;

-- 1. Reset policies and enable RLS -------------------------------------------
do $$
declare
  t text;
  p record;
begin
  foreach t in array array[
    'profiles', 'skills', 'documents', 'document_chunks', 'chats', 'messages',
    'quizzes', 'quiz_questions', 'coding_questions', 'test_cases',
    'code_submissions', 'progress_metrics'
  ] loop
    if to_regclass('public.' || t) is null then
      raise notice 'table public.% not found, skipped', t;
      continue;
    end if;
    for p in
      select policyname from pg_policies
      where schemaname = 'public' and tablename = t
    loop
      execute format('drop policy %I on public.%I', p.policyname, t);
    end loop;
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;

-- 2. Owner-only policies -----------------------------------------------------

-- profiles: a user sees and edits only their own profile
create policy "profiles: own row" on public.profiles
  for all to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

create policy "skills: owner" on public.skills
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy "documents: owner" on public.documents
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy "document_chunks: via document" on public.document_chunks
  for all to authenticated
  using (document_id in (
    select id from public.documents where user_id = (select auth.uid())))
  with check (document_id in (
    select id from public.documents where user_id = (select auth.uid())));

create policy "chats: owner" on public.chats
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy "messages: via chat" on public.messages
  for all to authenticated
  using (chat_id in (
    select id from public.chats where user_id = (select auth.uid())))
  with check (chat_id in (
    select id from public.chats where user_id = (select auth.uid())));

create policy "quizzes: via skill" on public.quizzes
  for all to authenticated
  using (skill_id in (
    select id from public.skills where user_id = (select auth.uid())))
  with check (skill_id in (
    select id from public.skills where user_id = (select auth.uid())));

create policy "quiz_questions: via skill" on public.quiz_questions
  for all to authenticated
  using (skill_id in (
    select id from public.skills where user_id = (select auth.uid())))
  with check (skill_id in (
    select id from public.skills where user_id = (select auth.uid())));

create policy "coding_questions: via skill" on public.coding_questions
  for all to authenticated
  using (skill_id in (
    select id from public.skills where user_id = (select auth.uid())))
  with check (skill_id in (
    select id from public.skills where user_id = (select auth.uid())));

-- test_cases: clients may read only the visible cases of their own questions.
-- Hidden cases and all writes are server-only (service role).
create policy "test_cases: visible cases of own questions" on public.test_cases
  for select to authenticated
  using (
    is_hidden = false
    and question_id in (
      select q.id
      from public.coding_questions q
      join public.skills s on s.id = q.skill_id
      where s.user_id = (select auth.uid())));

-- code_submissions / progress_metrics: their columns could not be inspected
-- from outside. Owner policy if a user_id column exists; otherwise the table
-- stays locked (RLS on, no policy) until a later migration defines access.
do $$
declare
  t text;
begin
  foreach t in array array['code_submissions', 'progress_metrics'] loop
    if to_regclass('public.' || t) is null then
      continue;
    end if;
    if exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = t and column_name = 'user_id'
    ) then
      execute format(
        'create policy %I on public.%I for all to authenticated '
        'using (user_id = (select auth.uid())) '
        'with check (user_id = (select auth.uid()))',
        t || ': owner', t);
    else
      raise notice 'public.% has no user_id column: left locked (no policy)', t;
    end if;
  end loop;
end $$;

-- 3. Storage: private bucket, owner-only objects -----------------------------
update storage.buckets set public = false where id = 'documents';

drop policy if exists "documents bucket: owner read" on storage.objects;
drop policy if exists "documents bucket: owner insert" on storage.objects;
drop policy if exists "documents bucket: owner delete" on storage.objects;

create policy "documents bucket: owner read" on storage.objects
  for select to authenticated
  using (bucket_id = 'documents'
         and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "documents bucket: owner insert" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'documents'
              and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "documents bucket: owner delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'documents'
         and (storage.foldername(name))[1] = (select auth.uid())::text);

commit;

-- 4. Review after running ----------------------------------------------------
-- Any OTHER policy on storage.objects that mentions the documents bucket (or
-- no bucket at all) can still grant access. List them and drop what is stale:
--   select policyname, roles, cmd, qual, with_check
--   from pg_policies where schemaname = 'storage' and tablename = 'objects';
--
-- Confirm RLS is on everywhere:
--   select tablename, rowsecurity from pg_tables where schemaname = 'public';
