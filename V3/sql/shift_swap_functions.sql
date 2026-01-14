-- All functions enforce authentication and authorization

-- Clean up legacy overloads that used integer or uuid period_ids
drop function if exists admin_execute_shift_swap(uuid, text, integer, uuid, date, uuid, date);
drop function if exists admin_execute_shift_swap(uuid, text, uuid, uuid, date, uuid, date);
drop function if exists staff_request_shift_swap(uuid, integer, date, uuid, date);
drop function if exists staff_request_shift_swap(uuid, uuid, date, uuid, date);
drop function if exists admin_get_swap_executions(uuid, text, integer);
drop function if exists admin_get_swap_executions(uuid, text, uuid);
drop function if exists admin_get_swap_requests(uuid, text);

-- Support objects required by swap RPCs
create extension if not exists pgcrypto;
create table if not exists admin_pins(
  user_id uuid primary key references public.users(id),
  pin text not null,
  created_at timestamptz default now()
);

-- 1. Admin direct swap (admin initiates, executes immediately, no approval)
-- Returns: swap_execution record if successful, null + error message if not
-- p_pin is accepted for compatibility but not used; auth is via admin flag or rota.swap permission
create or replace function admin_execute_shift_swap(
  p_admin_id uuid,
  p_pin text,
  p_initiator_user_id uuid,
  p_initiator_shift_date date,
  p_counterparty_user_id uuid,
  p_counterparty_shift_date date,
  p_period_id integer default null
)
returns table(
  success boolean,
  swap_execution_id uuid,
  error_message text
) as $$
declare
  v_admin_name text;
  v_is_admin boolean;
  v_initiator_name text;
  v_counterparty_name text;
  v_initiator_shift_code text;
  v_counterparty_shift_code text;
  v_initiator_week_id integer;
  v_counterparty_week_id integer;
  v_swap_exec_id uuid;
  v_initiator_shift_id bigint;
  v_counterparty_shift_id bigint;
  v_initiator_role_id integer;
  v_counterparty_role_id integer;
  v_same_week boolean;
