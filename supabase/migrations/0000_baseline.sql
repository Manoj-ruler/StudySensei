-- Baseline: the schema as it existed before any migration in this repo,
-- reconstructed from the live database catalog (columns, constraints, indexes,
-- functions, triggers).
--
-- DO NOT RUN THIS AGAINST THE EXISTING PROJECT: those objects already exist.
-- It exists so that a fresh database can be built by replaying every file in
-- this folder in order (0000, 0001, 0002, ...).
--
-- Row level security policies are not part of the baseline: 0001 defines them.

create extension if not exists vector with schema public;

-- Functions used by triggers ---------------------------------------------------

create or replace function public.update_updated_at_column()
returns trigger
language plpgsql
as $function$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$function$;

create or replace function public.update_learning_tasks_updated_at()
returns trigger
language plpgsql
as $function$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$function$;

-- Core tables ------------------------------------------------------------------

create table public.profiles (
    id uuid not null,
    full_name text,
    avatar_url text,
    updated_at timestamp with time zone,
    constraint profiles_pkey primary key (id),
    constraint profiles_id_fkey foreign key (id) references auth.users (id),
    constraint username_length check (char_length(full_name) >= 3)
);

create table public.skills (
    id uuid not null default gen_random_uuid(),
    user_id uuid not null,
    title text not null,
    description text,
    created_at timestamp with time zone not null default timezone('utc'::text, now()),
    is_technical boolean default true,
    category text default 'technical'::text,
    roadmap text,
    roadmap_svg text,
    constraint skills_pkey primary key (id),
    constraint skills_user_id_fkey foreign key (user_id) references auth.users (id)
);

create table public.documents (
    id uuid not null default gen_random_uuid(),
    user_id uuid not null,
    skill_id uuid,
    filename text not null,
    file_url text not null,
    processed boolean default false,
    created_at timestamp with time zone not null default timezone('utc'::text, now()),
    status text default 'pending'::text,
    error_message text,
    page_count integer,
    file_size bigint,
    file_type text,
    constraint documents_pkey primary key (id),
    constraint documents_user_id_fkey foreign key (user_id) references auth.users (id),
    constraint documents_skill_id_fkey foreign key (skill_id) references public.skills (id) on delete cascade
);

create table public.document_chunks (
    id uuid not null default gen_random_uuid(),
    document_id uuid not null,
    content text not null,
    embedding public.vector(768),
    chunk_index integer,
    created_at timestamp with time zone not null default timezone('utc'::text, now()),
    page_number integer,
    confidence_score double precision default 0.0,
    constraint document_chunks_pkey primary key (id),
    constraint document_chunks_document_id_fkey foreign key (document_id) references public.documents (id) on delete cascade
);

create index idx_document_chunks_confidence on public.document_chunks using btree (confidence_score desc);
create index idx_document_chunks_page on public.document_chunks using btree (document_id, page_number);
create index document_chunks_embedding_idx on public.document_chunks
    using ivfflat (embedding public.vector_cosine_ops) with (lists = '100');

create table public.chats (
    id uuid not null default gen_random_uuid(),
    user_id uuid not null,
    skill_id uuid,
    title text,
    created_at timestamp with time zone not null default timezone('utc'::text, now()),
    constraint chats_pkey primary key (id),
    constraint chats_user_id_fkey foreign key (user_id) references auth.users (id),
    constraint chats_skill_id_fkey foreign key (skill_id) references public.skills (id) on delete cascade
);

create table public.messages (
    id uuid not null default gen_random_uuid(),
    chat_id uuid not null,
    role text not null,
    content text not null,
    created_at timestamp with time zone not null default timezone('utc'::text, now()),
    mode text default 'explain'::text,
    constraint messages_pkey primary key (id),
    constraint messages_chat_id_fkey foreign key (chat_id) references public.chats (id) on delete cascade,
    constraint messages_role_check check (role = any (array['user'::text, 'assistant'::text]))
);

create table public.quizzes (
    id uuid not null default gen_random_uuid(),
    skill_id uuid not null,
    score integer,
    total_questions integer,
    created_at timestamp with time zone not null default timezone('utc'::text, now()),
    constraint quizzes_pkey primary key (id),
    constraint quizzes_skill_id_fkey foreign key (skill_id) references public.skills (id) on delete cascade
);

