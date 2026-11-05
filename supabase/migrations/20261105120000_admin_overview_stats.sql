-- The admin dashboard, counted in SQL: helpers and the overview tab.
--
-- The statistics page used to select `profiles` and `symptom_checks` row by
-- row and count them in Node. PostgREST returns at most `max_rows` (1000)
-- rows, so past a thousand checks every total and chart was quietly short.
-- Counting happens here instead, one call per tab, and the page receives only
-- the numbers.
--
-- Rules shared by every `admin_*` function (design: 2026-11-05-admin-dashboard):
-- * The window is `[p_now - p_days*24h, p_now)`, the previous one the same
--   length right before it. Daily series are Moscow calendar dates.
-- * Zone-less columns (`symptom_checks.created_at`, `profiles.created_at`)
--   hold UTC and are read `at time zone 'UTC'`.
-- * Rows of accounts whose deletion has started (`profiles.status <> 'active'`)
--   are not counted. Soft-deleted checks are: the check happened.
-- * `prev` is null when the table a number comes from has no row before the
--   previous window began: a young source would otherwise show as growth.
-- * Service role only. Nothing here is reachable by `anon` or `authenticated`.

-- A moment as a Moscow calendar date.
create or replace function public.admin_msk_date(p_at timestamptz)
returns date
language sql
immutable
set search_path = public
as $$
  select (p_at at time zone 'Europe/Moscow')::date
$$;

-- {"cur", "prev"}: `prev` withheld when its source did not exist yet.
create or replace function public.admin_metric(p_cur numeric, p_prev numeric, p_prev_known boolean)
returns jsonb
language sql
immutable
set search_path = public
as $$
  select jsonb_build_object('cur', p_cur, 'prev', case when p_prev_known then p_prev end)
$$;

-- {"cur": {"num", "den"}, "prev": {"num", "den"} | null}.
create or replace function public.admin_ratio(
  p_cur_num numeric, p_cur_den numeric, p_prev_num numeric, p_prev_den numeric, p_prev_known boolean
)
returns jsonb
language sql
immutable
set search_path = public
as $$
  select jsonb_build_object(
    'cur', jsonb_build_object('num', p_cur_num, 'den', p_cur_den),
    'prev', case when p_prev_known then jsonb_build_object('num', p_prev_num, 'den', p_prev_den) end
  )
$$;

