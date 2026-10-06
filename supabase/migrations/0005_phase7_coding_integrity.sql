-- Phase 7: integrity of coding challenges and submissions.
--
-- Challenges, their test cases and graded submissions are now written only by
-- the server (service role), after it has run code in the sandbox. A signed-in
-- browser could previously insert its own "passed" submissions.
--
--   1. coding_questions: owners can read and delete; creation is server-only
--      (the server validates a generated challenge before storing it)
--   2. test_cases: read-only for clients (visible cases of own questions only,
--      as before); no client writes
--   3. code_submissions: read-only for clients
--
-- No data is changed. Run in the Supabase SQL editor (one transaction).

begin;

-- 1. coding_questions ---------------------------------------------------------
drop policy if exists "coding_questions: via skill" on public.coding_questions;

create policy "coding_questions: read own" on public.coding_questions
  for select to authenticated
  using (skill_id in (select id from public.skills where user_id = (select auth.uid())));

create policy "coding_questions: delete own" on public.coding_questions
  for delete to authenticated
  using (skill_id in (select id from public.skills where user_id = (select auth.uid())));

revoke insert, update on public.coding_questions from anon, authenticated;

-- 2. test_cases ---------------------------------------------------------------
-- The select policy from 0001 (visible cases of own questions) stays as is.
revoke insert, update, delete on public.test_cases from anon, authenticated;

-- 3. code_submissions ---------------------------------------------------------
drop policy if exists "code_submissions: owner" on public.code_submissions;

create policy "code_submissions: read own" on public.code_submissions
  for select to authenticated
  using (user_id = (select auth.uid()));

revoke insert, update, delete on public.code_submissions from anon, authenticated;

commit;
