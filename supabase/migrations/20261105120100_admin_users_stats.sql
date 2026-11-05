-- The admin dashboard: the users tab.
--
-- Rules shared with the other admin functions are in
-- 20261105120000_admin_overview_stats.sql. Definitions specific to this tab:
-- * activation: of the people who registered in the window that ended seven
--   days ago — `[now - N - 7d, now - 7d)`, so every one of them has had their
--   seven days and a seven-day period is not always empty — the share who
--   made a check within seven days of registering;
-- * returns: of the people with a check in the window, the share with at least
--   two checks made before the window ended;
-- * sign-in method: the provider of a person's earliest identity, which is
--   how they signed up;
-- * cohorts: the last eight Moscow weeks (Monday to Sunday) of registration,
--   whatever the period, and for weeks 0..4 after it the number of the cohort
--   who did anything. A week that has not ended yet is null.
--
-- Everything is counted in one pass per source, grouped by person: a
-- correlated subquery per person over every check grows with people × checks
-- and took tens of seconds on 3000 people and 30 000 checks.

create or replace function public.admin_users_stats(p_now timestamptz, p_days integer)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, auth
as $$
declare
  v_len constant interval := p_days * interval '24 hours';
  v_cur_from constant timestamptz := p_now - v_len;
  v_prev_from constant timestamptz := p_now - 2 * v_len;
  v_week constant interval := interval '7 days';
  v_act_until constant timestamptz := p_now - interval '7 days';
  v_act_cur_from constant timestamptz := p_now - interval '7 days' - v_len;
  v_act_prev_from constant timestamptz := p_now - interval '7 days' - 2 * v_len;
  v_today constant date := (p_now at time zone 'Europe/Moscow')::date;
  v_first_day constant date := (p_now at time zone 'Europe/Moscow')::date - (p_days - 1);
  v_this_week constant date := date_trunc('week', (p_now at time zone 'Europe/Moscow'))::date;
  v_first_cohort constant date := date_trunc('week', (p_now at time zone 'Europe/Moscow'))::date - 49;
  v_since_profiles timestamptz;
  v_since_checks timestamptz;
  v_result jsonb;
