-- Pin the search_path of the vet knowledge search, which Supabase's linter
-- flags as `function_search_path_mutable`.
--
-- Without a fixed search_path the function resolves `vet_knowledge` against
-- whatever the caller's search_path happens to be. Every other function in this
-- schema already sets it; these two were the exception. The table is also
-- schema-qualified now, so resolution no longer depends on the setting at all.
--
-- Both overloads exist and both are flagged: the two-argument one predates
-- multi-species support, the three-argument one filters by species.

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
language sql
stable
set search_path = public
as $$
  select
    id, content, source_title, source_url, source_name,
    1 - (embedding <=> query_embedding) as similarity
  from public.vet_knowledge
  order by embedding <=> query_embedding
  limit match_count;
$$;

create or replace function public.search_vet_knowledge(
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
language sql
stable
set search_path = public
as $$
  select
    id, content, source_title, source_url, source_name,
    1 - (embedding <=> query_embedding) as similarity
  from public.vet_knowledge
  where species = filter_species
  order by embedding <=> query_embedding
  limit match_count;
$$;
