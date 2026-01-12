/* =========================================================
   SHIFT CATALOGUE - ENHANCED FUNCTIONALITY
   ========================================================= */

// Permissions state
let userPermissions = new Set();

// Load user permissions from database
async function loadUserPermissions(){
  userPermissions = new Set();
  if (!currentUser) return;
  if (currentUser.is_admin) return;

  try {
    const { data: groups, error: gErr } = await supabaseClient
      .from("user_permission_groups")
      .select("group_id")
      .eq("user_id", currentUser.id);
    if (gErr) throw gErr;
    const groupIds = (groups || []).map(g => g.group_id).filter(Boolean);
    if (!groupIds.length) return;

    const { data: perms, error: pErr } = await supabaseClient
      .from("permission_group_permissions")
      .select("permission_key")
      .in("group_id", groupIds);
    if (pErr) throw pErr;
    (perms || []).forEach(p => userPermissions.add(p.permission_key));
  } catch (e) {
    console.warn("Failed to load permissions", e);
  }
}

// Check if user has a specific permission
function hasPermission(key){
  if (!currentUser) return false;
  if (currentUser.is_admin) return true;
  return userPermissions.has(key);
}

// Navigate to Full Admin page
function goToFullAdmin() {
  console.log("[DEBUG] goToFullAdmin called");
  if (!currentUser) {
    alert("Not logged in.");
    return;
  }
  const pin = sessionStorage.getItem(`calpeward.pin.${currentUser.id}`);
  if (!pin) {
    alert("No session PIN. Log in again.");
    return;
  }
  console.log("[DEBUG] Storing session and navigating to admin.html");
  const sessionData = { userId: currentUser.id, pin: pin };
  window.name = "calpeward:" + btoa(JSON.stringify(sessionData));
  window.location.href = "admin.html";
}

// Dynamically populate shift picker from database (NEW SCHEMA)
async function populateShiftGrid(){
  try {
    console.log("[SHIFT PICKER] Loading shifts from database...");
    console.log("[SHIFT PICKER] Current user:", currentUser);
    
    // Get shifts with scope flags and allowed_staff_groups
    const { data: shifts, error: shiftsErr } = await supabaseClient
      .from("shifts")
      .select("id, code, label, hours_value, allowed_staff_groups, start_time, end_time")
      .eq("allow_requests", true)
      .order("code", { ascending: true })
      .order("hours_value", { ascending: true });
    
    if (shiftsErr) throw shiftsErr;
    
    console.log("[SHIFT PICKER] Raw shifts from database:", shifts);
    
    // Filter by current user's staff_group (admin sees all)
    let requestShifts = shifts || [];
    if (currentUser && !currentUser.is_admin) {
      const userGroup = currentUser.staff_group; // e.g., "NA" or "Nurse"
      console.log("[SHIFT PICKER] User staff_group:", userGroup);
      
      if (userGroup) {
        requestShifts = requestShifts.filter(shift => {
          const allowed = shift.allowed_staff_groups || "";
          const matches = allowed.includes(userGroup);
          console.log(`[SHIFT PICKER] Shift ${shift.code}: allowed="${allowed}", userGroup="${userGroup}", matches=${matches}`);
          return matches;
        });
      }
    }
    
    console.log("[SHIFT PICKER] Filtered shifts for picker:", requestShifts);
    
    const container = document.getElementById("shiftGridContainer");
    if (!container) {
      console.warn("[SHIFT PICKER] No shiftGridContainer found");
      return;
    }
    
    let html = "";
    requestShifts.forEach(shift => {
      // Display code with disambiguation if needed
      let displayText = shift.code;
      if (shift.label) {
        displayText = `${shift.code} (${shift.hours_value}h)`;
      }
      
      // Store shift_id in data attribute
      html += `<button class="shift-btn" data-shift-id="${shift.id}" data-shift-code="${escapeHtml(shift.code)}" type="button">${escapeHtml(displayText)}</button>`;
    });
    
    html += `<button class="shift-btn off" data-shift-code="O*" type="button">O*</button>`;
    html += `<button class="shift-btn" data-shift-code="CLEAR" type="button">Clear</button>`;
    
    container.innerHTML = html;
    attachShiftButtonListeners();
  } catch (err) {
    console.error("Failed to load shifts for picker", err);
    const container = document.getElementById("shiftGridContainer");
    if (container) {
      container.innerHTML = `
        <button class="shift-btn off" data-shift-code="O*" type="button">O*</button>
        <button class="shift-btn" data-shift-code="CLEAR" type="button">Clear</button>
      `;
      attachShiftButtonListeners();
    }
  }
}

