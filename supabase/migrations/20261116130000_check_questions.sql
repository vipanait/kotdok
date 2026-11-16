-- Questions after a result (docs/superpowers/specs/2026-11-13-check-questions-design.md).
--
-- After a check the owner may ask up to three things about it, within 48 hours,
-- and the model answers with the check, its result and the pet's record in
-- front of it. Free of credits (owner's decision of 13 November 2026), so the
-- limit is the only thing between a person and unlimited model calls: it is
-- kept here, under a lock, not in the client and not in TypeScript.
--
-- Not the follow-up loop (followup_cases): that one asks the owner, this one
-- answers them.
--
-- Only the server reaches the table, as followup_cases: RLS on, no policies,
-- every privilege revoked. Foreign keys cascade and none sets NULL (a SET NULL
-- is an UPDATE, which refuse_late_writes refuses on an account being deleted).

create table if not exists public.check_questions (
  id uuid primary key default gen_random_uuid(),
  check_id uuid not null references public.symptom_checks(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  -- Which of the check's three places this question holds, not its order in
  -- the dialogue: a question that failed gives its place back, and the next
  -- one takes the lowest free. The dialogue is read by created_at.
  position smallint not null check (position between 1 and 3),
  question text not null check (char_length(question) between 3 and 500),
  -- NULL while the model is being asked. Such a row is never served.
  answer text,
  alert text not null default 'none' check (alert in ('none', 'see_vet_today', 'clinic_now')),
  off_topic boolean not null default false,
  client_key text not null check (char_length(client_key) between 8 and 200),
  locale text not null check (locale in ('ru', 'en')),
  created_at timestamptz not null default now(),
  answered_at timestamptz,
  unique (check_id, position),
  unique (check_id, client_key),
  constraint check_questions_answered_together check ((answer is null) = (answered_at is null))
);

create index if not exists check_questions_user on public.check_questions (user_id);

alter table public.check_questions enable row level security;
revoke all on public.check_questions from anon, authenticated;

-- An account being deleted takes no more writes, as every per-user table.
drop trigger if exists refuse_late_writes on public.check_questions;
create trigger refuse_late_writes
  before insert or update on public.check_questions
  for each row execute function public.refuse_write_for_inactive_account();

-- Takes a place for one question, or says why there is none.
--
-- The check's row is locked for the length of the call, so two questions asked
-- at once cannot both take the last place. A place is held by an answered
-- question and by one still being answered; a row left without an answer for
-- two minutes belongs to a function that died while asking the model (the
-- route may run for 90 seconds), and is cleared here, on the next call.
--
-- The same key with the same words is the same question: its stored answer is
-- returned, or `in_progress` while the first request is still waiting.
--
-- symptom_checks.created_at has no zone and holds UTC.
create or replace function public.reserve_check_question(
  p_user_id uuid,
  p_check_id uuid,
  p_question text,
  p_client_key text,
  p_locale text,
  p_now timestamptz default now()
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  c_limit constant integer := 3;
  c_window constant interval := interval '48 hours';
  c_abandoned constant interval := interval '120 seconds';
  v_checked_at timestamptz;
  v_row public.check_questions;
  v_position smallint;
begin
  select created_at at time zone 'UTC' into v_checked_at
    from public.symptom_checks
   where id = p_check_id and user_id = p_user_id and deleted_at is null
     for update;
  if not found then
    return jsonb_build_object('outcome', 'not_found', 'question', null);
  end if;

  select * into v_row from public.check_questions where check_id = p_check_id and client_key = p_client_key;
  if found then
    if v_row.question <> p_question then
      return jsonb_build_object('outcome', 'key_reused', 'question', null);
    end if;
    if v_row.answer is not null then
      return jsonb_build_object('outcome', 'replayed', 'question', to_jsonb(v_row));
    end if;
    if v_row.created_at > p_now - c_abandoned then
      return jsonb_build_object('outcome', 'in_progress', 'question', null);
    end if;
  end if;

  delete from public.check_questions
   where check_id = p_check_id and answer is null and created_at <= p_now - c_abandoned;

  if p_now >= v_checked_at + c_window then
    return jsonb_build_object('outcome', 'expired', 'question', null);
  end if;

  if (select count(*) from public.check_questions where check_id = p_check_id) >= c_limit then
    return jsonb_build_object('outcome', 'limit_reached', 'question', null);
  end if;

  select min(place) into v_position
    from generate_series(1, c_limit) as place
   where not exists (
     select 1 from public.check_questions where check_id = p_check_id and position = place
   );

  insert into public.check_questions (check_id, user_id, position, question, client_key, locale, created_at)
  values (p_check_id, p_user_id, v_position, p_question, p_client_key, p_locale, p_now)
  returning * into v_row;

  return jsonb_build_object('outcome', 'reserved', 'question', to_jsonb(v_row));
end;
$$;

revoke all on function public.reserve_check_question(uuid, uuid, text, text, text, timestamptz) from public, anon, authenticated;
grant execute on function public.reserve_check_question(uuid, uuid, text, text, text, timestamptz) to service_role;
