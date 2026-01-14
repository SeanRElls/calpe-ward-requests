-- Create rota_assignment_overrides table
-- Stores custom hours/times and comments that override the shift's default metadata

DROP TABLE IF EXISTS public.rota_assignment_overrides CASCADE;

CREATE TABLE public.rota_assignment_overrides (
  id BIGSERIAL PRIMARY KEY,
  rota_assignment_id BIGINT NOT NULL UNIQUE,
  
  -- Override times (NULL = use shift defaults)
  override_start_time TIME,
  override_end_time TIME,
  override_hours NUMERIC(4,2),
  
  -- Admin-only internal note (not visible to staff, different from general comments)
  comment TEXT,
  
  -- Audit trail
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_by UUID REFERENCES auth.users(id),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for faster lookups
CREATE INDEX idx_overrides_assignment 
  ON public.rota_assignment_overrides(rota_assignment_id);

-- RLS Policies
ALTER TABLE public.rota_assignment_overrides ENABLE ROW LEVEL SECURITY;

-- Allow admins and users with rota.edit_published permission
CREATE POLICY "Can select overrides with permission"
  ON public.rota_assignment_overrides
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid() AND u.is_admin = true
    )
    OR
    EXISTS (
      SELECT 1 FROM public.user_permission_groups upg
      INNER JOIN public.permission_group_permissions pgp 
        ON upg.group_id = pgp.group_id
      WHERE upg.user_id = auth.uid() 
        AND pgp.permission_key = 'rota.edit_published'
    )
  );

CREATE POLICY "Can insert overrides with permission"
  ON public.rota_assignment_overrides
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid() AND u.is_admin = true
    )
    OR
    EXISTS (
      SELECT 1 FROM public.user_permission_groups upg
      INNER JOIN public.permission_group_permissions pgp 
        ON upg.group_id = pgp.group_id
      WHERE upg.user_id = auth.uid() 
        AND pgp.permission_key = 'rota.edit_published'
    )
  );

CREATE POLICY "Can update overrides with permission"
  ON public.rota_assignment_overrides
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid() AND u.is_admin = true
    )
    OR
    EXISTS (
      SELECT 1 FROM public.user_permission_groups upg
      INNER JOIN public.permission_group_permissions pgp 
        ON upg.group_id = pgp.group_id
      WHERE upg.user_id = auth.uid() 
        AND pgp.permission_key = 'rota.edit_published'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid() AND u.is_admin = true
    )
    OR
    EXISTS (
      SELECT 1 FROM public.user_permission_groups upg
      INNER JOIN public.permission_group_permissions pgp 
        ON upg.group_id = pgp.group_id
      WHERE upg.user_id = auth.uid() 
        AND pgp.permission_key = 'rota.edit_published'
    )
  );

CREATE POLICY "Can delete overrides with permission"
  ON public.rota_assignment_overrides
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid() AND u.is_admin = true
    )
    OR
    EXISTS (
      SELECT 1 FROM public.user_permission_groups upg
      INNER JOIN public.permission_group_permissions pgp 
        ON upg.group_id = pgp.group_id
      WHERE upg.user_id = auth.uid() 
        AND pgp.permission_key = 'rota.edit_published'
    )
  );