begin
  -- Verify admin/rota.swap permission
  select name, is_admin into v_admin_name, v_is_admin from public.users where id = p_admin_id and is_active = true;
  if v_admin_name is null then
    return query select false, null::uuid, 'Admin not found or inactive'::text;
    return;
  end if;

  if not v_is_admin then
    if to_regclass('public.user_permission_assignments') is null or to_regclass('public.permission_items') is null then
      return query select false, null::uuid, 'Permission system not installed'::text;
      return;
    end if;

    if not exists(
      select 1 from user_permission_assignments upa
      join permission_items pi on pi.id = upa.permission_id
      where upa.user_id = p_admin_id
        and pi.key = 'rota.swap'
        and upa.assigned_at <= now()
        and (upa.revoked_at is null or upa.revoked_at > now())
    ) then
      return query select false, null::uuid, 'Permission denied: rota.swap not assigned'::text;
      return;
    end if;
  end if;

  -- Get initiator name and shift info
  select u.name, u.role_id, s.code, null::integer
    into v_initiator_name, v_initiator_role_id, v_initiator_shift_code, v_initiator_week_id
    from public.users u
    join rota_assignments ra on ra.user_id = u.id
    join shifts s on s.id = ra.shift_id
    where u.id = p_initiator_user_id
      and ra.date = p_initiator_shift_date
    limit 1;

  if v_initiator_name is null then
    -- Check if user exists
    if not exists(select 1 from public.users where id = p_initiator_user_id) then
      return query select false, null::uuid, 'Initiator user not found'::text;
      return;
    end if;
    -- Check if assignment exists
    if not exists(select 1 from rota_assignments where user_id = p_initiator_user_id and date = p_initiator_shift_date) then
      return query select false, null::uuid, format('No assignment found for initiator on %s', p_initiator_shift_date)::text;
      return;
    end if;
    -- Check if shift_id is null
    if exists(select 1 from rota_assignments where user_id = p_initiator_user_id and date = p_initiator_shift_date and shift_id is null) then
      return query select false, null::uuid, 'Initiator assignment has no shift assigned'::text;
      return;
    end if;
    return query select false, null::uuid, 'Initiator shift not found (unknown reason)'::text;
    return;
  end if;

  -- Get counterparty name and shift info
  select u.name, u.role_id, s.code, null::integer
    into v_counterparty_name, v_counterparty_role_id, v_counterparty_shift_code, v_counterparty_week_id
    from public.users u
    join rota_assignments ra on ra.user_id = u.id
    join shifts s on s.id = ra.shift_id
    where u.id = p_counterparty_user_id
      and ra.date = p_counterparty_shift_date
    limit 1;

  if v_counterparty_name is null then
    -- Check if user exists
    if not exists(select 1 from public.users where id = p_counterparty_user_id) then
      return query select false, null::uuid, 'Counterparty user not found'::text;
      return;
    end if;
    -- Check if assignment exists
    if not exists(select 1 from rota_assignments where user_id = p_counterparty_user_id and date = p_counterparty_shift_date) then
      return query select false, null::uuid, format('No assignment found for counterparty on %s', p_counterparty_shift_date)::text;
      return;
    end if;
    -- Check if shift_id is null
    if exists(select 1 from rota_assignments where user_id = p_counterparty_user_id and date = p_counterparty_shift_date and shift_id is null) then
      return query select false, null::uuid, 'Counterparty assignment has no shift assigned'::text;
      return;
    end if;
    return query select false, null::uuid, 'Counterparty shift not found (unknown reason)'::text;
    return;
  end if;

  -- Validate swap rules based on role_id
  -- role_id 3 = Nursing Assistant: can only swap within same week and with other Nursing Assistants
  -- role_id 1,2 = Charge/Staff Nurse: can swap freely
  v_same_week := date_trunc('week', p_initiator_shift_date::timestamp) = date_trunc('week', p_counterparty_shift_date::timestamp);
  
  -- Nursing Assistants (role_id 3) can only swap within same week and with other Nursing Assistants
  if v_initiator_role_id = 3 or v_counterparty_role_id = 3 then
    if not v_same_week then
      return query select false, null::uuid, 'Nursing Assistants can only swap shifts within the same week'::text;
      return;
    end if;
    
    -- Both users must be Nursing Assistants
    if v_initiator_role_id != 3 or v_counterparty_role_id != 3 then
      return query select false, null::uuid, 'Nursing Assistants can only swap with other Nursing Assistants'::text;
      return;
    end if;
  end if;

  -- Execute swap: swap rota_assignments shift_id
  select shift_id into v_initiator_shift_id from rota_assignments
    where user_id = p_initiator_user_id and date = p_initiator_shift_date;
  select shift_id into v_counterparty_shift_id from rota_assignments
    where user_id = p_counterparty_user_id and date = p_counterparty_shift_date;

  -- Debug: return the shift IDs for verification
  if v_initiator_shift_id is null or v_counterparty_shift_id is null then
    return query select false, null::uuid, format('Debug: initiator_shift_id=%s, counterparty_shift_id=%s', v_initiator_shift_id, v_counterparty_shift_id)::text;
    return;
  end if;
  
  -- Swap both shift_id AND date
  update rota_assignments
    set shift_id = v_counterparty_shift_id,
        date = p_counterparty_shift_date
    where user_id = p_initiator_user_id and date = p_initiator_shift_date;

  if not found then
    return query select false, null::uuid, 'UPDATE failed for initiator assignment'::text;
    return;
  end if;

  update rota_assignments
    set shift_id = v_initiator_shift_id,
        date = p_initiator_shift_date
    where user_id = p_counterparty_user_id and date = p_counterparty_shift_date;

  if not found then
    return query select false, null::uuid, 'UPDATE failed for counterparty assignment'::text;
    return;
  end if;

  -- Record swap execution
  insert into swap_executions(
    method, period_id, initiator_week_id, counterparty_week_id,
    initiator_user_id, initiator_name,
    counterparty_user_id, counterparty_name,
    authoriser_user_id, authoriser_name,
    initiator_old_shift_code, initiator_old_shift_date, initiator_new_shift_code, initiator_new_shift_date,
    counterparty_old_shift_code, counterparty_old_shift_date, counterparty_new_shift_code, counterparty_new_shift_date
  )
  values(
    'admin_direct', null::integer, v_initiator_week_id, v_counterparty_week_id,
    p_initiator_user_id, v_initiator_name,
    p_counterparty_user_id, v_counterparty_name,
    p_admin_id, v_admin_name,
    v_initiator_shift_code, p_initiator_shift_date, v_counterparty_shift_code, p_counterparty_shift_date,
    v_counterparty_shift_code, p_counterparty_shift_date, v_initiator_shift_code, p_initiator_shift_date
  )
  returning swap_executions.id into v_swap_exec_id;

  -- Create system comments on both cells
  if to_regclass('public.rota_assignment_comments') is not null then
    insert into rota_assignment_comments(rota_assignment_id, comment, is_admin_only, created_by, created_at)
    select ra.id, 
      format('Swap: %s %s (%s) was swapped with %s %s (%s). Authorised by: %s (Admin)',
        v_initiator_name, to_char(p_initiator_shift_date, 'Dy DD Mon'), v_counterparty_shift_code,
        v_counterparty_name, to_char(p_counterparty_shift_date, 'Dy DD Mon'), v_initiator_shift_code,
        v_admin_name),
      false, p_admin_id, now()
    from rota_assignments ra
    where ra.user_id = p_initiator_user_id
      and ra.date = p_counterparty_shift_date;

    insert into rota_assignment_comments(rota_assignment_id, comment, is_admin_only, created_by, created_at)
    select ra.id,
      format('Swap: %s %s (%s) was swapped with %s %s (%s). Authorised by: %s (Admin)',
        v_counterparty_name, to_char(p_counterparty_shift_date, 'Dy DD Mon'), v_initiator_shift_code,
        v_initiator_name, to_char(p_initiator_shift_date, 'Dy DD Mon'), v_counterparty_shift_code,
        v_admin_name),
      false, p_admin_id, now()
    from rota_assignments ra
    where ra.user_id = p_counterparty_user_id
      and ra.date = p_initiator_shift_date;
  end if;

  return query select true, v_swap_exec_id, null::text;
