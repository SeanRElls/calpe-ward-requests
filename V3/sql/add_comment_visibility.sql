-- Add visibility flag for assignment comments with three levels:
-- admin_only: Only visible to admins (default for is_admin_only=true)
-- all_staff: Visible to all staff members
-- user_only: Visible only to the assigned user

ALTER TABLE public.rota_assignment_comments
ADD COLUMN comment_visibility TEXT DEFAULT 'all_staff' CHECK (comment_visibility IN ('admin_only', 'all_staff', 'user_only'));

COMMENT ON COLUMN public.rota_assignment_comments.comment_visibility IS 
'Visibility level for comment: admin_only, all_staff (default), or user_only';

-- Migrate existing is_admin_only values to comment_visibility
UPDATE public.rota_assignment_comments
SET comment_visibility = CASE 
  WHEN is_admin_only = true THEN 'admin_only'
  ELSE 'all_staff'
END;

-- Keep is_admin_only for backward compatibility but make it computed
-- (We'll handle this in the app logic instead of altering the column structure)
