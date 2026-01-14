    console.log("[ADMIN.JS] Script loaded");

    const navLinks = Array.from(document.querySelectorAll(".nav a[data-panel]"));
    const panels = Array.from(document.querySelectorAll(".panel"));
    const adminUserAuthNotice = document.getElementById("adminUserAuthNotice");

    let currentUser = null;
    let adminUsersCache = [];
    let adminEditingUserId = null;
    let usersLoaded = false;
    let userPermissions = new Set();

    const adminUsersList = document.getElementById("adminUsersList");
    const adminAddUserBtn = document.getElementById("adminAddUserBtn");
    const adminUserSearch = document.getElementById("adminUserSearch");
    const adminShowInactiveUsers = document.getElementById("adminShowInactiveUsers");
    const adminLoginUser = document.getElementById("adminLoginUser");
    const adminLoginPin = document.getElementById("adminLoginPin");
    const adminLoginBtn = document.getElementById("adminLoginBtn");
    const adminLoginMsg = document.getElementById("adminLoginMsg");
    const adminEditUserName = document.getElementById("adminEditUserName");
    const adminEditUserRole = document.getElementById("adminEditUserRole");
    const adminEditUserPin = document.getElementById("adminEditUserPin");
    const adminSaveUserBtn = document.getElementById("adminSaveUserBtn");
    const adminCancelUserEditBtn = document.getElementById("adminCancelUserEditBtn");
    const adminUserEditHelp = document.getElementById("adminUserEditHelp");
    const adminEditUserSearch = document.getElementById("adminEditUserSearch");
    const adminEditUserSelect = document.getElementById("adminEditUserSelect");
    const adminAddUserName = document.getElementById("adminAddUserName");
    const adminAddUserRole = document.getElementById("adminAddUserRole");
    const adminAddUserPin = document.getElementById("adminAddUserPin");
    const adminCreateUserBtn = document.getElementById("adminCreateUserBtn");
    const adminAddUserCancelBtn = document.getElementById("adminAddUserCancelBtn");
    const adminUserAddHelp = document.getElementById("adminUserAddHelp");
    const adminUsersReorderList = document.getElementById("adminUsersReorderList");
    const usersPages = Array.from(document.querySelectorAll(".users-page"));
    const usersPageTabs = Array.from(document.querySelectorAll(".subtab[data-users-page]"));
    const shiftsPages = Array.from(document.querySelectorAll(".shifts-page"));
    const shiftsPageTabs = Array.from(document.querySelectorAll(".subtab[data-shifts-page]"));
    const swapsPages = Array.from(document.querySelectorAll(".swaps-page"));
    const swapsPageTabs = Array.from(document.querySelectorAll(".subtab[data-swaps-page]"));
    const adminUserPermissionGroups = document.getElementById("adminUserPermissionGroups");
    const adminUserStatus = document.getElementById("adminUserStatus");
    const permissionGroupSelect = document.getElementById("permissionGroupSelect");
    const permissionGroupName = document.getElementById("permissionGroupName");
    const createPermissionGroupBtn = document.getElementById("createPermissionGroupBtn");
    const permissionGroupHelp = document.getElementById("permissionGroupHelp");
    const permissionsMatrix = document.getElementById("permissionsMatrix");

    function escapeHtml(str){
      return String(str || "")
        .replaceAll("&","&amp;")
        .replaceAll("<","&lt;")
        .replaceAll(">","&gt;")
        .replaceAll("\"","&quot;")
        .replaceAll("'","&#039;");
    }

    function pinKey(userId){ return `calpeward.pin.${userId}`; }

    const WINDOW_SESSION_PREFIX = "calpeward:";

    function setWindowSession(userId, pin){
      if (!userId || !pin) return;
      try {
        const payload = btoa(JSON.stringify({ userId: String(userId), pin: String(pin) }));
        window.name = `${WINDOW_SESSION_PREFIX}${payload}`;
      } catch (e) {
        console.warn("Failed to store window session", e);
      }
    }

    function getWindowSession(){
      if (!window.name || !window.name.startsWith(WINDOW_SESSION_PREFIX)) {
        console.log("[SESSION DEBUG] No window.name session. window.name=", window.name);
        return null;
      }
      try {
        const raw = window.name.slice(WINDOW_SESSION_PREFIX.length);
        const session = JSON.parse(atob(raw));
        console.log("[SESSION DEBUG] Window session found:", session);
        return session;
      } catch (e) {
        console.warn("[SESSION DEBUG] Failed to parse window session", e);
        return null;
      }
    }

    function restoreSessionFromWindow(){
      const data = getWindowSession();
      console.log("[SESSION DEBUG] restoreSessionFromWindow: data=", data);
      if (!data || !data.userId) {
        console.log("[SESSION DEBUG] No data to restore");
        return null;
      }
      console.log("[SESSION DEBUG] Restoring userId:", data.userId);
      localStorage.setItem(STORAGE_KEY, data.userId);
      console.log("[SESSION DEBUG] Set localStorage key:", STORAGE_KEY, "=", data.userId);
      if (data.pin) {
        sessionStorage.setItem(pinKey(data.userId), data.pin);
        console.log("[SESSION DEBUG] Set sessionStorage pin for user", data.userId);
      }
      return data;
    }

    function clearWindowSession(){
      if (window.name && window.name.startsWith(WINDOW_SESSION_PREFIX)) {
        window.name = "";
      }
    }

    function getSessionPinOrThrow(){
      if (!currentUser) throw new Error("Not logged in.");
      let pin = sessionStorage.getItem(pinKey(currentUser.id));
      if (!pin) {
        restoreSessionFromWindow();
        pin = sessionStorage.getItem(pinKey(currentUser.id));
      }
      if (!pin) throw new Error("Missing session PIN. Log in again.");
      return pin;
    }

    async function loadCurrentUser(){
      console.log("[SESSION DEBUG] loadCurrentUser: starting");
      restoreSessionFromWindow();
      const savedId = localStorage.getItem(STORAGE_KEY);
      console.log("[SESSION DEBUG] loadCurrentUser: savedId from localStorage=", savedId);
      if (!savedId){
        console.log("[SESSION DEBUG] No savedId, showing auth notice");
        adminUserAuthNotice.style.display = "block";
        updateUserStatus(null);
        return null;
      }
      const { data, error } = await supabaseClient
        .from("users")
        .select("id, name, role_id, is_admin, is_active")
        .eq("id", savedId)
        .single();
      if (error || !data){
        adminUserAuthNotice.style.display = "block";
        updateUserStatus(null);
        return null;
      }
      currentUser = data;
      window.currentUser = currentUser; // Expose to window for other scripts
      await loadUserPermissions();
      if (!hasPermission("system.admin_panel")){
        adminUserAuthNotice.style.display = "block";
        updateUserStatus(currentUser, false);
        return null;
      }
      adminUserAuthNotice.style.display = "none";
      updateUserStatus(currentUser, true);
      applyPermissionUI();
      return currentUser;
    }

    async function loadLoginUsers(){
      if (!adminLoginUser) return;
      try {
        const cachedRaw = localStorage.getItem("calpeward.users_cache");
        const cachedUsers = cachedRaw ? JSON.parse(cachedRaw) : [];
        const { data: users, error } = await supabaseClient
          .from("users")
          .select("id, name, is_active")
          .order("name", { ascending: true });
        if (error) throw error;
        const sourceUsers = (users && users.length) ? users : cachedUsers;

        const { data: permRows, error: permErr } = await supabaseClient
          .from("permission_group_permissions")
          .select("group_id")
          .eq("permission_key", "system.admin_panel");
        if (permErr) throw permErr;
        const adminGroupIds = (permRows || []).map(r => r.group_id).filter(Boolean);

        let adminUserIds = new Set();
        if (adminGroupIds.length) {
          const { data: groupUsers, error: guErr } = await supabaseClient
            .from("user_permission_groups")
            .select("user_id")
            .in("group_id", adminGroupIds);
          if (guErr) throw guErr;
          adminUserIds = new Set((groupUsers || []).map(r => String(r.user_id)));
        }

        let options = (sourceUsers || [])
          .filter(u => u.is_active !== false)
          .filter(u => u.is_admin || adminUserIds.has(String(u.id)))
          .map(u => `<option value="${escapeHtml(u.id)}">${escapeHtml(u.name)}</option>`)
          .join("");

        if (!options) {
          options = (sourceUsers || [])
            .filter(u => u.is_active !== false)
            .map(u => `<option value="${escapeHtml(u.id)}">${escapeHtml(u.name)}</option>`)
            .join("");
          if (adminLoginMsg) adminLoginMsg.textContent = "No admin users found. Showing all active users.";
        } else if (adminLoginMsg) {
          adminLoginMsg.textContent = "";
        }

        adminLoginUser.innerHTML = `<option value="">Select user...</option>${options}`;
      } catch (e) {
        console.warn("Failed to load login users", e);
        const cachedRaw = localStorage.getItem("calpeward.users_cache");
        const cachedUsers = cachedRaw ? JSON.parse(cachedRaw) : [];
        if (cachedUsers.length) {
          const options = cachedUsers
            .filter(u => u.is_active !== false)
            .map(u => `<option value="${escapeHtml(u.id)}">${escapeHtml(u.name)}</option>`)
            .join("");
          adminLoginUser.innerHTML = `<option value="">Select user...</option>${options}`;
          if (adminLoginMsg) adminLoginMsg.textContent = "Loaded from cached users.";
        } else {
          adminLoginUser.innerHTML = `<option value="">Unable to load users</option>`;
        }
      }
    }

    async function adminLogin(){
      if (!adminLoginUser || !adminLoginPin) return;
      const userId = adminLoginUser.value;
      const pin = (adminLoginPin.value || "").trim();
      if (!userId) {
        if (adminLoginMsg) adminLoginMsg.textContent = "Select a user.";
        return;
      }
      if (!/^\d{4}$/.test(pin)) {
        if (adminLoginMsg) adminLoginMsg.textContent = "Enter a 4-digit PIN.";
        return;
      }
      if (adminLoginMsg) adminLoginMsg.textContent = "Signing in...";
      try {
        const { data: ok, error: vErr } = await supabaseClient.rpc("verify_user_pin", {
          p_user_id: userId,
          p_pin: pin
        });
        if (vErr) throw vErr;
        if (!ok) {
          if (adminLoginMsg) adminLoginMsg.textContent = "Invalid PIN.";
          return;
        }
        const { data: user, error } = await supabaseClient
          .from("users")
          .select("id, name, role_id, is_admin, is_active")
          .eq("id", userId)
          .single();
        if (error || !user) throw error || new Error("User not found");
        localStorage.setItem(STORAGE_KEY, user.id);
        sessionStorage.setItem(pinKey(user.id), pin);
        setWindowSession(user.id, pin);
        currentUser = user;
        window.currentUser = currentUser; // Expose to window for other scripts
        await loadUserPermissions();
        const canAccess = hasPermission("system.admin_panel");
        updateUserStatus(currentUser, canAccess);
        adminUserAuthNotice.style.display = canAccess ? "none" : "block";
        applyPermissionUI();
        if (adminLoginMsg) {
          adminLoginMsg.textContent = canAccess
            ? "Signed in."
            : "Signed in, but admin access is restricted.";
        }
        const activeLink = document.querySelector(".nav a.is-active");
        const panelId = activeLink?.dataset.panel || navLinks[0]?.dataset.panel;
        if (panelId) showPanel(panelId);
      } catch (e) {
        console.error(e);
        if (adminLoginMsg) adminLoginMsg.textContent = "Login failed. Try again.";
      }
    }

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
        console.warn("Failed to load user permissions", e);
      }
    }

    function hasPermission(key){
      if (!currentUser) return false;
      if (currentUser.is_admin) return true;
      return userPermissions.has(key);
    }

    function requirePermission(key, msg){
      if (hasPermission(key)) return true;
      alert(msg || "Permission required.");
      return false;
    }

    function updateUserStatus(user, ok){
      if (!adminUserStatus) return;
      const label = adminUserStatus.querySelector("span:last-child");
      if (!user || !ok){
        adminUserStatus.classList.remove("is-active");
        if (label) label.textContent = "Not signed in";
        return;
      }
      adminUserStatus.classList.add("is-active");
      const roleLabel = user.is_admin ? "superadmin" : "admin";
      if (label) label.textContent = `Signed in: ${user.name} (${roleLabel})`;
    }

    let currentUserLoaded = false;
    async function ensureCurrentUser(){
      if (currentUserLoaded) return currentUser;
      const user = await loadCurrentUser();
      currentUserLoaded = !!user;
      return user;
    }

    function applyPermissionUI(){
      const canViewUsers = hasPermission("users.view");
      const canCreateUsers = hasPermission("users.create");
      const canEditUsers = hasPermission("users.edit");
      const canReorder = hasPermission("users.reorder");
      const canManagePermissions = hasPermission("system.admin_panel");

      const usersNav = document.querySelector('[data-panel="users"]');
      if (usersNav) usersNav.style.display = canViewUsers ? "flex" : "none";

      const reorderNav = document.querySelector('[data-panel="reorder"]');
      if (reorderNav) reorderNav.style.display = canReorder ? "flex" : "none";

      const permissionsNav = document.querySelector('[data-panel="permissions"]');
      if (permissionsNav) permissionsNav.style.display = canManagePermissions ? "flex" : "none";

      if (adminAddUserBtn) adminAddUserBtn.disabled = !canCreateUsers;

      usersPageTabs.forEach(tab => {
        if (tab.dataset.usersPage === "add") {
          tab.style.pointerEvents = canCreateUsers ? "auto" : "none";
          tab.style.opacity = canCreateUsers ? "1" : "0.5";
          tab.title = canCreateUsers ? "" : "Restricted";
        }
        if (tab.dataset.usersPage === "edit") {
          tab.style.pointerEvents = canEditUsers ? "auto" : "none";
          tab.style.opacity = canEditUsers ? "1" : "0.5";
          tab.title = canEditUsers ? "" : "Restricted";
        }
      });

      document.querySelectorAll("input[data-perm-group]").forEach(chk => {
        chk.disabled = !canEditUsers;
      });
    }

    async function loadAdminUsers(){
      if (!adminUsersList) return;
      if (!hasPermission("users.view")) {
        adminUsersList.innerHTML = `<div class="page-subtitle" style="padding:10px;">Restricted</div>`;
        return;
      }
      adminUsersList.textContent = "Loading users...";

      const { data, error } = await supabaseClient
        .from("users")
        .select("id, name, role_id, is_admin, is_active, display_order, roles(name)")
        .order("role_id", { ascending: true })
        .order("display_order", { ascending: true })
        .order("created_at", { ascending: true });

      if (error){
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
        adminUsersList.innerHTML = `<div class="page-subtitle" style="padding:10px;">No users.</div>`;
        return;
      }

      const canEditUsers = hasPermission("users.edit");
      const canToggleUsers = hasPermission("users.toggle_active");

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
          const isAdminAccount = !!u.is_admin;
          const allowEdit = canEditUsers && (!isAdminAccount || currentUser?.is_admin);
          const allowToggle = canToggleUsers && (!isAdminAccount || currentUser?.is_admin);
          const actionButtons = []
            .concat(allowEdit ? `<button type="button" class="btn" data-act="edit" data-id="${u.id}">Edit</button>` : [])
            .concat(allowToggle ? `<button type="button" class="btn" data-act="toggle" data-id="${u.id}">${u.is_active === false ? "Reactivate" : "Deactivate"}</button>` : [])
            .join("");

          return `
            <div class="user-row" data-user-id="${u.id}" data-role-id="${g.role_id}">
              <div class="user-meta">
                <div class="user-name">
                  ${escapeHtml(u.name || "")}
                  ${u.is_admin ? `<span class="user-tag admin">admin</span>` : ""}
                  ${u.is_active === false ? `<span class="user-tag inactive">inactive</span>` : ""}
                </div>
              </div>
              <div class="user-actions">
                ${actionButtons}
              </div>
            </div>
          `;
        }).join(""));
      }

      adminUsersList.innerHTML = html.join("");
      renderAdminUserSelectOptions(adminEditUserSearch?.value || "");
    }

    function renderAdminUserSelectOptions(filterText){
      if (!adminEditUserSelect) return;
      if (!hasPermission("users.edit")) {
        adminEditUserSelect.innerHTML = `<option value="">Restricted</option>`;
        return;
      }
      const q = (filterText || "").trim().toLowerCase();
      const options = adminUsersCache
        .slice()
        .filter(u => (u.name || "").toLowerCase().includes(q))
        .map(u => `<option value="${u.id}">${escapeHtml(u.name || "")}</option>`);
      adminEditUserSelect.innerHTML = `<option value="">Select user...</option>${options.join("")}`;
    }

    function renderAdminUsersReorder(){
      if (!adminUsersReorderList) return;
      if (!hasPermission("users.reorder")) {
        adminUsersReorderList.innerHTML = `<div class="page-subtitle" style="padding:10px;">Restricted</div>`;
        return;
      }
      const rows = adminUsersCache.slice().filter(u => u.is_active !== false);
      if (!rows.length){
        adminUsersReorderList.innerHTML = `<div class="page-subtitle" style="padding:10px;">No users.</div>`;
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
            <div class="user-row" draggable="true" data-user-id="${u.id}" data-role-id="${g.role_id}">
              <div class="drag-handle" title="Drag to reorder">|||</div>
              <div class="user-meta">
                <div class="user-name">${escapeHtml(u.name || "")}</div>
              </div>
            </div>
          `;
        }).join(""));
      }

      adminUsersReorderList.innerHTML = html.join("");
    }

    function clearUserEditor(){
      adminEditingUserId = null;
      if (adminEditUserName) adminEditUserName.value = "";
      if (adminEditUserRole) adminEditUserRole.value = "2";
      if (adminEditUserPin)  adminEditUserPin.value = "";
      if (adminUserEditHelp) adminUserEditHelp.textContent = "Fill details and click Save.";
      if (adminEditUserName) adminEditUserName.disabled = false;
      if (adminEditUserRole) adminEditUserRole.disabled = false;
      if (adminEditUserPin) adminEditUserPin.disabled = false;
      if (adminSaveUserBtn) adminSaveUserBtn.disabled = false;
    }

    function clearUserAddForm(){
      if (adminAddUserName) adminAddUserName.value = "";
      if (adminAddUserRole) adminAddUserRole.value = "2";
      if (adminAddUserPin) adminAddUserPin.value = "";
      if (adminUserAddHelp) adminUserAddHelp.textContent = "Fill details and click Create.";
      const canCreate = hasPermission("users.create");
      if (adminAddUserName) adminAddUserName.disabled = !canCreate;
      if (adminAddUserRole) adminAddUserRole.disabled = !canCreate;
      if (adminAddUserPin) adminAddUserPin.disabled = !canCreate || !hasPermission("users.set_pin");
      if (adminCreateUserBtn) adminCreateUserBtn.disabled = !canCreate;
      if (!canCreate && adminUserAddHelp) adminUserAddHelp.textContent = "Restricted.";
    }

    function openAddUserSection(){
      if (!requirePermission("users.create", "Permission required to add users.")) return;
      showUsersPage("add");
      clearUserAddForm();
    }

    function startEditUser(userId){
      if (!requirePermission("users.edit", "Permission required to edit users.")) return;
      const u = adminUsersCache.find(x => x.id === userId);
      if (!u) return;
      adminEditingUserId = u.id;
      adminEditUserName.value = u.name || "";
      adminEditUserRole.value = String(u.role_id || 2);
      adminEditUserPin.value = "";
      adminUserEditHelp.textContent = "Leave PIN blank to keep current PIN.";
      const isAdminAccount = !!u.is_admin;
      const canEditAdmin = currentUser?.is_admin;
      const canEditThisUser = !isAdminAccount || canEditAdmin;
      const canSetPin = hasPermission("users.set_pin") && canEditThisUser;
      adminEditUserName.disabled = !canEditThisUser;
      adminEditUserRole.disabled = !canEditThisUser;
      adminEditUserPin.disabled = !canSetPin;
      adminSaveUserBtn.disabled = !canEditThisUser;
      if (!canEditThisUser) {
        adminUserEditHelp.textContent = "Admin accounts are read-only unless you are superadmin.";
      } else if (!canSetPin) {
        adminUserEditHelp.textContent = "You can edit this user, but PIN changes are restricted.";
      }
      if (adminEditUserSelect) adminEditUserSelect.value = String(userId);
      loadPatternDefinitions();
      loadUserPattern();
      showUsersPage("edit");
    }

    async function toggleUserActive(userId){
      if (!requirePermission("users.toggle_active", "Permission required to change active status.")) return;
      const u = adminUsersCache.find(x => x.id === userId);
      if (!u) return;
      if (u.is_admin && !currentUser?.is_admin) {
        alert("Admin accounts are read-only unless you are superadmin.");
        return;
      }
      const next = (u.is_active === false) ? true : false;
      const ok = confirm(`${next ? "Reactivate" : "Deactivate"} ${u.name}?`);
      if (!ok) return;

      const pin = getSessionPinOrThrow();
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
      await loadAdminUsers();
    }

    async function adminSetUserPin(userId, pin){
      const { error } = await supabaseClient.rpc("set_user_pin", {
        p_user_id: userId,
        p_pin: pin
      });
      if (error) throw error;
    }

    async function saveUser(){
      if (!requirePermission("users.edit", "Permission required to edit users.")) return;
      const name = adminEditUserName.value.trim();
      const role_id = Number(adminEditUserRole.value);
      const pin = (adminEditUserPin.value || "").trim();

      if (!name) return alert("Name required.");
      if (![1,2,3].includes(role_id)) return alert("Role invalid.");
      const u = adminUsersCache.find(x => x.id === adminEditingUserId);
      if (u?.is_admin && !currentUser?.is_admin) {
        alert("Admin accounts are read-only unless you are superadmin.");
        return;
      }
      if (pin && !hasPermission("users.set_pin")) {
        alert("Permission required to change PIN.");
        return;
      }

      try {
        const { data: userId, error } = await supabaseClient.rpc("admin_upsert_user", {
          p_user_id: adminEditingUserId,
          p_name: name,
          p_role_id: role_id
        });
        if (error) throw error;
        if (pin) await adminSetUserPin(userId, pin);
        await loadAdminUsers();
        clearUserEditor();
        alert("Saved.");
      } catch (e){
        console.error(e);
        alert("Save failed. Check console.");
      }
    }

    async function createUser(){
      if (!requirePermission("users.create", "Permission required to add users.")) return;
      const name = adminAddUserName.value.trim();
      const role_id = Number(adminAddUserRole.value);
      const pin = (adminAddUserPin.value || "").trim();

      if (!name) return alert("Name required.");
      if (![1,2,3].includes(role_id)) return alert("Role invalid.");
      if (pin && pin.length !== 4) return alert("PIN must be 4 digits.");
      if (pin && !hasPermission("users.set_pin")) return alert("Permission required to set PIN.");

      try {
        const { data: userId, error } = await supabaseClient.rpc("admin_upsert_user", {
          p_user_id: null,
          p_name: name,
          p_role_id: role_id
        });
        if (error) throw error;
        if (pin) await adminSetUserPin(userId, pin);
        await loadAdminUsers();
        clearUserAddForm();
        alert("User created.");
      } catch (e){
        console.error(e);
        alert("Create failed. Check console.");
      }
    }

    function showUsersPage(id){
      usersPages.forEach(page => {
        page.style.display = page.id === `usersPage${id[0].toUpperCase()}${id.slice(1)}` ? "block" : "none";
      });
      usersPageTabs.forEach(tab => {
        tab.classList.toggle("is-active", tab.dataset.usersPage === id);
      });
      if (id === "add") {
        clearUserAddForm();
      }
      if (id === "edit") {
        if (!hasPermission("users.edit")) {
          if (adminUserEditHelp) adminUserEditHelp.textContent = "Restricted.";
          if (adminEditUserName) adminEditUserName.disabled = true;
          if (adminEditUserRole) adminEditUserRole.disabled = true;
          if (adminEditUserPin) adminEditUserPin.disabled = true;
          if (adminSaveUserBtn) adminSaveUserBtn.disabled = true;
        }
      }
    }

    let draggedElement = null;
    let draggedRoleId = null;


    async function updateUserDisplayOrder(roleId) {
      if (!requirePermission("users.reorder", "Permission required to reorder rota.")) return;
      try {
        const rows = Array.from(adminUsersList.querySelectorAll(`.user-row[data-role-id="${roleId}"]`));
        for (let i = 0; i < rows.length; i++) {
          const userId = rows[i].dataset.userId;
          const { error } = await supabaseClient
            .from('users')
            .update({ display_order: i + 1 })
            .eq('id', userId)
            .select();
          if (error) throw error;
        }
        await loadAdminUsers();
      } catch (error) {
        console.error('Error updating user order:', error);
        alert(`Failed to save new order: ${error.message}`);
      }
    }

    function showPanel(id){
      panels.forEach(panel => {
        panel.style.display = panel.id === id ? "block" : "none";
      });
      navLinks.forEach(link => {
        link.classList.toggle("is-active", link.dataset.panel === id);
      });
      if (id === "users" && !usersLoaded){
        usersLoaded = true;
        ensureCurrentUser().then((u) => {
          if (u && hasPermission("users.view")) {
            loadPermissionGroups();
            loadAdminUsers();
            clearUserEditor();
            clearUserAddForm();
            showUsersPage("view");
          }
        });
      }
      if (id === "reorder"){
        ensureCurrentUser().then((u) => {
          if (u && hasPermission("users.reorder")) {
            loadAdminUsers().then(renderAdminUsersReorder);
          }
        });
      }
      if (id === "permissions"){
        ensureCurrentUser().then(() => loadPermissionsCatalogue());
      }
      if (id === "patterns"){
        ensureCurrentUser().then(() => loadPatterns());
      }
      if (id === "shift-catalogue"){
        ensureCurrentUser().then(() => loadShiftsCatalogue());
      }
      if (id === "notices"){
        ensureCurrentUser().then(() => {
          if (hasPermission("notices.view_admin")) {
            loadAdminNotices();
          }
        });
      }
    }

    navLinks.forEach(link => {
      link.addEventListener("click", (e) => {
        e.preventDefault();
        showPanel(link.dataset.panel);
      });
    });

    usersPageTabs.forEach(tab => {
      tab.addEventListener("click", () => {
        showUsersPage(tab.dataset.usersPage);
      });
    });

    shiftsPageTabs.forEach(tab => {
      tab.addEventListener("click", () => {
        const pageId = "shiftsPage" + tab.dataset.shiftsPage.split("-").map(w => w.charAt(0).toUpperCase() + w.slice(1)).join("");
        shiftsPages.forEach(page => {
          page.style.display = page.id === pageId ? "block" : "none";
        });
        shiftsPageTabs.forEach(t => {
          t.classList.toggle("is-active", t === tab);
        });
      });
    });

    let permissionsCatalogue = null;
    let permissionGroups = [];
    let groupPermissions = new Set();
    const embeddedPermissionsCatalogue = {
      groups: ["Admin", "Mentor", "Staff", "Audit Viewer"],
      categories: [
        {
          id: "user_management",
          title: "User management",
          items: [
            { key: "users.view", label: "View users", desc: "View user list, roles, and status." },
            { key: "users.create", label: "Add users", desc: "Create new user records." },
            { key: "users.edit", label: "Edit users", desc: "Edit name and role." },
            { key: "users.set_pin", label: "Change PIN", desc: "Set or reset user PINs." },
            { key: "users.toggle_active", label: "Activate/deactivate users", desc: "Change active status." },
            { key: "users.reorder", label: "Reorder rota", desc: "Change display order." }
          ]
        },
        {
          id: "requests",
          title: "Requests",
          items: [
            { key: "requests.view_all", label: "View all requests", desc: "See requests for all users." },
            { key: "requests.edit_all", label: "Edit all requests", desc: "Edit other users' requests." },
            { key: "requests.lock_cells", label: "Lock/unlock requests", desc: "Lock or unlock request cells." },
            { key: "requests.view_comments", label: "View all comments", desc: "View all week comments." }
          ]
        },
        {
          id: "rota",
          title: "Rota / Draft",
          items: [
            { key: "rota.view_draft", label: "View draft", desc: "View draft rota." },
            { key: "rota.edit_draft", label: "Edit draft", desc: "Edit draft rota cells." },
            { key: "rota.publish", label: "Publish period", desc: "Publish a period." },
            { key: "rota.approve", label: "Annotate approval", desc: "Add CNM approval annotation." }
          ]
        },
        {
          id: "periods",
          title: "Rota periods & weeks",
          items: [
            { key: "periods.create", label: "Create period", desc: "Create a new 5-week period." },
            { key: "periods.set_active", label: "Set active period", desc: "Set active period." },
            { key: "periods.toggle_hidden", label: "Hide/unhide period", desc: "Toggle hidden periods." },
            { key: "periods.set_close_time", label: "Set close time", desc: "Set or clear closes_at." },
            { key: "weeks.set_open_flags", label: "Open/close weeks", desc: "Update week open flags." }
          ]
        },
        {
          id: "notices",
          title: "Notices",
          items: [
            { key: "notices.view_admin", label: "View notices (admin)", desc: "View admin notice list." },
            { key: "notices.create", label: "Create notices", desc: "Create notices." },
            { key: "notices.edit", label: "Edit notices", desc: "Edit notices." },
            { key: "notices.toggle_active", label: "Hide/unhide notices", desc: "Toggle notice visibility." },
            { key: "notices.delete", label: "Delete notices", desc: "Delete notices." },
            { key: "notices.view_ack_counts", label: "View ack counts", desc: "View acknowledgement counts." },
            { key: "notices.view_ack_lists", label: "View ack lists", desc: "View acknowledgement lists." }
          ]
        },
        {
          id: "print_export",
          title: "Print & export",
          items: [
            { key: "print.open_admin", label: "Open admin print", desc: "Open admin print config." },
            { key: "print.export_csv", label: "Export CSV", desc: "Export CSV data." }
          ]
        },
        {
          id: "system",
          title: "System",
          items: [
            { key: "system.admin_panel", label: "Admin panel access", desc: "Access admin console." }
          ]
        }
      ]
    };

    async function loadPermissionsCatalogue(){
      if (!permissionsMatrix || !permissionGroupSelect) return;
      if (!hasPermission("system.admin_panel")) {
        permissionsMatrix.innerHTML = `<div class="page-subtitle">Restricted</div>`;
        if (permissionGroupSelect) permissionGroupSelect.disabled = true;
        if (permissionGroupName) permissionGroupName.disabled = true;
        if (createPermissionGroupBtn) createPermissionGroupBtn.disabled = true;
        if (permissionGroupHelp) permissionGroupHelp.textContent = "Restricted.";
        return;
      }
      try {
        // Load permissions from database
        const { data: permissions, error } = await supabaseClient
          .from("permissions")
          .select("key, label, description, category")
          .order("category", { ascending: true })
          .order("key", { ascending: true });
        
        if (error) throw error;
        
        // Group permissions by category
        const categoryMap = new Map();
        (permissions || []).forEach(perm => {
          const cat = perm.category || "other";
          if (!categoryMap.has(cat)) {
            categoryMap.set(cat, []);
          }
          categoryMap.get(cat).push({
            key: perm.key,
            label: perm.label,
            desc: perm.description || ""
          });
        });
        
        // Convert to catalogue format
        const categories = [];
        categoryMap.forEach((items, catId) => {
          categories.push({
            id: catId,
            title: catId.replace(/_/g, " ").replace(/\b\w/g, l => l.toUpperCase()),
            items: items
          });
        });
        
        // Load permission groups
        const { data: groups, error: groupsError } = await supabaseClient
          .from("permission_groups")
          .select("name")
          .order("name", { ascending: true });
        
        if (groupsError) throw groupsError;
        
        permissionsCatalogue = {
          groups: (groups || []).map(g => g.name),
          categories: categories
        };
        
        await loadPermissionGroups();
        renderPermissionsMatrix();
        const canEdit = hasPermission("users.edit");
        if (permissionGroupSelect) permissionGroupSelect.disabled = !canEdit;
        if (permissionGroupName) permissionGroupName.disabled = !canEdit;
        if (createPermissionGroupBtn) createPermissionGroupBtn.disabled = !canEdit;
        if (permissionGroupHelp) {
          permissionGroupHelp.textContent = canEdit
            ? "Admin group can be assigned by admins, but only superadmin can edit its permissions."
            : "Read-only. You don't have permission to edit groups.";
        }
      } catch (e) {
        console.error(e);
        permissionsMatrix.innerHTML = `<div class="page-subtitle">Failed to load permissions catalogue.</div>`;
      }
    }

    // === PATTERNS MANAGEMENT ===
    
    async function loadPatterns(){
      try {
        const { data: patterns, error } = await supabaseClient
          .from("pattern_definitions")
          .select("id, name, cycle_weeks, weekly_targets, pattern_type, requires_anchor, notes")
          .order("id", { ascending: true });
        if (error) throw error;
        
        const list = document.getElementById("patternsList");
        if (!list) return;
        
        if (!patterns || patterns.length === 0){
          list.innerHTML = `<tr style="border-top:1px solid var(--line);"><td colspan="6" style="padding:12px 16px; color:var(--muted); text-align:center;">No patterns found.</td></tr>`;
          return;
        }
        
        list.innerHTML = patterns.map(p => {
          const weeklyTargets = Array.isArray(p.weekly_targets) ? p.weekly_targets.join(" / ") : p.weekly_targets;
          return `
            <tr style="border-top:1px solid var(--line);">
              <td style="padding:12px 16px;">${escapeHtml(p.name || "")}</td>
              <td style="padding:12px 16px;">${escapeHtml(p.pattern_type || "")}</td>
              <td style="padding:12px 16px;">${p.cycle_weeks || "-"}</td>
              <td style="padding:12px 16px;">${escapeHtml(weeklyTargets || "-")}</td>
              <td style="padding:12px 16px;">${p.requires_anchor ? "Yes" : "No"}</td>
              <td style="padding:12px 16px; font-size:12px; color:var(--muted);">${escapeHtml(p.notes || "")}</td>
            </tr>
          `;
        }).join("");
      } catch (e){
        console.error(e);
        const list = document.getElementById("patternsList");
        if (list) list.innerHTML = `<tr style="border-top:1px solid var(--line);"><td colspan="6" style="padding:12px 16px; color:var(--muted); text-align:center;">Failed to load patterns.</td></tr>`;
      }
    }

    async function loadPatternDefinitions(){
      try {
        const { data: patterns, error } = await supabaseClient
          .from("pattern_definitions")
          .select("id, name, requires_anchor")
          .order("name", { ascending: true });
        if (error) throw error;
        
        console.log("[PATTERNS] Loaded pattern definitions:", patterns);
        
        const select = document.getElementById("adminUserPattern");
        if (!select) {
          console.error("[PATTERNS] Pattern selector not found!");
          return;
        }
        
        select.innerHTML = `<option value="">No fixed pattern</option>`;
        if (patterns && patterns.length > 0){
          patterns.forEach(p => {
            const opt = document.createElement("option");
            opt.value = String(p.id);
            opt.textContent = p.name || "Unknown";
            opt.dataset.requiresAnchor = p.requires_anchor ? "true" : "false";
            select.appendChild(opt);
          });
          console.log("[PATTERNS] Populated dropdown with", patterns.length, "patterns");
        }
      } catch (e){
        console.error("[PATTERNS] Failed to load pattern definitions:", e);
      }
    }

    async function saveUserPattern(){
      if (!requirePermission("users.edit", "Permission required.")) return;
      
      const userId = adminEditingUserId;
      if (!userId) {
        console.error("[PATTERNS] No user selected.");
        return alert("Select a user first.");
      }
      
      const patternSelect = document.getElementById("adminUserPattern");
      const anchorDateInput = document.getElementById("adminUserAnchorDate");
      
      if (!patternSelect || !anchorDateInput) {
        console.error("[PATTERNS] Form elements not found.");
        return;
      }
      
      const patternId = patternSelect.value || null;
      const anchorDate = anchorDateInput.value || null;
      
      console.log("[PATTERNS] Saving pattern for user", userId, "pattern:", patternId, "anchor:", anchorDate);
      
      try {
        if (patternId){
          // Get pattern to check if anchor is required
          const { data: pattern, error: patternErr } = await supabaseClient
            .from("pattern_definitions")
            .select("requires_anchor")
            .eq("id", patternId)
            .single();
          if (patternErr) throw patternErr;
          
          console.log("[PATTERNS] Pattern found:", pattern);
          
          // Upsert user pattern
          const { data: result, error: upsertErr } = await supabaseClient
            .from("user_patterns")
            .upsert({
              user_id: userId,
              pattern_id: patternId,
              anchor_week_start_date: pattern.requires_anchor ? anchorDate : null,
              assigned_by: currentUser.id,
              assigned_at: new Date().toISOString()
            }, { onConflict: "user_id" });
          if (upsertErr) throw upsertErr;
          console.log("[PATTERNS] Pattern saved successfully:", result);
        } else {
          // Delete user pattern if no pattern selected
          const { error: deleteErr } = await supabaseClient
            .from("user_patterns")
            .delete()
            .eq("user_id", userId);
          if (deleteErr) throw deleteErr;
          console.log("[PATTERNS] Pattern cleared.");
        }
      } catch (e){
        console.error("[PATTERNS] Save failed:", e);
        alert("Pattern save failed. Check console.");
      }
    }

    async function loadUserPattern(){
      const userId = adminEditingUserId;
      if (!userId) return;
      
      const patternSelect = document.getElementById("adminUserPattern");
      const anchorDateInput = document.getElementById("adminUserAnchorDate");
      
      if (!patternSelect || !anchorDateInput) return;
      
      try {
        const { data: userPattern, error } = await supabaseClient
          .from("user_patterns")
          .select("pattern_id, anchor_week_start_date")
          .eq("user_id", userId)
          .single();
        
        if (error && error.code !== "PGRST116"){
          throw error;
        }
        
        if (userPattern){
          patternSelect.value = String(userPattern.pattern_id || "");
          anchorDateInput.value = userPattern.anchor_week_start_date || "";
          updateAnchorDateVisibility();
        } else {
          patternSelect.value = "";
          anchorDateInput.value = "";
          updateAnchorDateVisibility();
        }
      } catch (e){
        console.error(e);
      }
    }

    function updateAnchorDateVisibility(){
      const patternSelect = document.getElementById("adminUserPattern");
      const anchorDateInput = document.getElementById("adminUserAnchorDate");
      
      if (!patternSelect || !anchorDateInput) return;
      
      const selectedOption = patternSelect.options[patternSelect.selectedIndex];
      const requiresAnchor = selectedOption?.dataset?.requiresAnchor === "true";
      
      anchorDateInput.style.display = requiresAnchor ? "block" : "none";
      if (!requiresAnchor) anchorDateInput.value = "";
    }

    async function loadPermissionGroups(){
      try {
        const { data, error } = await supabaseClient
          .from("permission_groups")
          .select("id, name, is_system, is_protected")
          .order("name", { ascending: true });
        if (error) throw error;
        permissionGroups = data || [];
      } catch (e) {
        console.warn("Permissions groups table missing or unavailable.", e);
        permissionGroups = (permissionsCatalogue?.groups || []).map((name) => ({
          id: name,
          name,
          is_system: true,
          is_protected: name === "Admin"
        }));
      }

      permissionGroupSelect.innerHTML =
        `<option value="">Select group...</option>` +
        permissionGroups.map(g => `<option value="${escapeHtml(g.id)}">${escapeHtml(g.name)}</option>`).join("");

      renderUserPermissionGroups();
    }

    function renderUserPermissionGroups(){
      if (!adminUserPermissionGroups) return;
      if (!permissionGroups.length){
        adminUserPermissionGroups.innerHTML = `<div class="page-subtitle">No groups loaded.</div>`;
        return;
      }
      const canEditUsers = hasPermission("users.edit");
      adminUserPermissionGroups.innerHTML = permissionGroups.map(g => `
        <label style="display:flex; align-items:center; gap:6px;">
          <input type="checkbox" data-perm-group="${escapeHtml(g.name)}" ${canEditUsers ? "" : "disabled"} />
          ${escapeHtml(g.name)}
        </label>
      `).join("");
    }

    async function loadGroupPermissions(groupId){
      groupPermissions = new Set();
      if (!groupId) return;
      try {
        const { data, error } = await supabaseClient
          .from("permission_group_permissions")
          .select("permission_key")
          .eq("group_id", groupId);
        if (error) throw error;
        (data || []).forEach(r => groupPermissions.add(r.permission_key));
      } catch (e) {
        console.warn("permission_group_permissions not available.", e);
      }
    }

    function isSuperAdmin(){
      return !!currentUser?.is_admin;
    }

    function isEditingAdminGroup(){
      const groupId = permissionGroupSelect?.value || "";
      const group = permissionGroups.find(g => String(g.id) === String(groupId));
      return group?.name === "Admin";
    }

    function renderPermissionsMatrix(){
      const categories = Array.isArray(permissionsCatalogue?.categories) ? permissionsCatalogue.categories : [];
      const canEdit = hasPermission("users.edit");
      const disabled = (isEditingAdminGroup() && !isSuperAdmin()) || !canEdit;

      permissionsMatrix.innerHTML = categories.map(cat => {
        const items = cat.items || [];
        const selectedCount = items.filter(item => groupPermissions.has(item.key)).length;
        const rows = items.map(item => {
          const checked = groupPermissions.has(item.key);
          return `
            <div class="permissions-row">
              <div>
                <div class="perm-label">${escapeHtml(item.label || "")}</div>
                <div class="perm-desc">${escapeHtml(item.desc || "")}</div>
                <div class="perm-key">${escapeHtml(item.key || "")}</div>
              </div>
              <div>
                <input type="checkbox" data-perm-key="${escapeHtml(item.key)}" ${checked ? "checked" : ""} ${disabled ? "disabled" : ""} />
              </div>
            </div>
          `;
        }).join("");

        return `
          <details class="perm-accordion" open>
            <summary>
              <div class="permissions-title">
                ${escapeHtml(cat.title || "")}
                <span class="perm-meta">${selectedCount}/${items.length} enabled</span>
              </div>
              <span class="perm-chevron">v</span>
            </summary>
            <div class="perm-body">
              ${rows}
            </div>
          </details>
        `;
      }).join("");
    }

    async function saveGroupPermissions(groupId){
      if (!requirePermission("users.edit", "Permission required to edit permissions.")) return;
      if (!groupId) return;
      const checkboxes = Array.from(permissionsMatrix.querySelectorAll("input[data-perm-key]"));
      const keys = checkboxes.filter(c => c.checked).map(c => c.dataset.permKey);
      try {
        await supabaseClient.from("permission_group_permissions").delete().eq("group_id", groupId);
        if (keys.length){
          const rows = keys.map(k => ({ group_id: groupId, permission_key: k }));
          const { error } = await supabaseClient.from("permission_group_permissions").insert(rows);
          if (error) throw error;
        }
      } catch (e) {
        console.error(e);
        alert("Failed to save permissions. Check console.");
      }
    }

    async function createPermissionGroup(){
      if (!requirePermission("users.edit", "Permission required to create groups.")) return;
      const name = (permissionGroupName?.value || "").trim();
      if (!name) return alert("Group name required.");
      try {
        const { data, error } = await supabaseClient
          .from("permission_groups")
          .insert({ name })
          .select()
          .single();
        if (error) throw error;
        permissionGroupName.value = "";
        await loadPermissionGroups();
        permissionGroupSelect.value = String(data.id);
        groupPermissions = new Set();
        renderPermissionsMatrix();
      } catch (e) {
        console.error(e);
        alert("Failed to create group. Check console.");
      }
    }

    permissionGroupSelect?.addEventListener("change", async () => {
      const groupId = permissionGroupSelect.value;
      await loadGroupPermissions(groupId);
      renderPermissionsMatrix();
      if (permissionGroupHelp) {
        permissionGroupHelp.textContent = isEditingAdminGroup() && !isSuperAdmin()
          ? "Admin group is read-only unless you are superadmin."
          : "Changes are saved immediately.";
      }
    });

    permissionsMatrix?.addEventListener("change", async (e) => {
      const cb = e.target.closest("input[data-perm-key]");
      if (!cb) return;
      const groupId = permissionGroupSelect.value;
      if (!groupId) return alert("Select a group first.");
      if (isEditingAdminGroup() && !isSuperAdmin()){
        cb.checked = !cb.checked;
        return;
      }
      await saveGroupPermissions(groupId);
      await loadGroupPermissions(groupId);
      renderPermissionsMatrix();
    });

    createPermissionGroupBtn?.addEventListener("click", createPermissionGroup);

    async function loadUserPermissionGroups(userId){
      const checks = Array.from(document.querySelectorAll("input[data-perm-group]"));
      checks.forEach(c => { c.checked = false; c.disabled = true; });
      if (!hasPermission("users.edit")) {
        const help = document.querySelector("#usersPageEdit .page-subtitle");
        if (help) help.textContent = "Restricted.";
        return;
      }
      if (!userId) return;
      const u = adminUsersCache.find(x => String(x.id) === String(userId));
      if (u?.is_admin && !currentUser?.is_admin) {
        const help = document.querySelector("#usersPageEdit .page-subtitle");
        if (help) help.textContent = "Admin accounts are read-only unless you are superadmin.";
        return;
      }
      try {
        const { data, error } = await supabaseClient
          .from("user_permission_groups")
          .select("group_id, permission_groups(name)")
          .eq("user_id", userId);
        if (error) throw error;
        const names = new Set((data || []).map(r => r.permission_groups?.name).filter(Boolean));
        checks.forEach(c => {
          c.checked = names.has(c.dataset.permGroup);
          c.disabled = false;
        });
      } catch (e) {
        console.warn("user_permission_groups not available.", e);
      }
    }

    async function saveUserPermissionGroups(userId){
      if (!hasPermission("users.edit")) return;
      if (!userId) return;
      const u = adminUsersCache.find(x => String(x.id) === String(userId));
      if (u?.is_admin && !currentUser?.is_admin) {
        alert("Admin accounts are read-only unless you are superadmin.");
        return;
      }
      const checks = Array.from(document.querySelectorAll("input[data-perm-group]"));
      const selectedNames = checks.filter(c => c.checked).map(c => c.dataset.permGroup);
      const groupIds = permissionGroups
        .filter(g => selectedNames.includes(g.name))
        .map(g => g.id);

      try {
        await supabaseClient.from("user_permission_groups").delete().eq("user_id", userId);
        if (groupIds.length){
          const rows = groupIds.map(id => ({ user_id: userId, group_id: id }));
          const { error } = await supabaseClient.from("user_permission_groups").insert(rows);
          if (error) throw error;
        }
      } catch (e) {
        console.error(e);
        alert("Failed to save user groups. Check console.");
      }
    }

    async function loadShiftsCatalogue(){
      if (!hasPermission("manage_shifts")) {
        const list = document.getElementById("shiftsList");
        if (list) list.innerHTML = `<div style="padding:20px; text-align:center; color:var(--muted);">Restricted access.</div>`;
        return;
      }
      try {
        let styleFieldsAvailable = true;
        let shifts;
        // Try to include styling columns; if they don't exist, fallback without them
        try {
          const { data, error } = await supabaseClient
            .from("shifts")
            .select("id, code, label, hours_value, start_time, end_time, day_or_night, allowed_staff_groups, allow_requests, allow_draft, allow_post_publish, fill_color, text_color, text_bold, text_italic")
            .order("code", { ascending: true });
          if (error) throw error;
          shifts = data;
        } catch (e) {
          console.warn("[SHIFTS] Styling columns not found; falling back without styling fields", e?.message);
          styleFieldsAvailable = false;
          const { data, error } = await supabaseClient
            .from("shifts")
            .select("id, code, label, hours_value, start_time, end_time, day_or_night, allowed_staff_groups, allow_requests, allow_draft, allow_post_publish")
            .order("code", { ascending: true });
          if (error) throw error;
          shifts = data;
        }

        allShifts = shifts || [];

        const list = document.getElementById("shiftsList");
        if (!list) return;
        
        list.innerHTML = (shifts || []).map(shift => {
          const hours = shift.start_time && shift.end_time ? `${shift.start_time.substring(0,5)}–${shift.end_time.substring(0,5)}` : "(no hours)";
          const staffGroups = shift.allowed_staff_groups || "None";
          const scopes = [];
          if (shift.allow_requests) scopes.push("requests");
          if (shift.allow_draft) scopes.push("draft");
          if (shift.allow_post_publish) scopes.push("post-publish");
          const shiftScopes = scopes.join(", ") || "None";

          // Styling preview values (safe defaults if fields missing)
          const fill = shift.fill_color || "#f7f7f7";
          const text = shift.text_color || "#000000";
          const weight = shift.text_bold ? "700" : "600";
          const fontStyle = shift.text_italic ? "italic" : "normal";
          
          return `
            <div style="padding:12px; border-bottom:1px solid var(--line); display:flex; align-items:center; justify-content:space-between; gap:12px;">
              <div style="flex:1;">
                <div style="display:inline-block; padding:4px 10px; border-radius:6px; margin-bottom:8px; background:${fill}; color:${text}; border:1px solid #ccc; font-size:12px; font-weight:${weight}; font-style:${fontStyle};">
                  ${escapeHtml(shift.code)} – ${escapeHtml(shift.label)} (${shift.hours_value}h)
                </div>
                <div style="font-size:11px; color:var(--muted); margin:4px 0;">Hours: ${escapeHtml(hours)}</div>
                <div style="font-size:11px; color:var(--muted); margin:4px 0;">Staff Groups: ${escapeHtml(staffGroups)}</div>
                <div style="font-size:11px; color:var(--muted); margin:4px 0;">Scopes: ${escapeHtml(shiftScopes)}</div>
              </div>
              <div style="display:flex; gap:8px;">
                <button class="btn" onclick="editShift('${escapeHtml(shift.id)}')">Edit</button>
                <button class="btn" onclick="deleteShift('${escapeHtml(shift.id)}', '${escapeHtml(shift.code)}')" style="background:#ef4444; color:#fff; border-color:#ef4444;">Delete</button>
              </div>
            </div>
          `;
        }).join("");

        if ((shifts || []).length === 0) {
          list.innerHTML = `<div style="padding:20px; text-align:center; color:var(--muted);">No shifts found.</div>`;
        }
      } catch (e) {
        console.error("Failed to load shifts", e);
        const list = document.getElementById("shiftsList");
        if (list) list.innerHTML = `<div style="padding:20px; text-align:center; color:var(--muted);">Failed to load shifts.</div>`;
      }
    }

    let allShifts = [];
    let currentEditingShiftId = null;

    function updateShiftPreview(){
      const preview = document.getElementById("editShiftPreview");
      if (!preview) return;
      const fillColor = document.getElementById("editShiftFill")?.value || "#ffffff";
      const textColor = document.getElementById("editShiftText")?.value || "#000000";
      const bold = document.getElementById("editShiftBold")?.checked || false;
      const italic = document.getElementById("editShiftItalic")?.checked || false;
      preview.style.backgroundColor = fillColor;
      preview.style.color = textColor;
      preview.style.fontWeight = bold ? "700" : "600";
      preview.style.fontStyle = italic ? "italic" : "normal";
    }

    function updateNewShiftPreview(){
      const preview = document.getElementById("newShiftPreview");
      if (!preview) return;
      const fillColor = document.getElementById("newShiftFill")?.value || "#ffffff";
      const textColor = document.getElementById("newShiftText")?.value || "#000000";
      const bold = document.getElementById("newShiftBold")?.checked || false;
      const italic = document.getElementById("newShiftItalic")?.checked || false;
      preview.style.backgroundColor = fillColor;
      preview.style.color = textColor;
      preview.style.fontWeight = bold ? "700" : "600";
      preview.style.fontStyle = italic ? "italic" : "normal";
    }

    window.editShift = async function(shiftId){
      console.log("[EDIT SHIFT] Called with ID:", shiftId);
      currentEditingShiftId = shiftId;
      const shift = allShifts.find(s => s.id == shiftId); // Use == instead of === for type coercion
      if (!shift) {
        console.error("[EDIT SHIFT] Shift not found:", shiftId);
        alert("Shift not found!");
        return;
      }

      console.log("[EDIT SHIFT] Found shift:", shift);

      try {
        // NEW schema: allowed_staff_groups is comma-separated string
        const staffGroups = (shift.allowed_staff_groups || "").split(",").map(g => g.trim()).filter(Boolean);

        console.log("[EDIT SHIFT] Staff groups:", staffGroups);

        document.getElementById("editShiftTitle").textContent = `Edit Shift: ${shift.code}`;
        document.getElementById("editShiftCode").value = shift.code;
        const labelField = document.getElementById("editShiftLabel");
        labelField.value = shift.label || "";
        document.getElementById("editShiftStart").value = shift.start_time || "";
        document.getElementById("editShiftEnd").value = shift.end_time || "";
        document.getElementById("editShiftHours").value = shift.hours_value || "";
        document.getElementById("editShiftNA").checked = staffGroups.includes("NA");
        document.getElementById("editShiftSN").checked = staffGroups.includes("Nurse");
        document.getElementById("editShiftCN").checked = staffGroups.includes("CN");
        document.getElementById("editShiftRequests").checked = shift.allow_requests || false;
        document.getElementById("editShiftRotaDraft").checked = shift.allow_draft || false;
        document.getElementById("editShiftRotaPost").checked = shift.allow_post_publish || false;
        
        // Load styling fields
        document.getElementById("editShiftFill").value = shift.fill_color || "#ffffff";
        document.getElementById("editShiftText").value = shift.text_color || "#000000";
        document.getElementById("editShiftBold").checked = shift.text_bold || false;
        document.getElementById("editShiftItalic").checked = shift.text_italic || false;

        console.log("[EDIT SHIFT] Form fields populated, opening modal");
        document.getElementById("editShiftModal").style.display = "block";
        // Clear selection and focus on label field for editing
        labelField.setSelectionRange(0, 0);
        labelField.focus();
        updateShiftPreview();
      } catch (e) {
        console.error("[EDIT SHIFT] Error:", e);
        alert("Failed to open edit form: " + e.message);
      }
    };

    window.saveShift = async function(){
      console.log("[SAVE SHIFT] Called, currentEditingShiftId:", currentEditingShiftId);
      if (!currentEditingShiftId) {
        alert("No shift selected for editing.");
        return;
      }
      const shift = allShifts.find(s => s.id == currentEditingShiftId); // Use == for type coercion
      if (!shift) {
        alert("Shift not found in catalog.");
        return;
      }

      try {
        // NEW schema: allowed_staff_groups is comma-separated string
        const staffGroups = [];
        if (document.getElementById("editShiftNA").checked) staffGroups.push("NA");
        if (document.getElementById("editShiftSN").checked) staffGroups.push("Nurse");
        if (document.getElementById("editShiftCN").checked) staffGroups.push("CN");

        // Styling fields now saved (columns exist in shifts table)
        const updateData = {
          label: document.getElementById("editShiftLabel").value,
          start_time: document.getElementById("editShiftStart").value || null,
          end_time: document.getElementById("editShiftEnd").value || null,
          hours_value: parseFloat(document.getElementById("editShiftHours").value) || 0,
          allowed_staff_groups: staffGroups.join(","),
          allow_requests: document.getElementById("editShiftRequests").checked,
          allow_draft: document.getElementById("editShiftRotaDraft").checked,
          allow_post_publish: document.getElementById("editShiftRotaPost").checked,
          fill_color: document.getElementById("editShiftFill").value || null,
          text_color: document.getElementById("editShiftText").value || null,
          text_bold: document.getElementById("editShiftBold").checked,
          text_italic: document.getElementById("editShiftItalic").checked
        };
        console.log("[SAVE SHIFT] Update data with styling:", updateData);

        console.log("[SAVE SHIFT] Update data:", updateData);
        console.log("[SAVE SHIFT] Shift ID:", currentEditingShiftId);

        const { data: result, error: updateErr } = await supabaseClient
          .from("shifts")
          .update(updateData)
          .eq("id", currentEditingShiftId)
          .select();

        console.log("[SAVE SHIFT] Update response - data:", result, "error:", updateErr);

        if (updateErr) throw updateErr;

        alert("Shift updated successfully!");
        document.getElementById("editShiftModal").style.display = "none";
        currentEditingShiftId = null;
        await loadShiftsCatalogue();
      } catch (e) {
        console.error("[SAVE SHIFT] Error:", e);
        alert("Failed to save shift: " + e.message);
      }
    };

    window.deleteShift = async function(shiftId, shiftCode){
      if (!confirm(`Are you sure you want to delete shift "${shiftCode}"?\n\nThis action cannot be undone.`)) {
        return;
      }

      try {
        const { error: deleteErr } = await supabaseClient
          .from("shifts")
          .delete()
          .eq("id", shiftId);
        
        if (deleteErr) throw deleteErr;

        alert(`Shift "${shiftCode}" deleted successfully!`);
        await loadShiftsCatalogue();
      } catch (e) {
        console.error("Failed to delete shift", e);
        alert("Failed to delete shift: " + e.message);
      }
    };

    window.createNewShift = async function(){
      const code = document.getElementById("newShiftCode")?.value?.trim();
      const label = document.getElementById("newShiftLabel")?.value?.trim();
      
      if (!code || !label) {
        alert("Code and Label are required.");
        return;
      }

      try {
        // NEW schema: allowed_staff_groups is comma-separated string
        const staffGroups = [];
        if (document.getElementById("newShiftNA").checked) staffGroups.push("NA");
        if (document.getElementById("newShiftSN").checked) staffGroups.push("Nurse");
        if (document.getElementById("newShiftCN").checked) staffGroups.push("CN");

        const { data: newShift, error: insertErr } = await supabaseClient
          .from("shifts")
          .insert({
            code: code,
            label: label,
            start_time: document.getElementById("newShiftStart").value || null,
            end_time: document.getElementById("newShiftEnd").value || null,
            hours_value: parseFloat(document.getElementById("newShiftHours").value) || 0,
            allowed_staff_groups: staffGroups.join(","),
            allow_requests: document.getElementById("newShiftRequests").checked,
            allow_draft: document.getElementById("newShiftRotaDraft").checked,
            allow_post_publish: document.getElementById("newShiftRotaPost").checked,
            fill_color: document.getElementById("newShiftFill").value || null,
            text_color: document.getElementById("newShiftText").value || null,
            text_bold: document.getElementById("newShiftBold").checked,
            text_italic: document.getElementById("newShiftItalic").checked,
            day_or_night: "day"
          })
          .select();
        if (insertErr) throw insertErr;
        if (!newShift || newShift.length === 0) throw new Error("Failed to create shift");

        alert("Shift created successfully!");
        document.getElementById("createShiftModal").style.display = "none";
        clearCreateShiftForm();
        await loadShiftsCatalogue();
      } catch (e) {
        console.error("Failed to create shift", e);
        alert("Failed to create shift: " + e.message);
      }
    };

    function clearCreateShiftForm(){
      document.getElementById("newShiftCode").value = "";
      document.getElementById("newShiftLabel").value = "";
      document.getElementById("newShiftStart").value = "";
      document.getElementById("newShiftEnd").value = "";
      document.getElementById("newShiftHours").value = "";
      document.getElementById("newShiftNA").checked = false;
      document.getElementById("newShiftSN").checked = false;
      document.getElementById("newShiftCN").checked = false;
      document.getElementById("newShiftFill").value = "#ffffff";
      document.getElementById("newShiftText").value = "#000000";
      document.getElementById("newShiftBold").checked = false;
      document.getElementById("newShiftItalic").checked = false;
      document.getElementById("newShiftRequests").checked = false;
      document.getElementById("newShiftRotaDraft").checked = false;
      document.getElementById("newShiftRotaPost").checked = false;
      document.getElementById("newShiftAvailable").checked = false;
      updateNewShiftPreview();
    }
    adminCreateUserBtn?.addEventListener("click", createUser);
    adminAddUserCancelBtn?.addEventListener("click", clearUserAddForm);

    adminUserSearch?.addEventListener("input", renderAdminUsers);
    adminShowInactiveUsers?.addEventListener("change", renderAdminUsers);
    adminAddUserBtn?.addEventListener("click", openAddUserSection);
    adminCancelUserEditBtn?.addEventListener("click", clearUserEditor);
    adminSaveUserBtn?.addEventListener("click", saveUser);

    // Pattern selector listeners
    document.getElementById("adminUserPattern")?.addEventListener("change", () => {
      updateAnchorDateVisibility();
      saveUserPattern();
    });
    
    document.getElementById("adminUserAnchorDate")?.addEventListener("change", saveUserPattern);

    adminUsersList?.addEventListener("click", (e) => {
      const btn = e.target.closest("button[data-act]");
      if (!btn) return;
      const id = btn.dataset.id;
      const act = btn.dataset.act;
      if (act === "edit") {
        startEditUser(id);
        loadUserPermissionGroups(id);
      }
      if (act === "toggle") toggleUserActive(id);
    });

    adminEditUserSearch?.addEventListener("input", () => {
      renderAdminUserSelectOptions(adminEditUserSearch.value);
    });

    adminEditUserSelect?.addEventListener("change", () => {
      const id = adminEditUserSelect.value;
      if (id) {
        startEditUser(id);
        loadUserPermissionGroups(id);
      }
    });

    adminUserPermissionGroups?.addEventListener("change", (e) => {
      const chk = e.target.closest("input[data-perm-group]");
      if (!chk) return;
      const userId = adminEditingUserId;
      if (!userId) return alert("Select a user first.");
      saveUserPermissionGroups(userId);
    });

    // Shift catalogue event listeners
    document.getElementById("createShiftBtn")?.addEventListener("click", () => {
      clearCreateShiftForm();
      document.getElementById("createShiftModal").style.display = "block";
    });

    // Add style preview listeners for create form
    ["newShiftFill", "newShiftText", "newShiftBold", "newShiftItalic"].forEach(id => {
      const elem = document.getElementById(id);
      if (elem) {
        elem.addEventListener("change", updateNewShiftPreview);
        elem.addEventListener("input", updateNewShiftPreview);
      }
    });

    // Add style preview listeners for edit form
    ["editShiftFill", "editShiftText", "editShiftBold", "editShiftItalic"].forEach(id => {
      const elem = document.getElementById(id);
      if (elem) {
        elem.addEventListener("change", updateShiftPreview);
        elem.addEventListener("input", updateShiftPreview);
      }
    });

    document.getElementById("createShiftSubmitBtn")?.addEventListener("click", createNewShift);
    document.getElementById("closeCreateShiftBtn")?.addEventListener("click", () => {
      document.getElementById("createShiftModal").style.display = "none";
      clearCreateShiftForm();
    });

    document.getElementById("saveShiftBtn")?.addEventListener("click", saveShift);
    document.getElementById("closeEditShiftBtn")?.addEventListener("click", () => {
      document.getElementById("editShiftModal").style.display = "none";
      currentEditingShiftId = null;
    });

    // Close modals when clicking outside
    document.getElementById("editShiftModal")?.addEventListener("click", (e) => {
      if (e.target.id === "editShiftModal") {
        e.target.style.display = "none";
        currentEditingShiftId = null;
      }
    });

    document.getElementById("createShiftModal")?.addEventListener("click", (e) => {
      if (e.target.id === "createShiftModal") {
        e.target.style.display = "none";
        clearCreateShiftForm();
      }
    });

    console.log("[ADMIN.JS] Attaching load listener");
    window.addEventListener("load", async () => {
      console.log("[ADMIN.JS] Load event fired, calling ensureCurrentUser");
      await ensureCurrentUser();
      console.log("[ADMIN.JS] ensureCurrentUser done, calling loadLoginUsers");
      await loadLoginUsers();
      const activeLink = document.querySelector(".nav a.is-active");
      const panelId = activeLink?.dataset.panel || navLinks[0]?.dataset.panel;
      if (panelId) showPanel(panelId);
    });

    adminLoginBtn?.addEventListener("click", adminLogin);
    adminLoginPin?.addEventListener("keydown", (e) => {
      if (e.key === "Enter") adminLogin();
    });

    // === NOTICES ADMIN WIRING ===
    const adminNoticeSearch = document.getElementById("adminNoticeSearch");
    const adminShowInactiveNotices = document.getElementById("adminShowInactiveNotices");
    const adminNewNoticeBtn = document.getElementById("adminNewNoticeBtn");
    const adminNoticesList = document.getElementById("adminNoticesList");
    const adminNoticeModal = document.getElementById("adminNoticeModal");
    const adminNoticeTitle = document.getElementById("adminNoticeTitle");
    const adminNoticeTitleInput = document.getElementById("adminNoticeTitleInput");
    const adminNoticeSave = document.getElementById("adminNoticeSave");
    const adminNoticeCancel = document.getElementById("adminNoticeCancel");
    const noticeTargetAll = document.getElementById("noticeTargetAll");
    const noticeRoleChks = Array.from(document.querySelectorAll(".notice-role-chk"));
    const noticesPages = Array.from(document.querySelectorAll(".notices-page"));
    const noticesPageTabs = Array.from(document.querySelectorAll(".subtab[data-notices-page]"));

    let adminNoticesCache = [];
    let editingNotice = null;
    let quillEnglish = null;
    let quillSpanish = null;

    // Initialize Quill editors
    function initQuillEditors() {
      if (!window.Quill) {
        console.warn("Quill not loaded yet");
        return;
      }
      if (!quillEnglish && document.getElementById("quillEnglish")) {
        quillEnglish = new Quill('#quillEnglish', { theme: 'snow' });
      }
      if (!quillSpanish && document.getElementById("quillSpanish")) {
        quillSpanish = new Quill('#quillSpanish', { theme: 'snow' });
      }
    }

    // Initialize Quill after admin page load
    setTimeout(() => {
      if (document.getElementById("quillEnglish")) {
        initQuillEditors();
      }
    }, 500);

    function showNoticesPage(id){
      noticesPages.forEach(page => {
        page.style.display = page.id === `noticesPage${id[0].toUpperCase()}${id.slice(1)}` ? "block" : "none";
      });
      noticesPageTabs.forEach(tab => {
        tab.classList.toggle("is-active", tab.dataset.noticesPage === id);
      });
      if (id === "edit" && (!quillEnglish || !quillSpanish)) {
        initQuillEditors();
      }
    }

    noticesPageTabs.forEach(tab => {
      tab.addEventListener("click", () => {
        showNoticesPage(tab.dataset.noticesPage);
      });
    });

    adminNewNoticeBtn?.addEventListener("click", () => {
      if (!requirePermission("notices.create", "Permission required to create notices.")) return;
      clearNoticeEditor();
      showNoticesPage("edit");
    });

    adminNoticeSearch?.addEventListener("input", () => renderAdminNotices());
    adminShowInactiveNotices?.addEventListener("change", () => renderAdminNotices());

    adminNoticeSave?.addEventListener("click", async () => {
      if (!requirePermission("notices.edit", "Permission required to save notices.")) return;
      
      const title = adminNoticeTitleInput.value.trim();
      const body_en = quillEnglish ? quillEnglish.root.innerHTML.trim() : "";
      const body_es = quillSpanish ? quillSpanish.root.innerHTML.trim() : "";

      if (!title) return alert("Title required.");

      const targets = readNoticeTargetsFromUI();

      try {
        adminNoticeSave.disabled = true;

        const payload = {
          id: editingNotice?.id || null,
          title: title,
          body_en: body_en,
          body_es: body_es,
          target_all: targets.target_all,
          target_roles: targets.target_roles
        };

        await adminUpsertNotice(payload);

        await loadAdminNotices();
        showNoticesPage("view");
        alert("Notice saved.");
      } catch (e) {
        console.error(e);
        alert("Failed to save notice. Check console.");
      } finally {
        adminNoticeSave.disabled = false;
      }
    });

    adminNoticeCancel?.addEventListener("click", () => {
      showNoticesPage("view");
    });

    // Ack expansion toggle handler
    adminNoticesList?.addEventListener("click", async (e) => {
      const ackBtn = e.target.closest("[data-ack-toggle]");
      if (ackBtn) {
        e.preventDefault();

        const noticeId = ackBtn.dataset.ackToggle;
        const box = document.getElementById(`ack-list-${noticeId}`);
        if (!box) return;

        const isOpen = box.style.display === "block";
        box.style.display = isOpen ? "none" : "block";

        if (ackBtn && ackBtn.setAttribute) ackBtn.setAttribute('aria-expanded', String(!isOpen));

        if (isOpen) return;

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

            try {
              const countSpan = document.querySelector(`[data-ack-count="${noticeId}"]`);
              if (countSpan && Number(countSpan.textContent) !== rows.length) {
                console.debug('Mismatch detected: fixing ack count for', noticeId, 'to', rows.length);
                countSpan.textContent = String(rows.length);
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

      // Handle row action buttons
      const row = e.target.closest(".notice-row");
      if (!row) return;

      const act = e.target.closest("button")?.dataset.act;
      if (!act) return;

      const id = row.dataset.id;
      const notice = adminNoticesCache.find(n => String(n.id) === String(id));
      if (!notice) return;

      if (act === "edit") {
        if (!requirePermission("notices.edit", "Permission required to edit notices.")) return;
        openAdminNoticeEditor(notice);
      }

      if (act === "toggle") {
        if (!requirePermission("notices.toggle_active", "Permission required to toggle notice visibility.")) return;
        await toggleAdminNoticeActive(notice);
      }

      if (act === "delete") {
        if (!requirePermission("notices.delete", "Permission required to delete notices.")) return;
        await deleteAdminNotice(notice);
      }
    });

    function clearNoticeEditor(){
      editingNotice = null;

      if (adminNoticeTitleInput) adminNoticeTitleInput.value = "";
      if (quillEnglish) quillEnglish.setContents([]);
      if (quillSpanish) quillSpanish.setContents([]);

      if (noticeTargetAll) noticeTargetAll.checked = true;
      noticeRoleChks.forEach(chk => chk.checked = false);
    }

    async function adminFetchNoticeAcks(noticeId){
      const { data, error } = await supabaseClient
        .rpc("admin_get_notice_acks", { p_notice_id: noticeId });

      if (error) throw error;

      const res = Array.isArray(data) ? (data[0] || { acked: [], pending: [] }) : (data || { acked: [], pending: [] });
      return res.acked || [];
    }

    async function fetchNoticeAcksForAdmin(noticeId){
      return adminFetchNoticeAcks(noticeId);
    }

    function hydrateNoticeTargetsFromNotice(notice){
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

      if (roles.length > 0) targetAll = false;

      return { target_all: targetAll, target_roles: roles };
    }

    function openAdminNoticeEditor(notice){
      if (!currentUser?.is_admin && !hasPermission("notices.edit")) {
        alert("Permission required to edit notices.");
        return;
      }

      if (!notice){
        clearNoticeEditor();
        editingNotice = null;
        showNoticesPage("edit");
        return;
      }

      editingNotice = notice;

      if (adminNoticeTitleInput) adminNoticeTitleInput.value = notice.title || "";
      
      if (quillEnglish) quillEnglish.root.innerHTML = notice.body_en || "";
      if (quillSpanish) quillSpanish.root.innerHTML = notice.body_es || "";

      hydrateNoticeTargetsFromNotice(notice);

      showNoticesPage("edit");
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

            <!-- Acknowledged By (expandable) -->
            <div class="ack-summary" style="margin-top:8px;">
              <button type="button"
                      class="ghost"
                      data-ack-toggle="${n.id}"
                      style="padding:6px 10px; border-radius:999px; font-size:12px; background:transparent; border:none; cursor:pointer; color:#64748b;">
                Acknowledged:
                <span data-ack-count="${n.id}">${ackCount ?? "–"}</span>
                <span class="muted"> / </span>
                <span data-ack-total="${n.id}">${ackTotal ?? "–"}</span>
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

    async function loadAdminNotices(){
      if (!currentUser?.is_admin && !hasPermission("notices.view_admin")) return;

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

      // Fetch ack counts
      try {
        const ids = (adminNoticesCache || []).map(n => n.id).filter(Boolean);
        if (ids.length) {
          const counts = await adminFetchNoticeAckCounts(ids);
          const map = new Map((counts || []).map(r => [String(r.notice_id), { ack_count: Number(r.ack_count), ack_total: Number(r.ack_total) }]));
          adminNoticesCache.forEach(n => {
            const c = map.get(String(n.id));
            n.ack_count = c?.ack_count ?? 0;
            n.ack_total = c?.ack_total ?? 0;
          });
        }
      } catch (err) {
        console.error('Failed to fetch notice ack counts', err);
      }

      renderAdminNotices();
    }

    async function adminFetchNoticeAckCounts(noticeIds){
      if (!Array.isArray(noticeIds) || noticeIds.length === 0) return [];

      const { data, error } = await supabaseClient.rpc("admin_notice_ack_counts", {
        p_notice_ids: noticeIds
      });

      if (error) throw error;

      return data || [];
    }

    async function adminUpsertNotice(payload){
      const pin = getSessionPinOrThrow();

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
      return data;
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

    adminUsersReorderList?.addEventListener("dragstart", (e) => {
      const userRow = e.target.closest('.user-row[draggable="true"]');
      if (!userRow) return;
      draggedElement = userRow;
      draggedRoleId = userRow.dataset.roleId;
      userRow.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'move';
    });

    adminUsersReorderList?.addEventListener("dragend", () => {
      adminUsersReorderList.querySelectorAll('.user-row').forEach(row => row.classList.remove('dragging', 'drag-over'));
      draggedElement = null;
      draggedRoleId = null;
    });

    adminUsersReorderList?.addEventListener("dragover", (e) => {
      e.preventDefault();
      const userRow = e.target.closest('.user-row[draggable="true"]');
      if (!userRow || !draggedElement) return;
      if (userRow.dataset.roleId !== draggedRoleId) return;
      if (userRow === draggedElement) return;
      adminUsersReorderList.querySelectorAll('.user-row').forEach(row => row.classList.remove('drag-over'));
      userRow.classList.add('drag-over');
    });

    adminUsersReorderList?.addEventListener("drop", async (e) => {
      e.preventDefault();
      const targetRow = e.target.closest('.user-row[draggable="true"]');
      if (!targetRow || !draggedElement) return;
      if (targetRow.dataset.roleId !== draggedRoleId) return;
      if (targetRow === draggedElement) return;
      targetRow.classList.remove('drag-over');

      const allRows = Array.from(adminUsersReorderList.querySelectorAll(`.user-row[data-role-id="${draggedRoleId}"]`));
      const draggedIndex = allRows.indexOf(draggedElement);
      const targetIndex = allRows.indexOf(targetRow);
      if (draggedIndex < targetIndex) {
        targetRow.parentNode.insertBefore(draggedElement, targetRow.nextSibling);
      } else {
        targetRow.parentNode.insertBefore(draggedElement, targetRow);
      }
      await updateUserDisplayOrder(draggedRoleId);
    });

    // ===== SHIFT SWAPS =====
    const adminSwapSearch = document.getElementById("adminSwapSearch");
    const adminSwapStatusFilter = document.getElementById("adminSwapStatusFilter");
    const adminSwapsPendingList = document.getElementById("adminSwapsPendingList");
    const adminSwapHistorySearch = document.getElementById("adminSwapHistorySearch");
    const adminSwapMethodFilter = document.getElementById("adminSwapMethodFilter");
    const adminSwapsExecutedList = document.getElementById("adminSwapsExecutedList");

    let adminSwapsPendingCache = [];
    let adminSwapsExecutedCache = [];

    function showSwapsPage(id){
      swapsPages.forEach(page => {
        page.style.display = page.id === `swaps${id[0].toUpperCase()}${id.slice(1)}Page` ? "block" : "none";
      });
      swapsPageTabs.forEach(tab => {
        tab.classList.toggle("is-active", tab.dataset.swapsPage === id);
      });
    }

    swapsPageTabs.forEach(tab => {
      tab.addEventListener("click", () => {
        showSwapsPage(tab.dataset.swapsPage);
        if (tab.dataset.swapsPage === "pending") loadAdminSwapsPending();
        if (tab.dataset.swapsPage === "executed") loadAdminSwapsExecuted();
      });
    });

    async function loadAdminSwapsPending(){
      if (!requirePermission("rota.swap", "Permission required to view swaps.")) return;
      const pin = getSessionPinOrThrow();

      try {
        const { data, error } = await supabaseClient.rpc("admin_get_swap_requests", {
          p_admin_id: currentUser.id,
          p_pin: pin
        });

        if (error) throw error;

        adminSwapsPendingCache = (data || []).filter(s => s.status !== 'executed');
        renderAdminSwapsPending();
      } catch (err) {
        console.error(err);
        adminSwapsPendingList.innerHTML = `<div class="subtitle" style="padding:12px; color:#dc2626;">Error loading swaps.</div>`;
      }
    }

    async function loadAdminSwapsExecuted(){
      if (!requirePermission("rota.swap", "Permission required to view swaps.")) return;
      const pin = getSessionPinOrThrow();

      try {
        const { data, error } = await supabaseClient.rpc("admin_get_swap_executions", {
          p_admin_id: currentUser.id,
          p_pin: pin,
          p_period_id: null
        });

        if (error) throw error;

        adminSwapsExecutedCache = data || [];
        renderAdminSwapsExecuted();
      } catch (err) {
        console.error(err);
        adminSwapsExecutedList.innerHTML = `<div class="subtitle" style="padding:12px; color:#dc2626;">Error loading history.</div>`;
      }
    }

    function renderAdminSwapsPending(){
      if (!adminSwapsPendingList) return;

      const q = (adminSwapSearch?.value || "").trim().toLowerCase();
      const filter = adminSwapStatusFilter?.value || "";

      let rows = adminSwapsPendingCache.slice();
      if (filter) rows = rows.filter(s => s.status === filter);
      if (q) {
        rows = rows.filter(s =>
          (s.initiator_name || "").toLowerCase().includes(q) ||
          (s.counterparty_name || "").toLowerCase().includes(q)
        );
      }

      if (!rows.length){
        adminSwapsPendingList.innerHTML = `<div class="subtitle" style="padding:12px;">No pending swaps.</div>`;
        return;
      }

      adminSwapsPendingList.innerHTML = rows.map(s => {
        const statusLabel = {
          'pending': 'Pending counterparty response',
          'accepted_by_counterparty': 'Accepted (awaiting admin approval)',
          'declined_by_counterparty': 'Declined by counterparty'
        }[s.status] || s.status;

        const dateStr1 = new Date(s.initiator_shift_date).toLocaleDateString('en-GB', { weekday: 'short', month: 'short', day: 'numeric' });
        const dateStr2 = new Date(s.counterparty_shift_date).toLocaleDateString('en-GB', { weekday: 'short', month: 'short', day: 'numeric' });

        return `
          <div style="padding:12px; border-bottom:1px solid var(--line); display:flex; gap:12px; align-items:flex-start;">
            <div style="flex:1; min-width:0;">
              <div style="font-weight:600; margin-bottom:4px;">
                ${escapeHtml(s.initiator_name)} ${dateStr1} (${s.initiator_shift_code})
              </div>
              <div style="font-size:11px; color:var(--muted); margin-bottom:4px;">↔ ${escapeHtml(s.counterparty_name)} ${dateStr2} (${s.counterparty_shift_code})</div>
              <div style="font-size:12px; color:var(--muted);">${statusLabel}</div>
            </div>
            ${s.status === 'accepted_by_counterparty' ? `
              <div style="display:flex; gap:6px;">
                <button class="btn small primary" data-swap-approve="${s.id}" type="button">Approve</button>
                <button class="btn small" data-swap-decline="${s.id}" type="button">Decline</button>
              </div>
            ` : ''}
          </div>
        `;
      }).join("");
    }

    function renderAdminSwapsExecuted(){
      if (!adminSwapsExecutedList) return;

      const q = (adminSwapHistorySearch?.value || "").trim().toLowerCase();
      const filter = adminSwapMethodFilter?.value || "";

      let rows = adminSwapsExecutedCache.slice();
      if (filter) rows = rows.filter(s => s.method === filter);
      if (q) {
        rows = rows.filter(s =>
          (s.initiator_name || "").toLowerCase().includes(q) ||
          (s.counterparty_name || "").toLowerCase().includes(q)
        );
      }

      if (!rows.length){
        adminSwapsExecutedList.innerHTML = `<div class="subtitle" style="padding:12px;">No executed swaps.</div>`;
        return;
      }

      adminSwapsExecutedList.innerHTML = rows.map(s => {
        const methodLabel = s.method === 'admin_direct' ? 'Admin Direct' : 'Staff Approved';
        const dateStr1 = new Date(s.initiator_date).toLocaleDateString('en-GB', { weekday: 'short', month: 'short', day: 'numeric' });
        const dateStr2 = new Date(s.counterparty_date).toLocaleDateString('en-GB', { weekday: 'short', month: 'short', day: 'numeric' });
        const execStr = new Date(s.executed_at).toLocaleString('en-GB');

        return `
          <div style="padding:12px; border-bottom:1px solid var(--line);">
            <div style="font-weight:600; margin-bottom:4px;">
              ${escapeHtml(s.initiator_name)} ${dateStr1} (${s.initiator_old_shift} → ${s.initiator_new_shift})
            </div>
            <div style="font-size:11px; color:var(--muted); margin-bottom:4px;">
              ↔ ${escapeHtml(s.counterparty_name)} ${dateStr2} (${s.counterparty_old_shift} → ${s.counterparty_new_shift})
            </div>
            <div style="font-size:11px; color:var(--muted);">
              ${methodLabel} · Authorised by ${escapeHtml(s.authoriser_name)} · ${execStr}
            </div>
          </div>
        `;
      }).join("");
    }

    adminSwapSearch?.addEventListener("input", renderAdminSwapsPending);
    adminSwapStatusFilter?.addEventListener("change", renderAdminSwapsPending);
    adminSwapHistorySearch?.addEventListener("input", renderAdminSwapsExecuted);
    adminSwapMethodFilter?.addEventListener("change", renderAdminSwapsExecuted);

    adminSwapsPendingList?.addEventListener("click", async (e) => {
      const approveBtn = e.target.closest("button[data-swap-approve]");
      if (approveBtn) {
        const swapId = approveBtn.dataset.swapApprove;
        const swap = adminSwapsPendingCache.find(s => String(s.id) === String(swapId));
        if (!swap) return;

        try {
          approveBtn.disabled = true;
          const pin = getSessionPinOrThrow();
          const { data, error } = await supabaseClient.rpc("admin_approve_swap_request", {
            p_admin_id: currentUser.id,
            p_pin: pin,
            p_swap_request_id: swapId
          });

          if (error) throw error;
          if (!data[0]?.success) throw new Error(data[0]?.error_message || "Failed to approve swap");

          await loadAdminSwapsPending();
          await loadAdminSwapsExecuted();
          alert("Swap approved.");
        } catch (err) {
          console.error(err);
          alert("Failed to approve swap. Check console.");
        } finally {
          approveBtn.disabled = false;
        }
        return;
      }

      const declineBtn = e.target.closest("button[data-swap-decline]");
      if (declineBtn) {
        const swapId = declineBtn.dataset.swapDecline;
        if (!confirm("Decline this swap request?")) return;

        try {
          declineBtn.disabled = true;
          const pin = getSessionPinOrThrow();
          const { data, error } = await supabaseClient.rpc("admin_decline_swap_request", {
            p_admin_id: currentUser.id,
            p_pin: pin,
            p_swap_request_id: swapId
          });

          if (error) throw error;
          if (!data[0]?.success) throw new Error(data[0]?.error_message || "Failed to decline swap");

          await loadAdminSwapsPending();
          alert("Swap declined.");
        } catch (err) {
          console.error(err);
          alert("Failed to decline swap. Check console.");
        } finally {
          declineBtn.disabled = false;
        }
      }
    });