end;
$$ language plpgsql security definer;

-- 2. Staff propose swap (creates pending swap_request)
create or replace function staff_request_shift_swap(
  p_user_id uuid,
  p_initiator_shift_date date,
  p_counterparty_user_id uuid,
  p_counterparty_shift_date date,
  p_period_id integer default null
)
returns table(
  success boolean,
  swap_request_id uuid,
  error_message text
) as $$
declare
  v_swap_req_id uuid;
  v_initiator_week_id integer;
  v_counterparty_week_id integer;
  v_debug_user_count integer;
  v_debug_user_active boolean;
begin
  -- Debug: Check if user exists in public.users
  select count(*), bool_or(is_active) into v_debug_user_count, v_debug_user_active
  from public.users where id = p_user_id;
  
  if v_debug_user_count = 0 then
    return query select false, null::uuid, format('DEBUG: User %s not found in public.users table', p_user_id)::text;
    return;
  end if;
  
  if not v_debug_user_active then
    return query select false, null::uuid, format('DEBUG: User %s exists but is_active=false', p_user_id)::text;
    return;
  end if;

  -- Verify counterparty exists
  select count(*), bool_or(is_active) into v_debug_user_count, v_debug_user_active
  from public.users where id = p_counterparty_user_id;
  
  if v_debug_user_count = 0 then
    return query select false, null::uuid, format('DEBUG: Counterparty %s not found in public.users table', p_counterparty_user_id)::text;
    return;
  end if;
  
  if not v_debug_user_active then
    return query select false, null::uuid, format('DEBUG: Counterparty %s exists but is_active=false', p_counterparty_user_id)::text;
    return;
  end if;

  -- Verify shifts exist
  if not exists(
    select 1 from rota_assignments ra
    join shifts s on s.id = ra.shift_id
    where ra.user_id = p_user_id and ra.date = p_initiator_shift_date and s.code != 'O'
  ) then
    return query select false, null::uuid, 'Your shift on this date not found'::text;
    return;
  end if;

  if not exists(
    select 1 from rota_assignments ra
    join shifts s on s.id = ra.shift_id
    where ra.user_id = p_counterparty_user_id and ra.date = p_counterparty_shift_date and s.code != 'O'
  ) then
    return query select false, null::uuid, 'Peer shift on this date not found'::text;
    return;
  end if;

  -- Defer FK constraint checks to end of transaction
  set constraints all deferred;

  -- Create swap request
  insert into swap_requests(
    period_id, initiator_user_id, counterparty_user_id,
    initiator_shift_date, initiator_shift_code, initiator_week_id,
    counterparty_shift_date, counterparty_shift_code, counterparty_week_id,
    status
  )
  select
    p_period_id, p_user_id, p_counterparty_user_id,
    p_initiator_shift_date, s1.code, null::integer,
    p_counterparty_shift_date, s2.code, null::integer,
    'pending'
  from (
    select s.code from rota_assignments ra
    join shifts s on s.id = ra.shift_id
    where ra.user_id = p_user_id and ra.date = p_initiator_shift_date
    limit 1
  ) s1
  cross join (
    select s.code from rota_assignments ra
    join shifts s on s.id = ra.shift_id
    where ra.user_id = p_counterparty_user_id and ra.date = p_counterparty_shift_date
    limit 1
  ) s2
  returning id into v_swap_req_id;

  -- Restore immediate constraint checking
  set constraints all immediate;

  return query select true, v_swap_req_id, null::text;
