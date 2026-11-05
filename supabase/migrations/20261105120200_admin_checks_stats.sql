-- The admin dashboard: the checks tab and the check feed.
--
-- Rules shared with the other admin functions are in
-- 20261105120000_admin_overview_stats.sql.
--
-- The feed is for reading what people actually ask. A row carries the pet's
-- species and age and the check itself, and nothing that names the owner or
-- the pet: no user id, no e-mail, no pet name.

-- One check as a feed row, with the opinion given on it.
create or replace function public.admin_check_row(p_check public.symptom_checks)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'id', p_check.id,
    'created_at', p_check.created_at at time zone 'UTC',
    'species', case when pet.species in ('cat', 'dog') then pet.species end,
    'pet_age_years', case
      when pet.birth_date is not null then
        extract(year from age(public.admin_msk_date(p_check.created_at at time zone 'UTC'), pet.birth_date))::integer
      else pet.age_years
    end,
    'symptoms', p_check.symptoms_input,
    'urgency', p_check.urgency,
    'urgency_reason', p_check.urgency_reason,
    'possible_causes', coalesce(to_jsonb(p_check.possible_causes), '[]'::jsonb),
    'home_care_steps', coalesce(to_jsonb(p_check.home_care_steps), '[]'::jsonb),
    'vet_questions', coalesce(to_jsonb(p_check.vet_questions), '[]'::jsonb),
    'answers', jsonb_build_object(
      'appetite', p_check.full_response -> 'appetite',
      'activity', p_check.full_response -> 'activity',
      'duration', p_check.full_response -> 'duration',
      'stool', p_check.full_response -> 'stool',
      'pain_signs', case
        when jsonb_typeof(p_check.full_response -> 'pain_signs') = 'array' then p_check.full_response -> 'pain_signs'
        else '[]'::jsonb
      end
    ),
    'rating', f.rating,
    'comment', f.comment
  )
  from (select 1) as one
  left join public.pets pet on pet.id = p_check.pet_id
  left join public.user_feedback f on f.symptom_check_id = p_check.id
$$;

create or replace function public.admin_checks_stats(p_now timestamptz, p_days integer)
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
  checks as (
    select s.user_id, s.created_at at time zone 'UTC' as at, s.urgency, s.full_response as fr, pet.species
    from public.symptom_checks s
    join active_users u on u.id = s.user_id
    left join public.pets pet on pet.id = s.pet_id
  ),
  cur as (select * from checks where at >= v_cur_from and at < p_now),
  prev as (select * from checks where at >= v_prev_from and at < v_cur_from),
  jobs as (
    select j.created_at as at, j.status, j.error_code
    from public.check_jobs j join active_users u on u.id = j.user_id
  ),
  extras as (
    select r.created_at as at, r.status
    from public.extra_check_requests r join active_users u on u.id = r.user_id
  ),
  since as (
    select
      (select min(created_at) at time zone 'UTC' from public.symptom_checks) as checks,
      (select min(created_at) from public.check_jobs) as jobs,
      (select min(created_at) from public.extra_check_requests) as extras
  ),
  days as (
    select d::date as date from generate_series(v_first_day, v_today, interval '1 day') d
  ),
  daily as (
    select
      public.admin_msk_date(at) as date,
      count(*) filter (where urgency = 'emergency') as emergency,
      count(*) filter (where urgency = 'urgent') as urgent,
      count(*) filter (where urgency = 'monitor') as monitor,
      count(*) filter (where urgency = 'home_care') as home_care,
      count(*) filter (where urgency = 'healthy') as healthy
    from checks
    where public.admin_msk_date(at) between v_first_day and v_today
    group by 1
  ),
  pain as (
    select fr -> 'pain_signs' as signs
    from cur
    where jsonb_typeof(fr -> 'pain_signs') = 'array'
  )
  select jsonb_build_object(
    'checks', public.admin_metric(
      (select count(*) from cur), (select count(*) from prev), coalesce(since.checks <= v_prev_from, false)),
    'species', jsonb_build_object(
      'cat', (select count(*) from cur where species = 'cat'),
      'dog', (select count(*) from cur where species = 'dog'),
      'unknown', (select count(*) from cur where species is null or species not in ('cat', 'dog'))
    ),
    'per_user', public.admin_ratio(
      (select count(*) from cur), (select count(distinct user_id) from cur),
      (select count(*) from prev), (select count(distinct user_id) from prev),
      coalesce(since.checks <= v_prev_from, false)),
    'failures', public.admin_ratio(
      (select count(*) filter (where status = 'failed') from jobs where at >= v_cur_from and at < p_now),
      (select count(*) from jobs where at >= v_cur_from and at < p_now),
      (select count(*) filter (where status = 'failed') from jobs where at >= v_prev_from and at < v_cur_from),
      (select count(*) from jobs where at >= v_prev_from and at < v_cur_from),
      coalesce(since.jobs <= v_prev_from, false)),
    'failure_codes', (
      select coalesce(jsonb_object_agg(code, n), '{}'::jsonb)
      from (
        select coalesce(error_code, 'unknown') as code, count(*) as n
        from jobs where status = 'failed' and at >= v_cur_from and at < p_now
        group by 1
      ) x
    ),
    'extra_requests', public.admin_metric(
      (select count(*) from extras where at >= v_cur_from and at < p_now),
      (select count(*) from extras where at >= v_prev_from and at < v_cur_from),
      coalesce(since.extras <= v_prev_from, false)),
    'extra_approved', (select count(*) from extras where status = 'approved' and at >= v_cur_from and at < p_now),
    'daily', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'date', to_char(days.date, 'YYYY-MM-DD'),
        'emergency', coalesce(d.emergency, 0),
        'urgent', coalesce(d.urgent, 0),
        'monitor', coalesce(d.monitor, 0),
        'home_care', coalesce(d.home_care, 0),
        'healthy', coalesce(d.healthy, 0)
      ) order by days.date), '[]'::jsonb)
      from days left join daily d on d.date = days.date
    ),
    'answers', jsonb_build_object(
      'total', (select count(*) from cur),
      'appetite', (
        select jsonb_build_object(
          'normal', count(*) filter (where fr ->> 'appetite' = 'normal'),
          'reduced', count(*) filter (where fr ->> 'appetite' = 'reduced'),
          'none', count(*) filter (where fr ->> 'appetite' = 'none'),
          'unanswered', count(*) filter (where coalesce(fr ->> 'appetite', '') not in ('normal', 'reduced', 'none')))
        from cur),
      'activity', (
        select jsonb_build_object(
          'normal', count(*) filter (where fr ->> 'activity' = 'normal'),
          'low', count(*) filter (where fr ->> 'activity' = 'low'),
          'lethargic', count(*) filter (where fr ->> 'activity' = 'lethargic'),
          'unanswered', count(*) filter (where coalesce(fr ->> 'activity', '') not in ('normal', 'low', 'lethargic')))
        from cur),
      'duration', (
        select jsonb_build_object(
          'today', count(*) filter (where fr ->> 'duration' = 'today'),
          '2-3days', count(*) filter (where fr ->> 'duration' = '2-3days'),
          '4-7days', count(*) filter (where fr ->> 'duration' = '4-7days'),
          'week+', count(*) filter (where fr ->> 'duration' = 'week+'),
          'unanswered', count(*) filter (where coalesce(fr ->> 'duration', '') not in ('today', '2-3days', '4-7days', 'week+')))
        from cur),
      'stool', (
        select jsonb_build_object(
          'normal', count(*) filter (where fr ->> 'stool' = 'normal'),
          'loose', count(*) filter (where fr ->> 'stool' = 'loose'),
          'absent', count(*) filter (where fr ->> 'stool' = 'absent'),
          'bloody', count(*) filter (where fr ->> 'stool' = 'bloody'),
          'unanswered', count(*) filter (where coalesce(fr ->> 'stool', '') not in ('normal', 'loose', 'absent', 'bloody')))
        from cur),
      'pain', (
        select jsonb_build_object(
          'tense', count(*) filter (where signs ? 'tense'),
          'hunched', count(*) filter (where signs ? 'hunched'),
          'grimace', count(*) filter (where signs ? 'grimace'),
          'touch_sensitive', count(*) filter (where signs ? 'touch_sensitive'),
          'hiding', count(*) filter (where signs ? 'hiding'),
          'vocalizing', count(*) filter (where signs ? 'vocalizing'),
          'any', count(*) filter (where jsonb_array_length(signs) > 0))
        from pain)
    )
  )
  into v_result
  from since;

  return v_result;
