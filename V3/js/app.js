/**
 * =========================================================================
 * CALPE WARD REQUESTS - MAIN APPLICATION LOGIC
 * =========================================================================
 * 
 * A Progressive Web App (PWA) for managing hospital shift requests
 * Version: 2.0
 * Last updated: January 2026
 * 
 * ARCHITECTURE:
 * This application manages nurse shift requests with PIN-based authentication,
 * multi-language support (English/Spanish), and admin controls.
 * 
 * KEY FEATURES:
 * - PIN-based user authentication (no passwords)
 * - Shift request management (LD, 8-8, N, W, O/O*)
 * - Priority system for off-duty requests (O, O*)
 * - Week-based commenting system
 * - Admin panel for user/period/notice management
 * - Notice/announcement system with acknowledgments
 * - Bilingual interface (EN/ES)
 * - Request deadline management with countdown
 * - Cell-level locking for admins
 * 
 * STRUCTURE OVERVIEW:
 * 1. Internationalization (i18n) - Language strings and translation system
 * 2. Helper Functions - Date formatting, HTML escaping, data grouping
 * 3. State Management - User session, requests cache, periods, locks
 * 4. DOM References - All UI element references
 * 5. Data Fetching - Supabase RPC calls and data loading
 * 6. UI Rendering - Building the rota table and modal content
 * 7. Modal Management - PIN login, shift picker, user settings
 * 8. Event Handlers - User interactions and form submissions
 * 9. Request Management - Creating/updating/deleting shift requests
 * 10. Admin Functions - Period management, user CRUD, notices
 * 11. Notice System - Blocking notices, acknowledgments, admin panel
 * 12. Week Comments - Per-week commenting for users
 * 13. Language Switching - Dynamic UI translation
 * 14. Initialization - App startup and initial data load
 * 
 * DATABASE:
 * Uses Supabase (PostgreSQL) with Row Level Security policies.
 * All mutations go through RPC functions for security.
 * 
 * SECURITY:
 * - PIN verification happens server-side via RPC
 * - Session pins stored in sessionStorage (cleared on logout/close)
 * - Row Level Security policies enforce data access
 * - Admin actions require admin flag + PIN verification
 * 
 * NOTE: Configuration constants (SUPABASE_URL, etc.) are in config.js
 * NOTE: Styling is in css/styles.css
 * 
 * =========================================================================
 */


/* =========================================================================
   CONFIGURATION
   ========================================================================= */
// Configuration constants are imported from config.js (loaded before this file)
// Available: SUPABASE_URL, SUPABASE_ANON, supabaseClient, STORAGE_KEY, 
//            MAX_REQUESTS_PER_WEEK, WINDOW_WEEKS


/* =========================================================================
   HELPER FUNCTIONS
   ========================================================================= */

/**
 * Format date as "day month" (e.g., "5 Jan")
 */
const fmt = (d) => d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });

    // =========================
// i18n (single source of truth)
// =========================
const I18N = {
  en: {
    // Generic
    close: "Close",
    cancel: "Cancel",
    ok: "OK",
    save: "Save",
    loadingUsers: "Loading users…",
    failedLoadUsers: "Failed to load users.",
    notLoggedIn: "Not logged in",
    loginFirst: "Log in first to add comments.",

    // PIN modal
    pinTitle: (name) => `PIN for ${name}`,
    pinDesc: "Enter your 4-digit PIN to unlock editing.",
    pinErrWrong: "Wrong PIN.",
    pinErrFormat: "PIN must be 4 digits.",
    unlock: "Unlock",

    // Shift modal
    shiftTitle: "Select shift",
    shiftDesc: "Choose a preference for this day.",
    shiftHelpTitle: "Shift request guidelines",
    shiftHelpSub: "How preferences are considered",

    // User modal
    accountEditTitle: "Edit your account",
    changePin: "Change PIN",
    currentPin: "Current PIN",
    newPin: "New PIN",
    repeatNewPin: "Repeat new PIN",
    saveNewPin: "Save new PIN",
    logout: "Log out",
    language: "Language",
    pinUpdated: "PIN updated.",

    // Requests close pill
    reqOpen: "Requests are open",
    reqCloseSoon: "Requests close soon",
    reqClose: "Requests close",
    reqClosed: "Requests closed",
    closedAt: (dt) => `Closed at ${dt}`,
    left: (t) => `${t} left`,

// Week comments
weekCommentsTitle: "Week comments",
yourCommentLabel: "Your comment",
noCommentsYet: "No comments yet.",
saveComment: "Save",
closeComment: "Close",
failedLoadWeekComments: "Failed to load week comments. Check console.",
failedSaveWeekComment: "Failed to save comment. Check console.",

    
  },

  es: {
    close: "Cerrar",
    cancel: "Cancelar",
    ok: "Vale",
    save: "Guardar",
    loadingUsers: "Cargando usuarios…",
    failedLoadUsers: "No se pudieron cargar los usuarios.",
    notLoggedIn: "Sin sesión",
    loginFirst: "Inicia sesión para añadir comentarios.",

    pinTitle: (name) => `PIN de ${name}`,
    pinDesc: "Introduce tu PIN de 4 dígitos para desbloquear la edición.",
    pinErrWrong: "PIN incorrecto.",
    pinErrFormat: "El PIN debe tener 4 dígitos.",
    unlock: "Desbloquear",

    shiftTitle: "Selecciona turno",
    shiftDesc: "Elige una preferencia para este día.",
    shiftHelpTitle: "Guía de solicitudes de turnos",
    shiftHelpSub: "Cómo se consideran las preferencias",

    accountEditTitle: "Editar tu cuenta",
    changePin: "Cambiar PIN",
    currentPin: "PIN actual",
    newPin: "Nuevo PIN",
    repeatNewPin: "Repite el nuevo PIN",
    saveNewPin: "Guardar nuevo PIN",
    logout: "Cerrar sesión",
    language: "Idioma",
    pinUpdated: "PIN actualizado.",

    reqOpen: "Solicitudes abiertas",
    reqCloseSoon: "Cierre pronto",
    reqClose: "Cierre de solicitudes",
    reqClosed: "Solicitudes cerradas",
    closedAt: (dt) => `Cerrado el ${dt}`,
    left: (t) => `Quedan ${t}`,

    // Week comments
weekCommentsTitle: "Comentarios de la semana",
yourCommentLabel: "Tu comentario",
noCommentsYet: "Aún no hay comentarios.",
saveComment: "Guardar",
closeComment: "Cerrar",
failedLoadWeekComments: "No se pudieron cargar los comentarios. Revisa la consola.",
failedSaveWeekComment: "No se pudo guardar el comentario. Revisa la consola.",

  }
};

let currentLang = "en";

function t(key, ...args){
  const pack = I18N[currentLang] || I18N.en;
  const val = pack[key] ?? I18N.en[key] ?? key;
  return (typeof val === "function") ? val(...args) : val;
}

// Use this anywhere you want to switch language
function setLang(lang){
  currentLang = (lang === "es") ? "es" : "en";
  applyLanguage();
}
function isOpenBackdrop(el){
  if (!el) return false;
  return el.getAttribute("aria-hidden") === "false";
}

function updateBodyModalOpen(){
  const anyOpen =
    isOpenBackdrop(shiftModal) ||
    isOpenBackdrop(modal) ||
    isOpenBackdrop(weekCommentModal) ||
    isOpenBackdrop(adminModal) ||
    isOpenBackdrop(userModal) ||
    isOpenBackdrop(shiftHelpModal) ||
    isOpenBackdrop(noticeUnreadModal) ||
    isOpenBackdrop(noticeAllModal);

  document.body.classList.toggle("modal-open", anyOpen);
}



   function isoDate(d){
  const x = new Date(d);
  x.setHours(12,0,0,0); // pin to midday to avoid timezone rollover
  const y = x.getFullYear();
  const m = String(x.getMonth()+1).padStart(2,"0");
  const da = String(x.getDate()).padStart(2,"0");
  return `${y}-${m}-${da}`;
}
    
function effectiveOpenForWeek(w){
  if (!activePeriodObj) return !!w.open; // fallback
  return isPeriodClosed(activePeriodObj)
    ? !!w.openAfterClose
    : !!w.open;
}

function applyLanguage(){
  // PIN modal
  const pinConfirm = document.getElementById("pinConfirm");
  const pinCancel  = document.getElementById("pinCancel");
  if (pinConfirm) pinConfirm.textContent = t("unlock");
  if (pinCancel)  pinCancel.textContent  = t("cancel");

  // Shift modal
  const shiftTitle = document.getElementById("shiftTitle");
  const shiftDesc  = document.getElementById("shiftDesc");
  const shiftCancel = document.getElementById("shiftCancel");
  if (shiftTitle) shiftTitle.textContent = t("shiftTitle");
if (shiftDesc) shiftDesc.innerHTML =
  currentLang === "en"
    ? 'Choose a <strong>preference</strong> for this day.'
    : 'Elige una <strong>preferencia</strong> para este día.';

  // ^ if you want markup, handle it intentionally like this, or just use textContent.

  if (shiftCancel) shiftCancel.textContent = t("cancel");

  // Shift help modal buttons (you already have setShiftHelpLanguage, you can keep it or unify it)
  if (shiftHelpClose)  shiftHelpClose.textContent  = t("close");
  if (shiftHelpClose2) shiftHelpClose2.textContent = t("ok");

  // User modal
  const userTitle = document.getElementById("userTitle");
  const savePinBtn = document.getElementById("userSavePin");
  const logoutBtn = document.getElementById("userLogout");
  const userClose = document.getElementById("userClose");
  const flagsLabel = document.querySelector("#userModal .flags-label");
  if (userTitle) userTitle.textContent = t("accountEditTitle");
  if (savePinBtn) savePinBtn.textContent = t("saveNewPin");
  if (logoutBtn) logoutBtn.textContent = t("logout");
  if (userClose) userClose.textContent = t("close");
  if (flagsLabel) flagsLabel.textContent = t("language");

    // Week comment modal
  const weekTitle = document.getElementById("weekCommentTitle");
  if (weekTitle) weekTitle.textContent = t("weekCommentsTitle");

  if (weekCommentYourLabel) weekCommentYourLabel.textContent = t("yourCommentLabel");
  if (weekCommentCancel) weekCommentCancel.textContent = t("closeComment");
  if (weekCommentSave) weekCommentSave.textContent = t("saveComment");


  // Placeholders
  if (userOldPin) userOldPin.placeholder = t("currentPin");
  if (userNewPin) userNewPin.placeholder = t("newPin");
  if (userNewPin2) userNewPin2.placeholder = t("repeatNewPin");
}