create table public.quiz_questions (
    id uuid not null default gen_random_uuid(),
    quiz_id uuid,
    skill_id uuid,
    question text not null,
    options jsonb not null,
    correct_answer integer not null,
    user_answer integer,
    is_correct boolean,
    created_at timestamp with time zone not null default timezone('utc'::text, now()),
    constraint quiz_questions_pkey primary key (id),
    constraint quiz_questions_quiz_id_fkey foreign key (quiz_id) references public.quizzes (id),
    constraint quiz_questions_skill_id_fkey foreign key (skill_id) references public.skills (id)
);

create table public.coding_questions (
    id uuid not null default gen_random_uuid(),
    skill_id uuid,
    title text not null,
    description text not null,
    difficulty text,
    created_at timestamp with time zone not null default timezone('utc'::text, now()),
    constraint coding_questions_pkey primary key (id),
    constraint coding_questions_skill_id_fkey foreign key (skill_id) references public.skills (id) on delete cascade,
    constraint coding_questions_difficulty_check check (difficulty = any (array['Easy'::text, 'Medium'::text, 'Hard'::text]))
);

create table public.test_cases (
    id uuid not null default gen_random_uuid(),
    question_id uuid not null,
    input text not null,
    expected_output text not null,
    is_hidden boolean default false,
    constraint test_cases_pkey primary key (id),
    constraint test_cases_question_id_fkey foreign key (question_id) references public.coding_questions (id) on delete cascade
);

create table public.code_submissions (
    id uuid not null default gen_random_uuid(),
    user_id uuid not null,
    question_id uuid not null,
    code text not null,
    language text not null default 'python'::text,
    status text,
    output text,
    created_at timestamp with time zone not null default timezone('utc'::text, now()),
    constraint code_submissions_pkey primary key (id),
    constraint code_submissions_user_id_fkey foreign key (user_id) references auth.users (id),
    constraint code_submissions_question_id_fkey foreign key (question_id) references public.coding_questions (id) on delete cascade,
    constraint code_submissions_status_check check (status = any (array['pending'::text, 'passed'::text, 'failed'::text, 'error'::text]))
);

create table public.progress_metrics (
    id uuid not null default gen_random_uuid(),
    user_id uuid not null,
    skill_id uuid,
    activity_type text,
    score integer,
    max_score integer,
    metadata jsonb,
    created_at timestamp with time zone not null default timezone('utc'::text, now()),
    constraint progress_metrics_pkey primary key (id),
    constraint progress_metrics_user_id_fkey foreign key (user_id) references auth.users (id),
    constraint progress_metrics_skill_id_fkey foreign key (skill_id) references public.skills (id) on delete cascade,
    constraint progress_metrics_activity_type_check check (activity_type = any (array['quiz'::text, 'code'::text, 'chat'::text]))
);

-- Task and roadmap tables (not used by the current frontend) -------------------

create table public.tasks (
    id uuid not null default gen_random_uuid(),
    user_id uuid not null,
    skill_id uuid,
    title text not null,
    description text,
    status text not null default 'todo'::text,
    "position" double precision not null default 0,
    priority text default 'medium'::text,
    due_date timestamp with time zone,
    source_chat_id uuid,
    created_at timestamp with time zone not null default timezone('utc'::text, now()),
    updated_at timestamp with time zone not null default timezone('utc'::text, now()),
    constraint tasks_pkey primary key (id),
    constraint tasks_user_id_fkey foreign key (user_id) references auth.users (id) on delete cascade,
    constraint tasks_skill_id_fkey foreign key (skill_id) references public.skills (id) on delete cascade,
    constraint tasks_source_chat_id_fkey foreign key (source_chat_id) references public.chats (id) on delete set null,
    constraint tasks_priority_check check (priority = any (array['low'::text, 'medium'::text, 'high'::text])),
    constraint tasks_status_check check (status = any (array['todo'::text, 'in-progress'::text, 'done'::text]))
);

create index idx_tasks_user_status on public.tasks using btree (user_id, status);
create index idx_tasks_position on public.tasks using btree ("position");

