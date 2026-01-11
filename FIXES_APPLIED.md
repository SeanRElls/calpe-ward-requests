# Fixes Applied - January 2026

This document summarizes the bug fixes applied to the Calpe Ward Requests application.

---

## Fix #1: Missing Script Tags in index.html

### Problem
The index.html file was missing script tags to load the external JavaScript files, causing "No API key found" errors.

### What Was Missing
```html
<!-- These were missing before </body> -->
<script src="js/config.js"></script>
<script src="js/app.js"></script>
```

### Solution Applied
Added the two script tags just before the closing `</body>` tag at lines 7404-7408.

**File Modified**: `index.html`

**Changes**:
```diff
   </script>
+  
+  <!-- Config MUST come before app.js -->
+  <script src="js/config.js"></script>
+  
+  <!-- Main app logic -->
+  <script src="js/app.js"></script>
 </body>
 </html>
```

### Status
✅ **COMPLETED** - Committed and pushed

---

## Fix #2: "Max 5 Requests Per Week" Error When Editing

### Problem
Users with 5 shift requests in a week couldn't edit existing requests. For example:
- User has requests: O, O, L, N, W (5 total)
- User tries to change "O" → "W"
- Error: "Max 5 requests per week"
- Expected: Change should succeed (still 5 requests, just different value)

### Root Cause
The Supabase database functions `set_request_cell` and `admin_set_request_cell` were:
1. Counting ALL requests in the week (including the one being edited)
2. Not differentiating between "add new" vs "edit existing"

So when counting, it would see: 5 existing + 1 (the edit) = 6 → Error!

### Solution Applied
Modified the SQL functions to:

**1. Exclude the current date when counting:**
```sql
-- Before (wrong)
SELECT COUNT(*) INTO v_count
FROM requests
WHERE requests.user_id = p_user_id
  AND requests.date >= v_week_start
  AND requests.date <= v_week_end;

-- After (correct)
SELECT COUNT(*) INTO v_count
FROM requests
WHERE requests.user_id = p_user_id
  AND requests.date >= v_week_start
  AND requests.date <= v_week_end
  AND requests.date != p_date;  -- ✅ Exclude the date being edited
```

**2. Check if it's an edit vs a new request:**
```sql
-- Only block if count >= 5 AND this is a NEW request (not an edit)
IF v_count >= 5 AND NOT EXISTS (
  SELECT 1 FROM requests WHERE requests.user_id = p_user_id AND requests.date = p_date
) THEN
  RAISE EXCEPTION 'Max 5 requests per week';
END IF;
```

### Files Added
- `sql/fix_request_edit_bug.sql` - Complete SQL migration script
- `sql/README.md` - Documentation and testing instructions

### Status
⚠️ **REQUIRES DATABASE ADMIN** - SQL script must be run in Supabase

**Next Steps for Database Admin**:
1. Open Supabase Dashboard → SQL Editor
2. Open file: `sql/fix_request_edit_bug.sql`
3. Copy entire contents
4. Paste into SQL Editor
5. Click "Run" or press Ctrl+Enter
6. Verify success message
7. Test by editing an existing request

---

## Testing Checklist

After applying both fixes:

### Fix #1 Testing (Script Tags)
- [ ] Open application in browser
- [ ] Check browser console (F12)
- [ ] Verify no "No API key found" errors
- [ ] Verify Supabase client initializes
- [ ] Verify login works

### Fix #2 Testing (Request Editing)
- [ ] Log in as a regular user
- [ ] Create 5 shift requests for the same week
- [ ] Try to edit one of them (e.g., change "O" to "W")
- [ ] Verify the change succeeds without error
- [ ] Try to add a 6th request to the same week
- [ ] Verify it blocks with "Max 5 requests per week"
- [ ] Log in as admin
- [ ] Edit another user's request (5 requests scenario)
- [ ] Verify admin can edit without errors

---

## Summary

| Fix | Status | Action Required |
|-----|--------|-----------------|
| Script tags in index.html | ✅ Complete | None - already deployed |
| SQL function fix | ⚠️ Pending | Database admin must run SQL script |

---

## Questions?

If you encounter any issues:
1. Check the browser console (F12) for JavaScript errors
2. Check Supabase logs for database errors
3. Refer to `sql/README.md` for detailed SQL fix instructions