function escapeHtml(s){
  return String(s)
    .replace(/&/g,"&amp;")
    .replace(/</g,"&lt;")
    .replace(/>/g,"&gt;")
    .replace(/"/g,"&quot;")
    .replace(/'/g,"&#039;");
}

    function startOfWeekSunday(dateObj){
      const d = new Date(dateObj);
      const day = d.getDay();
      d.setHours(0,0,0,0);
      d.setDate(d.getDate() - day);
      return d;
    }
    function addDays(d, n){ const x = new Date(d); x.setDate(x.getDate()+n); return x; }

function groupDatesIntoWeeks(dates){
  const map = new Map();

  for (const item of dates){
    const d = new Date(item.date);
    const ws = startOfWeekSunday(d);
    const key = isoDate(ws);

    const rowWeekId = item.week_id ?? item.rota_weeks?.id ?? null;

    // Interpret flags ONLY if rota_weeks exists; otherwise don't "invent" openness
    const rowOpen = (item.rota_weeks?.open);
    const rowOpenAfterClose = (item.rota_weeks?.open_after_close);

    if (!map.has(key)) {
      map.set(key, {
        weekStart: ws,
        days: [],
        weekId: rowWeekId,

        // Start with "unknown" until we see real flags
        open: null,
        openAfterClose: null
      });
    }

    const weekObj = map.get(key);

    // Capture weekId if we didn't have it yet
    if (!weekObj.weekId && rowWeekId) weekObj.weekId = rowWeekId;

    // Aggregate open flags (AND), but only when we have real values
    if (typeof rowOpen === "boolean") {
      weekObj.open = (weekObj.open === null) ? rowOpen : (weekObj.open && rowOpen);
    }
    if (typeof rowOpenAfterClose === "boolean") {
      weekObj.openAfterClose = (weekObj.openAfterClose === null)
        ? rowOpenAfterClose
        : (weekObj.openAfterClose && rowOpenAfterClose);
    }

    weekObj.days.push(item);
  }

  const weeks = [];

  for (const w of map.values()){
    const dayLookup = new Map(w.days.map(x => [x.date, x]));
    const ordered = [];

    for (let i = 0; i < 7; i++){
      const dd = addDays(w.weekStart, i);
      const ds = isoDate(dd);

      const row = dayLookup.get(ds) || {
        date: ds,
        week_id: w.weekId,
        rota_weeks: (w.weekId ? {
          id: w.weekId,
          open: w.open,
          open_after_close: w.openAfterClose
        } : null)
      };

      ordered.push(row);
    }

    // If still null (never saw rota_weeks), be conservative:
    // treat as CLOSED so editing/comments don't misbehave.
    const finalOpen = (w.open === null) ? false : w.open;
    const finalAfter = (w.openAfterClose === null) ? false : w.openAfterClose;

    weeks.push({
      weekStart: w.weekStart,
      weekEnd: addDays(w.weekStart, 6),
      weekId: w.weekId,
      open: finalOpen,
      openAfterClose: finalAfter,
      days: ordered
    });
  }

  weeks.sort((a,b) => a.weekStart - b.weekStart);
  return weeks;
}
    function groupUsers(users){
      const buckets = { charge_nurse: [], staff_nurse: [], nursing_assistant: [] };

      for(const u of users){
        const label =
          u.roles?.name ||
          (u.role_id === 1 ? "charge_nurse" :
           u.role_id === 2 ? "staff_nurse" :
           u.role_id === 3 ? "nursing_assistant" : "staff_nurse");

        (buckets[label] || buckets.staff_nurse).push(u);
      }

      return [
        { title: "Charge Nurses",      className: "section-cn", items: buckets.charge_nurse },
        { title: "Staff Nurses",       className: "section-sn", items: buckets.staff_nurse },
        { title: "Nursing Assistants", className: "section-na", items: buckets.nursing_assistant }
      ].filter(g => g.items.length > 0);
    }
function getWeekStart(dateStr){
  const d = new Date(dateStr);
  const day = d.getDay(); // 0 = Sunday
  d.setDate(d.getDate() - day);
  d.setHours(0,0,0,0);
  return isoDate(d);
}

function countUserRequestsThisWeek(userId, dateStr){
  const weekStart = getWeekStart(dateStr);
  let count = 0;

  for (const r of requestsCache.values()){
    if (r.user_id !== userId) continue;
    if (getWeekStart(r.date) === weekStart) count++;
  }

  return count;
}

function getSessionPinOrThrow(){
  if (!currentUser) throw new Error("Not logged in.");
  const pin = sessionStorage.getItem(pinKey(currentUser.id));
  if (!pin) throw new Error("Missing session PIN. Log in again.");
  return pin;
}
    
function nextOffPrioritySmart(currentRank, taken){
  // Cycle intent: null → 1 → 2 → BLOCK
  let desired =
    (currentRank == null) ? 1 :
    (currentRank === 1) ? 2 :
    null;

  // If desired is taken, try the other one
  if (desired != null && taken.has(desired)) {
    if (!taken.has(1)) desired = 1;
    else if (!taken.has(2)) desired = 2;
    else desired = null; // both O1 and O2 used → block
  }

  return desired;
}

function getTakenOffRanksThisWeek(userId, dateStr, excludeKey){
  const ws = getWeekStart(dateStr);
  const taken = new Set();

  // include saved rows
  for (const [k, r] of requestsCache.entries()){
    if (k === excludeKey) continue;
    if (r.user_id !== userId) continue;
    if (getWeekStart(r.date) !== ws) continue;
    if (r.value !== "O") continue;
 if (r.important_rank === 1 || r.important_rank === 2) {
  taken.add(r.important_rank);
}
  }

  // include pending edits
  for (const [k, pe] of Object.entries(pendingEdits)){
    if (k === excludeKey) continue;
    if (pe.userId !== userId) continue;
    if (getWeekStart(pe.date) !== ws) continue;
    if (pe.shift !== "O") continue;
    if (pe.important_rank === 1 || pe.important_rank === 2 || pe.important_rank === 3) {
      taken.add(pe.important_rank);
    }
  }

  return taken;
}
async function fetchWeekComments(weekId){
  const pin = getSessionPinOrThrow();

  const { data, error } = await supabaseClient.rpc("get_week_comments", {
    p_week_id: weekId,
    p_user_id: currentUser.id,
    p_pin: pin
  });

  if (error) throw error;
  return data || [];
}


async function upsertWeekComment(weekId, userId, comment){
  if (!currentUser) throw new Error("Not logged in.");

  const pin = sessionStorage.getItem(pinKey(currentUser.id));
  if (!pin) throw new Error("Missing session PIN. Log in again.");

  const { data, error } = await supabaseClient.rpc("upsert_week_comment", {
    p_week_id: weekId,
    p_user_id: userId,
    p_pin: pin,
    p_comment: comment ?? ""
  });

  if (error) throw error;

  // Depending on how your SQL function is written, data may be:
  // - the row object, OR
  // - an array with one row (common in PostgREST)
  return Array.isArray(data) ? data[0] : data;
}

async function resetWeeksFullyOpen(periodId){
  if (!currentUser?.is_admin) { alert("Admin only."); return; }

  const { data: wkRows, error: wkErr } = await supabaseClient
    .from("rota_dates")
    .select("week_id")
    .eq("period_id", periodId);

  if (wkErr) throw wkErr;

  const weekIds = [...new Set((wkRows || []).map(r => r.week_id).filter(Boolean))];
  if (!weekIds.length) return;

  const { error: resetErr } = await supabaseClient
    .from("rota_weeks")
    .update({ open: true, open_after_close: true })
    .in("id", weekIds);

  if (resetErr) throw resetErr;
}

async function resetWeeksFullyClosed(periodId){
  if (!currentUser?.is_admin) { alert("Admin only."); return; }

  const { data: wkRows, error: wkErr } = await supabaseClient
    .from("rota_dates")
    .select("week_id")
    .eq("period_id", periodId);

  if (wkErr) throw wkErr;

  const weekIds = [...new Set((wkRows || []).map(r => r.week_id).filter(Boolean))];
  if (!weekIds.length) return;

  const { error: resetErr } = await supabaseClient
    .from("rota_weeks")
    .update({ open: false, open_after_close: false })
    .in("id", weekIds);

  if (resetErr) throw resetErr;
}

    
  async function fetchRotaPeriods(){
  let q = supabaseClient
    .from("rota_periods")
    .select("id, name, start_date, end_date, is_hidden, is_active, closes_at")
    .order("start_date", { ascending: true });

  // Staff: show active + non-hidden. Admin: show all.
  if (!currentUser?.is_admin) {
    q = q.or("is_hidden.eq.false,is_active.eq.true");
  }

  const { data, error } = await q;
  if (error) throw error;
  return data || [];
}

function roleLabel(u){
  return u.roles?.name ||
    (u.role_id === 1 ? "charge_nurse" :
     u.role_id === 2 ? "staff_nurse" :
     u.role_id === 3 ? "nursing_assistant" : "staff_nurse");
}


function populatePeriodDropdown(periods){
  periodSelect.innerHTML = "";

  for (const p of periods){
    const opt = document.createElement("option");
    opt.value = p.id;

    const s = new Date(p.start_date);
    const e = new Date(p.end_date);

    const hiddenTag = (currentUser?.is_admin && p.is_hidden) ? " (hidden)" : "";
    const activeTag = p.is_active ? " ★" : "";

    opt.textContent = `${fmt(s)} – ${fmt(e)}${activeTag}${hiddenTag}`;
    periodSelect.appendChild(opt);
  }

  // ✅ ensure dropdown always reflects activePeriodId
  if (activePeriodId != null) {
    periodSelect.value = String(activePeriodId);
  }
}

function getPeriodCloseDate(period){
  if (!period?.closes_at) return null;
  return new Date(period.closes_at);
}

function isPeriodClosed(period){
  const closeAt = getPeriodCloseDate(period);
  if (!closeAt) return false; // no deadline = open forever
  return new Date() >= closeAt;
}

    function isAdminWeekToggleAllowed(){
  return !!currentUser?.is_admin;
}
/* =========================================================
   3) STATE (who is logged in / what is unlocked)
   ========================================================= */
let currentUser = null;      // user object when logged in (by PIN)
let selectedUser = null;     // user you clicked before PIN entry
    let usersById = new Map();
let sessionPin = null; // store PIN in memory only (not localStorage)


    function pinKey(userId){ return `calpeward.pin.${userId}`; }

function setSessionPin(userId, pin){
  sessionPin = pin;
  sessionStorage.setItem(pinKey(userId), pin);
}

function clearSessionPin(userId){
  sessionPin = null;
  if (userId) sessionStorage.removeItem(pinKey(userId));
}
    
/* =========================================================
   3b) STATE (editing + requests)
   ========================================================= */
let activeCell = null;           // { td, userId, date }
const pendingEdits = {};         // key -> { userId, date, shift }
const requestsCache = new Map(); // key -> { id, user_id, date, value, important_rank }
 let periodsCache = [];
 const locksCache = new Map(); // key -> { user_id, date, reason_en, reason_es, locked_by, locked_at }
let activePeriodId = null;
    let activePeriodObj = null; // ← the actual period object
    let closeTriggeredReload = false;
    
// ===== 5-week window navigation =====
// WINDOW_WEEKS is defined in config.js
let allWeeks = [];
let weekWindowStart = 0; // index into allWeeks

    

// key: `${user_id}_${date}` -> { id, user_id, date, value, important_rank }

    /* =========================================================
       4) DOM REFERENCES
       ========================================================= */
    const modal = document.getElementById("pinModal");
    const pinInput = document.getElementById("pinInput");
    const pinErr = document.getElementById("pinErr");
    const pinTitle = document.getElementById("pinTitle");
    const pinDesc = document.getElementById("pinDesc");
    const pinConfirmBtn = document.getElementById("pinConfirm");
    const pinCancelBtn = document.getElementById("pinCancel");
    const loginBadge = document.getElementById("loginBadge");
    const adminBadge = document.getElementById("adminBadge");
    
const periodSelect = document.getElementById("periodSelect");


    const adminPeriodSelect = document.getElementById("adminPeriodSelect");
const adminPeriodMeta = document.getElementById("adminPeriodMeta");
const adminSetActiveBtn = document.getElementById("adminSetActiveBtn");
const adminToggleHiddenBtn = document.getElementById("adminToggleHiddenBtn");
const adminWeeksList = document.getElementById("adminWeeksList");
    const closeLabel = document.getElementById("closeLabel");
    const adminClosesAtInput = document.getElementById("adminClosesAtInput");
const adminClosesAtSaveBtn = document.getElementById("adminClosesAtSaveBtn");
const adminClosesAtClearBtn = document.getElementById("adminClosesAtClearBtn");
const adminClosesAtHelp = document.getElementById("adminClosesAtHelp");



let adminSelectedPeriodId = null;
    
    const adminTabUsers = document.getElementById("adminTabUsers");
const adminViewUsers = document.getElementById("adminViewUsers");

const adminUsersList = document.getElementById("adminUsersList");
const adminAddUserBtn = document.getElementById("adminAddUserBtn");
const adminUserSearch = document.getElementById("adminUserSearch");
const adminShowInactiveUsers = document.getElementById("adminShowInactiveUsers");

const adminEditUserName = document.getElementById("adminEditUserName");
const adminEditUserRole = document.getElementById("adminEditUserRole");
const adminEditUserPin  = document.getElementById("adminEditUserPin");
const adminSaveUserBtn  = document.getElementById("adminSaveUserBtn");
const adminCancelUserEditBtn = document.getElementById("adminCancelUserEditBtn");
const adminUserEditHelp = document.getElementById("adminUserEditHelp");

// User modal refs
const userModal = document.getElementById("userModal");
const userCloseBtn = document.getElementById("userClose");
const userLogoutBtn = document.getElementById("userLogout");

const userMeta = document.getElementById("userMeta");
const userOldPin = document.getElementById("userOldPin");
const userNewPin = document.getElementById("userNewPin");
const userNewPin2 = document.getElementById("userNewPin2");
const userSavePin = document.getElementById("userSavePin");
const userPinErr = document.getElementById("userPinErr");
const userPinOk = document.getElementById("userPinOk");
const userLangEn = document.getElementById("userLangEn");
const userLangEs = document.getElementById("userLangEs");



    // Shift modal refs
    const shiftModal = document.getElementById("shiftModal");
    const shiftCancelBtn = document.getElementById("shiftCancel");
    const shiftLockBtn = document.getElementById("shiftLockBtn");


// Shift Help modal refs
const shiftHelpModal = document.getElementById("shiftHelpModal");
const shiftHelpBtn = document.getElementById("shiftHelpBtn");
const shiftHelpClose = document.getElementById("shiftHelpClose");
const shiftHelpClose2 = document.getElementById("shiftHelpClose2");

const shiftHelpContentEn = document.getElementById("shiftHelpContentEn");
const shiftHelpContentEs = document.getElementById("shiftHelpContentEs");

    
// Week comment modal refs
const weekCommentModal = document.getElementById("weekCommentModal");
const weekCommentCancel = document.getElementById("weekCommentCancel");
const weekCommentSave = document.getElementById("weekCommentSave");
const weekCommentInput = document.getElementById("weekCommentInput");
const weekCommentAdminList = document.getElementById("weekCommentAdminList");
const weekCommentYourLabel = document.getElementById("weekCommentYourLabel");


// Notices refs

const noticeBell = document.getElementById("noticeBell");
const noticeBellDot = document.getElementById("noticeBellDot");

// Admin notices refs
const adminTabNotices = document.getElementById("adminTabNotices");
const adminViewNotices = document.getElementById("adminViewNotices");
const adminNoticesList = document.getElementById("adminNoticesList");

const adminAddNoticeBtn = document.getElementById("adminAddNoticeBtn");
const adminNoticeSearch = document.getElementById("adminNoticeSearch");
const adminShowInactiveNotices = document.getElementById("adminShowInactiveNotices");

// Admin notice editor modal refs
const adminNoticeModal = document.getElementById("adminNoticeModal");
const adminNoticeTitle = document.getElementById("adminNoticeTitle");
const adminNoticeTitleInput = document.getElementById("adminNoticeTitleInput");
const adminNoticeBodyEn = document.getElementById("adminNoticeBodyEn");
const adminNoticeBodyEs = document.getElementById("adminNoticeBodyEs");

const noticeTargetAll = document.getElementById("noticeTargetAll");
const noticeRoleChks = Array.from(document.querySelectorAll(".noticeRoleChk"));

const adminNoticeCancel = document.getElementById("adminNoticeCancel");
const adminNoticeSave = document.getElementById("adminNoticeSave");

const noticeUnreadModal = document.getElementById("noticeUnreadModal");
const noticeUnreadList = document.getElementById("noticeUnreadList");
const noticeUnreadAcknowledge = document.getElementById("noticeUnreadAcknowledge");

const noticeAllModal = document.getElementById("noticeAllModal");
const noticeAllList = document.getElementById("noticeAllList");
const noticeAllClose = document.getElementById("noticeAllClose");


applyLanguage();

let activeWeekIdForComment = null;
    function toDatetimeLocalValue(dateObj){
  // returns "YYYY-MM-DDTHH:MM" in local time
  const pad = (n) => String(n).padStart(2, "0");
  const y = dateObj.getFullYear();
  const m = pad(dateObj.getMonth() + 1);
  const d = pad(dateObj.getDate());
  const h = pad(dateObj.getHours());
  const mi = pad(dateObj.getMinutes());
  return `${y}-${m}-${d}T${h}:${mi}`;
}

function datetimeLocalToISOString(value){
  // value is "YYYY-MM-DDTHH:MM" interpreted as LOCAL time
  // Convert to a Date then ISO (UTC). Works cleanly with timestamptz in Supabase.
  const dt = new Date(value);
  return dt.toISOString();
}

function renderAdminCloseTime(periodId){
  const p = periodsCache.find(x => String(x.id) === String(periodId));
  if (!p) return;

  if (adminClosesAtInput){
    adminClosesAtInput.value = p.closes_at ? toDatetimeLocalValue(new Date(p.closes_at)) : "";
  }

  if (adminClosesAtHelp){
    if (!p.closes_at){
      adminClosesAtHelp.textContent = "No close time set (requests stay open).";
    } else {
      const d = new Date(p.closes_at);
      adminClosesAtHelp.textContent =
        `Currently closes at: ${d.toLocaleString("en-GB")}`;
    }
  }
}

    
  let closeCountdownTimer = null;
function setShiftHelpLanguage(lang){
  const isEn = (lang !== "es");

  shiftHelpContentEn.style.display = isEn ? "block" : "none";
  shiftHelpContentEs.style.display = isEn ? "none" : "block";

  const title = document.getElementById("shiftHelpTitle");
  const sub = document.getElementById("shiftHelpSubtitle");
  if (title) title.textContent = isEn ? "Shift request guidelines" : "Guía de solicitudes de turnos";
  if (sub) sub.textContent = isEn
  ? "How preferences are considered"
  : "Cómo se consideran las preferencias";

  if (shiftHelpClose) shiftHelpClose.textContent = isEn ? "Close" : "Cerrar";
  if (shiftHelpClose2) shiftHelpClose2.textContent = isEn ? "OK" : "Vale";
}

function openShiftHelpModal(){
  // Respect saved preference if available
  const lang = currentUser?.preferred_lang || "en";
  setShiftHelpLanguage(lang);

  document.body.classList.add("modal-open");
  shiftHelpModal.style.display = "flex";
  shiftHelpModal.setAttribute("aria-hidden", "false");
}

function closeShiftHelpModal(){
  shiftHelpModal.style.display = "none";
  shiftHelpModal.setAttribute("aria-hidden", "true");
  updateBodyModalOpen();
}


shiftHelpBtn?.addEventListener("click", (e) => {
  e.preventDefault();
  e.stopPropagation();
  openShiftHelpModal();
});


/* =========================
   ADMIN LOCK TOGGLE (5B)
   ========================= */
shiftLockBtn?.addEventListener("click", async (e) => {
  e.preventDefault();
  e.stopPropagation();

  if (!currentUser?.is_admin) return;
  if (!activeCell) return;

  const pin = getSessionPinOrThrow();
  const targetUserId = activeCell.userId;
  const date = activeCell.date;
  const key = `${targetUserId}_${date}`;

  const existing = locksCache.get(key);

  try {
    if (existing) {
      // 🔓 UNLOCK
      const { error } = await supabaseClient.rpc(
        "admin_unlock_request_cell",
        {
          p_admin_id: currentUser.id,
          p_pin: pin,
          p_target_user_id: targetUserId,
          p_date: date
        }
      );
      if (error) throw error;

      locksCache.delete(key);
      shiftLockBtn.textContent = "🔓";

    } else {
      // 🔒 LOCK (optional reason)
      const reason = prompt(
        currentLang === "es"
          ? "Motivo (opcional). El usuario lo verá al pulsar este día:"
          : "Reason (optional). Staff will see this if they click this day:"
      );

      if (reason === null) return;

      const { data, error } = await supabaseClient.rpc(
        "admin_lock_request_cell",
        {
          p_admin_id: currentUser.id,
          p_pin: pin,
          p_target_user_id: targetUserId,
          p_date: date,
          p_reason_en: currentLang === "es" ? null : reason,
          p_reason_es: currentLang === "es" ? reason : null
        }
      );
      if (error) throw error;

      locksCache.set(key, data);
      shiftLockBtn.textContent = "🔒";
    }

    await loadRota(); // keep UI honest

    // Re-open the modal to show the updated lock icon (iOS fix)
    if (activeCell) {
      openShiftModal();
    }

  } catch (err) {
    console.error(err);
    alert("Lock action failed.");
  }
});


shiftHelpClose?.addEventListener("click", closeShiftHelpModal);
shiftHelpClose2?.addEventListener("click", closeShiftHelpModal);

shiftHelpModal?.addEventListener("click", (e) => {
  if (e.target === shiftHelpModal) closeShiftHelpModal();
});




function formatTimeLeft(ms){
  if (ms <= 0) return "0m";

  const totalMins = Math.floor(ms / 60000);
  const days = Math.floor(totalMins / (60 * 24));
  const hours = Math.floor((totalMins % (60 * 24)) / 60);
  const mins = totalMins % 60;

  const parts = [];
  if (days) parts.push(`${days}d`);
  if (days || hours) parts.push(`${hours}h`);
  parts.push(`${mins}m`);

  return parts.join(" ");
}

function updateCloseLabel(period){
  if (!closeLabel) return;

  if (closeCountdownTimer){
    clearInterval(closeCountdownTimer);
    closeCountdownTimer = null;
  }

  const closeAt = getPeriodCloseDate(period);

if (!closeAt){
closeLabel.innerHTML = `
  <span class="close-pill">
    <span class="dot"></span>
    <span class="msg">${t("reqOpen")}</span>
  </span>
`;
  return;
}

const renderCloseLabel = () => {
  const now = new Date();
  const msLeft = closeAt - now;

if (msLeft <= 0){
closeLabel.innerHTML = `
  <span class="close-pill is-closed">
    <span class="dot"></span>
    <span class="msg">${t("reqClosed")}</span>
    <span class="mini">${t("closedAt", closeAt.toLocaleString("en-GB"))}</span>
  </span>
`;


  clearInterval(closeCountdownTimer);
  closeCountdownTimer = null;

  // ✅ FIX 3: force UI to re-render locked state once
  if (!closeTriggeredReload) {
    closeTriggeredReload = true;
    loadRota(); // re-fetch + redraw so cells become locked
  }

  return;
}

  const soon = msLeft <= 24 * 60 * 60 * 1000;

closeLabel.innerHTML = `
  <span class="close-pill ${soon ? "is-soon" : ""}">
    <span class="dot"></span>
    <span class="msg">${soon ? t("reqCloseSoon") : t("reqClose")}</span>
    <span class="mini">${closeAt.toLocaleString("en-GB")}</span>
    <span class="timeleft">${t("left", formatTimeLeft(msLeft))}</span>
  </span>
`;

};


renderCloseLabel();
closeCountdownTimer = setInterval(renderCloseLabel, 30000);
}

function openUserModal(){
  if (!currentUser) return;

  userMeta.textContent = `${currentUser.name}${currentUser.is_admin ? " (admin)" : ""}`;
  userOldPin.value = "";
  userNewPin.value = "";
  userNewPin2.value = "";

  userPinErr.style.display = "none";
  userPinOk.style.display = "none";


paintLangButtons();

  document.body.classList.add("modal-open");
  userModal.style.display = "flex";
  userModal.setAttribute("aria-hidden", "false");

  setTimeout(() => userOldPin.focus(), 50);
}

function closeUserModal(){
  userModal.style.display = "none";
  userModal.setAttribute("aria-hidden", "true");
  updateBodyModalOpen();
}


function logout(){
  if (!currentUser) return;

  // clear stored login + pin
  localStorage.removeItem(STORAGE_KEY);
  clearSessionPin(currentUser.id);

  // clear state
  currentUser = null;
  selectedUser = null;
  sessionPin = null;

  closeUserModal();
  updateBadges();
  applyUnlockState();

  // refresh UI (so any "editable" disappears + dropdown filtering updates)
  loadRota();
}

// Wire badge click
loginBadge.addEventListener("click", () => {
  if (!currentUser) return;        // don’t open it when not logged in
  openUserModal();
});

// Close actions
userCloseBtn?.addEventListener("click", closeUserModal);
userLogoutBtn?.addEventListener("click", logout);
userModal?.addEventListener("click", (e) => {
  if (e.target === userModal) closeUserModal();
});

async function setMyLanguage(lang){
  if (!currentUser) return;

  try {
    const pin = getSessionPinOrThrow();

    const { data, error } = await supabaseClient.rpc("set_user_language", {
      p_user_id: currentUser.id,
      p_pin: pin,
      p_lang: lang
    });

    if (error) throw error;

    currentUser.preferred_lang = data || lang;
    paintLangButtons();

  } catch (e) {
    console.error(e);
    alert("Failed to update language. Check console.");
  }
}

userLangEn?.addEventListener("click", () => setMyLanguage("en"));
userLangEs?.addEventListener("click", () => setMyLanguage("es"));


// Save PIN
userSavePin?.addEventListener("click", async () => {
  if (!currentUser) return;

  userPinErr.style.display = "none";
  userPinOk.style.display = "none";

  const oldPin = userOldPin.value.trim();
  const newPin = userNewPin.value.trim();
  const newPin2 = userNewPin2.value.trim();

  if (!/^\d{4}$/.test(oldPin)) return showUserPinErr("Current PIN must be 4 digits.");
  if (!/^\d{4}$/.test(newPin)) return showUserPinErr("New PIN must be 4 digits.");
  if (newPin !== newPin2) return showUserPinErr("New PINs do not match.");
  if (oldPin === newPin) return showUserPinErr("New PIN must be different.");

  userSavePin.disabled = true;

  try {
    // OPTIONAL: verify old pin first (you already have this RPC)
    const { data: ok, error: vErr } = await supabaseClient.rpc("verify_user_pin", {
      p_user_id: currentUser.id,
      p_pin: oldPin
    });
    if (vErr) throw vErr;
    if (ok !== true) return showUserPinErr("Current PIN is incorrect.");

    // Change pin (YOU need this RPC - see SQL below)
    const { error: cErr } = await supabaseClient.rpc("change_user_pin", {
      p_user_id: currentUser.id,
      p_old_pin: oldPin,
      p_new_pin: newPin
    });
    if (cErr) throw cErr;

    // Update session pin to the new one so their session keeps working
    setSessionPin(currentUser.id, newPin);

    userPinOk.style.display = "block";
    userOldPin.value = "";
    userNewPin.value = "";
    userNewPin2.value = "";

  } catch (e) {
    console.error(e);
    showUserPinErr("Failed to update PIN. Check console.");
  } finally {
    userSavePin.disabled = false;
  }
});

function paintLangButtons(){
  const lang = (currentUser?.preferred_lang || "en");

  userLangEn?.classList.toggle("is-active", lang === "en");
  userLangEs?.classList.toggle("is-active", lang === "es");
}

function showUserPinErr(msg){
  userPinErr.textContent = msg;
  userPinErr.style.display = "block";
}

    
function openWeekCommentModal(){
  if (!activeWeekIdForComment) return;
  document.body.classList.add("modal-open");  // ✅
  weekCommentModal.style.display = "flex";
  weekCommentModal.setAttribute("aria-hidden","false");
}

function closeWeekCommentModal(){
  weekCommentModal.style.display = "none";
  weekCommentModal.setAttribute("aria-hidden","true");

  activeWeekIdForComment = null;
  weekCommentInput.value = "";
  weekCommentAdminList.innerHTML = "";
  weekCommentAdminList.style.display = "none";

  updateBodyModalOpen();
}
weekCommentCancel.addEventListener("click", closeWeekCommentModal);
weekCommentModal.addEventListener("click", (e) => {
  if (e.target === weekCommentModal) closeWeekCommentModal();
});

if (adminBadge) {
  adminBadge.addEventListener("click", () => {
    if (!currentUser?.is_admin) return;
    openAdminConsole();
  });
}
 

// Click handler for 💬 buttons (event delegation)
document.addEventListener("click", async (e) => {
  const btn = e.target.closest(".week-comment-btn");
  if (!btn) return;

  e.preventDefault();
  e.stopPropagation();

  const weekId = (btn.dataset.weekId || "").trim();
  if (!weekId) {
    alert("Week ID missing (data-week-id is empty). Fix rota_weeks(id,open) select.");
    return;
  }

  if (!currentUser) {
alert(t("loginFirst"));

    return;
  }

  activeWeekIdForComment = weekId;

  try {
    const rows = await fetchWeekComments(weekId);

    // ---- My comment (normal user + admin)
    const myId = String(currentUser.id);
    const mine = (rows || []).find(r => String(r.user_id) === myId);
    weekCommentInput.value = mine?.comment || "";

    // ---- Admin list (all staff comments)
    if (currentUser.is_admin) {
      weekCommentAdminList.style.display = "block";

      if (!rows || rows.length === 0) {
      weekCommentAdminList.innerHTML = `<div class="subtitle">${escapeHtml(t("noCommentsYet"))}</div>`;

      } else {
        weekCommentAdminList.innerHTML = rows.map(r => {
          const uid = String(r.user_id);
          const name = usersById.get(uid) || uid;
          const when = r.updated_at ? new Date(r.updated_at).toLocaleString("en-GB") : "";
          const commentSafe = escapeHtml(r.comment || "");

          return `
            <div style="padding:6px 0; border-bottom:1px solid #eee;">
              <div style="font-weight:700;">${escapeHtml(name)}</div>
              <div style="font-size:11px; color:#777;">${when}</div>
              <div style="white-space:pre-wrap;">${commentSafe}</div>
            </div>
          `;
        }).join("");
      }
    } else {
      weekCommentAdminList.style.display = "none";
      weekCommentAdminList.innerHTML = "";
    }

    // ---- Bubble indicator: mark if ANY comment exists
    btn.classList.toggle("has-comment", (rows || []).length > 0);

applyLanguage();
openWeekCommentModal();

  } catch (err) {
    console.error("Week comment load failed:", err);
alert(t("failedLoadWeekComments"));

  }
});

// Save handler
weekCommentSave.addEventListener("click", async () => {
  if (!activeWeekIdForComment || !currentUser) return;

  try {
    await upsertWeekComment(
      activeWeekIdForComment,
      currentUser.id,
      weekCommentInput.value
    );

    // Re-fetch so bubble reflects whether ANY comment exists (not just yours)
    const rows = await fetchWeekComments(activeWeekIdForComment);

    // Update the bubble indicator for this week header button
    const selector = `.week-comment-btn[data-week-id="${CSS.escape(String(activeWeekIdForComment))}"]`;
    const btn = document.querySelector(selector);
    if (btn) {
      btn.classList.toggle("has-comment", (rows || []).length > 0);
    }

    // If admin, refresh the visible comment list too
    if (currentUser.is_admin) {
      weekCommentAdminList.style.display = "block";
      if (!rows || rows.length === 0) {
       weekCommentAdminList.innerHTML = `<div class="subtitle">${escapeHtml(t("noCommentsYet"))}</div>`;

      } else {
        weekCommentAdminList.innerHTML = rows.map(r => {
          const uid = String(r.user_id);
          const name = usersById.get(uid) || uid;
          const when = r.updated_at ? new Date(r.updated_at).toLocaleString("en-GB") : "";
          const commentSafe = escapeHtml(r.comment || "");
          return `
            <div style="padding:6px 0; border-bottom:1px solid #eee;">
              <div style="font-weight:700;">${escapeHtml(name)}</div>
              <div style="font-size:11px; color:#777;">${when}</div>
              <div style="white-space:pre-wrap;">${commentSafe}</div>
            </div>
          `;
        }).join("");
      }
    }

    closeWeekCommentModal();
  } catch (err) {
    console.error("Week comment save failed:", err);
 alert(t("failedSaveWeekComment"));

  }
});
    

/* =========================================================
   6) PERIOD DROPDOWN HANDLER
   ========================================================= */
if (periodSelect) {
  periodSelect.addEventListener("change", async () => {
    closeTriggeredReload = false; // ✅ reset for new period
    activePeriodId = periodSelect.value;

    const selected = periodsCache.find(p => String(p.id) === String(activePeriodId));
    activePeriodObj = selected;

    updateCloseLabel(selected);
    applyUnlockState();
    await loadRota();
  });
}

/* =========================
   ADMIN PANEL (v1)
   ========================= */
const adminModal = document.getElementById("adminModal");
const adminCloseBtn = document.getElementById("adminClose");
const adminTabPeriods = document.getElementById("adminTabPeriods");
const adminTabGenerate = document.getElementById("adminTabGenerate");
const adminViewPeriods = document.getElementById("adminViewPeriods");
const adminViewGenerate = document.getElementById("adminViewGenerate");

const adminGeneratePreview = document.getElementById("adminGeneratePreview");
const adminGenerateBtn = document.getElementById("adminGenerateBtn");

function openAdminConsole(){
  if (!currentUser?.is_admin) return;
  document.body.classList.add("modal-open");
  adminModal.style.display = "flex";
  adminModal.setAttribute("aria-hidden","false");
  showAdminTab("periods");
  loadAdminPeriodsForDropdown();
  refreshGeneratePreview();
}

function closeAdminConsole(){
  adminModal.style.display = "none";
  adminModal.setAttribute("aria-hidden","true");
  updateBodyModalOpen();
}



if (adminCloseBtn) adminCloseBtn.addEventListener("click", closeAdminConsole);
if (adminModal) adminModal.addEventListener("click", (e) => {
  if (e.target === adminModal) closeAdminConsole();
});

// [ADMIN-UI-1] Tab switching (Periods / Generate / Users)
function showAdminTab(which){
  const isPeriods  = (which === "periods");
  const isGenerate = (which === "generate");
  const isUsers    = (which === "users");
  const isNotices  = (which === "notices");

  adminViewPeriods.style.display  = isPeriods  ? "block" : "none";
  adminViewGenerate.style.display = isGenerate ? "block" : "none";
  adminViewUsers.style.display    = isUsers    ? "block" : "none";
  adminViewNotices.style.display  = isNotices  ? "block" : "none";

  adminTabPeriods.classList.toggle("is-active", isPeriods);
  adminTabGenerate.classList.toggle("is-active", isGenerate);
  adminTabUsers.classList.toggle("is-active", isUsers);
  adminTabNotices.classList.toggle("is-active", isNotices);

  if (isNotices) loadAdminNotices();
}

if (adminTabPeriods) adminTabPeriods.addEventListener("click", () => showAdminTab("periods"));
if (adminTabGenerate) adminTabGenerate.addEventListener("click", () => showAdminTab("generate"));

    // [ADMIN-UI-4] Users tab
if (adminTabUsers) {
  adminTabUsers.addEventListener("click", () => {
    showAdminTab("users");
    loadAdminUsers();
  });
}

if (adminTabNotices) {
  adminTabNotices.addEventListener("click", () => {
    showAdminTab("notices");
  });
}

/* =========================================================
   5B) NOTICES (blocking unread + bell history)
   Uses: #noticeUnreadModal, #noticeAllModal, #noticeBellDot
   ========================================================= */

let noticesCache = [];       // latest first
let blockingNoticeIds = [];  // ids of notices not acknowledged at current version
let unreadCount = 0;

function getNoticeBody(n){
  const wantEs = (currentLang === "es");
  if (wantEs && n.body_es && String(n.body_es).trim()) return n.body_es;
  return n.body_en || "";
}

function isNoticeAcked(n){
  // Must have an acknowledgement timestamp
  if (!n.acknowledged_at) return false;

  // If an ack version exists, it must match the notice version
  if (
    n.ack_version != null &&
    Number(n.ack_version) !== Number(n.version)
  ) {
    return false;
  }

  return true;
}

async function fetchNoticeAcksForAdmin(noticeId){
  const { data, error } = await supabaseClient
    .rpc("admin_get_notice_acks", { p_notice_id: noticeId });

  if (error) throw error;

  // Normalize the RPC result: the function returns a single row object
  // with { acked: [...], pending: [...] } -- sometimes Supabase returns
  // an array of rows, so handle both shapes and return the acked list.
  const res = Array.isArray(data) ? (data[0] || { acked: [], pending: [] }) : (data || { acked: [], pending: [] });
  try { console.debug('fetchNoticeAcksForAdmin -> noticeId', noticeId, 'res', res); } catch(e) {}
  return res.acked || [];
}


async function fetchNoticesForMe(){
  if (!currentUser) return [];

  const pin = getSessionPinOrThrow();

const { data, error } = await supabaseClient.rpc(
  "get_notices_for_user",
  {
    p_user_id: currentUser.id
  }
);
  if (error) throw error;

  // De-dupe by notice id
const map = new Map();
for (const row of (data || [])){
  const key = String(row.id);
  const prev = map.get(key);
  if (!prev) {
    map.set(key, row);
    continue;
  }

  // Prefer the row with the newest updated_at
  const prevT = prev.updated_at ? new Date(prev.updated_at).getTime() : 0;
  const rowT  = row.updated_at  ? new Date(row.updated_at).getTime()  : 0;

  if (rowT > prevT) map.set(key, row);
}


return [...map.values()].sort((a,b) => new Date(b.updated_at) - new Date(a.updated_at));
}

function computeNoticeState(list){
  noticesCache = Array.isArray(list) ? list : [];
  blockingNoticeIds = [];
  unreadCount = 0;

  for (const n of noticesCache){
    // Inactive notices never count
    if (n.is_active === false) continue;

    const acked = isNoticeAcked(n);

    if (!acked){
      unreadCount++;

      // Blocking notices MUST carry id + version
      blockingNoticeIds.push({
        id: n.id,
        version: n.version
      });
    }
  }
}
console.log("Blocking notices:", blockingNoticeIds);
console.log("Unread count:", unreadCount);

console.table(noticesCache.map(n => ({
  id: n.id,
  version: n.version,
  acked_at: n.acknowledged_at,
  acked: isNoticeAcked(n)
})));

function updateNoticeBell(){
  if (!noticeBell || !noticeBellDot) return;

  if (!currentUser){
    noticeBell.style.display = "none";
    noticeBellDot.style.display = "none";
    return;
  }

  noticeBell.style.display = "inline-flex";
  noticeBellDot.style.display = (unreadCount > 0) ? "inline" : "none";
}

function openUnreadModal(){
  if (!noticeUnreadModal) return;

  renderUnreadList();

  document.body.classList.add("modal-open");
  noticeUnreadModal.style.display = "flex";
  noticeUnreadModal.setAttribute("aria-hidden","false");
}

function closeUnreadModal(){
  if (!noticeUnreadModal) return;

  noticeUnreadModal.style.display = "none";
  noticeUnreadModal.setAttribute("aria-hidden","true");
  updateBodyModalOpen();
}

function openAllNoticesModal(){
  if (!noticeAllModal) return;

  renderAllNoticesList();

  document.body.classList.add("modal-open");
  noticeAllModal.style.display = "flex";
  noticeAllModal.setAttribute("aria-hidden","false");
}

function closeAllNoticesModal(){
  if (!noticeAllModal) return;

  noticeAllModal.style.display = "none";
  noticeAllModal.setAttribute("aria-hidden","true");
  updateBodyModalOpen();
}

function renderUnreadList(){
  if (!noticeUnreadList) return;

const unread = (noticesCache || []).filter(n => n.is_active !== false && !isNoticeAcked(n));

  if (!unread.length){
    noticeUnreadList.innerHTML = `<div class="subtitle">No unread notices.</div>`;
    return;
  }

  noticeUnreadList.innerHTML = unread.map(n => {
    const body = escapeHtml(getNoticeBody(n)).replace(/\n/g, "<br>");
    const when = n.updated_at ? new Date(n.updated_at).toLocaleString("en-GB") : "";
    const who = escapeHtml(n.created_by_name || "—");

    return `
      <div class="notice-card">
        <div class="notice-title">${escapeHtml(n.title || "Notice")}</div>
        <div class="notice-meta">By ${who} · ${when} <span class="notice-pill unread" style="margin-left:6px;">NEW</span></div>
        <div class="notice-body">${body}</div>
      </div>
    `;
  }).join("");
}

function filterNoticesForUser(list){
  if (!currentUser) return [];

  // Your app uses role_id: 1/2/3
  const myRoleId = Number(currentUser.role_id);

  return (list || []).filter(n => {
    // If targeting is explicitly all, or targeting is not set, show it
    if (n.target_all === true || n.target_all == null) return true;

    // Parse target_roles in multiple possible shapes:
    // - array of ints (normal)
    // - Postgres array text like '{1,2}'
    // - JSON string like '[1,2]'
    // - a single numeric string '1'
    let roles = [];

    if (Array.isArray(n.target_roles)) {
      roles = n.target_roles.map(Number);
    } else if (typeof n.target_roles === 'string') {
      const s = n.target_roles.trim();
      // postgres array format {1,2}
      if (s.startsWith('{') && s.endsWith('}')) {
        roles = s.slice(1,-1).split(',').map(x => Number(x)).filter(Boolean);
      } else {
        // try JSON parse or comma-split
        try {
          const parsed = JSON.parse(s);
          if (Array.isArray(parsed)) roles = parsed.map(Number).filter(Boolean);
          else if (!isNaN(Number(parsed))) roles = [Number(parsed)];
        } catch (err) {
          roles = s.split(',').map(x => Number(x.trim())).filter(Boolean);
        }
      }
    }

    // If no roles specified, keep previous behavior and consider visible
    if (!roles.length) return true;

    // Debugging help: if current user's role is missing, log once
    if (isNaN(myRoleId)) {
      console.warn('filterNoticesForUser: currentUser.role_id is missing or invalid', currentUser);
      return false;
    }

    return roles.includes(myRoleId);
  });
}

function renderAllNoticesList(){
  if (!noticeAllList) return;

  // IMPORTANT: only show notices the current user is allowed to see
  const visible = filterNoticesForUser(noticesCache);

  // Debug: show why each notice is visible for current user
  try {
    console.debug('renderAllNoticesList - currentUser.role_id', currentUser?.role_id);
    console.table((visible || []).map(n => ({ id: n.id, title: n.title, target_all: n.target_all, target_roles: n.target_roles })));
  } catch (err) { /* ignore */ }

  if (!visible.length){
    noticeAllList.innerHTML = `<div class="subtitle">No notices.</div>`;
    return;
  }

  noticeAllList.innerHTML = visible.map(n => {
    const acked = isNoticeAcked(n);
    const body  = escapeHtml(getNoticeBody(n)).replace(/\n/g, "<br>");
    const when  = n.updated_at ? new Date(n.updated_at).toLocaleString("en-GB") : "";
    const who   = escapeHtml(n.created_by_name || "Unknown");

    const pill = acked
      ? `<span class="notice-pill">Acknowledged</span>`
      : `<span class="notice-pill unread">New</span>`;

    return `
      <div class="notice-card">
        <div style="display:flex; justify-content:space-between; gap:10px; align-items:flex-start;">
          <div style="min-width:0;">
            <div class="notice-title">${escapeHtml(n.title || "Notice")}</div>
            <div class="notice-meta">By ${who}${when ? " · " + when : ""}</div>
          </div>
          <div>${pill}</div>
        </div>

        <div class="notice-body" style="margin-top:8px;">${body}</div>

        ${acked ? "" : `
          <div style="display:flex; justify-content:flex-end; margin-top:10px;">
            <button type="button" class="primary" data-ack="${n.id}" style="min-width:auto;">
              Acknowledge
            </button>
          </div>
        `}
      </div>
    `;
  }).join("");
}



async function adminFetchNoticeAcks(noticeId){
  const pin = getSessionPinOrThrow();

  const { data, error } = await supabaseClient.rpc("admin_get_notice_acks", {
    p_admin_id: currentUser.id,
    p_pin: pin,
    p_notice_id: noticeId
  });

  if (error) throw error;

  // Normalize response: Supabase may return an array (rows) or a single object
  const res = Array.isArray(data) ? (data[0] || { acked: [], pending: [] }) : (data || { acked: [], pending: [] });
  return res;
}

// Admin-only: fetch ack counts for a set of notices via RPC
async function adminFetchNoticeAckCounts(noticeIds){
  if (!Array.isArray(noticeIds) || noticeIds.length === 0) return [];

  const { data, error } = await supabaseClient.rpc("admin_notice_ack_counts", {
    p_notice_ids: noticeIds
  });

  if (error) throw error;

  // debug: log counts to help trace mismatches
  try { console.debug('adminFetchNoticeAckCounts -> raw data', data); } catch(e){}

  return data || [];
}

// Update admin cache and visible DOM for a single notice id
function updateAdminNoticeCountsForId(noticeId, counts){
  try {
    const idStr = String(noticeId);
    const noticeObj = adminNoticesCache.find(n => String(n.id) === idStr);

    const newAckCount = counts && typeof counts.ack_count !== 'undefined' ? Number(counts.ack_count) : NaN;
    const newAckTotal = counts && typeof counts.ack_total !== 'undefined' ? Number(counts.ack_total) : NaN;

    if (noticeObj){
      // Only overwrite ack_count if we have a valid new value
      if (!isNaN(newAckCount)) noticeObj.ack_count = newAckCount;
      // Never allow ack_total to decrease - prefer the larger known total
      if (!isNaN(newAckTotal)) noticeObj.ack_total = Math.max(Number(noticeObj.ack_total) || 0, newAckTotal);
    } else {
      // If notice isn't in cache, add a minimal entry (don't allow NaN)
      adminNoticesCache.push({
        id: noticeId,
        ack_count: !isNaN(newAckCount) ? newAckCount : 0,
        ack_total: !isNaN(newAckTotal) ? newAckTotal : 0
      });
    }

    const countSpan = document.querySelector(`[data-ack-count="${idStr}"]`);
    if (countSpan) countSpan.textContent = String(noticeObj?.ack_count ?? (isNaN(newAckCount) ? 0 : newAckCount));
    const totalSpan = document.querySelector(`[data-ack-total="${idStr}"]`);
    if (totalSpan) totalSpan.textContent = String(noticeObj?.ack_total ?? (isNaN(newAckTotal) ? 0 : newAckTotal));

    // Force a re-render of admin list if necessary
    if (typeof renderAdminNotices === 'function') renderAdminNotices();
  } catch (e) {
    console.warn('updateAdminNoticeCountsForId failed', noticeId, e);
  }
}

function renderAckList(container, list){
  if (!container) return;

  if (!list?.length){
    container.innerHTML = `<div class="subtitle">None</div>`;
    return;
  }

  container.innerHTML = list.map(x => {
    const nm = escapeHtml(x.name || "");
    const when = x.acknowledged_at ? ` <span class="subtitle">(${new Date(x.acknowledged_at).toLocaleString("en-GB")})</span>` : "";
    return `<div><span class="ack-pill">${nm}</span>${when}</div>`;
  }).join("");
}


async function refreshNotices(){
const list = await fetchNoticesForMe();
const visible = filterNoticesForUser(list);
computeNoticeState(visible);
  updateNoticeBell();
}

async function ackOneNotice(noticeId, noticeVersion){
  if (!currentUser) return;

  const { error } = await supabaseClient.rpc("ack_notice", {
    p_notice_id: noticeId,
    p_user_id: currentUser.id,
    p_version: noticeVersion
  });

  if (error) throw error;

  // Refresh local notices and, if viewing as admin, refresh the ack counts for this notice
  try {
    await refreshNotices();

    if (currentUser?.is_admin && typeof adminFetchNoticeAckCounts === 'function'){
      try {
        const counts = await adminFetchNoticeAckCounts([noticeId]);
        const c = Array.isArray(counts) && counts[0] ? counts[0] : null;
        if (c) updateAdminNoticeCountsForId(noticeId, c);
      } catch (e){
        console.warn('Failed to refresh admin ack counts for notice', noticeId, e);
      }
    }
  } catch (e) {
    console.warn('post-ack refresh failed', e);
  }
}




async function refreshNoticesAndMaybeBlock(){
  if (!currentUser){
    noticesCache = [];
    blockingNoticeIds = [];
    unreadCount = 0;
    updateNoticeBell();
    return;
  }

  try {
  await refreshNotices();

    // Block editing until unread are acknowledged
    if (blockingNoticeIds.length > 0){
      openUnreadModal();
    }
  } catch (e) {
    console.error("Notices load failed:", e);
    // Do not brick the app if notices fail
  }
}

/* ---- UI wiring ---- */

// Bell opens the history modal
noticeBell?.addEventListener("click", (e) => {
  e.preventDefault();
  e.stopPropagation();
  if (!currentUser) return;
  openAllNoticesModal();
});

// Admin-only: load ack lists when the "Acknowledged by" row is clicked.
// (toggle event doesn't bubble, so we use click delegation)
noticeAllList?.addEventListener("click", async (e) => {
  const summary = e.target.closest("summary");
  if (!summary) return;

  const details = summary.closest("details.notice-acks");
  if (!details) return;

  // Wait a tick so details.open reflects the new state after click
  setTimeout(async () => {
    if (!details.open) return;
    if (details.dataset.loaded === "1") return;

    const noticeId = details.dataset.ackId;
    const ackedBox = details.querySelector('[data-ack-list="acked"]');
    const pendBox  = details.querySelector('[data-ack-list="pending"]');

    try {
      details.dataset.loaded = "1";
      const { acked, pending } = await adminFetchNoticeAcks(noticeId);
      renderAckList(ackedBox, acked);
      renderAckList(pendBox, pending);

      // Update admin counts immediately from the detailed lists
      try {
        const ac = Array.isArray(acked) ? acked.length : 0;
        const at = ac + (Array.isArray(pending) ? pending.length : 0);
        updateAdminNoticeCountsForId(noticeId, { ack_count: ac, ack_total: at });
      } catch (e){
        console.warn('Failed to update counts after loading ack list', noticeId, e);
      }
    } catch (err) {
      console.error(err);
      details.dataset.loaded = "0";
      if (ackedBox) ackedBox.textContent = "Failed to load.";
      if (pendBox) pendBox.textContent  = "Failed to load.";
    }
  }, 0);
});


noticeAllClose?.addEventListener("click", closeAllNoticesModal);
noticeAllModal?.addEventListener("click", (e) => {
  if (e.target === noticeAllModal) closeAllNoticesModal();
});

// Acknowledge single from ALL modal (event delegation)
noticeAllList?.addEventListener("click", async (e) => {
  const btn = e.target.closest("button[data-ack]");
  if (!btn) return;

  const id = String(btn.dataset.ack);

  // Find the notice so we know the current version
  const n = (noticesCache || []).find(x => String(x.id) === id);
  if (!n) {
    alert("Notice not found in cache. Reload and try again.");
    return;
  }

  try {
    btn.disabled = true;

    // Pass id + version
    await ackOneNotice(n.id, n.version);

    // Refresh local state + UI
await refreshNotices();
    renderAllNoticesList();

    // If that cleared blocking notices, close the blocking modal
    if (blockingNoticeIds.length === 0 && noticeUnreadModal?.style.display === "flex") {
      closeUnreadModal();
    }

    applyUnlockState();
  } catch (err) {
    console.error(err);
    alert("Failed to acknowledge notice.");
  } finally {
    btn.disabled = false;
  }
});


// Blocking modal: acknowledge ALL
noticeUnreadAcknowledge?.addEventListener("click", async () => {
  if (!blockingNoticeIds.length) return;

  try {
    noticeUnreadAcknowledge.disabled = true;

    // 1. Acknowledge all blocking notices
    for (const n of blockingNoticeIds){
      await ackOneNotice(n.id, n.version);
    }

    // 2. Re-fetch notices from DB
    const list = await fetchNoticesForMe();

    // 3. Recompute notice state (THIS CLEARS blockingNoticeIds)
    computeNoticeState(list);

    // 4. Update UI
    updateNoticeBell();
    closeUnreadModal();
    applyUnlockState();

  } catch (e) {
    console.error(e);
    alert("Failed to acknowledge notices.");
  } finally {
    noticeUnreadAcknowledge.disabled = false;
  }
});


/* =========================================================
   [ADMIN-USERS-1] ADMIN USERS CRUD (Add/Edit/Deactivate)
   ========================================================= */

let adminUsersCache = [];
let adminNoticesCache = [];
let editingNotice = null;
let adminEditingUserId = null;

async function loadAdminNotices(){
  if (!currentUser?.is_admin) return;

const { data, error } = await supabaseClient
  .from("notices")
  .select(`
    id,
    title,
    body_en,
    body_es,
    version,
    is_active,
    updated_at,
    created_by,
    target_all,
    target_roles,
    users:created_by ( name )
  `)
  .order("updated_at", { ascending: false });


  if (error){
    console.error(error);
    alert("Failed to load notices");
    return;
  }

  adminNoticesCache = data || [];

  // Fetch ack counts (batched RPC) and merge into cache
  try {
    const ids = (adminNoticesCache || []).map(n => n.id).filter(Boolean);
    if (ids.length) {
      const counts = await adminFetchNoticeAckCounts(ids);
      console.debug('adminNoticeCounts fetched', counts);
      const map = new Map((counts || []).map(r => [String(r.notice_id), { ack_count: Number(r.ack_count), ack_total: Number(r.ack_total) }]));
      adminNoticesCache.forEach(n => {
        const c = map.get(String(n.id));
        n.ack_count = c?.ack_count ?? 0;
        n.ack_total = c?.ack_total ?? 0;
      });
      console.debug('adminNoticesCache after merge', adminNoticesCache.map(n => ({id:n.id, ack_count:n.ack_count, ack_total:n.ack_total})));

      // Extra verification: sometimes the batched RPC can return 0 for ack_count
      // even though detailed ack lists show entries. For robustness, for any
      // notice where the server says there are recipients (ack_total > 0)
      // but the ack_count is zero, fetch the per-notice ack list and correct it.
      try {
        const verifyIds = (adminNoticesCache || []).filter(n => Number(n.ack_total) > 0 && (!n.ack_count || Number(n.ack_count) === 0)).map(n => n.id);
        if (verifyIds.length){
          for (const id of verifyIds){
            try {
              const { acked, pending } = await adminFetchNoticeAcks(id);
              const ac = Array.isArray(acked) ? acked.length : 0;
              const at = (Array.isArray(acked) ? acked.length : 0) + (Array.isArray(pending) ? pending.length : 0);
              updateAdminNoticeCountsForId(id, { ack_count: ac, ack_total: at });
            } catch (e){
              console.warn('verifyAdminCounts failed for', id, e);
            }
          }
          console.debug('verifyAdminCounts completed for', verifyIds);
        }
      } catch (e){
        console.warn('verifyAdminCounts overall error', e);
      }
    }
  } catch (err) {
    console.error('Failed to fetch notice ack counts', err);
  }

  renderAdminNotices();
}
function openAdminNoticeModal(){
  document.body.classList.add("modal-open");
  adminNoticeModal.style.display = "flex";
  adminNoticeModal.setAttribute("aria-hidden","false");
}

function closeAdminNoticeModal(){
  adminNoticeModal.style.display = "none";
  adminNoticeModal.setAttribute("aria-hidden","true");
  updateBodyModalOpen();
}

function clearNoticeEditor(){
  editingNotice = null;

  if (adminNoticeTitle) adminNoticeTitle.textContent = "New notice";
  if (adminNoticeTitleInput) adminNoticeTitleInput.value = "";
  if (adminNoticeBodyEn) adminNoticeBodyEn.value = "";
  if (adminNoticeBodyEs) adminNoticeBodyEs.value = "";

  if (noticeTargetAll) noticeTargetAll.checked = true;
  noticeRoleChks.forEach(chk => chk.checked = false);
}

function hydrateNoticeTargetsFromNotice(notice){
  // If your notices table stores target_roles as int[] and target_all as boolean
  const targetAll = !!notice.target_all;
  const roles = Array.isArray(notice.target_roles) ? notice.target_roles.map(Number) : [];

  if (noticeTargetAll) noticeTargetAll.checked = targetAll;
  noticeRoleChks.forEach(chk => {
    chk.checked = roles.includes(Number(chk.value));
  });
}

function readNoticeTargetsFromUI(){
  let targetAll = !!noticeTargetAll?.checked;
  const roles = noticeRoleChks
    .filter(chk => chk.checked)
    .map(chk => Number(chk.value))
    .filter(n => [1,2,3].includes(n));

  // If the admin selected specific roles, force target_all = false so the
  // notice is restricted to those roles only.
  if (roles.length > 0) targetAll = false;

  return { target_all: targetAll, target_roles: roles };
}

function openAdminNoticeEditor(notice){
  if (!currentUser?.is_admin) return;

  if (!notice){
    clearNoticeEditor();
    editingNotice = null;
    openAdminNoticeModal();
    return;
  }

  editingNotice = notice;

  if (adminNoticeTitle) adminNoticeTitle.textContent = "Edit notice";
  if (adminNoticeTitleInput) adminNoticeTitleInput.value = notice.title || "";
  if (adminNoticeBodyEn) adminNoticeBodyEn.value = notice.body_en || "";
  if (adminNoticeBodyEs) adminNoticeBodyEs.value = notice.body_es || "";

  hydrateNoticeTargetsFromNotice(notice);

  openAdminNoticeModal();
}
function renderAdminNotices(){
  if (!adminNoticesList) return;

  const q = (adminNoticeSearch?.value || "").trim().toLowerCase();
  const showInactive = !!adminShowInactiveNotices?.checked;

  let rows = adminNoticesCache.slice();
  if (!showInactive) rows = rows.filter(n => n.is_active !== false);
  if (q) rows = rows.filter(n => (n.title || "").toLowerCase().includes(q));

  if (!rows.length){
    adminNoticesList.innerHTML =
      `<div class="subtitle" style="padding:12px;">No notices.</div>`;
    return;
  }

  adminNoticesList.innerHTML = rows.map(n => {
    const createdBy = escapeHtml(n.users?.name || "Unknown");
    const when = n.updated_at
      ? new Date(n.updated_at).toLocaleDateString("en-GB")
      : "";

    const ackCount = n.ack_count ?? 0;
    const ackTotal = n.ack_total ?? 0;

    return `
      <div class="notice-row"
           data-id="${n.id}"
           style="padding:12px; border-bottom:1px solid #eee;">

        <!-- HEADER -->
        <div style="display:flex; gap:10px; align-items:flex-start;">
          <div style="flex:1; min-width:0;">
            <div style="font-weight:800;">${escapeHtml(n.title)}</div>

            <div style="font-size:11px; color:#667085; margin-top:4px;">
              v${n.version}
              · ${createdBy}
              · ${when}
              ${!n.is_active
                ? `<span class="notice-pill" style="margin-left:6px;">Inactive</span>`
                : ``}
            </div>
          </div>

          <div style="display:flex; gap:6px;">
            <button data-act="edit">Edit</button>
            <button data-act="toggle">${n.is_active ? "Hide" : "Unhide"}</button>
            <button data-act="delete">Delete</button>
          </div>
        </div>

        <!-- ACKNOWLEDGED BY (ADMIN ONLY) -->
        <div class="ack-summary" style="margin-top:8px;">
          <button type="button"
                  class="ghost"
                  data-ack-toggle="${n.id}"
                  style="padding:6px 10px; border-radius:999px; font-size:12px;">
            Acknowledged:
            <span data-ack-count="${n.id}">${ackCount ?? "—"}</span>
            <span class="muted"> / </span>
            <span data-ack-total="${n.id}">${ackTotal ?? "—"}</span>
            <span class="muted"> · View</span>
          </button>

          <div id="ack-list-${n.id}"
               class="ack-list"
               style="display:none; margin-top:8px; padding:10px; border:1px solid #e5e7eb; border-radius:12px;">
            <div class="subtitle">Loading…</div>
          </div>
        </div>

      </div>
    `;
  }).join("");
}



async function adminUpsertNotice(payload){
  const pin = getSessionPinOrThrow();

  // Enforce: if roles are supplied we treat this as targeted (target_all=false).
  const targetRoles = Array.isArray(payload.target_roles) ? payload.target_roles : [];
  const targetAll = !!payload.target_all && targetRoles.length === 0;

  const { data, error } = await supabaseClient.rpc("admin_upsert_notice", {
    p_admin_id: currentUser.id,
    p_pin: pin,
    p_notice_id: payload.id || null,
    p_title: payload.title,
    p_body_en: payload.body_en,
    p_body_es: payload.body_es,
    p_target_all: targetAll,
    p_target_roles: targetRoles
  });

  if (error) throw error;
  return data; // notice id
}

async function toggleAdminNoticeActive(notice){
  const pin = getSessionPinOrThrow();

  const next = (notice.is_active === false) ? true : false;
  const ok = confirm(`${next ? "Unhide" : "Hide"} "${notice.title}"?`);
  if (!ok) return;

  const { error } = await supabaseClient.rpc("admin_set_notice_active", {
    p_admin_id: currentUser.id,
    p_pin: pin,
    p_notice_id: notice.id,
    p_active: next
  });

  if (error) throw error;

  await loadAdminNotices();
}

async function deleteAdminNotice(notice){
  const pin = getSessionPinOrThrow();

  const ok = confirm(`Delete "${notice.title}"?\n\nThis cannot be undone.`);
  if (!ok) return;

  const { error } = await supabaseClient.rpc("admin_delete_notice", {
    p_admin_id: currentUser.id,
    p_pin: pin,
    p_notice_id: notice.id
  });

  if (error) throw error;

  await loadAdminNotices();
}


async function loadAdminUsers(){
  if (!adminUsersList) return;

  adminUsersList.textContent = "Loading users…";

  const { data, error } = await supabaseClient
    .from("users")
    .select("id, name, role_id, is_admin, is_active, roles(name)")
  .order("created_at", { ascending: true })

  if (error) {
    console.error(error);
    adminUsersList.textContent = "Failed to load users.";
    return;
  }

  adminUsersCache = data || [];
  renderAdminUsers();
}

function renderAdminUsers(){
  if (!adminUsersList) return;

  const q = (adminUserSearch?.value || "").trim().toLowerCase();
  const showInactive = !!adminShowInactiveUsers?.checked;

  let rows = adminUsersCache.slice();
  if (!showInactive) rows = rows.filter(u => u.is_active !== false);
  if (q) rows = rows.filter(u => (u.name || "").toLowerCase().includes(q));

  if (!rows.length){
    adminUsersList.innerHTML = `<div class="subtitle" style="margin-top:8px;">No users.</div>`;
    return;
  }

  const groups = [
    { title: "Charge Nurses", role_id: 1 },
    { title: "Staff Nurses", role_id: 2 },
    { title: "Nursing Assistants", role_id: 3 },
  ];

  const html = [];

  for (const g of groups){
    const members = rows.filter(u => Number(u.role_id) === g.role_id);
    if (!members.length) continue;

    html.push(`<div class="user-group-title">${g.title}</div>`);

    html.push(members.map(u => {
      return `
        <div class="user-row">
          <div class="user-meta">
            <div class="user-name">
              ${escapeHtml(u.name || "")}
              ${u.is_admin ? `<span class="user-tag admin">admin</span>` : ""}
              ${u.is_active === false ? `<span class="user-tag inactive">inactive</span>` : ""}
            </div>
          </div>

          <div class="user-actions">
            <button type="button" data-act="edit" data-id="${u.id}">Edit</button>
            <button type="button" data-act="toggle" data-id="${u.id}">
              ${u.is_active === false ? "Reactivate" : "Deactivate"}
            </button>
          </div>
        </div>
      `;
    }).join(""));
  }

  adminUsersList.innerHTML = html.join("");
}
function clearUserEditor(){
  adminEditingUserId = null;
  if (adminEditUserName) adminEditUserName.value = "";
  if (adminEditUserRole) adminEditUserRole.value = "2";
  if (adminEditUserPin)  adminEditUserPin.value = "";
  if (adminUserEditHelp) adminUserEditHelp.textContent = "Fill details and click Save.";
}

function startEditUser(userId){
  const u = adminUsersCache.find(x => x.id === userId);
  if (!u) return;

  adminEditingUserId = u.id;
  adminEditUserName.value = u.name || "";
  adminEditUserRole.value = String(u.role_id || 2);
  adminEditUserPin.value = "";
  adminUserEditHelp.textContent = "Leave PIN blank to keep current PIN.";
}

async function toggleUserActive(userId){
  const u = adminUsersCache.find(x => x.id === userId);
  if (!u) return;

  const next = (u.is_active === false) ? true : false;
  const ok = confirm(`${next ? "Reactivate" : "Deactivate"} ${u.name}?`);
  if (!ok) return;

  const pin = getSessionPinOrThrow(); // 🔑 THIS WAS MISSING

  const { error } = await supabaseClient.rpc("set_user_active", {
    p_admin_id: currentUser.id,
    p_pin: pin,
    p_user_id: userId,
    p_active: next
  });

  if (error){
    console.error(error);
    alert("Update failed.");
    return;
  }

  await loadRota();
  await loadAdminUsers();
}


/* =========================================================
   [ADMIN-USERS-2] Wire UI events for Users tab
   ========================================================= */

adminUserSearch?.addEventListener("input", renderAdminUsers);
adminShowInactiveUsers?.addEventListener("change", renderAdminUsers);

adminUsersList?.addEventListener("click", (e) => {
  const btn = e.target.closest("button[data-act]");
  if (!btn) return;

  const id = btn.dataset.id;
  const act = btn.dataset.act;

  if (act === "edit") startEditUser(id);
  if (act === "toggle") toggleUserActive(id);
});

adminAddUserBtn?.addEventListener("click", clearUserEditor);
adminCancelUserEditBtn?.addEventListener("click", clearUserEditor);

adminNoticesList?.addEventListener("click", async (e) => {
  // Handle "Acknowledged: View" toggles
  const ackBtn = e.target.closest("[data-ack-toggle]");
  if (ackBtn) {
    e.preventDefault();

    const noticeId = ackBtn.dataset.ackToggle;
    const box = document.getElementById(`ack-list-${noticeId}`);
    if (!box) return;

    const isOpen = box.style.display === "block";
    box.style.display = isOpen ? "none" : "block";

    // keep aria in sync
    if (ackBtn && ackBtn.setAttribute) ackBtn.setAttribute('aria-expanded', String(!isOpen));

    if (isOpen) return;

    // already loaded once
    if (box.dataset.loaded === "1") return;

    box.innerHTML = `<div class="subtitle">Loading…</div>`;

    try {
      const rows = await fetchNoticeAcksForAdmin(noticeId);

      if (!rows.length) {
        box.innerHTML = `<div class="subtitle">Nobody yet.</div>`;
      } else {
        box.innerHTML = `
          <div style="display:flex; flex-wrap:wrap; gap:8px;">
            ${rows.map(r => `
              <span class="ack-pill"
                    style="padding:6px 10px; border:1px solid #e5e7eb; border-radius:999px; font-size:12px;">
                ${escapeHtml(r.name || "Unknown")}
                <span class="muted" style="margin-left:6px;">
                  ${r.acknowledged_at
                    ? new Date(r.acknowledged_at).toLocaleString("en-GB")
                    : ""}
                </span>
              </span>
            `).join("")}
          </div>
        `;

        // Defensive: if the count shown is wrong, update it to the number of rows
        try {
          const countSpan = document.querySelector(`[data-ack-count="${noticeId}"]`);
          if (countSpan && Number(countSpan.textContent) !== rows.length) {
            console.debug('Mismatch detected: fixing ack count for', noticeId, 'to', rows.length);
            countSpan.textContent = String(rows.length);
            // update cache too
            const noticeObj = adminNoticesCache.find(n => String(n.id) === String(noticeId));
            if (noticeObj) noticeObj.ack_count = rows.length;
          }
        } catch (e) { console.warn('failed to update count fallback', e); }
      }

      box.dataset.loaded = "1";
    } catch (err) {
      console.error(err);
      box.innerHTML = `<div class="subtitle">Failed to load.</div>`;
    }

    return;
  }

  // Handle admin action buttons (Edit / Hide / Delete)
  const btn = e.target.closest("button[data-act]");
  if (!btn) return;

  const act = btn.dataset.act;
  const row = btn.closest('.notice-row');
  const id = row?.dataset.id;
  const notice = adminNoticesCache.find(n => String(n.id) === String(id));
  if (!notice) return;

  try {
    btn.disabled = true;

    if (act === 'edit') {
      openAdminNoticeEditor(notice);
    } else if (act === 'toggle') {
      await toggleAdminNoticeActive(notice);
    } else if (act === 'delete') {
      await deleteAdminNotice(notice);
    }
  } catch (err) {
    console.error(err);
    alert("Action failed. Check console.");
  } finally {
    btn.disabled = false;
  }
});


adminNoticeSave?.addEventListener("click", async () => {
  if (!currentUser?.is_admin) return;

  const title = (adminNoticeTitleInput?.value || "").trim();
  const bodyEn = (adminNoticeBodyEn?.value || "").trim();
  const bodyEs = (adminNoticeBodyEs?.value || "").trim();
  

  if (!title) return alert("Title is required.");
  if (!bodyEn) return alert("English body is required.");

  const targets = readNoticeTargetsFromUI();

  try {
    adminNoticeSave.disabled = true;

    await adminUpsertNotice({
      id: editingNotice?.id || null,
      title,
      body_en: bodyEn,
      body_es: bodyEs || null,
      target_all: targets.target_all,
      target_roles: targets.target_roles
    });

    closeAdminNoticeModal();
    editingNotice = null;

    await loadAdminNotices();
    alert("Notice saved.");

  } catch (e) {
    console.error(e);
    alert("Failed to save notice. Check console.");
  } finally {
    adminNoticeSave.disabled = false;
  }
});

adminAddNoticeBtn?.addEventListener("click", () => {
  openAdminNoticeEditor(null);
});

adminNoticeCancel?.addEventListener("click", closeAdminNoticeModal);

adminNoticeModal?.addEventListener("click", (e) => {
  if (e.target === adminNoticeModal) closeAdminNoticeModal();
});

// Search + show inactive (client-side filter)
adminNoticeSearch?.addEventListener("input", renderAdminNotices);
adminShowInactiveNotices?.addEventListener("change", renderAdminNotices);

// Target UI convenience: if "All users" checked, clear role checks
noticeTargetAll?.addEventListener("change", () => {
  if (noticeTargetAll.checked){
    noticeRoleChks.forEach(chk => chk.checked = false);
  }
});

// If any role checkbox checked, uncheck "All users"
noticeRoleChks.forEach(chk => {
  chk.addEventListener("change", () => {
    if (chk.checked && noticeTargetAll) noticeTargetAll.checked = false;
  });
});

/* =========================================================
   [ADMIN-USERS-3] Save user (insert/update + optional PIN)
   ========================================================= */

adminSaveUserBtn?.addEventListener("click", async () => {
  const name = adminEditUserName.value.trim();
  const role_id = Number(adminEditUserRole.value);
  const pin = (adminEditUserPin.value || "").trim();

  if (!name) return alert("Name is required.");
  if (![1,2,3].includes(role_id)) return alert("Role invalid.");
  if (pin && !/^\d{4}$/.test(pin)) return alert("PIN must be 4 digits.");

  try {
    const { data: userId, error } = await supabaseClient.rpc("admin_upsert_user", {
      p_user_id: adminEditingUserId, // null = add
      p_name: name,
      p_role_id: role_id
    });
    if (error) throw error;

    if (pin) await adminSetUserPin(userId, pin);

    await loadRota();
    await loadAdminUsers();
    clearUserEditor();
    alert("Saved.");
  } catch (e) {
    console.error(e);
    alert("Save failed. Check console.");
  }
});

/* =========================================================
   [ADMIN-USERS-4] PIN setter via RPC (recommended)
   ========================================================= */
async function adminSetUserPin(userId, pin){
  const { error } = await supabaseClient.rpc("set_user_pin", {
    p_user_id: userId,
    p_pin: pin
  });
  if (error) throw error;
}

/* =========================
   ADMIN PERIODS (v2 dropdown)
   ========================= */

if (adminPeriodSelect) {
  adminPeriodSelect.addEventListener("change", async () => {
    adminSelectedPeriodId = adminPeriodSelect.value;
    renderAdminPeriodMeta(adminSelectedPeriodId);
    renderAdminCloseTime(adminSelectedPeriodId); 
    await loadAdminWeeks(adminSelectedPeriodId);
  });
}

if (adminSetActiveBtn) {
  adminSetActiveBtn.addEventListener("click", async () => {
    if (!adminSelectedPeriodId) return;
    try {
      await setActivePeriod(adminSelectedPeriodId);
      await loadRota(); // refresh main view
      await loadAdminPeriodsForDropdown(); // refresh admin UI
      renderAdminCloseTime(adminSelectedPeriodId)
    } catch (e) {
      console.error(e);
      alert("Set active failed. Check console.");
    }
  });
}

if (adminToggleHiddenBtn) {
  adminToggleHiddenBtn.addEventListener("click", async () => {
    if (!adminSelectedPeriodId) return;
    try {
      await toggleHiddenPeriod(adminSelectedPeriodId);
      await loadRota(); // refresh main view
      await loadAdminPeriodsForDropdown(); // refresh admin UI
    } catch (e) {
      console.error(e);
      alert("Toggle hidden failed. Check console.");
    }
  });
}

async function loadAdminPeriodsForDropdown(){
  if (!adminPeriodSelect) return;

  adminPeriodMeta.textContent = "Loading…";
  adminWeeksList.textContent = "Loading…";

  let periods;
  try {
    periods = await fetchRotaPeriods(); // admin sees all
  } catch (e) {
    console.error(e);
    adminPeriodMeta.textContent = "Failed to load periods.";
    adminWeeksList.textContent = "Failed to load weeks.";
    return;
  }

  periodsCache = periods;

  // Fill dropdown
  adminPeriodSelect.innerHTML = "";
  for (const p of periods){
    const opt = document.createElement("option");
    opt.value = p.id;
    const s = fmt(new Date(p.start_date));
    const e = fmt(new Date(p.end_date));
    opt.textContent = `${s} – ${e}${p.is_active ? " ★" : ""}${p.is_hidden ? " (hidden)" : ""}`;
    adminPeriodSelect.appendChild(opt);
  }

  // Default selection
  if (!adminSelectedPeriodId) {
    const active = periods.find(p => p.is_active) || periods[periods.length - 1];
    adminSelectedPeriodId = active?.id || periods[0]?.id;
  }

  adminPeriodSelect.value = String(adminSelectedPeriodId);

  renderAdminPeriodMeta(adminSelectedPeriodId);
  await loadAdminWeeks(adminSelectedPeriodId);
  renderAdminCloseTime(adminSelectedPeriodId);
}

function renderAdminPeriodMeta(periodId){
  const p = periodsCache.find(x => String(x.id) === String(periodId));
  if (!p){
    adminPeriodMeta.textContent = "";
    return;
  }

  const bits = [];
  if (p.is_active) bits.push("✅ Active");
  if (p.is_hidden) bits.push("🙈 Hidden");
  adminPeriodMeta.textContent = bits.join(" · ") || "—";
}

async function loadAdminWeeks(periodId){
  adminWeeksList.textContent = "Loading weeks…";

  // Pull all dates for the period, but we only need them to discover the weeks + open state
  const { data, error } = await supabaseClient
    .from("rota_dates")
.select("date, week_id, period_id, rota_weeks(id, open, open_after_close)")
    .eq("period_id", periodId)
    .order("date");

  if (error) {
    console.error(error);
    adminWeeksList.textContent = "Failed to load weeks.";
    return;
  }

  // Build unique weeks list from rota_dates (because rota_weeks doesn't have period_id)
const weekMap = new Map();

for (const row of (data || [])) {
  const w = row.rota_weeks;
  if (!w?.id) continue;

  // Compute week start/end from the date in rota_dates
  const ws = startOfWeekSunday(new Date(row.date));
  const we = addDays(ws, 6);

  if (!weekMap.has(w.id)) {
    weekMap.set(w.id, {
      weekId: w.id,
      open: !!w.open,
      openAfterClose: !!w.open_after_close,
      weekStart: ws,
      weekEnd: we
    });
  } else {
    const existing = weekMap.get(w.id);

    // Keep flags consistent (safety: if any row says closed, treat as closed)
    existing.open = existing.open && !!w.open;
    existing.openAfterClose = existing.openAfterClose && !!w.open_after_close;

    // Expand bounds in case of weird data ordering
    if (ws < existing.weekStart) existing.weekStart = ws;
    if (we > existing.weekEnd) existing.weekEnd = we;
  }
}

const weeks = [...weekMap.values()].sort((a,b) => a.weekStart - b.weekStart);


  if (!weeks.length){
    adminWeeksList.textContent = "No weeks found for this period.";
    return;
  }

  // Period lock (deadline)
  const p = periodsCache.find(x => String(x.id) === String(periodId));
  const periodClosed = isPeriodClosed(p);

  adminWeeksList.innerHTML = weeks.map(w => {
    const s = fmt(w.weekStart);
    const e = fmt(w.weekEnd);
   const isOpen = periodClosed ? !!w.openAfterClose : !!w.open;


    const pill = isOpen
      ? `<span style="display:inline-block; padding:2px 8px; border-radius:999px; font-size:11px; font-weight:800; background:#e9fff0; border:1px solid #9fe0b1; color:#0b6b2b;">OPEN</span>`
      : `<span style="display:inline-block; padding:2px 8px; border-radius:999px; font-size:11px; font-weight:800; background:#ffecec; border:1px solid #ffb3b3; color:#8a1f1f;">CLOSED</span>`;

const lockNote = `
  <div style="margin-top:4px; font-size:11px; color:#666;">
   ${isOpen ? "Requests open for staff" : "Requests locked for staff"} 
${periodClosed ? "(after close time)" : "(before close time)"}
  </div>
`;


    const btnText = isOpen ? "Close week" : "Open week";

    return `
      <div style="display:flex; justify-content:space-between; align-items:center; gap:10px; padding:10px 0; border-bottom:1px solid #eee;">
        <div>
          <div style="font-weight:800;">${s} – ${e}</div>
          <div style="margin-top:4px;">${pill}</div>
          ${lockNote}
        </div>

        <button type="button"
  class="week-toggle-btn"
  data-week-id="${w.weekId}"
  data-open="${w.open ? "1" : "0"}"
  data-open-after-close="${w.openAfterClose ? "1" : "0"}"
  data-period-closed="${periodClosed ? "1" : "0"}"
>
          ${btnText}
        </button>
      </div>
    `;
  }).join("");

// Bind toggles (admins can still manage weeks regardless of period close)
adminWeeksList.querySelectorAll("button[data-week-id]").forEach(btn => {
  btn.addEventListener("click", async () => {
    if (!currentUser?.is_admin) return;

    const pin = getSessionPinOrThrow();
    const weekId = btn.dataset.weekId;

    const open = btn.dataset.open === "1";
    const openAfterClose = btn.dataset.openAfterClose === "1";
    const periodClosed = btn.dataset.periodClosed === "1";

// ✅ Toggle the correct flag depending on whether period is closed
let nextOpen = open;
let nextOpenAfterClose = openAfterClose;

if (periodClosed) {
  nextOpenAfterClose = !openAfterClose;  // after deadline behavior
} else {
  nextOpen = !open;                      // normal behavior
}
    try {
      const { error } = await supabaseClient.rpc("admin_set_week_open_flags", {
        p_admin_id: currentUser.id,
        p_pin: pin,
        p_week_id: weekId,
        p_open: nextOpen,
        p_open_after_close: nextOpenAfterClose
      });
      if (error) throw error;

      await loadRota();
      await loadAdminWeeks(periodId); 
    } catch (e) {
      console.error(e);
      alert("Failed to toggle week. Check console.");
    }
  });
});
 }
/* =========================
   ADMIN PERIOD ACTIONS (v1)
   ========================= */
  
async function setActivePeriod(periodId){
  const pin = getSessionPinOrThrow();

  const { error } = await supabaseClient.rpc("admin_set_active_period", {
    p_admin_id: currentUser.id,
    p_pin: pin,
    p_period_id: periodId
  });

  if (error) throw error;
  activePeriodId = periodId;
}
    
async function toggleHiddenPeriod(periodId){
  if (!currentUser?.is_admin) throw new Error("Admin only.");
  const pin = getSessionPinOrThrow();

  const { error } = await supabaseClient.rpc("admin_toggle_hidden_period", {
    p_admin_id: currentUser.id,
    p_pin: pin,
    p_period_id: periodId
  });

  if (error) throw error;
}
// create 5 week period 

async function generateNextFiveWeekPeriod(){
  if (!currentUser?.is_admin) throw new Error("Admin only.");

  const pin = getSessionPinOrThrow();
  const r = computeNextPeriodRange();
  if (!r) throw new Error("No existing periods.");

  const startStr = isoDate(r.start);
  const endStr   = isoDate(r.end);
  const periodName = `${fmt(r.start)} – ${fmt(r.end)}`;

  // 1️⃣ create period + weeks + dates server-side
  const { data: periodId, error } = await supabaseClient.rpc(
    "admin_create_five_week_period",
    {
      p_admin_id: currentUser.id,
      p_pin: pin,
      p_name: periodName,
      p_start_date: startStr,
      p_end_date: endStr
    }
  );

  if (error) throw error;

  // ✅ return UUID only
  return periodId;
}



/* =========================
   ADMIN GENERATE PREVIEW
   ========================= */
function computeNextPeriodRange(){
  if (!periodsCache?.length) return null;

const latest = [...periodsCache]
  .sort((a,b) => new Date(a.end_date) - new Date(b.end_date))
  .at(-1);

  if (!latest?.end_date) return null;

  const lastEnd = new Date(latest.end_date);

  let start = addDays(lastEnd, 1);
  while (start.getDay() !== 0) start = addDays(start, 1);

  const end = addDays(start, 34);
  return { start, end, latest };
}

function refreshGeneratePreview(){
  const r = computeNextPeriodRange();
  if (!r){
    adminGeneratePreview.textContent = "Cannot preview. No periods loaded.";
    return;
  }

  adminGeneratePreview.textContent =
    `Next period: ${fmt(r.start)} – ${fmt(r.end)} (5 weeks, Sun–Sat).`;
}

if (adminGenerateBtn) {
  adminGenerateBtn.addEventListener("click", async () => {
    try {
      const r = computeNextPeriodRange();
      if (!r) {
        alert("Cannot generate: no periods loaded.");
        return;
      }

      const ok = confirm(`Generate new 5-week period:\n${fmt(r.start)} – ${fmt(r.end)} ?`);
      if (!ok) return;

      adminGenerateBtn.disabled = true;
      adminGeneratePreview.textContent = "Generating…";

      // ✅ RPC returns a UUID (string), not a period object
      const newPeriodId = await generateNextFiveWeekPeriod();

      // Refresh caches + UI
      await loadRota();
      await loadAdminPeriodsForDropdown();
      refreshGeneratePreview();

      // Select the new period everywhere
      adminSelectedPeriodId = newPeriodId;
      activePeriodId = newPeriodId;

      // Optional: auto-set active so staff see it immediately
  // await setActivePeriod(newPeriodId); // only activate when ready

      // Refresh again so ★ active + dropdown state update
      await loadRota();
      await loadAdminPeriodsForDropdown();

      alert("Generated new 5-week period.");
    } catch (e) {
      console.error(e);

      const msg =
        e?.message ||
        e?.details ||
        e?.hint ||
        (e?.error && (e.error.message || e.error.details)) ||
        JSON.stringify(e, null, 2);

      alert("Generate failed:\n\n" + msg);
    } finally {
      adminGenerateBtn.disabled = false;
      // nice-to-have: restore preview if generation failed
      refreshGeneratePreview();
    }
  });
}


async function setPeriodCloseTime(periodId, closesAtIsoOrNull){
  const pin = getSessionPinOrThrow();

  const { error } = await supabaseClient.rpc("admin_set_period_closes_at", {
    p_admin_id: currentUser.id,
    p_pin: pin,
    p_period_id: periodId,
    p_closes_at: closesAtIsoOrNull
  });

  if (error) throw error;
}

    // OPTIONAL BASELINE RESET HELPERS

async function resetWeeksAfterClose(periodId){
  if (!currentUser?.is_admin) { alert("Admin only."); return; }
  const { data: wkRows, error: wkErr } = await supabaseClient
    .from("rota_dates")
    .select("week_id")
    .eq("period_id", periodId);

  if (wkErr) throw wkErr;

  const weekIds = [...new Set((wkRows || []).map(r => r.week_id).filter(Boolean))];
  if (!weekIds.length) return;

  const { error: resetErr } = await supabaseClient
    .from("rota_weeks")
    .update({ open_after_close: false })
    .in("id", weekIds);

  if (resetErr) throw resetErr;
}
    async function resetWeeksOpen(periodId){
  if (!currentUser?.is_admin) { alert("Admin only."); return; }

  const { data: wkRows, error: wkErr } = await supabaseClient
    .from("rota_dates")
    .select("week_id")
    .eq("period_id", periodId);

  if (wkErr) throw wkErr;

  const weekIds = [...new Set((wkRows || []).map(r => r.week_id).filter(Boolean))];
  if (!weekIds.length) return;

  const { error: resetErr } = await supabaseClient
    .from("rota_weeks")
    .update({ open: true })
    .in("id", weekIds);

  if (resetErr) throw resetErr;
}

async function resetWeeksDefaultForPeriod(periodId){
  if (!currentUser?.is_admin) { alert("Admin only."); return; }
  const { data: wkRows, error: wkErr } = await supabaseClient
    .from("rota_dates")
    .select("week_id")
    .eq("period_id", periodId);

  if (wkErr) throw wkErr;

  const weekIds = [...new Set((wkRows || []).map(r => r.week_id).filter(Boolean))];
  if (!weekIds.length) return;

  const { error: resetErr } = await supabaseClient
    .from("rota_weeks")
    .update({ open: true, open_after_close: false })
    .in("id", weekIds);

  if (resetErr) throw resetErr;
}

if (adminClosesAtSaveBtn) {
  adminClosesAtSaveBtn.addEventListener("click", async () => {
    if (!adminSelectedPeriodId) return alert("Pick a rota period first.");
    if (!adminClosesAtInput?.value) return alert("Pick a date/time first.");

    try {
      const iso = datetimeLocalToISOString(adminClosesAtInput.value);

      await setPeriodCloseTime(adminSelectedPeriodId, iso);

      // ✅ close time should slam all 5 weeks shut by default
      await resetWeeksAfterClose(adminSelectedPeriodId);

      await loadRota(); // refresh main
      await loadAdminPeriodsForDropdown(); // refresh admin cache + UI
      alert("Close time saved.");
    } catch (e) {
      console.error(e);
      alert("Failed to save close time. Check console.");
    }
  });
}

if (adminClosesAtClearBtn) {
  adminClosesAtClearBtn.addEventListener("click", async () => {
    if (!adminSelectedPeriodId) return alert("Pick a rota period first.");

    try {
      await setPeriodCloseTime(adminSelectedPeriodId, null);

      // Optional: when you clear the close time, reopen everything by default
      
 await resetWeeksAfterClose(adminSelectedPeriodId);
await resetWeeksOpen(adminSelectedPeriodId);
      await loadRota();
      await loadAdminPeriodsForDropdown();
      alert("Close time cleared.");
    } catch (e) {
      console.error(e);
      alert("Failed to clear close time. Check console.");
    }
  });
}

    /* =========================================================
       5) PIN MODAL (open/close)
       ========================================================= */
function openPinModal(user){
  selectedUser = user;

  // pick language based on the person you're logging in as
  setLang(user.preferred_lang || "en");

  pinTitle.textContent = t("pinTitle", user.name);
  pinDesc.textContent  = t("pinDesc");

  pinErr.style.display = "none";
  pinInput.value = "";

  document.body.classList.add("modal-open");
  modal.style.display = "flex";
  modal.setAttribute("aria-hidden", "false");
  setTimeout(() => pinInput.focus(), 50);
}

function closePinModal(){
  modal.style.display = "none";
  modal.setAttribute("aria-hidden", "true");

updateBodyModalOpen();


  selectedUser = null;
  pinConfirmBtn.disabled = false;
}
    
pinCancelBtn.addEventListener("click", closePinModal);
modal.addEventListener("click", (e) => { if(e.target === modal) closePinModal(); });

pinInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    e.preventDefault();
    pinConfirmBtn.click();
  }
});

    /* =========================================================
       6) AUTH (verify PIN via RPC)
       ========================================================= */
    pinConfirmBtn.addEventListener("click", async () => {
      const pin = pinInput.value.trim();
      if(!selectedUser) return;

 if(!/^\d{4}$/.test(pin)){
  pinErr.textContent = t("pinErrFormat");
  pinErr.style.display = "block";
  return;
}

      pinConfirmBtn.disabled = true;
      pinErr.style.display = "none";

      try{
        const { data: ok, error } = await supabaseClient.rpc("verify_user_pin", {
          p_user_id: selectedUser.id,
          p_pin: pin
        });

        if(error){
          console.error("RPC error:", error);
          pinErr.textContent = "Server error (RPC).";
          pinErr.style.display = "block";
          pinConfirmBtn.disabled = false;
          return;
        }

if(ok !== true){
  pinErr.textContent = t("pinErrWrong");
  pinErr.style.display = "block";
  pinConfirmBtn.disabled = false;
  return;
}

  currentUser = selectedUser;
setSessionPin(selectedUser.id, pin); // ✅ critical (used for saving requests)
localStorage.setItem(STORAGE_KEY, currentUser.id);

closePinModal();
applyLanguage();
applyUnlockState();
updateBadges();
updateCloseLabel(activePeriodObj);
refreshNoticesAndMaybeBlock();


      }catch(err){
        console.error("Login exception:", err);
        pinErr.textContent = "Login error. Try again.";
        pinErr.style.display = "block";
        pinConfirmBtn.disabled = false;
      }
    });
