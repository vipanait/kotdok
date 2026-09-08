-- Record the language a stored analysis was written in.
--
-- Until 20260908120000 the prompt was hard-coded to Russian, so the question
-- never came up: every answer was Russian and every label around it was too.
-- Now the analysis follows the account's language, and the account's language
-- can change afterwards. Without this column a person who switches to English
-- would see last week's Russian result under English headings, with no way for
-- the app to know which language the words in front of them are.
--
-- Existing rows are Russian as a matter of fact, not of guesswork: every one of
-- them was produced by the old prompt.
--
-- The default matters during a deploy: a server still running the previous
-- version inserts without this column, and its answers are Russian, which is
-- exactly what the default says.

alter table public.symptom_checks
  add column if not exists locale text;

update public.symptom_checks
  set locale = 'ru'
  where locale is null;

alter table public.symptom_checks
  alter column locale set default 'ru';

alter table public.symptom_checks
  alter column locale set not null;

alter table public.symptom_checks
  drop constraint if exists symptom_checks_locale_check;

alter table public.symptom_checks
  add constraint symptom_checks_locale_check
  check (locale in ('ru', 'en'));
