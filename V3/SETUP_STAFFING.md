# Setup Instructions for Staffing Requirements

## Step 1: Create the Table in Supabase

1. Go to Supabase Dashboard
2. Navigate to SQL Editor
3. Open and run the SQL file: `sql/create_staffing_requirements.sql`
4. This will:
   - Create the `staffing_requirements` table
   - Set up RLS policies
   - Create indexes for performance
   - Create triggers for `updated_at` timestamps

## Step 2: Verify Files Are in Place

Check that these files exist:
- ✅ `rota.html` (updated with staffing requirements loading and renderTotals)
- ✅ `admin.html` (updated with staffing requirements section)
- ✅ `css/rota.css` (updated with totals styling)
- ✅ `js/staffing-requirements.js` (new file for admin UI)
- ✅ `sql/create_staffing_requirements.sql` (SQL for database setup)

## Step 3: Test the Feature

### In Draft Rota (rota.html):
1. Go to rota view (or navigate to rota.html)
2. Scroll down past user rows
3. You should see "Day Shift" and "Night Shift" sections with:
   - Staff Nurse row
   - Nursing Assistant row
4. Each date column shows totals (will be 0 initially)
5. Cells that are short-staffed appear in **orange**

### In Admin Panel (admin.html):
1. Click "Staffing Requirements" in left sidebar
2. Select a period from the dropdown
3. See a table with all dates and editable required values
4. Modify the numbers and click "Save"
5. After saving, go back to rota.html and refresh to see the totals update

## Step 4: Default Values

The system will use these defaults if no record exists:
- Day SN/CN Required: **3.0**
- Day NA Required: **3.0**
- Night SN/CN Required: **2.0**
- Night NA Required: **2.0**

Change these in `js/staffing-requirements.js` if needed (lines with `|| 3`, `|| 2`).

## Shift Counting Formula

The following shifts count toward totals:

**Day Shift Full (1.0):**
- LD (Late Day)
- 8-8

**Day Shift Half (0.5):**
- 8-5
- 11-20

**Night Shift Full (1.0):**
- N (Night)

Examples:
- 2 staff on LD + 1 on 8-5 = 2 + 0.5 = **2.5 total**
- 3 staff on N = **3.0 total**

## Troubleshooting

**Totals don't show:**
- Check that `staffing_requirements` table was created
- Open browser console (F12) and look for errors
- Verify RLS policies are enabled on the table

**Can't save in admin:**
- Ensure logged-in user is an admin
- Check Supabase dashboard for table write permissions

**Orange highlighting not showing:**
- Clear browser cache (Ctrl+Shift+Delete)
- Refresh the page
- Check CSS loaded in `css/rota.css`

## Notes

- The staffing requirements are **per-period**, not global
- Each date can have different requirements
- Changes are saved immediately to Supabase
- The orange highlighting updates in real-time when shifts are assigned/removed
- Charge Nurses and Staff Nurses are always counted together
- Nursing Assistants are separate