begin
  select min(created_at) at time zone 'UTC' into v_since_profiles from public.profiles;
  select min(created_at) at time zone 'UTC' into v_since_checks from public.symptom_checks;

  with
  people as (
    select id, locale, created_at at time zone 'UTC' as at
    from public.profiles
    where status = 'active' and created_at at time zone 'UTC' < p_now
  ),
  -- Per person: the first check since registering, and enough counts to
  -- answer "two checks before the window ended" for both windows.
  per_person as (
    select
      s.user_id,
      min(s.created_at at time zone 'UTC') filter (where s.created_at at time zone 'UTC' >= p.at) as first_at,
      count(*) as before_now,
      count(*) filter (where s.created_at at time zone 'UTC' < v_cur_from) as before_cur,
      bool_or(s.created_at at time zone 'UTC' >= v_cur_from) as in_cur,
      bool_or(s.created_at at time zone 'UTC' >= v_prev_from and s.created_at at time zone 'UTC' < v_cur_from) as in_prev
    from public.symptom_checks s
    join people p on p.id = s.user_id
    where s.created_at at time zone 'UTC' < p_now
    group by s.user_id, p.at
  ),
  -- Activity from the start of the earliest cohort or the previous window,
  -- whichever is earlier, as (person, Moscow date).
  activity as (
    select distinct a.user_id, (a.at at time zone 'Europe/Moscow')::date as date, a.at
    from public.admin_activity(
      least(v_prev_from, (v_first_cohort::timestamp at time zone 'Europe/Moscow'), (v_first_day::timestamp at time zone 'Europe/Moscow')),
      p_now
    ) a
  ),
  days as (
    select d::date as date from generate_series(v_first_day, v_today, interval '1 day') d
  ),
  daily_registrations as (
    select (at at time zone 'Europe/Moscow')::date as date, count(*) as n from people group by 1
  ),
  daily_active as (
    select date, count(distinct user_id) as n from activity group by 1
  ),
  activation as (
    select
      p.at,
      coalesce(pp.first_at >= p.at and pp.first_at < p.at + v_week, false) as activated
    from people p
    left join per_person pp on pp.user_id = p.id
    where p.at >= v_act_prev_from and p.at < v_act_until
  ),
  first_identity as (
    select distinct on (i.user_id) i.provider
    from auth.identities i join people p on p.id = i.user_id
    order by i.user_id, i.created_at, i.id
  ),
  cohort_weeks as (
    select w::date as week_start from generate_series(v_first_cohort, v_this_week, interval '7 days') w
  ),
  members as (
    select id, date_trunc('week', (at at time zone 'Europe/Moscow'))::date as week_start
    from people
    where (at at time zone 'Europe/Moscow')::date >= v_first_cohort
  ),
  member_sizes as (
    select week_start, count(*) as n from members group by week_start
  ),
  member_weeks as (
    select m.week_start, (a.date - m.week_start) / 7 as k, count(distinct m.id) as n
    from members m
    join activity a on a.user_id = m.id
    where a.date >= m.week_start and a.date < m.week_start + 35
    group by m.week_start, (a.date - m.week_start) / 7
  ),
  cohorts as (
    select
      cw.week_start,
      coalesce(ms.n, 0) as size,
      (select jsonb_agg(
         case when cw.week_start + 7 * (wk.n + 1) > v_today then null else coalesce(mw.n, 0) end
         order by wk.n)
       from generate_series(0, 4) as wk(n)
       left join member_weeks mw on mw.week_start = cw.week_start and mw.k = wk.n) as active
    from cohort_weeks cw
    left join member_sizes ms on ms.week_start = cw.week_start
  )
  select jsonb_build_object(
    'accounts', jsonb_build_object(
      'total', (select count(*) from people),
      'added', (select count(*) from people where at >= v_cur_from)
    ),
    'dau_avg', jsonb_build_object(
      'cur', (select count(distinct (user_id, date)) from activity where at >= v_cur_from and at < p_now)::numeric / p_days,
      'prev', case when coalesce(v_since_checks <= v_prev_from, false) then
        (select count(distinct (user_id, date)) from activity where at >= v_prev_from and at < v_cur_from)::numeric / p_days
      end
    ),
    'active_7d', public.admin_metric(
      (select count(distinct user_id) from activity where at >= p_now - v_week),
      (select count(distinct user_id) from activity where at >= p_now - 2 * v_week and at < p_now - v_week),
      coalesce(v_since_checks <= p_now - 2 * v_week, false)),
    'activation', public.admin_ratio(
      (select count(*) filter (where activated) from activation where at >= v_act_cur_from),
      (select count(*) from activation where at >= v_act_cur_from),
      (select count(*) filter (where activated) from activation where at < v_act_cur_from),
      (select count(*) from activation where at < v_act_cur_from),
      coalesce(v_since_profiles <= v_act_prev_from, false)),
    'returning', public.admin_ratio(
      (select count(*) filter (where before_now >= 2) from per_person where in_cur),
      (select count(*) from per_person where in_cur),
      (select count(*) filter (where before_cur >= 2) from per_person where in_prev),
      (select count(*) from per_person where in_prev),
      coalesce(v_since_checks <= v_prev_from, false)),
    'daily', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'date', to_char(days.date, 'YYYY-MM-DD'),
        'registrations', coalesce(r.n, 0),
        'active', coalesce(a.n, 0)
      ) order by days.date), '[]'::jsonb)
      from days
      left join daily_registrations r on r.date = days.date
      left join daily_active a on a.date = days.date
    ),
    'providers', (
      select coalesce(jsonb_object_agg(provider, n), '{}'::jsonb)
      from (select provider, count(*) as n from first_identity group by provider) x
    ),
    'locales', (
      select coalesce(jsonb_object_agg(locale, n), '{}'::jsonb)
      from (select locale, count(*) as n from people group by locale) x
    ),
    'cohorts', (
      select jsonb_agg(jsonb_build_object(
        'week_start', to_char(week_start, 'YYYY-MM-DD'),
        'size', size,
        'active', active
      ) order by week_start)
      from cohorts
    )
  )
  into v_result;

  return v_result;
end;
$$;

revoke all on function public.admin_users_stats(timestamptz, integer) from public, anon, authenticated;
grant execute on function public.admin_users_stats(timestamptz, integer) to service_role;
