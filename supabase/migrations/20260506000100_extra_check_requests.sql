-- Extra check requests flow:
-- - user with zero credits can create one pending request
-- - admin resolves request in Telegram (approve/reject)
-- - approved request grants exactly +1 credit and writes credit_ledger entry

do $$ begin
  create type public.extra_check_request_status as enum ('pending', 'approved', 'rejected');
exception when duplicate_object then null; end $$;

create table if not exists public.extra_check_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  status public.extra_check_request_status not null default 'pending',
  telegram_chat_id bigint,
  telegram_message_id bigint,
  reviewed_at timestamptz,
  reviewed_by_telegram_id bigint,
  reviewed_by_username text,
  granted_ledger_id uuid references public.credit_ledger(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists extra_check_requests_user_idx
  on public.extra_check_requests (user_id, created_at desc);

create unique index if not exists extra_check_requests_one_pending_per_user_idx
  on public.extra_check_requests (user_id)
  where status = 'pending';

alter table public.extra_check_requests enable row level security;

create or replace function public.create_extra_check_request(
  p_user_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile_credits integer;
  v_request_id uuid;
begin
  select credits into v_profile_credits
  from public.profiles
  where id = p_user_id
  for update;

  if not found then
    raise exception 'profile_not_found';
  end if;

  if v_profile_credits > 0 then
    raise exception 'credits_remaining';
  end if;

  insert into public.extra_check_requests (user_id, status)
  values (p_user_id, 'pending')
  returning id into v_request_id;

  return jsonb_build_object(
    'request_id', v_request_id,
    'status', 'pending'
  );
exception
  when unique_violation then
    raise exception 'pending_request_exists';
end;
$$;

create or replace function public.resolve_extra_check_request(
  p_request_id uuid,
  p_action text,
  p_admin_telegram_id bigint default null,
  p_admin_username text default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request public.extra_check_requests%rowtype;
  v_new_balance integer;
  v_ledger_id uuid;
begin
  if p_action not in ('approve', 'reject') then
    raise exception 'invalid_action';
  end if;

  select * into v_request
  from public.extra_check_requests
  where id = p_request_id
  for update;

  if not found then
    raise exception 'request_not_found';
  end if;

  if v_request.status <> 'pending' then
    return jsonb_build_object(
      'status', 'already_resolved',
      'request_status', v_request.status,
      'request_id', v_request.id,
      'new_balance', null
    );
  end if;

  if p_action = 'reject' then
    update public.extra_check_requests
      set status = 'rejected',
          reviewed_at = now(),
          reviewed_by_telegram_id = p_admin_telegram_id,
          reviewed_by_username = p_admin_username,
          updated_at = now()
      where id = v_request.id;

    return jsonb_build_object(
      'status', 'rejected',
      'request_id', v_request.id
    );
  end if;

  update public.profiles
    set credits = credits + 1
    where id = v_request.user_id
    returning credits into v_new_balance;

  insert into public.credit_ledger (user_id, delta, reason, balance_after)
  values (v_request.user_id, 1, 'admin_grant', v_new_balance)
  returning id into v_ledger_id;

  update public.extra_check_requests
    set status = 'approved',
        reviewed_at = now(),
        reviewed_by_telegram_id = p_admin_telegram_id,
        reviewed_by_username = p_admin_username,
        granted_ledger_id = v_ledger_id,
        updated_at = now()
    where id = v_request.id;

  return jsonb_build_object(
    'status', 'approved',
    'request_id', v_request.id,
    'ledger_id', v_ledger_id,
    'new_balance', v_new_balance
  );
end;
$$;

revoke execute on function public.create_extra_check_request(uuid) from public, anon, authenticated;
revoke execute on function public.resolve_extra_check_request(uuid, text, bigint, text) from public, anon, authenticated;

grant execute on function public.create_extra_check_request(uuid) to service_role;
grant execute on function public.resolve_extra_check_request(uuid, text, bigint, text) to service_role;