end;
$$ language plpgsql security definer;

-- 3. Counterparty respond to swap request
create or replace function staff_respond_to_swap_request(
  p_user_id uuid,
  p_swap_request_id uuid,
  p_response text -- 'accepted' or 'declined' or 'ignored'
)
returns table(
  success boolean,
  error_message text
) as $$
begin
  if p_response not in ('accepted', 'declined', 'ignored') then
    return query select false, 'Invalid response. Must be: accepted, declined, or ignored'::text;
    return;
  end if;

  if not exists(select 1 from swap_requests where id = p_swap_request_id and counterparty_user_id = p_user_id) then
    return query select false, 'Swap request not found or you are not the counterparty'::text;
    return;
  end if;

  update swap_requests
    set counterparty_response = p_response,
        counterparty_responded_at = now(),
        status = case
          when p_response = 'accepted' then 'accepted_by_counterparty'
          when p_response = 'declined' then 'declined_by_counterparty'
          when p_response = 'ignored' then 'ignored'
          else status
        end
    where id = p_swap_request_id;

  return query select true, null::text;
end;
$$ language plpgsql security definer;

-- 4. Admin approve swap request (executes the swap)
create or replace function admin_approve_swap_request(
  p_admin_id uuid,
  p_pin text,
  p_swap_request_id uuid
)
returns table(
  success boolean,
  swap_execution_id uuid,
  error_message text
) as $$
declare
  v_swap_req swap_requests;
  v_admin_name text;
  v_is_admin boolean;
  v_initiator_name text;
  v_counterparty_name text;
  v_swap_exec_id uuid;
  v_initiator_shift_id bigint;
  v_counterparty_shift_id bigint;
