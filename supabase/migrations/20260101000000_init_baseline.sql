-- Baseline schema, reconstructed for stage 0 (item 0/02) of the mobile API plan.
--
-- The repository had no migration creating the original tables, so `supabase db
-- reset` failed on the first existing migration. This file recreates the schema
-- as it stood immediately BEFORE 20260422_soft_delete_cats.sql, so the existing
-- migrations replay unchanged on top of it.
--
-- It was reconstructed from the live schema (structure only, no user data) minus
-- everything the later migrations add. Two details could not be recovered from
-- either source and are noted inline: the original default of profiles.credits
-- and the exact original urgency value list.

create extension if not exists vector with schema public;

-- Hosted Supabase projects ship default privileges that grant every table in
-- `public` to anon, authenticated and service_role as it is created. The local
-- stack does not, so without this the stand would be more locked down than
-- production and a privilege problem would be invisible in tests. Reproduce the
-- platform behaviour here; a later migration tightens it deliberately.
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------------

create table if not exists public.profiles (
  -- Live schema has no ON DELETE action here; account deletion has to clear
  -- profiles explicitly (see stage 8 of the plan).
  id uuid primary key references auth.users(id),
  -- No default here on purpose: the pre-existing default was not recoverable.
  -- 20260506_default_signup_credits.sql sets it to 2, which is the live value.
  credits integer,
  plan text default 'free',
  created_at timestamp default now()
);

alter table public.profiles enable row level security;

drop policy if exists "Users see own profile" on public.profiles;
create policy "Users see own profile" on public.profiles
  for all using (auth.uid() = id);

-- New auth users get an empty profile row.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id) values (new.id);
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- cats (renamed to pets by 20260804_pets_and_species.sql)
-- ---------------------------------------------------------------------------

create table if not exists public.cats (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id),
  name text,
  breed text,
  age_years double precision,
  weight_kg double precision,
  sex text,
  neutered boolean,
  chronic_conditions text[],
  medications text[],
  created_at timestamp default now(),
  indoor_outdoor text check (indoor_outdoor in ('indoor', 'outdoor', 'both')),
  diet text check (diet in ('dry', 'wet', 'mixed', 'raw')),
  allergies text[] default '{}'::text[],
  vaccinated boolean,
  notes text
);

alter table public.cats enable row level security;

drop policy if exists "Users manage own cats" on public.cats;
create policy "Users manage own cats" on public.cats
  for all using (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- symptom_checks
-- ---------------------------------------------------------------------------

create table if not exists public.symptom_checks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id),
  cat_id uuid references public.cats(id),
  symptoms_input text,
  -- 'healthy' is added by 20260423_add_healthy_urgency.sql, which locates this
  -- constraint by its definition rather than by name.
  urgency text check (urgency in ('emergency', 'urgent', 'monitor', 'home_care')),
  urgency_reason text,
  possible_causes text[],
  cat_specific_warning text,
  home_care_steps text[],
  vet_questions text[],
  full_response jsonb,
  created_at timestamp default now()
);

alter table public.symptom_checks enable row level security;

drop policy if exists "Users see own checks" on public.symptom_checks;
create policy "Users see own checks" on public.symptom_checks
  for all using (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- vet_knowledge (RAG corpus, public read)
-- ---------------------------------------------------------------------------

create table if not exists public.vet_knowledge (
  id bigserial primary key,
  source_url text,
  source_title text,
  source_name text,
  chunk_index integer,
  content text,
  embedding vector(1536),
  created_at timestamp default now()
);

create index if not exists vet_knowledge_embedding_idx
  on public.vet_knowledge using ivfflat (embedding vector_cosine_ops) with (lists = 100);

alter table public.vet_knowledge enable row level security;

drop policy if exists "Public read vet_knowledge" on public.vet_knowledge;
create policy "Public read vet_knowledge" on public.vet_knowledge
  for select using (true);

-- Species-unaware search; 20260804_pets_and_species.sql adds the filtered
-- overload. Both signatures exist in the live database.
create or replace function public.search_vet_knowledge(
  query_embedding vector(1536),
  match_count int default 5
)
returns table (
  id bigint,
  content text,
  source_title text,
  source_url text,
  source_name text,
  similarity float
)
language sql stable
as $$
  select
    id, content, source_title, source_url, source_name,
    1 - (embedding <=> query_embedding) as similarity
  from vet_knowledge
  order by embedding <=> query_embedding
  limit match_count;
$$;

-- ---------------------------------------------------------------------------
-- credit_transactions (legacy billing v1; superseded by billing v2, kept as-is)
-- ---------------------------------------------------------------------------

create table if not exists public.credit_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id),
  amount integer,
  type text,
  stripe_session_id text,
  created_at timestamp default now()
);

alter table public.credit_transactions enable row level security;

drop policy if exists "Users see own transactions" on public.credit_transactions;
create policy "Users see own transactions" on public.credit_transactions
  for all using (auth.uid() = user_id);
