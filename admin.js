const GATEWAY_URL = "https://nia-gateway.davidkasimilu71.workers.dev";
const EDGE_KEY = "cf-worker-edge-managed";

const supabaseClient = window.supabase
  ? window.supabase.createClient(GATEWAY_URL, EDGE_KEY, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    })
  : null;

const ADMIN_EMAILS = [
  "davidkasimilu71@gmail.com",
  "nkepedavid@gmail.com"
];

// In-memory data
let allOpportunities = [];
let allApplications = [];
let allUsers = [];
let currentSubView = "opps"; 

function showStatusModal(isSuccess, title, message) {
  const modal = document.getElementById("statusModal");
  const modalIcon = document.getElementById("statusModalIcon");
  const modalTitle = document.getElementById("statusModalTitle");
  const modalMsg = document.getElementById("statusModalMessage");

  if (!modal) {
    alert(`${title}: ${message}`);
    return;
  }

  if (modalIcon) modalIcon.textContent = isSuccess ? "✅" : "⚠️";
  if (modalTitle) {
    modalTitle.textContent = title;
    modalTitle.style.color = isSuccess ? "#0f172a" : "#dc2626";
  }
  if (modalMsg) modalMsg.textContent = message;

  modal.classList.remove("hidden");
}

document.addEventListener("DOMContentLoaded", async () => {
  // Modal Dismiss Handlers
  const closeModalBtn = document.getElementById("closeStatusModalBtn");
  const statusModal = document.getElementById("statusModal");
  if (closeModalBtn && statusModal) {
    closeModalBtn.addEventListener("click", () => statusModal.classList.add("hidden"));
  }
  window.addEventListener("click", (e) => {
    if (e.target === statusModal) statusModal.classList.add("hidden");
    const editModal = document.getElementById("editOppModal");
    if (e.target === editModal) editModal.classList.add("hidden");
  });

  if (!supabaseClient) {
    alert("Supabase failed to initialize.");
    return;
  }

  // 1. Verify User and Admin Privileges
  const { data: { session }, error: sessionError } = await supabaseClient.auth.getSession();
  if (sessionError || !session) {
    window.location.href = "index.html";
    return;
  }

  const userEmail = session.user.email ? session.user.email.toLowerCase() : "";
  const isDirectAdmin = ADMIN_EMAILS.includes(userEmail);

  let isProfileAdmin = false;
  try {
    const { data: profile } = await supabaseClient
      .from("profiles")
      .select("role")
      .eq("id", session.user.id)
      .maybeSingle();
    isProfileAdmin = profile && profile.role === "admin";
  } catch (err) {
    console.error("Profile check error:", err);
  }

  if (!isDirectAdmin && !isProfileAdmin) {
    alert("Access Denied: Admin privileges required.");
    window.location.href = "dashboard.html";
    return;
  }

  // 2. Sign Out
  const logoutBtn = document.getElementById("logoutBtn");
  if (logoutBtn) {
    logoutBtn.addEventListener("click", async () => {
      await supabaseClient.auth.signOut();
      window.location.href = "index.html";
    });
  }

  // 3. Main Navigation Tabs (Publish vs Control Center)
  const tabPublish = document.getElementById("tabPublish");
  const tabControl = document.getElementById("tabControl");
  const publishSection = document.getElementById("publishSection");
  const controlSection = document.getElementById("controlSection");

  tabPublish.addEventListener("click", () => {
    tabPublish.classList.add("active");
    tabControl.classList.remove("active");
    publishSection.classList.remove("hidden");
    controlSection.classList.add("hidden");
  });

  tabControl.addEventListener("click", () => {
    tabControl.classList.add("active");
    tabPublish.classList.remove("active");
    controlSection.classList.remove("hidden");
    publishSection.classList.add("hidden");
    loadAdminData();
  });

  // 4. Sub-tabs (Opportunities vs Applications vs Users)
  const subTabOpps = document.getElementById("subTabOpps");
  const subTabApps = document.getElementById("subTabApps");
  const subTabUsers = document.getElementById("subTabUsers");
  const oppsView = document.getElementById("oppsControlView");
  const appsView = document.getElementById("appsControlView");
  const usersView = document.getElementById("usersControlView");

  function switchSubTab(targetView, activeBtn) {
    currentSubView = targetView;
    [subTabOpps, subTabApps, subTabUsers].forEach(btn => btn.classList.remove("active"));
    [oppsView, appsView, usersView].forEach(view => view.classList.add("hidden"));

    activeBtn.classList.add("active");
    if (targetView === "opps") oppsView.classList.remove("hidden");
    if (targetView === "apps") appsView.classList.remove("hidden");
    if (targetView === "users") usersView.classList.remove("hidden");

    applyFilterAndSort();
  }

  subTabOpps.addEventListener("click", () => switchSubTab("opps", subTabOpps));
  subTabApps.addEventListener("click", () => switchSubTab("apps", subTabApps));
  subTabUsers.addEventListener("click", () => switchSubTab("users", subTabUsers));

  // 5. Search & Sort Listeners
  const searchInput = document.getElementById("adminSearchInput");
  const sortSelect = document.getElementById("adminSortSelect");

  if (searchInput) searchInput.addEventListener("input", applyFilterAndSort);
  if (sortSelect) sortSelect.addEventListener("change", applyFilterAndSort);

  // 6. Form Submission (Publish Opportunity)
  const postJobForm = document.getElementById("postJobForm");
  const submitBtn = document.getElementById("submitBtn");

  if (postJobForm) {
    postJobForm.addEventListener("submit", async (e) => {
      e.preventDefault();

      const title = document.getElementById("jobTitle")?.value.trim();
      const company = document.getElementById("companyName")?.value.trim();
      const location = document.getElementById("jobLocation")?.value.trim();
      const type = document.getElementById("jobType")?.value || "Industrial Attachment";
      const description = document.getElementById("jobDesc")?.value.trim();

      if (!title || !company || !location || !description) {
        showStatusModal(false, "Incomplete Form", "Please fill in all fields.");
        return;
      }

      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = "Publishing...";
      }

      try {
        const { error } = await supabaseClient
          .from("opportunities")
          .insert([{ title, company, location, type, description }]);

        if (error) {
          showStatusModal(false, "Failed to Post", error.message);
          return;
        }

        showStatusModal(true, "Published!", `Opportunity "${title}" is now live.`);
        postJobForm.reset();
      } catch (err) {
        showStatusModal(false, "Error", err.message || "Failed to communicate with database.");
      } finally {
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.textContent = "Publish Opportunity";
        }
      }
    });
  }

  setupEditModal();
});