function updateBadges(){
  const txt = loginBadge?.querySelector(".acc-txt");

  if (!currentUser){
 if (txt) txt.textContent = t("notLoggedIn");

    else if (loginBadge) loginBadge.textContent = "Not logged in";
    if (adminBadge) adminBadge.style.display = "none";
    return;
  }

  // Show "Account: Name" so staff realise it's a feature
if (txt) txt.textContent = `${t("accountEditTitle")}: ${currentUser.name}`;

  else if (loginBadge) loginBadge.textContent = `Account: ${currentUser.name}`;

  if (adminBadge) adminBadge.style.display = currentUser.is_admin ? "inline-block" : "none";

  // Toggle a body-level class so we can scope admin-only UI affordances (e.g. locked-cell highlight)
  try {
    document.body.classList.toggle("admin-view", !!currentUser?.is_admin);
    // Re-apply unlock state so per-td `locked-admin` classes are correctly toggled
    if (typeof applyUnlockState === 'function') applyUnlockState();
  } catch (e) { /* ignore */ }
}

  // DO NOT touch adminViewUsers here.
  // Tab visibility is handled by showAdminTab().


/* =========================================================
   PATCH 2) SHIFT PICKER LOGIC (with OFF priority)
   ========================================================= */

function openShiftModal(){
  if (!activeCell) return;

  // Admin-only: show lock button and paint state
  if (shiftLockBtn) {
    const isAdmin = !!currentUser?.is_admin;
    shiftLockBtn.style.display = isAdmin ? "inline-flex" : "none";

    if (isAdmin) {
      const key = `${activeCell.userId}_${activeCell.date}`;
      const locked = locksCache.has(key);
      shiftLockBtn.textContent = locked ? "🔒" : "🔓";
      shiftLockBtn.title = locked ? "Unlock this cell" : "Lock this cell";
    }
  }

  document.body.classList.add("modal-open");
  shiftModal.style.display = "flex";
  shiftModal.setAttribute("aria-hidden", "false");
}

