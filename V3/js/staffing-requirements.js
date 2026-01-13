// Staffing Requirements Management

// Wait for supabaseClient to be available
let attempts = 0;
const waitForClient = setInterval(() => {
  if (window.supabaseClient) {
    clearInterval(waitForClient);
    initStaffingRequirements();
  }
  if (++attempts > 100) {
    clearInterval(waitForClient);
    console.error("[STAFFING] Supabase client never became available");
  }
}, 100);

function initStaffingRequirements() {
  const staffingPeriodSelect = document.getElementById("staffingPeriodSelect");
  const staffingRequirementsContainer = document.getElementById("staffingRequirementsContainer");

  if (!staffingPeriodSelect || !staffingRequirementsContainer) {
    console.error("[STAFFING] Elements not found");
    return;
  }

  console.log("[STAFFING] Initializing with supabaseClient available");

  let currentStaffingPeriod = null;
  let staffingRequirementsData = new Map(); // date -> requirements

  async function loadStaffingPeriods() {
    try {
      console.log("[STAFFING] Loading periods...");
      const { data: periods, error } = await window.supabaseClient
        .from("rota_periods")
        .select("id, name, start_date, end_date")
        .order("start_date", { ascending: false });

      if (error) throw error;

      staffingPeriodSelect.innerHTML = '';
      const emptyOption = document.createElement("option");
      emptyOption.value = '';
      emptyOption.textContent = 'Select a period...';
      staffingPeriodSelect.appendChild(emptyOption);

      (periods || []).forEach(p => {
        const option = document.createElement("option");
        option.value = p.id;
        const startDate = new Date(p.start_date).toLocaleDateString();
        const endDate = new Date(p.end_date).toLocaleDateString();
        option.textContent = `${p.name} (${startDate} - ${endDate})`;
        staffingPeriodSelect.appendChild(option);
      });
      
      console.log("[STAFFING] Loaded", periods?.length, "periods");
    } catch (e) {
      console.error("[STAFFING] Failed to load periods", e);
      staffingPeriodSelect.innerHTML = '<option>Error loading periods</option>';
    }
  }

  staffingPeriodSelect.addEventListener("change", async (e) => {
    currentStaffingPeriod = e.target.value;
    if (currentStaffingPeriod) {
      await loadStaffingRequirements(currentStaffingPeriod);
    } else {
      staffingRequirementsContainer.innerHTML = '';
    }
  });

  async function loadStaffingRequirements(periodId) {
    try {
      console.log("[STAFFING] Loading requirements for period", periodId);
      
      // Get period details
      const { data: period, error: pErr } = await window.supabaseClient
        .from("rota_periods")
        .select("start_date, end_date")
        .eq("id", periodId)
        .single();

      if (pErr) throw pErr;

      // Get all dates in period
      const dates = [];
      const start = new Date(period.start_date);
      const end = new Date(period.end_date);
      for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
        dates.push(d.toISOString().split('T')[0]);
      }

      // Load requirements
      const { data: reqs, error: rErr } = await window.supabaseClient
        .from("staffing_requirements")
        .select("*")
        .eq("period_id", periodId);

      if (rErr) console.warn("[STAFFING] Load warning:", rErr);
      
      staffingRequirementsData.clear();
      (reqs || []).forEach(r => staffingRequirementsData.set(r.date, r));

      console.log("[STAFFING] Loaded", reqs?.length, "requirement records");
      
      // Render table
      renderStaffingRequirementsTable(dates, periodId);
    } catch (e) {
      console.error("[STAFFING] Failed to load requirements", e);
      staffingRequirementsContainer.innerHTML = `<p style="color:red;">Error: ${e.message}</p>`;
    }
  }

  function renderStaffingRequirementsTable(dates, periodId) {
    let html = `<table style="width:100%; border-collapse:collapse; margin-bottom:16px;">
      <thead>
        <tr style="background:#f5f5f5; border-bottom:2px solid #ddd;">
          <th style="padding:8px; text-align:left; font-weight:600;">Date</th>
          <th style="padding:8px; text-align:center; font-weight:600;">Day SN/CN</th>
          <th style="padding:8px; text-align:center; font-weight:600;">Day NA</th>
          <th style="padding:8px; text-align:center; font-weight:600;">Night SN/CN</th>
          <th style="padding:8px; text-align:center; font-weight:600;">Night NA</th>
          <th style="padding:8px; text-align:center; font-weight:600;">Actions</th>
        </tr>
      </thead>
      <tbody>`;

    dates.forEach(date => {
      const req = staffingRequirementsData.get(date);
      const d = new Date(date);
      const dayName = d.toLocaleDateString('en-US', { weekday: 'short' });
      const dateFormatted = d.getDate() + ' ' + d.toLocaleDateString('en-US', { month: 'short' });

      html += `<tr style="border-bottom:1px solid #eee;">
        <td style="padding:8px;">${dayName} ${dateFormatted}</td>
        <td style="padding:8px; text-align:center;"><input type="number" step="0.5" min="0" value="${req?.day_sn_required || 3}" class="staffing-input" data-date="${date}" data-field="day_sn_required" style="width:60px; padding:4px; text-align:center; border:1px solid #ccc; border-radius:4px;" /></td>
        <td style="padding:8px; text-align:center;"><input type="number" step="0.5" min="0" value="${req?.day_na_required || 3}" class="staffing-input" data-date="${date}" data-field="day_na_required" style="width:60px; padding:4px; text-align:center; border:1px solid #ccc; border-radius:4px;" /></td>
        <td style="padding:8px; text-align:center;"><input type="number" step="0.5" min="0" value="${req?.night_sn_required || 2}" class="staffing-input" data-date="${date}" data-field="night_sn_required" style="width:60px; padding:4px; text-align:center; border:1px solid #ccc; border-radius:4px;" /></td>
        <td style="padding:8px; text-align:center;"><input type="number" step="0.5" min="0" value="${req?.night_na_required || 2}" class="staffing-input" data-date="${date}" data-field="night_na_required" style="width:60px; padding:4px; text-align:center; border:1px solid #ccc; border-radius:4px;" /></td>
        <td style="padding:8px; text-align:center;">
          <button class="save-staffing-btn" data-date="${date}" data-period-id="${periodId}" style="padding:4px 8px; background:#5b7cfa; color:white; border:none; border-radius:4px; cursor:pointer; font-size:12px;">Save</button>
        </td>
      </tr>`;
    });

    html += `</tbody></table>`;
    staffingRequirementsContainer.innerHTML = html;

    // Attach event listeners
    Array.from(staffingRequirementsContainer.querySelectorAll(".save-staffing-btn")).forEach(btn => {
      btn.addEventListener("click", async (e) => {
        const date = e.target.dataset.date;
        const periodId = e.target.dataset.periodId;
        const daySn = parseFloat(staffingRequirementsContainer.querySelector(`input[data-date="${date}"][data-field="day_sn_required"]`).value) || 3;
        const dayNa = parseFloat(staffingRequirementsContainer.querySelector(`input[data-date="${date}"][data-field="day_na_required"]`).value) || 3;
        const nightSn = parseFloat(staffingRequirementsContainer.querySelector(`input[data-date="${date}"][data-field="night_sn_required"]`).value) || 2;
        const nightNa = parseFloat(staffingRequirementsContainer.querySelector(`input[data-date="${date}"][data-field="night_na_required"]`).value) || 2;

        try {
          const req = staffingRequirementsData.get(date);
          if (req && req.id) {
            // Update
            const { error } = await window.supabaseClient
              .from("staffing_requirements")
              .update({ day_sn_required: daySn, day_na_required: dayNa, night_sn_required: nightSn, night_na_required: nightNa })
              .eq("id", req.id);
            if (error) throw error;
          } else {
            // Insert
            const { error } = await window.supabaseClient
              .from("staffing_requirements")
              .insert([{ period_id: periodId, date, day_sn_required: daySn, day_na_required: dayNa, night_sn_required: nightSn, night_na_required: nightNa }]);
            if (error) throw error;
          }
          alert("Staffing requirements saved!");
          await loadStaffingRequirements(periodId);
        } catch (err) {
          console.error("[STAFFING] Failed to save", err);
          alert("Error saving: " + err.message);
        }
      });
    });
  }

  // Load periods when staffing section is clicked
  document.addEventListener("click", async (e) => {
    if (e.target.matches(".nav a[data-panel='staffing-requirements']")) {
      console.log("[STAFFING] Staffing requirements section clicked");
      await loadStaffingPeriods();
    }
  });

  console.log("[STAFFING] Initialization complete");
}

