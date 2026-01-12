# IMPORTANT: Apply Both SQL Fixes

The "Max 5 requests per week" error when editing is caused by TWO issues that both need to be fixed:

## Issue 1: RPC Functions (FIXED in fix_request_edit_bug.sql)
The RPC functions (`set_request_cell` and `admin_set_request_cell`) were counting the request being edited.

## Issue 2: Database Trigger (NEW - fix_trigger_function.sql)
The database has a trigger `trg_max_5_requests` that fires BEFORE INSERT and also counts the request being edited. This trigger blocks the upsert operation before our RPC function logic even runs.

## SOLUTION: Apply BOTH Fixes

You must run both SQL scripts in order:

### Step 1: Fix the Trigger Function
```sql
-- Run this FIRST
-- File: sql/fix_trigger_function.sql
```

1. Open Supabase Dashboard → SQL Editor
2. Copy contents of `sql/fix_trigger_function.sql`
3. Paste and run
4. Verify success

### Step 2: Fix the RPC Functions
```sql
-- Run this SECOND
-- File: sql/fix_request_edit_bug.sql
```

1. Open Supabase Dashboard → SQL Editor
2. Copy contents of `sql/fix_request_edit_bug.sql`
3. Paste and run
4. Verify success

## Why Both Are Needed

The trigger runs **first** (BEFORE INSERT), so even though our RPC functions handle edits correctly, the trigger was blocking them. Both need to be fixed for editing to work.

## Testing

After applying both fixes:

1. ✅ User with 5 requests can edit one (change O → W)
2. ✅ User with 5 requests blocked from adding 6th
3. ✅ Admin can edit any user's requests
4. ✅ Priority requests (O¹, O²) work correctly