// Fetch all records across tables
async function loadAdminData() {
  const oppsTbody = document.getElementById("oppsTableBody");
  const appsTbody = document.getElementById("appsTableBody");
  const usersTbody = document.getElementById("usersTableBody");

  if (oppsTbody) oppsTbody.innerHTML = `<tr><td colspan="5" class="loading-text">Loading opportunities...</td></tr>`;
  if (appsTbody) appsTbody.innerHTML = `<tr><td colspan="6" class="loading-text">Loading applications...</td></tr>`;
  if (usersTbody) usersTbody.innerHTML = `<tr><td colspan="5" class="loading-text">Loading users...</td></tr>`;

  try {
    const [oppsRes, appsRes, usersRes] = await Promise.all([
      supabaseClient.from("opportunities").select("*").order("created_at", { ascending: false }),
      supabaseClient.from("applications").select("*").order("created_at", { ascending: false }),
      supabaseClient.from("profiles").select("*")
    ]);

    allOpportunities = oppsRes.data || [];
    allUsers = usersRes.data || [];

    const oppMap = new Map(allOpportunities.map(o => [o.id, o]));
    allApplications = (appsRes.data || []).map(app => ({
      ...app,
      oppTitle: oppMap.get(app.opportunity_id)?.title || "Archived Role",
      oppCompany: oppMap.get(app.opportunity_id)?.company || "N/A"
    }));

    applyFilterAndSort();
  } catch (err) {
    console.error("Data load failed:", err);
  }
}

// Search and Sorting 
function applyFilterAndSort() {
  const query = (document.getElementById("adminSearchInput")?.value || "").toLowerCase().trim();
  const sortMode = document.getElementById("adminSortSelect")?.value || "newest";

  if (currentSubView === "opps") {
    let filtered = allOpportunities.filter(o => 
      (o.title && o.title.toLowerCase().includes(query)) ||
      (o.company && o.company.toLowerCase().includes(query)) ||
      (o.location && o.location.toLowerCase().includes(query)) ||
      (o.type && o.type.toLowerCase().includes(query))
    );

    filtered.sort((a, b) => {
      if (sortMode === "newest") return new Date(b.created_at || 0) - new Date(a.created_at || 0);
      if (sortMode === "oldest") return new Date(a.created_at || 0) - new Date(b.created_at || 0);
      if (sortMode === "az") return (a.title || "").localeCompare(b.title || "");
      return 0;
    });

    renderOpportunitiesTable(filtered);
  } else if (currentSubView === "apps") {
    let filtered = allApplications.filter(a =>
      (a.user_email && a.user_email.toLowerCase().includes(query)) ||
      (a.oppTitle && a.oppTitle.toLowerCase().includes(query)) ||
      (a.oppCompany && a.oppCompany.toLowerCase().includes(query))
    );

    filtered.sort((a, b) => {
      if (sortMode === "newest") return new Date(b.created_at || 0) - new Date(a.created_at || 0);
      if (sortMode === "oldest") return new Date(a.created_at || 0) - new Date(b.created_at || 0);
      if (sortMode === "az") return (a.user_email || "").localeCompare(b.user_email || "");
      return 0;
    });

    renderApplicationsTable(filtered);
  } else {
    let filtered = allUsers.filter(u => 
      (u.email && u.email.toLowerCase().includes(query)) ||
      (u.role && u.role.toLowerCase().includes(query)) ||
      (u.status && u.status.toLowerCase().includes(query))
    );

    filtered.sort((a, b) => {
      if (sortMode === "newest") return new Date(b.created_at || 0) - new Date(a.created_at || 0);
      if (sortMode === "oldest") return new Date(a.created_at || 0) - new Date(b.created_at || 0);
      if (sortMode === "az") return (a.email || "").localeCompare(b.email || "");
      return 0;
    });

    renderUsersTable(filtered);
  }
}

