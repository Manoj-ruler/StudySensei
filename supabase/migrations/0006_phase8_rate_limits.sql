-- Phase 8: rate limiting and input length limits.
--
--   1. rate_limits + consume_rate_limit(): an atomic per-user counter. The
--      earlier limits counted recent rows before doing the work and wrote the
--      row afterwards, so parallel requests could all pass the check.
--   2. Length limits on text the browser writes directly to the database.
--
-- No existing data is changed. Run in the Supabase SQL editor (one transaction).

begin;

-- 1. Rate limiting ------------------------------------------------------------

create table public.rate_limits (
  user_id uuid not null references auth.users (id) on delete cascade,
  action text not null,
  window_seconds integer not null,
  window_start timestamp with time zone not null,
  count integer not null default 0,
  primary key (user_id, action, window_seconds, window_start),
  -- Fixed sets, so a caller cannot fill the table with made-up keys.
  constraint rate_limits_action_check check (action in (
    'mentor_message', 'document_upload', 'document_process', 'document_search',
    'quiz_generate', 'quiz_answer', 'roadmap_generate',
    'challenge_generate', 'code_submit')),
  constraint rate_limits_window_check check (window_seconds in (60, 86400))
);

-- No policies: clients have no direct access. Only the function below touches it.
alter table public.rate_limits enable row level security;
revoke all on public.rate_limits from anon, authenticated;

-- Counts one use of `p_action` by the caller in the current fixed window and
-- returns whether it is within `p_limit`. The insert-or-increment is a single
-- statement, so concurrent requests are counted correctly.
-- A caller can only ever spend their own allowance.
create function public.consume_rate_limit(p_action text, p_limit integer, p_window_seconds integer)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_window timestamp with time zone;
  v_count integer;
begin
  if v_user is null then
    return false;
  end if;
  if p_limit is null or p_limit < 1 then
    raise exception 'Invalid limit' using errcode = '22023';
  end if;

  v_window := to_timestamp(floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds);

  insert into public.rate_limits as r (user_id, action, window_seconds, window_start, count)
  values (v_user, p_action, p_window_seconds, v_window, 1)
  on conflict (user_id, action, window_seconds, window_start)
  do update set count = r.count + 1
  returning r.count into v_count;

  -- Occasionally clear out windows that can no longer matter.
  if random() < 0.02 then
    delete from public.rate_limits where window_start < now() - interval '2 days';
  end if;

  return v_count <= p_limit;
end;
$$;

revoke execute on function public.consume_rate_limit(text, integer, integer) from public, anon;
grant execute on function public.consume_rate_limit(text, integer, integer) to authenticated;

-- 2. Length limits ------------------------------------------------------------
-- NOT VALID: enforced for new and edited rows without failing on anything
-- already stored.

alter table public.skills
  add constraint skills_title_length check (char_length(title) between 1 and 200) not valid,
  add constraint skills_description_length check (description is null or char_length(description) <= 2000) not valid;

alter table public.profiles
  add constraint profiles_full_name_length check (full_name is null or char_length(full_name) <= 200) not valid;

alter table public.messages
  add constraint messages_content_length check (char_length(content) <= 100000) not valid;

commit;
