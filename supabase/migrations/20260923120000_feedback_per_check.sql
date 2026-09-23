-- Tie feedback to the result it is about.
--
-- Until now a row said only "this person liked or disliked the product", and a
-- 24-hour cooldown kept it to one a day. That told nobody which answer was bad.
-- The result screen now asks "was this answer useful?" under every check, so
-- the opinion belongs to the check: one per check, and a second one replaces
-- the first — people change their minds after the visit to the vet.
--
-- Nullable, because the rows already stored were never about a check. Postgres
-- treats NULLs as distinct, so the unique constraint leaves them alone, and it
-- is a full constraint rather than a partial index because PostgREST's
-- `on_conflict` can only name a column, not a predicate.
--
-- The foreign key cascades: the opinion is meaningless without the check, and
-- the deletion worker already removes checks before profiles, so an account's
-- feedback still leaves with it.
--
-- `profiles.feedback_submitted_at` stays for now. It fed the cooldown and is no
-- longer written; dropping it is a separate change once nothing reads it.

alter table public.user_feedback
  add column if not exists symptom_check_id uuid
    references public.symptom_checks(id) on delete cascade;

alter table public.user_feedback
  add constraint user_feedback_symptom_check_id_key unique (symptom_check_id);

-- When the opinion was last given or changed.
alter table public.user_feedback
  add column if not exists updated_at timestamptz;