create table public.learning_tasks (
    id uuid not null default gen_random_uuid(),
    user_id uuid not null,
    skill_id uuid not null,
    title text not null,
    description text,
    task_type text not null,
    verification_method text not null,
    verification_criteria jsonb default '{}'::jsonb,
    status text default 'locked'::text,
    progress_percentage integer default 0,
    phase integer not null,
    phase_name text not null,
    topic text,
    auto_generated boolean default true,
    prerequisite_task_ids uuid[] default '{}'::uuid[],
    unlocked boolean default false,
    "position" integer not null default 1000,
    priority text default 'medium'::text,
    due_date timestamp with time zone,
    created_at timestamp with time zone default now(),
    updated_at timestamp with time zone default now(),
    constraint learning_tasks_pkey primary key (id),
    constraint learning_tasks_user_id_fkey foreign key (user_id) references auth.users (id) on delete cascade,
    constraint learning_tasks_skill_id_fkey foreign key (skill_id) references public.skills (id) on delete cascade,
    constraint learning_tasks_task_type_check check (task_type = any (array['study'::text, 'quiz'::text, 'challenge'::text, 'practice'::text, 'project'::text])),
    constraint learning_tasks_priority_check check (priority = any (array['low'::text, 'medium'::text, 'high'::text])),
    constraint learning_tasks_verification_method_check check (verification_method = any (array['quiz_score'::text, 'challenge_pass'::text, 'chat_engagement'::text, 'manual'::text])),
    constraint learning_tasks_status_check check (status = any (array['locked'::text, 'todo'::text, 'in-progress'::text, 'done'::text])),
    constraint learning_tasks_progress_percentage_check check ((progress_percentage >= 0) and (progress_percentage <= 100))
);

create index idx_learning_tasks_status on public.learning_tasks using btree (status);
create index idx_learning_tasks_user_id on public.learning_tasks using btree (user_id);
create index idx_learning_tasks_skill_id on public.learning_tasks using btree (skill_id);
create index idx_learning_tasks_phase on public.learning_tasks using btree (skill_id, phase);

create table public.task_progress_logs (
    id uuid not null default gen_random_uuid(),
    task_id uuid not null,
    user_id uuid not null,
    event_type text not null,
    score integer,
    max_score integer,
    metadata jsonb default '{}'::jsonb,
    created_at timestamp with time zone default now(),
    constraint task_progress_logs_pkey primary key (id),
    constraint task_progress_logs_task_id_fkey foreign key (task_id) references public.learning_tasks (id) on delete cascade,
    constraint task_progress_logs_user_id_fkey foreign key (user_id) references auth.users (id) on delete cascade,
    constraint task_progress_logs_event_type_check check (event_type = any (array['quiz_completed'::text, 'challenge_passed'::text, 'chat_session'::text, 'manual_update'::text]))
);

create index idx_task_progress_logs_task_id on public.task_progress_logs using btree (task_id);

create table public.chat_sessions (
    id uuid not null default gen_random_uuid(),
    chat_id uuid not null,
    user_id uuid not null,
    skill_id uuid,
    task_id uuid,
    message_count integer default 0,
    session_duration_minutes integer default 0,
    mode text,
    topic text,
    started_at timestamp with time zone default now(),
    ended_at timestamp with time zone,
    constraint chat_sessions_pkey primary key (id),
    constraint chat_sessions_chat_id_key unique (chat_id),
    constraint chat_sessions_chat_id_fkey foreign key (chat_id) references public.chats (id) on delete cascade,
    constraint chat_sessions_user_id_fkey foreign key (user_id) references auth.users (id) on delete cascade,
    constraint chat_sessions_skill_id_fkey foreign key (skill_id) references public.skills (id) on delete set null,
    constraint chat_sessions_task_id_fkey foreign key (task_id) references public.learning_tasks (id) on delete set null
);

create index idx_chat_sessions_skill_id on public.chat_sessions using btree (skill_id);
create index idx_chat_sessions_task_id on public.chat_sessions using btree (task_id);

-- Product feedback tables (not used by the current frontend) -------------------

create table public.notifications (
    id uuid not null default gen_random_uuid(),
    user_id uuid not null,
    type text not null,
    title text not null,
    message text not null,
    read boolean default false,
    action_url text,
    metadata jsonb default '{}'::jsonb,
    created_at timestamp with time zone not null default timezone('utc'::text, now()),
    constraint notifications_pkey primary key (id),
    constraint notifications_user_id_fkey foreign key (user_id) references auth.users (id) on delete cascade
);

