const SUPABASE_URL = "https://tbclufdtyefexwwitfsz.supabase.co";
    const SUPABASE_ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRiY2x1ZmR0eWVmZXh3d2l0ZnN6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjcwODA4ODksImV4cCI6MjA4MjY1Njg4OX0.OYnj44QQCTD-5tqR2XSVt4oQso9Ol8ZLH2tLsRGIreA";
    const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON);
    const STORAGE_KEY = "calpeward.loggedInUserId";

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

    function getSessionPinOrThrow(){
      if (!currentUser) throw new Error("Not logged in.");
      const pin = sessionStorage.getItem(pinKey(currentUser.id));
      if (!pin) throw new Error("Missing session PIN. Log in again.");
      return pin;
    }

    async function loadCurrentUser(){
      const savedId = localStorage.getItem(STORAGE_KEY);
      if (!savedId){
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
      adminUsersList.textContent = "Loading usersâ€¦";

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
      adminEditUserSelect.innerHTML = `<option value="">Select userâ€¦</option>${options.join("")}`;
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
              <div class="drag-handle" title="Drag to reorder">â‰¡</div>
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
        let data = null;
        try {
          const res = await fetch(new URL("js/permissions.json", window.location.href));
          if (res.ok) data = await res.json();
        } catch (fetchErr) {
          data = null;
        }
        permissionsCatalogue = data || embeddedPermissionsCatalogue;
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
              <span class="perm-chevron">âŒ„</span>
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

    adminCreateUserBtn?.addEventListener("click", createUser);
    adminAddUserCancelBtn?.addEventListener("click", clearUserAddForm);

    adminUserSearch?.addEventListener("input", renderAdminUsers);
    adminShowInactiveUsers?.addEventListener("change", renderAdminUsers);
    adminAddUserBtn?.addEventListener("click", openAddUserSection);
    adminCancelUserEditBtn?.addEventListener("click", clearUserEditor);
    adminSaveUserBtn?.addEventListener("click", saveUser);

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

    window.addEventListener("load", () => {
      ensureCurrentUser();
    });

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
