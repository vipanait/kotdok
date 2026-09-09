-- Nothing new for an account that is leaving.
--
-- Stage 8/07: a worker that finishes after the request, a Telegram approval
-- tapped a minute too late, a payment webhook that arrives whenever the
-- provider feels like it — none of them may bring the account back to life or
-- put a credit on it.
--
-- The guard is on the tables rather than inside the six functions that write to
-- them. Six copies of a rule is six chances to forget the seventh, and the
-- callers this criterion is about are exactly the ones nobody remembers: they
-- run later, from somewhere else, often through the service role, which means
-- row level security is not in the way either. A trigger is in every path's way
-- by construction.
--
-- Only inserts and updates. Deletes stay open on purpose: the cleanup itself
-- (stage 8/05) is a series of deletes, and a guard that blocked them would stop
-- the deletion it exists to protect.

/**
 * Refuses a write when the account it belongs to is not active.
 *
 * "Not active" covers both halves of the window. `deleting` is the dangerous
 * one — the rows are still there and the cleanup may be halfway through, so a
 * late insert lands in data that is being erased and survives it. A missing
 * profile means the account is already gone; foreign keys catch most of that
 * case, but not all of it, and a named refusal reads better in a log than a
 * constraint violation.
 */
create or replace function public.refuse_write_for_inactive_account()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status text;
begin
  if new.user_id is null then
    return new;
  end if;

  select status into v_status from public.profiles where id = new.user_id;

  if v_status is distinct from 'active' then
    raise exception 'account is not accepting writes'
      using errcode = 'check_violation',
            detail = format('user %s has status %s', new.user_id, coalesce(v_status, 'gone'));
  end if;

  return new;
end;
$$;

revoke all on function public.refuse_write_for_inactive_account() from public, anon, authenticated;

do $$
declare
  t text;
begin
  foreach t in array array[
    'pets',
    'symptom_checks',
    'check_jobs',
    'credit_ledger',
    'credit_transactions',
    'transactions',
    'extra_check_requests',
    'user_feedback'
  ]
  loop
    execute format('drop trigger if exists refuse_late_writes on public.%I', t);
    execute format(
      'create trigger refuse_late_writes
         before insert or update on public.%I
         for each row execute function public.refuse_write_for_inactive_account()',
      t
    );
  end loop;
end $$;

/**
 * The same rule for the balance itself.
 *
 * `profiles` needs its own trigger because the column that matters is on the
 * row the rule is about. It fires only when `credits` actually changes, so the
 * one update that must keep working still does: marking the account `deleting`
 * is what starts all of this, and it would be absurd for the guard to block it.
 */
create or replace function public.refuse_credit_change_for_inactive_account()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.credits is distinct from old.credits and old.status is distinct from 'active' then
    raise exception 'account is not accepting credits'
      using errcode = 'check_violation',
            detail = format('user %s has status %s', old.id, old.status);
  end if;

  return new;
end;
$$;

revoke all on function public.refuse_credit_change_for_inactive_account() from public, anon, authenticated;

drop trigger if exists refuse_late_credit_changes on public.profiles;
create trigger refuse_late_credit_changes
  before update on public.profiles
  for each row execute function public.refuse_credit_change_for_inactive_account();
