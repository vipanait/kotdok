-- The admin dashboard: the users tab.
--
-- Rules shared with the other admin functions are in
-- 20261105120000_admin_overview_stats.sql. Definitions specific to this tab:
-- * activation: of the people who registered in the window and have had their
--   seven days already, the share who made a check within those seven days;
-- * returns: of the people with a check in the window, the share with at least
--   two checks made before the window ended;
-- * sign-in method: the provider of a person's earliest identity, which is
--   how they signed up;
-- * cohorts: the last eight Moscow weeks (Monday to Sunday) of registration,
--   whatever the period, and for weeks 0..4 after it the number of the cohort
--   who did anything. A week that has not ended yet is null.

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
  v_today constant date := public.admin_msk_date(p_now);
  v_first_day constant date := public.admin_msk_date(p_now) - (p_days - 1);
  v_this_week constant date := date_trunc('week', public.admin_msk_date(p_now))::date;
  v_first_cohort constant date := date_trunc('week', public.admin_msk_date(p_now))::date - 49;
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
  checks as (
    select s.user_id, s.created_at at time zone 'UTC' as at
    from public.symptom_checks s join people p on p.id = s.user_id
  ),
  -- Activity from the start of the earliest cohort or the previous window,
  -- whichever is earlier, as (person, Moscow date).
  activity as (
    select distinct a.user_id, public.admin_msk_date(a.at) as date, a.at
    from public.admin_activity(
      least(v_prev_from, (v_first_cohort::timestamp at time zone 'Europe/Moscow'), (v_first_day::timestamp at time zone 'Europe/Moscow')),
      p_now
    ) a
  ),
  days as (
    select d::date as date from generate_series(v_first_day, v_today, interval '1 day') d
  ),
  daily_registrations as (
    select public.admin_msk_date(at) as date, count(*) as n from people group by 1
  ),
  daily_active as (
    select date, count(distinct user_id) as n from activity group by 1
  ),
  activation as (
    select
      p.at,
      exists (select 1 from checks c where c.user_id = p.id and c.at >= p.at and c.at < p.at + v_week) as activated
    from people p
    where p.at >= v_prev_from and p.at + v_week <= p_now
  ),
  checkers as (
    select
      w.name,
      c.user_id,
      (select count(*) from checks c2 where c2.user_id = c.user_id and c2.at < w.until) >= 2 as returned
    from (values ('cur', v_cur_from, p_now), ('prev', v_prev_from, v_cur_from)) as w(name, since, until)
    join checks c on c.at >= w.since and c.at < w.until
    group by w.name, w.until, c.user_id
  ),
  first_identity as (
    select distinct on (i.user_id) i.provider
    from auth.identities i join people p on p.id = i.user_id
    order by i.user_id, i.created_at, i.id
  ),
  cohort_weeks as (
    select w::date as week_start from generate_series(v_first_cohort, v_this_week, interval '7 days') w
  ),
  cohorts as (
    select
      cw.week_start,
      (select count(*) from people p
        where public.admin_msk_date(p.at) >= cw.week_start and public.admin_msk_date(p.at) < cw.week_start + 7) as size,
      (select jsonb_agg(
        case when cw.week_start + 7 * (k + 1) > v_today then null else (
          select count(distinct a.user_id)
          from activity a join people p on p.id = a.user_id
          where public.admin_msk_date(p.at) >= cw.week_start and public.admin_msk_date(p.at) < cw.week_start + 7
            and a.date >= cw.week_start + 7 * k and a.date < cw.week_start + 7 * (k + 1)
        ) end
        order by k)
       from generate_series(0, 4) k) as active
    from cohort_weeks cw
  )
  select jsonb_build_object(
    'accounts', jsonb_build_object(
      'total', (select count(*) from people),
      'added', (select count(*) from people where at >= v_cur_from)
    ),
    'dau_avg', jsonb_build_object(
      'cur', (select count(*) from (select distinct user_id, date from activity where at >= v_cur_from and at < p_now) x)::numeric / p_days,
      'prev', case when coalesce(v_since_checks <= v_prev_from, false) then
        (select count(*) from (select distinct user_id, date from activity where at >= v_prev_from and at < v_cur_from) x)::numeric / p_days
      end
    ),
    'active_7d', public.admin_metric(
      (select count(distinct user_id) from activity where at >= p_now - v_week),
      (select count(distinct user_id) from activity where at >= p_now - 2 * v_week and at < p_now - v_week),
      coalesce(v_since_checks <= p_now - 2 * v_week, false)),
    'activation', public.admin_ratio(
      (select count(*) filter (where activated) from activation where at >= v_cur_from),
      (select count(*) from activation where at >= v_cur_from),
      (select count(*) filter (where activated) from activation where at < v_cur_from),
      (select count(*) from activation where at < v_cur_from),
      coalesce(v_since_profiles <= v_prev_from, false)),
    'returning', public.admin_ratio(
      (select count(*) filter (where returned) from checkers where name = 'cur'),
      (select count(*) from checkers where name = 'cur'),
      (select count(*) filter (where returned) from checkers where name = 'prev'),
      (select count(*) from checkers where name = 'prev'),
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
