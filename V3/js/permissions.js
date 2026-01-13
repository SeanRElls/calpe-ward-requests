/**
 * Permissions Module
 * Handles permission checking for all pages based on user's permission groups
 */

// Module-scoped variables (not polluting global scope)
(function() {
  let currentUser = null;
  const userPermissions = new Set();

/**
 * Load current user from localStorage and fetch their permissions
 * @returns {Promise<Object|null>} User object or null
 */
async function loadCurrentUserPermissions() {
  const STORAGE_KEY = "calpeward.current_user_id";
  const savedId = localStorage.getItem(STORAGE_KEY);
  
  if (!savedId) {
    console.warn("[PERMISSIONS] No user ID in localStorage");
    return null;
  }

  try {
    // Load user profile
    const { data: profile, error: profileError } = await supabaseClient
      .from("users")
      .select("id, name, role_id, is_admin, is_active")
      .eq("id", savedId)
      .single();

    if (profileError || !profile) {
      console.error("[PERMISSIONS] Failed to load user profile:", profileError);
      return null;
    }

    currentUser = profile;
    console.log("[PERMISSIONS] Loaded user:", profile.name);

    // If admin, skip permission loading (admins have all permissions)
    if (profile.is_admin) {
      console.log("[PERMISSIONS] User is admin - has all permissions");
      return profile;
    }

    // Load user's permission groups
    const { data: groups, error: groupsError } = await supabaseClient
      .from("user_permission_groups")
      .select("group_id")
      .eq("user_id", profile.id);

    if (groupsError) {
      console.warn("[PERMISSIONS] Failed to load permission groups:", groupsError);
      return profile;
    }

    // Load permissions for those groups
    if (groups && groups.length > 0) {
      const groupIds = groups.map(g => g.group_id);
      const { data: perms, error: permsError } = await supabaseClient
        .from("permission_group_permissions")
        .select("permission_key")
        .in("group_id", groupIds);

      if (permsError) {
        console.warn("[PERMISSIONS] Failed to load permissions:", permsError);
      } else {
        userPermissions.clear();
        (perms || []).forEach(p => userPermissions.add(p.permission_key));
        console.log("[PERMISSIONS] Loaded permissions:", Array.from(userPermissions));
      }
    }

    return profile;
  } catch (e) {
    console.error("[PERMISSIONS] Error loading user permissions:", e);
    return null;
  }
}

/**
 * Check if current user has a specific permission
 * @param {string} key - Permission key (e.g., "rota.view_draft")
 * @returns {boolean} True if user has permission
 */
function hasPermission(key) {
  if (!currentUser) return false;
  if (currentUser.is_admin) return true;
  return userPermissions.has(key);
}

/**
 * Require a permission or show alert
 * @param {string} key - Permission key
 * @param {string} msg - Optional custom message
 * @returns {boolean} True if user has permission
 */
function requirePermission(key, msg) {
  if (hasPermission(key)) return true;
  alert(msg || "You don't have permission to perform this action.");
  return false;
}

/**
 * Get current user object
 * @returns {Object|null} Current user or null
 */
function getCurrentUser() {
  return currentUser;
}

/**
 * Check if current user is admin
 * @returns {boolean} True if admin
 */
function isAdmin() {
  return currentUser?.is_admin === true;
}

  // Export for use in other scripts
  if (typeof window !== 'undefined') {
    window.PermissionsModule = {
      loadCurrentUserPermissions,
      hasPermission,
      requirePermission,
      getCurrentUser,
      isAdmin
    };
  }
})();