begin
  -- Verify admin/rota.swap permission
  select name, is_admin into v_admin_name, v_is_admin from public.users where id = p_admin_id and is_active = true;
  if v_admin_name is null then
    return query select false, null::uuid, 'Admin not found or inactive'::text;
    return;
  end if;

  if not v_is_admin then
    if to_regclass('public.user_permission_assignments') is null or to_regclass('public.permission_items') is null then
      return query select false, null::uuid, 'Permission system not installed'::text;
      return;
    end if;

    if not exists(
      select 1 from user_permission_assignments upa
      join permission_items pi on pi.id = upa.permission_id
      where upa.user_id = p_admin_id
        and pi.key = 'rota.swap'
        and upa.assigned_at <= now()
        and (upa.revoked_at is null or upa.revoked_at > now())
    ) then
      return query select false, null::uuid, 'Permission denied: rota.swap not assigned'::text;
      return;
    end if;
  end if;

  -- Get swap request
  select * into v_swap_req from swap_requests where id = p_swap_request_id;
  if v_swap_req is null then
    return query select false, null::uuid, 'Swap request not found'::text;
    return;
  end if;

  -- Get names
  select name into v_initiator_name from public.users where id = v_swap_req.initiator_user_id;
  select name into v_counterparty_name from public.users where id = v_swap_req.counterparty_user_id;

  -- Execute swap
  select shift_id into v_initiator_shift_id from rota_assignments
    where user_id = v_swap_req.initiator_user_id and date = v_swap_req.initiator_shift_date;
  select shift_id into v_counterparty_shift_id from rota_assignments
    where user_id = v_swap_req.counterparty_user_id and date = v_swap_req.counterparty_shift_date;

  -- Swap both shift_id AND date
  update rota_assignments
    set shift_id = v_counterparty_shift_id,
        date = v_swap_req.counterparty_shift_date
    where user_id = v_swap_req.initiator_user_id and date = v_swap_req.initiator_shift_date;

  update rota_assignments
    set shift_id = v_initiator_shift_id,
        date = v_swap_req.initiator_shift_date
    where user_id = v_swap_req.counterparty_user_id and date = v_swap_req.counterparty_shift_date;

  -- Record swap execution
  insert into swap_executions(
    swap_request_id, method, period_id,
    initiator_week_id, counterparty_week_id,
    initiator_user_id, initiator_name,
    counterparty_user_id, counterparty_name,
    authoriser_user_id, authoriser_name,
    initiator_old_shift_code, initiator_old_shift_date, initiator_new_shift_code, initiator_new_shift_date,
    counterparty_old_shift_code, counterparty_old_shift_date, counterparty_new_shift_code, counterparty_new_shift_date
  )
  values(
    p_swap_request_id, 'staff_approved', null::integer,
    v_swap_req.initiator_week_id, v_swap_req.counterparty_week_id,
    v_swap_req.initiator_user_id, v_initiator_name,
    v_swap_req.counterparty_user_id, v_counterparty_name,
    p_admin_id, v_admin_name,
    v_swap_req.initiator_shift_code, v_swap_req.initiator_shift_date, v_swap_req.counterparty_shift_code, v_swap_req.counterparty_shift_date,
    v_swap_req.counterparty_shift_code, v_swap_req.counterparty_shift_date, v_swap_req.initiator_shift_code, v_swap_req.initiator_shift_date
  )
  returning swap_executions.id into v_swap_exec_id;

  -- Update swap request status
  update swap_requests
    set status = 'approved_by_admin',
        admin_user_id = p_admin_id,
        admin_decided_at = now(),
        admin_decision = 'approved'
    where id = p_swap_request_id;

  -- Create system comments on both cells
  if to_regclass('public.rota_assignment_comments') is not null then
    insert into rota_assignment_comments(rota_assignment_id, comment, is_admin_only, created_by, created_at)
    select ra.id,
      format('Swap: %s %s (%s) was swapped with %s %s (%s). Requested by: %s. Authorised by: %s (Admin)',
        v_initiator_name, to_char(v_swap_req.initiator_shift_date, 'Dy DD Mon'), v_swap_req.counterparty_shift_code,
        v_counterparty_name, to_char(v_swap_req.counterparty_shift_date, 'Dy DD Mon'), v_swap_req.initiator_shift_code,
        v_initiator_name, v_admin_name),
      false, p_admin_id, now()
    from rota_assignments ra
    where ra.user_id = v_swap_req.initiator_user_id
      and ra.date = v_swap_req.counterparty_shift_date;

    insert into rota_assignment_comments(rota_assignment_id, comment, is_admin_only, created_by, created_at)
    select ra.id,
      format('Swap: %s %s (%s) was swapped with %s %s (%s). Requested by: %s. Authorised by: %s (Admin)',
        v_counterparty_name, to_char(v_swap_req.counterparty_shift_date, 'Dy DD Mon'), v_swap_req.initiator_shift_code,
        v_initiator_name, to_char(v_swap_req.initiator_shift_date, 'Dy DD Mon'), v_swap_req.counterparty_shift_code,
        v_initiator_name, v_admin_name),
      false, p_admin_id, now()
    from rota_assignments ra
    where ra.user_id = v_swap_req.counterparty_user_id
      and ra.date = v_swap_req.initiator_shift_date;
  end if;

  return query select true, v_swap_exec_id, null::text;
