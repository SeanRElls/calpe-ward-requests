-- =========================================================================
-- FIX: Allow editing existing shift requests without "Max 5 per week" error
-- =========================================================================
-- 
-- BUG: Users get "Max 5 requests per week" when trying to edit an existing
--      request (e.g., changing "O" to "W") because the count includes the
--      request being edited.
--
-- FIX: Exclude the current date when counting weekly requests
--
-- INSTRUCTIONS:
-- 1. Open Supabase Dashboard → SQL Editor
-- 2. Copy and paste this entire file
-- 3. Click "Run" or press Ctrl+Enter
-- =========================================================================

-- Drop the old functions first (required due to return type changes)
DROP FUNCTION IF EXISTS set_request_cell(uuid, text, date, text, integer);
DROP FUNCTION IF EXISTS admin_set_request_cell(uuid, text, uuid, date, text, integer);

-- =========================================================================
-- FUNCTION: set_request_cell
-- For regular users editing their own shift requests
-- =========================================================================
CREATE OR REPLACE FUNCTION set_request_cell(
  p_user_id UUID,
  p_pin TEXT,
  p_date DATE,
  p_value TEXT,
  p_important_rank INT DEFAULT NULL
) RETURNS TABLE(id UUID, user_id UUID, date DATE, value TEXT, important_rank INT) AS $$
DECLARE
  v_pin_hash TEXT;
  v_count INT;
  v_week_start DATE;
  v_week_end DATE;
BEGIN
  -- Verify PIN
  SELECT pin_hash INTO v_pin_hash FROM users WHERE users.id = p_user_id;
  IF v_pin_hash IS NULL OR v_pin_hash != crypt(p_pin, v_pin_hash) THEN
    RAISE EXCEPTION 'Invalid PIN';
  END IF;

  -- Calculate week boundaries (Sunday to Saturday)
  v_week_start := p_date - (EXTRACT(DOW FROM p_date)::INT);
  v_week_end := v_week_start + 6;

  -- ✅ FIX: Count requests THIS WEEK, EXCLUDING the current date being edited
  SELECT COUNT(*) INTO v_count
  FROM requests
  WHERE requests.user_id = p_user_id
    AND requests.date >= v_week_start
    AND requests.date <= v_week_end
    AND requests.date != p_date;  -- ← KEY FIX: exclude current date

  -- Only block if we're at 5 AND this is a NEW request (not an edit)
  IF v_count >= 5 AND NOT EXISTS (
    SELECT 1 FROM requests WHERE requests.user_id = p_user_id AND requests.date = p_date
  ) THEN
    RAISE EXCEPTION 'Max 5 requests per week';
  END IF;

  -- Upsert the request
  RETURN QUERY
  INSERT INTO requests (user_id, date, value, important_rank)
  VALUES (p_user_id, p_date, p_value, p_important_rank)
  ON CONFLICT (user_id, date) 
  DO UPDATE SET 
    value = EXCLUDED.value,
    important_rank = EXCLUDED.important_rank,
    updated_at = NOW()
  RETURNING requests.id, requests.user_id, requests.date, requests.value, requests.important_rank;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- =========================================================================
-- FUNCTION: admin_set_request_cell
-- For admins editing other users' shift requests
-- =========================================================================
CREATE OR REPLACE FUNCTION admin_set_request_cell(
  p_admin_id UUID,
  p_pin TEXT,
  p_target_user_id UUID,
  p_date DATE,
  p_value TEXT,
  p_important_rank INT DEFAULT NULL
) RETURNS TABLE(id UUID, user_id UUID, date DATE, value TEXT, important_rank INT) AS $$
DECLARE
  v_pin_hash TEXT;
  v_is_admin BOOLEAN;
  v_count INT;
  v_week_start DATE;
  v_week_end DATE;
BEGIN
  -- Verify admin PIN and status
  SELECT pin_hash, is_admin INTO v_pin_hash, v_is_admin 
  FROM users WHERE users.id = p_admin_id;
  
  IF v_pin_hash IS NULL OR v_pin_hash != crypt(p_pin, v_pin_hash) THEN
    RAISE EXCEPTION 'Invalid PIN';
  END IF;
  
  IF NOT v_is_admin THEN
    RAISE EXCEPTION 'Admin only';
  END IF;

  -- Calculate week boundaries (Sunday to Saturday)
  v_week_start := p_date - (EXTRACT(DOW FROM p_date)::INT);
  v_week_end := v_week_start + 6;

  -- ✅ FIX: Count requests THIS WEEK for target user, EXCLUDING the current date
  SELECT COUNT(*) INTO v_count
  FROM requests
  WHERE requests.user_id = p_target_user_id
    AND requests.date >= v_week_start
    AND requests.date <= v_week_end
    AND requests.date != p_date;  -- ← KEY FIX: exclude current date

  -- Only block if we're at 5 AND this is a NEW request (not an edit)
  IF v_count >= 5 AND NOT EXISTS (
    SELECT 1 FROM requests WHERE requests.user_id = p_target_user_id AND requests.date = p_date
  ) THEN
    RAISE EXCEPTION 'Max 5 requests per week';
  END IF;

  -- Upsert the request
  RETURN QUERY
  INSERT INTO requests (user_id, date, value, important_rank)
  VALUES (p_target_user_id, p_date, p_value, p_important_rank)
  ON CONFLICT (user_id, date) 
  DO UPDATE SET 
    value = EXCLUDED.value,
    important_rank = EXCLUDED.important_rank,
    updated_at = NOW()
  RETURNING requests.id, requests.user_id, requests.date, requests.value, requests.important_rank;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- =========================================================================
-- GRANT PERMISSIONS
-- Allow the functions to be called by authenticated and anonymous users
-- =========================================================================
GRANT EXECUTE ON FUNCTION set_request_cell(uuid, text, date, text, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION admin_set_request_cell(uuid, text, uuid, date, text, integer) TO authenticated;

-- Also grant to anon role (if your app uses it)
GRANT EXECUTE ON FUNCTION set_request_cell(uuid, text, date, text, integer) TO anon;
GRANT EXECUTE ON FUNCTION admin_set_request_cell(uuid, text, uuid, date, text, integer) TO anon;


-- =========================================================================
-- VERIFICATION
-- After running this, test by:
-- 1. Creating 5 shift requests for a week
-- 2. Try changing one of them (e.g., "O" → "W")
-- 3. It should now work without "Max 5 requests per week" error
-- =========================================================================
