-- Add visibility flag for override comments with three levels:
-- admin_only: Only visible to admins (default)
-- all_staff: Visible to all staff members
-- user_only: Visible only to the assigned user

ALTER TABLE public.rota_assignment_overrides
ADD COLUMN comment_visibility TEXT DEFAULT 'admin_only' CHECK (comment_visibility IN ('admin_only', 'all_staff', 'user_only'));

COMMENT ON COLUMN public.rota_assignment_overrides.comment_visibility IS 
'Visibility level for override comment: admin_only (default), all_staff, or user_only';
