-- Create rota_assignment_comments table
-- Stores comments on shifts with visibility control (public vs admin-only)

DROP TABLE IF EXISTS public.rota_assignment_comments CASCADE;

CREATE TABLE public.rota_assignment_comments (
  id BIGSERIAL PRIMARY KEY,
  rota_assignment_id BIGINT NOT NULL,
  
  -- Comment content
  comment TEXT NOT NULL,
  
  -- Visibility control
  is_admin_only BOOLEAN DEFAULT false,
  
  -- Who made the comment
  created_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for faster lookups
CREATE INDEX idx_comments_assignment ON public.rota_assignment_comments(rota_assignment_id);
CREATE INDEX idx_comments_user ON public.rota_assignment_comments(created_by);

-- RLS Policies
ALTER TABLE public.rota_assignment_comments ENABLE ROW LEVEL SECURITY;

-- Users can SELECT public comments (is_admin_only = false) OR any comments if admin
CREATE POLICY "Can select own and public comments"
  ON public.rota_assignment_comments
  FOR SELECT
  USING (
    -- Admin can see everything
    EXISTS (
      SELECT 1 FROM public.users
      WHERE users.id = auth.uid() AND users.is_admin = true
    )
    OR
    -- Non-admins can only see public comments (not admin-only)
    is_admin_only = false
  );

-- Users can INSERT comments
CREATE POLICY "Can insert comments"
  ON public.rota_assignment_comments
  FOR INSERT
  WITH CHECK (
    auth.uid() IS NOT NULL
  );

-- Users can UPDATE their own comments, admins can update any
CREATE POLICY "Can update own comments"
  ON public.rota_assignment_comments
  FOR UPDATE
  USING (
    -- Admin can update anything
    EXISTS (
      SELECT 1 FROM public.users
      WHERE users.id = auth.uid() AND users.is_admin = true
    )
    OR
    -- Non-admins can only update their own
    created_by = auth.uid()
  )
  WITH CHECK (
    -- Admin can update anything
    EXISTS (
      SELECT 1 FROM public.users
      WHERE users.id = auth.uid() AND users.is_admin = true
    )
    OR
    -- Non-admins can only update their own
    created_by = auth.uid()
  );

-- Users can DELETE their own comments, admins can delete any
CREATE POLICY "Can delete own comments"
  ON public.rota_assignment_comments
  FOR DELETE
  USING (
    -- Admin can delete anything
    EXISTS (
      SELECT 1 FROM public.users
      WHERE users.id = auth.uid() AND users.is_admin = true
    )
    OR
    -- Non-admins can only delete their own
    created_by = auth.uid()
  );

-- Trigger to auto-populate audit columns on INSERT
CREATE OR REPLACE FUNCTION set_comment_created_audit()
RETURNS TRIGGER AS $$
BEGIN
  NEW.created_by := auth.uid();
  NEW.updated_by := auth.uid();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_comment_insert BEFORE INSERT ON public.rota_assignment_comments
  FOR EACH ROW EXECUTE FUNCTION set_comment_created_audit();

-- Trigger to auto-populate updated_by and updated_at on UPDATE
CREATE OR REPLACE FUNCTION set_comment_updated_audit()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_by := auth.uid();
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_comment_update BEFORE UPDATE ON public.rota_assignment_comments
  FOR EACH ROW EXECUTE FUNCTION set_comment_updated_audit();