end;
$$ language plpgsql security definer;

-- 5. Admin decline swap request
create or replace function admin_decline_swap_request(
  p_admin_id uuid,
  p_pin text,
  p_swap_request_id uuid
)
returns table(
  success boolean,
  error_message text
) as $$
declare
  v_admin_name text;
  v_is_admin boolean;
begin
  -- Verify admin/rota.swap permission
  select name, is_admin into v_admin_name, v_is_admin from public.users where id = p_admin_id and is_active = true;
  if v_admin_name is null then
    return query select false, 'Admin not found or inactive'::text;
    return;
  end if;

  if not v_is_admin then
    if to_regclass('public.user_permission_assignments') is null or to_regclass('public.permission_items') is null then
      return query select false, 'Permission system not installed'::text;
      return;
    end if;

    if not exists(
      select 1 from user_permission_assignments upa
      join permission_items pi on pi.id = upa.permission_id
      where upa.user_id = p_admin_id
        and pi.key = 'rota.swap'
        and upa.assigned_at <= now()
        and (upa.revoked_at is null or upa.revoked_at > now())
    ) then
      return query select false, 'Permission denied: rota.swap not assigned'::text;
      return;
    end if;
  end if;

  if not exists(select 1 from swap_requests where id = p_swap_request_id) then
    return query select false, 'Swap request not found'::text;
    return;
  end if;

  update swap_requests
    set status = 'declined_by_admin',
        admin_user_id = p_admin_id,
        admin_decided_at = now(),
        admin_decision = 'declined'
    where id = p_swap_request_id;

  return query select true, null::text;
end;
$$ language plpgsql security definer;

-- 6. Get swap requests for admin dashboard (view only)
create or replace function admin_get_swap_requests(
  p_admin_id uuid,
  p_pin text
)
returns table(
  id uuid,
  period_id integer,
  initiator_name text,
  counterparty_name text,
  initiator_shift_date date,
  initiator_shift_code text,
  counterparty_shift_date date,
  counterparty_shift_code text,
  status text,
  counterparty_response text,
  counterparty_responded_at timestamp,
  created_at timestamp
) as $$
begin
  -- Verify admin/rota.swap permission
  perform 1 from public.users where id = p_admin_id and is_active = true;
  if not found then
    raise exception 'Admin not found or inactive';
  end if;

  perform 1 from public.users where id = p_admin_id and is_admin = true;
  if not found then
    if to_regclass('public.user_permission_assignments') is null or to_regclass('public.permission_items') is null then
      raise exception 'Permission system not installed';
    end if;

    perform 1
    from user_permission_assignments upa
    join permission_items pi on pi.id = upa.permission_id
    where upa.user_id = p_admin_id
      and pi.key = 'rota.swap'
      and upa.assigned_at <= now()
      and (upa.revoked_at is null or upa.revoked_at > now());
    if not found then
      raise exception 'Permission denied: rota.swap not assigned';
    end if;
  end if;

  return query
  select sr.id, sr.period_id,
    u1.name, u2.name,
    sr.initiator_shift_date, sr.initiator_shift_code,
    sr.counterparty_shift_date, sr.counterparty_shift_code,
    sr.status, sr.counterparty_response, sr.counterparty_responded_at,
    sr.created_at
  from swap_requests sr
  join public.users u1 on u1.id = sr.initiator_user_id
  join public.users u2 on u2.id = sr.counterparty_user_id
  order by sr.created_at desc;
