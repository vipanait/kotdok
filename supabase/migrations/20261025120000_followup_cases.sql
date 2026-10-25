-- The follow-up loop after a symptom check (docs/plans/followup-loop/README.md).
--
-- A case starts from one check. The app asks how the pet is doing at fixed
-- moments, and a fixed rule — computed by the server in TypeScript
-- (packages/shared/src/followup/rules.ts), not by the model — closes the case,
-- keeps watching or sends the owner to a vet. Re-checks join the case.
--
-- Only the server reaches these tables, as check_jobs: RLS on, no policies,
-- every privilege revoked. Every foreign key cascades and none sets NULL: a SET
-- NULL is an UPDATE, and an UPDATE on an account being deleted is refused by
-- refuse_late_writes, which would stop delete_account_data half way.

create table if not exists public.followup_cases (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  pet_id uuid not null references public.pets(id) on delete cascade,
  origin_check_id uuid not null unique references public.symptom_checks(id) on delete cascade,
  origin_urgency text not null check (origin_urgency in ('emergency', 'urgent', 'monitor', 'home_care')),
  -- The latest check's: a re-check may change it, and the schedule counts from it.
  current_urgency text not null check (current_urgency in ('emergency', 'urgent', 'monitor', 'home_care', 'healthy')),
  anchor_at timestamptz not null,
  plan text not null check (plan in ('watch', 'vet')),
  -- `off`: offered and not switched on — kept so the statistics see who declined.
  status text not null default 'off' check (status in ('off', 'active', 'closed')),
  next_slot text check (next_slot in ('mid', 'final', 'vet')),
  next_due_at timestamptz,
  vet_asks smallint not null default 0 check (vet_asks >= 0),
  escalation text not null default 'none' check (escalation in ('none', 'see_vet', 'see_vet_today', 'clinic_now')),
  outcome text check (outcome in ('improved', 'vet_seen', 'unresolved', 'dismissed', 'expired', 'superseded', 'pet_deleted')),
  offered_via text not null check (offered_via in ('mobile', 'web')),
  enabled_at timestamptz,
  hidden_until timestamptz,
  saved_to_record_at timestamptz,
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint followup_cases_closed_has_outcome check ((status = 'closed') = (outcome is not null)),
  constraint followup_cases_closed_at check ((status = 'closed') = (closed_at is not null)),
  constraint followup_cases_active_has_next check (status <> 'active' or (next_slot is not null and next_due_at is not null)),
  constraint followup_cases_record_only_closed check (saved_to_record_at is null or status = 'closed')
);

-- One open case per pet: it also caps the notifications at one per pet.
create unique index if not exists followup_cases_one_active_per_pet
  on public.followup_cases (pet_id) where status = 'active';
create index if not exists followup_cases_user_due
  on public.followup_cases (user_id, next_due_at) where status = 'active';
create index if not exists followup_cases_pet_closed
  on public.followup_cases (pet_id, closed_at desc) where status = 'closed';
create index if not exists followup_cases_created
  on public.followup_cases (created_at);

-- The checks of a case. A table rather than a column on symptom_checks, for
-- the SET NULL reason above.
create table if not exists public.followup_case_checks (
  case_id uuid not null references public.followup_cases(id) on delete cascade,
  check_id uuid not null unique references public.symptom_checks(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('origin', 'recheck')),
  created_at timestamptz not null default now(),
  primary key (case_id, check_id)
);

