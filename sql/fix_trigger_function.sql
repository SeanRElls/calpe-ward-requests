-- =========================================================================
-- FIX: Update trigger function to allow editing existing requests
-- =========================================================================
-- 
-- PROBLEM: The trg_max_5_requests trigger blocks edits when a user has 5 requests
--          because it fires BEFORE INSERT and doesn't distinguish between
--          new inserts and ON CONFLICT updates.
--
-- SOLUTION: Modify the trigger function to exclude the current date from the count
--           when checking the 5-request limit.
--
-- INSTRUCTIONS:
-- 1. Open Supabase Dashboard → SQL Editor
-- 2. Copy and paste this script
-- 3. Click "Run" or press Ctrl+Enter
-- =========================================================================

-- Drop and recreate the trigger function to handle edits correctly
CREATE OR REPLACE FUNCTION enforce_max_5_requests_per_week()
RETURNS TRIGGER AS $$
DECLARE
  v_count INT;
  v_week_start DATE;
  v_week_end DATE;
BEGIN
  -- Calculate week boundaries (Sunday to Saturday)
  v_week_start := NEW.date - (EXTRACT(DOW FROM NEW.date)::INT);
  v_week_end := v_week_start + 6;

  -- Count requests THIS WEEK for this user, EXCLUDING the current date
  -- This allows editing existing requests without hitting the limit
  SELECT COUNT(*) INTO v_count
  FROM requests
  WHERE user_id = NEW.user_id
    AND date >= v_week_start
    AND date <= v_week_end
    AND date != NEW.date;  -- Exclude current date to allow edits

  -- Only block if we're at 5 requests AND this is a new date (not an edit)
  IF v_count >= 5 THEN
    -- Check if this date already exists (i.e., this is an edit/update)
    IF NOT EXISTS (
      SELECT 1 FROM requests WHERE user_id = NEW.user_id AND date = NEW.date
    ) THEN
      -- This is a NEW request, and we're already at 5 - block it
      RAISE EXCEPTION 'Max 5 requests per week';
    END IF;
    -- If the date exists, this is an edit - allow it
  END IF;

  -- Allow the insert/update to proceed
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Note: The trigger 'trg_max_5_requests' is already attached to the requests table
-- This script only updates the function logic, the trigger remains active

-- =========================================================================
-- VERIFICATION
-- After running this, test by:
-- 1. User has 5 requests in a week
-- 2. Try editing one (change O → W)
-- 3. Should succeed
-- 4. Try adding a 6th request
-- 5. Should fail with "Max 5 requests per week"
-- =========================================================================
