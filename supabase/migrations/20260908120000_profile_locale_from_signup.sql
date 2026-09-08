-- Give a new profile the language its owner actually speaks.
--
-- Until now `handle_new_user` inserted the row and let the column default
-- decide: every account in the world started as Russian. The app then offered
-- a language switch and told the person their analyses would arrive in the
-- language they picked, which was a second problem, fixed in the same change.
--
-- The rule is deliberately lopsided: Russian only on a positive signal,
-- English for everyone else. The product speaks two languages, and English is
-- the one that reaches further — a Portuguese or Turkish speaker is likelier
-- to read it than Russian.
--
-- The language arrives in `raw_user_meta_data`, which is where both sources
-- already put it:
--   * email sign-up — the client sends it as sign-up metadata;
--   * OAuth — the provider volunteers one, Google as "en-GB" and the like.
--
-- The value is attacker-controlled in the email case, so it is not trusted:
-- the tag is cut at its first separator, lowercased, and only "ru" is honoured
-- as itself. Anything else — another language, a malformed tag, no tag at all
-- — becomes English rather than failing the sign-up. Nobody should be unable
-- to register because their phone is set to a third language.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  requested text;
begin
  requested := lower(split_part(coalesce(new.raw_user_meta_data ->> 'locale', ''), '-', 1));
  requested := split_part(requested, '_', 1);

  insert into public.profiles (id, locale)
  values (new.id, case when requested = 'ru' then 'ru' else 'en' end);

  return new;
end;
$$;
