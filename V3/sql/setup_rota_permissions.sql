-- Create the requests.view_own permission
-- Just adds the permission definition - assign to groups via admin tool

INSERT INTO public.permissions (key, label, description, category)
VALUES ('requests.view_own', 'View Own Requests', 'Can view own requests on rota (draft and published)', 'requests')
ON CONFLICT (key) DO NOTHING;

INSERT INTO public.permissions (key, label, description, category)
VALUES ('rota.edit_published', 'Edit Published Rota', 'Can make post-publish corrections to the rota', 'rota')
ON CONFLICT (key) DO NOTHING;

INSERT INTO public.permissions (key, label, description, category)
VALUES ('rota.swap', 'Swap Shifts', 'Can initiate or approve shift swaps', 'rota')
ON CONFLICT (key) DO NOTHING;

INSERT INTO public.permissions (key, label, description, category)
VALUES ('rota.view_history', 'View Shift History', 'Can view audit history for rota cells', 'rota')
ON CONFLICT (key) DO NOTHING;
