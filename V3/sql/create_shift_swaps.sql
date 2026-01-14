-- Shift Swap System
-- Tracks swap requests and executed swaps with full audit trail

-- 1. Swap requests (proposals, pending approval)
create table if not exists swap_requests (
  id uuid primary key default gen_random_uuid(),
  period_id integer not null,
  initiator_user_id uuid not null references auth.users(id) on delete cascade,
  counterparty_user_id uuid not null references auth.users(id) on delete cascade,
  
  -- Initiator's shift: date they want to swap away
  initiator_shift_date date not null,
  initiator_shift_code text not null, -- e.g., 'LD', '8-8', 'N', 'W', 'O'
  initiator_week_id integer not null,
  
  -- Counterparty's shift: date they want to swap away
  counterparty_shift_date date not null,
  counterparty_shift_code text not null,
  counterparty_week_id integer not null,
  
  -- Status flow: pending → accepted_by_counterparty → approved_by_admin → executed
  --           or: pending → declined_by_counterparty / declined_by_admin / ignored
  status text not null default 'pending',
  
  -- Counterparty response (null = not responded, 'accepted', 'declined', 'ignored')
  counterparty_response text,
  counterparty_responded_at timestamp,
  
  -- Admin decision (null = pending, 'approved', 'declined', 'ignored')
  admin_decision text,
  admin_user_id uuid references auth.users(id) on delete set null,
  admin_decided_at timestamp,
  
  created_at timestamp default now(),
  updated_at timestamp default now(),
  
  constraint initiator_not_counterparty check (initiator_user_id != counterparty_user_id),
  constraint valid_status check (status in ('pending', 'accepted_by_counterparty', 'approved_by_admin', 'declined_by_counterparty', 'declined_by_admin', 'ignored', 'executed'))
);

create index idx_swap_requests_initiator on swap_requests(initiator_user_id);
create index idx_swap_requests_counterparty on swap_requests(counterparty_user_id);
create index idx_swap_requests_status on swap_requests(status);
create index idx_swap_requests_period on swap_requests(period_id);

-- 2. Swap executions (executed swaps, fully audited)
create table if not exists swap_executions (
  id uuid primary key default gen_random_uuid(),
  swap_request_id uuid references swap_requests(id) on delete set null,
  
  -- Method: admin_direct (admin initiated, no approval needed)
  --         staff_approved (staff initiated, admin approved)
  method text not null,
  
  -- Period and week context
  period_id integer not null,
  initiator_week_id integer not null,
  counterparty_week_id integer not null,
  
  -- Three people involved (full audit)
  initiator_user_id uuid not null,
  initiator_name text not null,
  
  counterparty_user_id uuid not null,
  counterparty_name text not null,
  
  authoriser_user_id uuid not null,
  authoriser_name text not null,
  
  -- What was swapped
  initiator_old_shift_code text not null,
  initiator_old_shift_date date not null,
  initiator_new_shift_code text not null,
  initiator_new_shift_date date not null,
  
  counterparty_old_shift_code text not null,
  counterparty_old_shift_date date not null,
  counterparty_new_shift_code text not null,
  counterparty_new_shift_date date not null,
  
  executed_at timestamp default now(),
  created_at timestamp default now()
);

create index idx_swap_executions_initiator on swap_executions(initiator_user_id);
create index idx_swap_executions_counterparty on swap_executions(counterparty_user_id);
create index idx_swap_executions_authoriser on swap_executions(authoriser_user_id);
create index idx_swap_executions_period on swap_executions(period_id);
create index idx_swap_executions_swap_request on swap_executions(swap_request_id);

-- 3. Extend audit_entries table to track swap actions
-- (Assumes audit_entries already exists with: id, user_id, action_type, edited_by, timestamp, swap_request_id)
-- If adding to existing table, run:
-- ALTER TABLE audit_entries ADD COLUMN IF NOT EXISTS swap_execution_id uuid references swap_executions(id);

-- 4. Comments already exist on planned_assignments (cells)
-- When a swap executes, add type='system_swap' comment on both cells
-- Comments show: "Swap: [Initiator] [date] ([code]) was swapped with [Counterparty] [date] ([code]). Requested by: [Initiator]. Authorised by: [Authoriser]."
