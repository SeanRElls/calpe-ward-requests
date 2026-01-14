-- Notifications table (separate from notices)
-- Supports action types: ack (for FYI), accept/decline/ignore (for actionable items)
-- No expiry; items remain pending until acted on.

CREATE TABLE IF NOT EXISTS public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type text NOT NULL,
  payload jsonb DEFAULT '{}'::jsonb,
  target_scope text NOT NULL CHECK (target_scope IN ('all_staff','role','user')),
  target_role_ids int[] DEFAULT NULL,
  target_user_id uuid DEFAULT NULL,
  requires_action boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','ack','accepted','declined','ignored')),
  created_by uuid DEFAULT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid DEFAULT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  acted_by uuid DEFAULT NULL,
  acted_at timestamptz DEFAULT NULL
);

COMMENT ON TABLE public.notifications IS 'System notifications (separate from notices) shown in bell feed.';
COMMENT ON COLUMN public.notifications.type IS 'Logical type, e.g. swap_request, swap_response, override_change, rota_published, comment_tag.';
COMMENT ON COLUMN public.notifications.payload IS 'Type-specific data (JSON).';
COMMENT ON COLUMN public.notifications.target_scope IS 'all_staff, role, or user.';
COMMENT ON COLUMN public.notifications.requires_action IS 'If true, show action buttons (accept/decline/ignore); if false, allow ack/ignore.';
COMMENT ON COLUMN public.notifications.status IS 'pending, ack, accepted, declined, ignored.';

-- Helpful indexes
CREATE INDEX IF NOT EXISTS notifications_target_user_idx ON public.notifications (target_user_id) WHERE target_scope = 'user';
CREATE INDEX IF NOT EXISTS notifications_target_role_idx ON public.notifications USING GIN (target_role_ids) WHERE target_scope = 'role';
CREATE INDEX IF NOT EXISTS notifications_pending_idx ON public.notifications (status) WHERE status = 'pending';

-- Trigger to maintain updated_at
CREATE OR REPLACE FUNCTION public.notifications_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_notifications_set_updated_at ON public.notifications;
CREATE TRIGGER trg_notifications_set_updated_at
BEFORE UPDATE ON public.notifications
FOR EACH ROW EXECUTE FUNCTION public.notifications_set_updated_at();