// Attach event listeners to dynamically created shift buttons
function attachShiftButtonListeners(){
  document.querySelectorAll(".shift-btn").forEach(btn => {
    btn.addEventListener("click", async function(){
      if (!activeCell) return;

      const td = activeCell.td;
      const userId = activeCell.userId;
      const date = activeCell.date;
      const shiftCode = this.dataset.shiftCode; // Display code (e.g., "N")
      const shiftId = this.dataset.shiftId; // Unique shift_id (NEW)
      const key = `${userId}_${date}`;

      let rankToSave = null;

      if (shiftCode === "O*") {
        const pe = pendingEdits[key];
        const currentRank =
          (pe && pe.shift === "O") ? (pe.important_rank ?? null) :
          (requestsCache.get(key)?.value === "O") ? (requestsCache.get(key).important_rank ?? null) :
          null;

        const taken = getTakenOffRanksThisWeek(userId, date, key);
        rankToSave = nextOffPrioritySmart(currentRank, taken);

        if (rankToSave === null && (taken.has(1) && taken.has(2))) {
          alert("No more strong preferences available.\nUse O or add a comment if needed.");
          closeShiftModal();
          return;
        }
      }

      try {
        closeShiftModal();

        if (shiftCode !== "CLEAR" && shiftCode !== "L") {
          const currentCount = countUserRequestsThisWeek(userId, date);
          const alreadyExists = requestsCache.has(key);

          if (!alreadyExists && currentCount >= MAX_REQUESTS_PER_WEEK) {
            alert("You can only enter 5 requests per week.");
            return;
          }
        }

        if (shiftCode === "CLEAR") {
          td.textContent = "";
          delete pendingEdits[key];
        } else if (shiftCode === "O*") {
          if (rankToSave === 1) td.textContent = "O¹";
          else if (rankToSave === 2) td.textContent = "O²";
          else td.textContent = "O";
          pendingEdits[key] = { userId, date, shift: "O", important_rank: rankToSave };
        } else {
          // Display just the code (e.g., "N"), not the full label
          td.textContent = shiftCode;
          pendingEdits[key] = { userId, date, shift: shiftCode, important_rank: null };
        }

        if (shiftCode === "CLEAR") {
          await deleteRequestCell(userId, date);
          requestsCache.delete(key);
          delete pendingEdits[key];
          toast(`Cleared + saved (${key})`);
        } else {
          const valueToSave = (shiftCode === "O*") ? "O" : shiftCode;
          const saved = await upsertRequestCell(userId, date, valueToSave, rankToSave);
          requestsCache.set(key, saved);
          delete pendingEdits[key];
          toast(`Saved (${key}) = ${shiftCode}`);
        }
      } catch (err) {
        console.error("Auto-save failed:", err);

        const msg = err?.message || err?.error?.message || err?.details || JSON.stringify(err);

        const pe = pendingEdits[key];
        const existing = requestsCache.get(key);

        const row = pe ? { value: pe.shift, important_rank: pe.important_rank } : existing;
        if (row?.value === "O") {
          if (row.important_rank === 1) td.textContent = "O¹";
          else if (row.important_rank === 2) td.textContent = "O²";
          else if (row.important_rank === 3) td.textContent = "O³";
          else td.textContent = "O";
        } else {
          td.textContent = row?.value || "";
        }

        delete pendingEdits[key];

        if ((msg || "").toLowerCase().includes("max 5")) {
          alert("Max 5 requests per week. Clear one day to pick another.");
          return;
        }

        if ((msg || "").toLowerCase().includes("priority") ||
            (msg || "").toLowerCase().includes("max 2")) {
          alert("No more strong preferences available.\nUse O or add a comment.");
          return;
        }
        alert("Save failed. Check console.");
      }
    });
  });
}

// Hook into existing PIN verification success
(function() {
  const originalPinConfirm = document.getElementById("pinConfirm");
  if (originalPinConfirm) {
    originalPinConfirm.addEventListener("click", async function() {
      await new Promise(resolve => setTimeout(resolve, 500));
      if (currentUser) {
        await loadUserPermissions();
      }
    });
  }
})();

// Hook into boot sequence
window.addEventListener("DOMContentLoaded", function() {
  setTimeout(() => {
    populateShiftGrid();
  }, 1000);
});

console.log("Shift functions loaded");
