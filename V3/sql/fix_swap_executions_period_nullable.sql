-- Make period_id and week_id columns nullable in swap tables
-- We now use dates to track swaps instead of period_id/week_id
ALTER TABLE swap_executions 
  ALTER COLUMN period_id DROP NOT NULL,
  ALTER COLUMN initiator_week_id DROP NOT NULL,
  ALTER COLUMN counterparty_week_id DROP NOT NULL;

-- Also make swap_requests period_id and week_id columns nullable
ALTER TABLE swap_requests 
  ALTER COLUMN period_id DROP NOT NULL,
  ALTER COLUMN initiator_week_id DROP NOT NULL,
  ALTER COLUMN counterparty_week_id DROP NOT NULL;
