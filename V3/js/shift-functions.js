/* =========================================================
   SHIFT CATALOGUE - ENHANCED FUNCTIONALITY
   ========================================================= */

// Note: userPermissions is already defined in index.html as a global Set
// We access it directly without redeclaring it here

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

// Map role_id to staff group codes used in shifts
const ROLE_TO_STAFF_GROUP = {
  1: "CN",  // Charge Nurse
  2: "SN",  // Staff Nurse
  3: "NA"   // Nursing Assistant
};

// Dynamically populate shift picker from database (NEW SCHEMA)
async function populateShiftGrid(){
  // Check if supabaseClient is available
  if (typeof window.supabaseClient === 'undefined' || !window.supabaseClient) {
    console.warn("[SHIFT-FUNCTIONS] supabaseClient not yet available, skipping shift grid population");
    return;
  }
  
  // Check if currentUser is available
  if (!window.currentUser) {
    console.warn("[SHIFT-FUNCTIONS] currentUser not yet available, skipping shift grid population");
    return;
  }
  
  try {
    // Get shifts with scope flags and allowed_staff_groups
    const { data: shifts, error: shiftsErr } = await window.supabaseClient
      .from("shifts")
      .select("id, code, label, hours_value, allowed_staff_groups, start_time, end_time")
      .eq("allow_requests", true)
      .order("code", { ascending: true })
      .order("hours_value", { ascending: true });
    
    if (shiftsErr) throw shiftsErr;
    
    // Filter by current user's role (admin sees all)
    let requestShifts = shifts || [];
    if (window.currentUser && !window.currentUser.is_admin) {
      const userStaffGroup = ROLE_TO_STAFF_GROUP[window.currentUser.role_id];
      
      if (userStaffGroup) {
        requestShifts = requestShifts.filter(shift => {
          const allowed = shift.allowed_staff_groups || "";
          return allowed.includes(userStaffGroup);
        });
      }
    }
    
    const container = document.getElementById("shiftGridContainer");
    if (!container) {
      console.warn("[SHIFT PICKER] No shiftGridContainer found");
      return;
    }
    
    let html = "";
    requestShifts.forEach(shift => {
      // Display just the code
      const displayText = shift.code;
      
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

// Hook into boot sequence - listen for calpe:user-ready event
function startShiftPickerBoot() {
  console.log("[SHIFT-FUNCTIONS] Starting shift picker boot");
  const container = document.getElementById("shiftGridContainer");
  if (!container) {
    console.warn("[SHIFT-FUNCTIONS] No shiftGridContainer present; skipping boot");
    return;
  }
  setTimeout(() => populateShiftGridWithRetry(), 200);
}

// Start immediately if user is already loaded, otherwise wait for signal
if (window.currentUser) {
  console.log("[SHIFT-FUNCTIONS] window.currentUser already set, starting immediately");
  startShiftPickerBoot();
} else {
  console.log("[SHIFT-FUNCTIONS] Waiting for calpe:user-ready event");
  window.addEventListener("calpe:user-ready", startShiftPickerBoot, { once: true });
}

// Retry wrapper - keeps trying until currentUser is available
function populateShiftGridWithRetry(attempt = 0) {
  if (!window.currentUser) {
    if (attempt < 30) { // Try for up to 6 seconds (30 * 200ms)
      setTimeout(() => populateShiftGridWithRetry(attempt + 1), 200);
      return;
    } else {
      console.warn("[SHIFT-FUNCTIONS] Gave up waiting for currentUser after 6s");
      return;
    }
  }
  populateShiftGrid();
}

console.log("Shift functions loaded");
