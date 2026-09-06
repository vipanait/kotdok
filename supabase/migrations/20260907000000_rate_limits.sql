-- Distributed rate limiting on the database the servers already share.
--
-- The roadmap rules out Redis and a separate broker for the MVP, and a
-- per-process counter would not hold: two server instances must spend one
-- allowance, otherwise the limit is only as strong as the number of instances.
--
-- One row per bucket, one fixed window. The counter is incremented and read in
-- a single statement so concurrent requests cannot both see room for the last
-- one.

create table if not exists public.api_rate_limits (
  bucket text primary key,
  window_started_at timestamptz not null default now(),
  request_count integer not null default 0
);

alter table public.api_rate_limits enable row level security;

-- No policies: only the service role reaches this table. The lockdown migration
-- already removed write privileges from anon and authenticated, and reads would
-- expose one user's request pattern to another.
revoke all on public.api_rate_limits from anon, authenticated;

create index if not exists api_rate_limits_window_idx
  on public.api_rate_limits (window_started_at);

/**
 * Spends one unit of a bucket's allowance.
 *
 * Returns whether the request is allowed, how much is left, and when the window
 * resets. `p_now` exists so tests can drive the clock instead of sleeping.
 */
create or replace function public.consume_rate_limit(
  p_bucket text,
  p_limit integer,
  p_window_seconds integer,
  p_now timestamptz default now()
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.api_rate_limits%rowtype;
begin
  if p_limit <= 0 or p_window_seconds <= 0 then
    raise exception 'invalid_rate_limit';
  end if;

  insert into public.api_rate_limits (bucket, window_started_at, request_count)
  values (p_bucket, p_now, 1)
  on conflict (bucket) do update set
    -- A window that has elapsed starts over; otherwise the count grows.
    window_started_at = case
      when public.api_rate_limits.window_started_at + make_interval(secs => p_window_seconds) <= p_now
        then p_now
      else public.api_rate_limits.window_started_at
    end,
    request_count = case
      when public.api_rate_limits.window_started_at + make_interval(secs => p_window_seconds) <= p_now
        then 1
      else public.api_rate_limits.request_count + 1
    end
  returning * into v_row;

  return jsonb_build_object(
    'allowed', v_row.request_count <= p_limit,
    'remaining', greatest(0, p_limit - v_row.request_count),
    'reset_at', v_row.window_started_at + make_interval(secs => p_window_seconds)
  );
end;
$$;

-- Service role only. PostgreSQL grants EXECUTE to PUBLIC by default, so
-- revoking from anon and authenticated alone leaves the function callable
-- through /rest/v1/rpc — the same convention the billing migrations follow.
revoke execute on function public.consume_rate_limit(text, integer, integer, timestamptz)
  from public, anon, authenticated;
grant execute on function public.consume_rate_limit(text, integer, integer, timestamptz)
  to service_role;

-- handle_new_user is a trigger function that Supabase's own linter flags as
-- callable by anon and authenticated through /rest/v1/rpc. Triggers run as the
-- table owner regardless, so removing the grant costs nothing.
revoke execute on function public.handle_new_user() from public, anon, authenticated;
