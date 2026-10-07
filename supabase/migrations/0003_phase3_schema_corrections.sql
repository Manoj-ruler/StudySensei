-- Phase 3: schema corrections.
--
-- Additive and in-place: no table is dropped and no user data is deleted.
-- Existing quiz history, chats, documents and submissions stay where they are.
--
--   1. Lock down the 8 tables the Phase 1 migration did not know about
--   2. Harden the SECURITY DEFINER functions
--   3. Cascade deletes (deleting a skill or a user no longer fails halfway)
--   4. documents: one status field, storage path instead of a public URL
--   5. document_chunks: ownership columns, HNSW index, uniqueness
--   6. chats / messages: citations column, indexes
--   7. quizzes: owner, lifecycle, explanations
--   8. coding: test case ordering, structured submission results
--   9. Indexes for the queries the app runs
--  10. match_chunks(): the vector search used by the RAG pipeline
--
-- Run in the Supabase SQL editor. One transaction: any failure changes nothing.

begin;

-- 1. RLS for the remaining tables ---------------------------------------------
do $$
declare
  t text;
  p record;
begin
  foreach t in array array[
    'tasks', 'learning_tasks', 'task_progress_logs', 'chat_sessions',
    'notifications', 'votes', 'feature_requests', 'changelog'
  ] loop
    for p in
      select policyname from pg_policies
      where schemaname = 'public' and tablename = t
    loop
      execute format('drop policy %I on public.%I', p.policyname, t);
    end loop;
    execute format('alter table public.%I enable row level security', t);
  end loop;

  -- Tables owned through a user_id column
  foreach t in array array[
    'tasks', 'learning_tasks', 'task_progress_logs', 'chat_sessions',
    'notifications', 'votes'
  ] loop
    execute format(
      'create policy %I on public.%I for all to authenticated '
      'using (user_id = (select auth.uid())) '
      'with check (user_id = (select auth.uid()))',
      t || ': owner', t);
  end loop;
end $$;

-- Product roadmap content: readable by signed-in users, written by admins
-- (service role) only. Users may file their own feature requests.
create policy "feature_requests: read" on public.feature_requests
  for select to authenticated using (true);

create policy "feature_requests: create own" on public.feature_requests
  for insert to authenticated
  with check (created_by = (select auth.uid()));

create policy "changelog: read" on public.changelog
  for select to authenticated using (true);

-- 2. Function hardening -------------------------------------------------------

-- A full_name shorter than 3 characters made the signup trigger fail, which
-- aborted account creation ("Database error saving new user").
alter table public.profiles drop constraint if exists username_length;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, full_name, avatar_url)
  values (
    new.id,
    nullif(trim(coalesce(
      new.raw_user_meta_data ->> 'full_name',
      new.raw_user_meta_data ->> 'name')), ''),
    new.raw_user_meta_data ->> 'avatar_url')
  on conflict (id) do nothing;
  return new;
end;
$$;

-- The old version was SECURITY DEFINER and took the user id as an argument,
-- so anyone (including signed-out callers) could query any user's count.
drop function if exists public.get_unread_notification_count(uuid);

create function public.get_unread_notification_count()
returns integer
language sql
stable
security invoker
set search_path = ''
as $$
  select count(*)::integer
  from public.notifications
  where user_id = (select auth.uid()) and read = false;
$$;

revoke execute on function public.get_unread_notification_count() from public, anon;
grant execute on function public.get_unread_notification_count() to authenticated;

-- 3. Cascading deletes --------------------------------------------------------

-- Deleting a user removes everything they own.
alter table public.profiles
  drop constraint profiles_id_fkey,
  add constraint profiles_id_fkey
    foreign key (id) references auth.users (id) on delete cascade;

alter table public.skills
  drop constraint skills_user_id_fkey,
  add constraint skills_user_id_fkey
    foreign key (user_id) references auth.users (id) on delete cascade;

alter table public.documents
  drop constraint documents_user_id_fkey,
  add constraint documents_user_id_fkey
    foreign key (user_id) references auth.users (id) on delete cascade;

alter table public.chats
  drop constraint chats_user_id_fkey,
  add constraint chats_user_id_fkey
    foreign key (user_id) references auth.users (id) on delete cascade;

alter table public.code_submissions
  drop constraint code_submissions_user_id_fkey,
  add constraint code_submissions_user_id_fkey
    foreign key (user_id) references auth.users (id) on delete cascade;