create index idx_notifications_user_unread on public.notifications using btree (user_id, read, created_at desc);

create table public.feature_requests (
    id uuid not null default gen_random_uuid(),
    title text not null,
    description text not null,
    status text not null default 'planned'::text,
    category text,
    target_date timestamp with time zone,
    completed_at timestamp with time zone,
    created_by uuid,
    created_at timestamp with time zone not null default timezone('utc'::text, now()),
    updated_at timestamp with time zone not null default timezone('utc'::text, now()),
    constraint feature_requests_pkey primary key (id),
    constraint feature_requests_created_by_fkey foreign key (created_by) references auth.users (id) on delete set null,
    constraint feature_requests_status_check check (status = any (array['planned'::text, 'in-progress'::text, 'completed'::text, 'rejected'::text]))
);

create index idx_feature_requests_status on public.feature_requests using btree (status);

create table public.votes (
    id uuid not null default gen_random_uuid(),
    user_id uuid not null,
    feature_id uuid not null,
    created_at timestamp with time zone not null default timezone('utc'::text, now()),
    constraint votes_pkey primary key (id),
    constraint votes_user_feature_unique unique (user_id, feature_id),
    constraint votes_user_id_fkey foreign key (user_id) references auth.users (id) on delete cascade,
    constraint votes_feature_id_fkey foreign key (feature_id) references public.feature_requests (id) on delete cascade
);

create index idx_votes_feature on public.votes using btree (feature_id);

create table public.changelog (
    id uuid not null default gen_random_uuid(),
    version text not null,
    title text not null,
    description text,
    release_date timestamp with time zone not null,
    features jsonb default '[]'::jsonb,
    created_at timestamp with time zone not null default timezone('utc'::text, now()),
    constraint changelog_pkey primary key (id)
);

create index idx_changelog_release on public.changelog using btree (release_date desc);

-- Functions --------------------------------------------------------------------

create or replace function public.match_documents(
    query_embedding public.vector,
    match_threshold double precision default 0.3,
    match_count integer default 5,
    filter_skill_id uuid default null::uuid
)
returns table (
    id uuid,
    document_id uuid,
    content text,
    chunk_index integer,
    similarity double precision,
    document_name text,
    filename text
)
language plpgsql
as $function$
BEGIN
    RETURN QUERY
    SELECT
        dc.id,
        dc.document_id,
        dc.content,
        dc.chunk_index,
        1 - (dc.embedding <=> query_embedding) as similarity,
        d.filename as document_name,
        d.filename
    FROM document_chunks dc
    JOIN documents d ON dc.document_id = d.id
    WHERE
        (filter_skill_id IS NULL OR d.skill_id = filter_skill_id)
        AND 1 - (dc.embedding <=> query_embedding) > match_threshold
    ORDER BY dc.embedding <=> query_embedding
    LIMIT match_count;
END;
$function$;

create or replace function public.get_unread_notification_count(p_user_id uuid)
returns integer
language plpgsql
security definer
as $function$
BEGIN
    RETURN (SELECT COUNT(*)::integer FROM public.notifications WHERE user_id = p_user_id AND read = false);
END;
$function$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
as $function$
begin
  insert into public.profiles (id, full_name, avatar_url)
  values (new.id, new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'avatar_url');
  return new;
end;
$function$;

-- Triggers ---------------------------------------------------------------------

create trigger on_auth_user_created
    after insert on auth.users
    for each row execute function public.handle_new_user();

create trigger update_tasks_updated_at
    before update on public.tasks
    for each row execute function public.update_updated_at_column();

create trigger update_feature_requests_updated_at
    before update on public.feature_requests
    for each row execute function public.update_updated_at_column();

create trigger learning_tasks_updated_at
    before update on public.learning_tasks
    for each row execute function public.update_learning_tasks_updated_at();

-- Storage ----------------------------------------------------------------------
-- Uploaded files live in the "documents" bucket at {user_id}/{skill_id}/{file}.
-- It was public originally; 0001 makes it private.

insert into storage.buckets (id, name, public)
values ('documents', 'documents', true)
on conflict (id) do nothing;
