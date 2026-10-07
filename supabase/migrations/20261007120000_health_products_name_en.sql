-- The catalogue's name in English, for owners who read the app in English.
--
-- `name` stays the Russian trade name: it is what the vet passport and the box say
-- in Russia, and what the unique index and the upserts in supabase/catalog key on.
-- `name_en` is shown instead when the interface is English; null means the name
-- reads the same in both (MaxiDrops) or has not been translated yet, and the
-- Russian one is shown. Filled by supabase/catalog/catalog-names-en.sql.

alter table public.health_products add column if not exists name_en text;