create table if not exists public.followup_checkins (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.followup_cases(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  slot text not null check (slot in ('mid', 'final', 'vet', 'extra')),
  vet_visited boolean,
  state text not null check (state in ('better', 'same', 'worse')),
  note text check (char_length(note) <= 500),
  decision text not null
    check (decision in ('close_improved', 'keep_watching', 'see_vet', 'see_vet_today', 'clinic_now', 'vet_seen')),
  -- The case's urgency when answered, and hours since the first check: the
  -- statistics read them without replaying the case.
  urgency_at_answer text not null,
  hours_since_check numeric(7, 1) not null check (hours_since_check >= 0),
  source text not null check (source in ('notification', 'pets_list', 'pet_card', 'web_banner', 'timeline', 'result')),
  idempotency_key text not null check (char_length(idempotency_key) between 8 and 200),
  created_at timestamptz not null default now(),
  unique (case_id, idempotency_key),
  constraint followup_checkins_vet_only_on_vet check ((slot = 'vet') = (vet_visited is not null))
);

create index if not exists followup_checkins_case on public.followup_checkins (case_id, created_at);

alter table public.followup_cases enable row level security;
alter table public.followup_case_checks enable row level security;
alter table public.followup_checkins enable row level security;
revoke all on public.followup_cases from anon, authenticated;
revoke all on public.followup_case_checks from anon, authenticated;
revoke all on public.followup_checkins from anon, authenticated;

-- An account being deleted takes no more writes, as every per-user table.
drop trigger if exists refuse_late_writes on public.followup_cases;
create trigger refuse_late_writes
  before insert or update on public.followup_cases
  for each row execute function public.refuse_write_for_inactive_account();
drop trigger if exists refuse_late_writes on public.followup_case_checks;
create trigger refuse_late_writes
  before insert or update on public.followup_case_checks
  for each row execute function public.refuse_write_for_inactive_account();
drop trigger if exists refuse_late_writes on public.followup_checkins;
create trigger refuse_late_writes
  before insert or update on public.followup_checkins
  for each row execute function public.refuse_write_for_inactive_account();

-- A pet deleted softly takes its open case out of every list and every phone.
create or replace function public.close_followup_of_deleted_pet()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.followup_cases
     set status = 'closed', outcome = 'pet_deleted', closed_at = now(), next_slot = null,
         next_due_at = null, updated_at = now()
   where pet_id = new.id and status in ('off', 'active');
  return new;
end;
$$;

revoke all on function public.close_followup_of_deleted_pet() from public, anon, authenticated;

drop trigger if exists pets_close_followup on public.pets;
create trigger pets_close_followup
  after update of deleted_at on public.pets
  for each row when (old.deleted_at is null and new.deleted_at is not null)
  execute function public.close_followup_of_deleted_pet();

/**
 * Switches the follow-up of a check on or off, creating the case on first use.
 *
 * The caller has checked the check is the user's, has a live pet, is young
 * enough and has a schedule; it passes the plan and the first question. Turning
 * on closes the pet's other open case as `superseded`. A closed case is left as
 * it is. Switching off keeps the question the case was waiting for, so
 * switching on again resumes there — with its escalation — rather than
 * starting over from the first question. Returns the case id.
 */
create or replace function public.set_followup_enabled(
  p_user_id uuid,
  p_check_id uuid,
  p_pet_id uuid,
  p_urgency text,
  p_anchor_at timestamptz,
  p_plan text,
  p_next_slot text,
  p_next_due_at timestamptz,
  p_via text,
  p_enabled boolean
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_case public.followup_cases;
begin
  select * into v_case from public.followup_cases where origin_check_id = p_check_id for update;

  if not found then
    insert into public.followup_cases (
      user_id, pet_id, origin_check_id, origin_urgency, current_urgency, anchor_at, plan, offered_via
    ) values (
      p_user_id, p_pet_id, p_check_id, p_urgency, p_urgency, p_anchor_at, p_plan, p_via
    )
    on conflict (origin_check_id) do nothing;
    select * into v_case from public.followup_cases where origin_check_id = p_check_id for update;
    if not found then
      raise exception 'followup case was not created' using errcode = 'P0002';
    end if;
    insert into public.followup_case_checks (case_id, check_id, user_id, kind)
    values (v_case.id, p_check_id, p_user_id, 'origin')
    on conflict (check_id) do nothing;
  end if;

  if v_case.user_id <> p_user_id then
    raise exception 'not the owner' using errcode = 'P0002';
  end if;

  if v_case.status = 'closed' then
    return v_case.id;
  end if;

  if p_enabled and v_case.status = 'off' then
    update public.followup_cases
       set status = 'closed', outcome = 'superseded', closed_at = now(), next_slot = null,
           next_due_at = null, updated_at = now()
     where pet_id = v_case.pet_id and status = 'active' and id <> v_case.id;

    update public.followup_cases
       set status = 'active',
           next_slot = coalesce(v_case.next_slot, p_next_slot),
           next_due_at = coalesce(v_case.next_due_at, p_next_due_at),
           enabled_at = coalesce(enabled_at, now()), updated_at = now()
     where id = v_case.id;
  elsif not p_enabled and v_case.status = 'active' then
    update public.followup_cases
       set status = 'off', hidden_until = null, updated_at = now()
     where id = v_case.id;
  end if;

  return v_case.id;
end;
$$;

revoke all on function public.set_followup_enabled(uuid, uuid, uuid, text, timestamptz, text, text, timestamptz, text, boolean)
  from public, anon, authenticated;

/**
 * Stores one answer and moves the case on, atomically.
 *
 * The verdict was computed by the server from the case as it read it; `p_seen`
 * is that case's `updated_at`. If the case moved since (another phone answered),
 * nothing is written and `stale` comes back, so the server reads again and
 * decides on what is there now. A repeated idempotency key returns the stored
 * answer instead.
 */
create or replace function public.record_followup_checkin(
  p_user_id uuid,
  p_case_id uuid,
  p_seen timestamptz,
  p_key text,
  p_slot text,
  p_vet_visited boolean,
  p_state text,
  p_note text,
  p_decision text,
  p_source text,
  p_hours numeric,
  p_next_slot text,
  p_next_due_at timestamptz,
  p_escalation text,
  p_outcome text,
  p_vet_asks smallint
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_case public.followup_cases;
  v_existing uuid;
  v_id uuid;
begin
  select id into v_existing from public.followup_checkins
   where case_id = p_case_id and idempotency_key = p_key and user_id = p_user_id;
  if found then
    return jsonb_build_object('status', 'repeated', 'checkin_id', v_existing);
  end if;

  select * into v_case from public.followup_cases
   where id = p_case_id and user_id = p_user_id for update;
  if not found then
    return jsonb_build_object('status', 'not_found');
  end if;
  if v_case.status <> 'active' then
    return jsonb_build_object('status', 'closed');
  end if;
  if v_case.updated_at <> p_seen then
    return jsonb_build_object('status', 'stale');
  end if;

  insert into public.followup_checkins (
    case_id, user_id, slot, vet_visited, state, note, decision, urgency_at_answer,
    hours_since_check, source, idempotency_key
  ) values (
    p_case_id, p_user_id, p_slot, p_vet_visited, p_state, nullif(btrim(p_note), ''), p_decision,
    v_case.current_urgency, p_hours, p_source, p_key
  )
  returning id into v_id;

  update public.followup_cases
     set next_slot = p_next_slot,
         next_due_at = p_next_due_at,
         escalation = p_escalation,
         vet_asks = p_vet_asks,
         hidden_until = null,
         status = case when p_outcome is null then 'active' else 'closed' end,
         outcome = p_outcome,
         closed_at = case when p_outcome is null then null else now() end,
         updated_at = now()
   where id = p_case_id;

  return jsonb_build_object('status', 'recorded', 'checkin_id', v_id);
end;
$$;

revoke all on function public.record_followup_checkin(
  uuid, uuid, timestamptz, text, text, boolean, text, text, text, text, numeric, text, timestamptz, text, text, smallint
) from public, anon, authenticated;

/**
 * Joins a finished re-check to its case and restarts the schedule from it
 * (FU-03). A `healthy` re-check closes the case as improved; so does `p_plan`
 * being null. An open case of another pet's is not this case's business: the
 * caller checked the pet.
 */
create or replace function public.link_followup_recheck(
  p_user_id uuid,
  p_case_id uuid,
  p_check_id uuid,
  p_urgency text,
  p_anchor_at timestamptz,
  p_plan text,
  p_next_slot text,
  p_next_due_at timestamptz
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_case public.followup_cases;
begin
  select * into v_case from public.followup_cases
   where id = p_case_id and user_id = p_user_id for update;
  if not found then
    return;
  end if;

  insert into public.followup_case_checks (case_id, check_id, user_id, kind)
  values (p_case_id, p_check_id, p_user_id, 'recheck')
  on conflict (check_id) do nothing;

  if p_plan is null then
    update public.followup_cases
       set current_urgency = p_urgency, anchor_at = p_anchor_at, escalation = 'none', vet_asks = 0,
           status = 'closed', outcome = coalesce(outcome, 'improved'), closed_at = coalesce(closed_at, now()),
           next_slot = null, next_due_at = null, hidden_until = null, updated_at = now()
     where id = p_case_id;
    return;
  end if;

  -- A closed case reopens with the re-check, unless the pet has another open
  -- case by now: then the re-check only joins the timeline.
  if v_case.status <> 'active' and exists (
    select 1 from public.followup_cases where pet_id = v_case.pet_id and status = 'active' and id <> p_case_id
  ) then
    return;
  end if;

  update public.followup_cases
     set current_urgency = p_urgency, anchor_at = p_anchor_at, plan = p_plan, escalation = 'none', vet_asks = 0,
         status = 'active', outcome = null, closed_at = null, saved_to_record_at = null,
         next_slot = p_next_slot, next_due_at = p_next_due_at, hidden_until = null,
         enabled_at = coalesce(enabled_at, now()), updated_at = now()
   where id = p_case_id;
end;
$$;

revoke all on function public.link_followup_recheck(uuid, uuid, uuid, text, timestamptz, text, text, timestamptz)
  from public, anon, authenticated;

/** Closes cases nobody answered for a week after their question (daily cron). */
create or replace function public.expire_followup_cases(p_now timestamptz default now())
returns integer
language sql
security definer
set search_path = public
as $$
  with expired as (
    update public.followup_cases
       set status = 'closed', outcome = 'expired', closed_at = p_now, next_slot = null,
           next_due_at = null, updated_at = p_now
     where status = 'active' and next_due_at < p_now - interval '7 days'
    returning 1
  )
  select count(*)::integer from expired;
$$;

revoke all on function public.expire_followup_cases(timestamptz) from public, anon, authenticated;
grant execute on function public.expire_followup_cases(timestamptz) to service_role;

/**
 * Aggregates for /admin/statistics (FU-04), over cases whose first check falls
 * in the window. Computed here rather than in JS: PostgREST caps a plain
 * select at `max_rows`, and the counts must not stop at a thousand.
 */
create or replace function public.admin_followup_statistics(p_from timestamptz, p_to timestamptz)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with cases as (
    select c.*, s.created_at as checked_at
      from public.followup_cases c
      join public.symptom_checks s on s.id = c.origin_check_id
     where s.created_at >= p_from and s.created_at < p_to
  ),
  first_answer as (
    select distinct on (k.case_id) k.case_id, k.state, k.source, k.vet_visited, k.slot
      from public.followup_checkins k
      join cases c on c.id = k.case_id
     order by k.case_id, k.created_at
  ),
  -- A re-check «raised» the case when it came out more urgent than the first check.
  rechecks as (
    select cc.case_id,
           max(case when array_position(array['healthy', 'home_care', 'monitor', 'urgent', 'emergency'], s.urgency)
                       > array_position(array['healthy', 'home_care', 'monitor', 'urgent', 'emergency'], c.origin_urgency)
                    then 1 else 0 end) as raised
      from public.followup_case_checks cc
      join cases c on c.id = cc.case_id
      join public.symptom_checks s on s.id = cc.check_id
     where cc.kind = 'recheck'
     group by cc.case_id
  ),
  improved_hours as (
    select c.origin_urgency, k.hours_since_check
      from public.followup_checkins k
      join cases c on c.id = k.case_id
     where k.decision = 'close_improved'
  )
  select jsonb_build_object(
    'by_urgency', coalesce((
      select jsonb_agg(row_to_json(t) order by t.urgency)
        from (
          select c.origin_urgency as urgency,
                 count(*) as offered,
                 count(c.enabled_at) as enabled,
                 count(f.case_id) as answered,
                 count(*) filter (where f.state = 'better') as first_better,
                 count(*) filter (where f.state = 'same') as first_same,
                 count(*) filter (where f.state = 'worse') as first_worse,
                 count(*) filter (where c.escalation <> 'none' or exists (
                   select 1 from public.followup_checkins k
                    where k.case_id = c.id and k.decision in ('see_vet', 'see_vet_today', 'clinic_now'))) as escalated,
                 count(*) filter (where f.slot = 'vet' and f.vet_visited) as first_vet_yes,
                 count(*) filter (where f.slot = 'vet') as first_vet_asked,
                 count(*) filter (where c.outcome = 'improved') as outcome_improved,
                 count(*) filter (where c.outcome = 'vet_seen') as outcome_vet_seen,
                 count(*) filter (where c.outcome = 'unresolved') as outcome_unresolved,
                 count(*) filter (where c.outcome = 'dismissed') as outcome_dismissed,
                 count(*) filter (where c.outcome = 'expired') as outcome_expired,
                 count(*) filter (where c.outcome = 'superseded') as outcome_superseded,
                 count(*) filter (where c.status = 'active') as open,
                 count(r.case_id) as rechecked,
                 count(*) filter (where r.raised = 1) as recheck_raised,
                 count(*) filter (where exists (
                   select 1 from public.followup_checkins k where k.case_id = c.id and k.state = 'worse')) as any_worse,
                 count(c.saved_to_record_at) as saved_to_record,
                 (select percentile_cont(0.5) within group (order by h.hours_since_check)
                    from improved_hours h where h.origin_urgency = c.origin_urgency) as median_hours_to_better
            from cases c
            left join first_answer f on f.case_id = c.id
            left join rechecks r on r.case_id = c.id
           group by c.origin_urgency
        ) t
    ), '[]'::jsonb),
    'first_source', coalesce((
      select jsonb_object_agg(source, n) from (select source, count(*) as n from first_answer group by source) s
    ), '{}'::jsonb)
  );
$$;

revoke all on function public.admin_followup_statistics(timestamptz, timestamptz) from public, anon, authenticated;
grant execute on function public.admin_followup_statistics(timestamptz, timestamptz) to service_role;

grant execute on function public.set_followup_enabled(uuid, uuid, uuid, text, timestamptz, text, text, timestamptz, text, boolean) to service_role;
grant execute on function public.record_followup_checkin(
  uuid, uuid, timestamptz, text, text, boolean, text, text, text, text, numeric, text, timestamptz, text, text, smallint
) to service_role;
grant execute on function public.link_followup_recheck(uuid, uuid, uuid, text, timestamptz, text, text, timestamptz) to service_role;