// 1. Opportunities Table View
function renderOpportunitiesTable(list) {
  const tbody = document.getElementById("oppsTableBody");
  if (!tbody) return;

  if (list.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5" class="loading-text">No opportunities found matching your criteria.</td></tr>`;
    return;
  }

  tbody.innerHTML = list.map(opp => `
    <tr>
      <td><strong>${opp.title}</strong></td>
      <td>${opp.company}</td>
      <td>${opp.type}</td>
      <td>${opp.location}</td>
      <td>
        <div class="table-actions">
          <button class="action-btn edit-btn" title="Edit" onclick="openEditModal('${opp.id}')">
            <i class="fa-solid fa-pen"></i>
          </button>
          <button class="action-btn delete-btn" title="Delete" onclick="deleteOpportunity('${opp.id}', '${opp.title.replace(/'/g, "\\'")}')">
            <i class="fa-solid fa-trash"></i>
          </button>
        </div>
      </td>
    </tr>
  `).join("");
}

// 2. Applications Table View
function renderApplicationsTable(list) {
  const tbody = document.getElementById("appsTableBody");
  if (!tbody) return;

  if (list.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" class="loading-text">No applications found.</td></tr>`;
    return;
  }

  tbody.innerHTML = list.map(app => {
    const dateFormatted = app.created_at ? new Date(app.created_at).toLocaleDateString() : "Recently";
    const resumeCell = app.resume_url
      ? `<a href="${app.resume_url}" target="_blank" rel="noopener noreferrer" class="btn btn-outline" style="padding: 0.25rem 0.6rem; font-size: 0.78rem; text-decoration: none; display: inline-flex; align-items: center; gap: 0.35rem;">
          <i class="fa-solid fa-file-pdf" style="color: #dc2626;"></i> View CV
        </a>`
      : `<span style="font-size: 0.78rem; color: #94a3b8; font-style: italic;">Not attached</span>`;

    const appIdentifier = app.id || app.opportunity_id;

    return `
      <tr>
        <td><strong>${app.user_email || "N/A"}</strong></td>
        <td>${app.oppTitle}</td>
        <td>${app.oppCompany}</td>
        <td>${resumeCell}</td>
        <td>${dateFormatted}</td>
        <td>
          <div class="table-actions">
            <button class="action-btn delete-btn" title="Remove Application Record" onclick="deleteApplication('${appIdentifier}')">
              <i class="fa-solid fa-trash"></i>
            </button>
          </div>
        </td>
      </tr>
    `;
  }).join("");
}

// 3. Users Table View
function renderUsersTable(list) {
  const tbody = document.getElementById("usersTableBody");
  if (!tbody) return;

  if (list.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5" class="loading-text">No users found matching your criteria.</td></tr>`;
    return;
  }

  tbody.innerHTML = list.map(user => {
    const isBanned = user.status === "banned";
    const dateFormatted = user.created_at ? new Date(user.created_at).toLocaleDateString() : "N/A";

    return `
      <tr>
        <td><strong>${user.email || "No email"}</strong></td>
        <td>${user.role || "student"}</td>
        <td>
          <span class="status-chip ${isBanned ? 'banned' : 'active'}">
            ${isBanned ? "Banned" : "Active"}
          </span>
        </td>
        <td>${dateFormatted}</td>
        <td>
          <div class="table-actions">
            <button class="action-btn ${isBanned ? 'unban-btn' : 'ban-btn'}" 
              title="${isBanned ? 'Unban User' : 'Ban User'}" 
              onclick="toggleBanUser('${user.id}', ${!isBanned})">
              <i class="fa-solid ${isBanned ? 'fa-check' : 'fa-ban'}"></i>
            </button>
            <button class="action-btn delete-btn" title="Delete User Record" onclick="deleteUser('${user.id}')">
              <i class="fa-solid fa-trash"></i>
            </button>
          </div>
        </td>
      </tr>
    `;
  }).join("");
}

