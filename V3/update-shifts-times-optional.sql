-- Make start_time and end_time optional for shifts that don't have specific times
ALTER TABLE shifts 
  ALTER COLUMN start_time DROP NOT NULL,
  ALTER COLUMN end_time DROP NOT NULL,
  ALTER COLUMN hours_value SET DEFAULT 0;

-- Update Off shift to have NULL times instead of 00:00:00
UPDATE shifts 
SET start_time = NULL, end_time = NULL 
WHERE code = 'O';

-- Update the unique constraint to not include times
ALTER TABLE shifts DROP CONSTRAINT IF EXISTS shifts_code_hours_value_start_time_end_time_allowed_staff_g_key;
ALTER TABLE shifts DROP CONSTRAINT IF EXISTS shifts_code_hours_allowed_groups_unique;
ALTER TABLE shifts ADD CONSTRAINT shifts_code_hours_allowed_groups_unique UNIQUE (code, hours_value, allowed_staff_groups);