alter table public.progress_metrics
  drop constraint progress_metrics_user_id_fkey,
  add constraint progress_metrics_user_id_fkey
    foreign key (user_id) references auth.users (id) on delete cascade;

-- quiz_questions did not cascade, so deleting a skill that had quizzes failed.
alter table public.quiz_questions
  drop constraint quiz_questions_quiz_id_fkey,
  add constraint quiz_questions_quiz_id_fkey
    foreign key (quiz_id) references public.quizzes (id) on delete cascade,
  drop constraint quiz_questions_skill_id_fkey,
  add constraint quiz_questions_skill_id_fkey
    foreign key (skill_id) references public.skills (id) on delete cascade;

-- 4. documents ----------------------------------------------------------------

-- Path inside the private "documents" bucket. file_url held a public URL,
-- which stopped working when the bucket was made private.
alter table public.documents add column storage_path text;

create function pg_temp.url_decode(input text)
returns text
language plpgsql
immutable
as $$
declare
  bytes bytea := ''::bytea;
  i integer := 1;
  ch text;
begin
  while i <= length(input) loop
    ch := substr(input, i, 1);
    if ch = '%' and substr(input, i + 1, 2) ~ '^[0-9a-fA-F]{2}$' then
      bytes := bytes || decode(substr(input, i + 1, 2), 'hex');
      i := i + 3;
    else
      bytes := bytes || convert_to(ch, 'UTF8');
      i := i + 1;
    end if;
  end loop;
  return convert_from(bytes, 'UTF8');
end;
$$;

update public.documents
set storage_path = pg_temp.url_decode(
  split_part(split_part(file_url, '/object/public/documents/', 2), '?', 1))
where file_url like '%/object/public/documents/%';

alter table public.documents alter column file_url drop not null;

comment on column public.documents.file_url is
  'Deprecated: legacy public URL. Use storage_path and signed URLs.';

-- One status instead of status + processed (rows used 'ready' and
-- 'processed' interchangeably).
update public.documents
set status = case
  when processed is true or status in ('ready', 'processed') then 'ready'
  when status = 'processing' then 'processing'
  when status in ('failed', 'error') then 'failed'
  else 'pending'
end;

alter table public.documents
  alter column status set not null,
  add constraint documents_status_check
    check (status in ('pending', 'processing', 'ready', 'failed'));

-- Keep "processed" readable for existing queries, but derived so it cannot drift.
alter table public.documents drop column processed;
alter table public.documents
  add column processed boolean generated always as (status = 'ready') stored;

-- 5. document_chunks ----------------------------------------------------------

-- Denormalised owner and skill: vector search filters on them directly instead
-- of joining to documents for every candidate row.
alter table public.document_chunks
  add column user_id uuid,
  add column skill_id uuid;

update public.document_chunks c
set user_id = d.user_id, skill_id = d.skill_id
from public.documents d
where d.id = c.document_id;

alter table public.document_chunks
  alter column user_id set not null,
  add constraint document_chunks_user_id_fkey
    foreign key (user_id) references auth.users (id) on delete cascade,
  add constraint document_chunks_skill_id_fkey
    foreign key (skill_id) references public.skills (id) on delete cascade;

-- Ownership always comes from the parent document, never from the caller.
create function public.set_chunk_ownership()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  select d.user_id, d.skill_id
  into strict new.user_id, new.skill_id
  from public.documents d
  where d.id = new.document_id;
  return new;
end;
$$;

create trigger document_chunks_set_ownership
  before insert or update of document_id on public.document_chunks
  for each row execute function public.set_chunk_ownership();

create unique index document_chunks_document_chunk_key
  on public.document_chunks (document_id, chunk_index);

create index idx_document_chunks_skill on public.document_chunks (skill_id);

-- IVFFlat picks its clusters from the rows present when the index is built;
-- built on an (almost) empty table it gives poor recall. HNSW has no such
-- training step and handles incremental inserts.
drop index if exists public.document_chunks_embedding_idx;

create index document_chunks_embedding_hnsw
  on public.document_chunks using hnsw (embedding public.vector_cosine_ops);

drop policy if exists "document_chunks: via document" on public.document_chunks;

create policy "document_chunks: owner" on public.document_chunks
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- 6. chats / messages ---------------------------------------------------------

