-- The admin dashboard: the feedback tab and the comment feed.
--
-- Rules shared with the other admin functions are in
-- 20261105120000_admin_overview_stats.sql. A rating can be changed after the
-- visit to the vet, so it is dated by `coalesce(updated_at, created_at)`: the
-- opinion as it stands now, at the time it was last given. Ratings stored
-- before September were not tied to a check; they count everywhere except
-- the split by urgency.

create or replace function public.admin_feedback_stats(p_now timestamptz, p_days integer)
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
  v_today constant date := public.admin_msk_date(p_now);
  v_first_day constant date := public.admin_msk_date(p_now) - (p_days - 1);
  v_result jsonb;
begin
  with
  active_users as (
    select id from public.profiles where status = 'active'
  ),
  ratings as (
    select
      coalesce(f.updated_at, f.created_at) as at,
      f.rating,
      nullif(btrim(coalesce(f.comment, '')), '') is not null as commented,
      s.urgency
    from public.user_feedback f
    join active_users u on u.id = f.user_id
    left join public.symptom_checks s on s.id = f.symptom_check_id
  ),
  cur as (select * from ratings where at >= v_cur_from and at < p_now),
  prev as (select * from ratings where at >= v_prev_from and at < v_cur_from),
  checks as (
    select
      s.created_at at time zone 'UTC' as at,
      exists (select 1 from public.user_feedback f where f.symptom_check_id = s.id) as rated
    from public.symptom_checks s join active_users u on u.id = s.user_id
  ),
  since as (
    select
      (select min(created_at) from public.user_feedback) as feedback,
      -- A rating could be tied to a check only from 23 September: before that
      -- no check could be rated, and a share of rated checks would show growth.
      (select min(created_at) from public.user_feedback where symptom_check_id is not null) as tied_feedback,
      (select min(created_at) at time zone 'UTC' from public.symptom_checks) as checks
  ),
  days as (
    select d::date as date from generate_series(v_first_day, v_today, interval '1 day') d
  ),
  daily as (
    select
      public.admin_msk_date(at) as date,
      count(*) filter (where rating = 'liked') as liked,
      count(*) filter (where rating = 'disliked') as disliked
    from ratings
    where public.admin_msk_date(at) between v_first_day and v_today
    group by 1
  ),
  urgencies as (
    select u from unnest(array['emergency', 'urgent', 'monitor', 'home_care', 'healthy']) u
  )
  select jsonb_build_object(
    'ratings', public.admin_metric(
      (select count(*) from cur), (select count(*) from prev), coalesce(since.feedback <= v_prev_from, false)),
    'liked', public.admin_ratio(
      (select count(*) filter (where rating = 'liked') from cur), (select count(*) from cur),
      (select count(*) filter (where rating = 'liked') from prev), (select count(*) from prev),
      coalesce(since.feedback <= v_prev_from, false)),
    'rated_checks', public.admin_ratio(
      (select count(*) filter (where rated) from checks where at >= v_cur_from and at < p_now),
      (select count(*) from checks where at >= v_cur_from and at < p_now),
      (select count(*) filter (where rated) from checks where at >= v_prev_from and at < v_cur_from),
      (select count(*) from checks where at >= v_prev_from and at < v_cur_from),
      coalesce(since.checks <= v_prev_from and since.tied_feedback <= v_prev_from, false)),
    'with_comment', public.admin_metric(
      (select count(*) from cur where commented), (select count(*) from prev where commented),
      coalesce(since.feedback <= v_prev_from, false)),
    'daily', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'date', to_char(days.date, 'YYYY-MM-DD'),
        'liked', coalesce(d.liked, 0),
        'disliked', coalesce(d.disliked, 0)
      ) order by days.date), '[]'::jsonb)
      from days left join daily d on d.date = days.date
    ),
    'by_urgency', (
      select jsonb_object_agg(urgencies.u, jsonb_build_object(
        'liked', (select count(*) from cur where cur.urgency = urgencies.u and rating = 'liked'),
        'rated', (select count(*) from cur where cur.urgency = urgencies.u)
      ))
      from urgencies
    )
  )
  into v_result
  from since;

  return v_result;
end;
$$;

-- Non-empty comments of the window, newest first, each with its check when
-- the check still exists. Filters: 'all', 'disliked', 'liked'; anything else
-- reads as 'all'. The limit is clamped to 1..500.
create or replace function public.admin_feedback_feed(p_now timestamptz, p_days integer, p_filter text, p_limit integer)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with
  settings as (
    select
      p_now - p_days * interval '24 hours' as since,
      least(greatest(coalesce(p_limit, 50), 1), 500) as size,
      case when p_filter in ('disliked', 'liked') then p_filter else 'all' end as filter
  ),
  picked as (
    select
      f.id,
      coalesce(f.updated_at, f.created_at) as at,
      f.rating,
      btrim(f.comment) as comment,
      f.symptom_check_id
    from public.user_feedback f
    join public.profiles p on p.id = f.user_id and p.status = 'active'
    cross join settings
    where nullif(btrim(coalesce(f.comment, '')), '') is not null
      and coalesce(f.updated_at, f.created_at) >= settings.since
      and coalesce(f.updated_at, f.created_at) < p_now
      and (settings.filter = 'all' or f.rating = settings.filter)
    order by coalesce(f.updated_at, f.created_at) desc, f.id desc
    limit (select size + 1 from settings)
  ),
  numbered as (
    select picked.*, row_number() over (order by at desc, id desc) as n from picked
  )
  select jsonb_build_object(
    'rows', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', numbered.id,
        'at', numbered.at,
        'rating', numbered.rating,
        'comment', numbered.comment,
        'check', (
          select public.admin_check_row(s)
          from public.symptom_checks s
          where s.id = numbered.symptom_check_id and s.deleted_at is null
        )
      ) order by n)
      from numbered where n <= (select size from settings)
    ), '[]'::jsonb),
    'has_more', (select count(*) from numbered) > (select size from settings)
  )
$$;

revoke all on function public.admin_feedback_stats(timestamptz, integer) from public, anon, authenticated;
revoke all on function public.admin_feedback_feed(timestamptz, integer, text, integer) from public, anon, authenticated;

grant execute on function public.admin_feedback_stats(timestamptz, integer) to service_role;
grant execute on function public.admin_feedback_feed(timestamptz, integer, text, integer) to service_role;
