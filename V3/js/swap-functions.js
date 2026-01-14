// Swap Functions Module
// Provides RPC wrappers for shift swap operations (admin direct + staff proposed)
// Used by both index.html and rota.html

// These functions assume window.currentUser and window.supabaseClient are available

async function adminExecuteShiftSwap(counterpartyUserId, counterpartyDate){
  if (!window.currentUser?.is_admin) throw new Error("Admin only");
  if (!window.activeCell) throw new Error("No active cell");

  const pin = typeof getSessionPinOrThrow === "function" ? getSessionPinOrThrow() : null;
  const periodId = window.currentPeriod?.id;
  if (!periodId) throw new Error("No active period");

  console.log("[SWAP] Calling admin_execute_shift_swap with:", {
    admin_id: window.currentUser.id,
    period_id: periodId,
    initiator_user_id: window.activeCell.userId,
    initiator_date: window.activeCell.date,
    counterparty_user_id: counterpartyUserId,
    counterparty_date: counterpartyDate
  });

  const { data, error } = await window.supabaseClient.rpc("admin_execute_shift_swap", {
    p_admin_id: window.currentUser.id,
    p_pin: pin,
    p_initiator_user_id: window.activeCell.userId,
    p_initiator_shift_date: window.activeCell.date,
    p_counterparty_user_id: counterpartyUserId,
    p_counterparty_shift_date: counterpartyDate
  });

  console.log("[SWAP] RPC response:", { data, error });
  console.log("[SWAP] Response data detail:", JSON.stringify(data, null, 2));

  if (error) throw error;
  if (!data[0]?.success) throw new Error(data[0]?.error_message || "Swap failed");

  console.log("[SWAP] Swap succeeded, execution ID:", data[0].swap_execution_id);
  return data[0];
}

async function staffRequestShiftSwap(counterpartyUserId, counterpartyDate){
  if (!window.currentUser || window.currentUser.is_admin) throw new Error("Staff only");
  if (!window.activeCell) throw new Error("No active cell");

  const periodId = window.currentPeriod?.id;
  if (!periodId) throw new Error("No active period");

  console.log("[SWAP DEBUG] ========== STAFF SWAP REQUEST DEBUG ==========");
  console.log("[SWAP DEBUG] Current user object:", window.currentUser);
  console.log("[SWAP DEBUG] User ID being sent:", window.currentUser.id);
  console.log("[SWAP DEBUG] User ID type:", typeof window.currentUser.id);
  console.log("[SWAP DEBUG] Active cell:", window.activeCell);
  console.log("[SWAP DEBUG] Initiator shift date:", window.activeCell.date);
  console.log("[SWAP DEBUG] Counterparty user ID:", counterpartyUserId);
  console.log("[SWAP DEBUG] Counterparty shift date:", counterpartyDate);
  console.log("[SWAP DEBUG] ================================================");

  const { data, error } = await window.supabaseClient.rpc("staff_request_shift_swap", {
    p_user_id: window.currentUser.id,
    p_initiator_shift_date: window.activeCell.date,
    p_counterparty_user_id: counterpartyUserId,
    p_counterparty_shift_date: counterpartyDate
  });

  console.log("[SWAP DEBUG] ========== RPC RESPONSE ==========");
  console.log("[SWAP DEBUG] Data:", data);
  console.log("[SWAP DEBUG] Error:", error);
  if (data && data.length > 0) {
    console.log("[SWAP DEBUG] Response success:", data[0].success);
    console.log("[SWAP DEBUG] Response error_message:", data[0].error_message);
    console.log("[SWAP DEBUG] Response swap_request_id:", data[0].swap_request_id);
  }
  console.log("[SWAP DEBUG] ================================================");

  if (error) {
    console.error("[SWAP ERROR] RPC error object:", error);
    console.error("[SWAP ERROR] Error code:", error.code);
    console.error("[SWAP ERROR] Error message:", error.message);
    console.error("[SWAP ERROR] Error details:", error.details);
    throw error;
  }
  if (!data[0]?.success) {
    console.error("[SWAP ERROR] Function returned failure:", data[0]?.error_message);
    throw new Error(data[0]?.error_message || "Request failed");
  }

  console.log("[SWAP SUCCESS] Request succeeded, swap_request_id:", data[0].swap_request_id);
  return data[0];
}

async function staffRespondToSwapRequest(swapRequestId, response){
  if (!window.currentUser || window.currentUser.is_admin) throw new Error("Staff only");
  if (!['accepted', 'declined', 'ignored'].includes(response)) throw new Error("Invalid response");

  const { data, error } = await window.supabaseClient.rpc("staff_respond_to_swap_request", {
    p_user_id: window.currentUser.id,
    p_swap_request_id: swapRequestId,
    p_response: response
  });

  if (error) throw error;
  if (!data[0]?.success) throw new Error(data[0]?.error_message || "Response failed");

  return data[0];
}

// Expose to window
window.adminExecuteShiftSwap = adminExecuteShiftSwap;
window.staffRequestShiftSwap = staffRequestShiftSwap;
window.staffRespondToSwapRequest = staffRespondToSwapRequest;

console.log("[SWAP-FUNCTIONS] Swap functions loaded and exposed to window");
