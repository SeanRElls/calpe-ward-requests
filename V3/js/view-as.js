/* =========================================================
   VIEW AS FEATURE - Admin impersonation
   ========================================================= */

const VIEW_AS_STORAGE_KEY = "calpeward.viewAs";
const REAL_USER_STORAGE_KEY = "calpeward.realUser";

// Get the "real" logged-in user (before any impersonation)
function getRealUser() {
  const stored = sessionStorage.getItem(REAL_USER_STORAGE_KEY);
  if (stored) {
    try {
      return JSON.parse(stored);
    } catch (e) {
      return null;
    }
  }
  return null;
}

// Get the user being viewed as (if any)
function getViewAsUser() {
  const stored = sessionStorage.getItem(VIEW_AS_STORAGE_KEY);
  if (stored) {
    try {
      return JSON.parse(stored);
    } catch (e) {
      return null;
    }
  }
  return null;
}

// Ensure the banner/header exists and return it
function ensureViewAsBanner() {
  let banner = document.getElementById("viewAsBanner");
  if (banner) return banner;

  banner = document.createElement("div");
  banner.id = "viewAsBanner";
  banner.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    color: white;
    padding: 10px 18px;
    font-weight: 600;
    font-size: 14px;
    z-index: 10000;
    box-shadow: 0 2px 8px rgba(0,0,0,0.18);
    display: none;
    align-items: center;
    gap: 12px;
    box-sizing: border-box;
  `;

  banner.innerHTML = `
    <span id="viewAsStatus" style="flex:1; min-width: 200px;"></span>
    <select id="viewAsSelectorBanner" style="
      min-width: 220px;
      max-width: 360px;
      padding: 8px 10px;
      border-radius: 8px;
      border: 1px solid rgba(255,255,255,0.35);
      background: rgba(255,255,255,0.15);
      color: #fff;
      font-weight: 600;
    "></select>
    <button id="viewAsReturnBtn" style="
      background: rgba(255,255,255,0.22);
      border: 1px solid rgba(255,255,255,0.35);
      color: white;
      padding: 8px 14px;
      border-radius: 8px;
      font-weight: 700;
      cursor: pointer;
      font-size: 13px;
      display: none;
    ">Return to Admin</button>
    <button id="viewAsCloseBtn" aria-label="Hide View As" style="
      background: transparent;
      border: none;
      color: white;
      font-size: 18px;
      cursor: pointer;
      padding: 6px;
      line-height: 1;
      opacity: 0.8;
    ">×</button>
  `;

  document.body.prepend(banner);

  banner.querySelector("#viewAsReturnBtn").addEventListener("click", stopViewingAs);
  banner.querySelector("#viewAsCloseBtn").addEventListener("click", hideViewAsBanner);

  return banner;
}

// Show/update the banner
function showViewAsBanner() {
  const banner = ensureViewAsBanner();
  updateViewAsBannerState();
  banner.style.display = "flex";
  document.body.style.paddingTop = "60px";
}

// Hide the banner when not impersonating
function hideViewAsBanner() {
  const banner = document.getElementById("viewAsBanner");
  const viewAsUser = getViewAsUser();
  if (!banner) return;
  if (viewAsUser) {
    banner.style.display = "flex";
    return;
  }
  banner.style.display = "none";
  document.body.style.paddingTop = "0";
}

function updateViewAsBannerState() {
  const banner = ensureViewAsBanner();
  const statusEl = banner.querySelector("#viewAsStatus");
  const returnBtn = banner.querySelector("#viewAsReturnBtn");
  const selector = banner.querySelector("#viewAsSelectorBanner");
  const viewAsUser = getViewAsUser();

  if (!currentUser || !currentUser.is_admin) {
    banner.style.display = "none";
    document.body.style.paddingTop = "0";
    return;
  }

  if (viewAsUser) {
    statusEl.innerHTML = `👁️ Viewing as <strong>${escapeHtml(viewAsUser.name)}</strong>${viewAsUser.staff_group ? ` (${escapeHtml(viewAsUser.staff_group)})` : ""}`;
    returnBtn.style.display = "inline-flex";
  } else {
    statusEl.textContent = "View another user to see their rota";
    returnBtn.style.display = "none";
  }

  populateViewAsSelector(selector, statusEl);
}

// Start viewing as another user
async function startViewingAs(userId) {
  if (!currentUser || !currentUser.is_admin) {
    alert("Only admins can use View As feature");
    return;
  }

  try {
    if (!getRealUser()) {
      sessionStorage.setItem(REAL_USER_STORAGE_KEY, JSON.stringify(currentUser));
    }

    const { data: user, error } = await supabaseClient
      .from("users")
      .select("*")
      .eq("id", userId)
      .single();

    if (error) throw error;
    if (!user) throw new Error("User not found");

    sessionStorage.setItem(VIEW_AS_STORAGE_KEY, JSON.stringify(user));
    currentUser = user;

    if (typeof loadUserPermissions === "function") {
      await loadUserPermissions();
    }
    if (typeof populateShiftGrid === "function") {
      await populateShiftGrid();
    }
    if (typeof loadRota === "function") {
      loadRota();
    }

    showViewAsBanner();
    console.log("[VIEW AS] Now viewing as:", user.name);
  } catch (e) {
    console.error("Failed to start viewing as user", e);
    alert("Failed to view as user: " + e.message);
  }
}

// Stop viewing as and return to real admin user
async function stopViewingAs() {
  const realUser = getRealUser();
  if (!realUser) return;

  currentUser = realUser;
  sessionStorage.removeItem(VIEW_AS_STORAGE_KEY);
  sessionStorage.removeItem(REAL_USER_STORAGE_KEY);

  if (typeof loadUserPermissions === "function") {
    await loadUserPermissions();
  }
  if (typeof populateShiftGrid === "function") {
    await populateShiftGrid();
  }
  if (typeof loadRota === "function") {
    loadRota();
  }

  hideViewAsBanner();
  console.log("[VIEW AS] Returned to admin view");
}

// Check on page load if we're viewing as someone
function checkViewAsOnLoad() {
  const viewAsUser = getViewAsUser();
  const realUser = getRealUser();

  if (viewAsUser && realUser) {
    currentUser = viewAsUser;
    showViewAsBanner();
    console.log("[VIEW AS] Resumed viewing as:", viewAsUser.name);
  }
  setupViewAsButton();
}

// Populate a View As dropdown with all users
async function populateViewAsSelector(targetSelector, statusEl) {
  const selector = typeof targetSelector === "string" ? document.getElementById(targetSelector) : targetSelector || document.getElementById("viewAsSelector");
  if (!selector) return;

  if (!currentUser || !currentUser.is_admin) {
    selector.style.display = "none";
    return;
  }

  try {
    if (typeof supabaseClient === "undefined") {
      throw new Error("Supabase client not initialised. Load page over http(s) so config.js runs.");
    }

    const { data: users, error } = await supabaseClient
      .from("users")
      .select("id, name, role_id, staff_group, is_admin, is_active")
      .eq("is_active", true)
      .order("role_id", { ascending: true })
      .order("name", { ascending: true });

    if (error) throw error;

    const roles = {
      1: "Charge Nurses",
      2: "Staff Nurses",
      3: "Nursing Assistants"
    };

    let html = '<option value="">View As...</option>';

    [1, 2, 3].forEach(roleId => {
      const roleUsers = users.filter(u => u.role_id === roleId && !u.is_admin);
      if (roleUsers.length) {
        html += `<optgroup label="${roles[roleId]}">`;
        roleUsers.forEach(u => {
          const staffGroup = u.staff_group ? ` (${u.staff_group})` : "";
          html += `<option value="${u.id}">${escapeHtml(u.name)}${staffGroup}</option>`;
        });
        html += "</optgroup>";
      }
    });

    if (html === '<option value="">View As...</option>') {
      html += '<option value="" disabled>(No active non-admin users)</option>';
      if (statusEl) statusEl.textContent = "No active non-admin users found.";
    }

    selector.innerHTML = html;
    selector.onchange = async function() {
      if (this.value) {
        await startViewingAs(this.value);
      } else {
        await stopViewingAs();
      }
      this.value = "";
      updateViewAsBannerState();
    };
  } catch (e) {
    console.error("Failed to populate View As selector", e);
    selector.innerHTML = '<option value="">View As unavailable</option>';
    if (statusEl) statusEl.textContent = "View As unavailable. Check network/sign-in and avoid file://.";
  }
}

function setupViewAsButton() {
  const btn = document.getElementById("viewAsBtn");
  if (!btn) return;

  if (!currentUser || !currentUser.is_admin) {
    btn.style.display = "none";
    return;
  }

  btn.style.display = "inline-flex";
  btn.addEventListener("click", () => {
    const banner = document.getElementById("viewAsBanner");
    if (banner && banner.style.display === "flex" && !getViewAsUser()) {
      hideViewAsBanner();
    } else {
      showViewAsBanner();
    }
  });
}

// Initialize on page load
window.addEventListener("DOMContentLoaded", () => {
  setTimeout(checkViewAsOnLoad, 500);
  setTimeout(populateViewAsSelector, 1000);
});

// Expose functions globally
window.startViewingAs = startViewingAs;
window.stopViewingAs = stopViewingAs;
window.populateViewAsSelector = populateViewAsSelector;

console.log("[VIEW AS] Module loaded");
