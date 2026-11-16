-- «Можно ли это питомцу»: the cache of AI answers, and the log of what the
-- reference is missing (docs/superpowers/specs/2026-11-13-pet-safety-design.md,
-- «Ответ ИИ»).
--
-- One row per normalized query, species and language. An answer younger than
-- 30 days is served again without asking the model; `asked_count` shows which
-- missing items people look for most. No user id: the answer is the same for
-- everyone, so deleting an account has nothing to remove here. Unrecognized
-- queries are never written.
--
-- No policies: only the server (service role) reads and writes it.

create table public.safety_ai_answers (
  query_key text not null check (char_length(query_key) between 1 and 80),
  species text not null check (species in ('cat', 'dog')),
  locale text not null check (locale in ('ru', 'en')),
  answer jsonb not null,
  model text not null,
  asked_count integer not null default 1,
  created_at timestamptz not null default now(),
  last_asked_at timestamptz not null default now(),
  primary key (query_key, species, locale)
);
alter table public.safety_ai_answers enable row level security;
revoke all on public.safety_ai_answers from public, anon, authenticated;
