// shift-editor.js
// Handles all rota editing UI and logic (draft, published, overrides)
// Author: Calpe Ward Dev Team
// Last updated: Jan 2026

// ========== STATE ==========
const ROLE_TO_STAFF_GROUP_EDIT = {
  1: "CN",
  2: "SN",
  3: "NA"
};

let isEditingUnlocked = false;
let draftShifts = [];
let editPermissionKey = "rota.edit_draft";
let editContextLabel = "draft rota";
let editMode = "draft"; // "draft" | "published"
let lockedLabel = "🔒 Locked";
let unlockedLabel = "🔓 Editing";
let shiftFilterFn = () => true; // defaults to all shifts
let pickerContext = null;
let pickerKeyHandler = null;
let pickerKeyBuffer = "";
let pickerKeyTimer = null;
let gridKeyHandler = null;
let focusedCell = null;
let lastFocusKey = null;
let gridCodeBuffer = "";
let gridCodeTimer = null;

// ========== INIT ==========
function initDraftEditing({
  onUnlock,
  onLock,
  onSave,
  onClear,
  onPublishedCellClick,
  getCurrentUser,
  getCurrentPeriod,
  getAllUsers,
  getDraftShifts,
  getAssignment,
  refreshGrid
}) {
  // Wrap callbacks to restore focus immediately after operations
  const restoreFocusAfterOp = () => {
    if (!lastFocusKey) return;
    requestAnimationFrame(() => {
      const cells = Array.from(document.querySelectorAll("#rota td.cell"));
      const cell = cells.find(c => `${c.dataset.userId}_${c.dataset.date}` === lastFocusKey);
      if (cell) {
        focusedCell = cell;
        cell.classList.add("focused");
      }
    });
  };

  const wrappedOnSave = async (userId, date, shiftId) => {
    await onSave(userId, date, shiftId);
    restoreFocusAfterOp();
  };

  const wrappedOnClear = async (userId, date) => {
    await onClear(userId, date);
    restoreFocusAfterOp();
  };
  // Bind unlock toggle
  const btn = document.getElementById("toggleEditingBtn");
  if (btn) {
    btn.addEventListener("click", () => {
      if (!window.PermissionsModule?.hasPermission(editPermissionKey)) {
        alert("You don't have permission to edit this rota.");
        return;
      }
      if (!isEditingUnlocked) {
        if (!confirm(`Editing enabled. Changes affect the ${editContextLabel}.`)) return;
        isEditingUnlocked = true;
        btn.textContent = unlockedLabel;
        btn.classList.add("primary");
        if (onUnlock) onUnlock();
      } else {
        isEditingUnlocked = false;
        btn.textContent = lockedLabel;
        btn.classList.remove("primary");
        if (onLock) onLock();
      }
      // Update cell editability
      document.querySelectorAll("#rota td.cell").forEach(td => {
        td.classList.toggle("editable", isEditingUnlocked);
      });
    });
  }

  // Picker modal events
  const closeBtn = document.getElementById("shiftPickerClose");
  if (closeBtn) closeBtn.addEventListener("click", closeShiftPicker);
  const clearBtn = document.getElementById("shiftPickerClear");
  if (clearBtn) clearBtn.addEventListener("click", clearShiftAssignment);

  // Cell click handler (delegated)
  const rotaTable = document.getElementById("rota");
  if (!rotaTable) return;

  rotaTable.addEventListener("click", e => {
    const td = e.target.closest("td.cell");
    if (!td) return;

    // Published flow: never open picker directly; route via host callback
    if (editMode === "published") {
      if (typeof onPublishedCellClick === "function") {
        onPublishedCellClick({ td, userId: td.dataset.userId, date: td.dataset.date, assignment: getAssignment(td.dataset.userId, td.dataset.date) });
      }
      return;
    }

    if (!isEditingUnlocked || !window.PermissionsModule?.hasPermission(editPermissionKey)) return;
    setFocusedCell(td);
    const userId = td.dataset.userId;
    const date = td.dataset.date;
    const assignment = getAssignment(userId, date);
    openShiftPicker(userId, date, assignment);
  });

  rotaTable.addEventListener("contextmenu", e => {
    const td = e.target.closest("td.cell");
    if (!td) return;
    if (editMode === "published" && typeof onPublishedCellClick === "function") {
      e.preventDefault();
      onPublishedCellClick({ td, userId: td.dataset.userId, date: td.dataset.date, assignment: getAssignment(td.dataset.userId, td.dataset.date) });
    }
  });

  // Global keyboard navigation for desktop (grid-level)
  detachGridKeys();
  gridKeyHandler = (e) => {
    // Ignore when picker is open or editing is locked
    const pickerVisible = document.getElementById("shiftPickerBackdrop")?.getAttribute("aria-hidden") === "false";
    if (editMode === "published") return; // no keyboard editing in published
    if (!isEditingUnlocked || pickerVisible || !window.PermissionsModule?.hasPermission(editPermissionKey)) return;

    // Skip when typing in form fields
    const target = e.target;
    const skipTags = ["INPUT", "TEXTAREA", "SELECT", "BUTTON"]; // buttons still handled via click
    if (skipTags.includes(target.tagName) || target.isContentEditable) return;

    const cells = Array.from(document.querySelectorAll("#rota td.cell"));
    if (!cells.length) return;

    // Restore focus to the last known cell if the DOM re-rendered
    if ((!focusedCell || !document.body.contains(focusedCell)) && lastFocusKey) {
      focusedCell = cells.find(c => `${c.dataset.userId}_${c.dataset.date}` === lastFocusKey) || null;
    }

    // If no focus yet, start at the first cell
    if (!focusedCell) {
      setFocusedCell(cells[0]);
    }

    const current = focusedCell;
    const userId = current?.dataset.userId;
    const date = current?.dataset.date;

    const moveFocus = (next) => {
      if (next) {
        setFocusedCell(next);
        next.scrollIntoView({ block: "nearest", inline: "nearest" });
      }
    };

    // Movement helpers by user/date grouping
    const rowCells = userId ? cells.filter(c => c.dataset.userId === userId) : cells;
    const colCells = date ? cells.filter(c => c.dataset.date === date) : cells;
    const idxRow = rowCells.indexOf(current);
    const idxCol = colCells.indexOf(current);

    switch (e.key) {
      case "ArrowRight":
        e.preventDefault();
        if (idxRow >= 0 && idxRow < rowCells.length - 1) moveFocus(rowCells[idxRow + 1]);
        break;
      case "ArrowLeft":
        e.preventDefault();
        if (idxRow > 0) moveFocus(rowCells[idxRow - 1]);
        break;
      case "ArrowDown":
        e.preventDefault();
        if (idxCol >= 0 && idxCol < colCells.length - 1) moveFocus(colCells[idxCol + 1]);
        break;
      case "ArrowUp":
        e.preventDefault();
        if (idxCol > 0) moveFocus(colCells[idxCol - 1]);
        break;
      case "Enter":
      case " ": // Space
        e.preventDefault();
        if (!current) return;
        const assignment = getAssignment(userId, date);
        openShiftPicker(userId, date, assignment);
        break;
      case "Backspace":
      case "Delete":
        if (!current) return;
        e.preventDefault();
        wrappedOnClear(userId, date);
        break;
      default: {
        // Direct code entry on grid (no Enter needed). Buffer per grid.
        const allowed = /^[a-zA-Z0-9*\-]$/;
        if (!allowed.test(e.key)) break;
        e.preventDefault();

        const shifts = (getDraftShifts() || []).filter(shiftFilterFn);
        const codeList = shifts.map(s => (s.code || "").toUpperCase());

        const applyResolution = (resolution) => {
          if (!resolution || resolution.ambiguous) return false;
          wrappedOnSave(userId, date, resolution.id);
          gridCodeBuffer = "";
          return true;
        };

        const tryResolve = (force) => {
          if (!gridCodeBuffer) return false;

          // Special O cycle: O (ID 7) ↔ O* (ID 23)
          if (gridCodeBuffer === "O") {
            const currentAssignment = getAssignment(userId, date);
            const normalO = shifts.find(s => s.id === 7);
            const redO = shifts.find(s => s.id === 23);
            
            if (currentAssignment) {
              const currentShiftId = currentAssignment.shift_id;
              
              if (currentShiftId === 7 && redO) {
                // O is assigned, cycle to O*
                applyResolution(redO);
                return true;
              } else if (currentShiftId === 23 && normalO) {
                // O* is assigned, cycle back to O
                applyResolution(normalO);
                return true;
              }
            }
            
            // No current assignment or different shift - apply normal O first
            if (normalO) {
              applyResolution(normalO);
              return true;
            }
          }

          const resolution = resolveShiftByCode(gridCodeBuffer, userId, shifts);
          if (!resolution) return false;
          if (resolution.ambiguous) {
            if (force) {
              const assignmentAmb = getAssignment(userId, date);
              openShiftPicker(userId, date, assignmentAmb);
            }
            return false;
          }
          return applyResolution(resolution);
        };

        // Append to buffer and schedule resolution
        gridCodeBuffer += e.key.toUpperCase();
        if (gridCodeTimer) clearTimeout(gridCodeTimer);
        gridCodeTimer = setTimeout(() => {
          tryResolve(true);
          gridCodeBuffer = "";
        }, 800);

        // Immediate resolution only if no longer codes share the prefix
        const hasLongerPrefix = codeList.some(c => c.startsWith(gridCodeBuffer) && c.length > gridCodeBuffer.length);
        if (!hasLongerPrefix) {
          tryResolve(false);
        }
        break;
      }
    }
  };
  document.addEventListener("keydown", gridKeyHandler);

  // Helper to open picker
  function openShiftPicker(userId, date, currentAssignment) {
    pickerContext = { userId, date, currentAssignment };
    const backdrop = document.getElementById("shiftPickerBackdrop");
    const modal = document.getElementById("shiftPickerModal");
    const title = document.getElementById("shiftPickerTitle");
    const dateLabel = document.getElementById("shiftPickerDate");
    const list = document.getElementById("shiftPickerList");
    const user = getAllUsers().find(u => u.id === userId);
    const dateObj = new Date(date);
    title.textContent = user ? user.name : "Select Shift";
    dateLabel.textContent = dateObj.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric" });
    
    // Populate shift options
    list.innerHTML = "";
    list.className = "shift-picker-list";
    const shifts = (getDraftShifts() || []).filter(shiftFilterFn);
    console.log("[SHIFT PICKER] getDraftShifts() returned:", shifts);
    
    if (!shifts || shifts.length === 0) {
      list.innerHTML = `<div style="padding:12px; text-align:center; color:#999;">No shifts available.</div>`;
      backdrop.setAttribute("aria-hidden", "false");
      return;
    }
    
    shifts.forEach(shift => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "shift-card";
      btn.dataset.shiftId = shift.id;

      // Display only the code; details stay in hover
      const codeEl = document.createElement("div");
      codeEl.className = "shift-code";
      codeEl.textContent = shift.code || "Shift";

      // Apply styling from shift definitions
      if (shift.fill_color) btn.style.setProperty("--shift-fill", shift.fill_color);
      if (shift.text_color) btn.style.setProperty("--shift-text", shift.text_color);
      if (shift.fill_color) btn.style.setProperty("--shift-border", shift.fill_color);
      if (shift.text_bold) btn.classList.add("is-bold");
      if (shift.text_italic) btn.classList.add("is-italic");
      if (shift.code && shift.code.trim().toUpperCase() === "O*") btn.classList.add("off");

      // Tooltip for fuller context
      const staffGroups = (shift.allowed_staff_groups || "").split(",").map(g => g.trim()).filter(Boolean).join(", ") || "None";
      const times = shift.start_time && shift.end_time ? `${shift.start_time} to ${shift.end_time}` : "No set times";
      const hours = shift.hours_value ? `${shift.hours_value}h` : "?h";
      const label = shift.label ? ` ${shift.label}` : "";
      const tooltip = `${shift.code}${label}\n${times}\n${hours}\nStaff: ${staffGroups}`;
      btn.title = tooltip.trim();

      if (currentAssignment && currentAssignment.shift_id === shift.id) {
        btn.classList.add("selected");
      }
      btn.addEventListener("click", () => {
        if (onSave) onSave(userId, date, shift.id);
        closeShiftPicker();
      });

      btn.appendChild(codeEl);
      list.appendChild(btn);
    });

    // Add clear option (matches request picker affordance)
    const clearBtnCard = document.createElement("button");
    clearBtnCard.type = "button";
    clearBtnCard.className = "shift-card clear";
    clearBtnCard.textContent = "Clear";
    clearBtnCard.title = "Remove the assigned shift";
    clearBtnCard.addEventListener("click", () => {
      if (onClear) onClear(userId, date);
      closeShiftPicker();
    });
    list.appendChild(clearBtnCard);
    backdrop.setAttribute("aria-hidden", "false");

    // Keyboard shorthand: type codes like N / LD / 8-8 to select, Backspace clears
    detachPickerKeys();
    pickerKeyBuffer = "";
    pickerKeyHandler = (e) => {
      const backdrop = document.getElementById("shiftPickerBackdrop");
      if (backdrop.getAttribute("aria-hidden") !== "false") return;
      if (["Meta", "Control", "Alt"].includes(e.key)) return;

      // Escape closes
      if (e.key === "Escape") {
        closeShiftPicker();
        return;
      }

      // Backspace: if buffer empty, clear assignment
      if (e.key === "Backspace") {
        if (!pickerKeyBuffer) {
          e.preventDefault();
          if (onClear) onClear(userId, date);
          closeShiftPicker();
          return;
        }
        pickerKeyBuffer = pickerKeyBuffer.slice(0, -1);
        return;
      }

      const allowed = /^[a-zA-Z0-9*\-]$/;
      if (!allowed.test(e.key)) return;

      pickerKeyBuffer += e.key.toUpperCase();
      if (pickerKeyTimer) clearTimeout(pickerKeyTimer);
      pickerKeyTimer = setTimeout(() => { pickerKeyBuffer = ""; }, 1200);

      const resolution = resolveShiftByCode(pickerKeyBuffer, userId, shifts);
      if (!resolution) return;

      if (resolution.ambiguous) {
        alert(`Shift code "${pickerKeyBuffer}" is ambiguous. Please pick manually.`);
        return;
      }

      if (onSave) onSave(userId, date, resolution.id);
      closeShiftPicker();
    };
    document.addEventListener("keydown", pickerKeyHandler);
  }

  // Expose picker opener for published Change Shift flow (uses closures above)
  window.openShiftPickerForPublished = function(userId, date) {
    if (!window.PermissionsModule?.hasPermission(editPermissionKey)) {
      alert("You don't have permission to edit this rota.");
      return;
    }

    const assignment = getAssignment(userId, date);
    // Temporarily mark unlocked for the action to reuse picker UI
    isEditingUnlocked = true;
    const btn = document.getElementById("toggleEditingBtn");
    if (btn) {
      btn.textContent = unlockedLabel;
      btn.classList.add("primary");
    }
    document.querySelectorAll("#rota td.cell").forEach(td => td.classList.toggle("editable", isEditingUnlocked));
    openShiftPicker(userId, date, assignment);
  };

  function closeShiftPicker() {
    const backdrop = document.getElementById("shiftPickerBackdrop");
    if (backdrop) backdrop.setAttribute("aria-hidden", "true");
    pickerContext = null;
    detachPickerKeys();
  }

  function clearShiftAssignment() {
    if (!pickerContext) return;
    const { userId, date, currentAssignment } = pickerContext;
    if (!currentAssignment) {
      closeShiftPicker();
      return;
    }
    if (onClear) onClear(userId, date);
    closeShiftPicker();
  }

  function resolveShiftByCode(code, userId, shifts) {
    const norm = (code || "").trim().toUpperCase();
    if (!norm) return null;

    const user = getAllUsers().find(u => u.id === userId);
    let staffGroup = ROLE_TO_STAFF_GROUP_EDIT[user?.role_id] || null;
    if (user?.name && user.name.toLowerCase().includes("paul boso")) {
      staffGroup = "SN"; // Exception: treat Paul Boso as SN for N code resolution
    }

    const matches = (shifts || []).filter(s => (s.code || "").toUpperCase() === norm);
    if (matches.length === 0) return null;
    if (matches.length === 1) return matches[0];

    // Disambiguate by staff group when possible
    if (staffGroup) {
      const filtered = matches.filter(s => {
        const allowed = (s.allowed_staff_groups || "").toUpperCase().split(",").map(x => x.trim()).filter(Boolean);
        return allowed.includes(staffGroup);
      });
      if (filtered.length === 1) return filtered[0];

      // Heuristic: choose hours by band (CN/SN -> max hours e.g., 12.5; NA -> min hours e.g., 12)
      if (filtered.length > 1) {
        if (staffGroup === "CN" || staffGroup === "SN") {
          const maxHours = Math.max(...filtered.map(s => Number(s.hours_value) || 0));
          const top = filtered.filter(s => (Number(s.hours_value) || 0) === maxHours);
          if (top.length === 1) return top[0];
        } else if (staffGroup === "NA") {
          const minHours = Math.min(...filtered.map(s => Number(s.hours_value) || 999));
          const low = filtered.filter(s => (Number(s.hours_value) || 999) === minHours);
          if (low.length === 1) return low[0];
        }
      }
    }

    return { ambiguous: true };
  }

  function detachPickerKeys() {
    if (pickerKeyTimer) {
      clearTimeout(pickerKeyTimer);
      pickerKeyTimer = null;
    }
    pickerKeyBuffer = "";
    if (pickerKeyHandler) {
      document.removeEventListener("keydown", pickerKeyHandler);
      pickerKeyHandler = null;
    }
  }

  function detachGridKeys() {
    if (gridKeyHandler) {
      document.removeEventListener("keydown", gridKeyHandler);
      gridKeyHandler = null;
    }
    if (gridCodeTimer) {
      clearTimeout(gridCodeTimer);
      gridCodeTimer = null;
    }
    gridCodeBuffer = "";
  }

  function setFocusedCell(td) {
    if (focusedCell === td) return;
    if (focusedCell) focusedCell.classList.remove("focused");
    focusedCell = td;
    lastFocusKey = td ? `${td.dataset.userId}_${td.dataset.date}` : null;
    if (focusedCell) focusedCell.classList.add("focused");
  }
}

// Expose init for inline boot in rota.html
window.initDraftEditing = initDraftEditing;
window.setShiftEditContext = function({
  permissionKey = "rota.edit_draft",
  contextLabel = "draft rota",
  mode = "draft",
  lockedLabelText = "🔒 Locked",
  unlockedLabelText = "🔓 Editing",
  shiftFilter = null
} = {}) {
  editPermissionKey = permissionKey;
  editContextLabel = contextLabel;
  editMode = mode === "published" ? "published" : "draft";
  lockedLabel = lockedLabelText;
  unlockedLabel = unlockedLabelText;
  shiftFilterFn = typeof shiftFilter === "function" ? shiftFilter : () => true;

  // Reset button label to locked state (state remains until resetEditingLock invoked)
  const btn = document.getElementById("toggleEditingBtn");
  if (btn) btn.textContent = lockedLabel;
};

window.resetEditingLock = function() {
  isEditingUnlocked = false;
  const btn = document.getElementById("toggleEditingBtn");
  if (btn) {
    btn.textContent = lockedLabel;
    btn.classList.remove("primary");
  }
  document.querySelectorAll("#rota td.cell").forEach(td => td.classList.toggle("editable", isEditingUnlocked));
};