-- Retrieved sources shown with an assistant message:
-- [{ "chunk_id", "document_id", "filename", "page_number", "similarity" }]
alter table public.messages add column sources jsonb;

create index idx_messages_chat_created on public.messages (chat_id, created_at);
create index idx_chats_user_skill_created
  on public.chats (user_id, skill_id, created_at desc);

-- 7. quizzes ------------------------------------------------------------------

alter table public.quizzes
  add column user_id uuid,
  add column status text not null default 'completed',
  add column completed_at timestamp with time zone;

update public.quizzes q
set user_id = s.user_id, completed_at = q.created_at
from public.skills s
where s.id = q.skill_id;

alter table public.quizzes
  alter column user_id set not null,
  alter column status set default 'in_progress',
  add constraint quizzes_user_id_fkey
    foreign key (user_id) references auth.users (id) on delete cascade,
  add constraint quizzes_status_check
    check (status in ('in_progress', 'completed'));

alter table public.quiz_questions
  add column explanation text,
  add column "position" integer;

create index idx_quizzes_skill_created on public.quizzes (skill_id, created_at desc);
create index idx_quiz_questions_quiz on public.quiz_questions (quiz_id, "position");

-- 8. coding -------------------------------------------------------------------

update public.test_cases set is_hidden = false where is_hidden is null;

alter table public.test_cases
  alter column is_hidden set not null,
  add column "position" integer;

alter table public.code_submissions
  add column passed_tests integer,
  add column total_tests integer,
  add column runtime_ms integer,
  -- Per-test outcome; never contains the input or expected output of hidden cases.
  add column results jsonb;

-- NOT VALID: enforced for new rows without failing on any legacy value.
alter table public.code_submissions
  add constraint code_submissions_language_check
    check (language in ('python', 'javascript')) not valid;

create index idx_coding_questions_skill_created
  on public.coding_questions (skill_id, created_at desc);
create index idx_test_cases_question on public.test_cases (question_id, "position");
create index idx_code_submissions_user_question
  on public.code_submissions (user_id, question_id, created_at desc);

-- 9. Remaining indexes --------------------------------------------------------

create index idx_skills_user_created on public.skills (user_id, created_at desc);
create index idx_documents_skill_created on public.documents (skill_id, created_at desc);
create index idx_documents_user on public.documents (user_id);
create index idx_progress_metrics_user_skill
  on public.progress_metrics (user_id, skill_id, created_at desc);

-- 10. Vector search -----------------------------------------------------------

-- Replaced by match_chunks: it accepted any vector size, made the skill filter
-- optional and had no caller-side ownership filter.
drop function if exists public.match_documents(public.vector, double precision, integer, uuid);

-- Returns the chunks of one skill closest to the query embedding.
-- SECURITY INVOKER: runs as the caller, so the RLS policy on document_chunks
-- applies; the explicit user_id filter also lets the planner use the indexes.
create function public.match_chunks(
  query_embedding public.vector(768),
  p_skill_id uuid,
  match_count integer default 6,
  min_similarity double precision default 0.5
)
returns table (
  id uuid,
  document_id uuid,
  filename text,
  chunk_index integer,
  page_number integer,
  content text,
  similarity double precision
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    c.id,
    c.document_id,
    d.filename,
    c.chunk_index,
    c.page_number,
    c.content,
    1 - (c.embedding operator(public.<=>) query_embedding) as similarity
  from public.document_chunks c
  join public.documents d on d.id = c.document_id
  where c.skill_id = p_skill_id
    and c.user_id = (select auth.uid())
    and c.embedding is not null
    and 1 - (c.embedding operator(public.<=>) query_embedding) >= min_similarity
  order by c.embedding operator(public.<=>) query_embedding
  limit least(greatest(match_count, 1), 20);
$$;

revoke execute on function public.match_chunks(public.vector, uuid, integer, double precision)
  from public, anon;
grant execute on function public.match_chunks(public.vector, uuid, integer, double precision)
  to authenticated;

commit;

-- Review after running --------------------------------------------------------
-- Every document should have a storage path that matches a stored file:
--   select count(*) filter (where o.name is not null) as matched,
--          count(*) filter (where o.name is null)     as unmatched
--   from public.documents d
--   left join storage.objects o
--     on o.bucket_id = 'documents' and o.name = d.storage_path;