end;
$$;

-- The latest checks of the window, newest first. Deleted checks and accounts
-- being deleted are left out. Filters: 'all', 'urgent' (emergency or urgent),
-- 'disliked'; anything else reads as 'all'. The limit is clamped to 1..500.
create or replace function public.admin_check_feed(p_now timestamptz, p_days integer, p_filter text, p_limit integer)
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
      case when p_filter in ('urgent', 'disliked') then p_filter else 'all' end as filter
  ),
  picked as (
    select s
    from public.symptom_checks s
    join public.profiles p on p.id = s.user_id and p.status = 'active'
    cross join settings
    where s.deleted_at is null
      and s.created_at at time zone 'UTC' >= settings.since
      and s.created_at at time zone 'UTC' < p_now
      and (
        settings.filter = 'all'
        or (settings.filter = 'urgent' and s.urgency in ('emergency', 'urgent'))
        or (settings.filter = 'disliked' and exists (
          select 1 from public.user_feedback f where f.symptom_check_id = s.id and f.rating = 'disliked'))
      )
    order by s.created_at desc, s.id desc
    limit (select size + 1 from settings)
  ),
  numbered as (
    select s, row_number() over (order by (s).created_at desc, (s).id desc) as n from picked
  )
  select jsonb_build_object(
    'rows', coalesce((
      select jsonb_agg(public.admin_check_row(s) order by n)
      from numbered where n <= (select size from settings)
    ), '[]'::jsonb),
    'has_more', (select count(*) from numbered) > (select size from settings)
  )
$$;

revoke all on function public.admin_check_row(public.symptom_checks) from public, anon, authenticated;
revoke all on function public.admin_checks_stats(timestamptz, integer) from public, anon, authenticated;
revoke all on function public.admin_check_feed(timestamptz, integer, text, integer) from public, anon, authenticated;

grant execute on function public.admin_check_row(public.symptom_checks) to service_role;
grant execute on function public.admin_checks_stats(timestamptz, integer) to service_role;
grant execute on function public.admin_check_feed(timestamptz, integer, text, integer) to service_role;
