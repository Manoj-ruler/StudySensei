-- Phase 6: server-side quiz grading and trustworthy progress records.
--
-- Until now a signed-in browser could read correct answers directly from
-- quiz_questions and write its own scores into quizzes and progress_metrics.
--
--   1. quiz_questions: correct_answer and explanation are no longer readable by
--      clients; rows can be created and deleted by their owner but not edited
--   2. quizzes: owners can create, read and delete, but not edit (scores are
--      set by the grading function only)
--   3. progress_metrics: read-only for clients
--   4. answer_quiz_question(): grades one answer, and on the last answer
--      completes the quiz and records progress
--   5. get_quiz_history(): completed quizzes with answers, for review
--
-- No data is changed. Run in the Supabase SQL editor (one transaction).

begin;

-- 1. quiz_questions -----------------------------------------------------------
drop policy if exists "quiz_questions: via skill" on public.quiz_questions;

create policy "quiz_questions: read own" on public.quiz_questions
  for select to authenticated
  using (skill_id in (select id from public.skills where user_id = (select auth.uid())));

create policy "quiz_questions: create own" on public.quiz_questions
  for insert to authenticated
  with check (
    skill_id in (select id from public.skills where user_id = (select auth.uid()))
    and quiz_id in (select id from public.quizzes where user_id = (select auth.uid()))
    -- New questions always start unanswered.
    and user_answer is null and is_correct is null);

create policy "quiz_questions: delete own" on public.quiz_questions
  for delete to authenticated
  using (skill_id in (select id from public.skills where user_id = (select auth.uid())));

-- Column-level read access: everything except the answer key.
revoke select on public.quiz_questions from anon, authenticated;
grant select (id, quiz_id, skill_id, question, options, user_answer, is_correct, created_at, "position")
  on public.quiz_questions to authenticated;
revoke update on public.quiz_questions from anon, authenticated;

-- 2. quizzes ------------------------------------------------------------------
drop policy if exists "quizzes: via skill" on public.quizzes;

create policy "quizzes: read own" on public.quizzes
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy "quizzes: create own" on public.quizzes
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and skill_id in (select id from public.skills where user_id = (select auth.uid()))
    -- A new quiz is never created already scored.
    and status = 'in_progress' and score is null and completed_at is null);

create policy "quizzes: delete own" on public.quizzes
  for delete to authenticated
  using (user_id = (select auth.uid()));

revoke update on public.quizzes from anon, authenticated;

-- 3. progress_metrics ---------------------------------------------------------
drop policy if exists "progress_metrics: owner" on public.progress_metrics;

create policy "progress_metrics: read own" on public.progress_metrics
  for select to authenticated
  using (user_id = (select auth.uid()));

revoke insert, update, delete on public.progress_metrics from anon, authenticated;

-- 4. Grading ------------------------------------------------------------------

-- Records the caller's answer to one question and returns the result.
-- The first answer to a question is final. When the last question of a quiz
-- is answered, the quiz is completed and a progress record is written.
-- SECURITY DEFINER because clients cannot read the answer key or edit scores;
-- ownership is checked against auth.uid() inside.
create function public.answer_quiz_question(p_question_id uuid, p_answer integer)
returns table (
  is_correct boolean,
  correct_answer integer,
  explanation text,
  quiz_completed boolean,
  score integer,
  total_questions integer
)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_question record;
  v_quiz record;
  v_remaining integer;
  v_score integer;
  v_total integer;
begin
  select qq.id, qq.quiz_id, qq.correct_answer as answer_key, qq.user_answer as given,
         jsonb_array_length(qq.options) as option_count
  into v_question
  from public.quiz_questions qq
  join public.quizzes z on z.id = qq.quiz_id
  where qq.id = p_question_id
    and z.user_id = (select auth.uid())
  for update of qq;

  if not found then
    raise exception 'Question not found' using errcode = 'P0002';
  end if;

  if p_answer is null or p_answer < 0 or p_answer >= v_question.option_count then
    raise exception 'Answer is out of range' using errcode = '22023';
  end if;

  if v_question.given is null then
    update public.quiz_questions qq
    set user_answer = p_answer,
        is_correct = (p_answer = v_question.answer_key)
    where qq.id = v_question.id;
  end if;

  select count(*) filter (where qq.user_answer is null),
         count(*) filter (where qq.is_correct),
         count(*)
  into v_remaining, v_score, v_total
  from public.quiz_questions qq
  where qq.quiz_id = v_question.quiz_id;

  if v_remaining = 0 then
    update public.quizzes z
    set score = v_score,
        total_questions = v_total,
        status = 'completed',
        completed_at = now()
    where z.id = v_question.quiz_id
      and z.status <> 'completed'
    returning z.id, z.user_id, z.skill_id into v_quiz;

    if found then
      insert into public.progress_metrics (user_id, skill_id, activity_type, score, max_score, metadata)
      values (v_quiz.user_id, v_quiz.skill_id, 'quiz', v_score, v_total,
              jsonb_build_object('quiz_id', v_quiz.id));
    end if;
  end if;

  return query
  select coalesce(qq.is_correct, false), qq.correct_answer, qq.explanation,
         v_remaining = 0, v_score, v_total
  from public.quiz_questions qq
  where qq.id = v_question.id;
end;
$$;

revoke execute on function public.answer_quiz_question(uuid, integer) from public, anon;
grant execute on function public.answer_quiz_question(uuid, integer) to authenticated;

-- 5. History ------------------------------------------------------------------

-- The caller's completed quizzes for one skill, newest first, with the answer
-- key (safe to reveal once a quiz is finished).
create function public.get_quiz_history(p_skill_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(to_jsonb(h) order by h.created_at desc), '[]'::jsonb)
  from (
    select
      z.id,
      z.score,
      z.total_questions,
      z.created_at,
      (
        select coalesce(jsonb_agg(
          jsonb_build_object(
            'question', qq.question,
            'options', qq.options,
            'correct_answer', qq.correct_answer,
            'user_answer', qq.user_answer,
            'is_correct', coalesce(qq.is_correct, false),
            'explanation', qq.explanation)
          order by qq."position" nulls last, qq.created_at), '[]'::jsonb)
        from public.quiz_questions qq
        where qq.quiz_id = z.id
      ) as questions
    from public.quizzes z
    where z.skill_id = p_skill_id
      and z.user_id = (select auth.uid())
      and z.status = 'completed'
    order by z.created_at desc
    limit 20
  ) h;
$$;

revoke execute on function public.get_quiz_history(uuid) from public, anon;
grant execute on function public.get_quiz_history(uuid) to authenticated;

commit;
