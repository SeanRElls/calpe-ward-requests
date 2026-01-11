# SQL Database Fixes

This directory contains SQL scripts to fix database-side issues in the Calpe Ward Requests application.

## fix_request_edit_bug.sql

**Problem**: Users get "Max 5 requests per week" error when trying to edit an existing shift request.

**Symptoms**:
- User has 5 shift requests for a week
- User tries to change one (e.g., "O" → "W")
- Gets error: "Max 5 requests per week"
- The edit should be allowed since they're not adding a new request

**Root Cause**:
The Supabase RPC functions `set_request_cell` and `admin_set_request_cell` were counting ALL requests in the week, including the one being edited. This caused false positives for the 5-request limit.

**Fix**:
Modified the COUNT query to exclude the current date:
```sql
AND requests.date != p_date;  -- Exclude the date being edited
```

Added additional check to differentiate between new requests and edits:
```sql
IF v_count >= 5 AND NOT EXISTS (
  SELECT 1 FROM requests WHERE requests.user_id = p_user_id AND requests.date = p_date
) THEN
  RAISE EXCEPTION 'Max 5 requests per week';
END IF;
```

Changed return table column names to avoid ambiguity:
```sql
RETURNS TABLE(out_id UUID, out_user_id UUID, out_date DATE, out_value TEXT, out_important_rank INT)
```
This prevents "column reference is ambiguous" errors when PostgreSQL resolves column names.

**How to Apply**:
1. Open your Supabase Dashboard
2. Navigate to SQL Editor
3. Copy the entire contents of `fix_request_edit_bug.sql`
4. Paste into the SQL Editor
5. Click "Run" or press Ctrl+Enter
6. Verify the functions were created successfully

**Testing**:
1. Log in as a user
2. Create 5 shift requests for a week
3. Try changing one of them (e.g., "O" → "W")
4. The change should succeed without error
5. Try adding a 6th request to the same week
6. Should get "Max 5 requests per week" error (correct behavior)

**Note**: This fix requires database access and must be applied by someone with Supabase admin privileges.
