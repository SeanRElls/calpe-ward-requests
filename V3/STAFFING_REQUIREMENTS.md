# Staffing Requirements Implementation Summary

## Overview
Added staffing requirements tracking to the draft rota system with visual shortage indicators and admin management interface.

## Components Implemented

### 1. Database Table: `staffing_requirements` 
**File:** `sql/create_staffing_requirements.sql`

- **Columns:**
  - `id`: Primary key
  - `period_id`: References rota_periods
  - `date`: The date for this requirement
  - `day_sn_required`: Required Staff Nurses + Charge Nurses for day shift (default: 3.0)
  - `day_na_required`: Required Nursing Assistants for day shift (default: 3.0)
  - `night_sn_required`: Required Staff Nurses + Charge Nurses for night shift (default: 2.0)
  - `night_na_required`: Required Nursing Assistants for night shift (default: 2.0)
  - `created_at`, `updated_at`: Timestamps
  - Unique constraint on (period_id, date)

- **Security:** RLS policies ensure only admins can modify, all authenticated users can read

### 2. Rota Display: Totals Section
**File:** `rota.html`

**New global variable:**
- `staffingRequirements`: Map of date → requirements row

**New functions:**
- `getShiftValue(shiftCode)`: Calculates shift contribution using the formula:
  - **Full shifts (1.0):** LD, 8-8, N
  - **Half shifts (0.5):** 8-5, 11-20
  
- `isNightShift(shiftCode)`: Determines if shift is night shift (N)

- `renderTotals()`: 
  - Renders two sections: Day Shift and Night Shift
  - Each section has two rows: Staff Nurse (SN+CN combined) and Nursing Assistant
  - Calculates totals for each date and role combination
  - Loads required staffing levels from `staffingRequirements` map
  - **Highlights cells in orange** when actual staffing < required
  - Shows values formatted to 1 decimal place

**Updated `loadPeriod()` function:**
- Now loads `staffing_requirements` from database for the current period
- Populates the `staffingRequirements` map
- Calls `renderTotals()` after rendering the main rota

**Styling:** `css/rota.css`
- `.totals-separator`: Gray divider line above totals
- `.totals-section-row`: Section headers (Day Shift, Night Shift)
- `.totals-row`: Individual total rows
- `.totals-cell`: Center-aligned cells with shorthand for orange highlighting

### 3. Admin Interface: Staffing Requirements Manager
**File:** `admin.html`
- Added new navigation link: "Staffing Requirements"
- Added new section with:
  - Period selector dropdown
  - Table displaying each date in the period with editable required values
  - Default values: Day SN/CN=3, Day NA=3, Night SN/CN=2, Night NA=2
  - Save button per date to persist changes

**File:** `js/staffing-requirements.js`
- Standalone module loaded in admin.html
- Handles:
  - Loading periods from `rota_periods`
  - Loading existing requirements from `staffing_requirements`
  - Rendering editable table (number inputs for each field)
  - Saving/updating requirements per date
  - Creates records with defaults if not found

## How It Works

### In Draft Rota View:
1. User loads a period in `rota.html`
2. System loads staffing requirements for that period
3. After rendering user rows, totals section appears with:
   - Day Shift section showing SN/CN and NA counts
   - Night Shift section showing SN/CN and NA counts
4. Each cell shows the total count using the formula
5. Cells turn **orange** when actual count is less than required

### In Admin Panel:
1. Click "Staffing Requirements" in sidebar
2. Select a period from dropdown
3. Table shows all dates with editable required values
4. Modify any value and click "Save"
5. Changes immediately reflect in draft rota view

## Formula Implementation
```
Full shifts (= 1.0):  LD, 8-8, N
Half shifts (= 0.5):  8-5, 11-20
```

Example:
- 2 staff on LD + 1 on 8-5 = 2 + 0.5 = 2.5 staff
- If required is 3, cell shows "2.5" in **orange**

## Notes
- CN (Charge Nurse) and SN (Staff Nurse) are counted together in staffing totals
- NA (Nursing Assistant) is counted separately
- Defaults (3, 3, 2, 2) can be overridden per date
- Requirements are period-specific, not global
- All changes are immediately visible in the rota view (via `renderTotals()` call in `loadPeriod()`)
