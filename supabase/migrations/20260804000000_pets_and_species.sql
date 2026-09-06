-- Multi-species support: cats → pets + species; vet_knowledge species filter;
-- symptom_checks.cat_id → pet_id; cat_specific_warning → species_specific_warning.

-- ---------------------------------------------------------------------------
-- pets (rename from cats)
-- ---------------------------------------------------------------------------

alter table public.cats rename to pets;

alter table public.pets
  add column if not exists species text not null default 'cat';

alter table public.pets
  drop constraint if exists pets_species_check;

alter table public.pets
  add constraint pets_species_check check (species in ('cat', 'dog'));

drop index if exists cats_user_active_idx;

create index if not exists pets_user_active_idx
  on public.pets (user_id)
  where deleted_at is null;

-- ---------------------------------------------------------------------------
-- symptom_checks: cat_id → pet_id, warning column rename
-- ---------------------------------------------------------------------------

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'symptom_checks'
      and column_name = 'cat_id'
  ) then
    alter table public.symptom_checks rename column cat_id to pet_id;
  end if;
end $$;

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'symptom_checks'
      and column_name = 'cat_specific_warning'
  ) then
    alter table public.symptom_checks rename column cat_specific_warning to species_specific_warning;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- vet_knowledge: species column + filtered RPC
-- ---------------------------------------------------------------------------

alter table public.vet_knowledge
  add column if not exists species text not null default 'cat';

alter table public.vet_knowledge
  drop constraint if exists vet_knowledge_species_check;

alter table public.vet_knowledge
  add constraint vet_knowledge_species_check check (species in ('cat', 'dog'));

create index if not exists vet_knowledge_species_idx
  on public.vet_knowledge (species);

create or replace function search_vet_knowledge(
  query_embedding vector(1536),
  match_count int default 5,
  filter_species text default 'cat'
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
  where species = filter_species
  order by embedding <=> query_embedding
  limit match_count;
$$;