function closeShiftModal(){
  document.activeElement?.blur?.();
  shiftModal.style.display = "none";
  shiftModal.setAttribute("aria-hidden", "true");
  activeCell = null;
  updateBodyModalOpen();
}

// ===============================
// FIX 1: Shift modal close actions
// ===============================

// Cancel button closes
if (shiftCancelBtn) shiftCancelBtn.addEventListener("click", closeShiftModal);

// Clicking the backdrop closes (only if you clicked the overlay itself)
if (shiftModal) {
  shiftModal.addEventListener("click", (e) => {
    if (e.target === shiftModal) closeShiftModal();
  });
}

// Escape closes (only add ONCE globally)
document.addEventListener("keydown", (e) => {
  if (e.key !== "Escape") return;

  if (shiftHelpModal && shiftHelpModal.style.display === "flex") closeShiftHelpModal();
  if (shiftModal && shiftModal.style.display === "flex") closeShiftModal();
  if (modal && modal.style.display === "flex") closePinModal();
  if (weekCommentModal && weekCommentModal.style.display === "flex") closeWeekCommentModal();
  if (adminModal && adminModal.style.display === "flex") closeAdminConsole();
  if (userModal && userModal.style.display === "flex") closeUserModal();
});


    
document.querySelectorAll(".shift-btn").forEach(btn => {
  btn.addEventListener("click", async () => {
    if (!activeCell) return;

    const td = activeCell.td;
    const userId = activeCell.userId;
    const date = activeCell.date;
const shift = btn.dataset.shift;
const key = `${userId}_${date}`;
const existing = requestsCache.get(key);

// Special handling for O*: cycle strong preference ranks (O¹ / O²)
let rankToSave = null;

if (shift === "O*") {
  const pe = pendingEdits[key];
  const existing = requestsCache.get(key);

  const currentRank =
    (pe && pe.shift === "O") ? (pe.important_rank ?? null) :
    (existing?.value === "O") ? (existing.important_rank ?? null) :
    null;

  const taken = getTakenOffRanksThisWeek(userId, date, key);
  rankToSave = nextOffPrioritySmart(currentRank, taken);

  // 🚫 HARD BLOCK after O¹ + O²
  if (rankToSave === null && (taken.has(1) && taken.has(2))) {
    alert("No more strong preferences available.\nUse O or add a comment if needed.");
    closeShiftModal();
    return;
  }
}


 

    /* -----------------------------
       STEP 1: Max 5 per week guard
       ----------------------------- */
    if (shift !== "CLEAR") {
      const currentCount = countUserRequestsThisWeek(userId, date);
      const alreadyExists = requestsCache.has(key);

      if (!alreadyExists && currentCount >= MAX_REQUESTS_PER_WEEK) {
        alert("You can only enter 5 requests per week.");
        closeShiftModal();
        return;
      }
    }


    /* -----------------------------
       Optimistic UI update
       ----------------------------- */
 if (shift === "CLEAR") {
  td.textContent = "";
  delete pendingEdits[key];
} else if (shift === "O") {
  // plain OFF, no priority
  td.textContent = "O";
  pendingEdits[key] = { userId, date, shift: "O", important_rank: null };

} else if (shift === "O*") {
  // strong OFF, cycles rank
  if (rankToSave === 1) td.textContent = "O¹";
  else if (rankToSave === 2) td.textContent = "O²";
  else td.textContent = "O"; // fallback (shouldn’t happen if cycling works)

  // note: we save as value "O" with important_rank 1/2
  pendingEdits[key] = { userId, date, shift: "O", important_rank: rankToSave };

} else {
  td.textContent = shift;
  pendingEdits[key] = { userId, date, shift, important_rank: null };
}

    closeShiftModal();
/* -----------------------------
   Auto-save to Supabase
   ----------------------------- */
try {
  if (shift === "CLEAR") {
    await deleteRequestCell(userId, date);
    requestsCache.delete(key);
    delete pendingEdits[key];
    toast(`Cleared + saved (${key})`);
  } else {
const valueToSave = (shift === "O*") ? "O" : shift;

const saved = await upsertRequestCell(
  userId,
  date,
  valueToSave,
  rankToSave
);

    requestsCache.set(key, saved);
    delete pendingEdits[key];
    toast(`Saved (${key}) = ${shift}`);
  }
} catch (err) {
  console.error("Auto-save failed:", err);

  const msg =
    err?.message ||
    err?.error?.message ||
    err?.details ||
    JSON.stringify(err);

// Revert UI to last known good state (pendingEdits first, then saved)
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


    /* =========================================================
   PATCH 2B) AUTO-SAVE (write to Supabase after each selection)
   ========================================================= */

function toast(msg){
  // tiny, non-annoying feedback. If you hate it, delete it.
  console.log(msg);
}

// Upsert a single cell to Supabase
async function upsertRequestCell(userId, date, value, importantRank){
  if (!currentUser) throw new Error("Not logged in.");

  const pin = sessionStorage.getItem(pinKey(currentUser.id));
  if (!pin) throw new Error("Missing session PIN. Log in again.");

  // Admin editing someone else -> admin RPC
  if (currentUser.is_admin && String(userId) !== String(currentUser.id)) {
    const { data, error } = await supabaseClient.rpc("admin_set_request_cell", {
      p_admin_id: currentUser.id,
      p_pin: pin,
      p_target_user_id: userId,
      p_date: date,
      p_value: value,
      p_important_rank: importantRank ?? null
    });
    if (error) throw error;
    return data;
  }

  // Normal -> user RPC
  const { data, error } = await supabaseClient.rpc("set_request_cell", {
    p_user_id: userId,
    p_pin: pin,
    p_date: date,
    p_value: value,
    p_important_rank: importantRank ?? null
  });
  if (error) throw error;
  return data;
}



// Delete a cell completely (optional, but nice for CLEAR)
async function deleteRequestCell(userId, date){
  if (!currentUser) throw new Error("Not logged in.");

  const pin = sessionStorage.getItem(pinKey(currentUser.id));
  if (!pin) throw new Error("Missing session PIN. Log in again.");

  // Admin editing someone else -> admin RPC
  if (currentUser.is_admin && String(userId) !== String(currentUser.id)) {
    const { error } = await supabaseClient.rpc("admin_clear_request_cell", {
      p_admin_id: currentUser.id,
      p_pin: pin,
      p_target_user_id: userId,
      p_date: date
    });
    if (error) throw error;
    return;
  }

  // Normal -> user RPC
  const { error } = await supabaseClient.rpc("clear_request_cell", {
    p_user_id: userId,
    p_pin: pin,
    p_date: date
  });
  if (error) throw error;
}

    
async function loadRota() {
  // -----------------------------
  // 7A) Load users
  // -----------------------------
  const { data: users, error: userError } = await supabaseClient
.from("users")
.select("id, name, role_id, is_admin, is_active, preferred_lang, roles(name)")
    .order("created_at", { ascending: true })

  if (userError) {
    console.error("Users load error:", userError);
    alert("Failed to load users.");
    return;
  }

  // Build helper map
  usersById = new Map((users || []).map(u => [u.id, u.name]));

  // 🔐 Restore logged-in user from localStorage (ONE TIME LOGIN)
const savedId = localStorage.getItem(STORAGE_KEY);
if (savedId && !currentUser) {
  const restored = (users || []).find(u => String(u.id) === String(savedId));
  const restoredPin = restored ? sessionStorage.getItem(pinKey(restored.id)) : null;

  if (restored && restoredPin) {
    currentUser = restored;
    updateBadges();
    applyUnlockState();
  } else {
    localStorage.removeItem(STORAGE_KEY);
  }
}

refreshNoticesAndMaybeBlock();


// -----------------------------
// 7C) Load rota periods (dropdown + active)
// -----------------------------
let periods;
try {
  periods = await fetchRotaPeriods();
} catch (e) {
  console.error("Period load error:", e);
  alert("Failed to load rota periods.");
  return;
}

if (!periods.length) {
  alert("No rota periods available.");
  return;
}

periodsCache = periods;

// choose active by default, else latest
const active = periods.find(p => p.is_active);
const latest = periods[periods.length - 1];

// Only choose default if user hasn't picked one yet
if (activePeriodId == null) {
  activePeriodId = active ? active.id : latest.id;
}

// populate dropdown + label
populatePeriodDropdown(periods);
periodSelect.value = String(activePeriodId);

const selected = periods.find(p => String(p.id) === String(activePeriodId));
activePeriodObj = selected;   // ← THIS is 5A in action
updateCloseLabel(selected);
  
// -----------------------------
// 7D) Load rota dates FOR SELECTED PERIOD
// -----------------------------
const { data: dates, error: dateError } = await supabaseClient
  .from("rota_dates")
 .select("date, week_id, period_id, rota_weeks(id, open, open_after_close)")
  .eq("period_id", activePeriodId)
  .order("date");

if (dateError) {
  console.error("Dates load error:", dateError);
  alert("Failed to load dates for this period.");
  return;
}

// -----------------------------
// 7D.5) Load requests for this period (so saved cells show up)
// -----------------------------
const selectedPeriod = periods.find(p => String(p.id) === String(activePeriodId));
const start = selectedPeriod?.start_date;
const end = selectedPeriod?.end_date;

if (start && end) {
  const { data: reqs, error: reqErr } = await supabaseClient
    .from("requests")
    .select("id, user_id, date, value, important_rank")
    .gte("date", start)
    .lte("date", end);

  if (reqErr) {
    console.error("Requests load error:", reqErr);
    alert("Failed to load requests.");
    return;
  }

  requestsCache.clear();
  for (const r of (reqs || [])) {
    requestsCache.set(`${r.user_id}_${r.date}`, r);
  }
} else {
  console.warn("No period dates found for requests fetch.");
  requestsCache.clear();
}

// -----------------------------
// 7D.6) Load locks for this period (so UI blocks staff edits + shows reason)
// -----------------------------
locksCache.clear();

if (start && end) {
  const { data: locks, error: lockErr } = await supabaseClient
    .from("request_cell_locks")
    .select("user_id, date, reason_en, reason_es, locked_by, locked_at")
    .gte("date", start)
    .lte("date", end);

  if (lockErr) {
    console.error("Locks load error:", lockErr);
    // Do NOT hard-fail the whole app if locks fetch fails
  } else {
    for (const L of (locks || [])) {
      locksCache.set(`${L.user_id}_${L.date}`, L);
    }
  }
}

// -----------------------------
// 7E) Render table (weeks + users)
// -----------------------------
const weeks = groupDatesIntoWeeks(dates);


// Hide inactive users from the rota table (for everyone)
// (Admins can still view/manage them in Admin → Users with "Show inactive")
const visibleUsers = users.filter(u => u.is_active !== false);

render(visibleUsers, weeks);

  
// Period label
if (weeks.length) {
document.getElementById("periodLabel").textContent =
  `${fmt(weeks[0].weekStart)} – ${fmt(weeks[weeks.length - 1].weekEnd)} · 5-week period`;

}

// Apply locks + badges
applyUnlockState();
updateBadges();
  }

    /* =========================================================
   8) RENDER (table header + grouped rows)
   ========================================================= */
function render(users, weeks){
  const table = document.getElementById("rota");
  table.innerHTML = "";

  // Debug guard: ensure every week has an ID
  weeks.forEach(w => {
    if (!w.weekId) {
      console.warn("Missing weekId for week:", w.weekStart, w);
    }
  });


  const thead = document.createElement("thead");
  const tbody = document.createElement("tbody");
  table.appendChild(thead);
  table.appendChild(tbody);

  // ----- Header row 1: week labels
  const r1 = document.createElement("tr");
  const hName = document.createElement("th");
  hName.className = "name-col";
  hName.textContent = "Name";
  r1.appendChild(hName);

  weeks.forEach((w, idx) => {
    const th = document.createElement("th");
    th.className = "week-head " + (effectiveOpenForWeek(w) ? "" : "closed");


    th.colSpan = 7;
    th.innerHTML = `
  <span class="week-label">${fmt(w.weekStart)} – ${fmt(w.weekEnd)}</span>
${w.weekId ? `
  <button
    class="week-comment-btn"
    type="button"
    data-week-id="${String(w.weekId)}"
    title="Week comment"
  >💬</button>
` : `
  <span
    style="opacity:0.35; margin-left:6px;"
    title="Week has no ID (rota_dates.week_id missing)"
  >💬</span>
`}
`;
r1.appendChild(th);

    if(idx !== weeks.length - 1){
      const sep = document.createElement("th");
      sep.className = "week-sep";
      r1.appendChild(sep);
    }
  });
  thead.appendChild(r1);

  // ----- Header row 2: day letters
  const r2 = document.createElement("tr");
  const blank2 = document.createElement("th");
  blank2.className = "name-col";
  blank2.textContent = "";
  r2.appendChild(blank2);

  const dayLetters = ["S","M","T","W","T","F","S"];
  weeks.forEach((w, idx) => {
    for(let i=0;i<7;i++){
      const th = document.createElement("th");
     th.className = "day " + (effectiveOpenForWeek(w) ? "" : "closed");

      th.textContent = dayLetters[i];
      r2.appendChild(th);
    }
    if(idx !== weeks.length - 1){
      const sep = document.createElement("th");
      sep.className = "week-sep";
      r2.appendChild(sep);
    }
  });
  thead.appendChild(r2);

  // ----- Header row 3: date numbers
  const r3 = document.createElement("tr");
  const blank3 = document.createElement("th");
  blank3.className = "name-col";
  blank3.textContent = "";
  r3.appendChild(blank3);

  weeks.forEach((w, idx) => {
    for(let i=0;i<7;i++){
      const d = new Date(w.days[i].date);
      const isWeekend = (i === 0 || i === 6);
      const th = document.createElement("th");
     th.className = "date " + (effectiveOpenForWeek(w) ? "" : "closed") + (isWeekend ? " weekend" : "");

      th.textContent = d.getDate();
      r3.appendChild(th);
    }
    if(idx !== weeks.length - 1){
      const sep = document.createElement("th");
      sep.className = "week-sep";
      r3.appendChild(sep);
    }
  });
  thead.appendChild(r3);

  // ----- Body grouped by role
  const groups = groupUsers(users);

  for(const g of groups){
    // section header row
    const sectionTr = document.createElement("tr");
    sectionTr.className = "section-row";

    const sectionTd = document.createElement("td");
    sectionTd.className = `name-col ${g.className}`;
    sectionTd.colSpan = 1 + (weeks.length * 7) + (weeks.length - 1);
    sectionTd.innerHTML = `<span>${g.title}</span>`;
    sectionTr.appendChild(sectionTd);
    tbody.appendChild(sectionTr);

    // user rows
    for(const u of g.items){
      const tr = document.createElement("tr");
      tr.dataset.userId = u.id;

      // name cell (PIN login)
      const nameTd = document.createElement("td");
      nameTd.className = "name-col";
      nameTd.textContent = u.name;
      nameTd.title = u.name;
      nameTd.addEventListener("click", () => openPinModal(u));
      tr.appendChild(nameTd);

      // date cells
      weeks.forEach((w, idx) => {
        for(let i=0;i<7;i++){
          const isWeekend = (i === 0 || i === 6);
          const dateStr = w.days[i].date;

          const td = document.createElement("td");
          td.className = "cell" + (effectiveOpenForWeek(w) ? "" : " closed") + (isWeekend ? " weekend" : "");

          td.dataset.userId = u.id;
          td.dataset.date = dateStr;

          // ✅ Fill from cache / pending edits
          const key = `${u.id}_${dateStr}`;

          // Pending edits override everything visually
if (pendingEdits[key]) {
  const pe = pendingEdits[key];

if (pe.shift === "O") {
  if (pe.important_rank === 1) td.textContent = "O¹";
  else if (pe.important_rank === 2) td.textContent = "O²";
  else if (pe.important_rank === 3) td.textContent = "O³";
  else td.textContent = "O";
} else {
  td.textContent = pe.shift || "";
}

} else {
  const r = requestsCache.get(key);

  if (r?.value === "O") {
    if (r.important_rank === 1) td.textContent = "O¹";
    else if (r.important_rank === 2) td.textContent = "O²";
    else td.textContent = "O";
  } else {
    td.textContent = r?.value || "";
  }
}
          

          tr.appendChild(td);
        }

        if(idx !== weeks.length - 1){
          const sep = document.createElement("td");
          sep.className = "week-sep";
          tr.appendChild(sep);
        }
      });

      tbody.appendChild(tr);
    }
  }

  // Keep your existing logic
  applyUnlockState();
  updateBadges();
}


    /* =========================================================
   9) UNLOCK LOGIC (who can edit which row)
   ========================================================= */
function applyUnlockState(){
  const rows = document.querySelectorAll("#rota tbody tr");

  rows.forEach(r => {
    if (r.classList.contains("section-row")) return;

    const userId = r.dataset.userId;

  const isUnlocked =
  currentUser && (
    currentUser.is_admin ||
    String(currentUser.id) === String(userId)
  );

    r.classList.toggle("unlocked", !!isUnlocked);
    r.classList.toggle("locked", !isUnlocked);

    r.querySelectorAll("td.cell").forEach(td => {
      const isClosedWeek = td.classList.contains("closed");

      // ✅ FINAL rule:
      // - must be your row (or admin)
      // - week must be open (closed class blocks)
      // periodClosed is NOT a blocker: week toggle overrides it
      
const noticesBlocking =
  Array.isArray(blockingNoticeIds) &&
  blockingNoticeIds.length > 0;

// If notices are blocking, staff cannot edit anything (admins too, unless you exempt them)
const canEdit = !!isUnlocked && !isClosedWeek && !noticesBlocking;

td.classList.toggle("editable", canEdit);
      // Admin-only visual hint: mark individual td when a lock exists for that cell
      // (admins are considered 'unlocked' so we can't rely on !isUnlocked there).
      const _key = `${userId}_${td.dataset.date}`;
      const _lockedForCell = locksCache.has(_key);
      td.classList.toggle("locked-admin", !!currentUser?.is_admin && _lockedForCell);
      if (_lockedForCell && !!currentUser?.is_admin) console.debug('applyUnlockState: locked-admin set for', _key);
      if (!td.dataset.bound) {
        td.dataset.bound = "1";
 td.addEventListener("click", () => {
  if (!td.classList.contains("editable")) return;

  const userId = td.dataset.userId;
  const date = td.dataset.date;
  const lock = locksCache.get(`${userId}_${date}`);

  // 🚫 Staff: locked cell blocks editing, shows reason
  if (lock && !currentUser?.is_admin) {
    const reason =
      (currentLang === "es" ? lock.reason_es : lock.reason_en) ||
      lock.reason_en ||
      (currentLang === "es" ? "Este día está bloqueado por administración." : "This day is locked by management.");

    alert(reason);
    return;
  }

  activeCell = { td, userId, date };
  openShiftModal();
});
      }
    });
  });
}


    /* =========================================================
       10) BOOT
       ========================================================= */

/**
       10) BOOT
       ========================================================= */
    loadRota();