end;
$$ language plpgsql security definer;

-- 7. Get swap executions (history, full audit)
create or replace function admin_get_swap_executions(
  p_admin_id uuid,
  p_pin text,
  p_period_id integer default null
)
returns table(
  id uuid,
  period_id integer,
  initiator_name text,
  counterparty_name text,
  authoriser_name text,
  initiator_date date,
  initiator_old_shift text,
  initiator_new_shift text,
  counterparty_date date,
  counterparty_old_shift text,
  counterparty_new_shift text,
  method text,
  executed_at timestamp
) as $$
begin
  -- Verify admin/rota.swap permission
  perform 1 from public.users where id = p_admin_id and is_active = true;
  if not found then
    raise exception 'Admin not found or inactive';
  end if;

  perform 1 from public.users where id = p_admin_id and is_admin = true;
  if not found then
    if to_regclass('public.user_permission_assignments') is null or to_regclass('public.permission_items') is null then
      raise exception 'Permission system not installed';
    end if;

    perform 1
    from user_permission_assignments upa
    join permission_items pi on pi.id = upa.permission_id
    where upa.user_id = p_admin_id
      and pi.key = 'rota.swap'
      and upa.assigned_at <= now()
      and (upa.revoked_at is null or upa.revoked_at > now());
    if not found then
      raise exception 'Permission denied: rota.swap not assigned';
    end if;
  end if;

  return query
  select se.id, se.period_id,
    se.initiator_name, se.counterparty_name, se.authoriser_name,
    se.initiator_old_shift_date, se.initiator_old_shift_code, se.initiator_new_shift_code,
    se.counterparty_old_shift_date, se.counterparty_old_shift_code, se.counterparty_new_shift_code,
    se.method, se.executed_at
  from swap_executions se
  where (p_period_id is null or se.period_id = p_period_id)
  order by se.executed_at desc;
end;
$$ language plpgsql security definer;

-- Grant permissions to authenticated role for staff swap functionality
grant execute on function staff_request_shift_swap(uuid, date, uuid, date, integer) to authenticated;
grant execute on function admin_execute_shift_swap(uuid, text, uuid, date, uuid, date, integer) to authenticated;
grant execute on function staff_respond_to_swap_request(uuid, uuid, text) to authenticated;
grant execute on function admin_approve_swap_request(uuid, text, uuid) to authenticated;
grant execute on function admin_decline_swap_request(uuid, text, uuid) to authenticated;
grant execute on function admin_get_swap_requests(uuid, text) to authenticated;
grant execute on function admin_get_swap_executions(uuid, text, integer) to authenticated;

-- 8. Get pending swap requests for current user (counterparty)
create or replace function get_pending_swap_requests_for_me(
  p_user_id uuid
)
returns table(
  id uuid,
  initiator_name text,
  counterparty_name text,
  initiator_shift_date date,
  initiator_shift_code text,
  counterparty_shift_date date,
  counterparty_shift_code text,
  created_at timestamptz
) as $$
begin
  return query
  select sr.id,
    u1.name as initiator_name, u2.name as counterparty_name,
    sr.initiator_shift_date, sr.initiator_shift_code,
    sr.counterparty_shift_date, sr.counterparty_shift_code,
    sr.created_at
  from swap_requests sr
  join public.users u1 on u1.id = sr.initiator_user_id
  join public.users u2 on u2.id = sr.counterparty_user_id
  where sr.counterparty_user_id = p_user_id
    and sr.status = 'pending'
    and sr.counterparty_response is null
  order by sr.created_at desc;
end;
$$ language plpgsql security definer;

-- Grant table permissions to authenticated role
grant select on table public.users to authenticated;
grant select on table public.shifts to authenticated;
grant select on table public.rota_assignments to authenticated;
grant select, insert, update on table swap_requests to authenticated;
grant select, insert, update on table swap_executions to authenticated;
grant execute on function get_pending_swap_requests_for_me(uuid) to authenticated;
