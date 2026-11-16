-- Read-only: how fit the vet_knowledge source fields are for showing to a user.
select json_build_object(
  'by_source', (select json_agg(t) from (
    select source_name, species,
      count(*) as chunks,
      count(distinct source_url) as articles,
      count(*) filter (where source_url is null or btrim(source_url) = '') as no_url,
      count(*) filter (where source_url !~ '^https://') as not_https,
      count(*) filter (where source_title is null or btrim(source_title) = '') as no_title,
      count(*) filter (where source_name is null or btrim(source_name) = '') as no_name,
      count(*) filter (where embedding is null) as no_embedding,
      max(length(source_title)) as longest_title,
      count(distinct source_url) filter (where length(source_title) > 80) as articles_title_over_80,
      min(created_at)::date as first_loaded, max(created_at)::date as last_loaded
    from public.vet_knowledge group by 1, 2 order by 1, 2) t),
  'urls_with_several_titles', (select count(*) from (
    select source_url from public.vet_knowledge group by 1 having count(distinct source_title) > 1) x),
  'urls_in_both_species', (select count(*) from (
    select source_url from public.vet_knowledge group by 1 having count(distinct species) > 1) x),
  'title_samples', (select json_agg(t) from (
    select distinct on (source_name, source_url) source_name, source_title, source_url
    from public.vet_knowledge where chunk_index = 0 and id % 97 = 0 limit 24) t),
  'checks_total', (select count(*) from public.symptom_checks),
  'full_response_keys', (select json_agg(t) from (
    select k, count(*) as n from public.symptom_checks, jsonb_object_keys(full_response) k
    group by 1 order by 2 desc) t)
);
