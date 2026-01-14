-- Set up rota.swap permission for staff users

-- 1. Create the permission if it doesn't exist
insert into permission_items (key, name, description)
values ('rota.swap', 'Rota Swap', 'Allow staff to request and execute shift swaps')
on conflict (key) do nothing;

-- 2. Get the permission_id
-- (You'll need to replace STAFF_USER_ID with actual user IDs)

-- Example: Assign to a specific user (replace the user_id)
-- insert into user_permission_assignments (user_id, permission_id, assigned_at)
-- select 'USER_ID_HERE', id, now() 
-- from permission_items 
-- where key = 'rota.swap'
-- on conflict do nothing;

-- Or assign to all Staff Nurses (role_id 2) and Nursing Assistants (role_id 3):
insert into user_permission_assignments (user_id, permission_id, assigned_at)
select u.id, pi.id, now()
from public.users u
cross join permission_items pi
where pi.key = 'rota.swap'
  and u.is_active = true
  and u.role_id in (2, 3)  -- Staff Nurses (2) and Nursing Assistants (3)
on conflict do nothing;

-- Verify assignments
select u.name, pi.key, upa.assigned_at
from user_permission_assignments upa
join public.users u on u.id = upa.user_id
join permission_items pi on pi.id = upa.permission_id
where pi.key = 'rota.swap'
order by u.name;
