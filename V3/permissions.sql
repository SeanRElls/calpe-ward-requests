-- Permissions data model (no RLS changes)
-- Superadmin = users.is_admin = true (handled in app logic)

create table if not exists permission_groups (
  id uuid primary key default gen_random_uuid(),
  name text unique not null,
  is_system boolean not null default false,
  is_protected boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists permissions (
  key text primary key,
  label text not null,
  description text,
  category text not null
);

create table if not exists permission_group_permissions (
  group_id uuid not null references permission_groups(id) on delete cascade,
  permission_key text not null references permissions(key) on delete cascade,
  primary key (group_id, permission_key)
);

create table if not exists user_permission_groups (
  user_id uuid not null references users(id) on delete cascade,
  group_id uuid not null references permission_groups(id) on delete cascade,
  primary key (user_id, group_id)
);

-- Seed default groups (idempotent)
insert into permission_groups (name, is_system, is_protected)
values
  ('Admin', true, true),
  ('Mentor', true, false),
  ('Staff', true, false),
  ('Audit Viewer', true, false)
on conflict (name) do nothing;

-- Seed permissions from permissions.json (copy keys/labels/descriptions/categories)
-- Example inserts (extend from permissions.json as needed)
insert into permissions (key, label, description, category) values
  ('users.view', 'View users', 'View user list, roles, and status.', 'user_management'),
  ('users.create', 'Add users', 'Create new user records.', 'user_management'),
  ('users.edit', 'Edit users', 'Edit name and role.', 'user_management'),
  ('users.set_pin', 'Change PIN', 'Set or reset user PINs.', 'user_management'),
  ('users.toggle_active', 'Activate/deactivate users', 'Change active status.', 'user_management'),
  ('users.reorder', 'Reorder rota', 'Change display order.', 'user_management'),
  ('requests.view_all', 'View all requests', 'See requests for all users.', 'requests'),
  ('requests.edit_all', 'Edit all requests', 'Edit other users'' requests.', 'requests'),
  ('requests.lock_cells', 'Lock/unlock requests', 'Lock or unlock request cells.', 'requests'),
  ('requests.view_comments', 'View all comments', 'View all week comments.', 'requests'),
  ('rota.view_draft', 'View draft', 'View draft rota.', 'rota'),
  ('rota.edit_draft', 'Edit draft', 'Edit draft rota cells.', 'rota'),
  ('rota.publish', 'Publish period', 'Publish a period.', 'rota'),
  ('rota.approve', 'Annotate approval', 'Add CNM approval annotation.', 'rota'),
  ('periods.create', 'Create period', 'Create a new 5-week period.', 'periods'),
  ('periods.set_active', 'Set active period', 'Set active period.', 'periods'),
  ('periods.toggle_hidden', 'Hide/unhide period', 'Toggle hidden periods.', 'periods'),
  ('periods.set_close_time', 'Set close time', 'Set or clear closes_at.', 'periods'),
  ('weeks.set_open_flags', 'Open/close weeks', 'Update week open flags.', 'periods'),
  ('notices.view_admin', 'View notices (admin)', 'View admin notice list.', 'notices'),
  ('notices.create', 'Create notices', 'Create notices.', 'notices'),
  ('notices.edit', 'Edit notices', 'Edit notices.', 'notices'),
  ('notices.toggle_active', 'Hide/unhide notices', 'Toggle notice visibility.', 'notices'),
  ('notices.delete', 'Delete notices', 'Delete notices.', 'notices'),
  ('notices.view_ack_counts', 'View ack counts', 'View acknowledgement counts.', 'notices'),
  ('notices.view_ack_lists', 'View ack lists', 'View acknowledgement lists.', 'notices'),
  ('print.open_admin', 'Open admin print', 'Open admin print config.', 'print_export'),
  ('print.export_csv', 'Export CSV', 'Export CSV data.', 'print_export'),
  ('system.admin_panel', 'Admin panel access', 'Access admin console.', 'system')
on conflict (key) do nothing;
