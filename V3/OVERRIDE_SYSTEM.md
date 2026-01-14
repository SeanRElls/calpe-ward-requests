# Override & Comment System

## Overview
The override system allows admins to record when staff work different hours than their scheduled shift, and attach **admin-only internal notes** to shifts. This is essential for tracking actual hours worked vs scheduled hours.

**Important:** Override admin notes (red indicator) are separate from general comments (blue indicator, accessed via "View Comments" button). Admin notes are internal and only visible to admins.

## Use Case Example
Sean is scheduled for LD (Long Day: 08:00-20:30, 12.5 hours) on December 21st, but he actually leaves at 18:00.

**What happens:**
1. Admin clicks on Sean's cell showing "LD"
2. Published details modal shows: "LD Long Day, 08:00-20:30, 12.5 hours"
3. Admin clicks "Change Shift" 
4. Shift picker opens with LD selected and **auto-populated** with default times/hours
5. Admin adjusts override fields:
   - Start: 08:00 (unchanged)
   - End: 18:00 (changed from 20:30)
   - Hours: **10** (auto-calculated from time change)
   - Admin Note: "Left early due to illness" (internal only)
6. Saves

**Result:**
- Cell still displays "LD" with a **red dot indicator** (override exists)
- Published details now shows:
  - Scheduled: 08:00-20:30 (12.5 hours)
  - **Actual: 08:00-18:00 (10 hours)** (in red)
  - Red-bordered box: "Admin Note (internal): Left early due to illness"

## Database Schema

### `rota_assignment_overrides` Table
```sql
CREATE TABLE rota_assignment_overrides (
  id BIGSERIAL PRIMARY KEY,
  rota_assignment_id BIGINT NOT NULL UNIQUE,
  
  -- Override times (NULL = use shift defaults)
  override_start_time TIME,
  override_end_time TIME,
  override_hours NUMERIC(4,2),
  
  -- Admin-only internal note (NOT visible to staff)
  comment TEXT,
  
  -- Audit
  created_by UUID,
  created_at TIMESTAMPTZ,
  updated_by UUID,
  updated_at TIMESTAMPTZ
);
```

**Note:** Hours auto-calculate when start/end times are changed (rounded to nearest 0.25 hours).

## UI Components

### 1. Shift Picker Modal (Published Mode)
When editing published rotas, the shift picker includes:
 (auto-populated from shift default)
- End time input (auto-populated from shift default)
- Hours input (auto-populated from shift default)
- **Auto-calculation:** When start/end times change, hours auto-update (rounded to 0.25)
- "Clear Override" button

**Admin Note Section:**
- Textarea for internal admin notes (red label)
- **Visibility:** Admin-only, not visible to staff
- Helper text clarifies this is separate from general comments

These sections only display when `editMode === "published"`.

### 2. Cell Indicators
Cells with overrides show a badge in the top-right corner:
- **Red dot (6px):** Override exists (actual times/hours differ from scheduled)
- **Blue dot (6px):** General comments exist (accessed via "View Comments" button - not yet implemented)

**Note:** Admin notes do NOT show a separate indicator; they're included in the override indicator.

### 3. Published Details Modal
Enhanced to show:
- **Scheduled times:** Original shift metadata (always shown)
- **Actual times:** Override times in red if different (conditional)
- **Hours:** Override hours in red if different
- **Admin Note display:** Red-bordered box with internal note (admin-only, itional)
- **Hours:** Override hours in red if different
- **Comment display:** Blue-bordered box with comment text (conditional)

## Data Flow

### Loading
1. `loadPeriod()` fetches assignments
2. For each assignment, loads associated override from `overridesMap`
3. Renders cells with indicators if override/comment present

### Editing
1. User clicks "Change Shift" on published cell
2. `openShiftPicker()` detects `editMode === "published"`, shows override/comment sections
3. If override exists, fields pre-populate with existing values
4. User selects shift, fills override fields, adds comment
5. On save, `onSave(userId, date, shiftId, overrideData)` called
6. Override data saved to `rota_assignment_overrides` table
7. `overridesMap` updated locally
8. Grid re-renders with indicators

### Displaying
1.**Admin notes:** Admin-only (read and write)
- **General comments:** Separate feature (via "View Comments" button), visibility TBD

## How It Saves
When a shift card is clicked in the shift picker:
1. Collects values from override inputs (start, end, hours, admin note)
2. If ANY value is present, creates `overrideData` object
3. Calls `onSave(userId, date, shiftId, overrideData)`
4. Backend checks if override exists for this assignment
5. If exists: UPDATE with new values
6. If not: INSERT new override record
7. Local `overridesMap` updated
8. Grid re-renders with red dot indicator
2. `openPublishedDetails()` fetches override, displays both scheduled and actual
3. Red styling indicates overridden values

## Permissions
- Viewing overrides: `rota.view_published` or admin
- Editing overrides: `rota.edit_published` (via RLS policies)
- Comments visible to all with published view access

## Future Enhancements
- Audit trail integration: Log override changes to `rota_assignment_audits`
- Comment visibility flags: Public vs internal comments
- Bulk override: Apply same override to multiple cells
- Reporting: Hours variance reports (scheduled vs actual)
