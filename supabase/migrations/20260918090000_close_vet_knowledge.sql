-- Close the vet knowledge corpus to user tokens.
--
-- The anon key ships inside the mobile app and in every page load, so anything
-- `anon` may do is something any reader may do, straight against PostgREST and
-- without going near the API. Two things were open:
--
--   * `search_vet_knowledge` never revoked the EXECUTE that Postgres grants to
--     PUBLIC, and `match_count` had no ceiling. One request could ask the
--     database to rank the whole table and hand back all of it; a loop of them
--     is a load generator with no account attached.
--   * The table itself was readable by anyone, embeddings included, so the
--     corpus could be copied page by page.
--
-- Neither is needed: the analysis searches the corpus with the service role
-- (`analyze-symptom-check.ts` builds a service client), and nothing in either
-- app reads `vet_knowledge` with a user token. "Public read" in the baseline
-- described how the table was set up, not something a reader relies on.

-- Both overloads exist in the live database: the two-argument one predates
-- multi-species support. The bodies are restated here only to add the ceiling.
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
  -- A caller asking for more gets 20; asking for none or less gets 1.
  limit least(greatest(coalesce(match_count, 5), 1), 20);
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
  limit least(greatest(coalesce(match_count, 5), 1), 20);
$$;

revoke execute on function public.search_vet_knowledge(vector, int)
  from public, anon, authenticated;
revoke execute on function public.search_vet_knowledge(vector, int, text)
  from public, anon, authenticated;

grant execute on function public.search_vet_knowledge(vector, int) to service_role;
grant execute on function public.search_vet_knowledge(vector, int, text) to service_role;

-- The corpus itself follows the same line: RLS stays on, the read policy goes,
-- and the table grants go with it.
drop policy if exists "Public read vet_knowledge" on public.vet_knowledge;

revoke all on public.vet_knowledge from anon, authenticated;