-- Who did something, and when: any record a person makes counts as activity.
-- Sign-ins are not logged anywhere, so opening the app alone is invisible.
create or replace function public.admin_activity(p_from timestamptz, p_to timestamptz)
returns table (user_id uuid, at timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  select a.user_id, a.at
  from (
    select s.user_id, s.created_at at time zone 'UTC' as at from public.symptom_checks s
    union all select j.user_id, j.created_at from public.check_jobs j
    union all select w.user_id, w.created_at from public.pet_weights w
    union all select e.user_id, e.created_at from public.pet_health_events e
    union all select m.user_id, m.created_at from public.pet_medications m
    union all select d.user_id, d.created_at from public.medication_doses d
    union all select c.user_id, c.created_at from public.followup_checkins c
    union all select f.user_id, f.created_at from public.user_feedback f
  ) a
  join public.profiles p on p.id = a.user_id and p.status = 'active'
  where a.at >= p_from and a.at < p_to
$$;

create or replace function public.admin_overview_stats(p_now timestamptz, p_days integer)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_len constant interval := p_days * interval '24 hours';
  v_cur_from constant timestamptz := p_now - v_len;
  v_prev_from constant timestamptz := p_now - 2 * v_len;
  v_week constant interval := interval '7 days';
  v_today constant date := public.admin_msk_date(p_now);
  v_first_day constant date := public.admin_msk_date(p_now) - (p_days - 1);
  v_result jsonb;
begin
  with
  active_profiles as (
    select id, created_at at time zone 'UTC' as at from public.profiles where status = 'active'
  ),
  checks as (
    select s.created_at at time zone 'UTC' as at
    from public.symptom_checks s join active_profiles p on p.id = s.user_id
  ),
  ratings as (
    select coalesce(f.updated_at, f.created_at) as at, f.rating
    from public.user_feedback f join active_profiles p on p.id = f.user_id
  ),
  jobs as (
    select j.created_at as at, j.status
    from public.check_jobs j join active_profiles p on p.id = j.user_id
  ),
  extras as (
    select r.created_at as at
    from public.extra_check_requests r join active_profiles p on p.id = r.user_id
  ),
  since as (
    select
      (select min(created_at) at time zone 'UTC' from public.profiles) as profiles,
      (select min(created_at) at time zone 'UTC' from public.symptom_checks) as checks,
      (select min(created_at) from public.user_feedback) as feedback,
      (select min(created_at) from public.check_jobs) as jobs,
      (select min(created_at) from public.extra_check_requests) as extras
  ),
  days as (
    select d::date as date from generate_series(v_first_day, v_today, interval '1 day') d
  ),
  daily_registrations as (
    select public.admin_msk_date(at) as date, count(*) as n
    from active_profiles where public.admin_msk_date(at) between v_first_day and v_today group by 1
  ),
  daily_checks as (
    select public.admin_msk_date(at) as date, count(*) as n
    from checks where public.admin_msk_date(at) between v_first_day and v_today group by 1
  )
  select jsonb_build_object(
    'new_users', public.admin_metric(
      (select count(*) from active_profiles where at >= v_cur_from and at < p_now),
      (select count(*) from active_profiles where at >= v_prev_from and at < v_cur_from),
      coalesce(since.profiles <= v_prev_from, false)),
    'active_7d', public.admin_metric(
      (select count(distinct user_id) from public.admin_activity(p_now - v_week, p_now)),
      (select count(distinct user_id) from public.admin_activity(p_now - 2 * v_week, p_now - v_week)),
      coalesce(since.checks <= p_now - 2 * v_week, false)),
    'checks', public.admin_metric(
      (select count(*) from checks where at >= v_cur_from and at < p_now),
      (select count(*) from checks where at >= v_prev_from and at < v_cur_from),
      coalesce(since.checks <= v_prev_from, false)),
    'helpful', public.admin_ratio(
      (select count(*) filter (where rating = 'liked') from ratings where at >= v_cur_from and at < p_now),
      (select count(*) from ratings where at >= v_cur_from and at < p_now),
      (select count(*) filter (where rating = 'liked') from ratings where at >= v_prev_from and at < v_cur_from),
      (select count(*) from ratings where at >= v_prev_from and at < v_cur_from),
      coalesce(since.feedback <= v_prev_from, false)),
    'failures', public.admin_ratio(
      (select count(*) filter (where status = 'failed') from jobs where at >= v_cur_from and at < p_now),
      (select count(*) from jobs where at >= v_cur_from and at < p_now),
      (select count(*) filter (where status = 'failed') from jobs where at >= v_prev_from and at < v_cur_from),
      (select count(*) from jobs where at >= v_prev_from and at < v_cur_from),
      coalesce(since.jobs <= v_prev_from, false)),
    'extra_requests', public.admin_metric(
      (select count(*) from extras where at >= v_cur_from and at < p_now),
      (select count(*) from extras where at >= v_prev_from and at < v_cur_from),
      coalesce(since.extras <= v_prev_from, false)),
    'daily', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'date', to_char(days.date, 'YYYY-MM-DD'),
        'registrations', coalesce(r.n, 0),
        'checks', coalesce(c.n, 0)
      ) order by days.date), '[]'::jsonb)
      from days
      left join daily_registrations r on r.date = days.date
      left join daily_checks c on c.date = days.date
    )
  )
  into v_result
  from since;

  return v_result;
end;
$$;

revoke all on function public.admin_msk_date(timestamptz) from public, anon, authenticated;
revoke all on function public.admin_metric(numeric, numeric, boolean) from public, anon, authenticated;
revoke all on function public.admin_ratio(numeric, numeric, numeric, numeric, boolean) from public, anon, authenticated;
revoke all on function public.admin_activity(timestamptz, timestamptz) from public, anon, authenticated;
revoke all on function public.admin_overview_stats(timestamptz, integer) from public, anon, authenticated;

grant execute on function public.admin_msk_date(timestamptz) to service_role;
grant execute on function public.admin_metric(numeric, numeric, boolean) to service_role;
grant execute on function public.admin_ratio(numeric, numeric, numeric, numeric, boolean) to service_role;
grant execute on function public.admin_activity(timestamptz, timestamptz) to service_role;
grant execute on function public.admin_overview_stats(timestamptz, integer) to service_role;