// Delete Opportunity
window.deleteOpportunity = async function(id, title) {
  if (!confirm(`Are you sure you want to delete the opportunity "${title}"?`)) return;

  const { error } = await supabaseClient.from("opportunities").delete().eq("id", id);
  if (error) {
    showStatusModal(false, "Delete Failed", error.message);
    return;
  }

  allOpportunities = allOpportunities.filter(o => o.id !== id);
  applyFilterAndSort();
  showStatusModal(true, "Deleted", `"${title}" has been removed.`);
};

// Delete Application 
window.deleteApplication = async function(appIdentifier) {
  if (!confirm("Are you sure you want to remove this application record?")) return;

  let query = supabaseClient.from("applications").delete();

  if (appIdentifier.includes("-")) {
    query = query.eq("id", appIdentifier);
  } else {
    query = query.eq("opportunity_id", appIdentifier);
  }

  const { error } = await query;

  if (error) {
    showStatusModal(false, "Delete Failed", error.message);
    return;
  }

  allApplications = allApplications.filter(a => a.id !== appIdentifier && a.opportunity_id !== appIdentifier);
  applyFilterAndSort();
  showStatusModal(true, "Removed", "Application record has been cleared.");
};

// User Ban/Unban Toggle
window.toggleBanUser = async function(userId, setBanned) {
  const actionText = setBanned ? "ban" : "unban";
  if (!confirm(`Are you sure you want to ${actionText} this user?`)) return;

  const newStatus = setBanned ? "banned" : "active";
  const { error } = await supabaseClient
    .from("profiles")
    .update({ status: newStatus })
    .eq("id", userId);

  if (error) {
    showStatusModal(false, "Action Failed", error.message);
    return;
  }

  const target = allUsers.find(u => u.id === userId);
  if (target) target.status = newStatus;
  applyFilterAndSort();
  showStatusModal(true, "Updated", `User status changed to ${newStatus}.`);
};

// User Profile & Auth Deletion 
window.deleteUser = async function(userId) {
  if (!confirm("Are you sure you want to permanently delete this user and their account? This cannot be undone.")) return;

  try {
    const { error } = await supabaseClient.rpc("delete_user_by_admin", {
      target_user_id: userId
    });

    if (error) {
      showStatusModal(false, "Delete Failed", error.message);
      return;
    }

    allUsers = allUsers.filter(u => u.id !== userId);
    allApplications = allApplications.filter(a => a.user_id !== userId);
    applyFilterAndSort();

    showStatusModal(true, "User Removed", "User account and all associated data have been permanently deleted.");
  } catch (err) {
    showStatusModal(false, "Error", err.message || "Failed to communicate with database.");
  }
};

// Edit Opportunity
function setupEditModal() {
  const modal = document.getElementById("editOppModal");
  const closeBtn = document.getElementById("closeEditModal");
  const cancelBtn = document.getElementById("cancelEditBtn");
  const form = document.getElementById("editOppForm");

  const hide = () => modal.classList.add("hidden");
  if (closeBtn) closeBtn.addEventListener("click", hide);
  if (cancelBtn) cancelBtn.addEventListener("click", hide);

  if (form) {
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const id = document.getElementById("editOppId").value;
      const title = document.getElementById("editJobTitle").value.trim();
      const company = document.getElementById("editCompanyName").value.trim();
      const location = document.getElementById("editJobLocation").value.trim();
      const type = document.getElementById("editJobType").value;
      const description = document.getElementById("editJobDesc").value.trim();

      const { error } = await supabaseClient
        .from("opportunities")
        .update({ title, company, location, type, description })
        .eq("id", id);

      if (error) {
        showStatusModal(false, "Update Failed", error.message);
        return;
      }

      const opp = allOpportunities.find(o => o.id === id);
      if (opp) {
        opp.title = title;
        opp.company = company;
        opp.location = location;
        opp.type = type;
        opp.description = description;
      }

      hide();
      applyFilterAndSort();
      showStatusModal(true, "Updated", `Opportunity "${title}" updated successfully.`);
    });
  }
}

window.openEditModal = function(id) {
  const opp = allOpportunities.find(o => o.id === id);
  if (!opp) return;

  document.getElementById("editOppId").value = opp.id;
  document.getElementById("editJobTitle").value = opp.title || "";
  document.getElementById("editCompanyName").value = opp.company || "";
  document.getElementById("editJobLocation").value = opp.location || "";
  document.getElementById("editJobType").value = opp.type || "Industrial Attachment";
  document.getElementById("editJobDesc").value = opp.description || "";

  document.getElementById("editOppModal").classList.remove("hidden");
};
