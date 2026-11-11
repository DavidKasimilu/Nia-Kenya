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

let cachedOpportunities = [];
let userAppliedIds = new Set();
let pendingOpportunityId = null;
let currentUserProfile = null;

document.addEventListener("DOMContentLoaded", async () => {
  if (!supabaseClient) {
    console.error("Supabase client failed to initialize.");
    return;
  }

  // Auth Check & Ban verification
  const { data: { session }, error: sessionError } = await supabaseClient.auth.getSession();

  if (sessionError || !session) {
    window.location.href = "index.html";
    return;
  }

  const { data: profile } = await supabaseClient
    .from("profiles")
    .select("status, role, resume_url")
    .eq("id", session.user.id)
    .maybeSingle();

  if (profile && profile.status === "banned") {
    await supabaseClient.auth.signOut();
    alert("Access Denied: Your account has been suspended by an administrator.");
    window.location.href = "index.html";
    return;
  }

  currentUserProfile = profile;
  const user = session.user;
  const userEmail = user.email ? user.email.toLowerCase() : "";
  const isAdmin = ADMIN_EMAILS.includes(userEmail) || profile?.role === "admin";

  // Reveal Admin Portal Button if Admin
  const adminPortalLink = document.getElementById("adminPortalLink");
  if (adminPortalLink && isAdmin) {
    adminPortalLink.classList.remove("hidden");
  }

  // First-Time User Welcome Modal Check
  checkFirstTimeWelcome(user);

  // Logout 
  const logoutBtn = document.getElementById("logoutBtn");
  if (logoutBtn) {
    logoutBtn.addEventListener("click", async () => {
      await supabaseClient.auth.signOut();
      window.location.href = "index.html";
    });
  }

  // CV Modal & Admin Modal Handlers
  setupCvModal();
  setupAdminNoticeModal();

  // Setup Filters
  const searchInput = document.getElementById("searchInput");
  const locationInput = document.getElementById("locationFilterInput");
  const typeSelect = document.getElementById("typeFilterSelect");

  if (searchInput) searchInput.addEventListener("input", filterAndRenderFeed);
  if (locationInput) locationInput.addEventListener("input", filterAndRenderFeed);
  if (typeSelect) typeSelect.addEventListener("change", filterAndRenderFeed);

  // Initial Load of Opportunities & Applications
  await loadOpportunities(user);
});

// Admin Notice Modal Handler
function setupAdminNoticeModal() {
  const adminModal = document.getElementById("adminNoticeModal");
  const closeAdminBtn = document.getElementById("closeAdminNoticeBtn");
  const dismissAdminBtn = document.getElementById("dismissAdminNoticeBtn");

  const hideAdminModal = () => {
    if (adminModal) adminModal.classList.add("hidden");
  };

  if (closeAdminBtn) closeAdminBtn.addEventListener("click", hideAdminModal);
  if (dismissAdminBtn) dismissAdminBtn.addEventListener("click", hideAdminModal);

  if (adminModal) {
    adminModal.addEventListener("click", (e) => {
      if (e.target === adminModal) hideAdminModal();
    });
  }
}

function showAdminNotice() {
  const adminModal = document.getElementById("adminNoticeModal");
  if (adminModal) {
    adminModal.classList.remove("hidden");
  } else {
    alert("Administrators are restricted from applying for opportunities.");
  }
}

// CV Advice Modal Setup
function setupCvModal() {
  const cvModal = document.getElementById("cvAdviceModal");
  const closeCvAdviceBtn = document.getElementById("closeCvAdviceBtn");
  const proceedWithoutCvBtn = document.getElementById("proceedWithoutCvBtn");

  if (closeCvAdviceBtn && cvModal) {
    closeCvAdviceBtn.addEventListener("click", () => {
      cvModal.classList.add("hidden");
      pendingOpportunityId = null;
    });
  }

  if (proceedWithoutCvBtn && cvModal) {
    proceedWithoutCvBtn.addEventListener("click", async () => {
      cvModal.classList.add("hidden");
      if (pendingOpportunityId) {
        await executeApplication(pendingOpportunityId, null);
        pendingOpportunityId = null;
      }
    });
  }

  window.addEventListener("click", (e) => {
    if (e.target === cvModal) {
      cvModal.classList.add("hidden");
      pendingOpportunityId = null;
    }
  });
}

// Welcome Modal Handler
function checkFirstTimeWelcome(user) {
  const welcomeKey = `nia_welcomed_${user.id}`;
  const alreadyWelcomed = localStorage.getItem(welcomeKey);

  if (!alreadyWelcomed) {
    const welcomeModal = document.getElementById("welcomeModal");
    const welcomeHeading = document.getElementById("welcomeHeading");
    const closeBtn = document.getElementById("closeWelcomeModal");
    const dismissBtn = document.getElementById("dismissWelcomeBtn");

    let firstName = "";
    if (user.user_metadata?.first_name) {
      firstName = user.user_metadata.first_name;
    } else if (user.user_metadata?.full_name) {
      firstName = user.user_metadata.full_name.split(" ")[0];
    } else if (user.email) {
      const prefix = user.email.split("@")[0].replace(/[^a-zA-Z]/g, " ").trim();
      firstName = prefix.split(" ")[0] || "User";
      firstName = firstName.charAt(0).toUpperCase() + firstName.slice(1);
    }

    if (welcomeHeading) {
      welcomeHeading.textContent = `Welcome, ${firstName}!`;
    }

    if (welcomeModal) {
      welcomeModal.classList.remove("hidden");

      const hideModal = () => {
        welcomeModal.classList.add("hidden");
        localStorage.setItem(welcomeKey, "true");
      };

      if (closeBtn) closeBtn.addEventListener("click", hideModal);
      if (dismissBtn) dismissBtn.addEventListener("click", hideModal);

      welcomeModal.addEventListener("click", (e) => {
        if (e.target === welcomeModal) hideModal();
      });
    }
  }
}

// Fetch all listings and applications
async function loadOpportunities(user) {
  const container = document.getElementById("opportunitiesList");
  if (!container || !supabaseClient) return;

  const [oppsRes, appsRes] = await Promise.all([
    supabaseClient.from("opportunities").select("*").order("created_at", { ascending: false }),
    supabaseClient.from("applications").select("opportunity_id").eq("user_id", user.id)
  ]);

  if (oppsRes.error) {
    container.innerHTML = `<p class="message error">Could not load opportunities: ${oppsRes.error.message}</p>`;
    return;
  }

  cachedOpportunities = oppsRes.data || [];
  userAppliedIds = new Set((appsRes.data || []).map((app) => app.opportunity_id));

  filterAndRenderFeed();
}

// Filtering Logic
function filterAndRenderFeed() {
  const container = document.getElementById("opportunitiesList");
  if (!container) return;

  const keyword = (document.getElementById("searchInput")?.value || "").toLowerCase().trim();
  const location = (document.getElementById("locationFilterInput")?.value || "").toLowerCase().trim();
  const selectedType = document.getElementById("typeFilterSelect")?.value || "";

  const filtered = cachedOpportunities.filter((opp) => {
    const matchesKeyword =
      !keyword ||
      (opp.title && opp.title.toLowerCase().includes(keyword)) ||
      (opp.company && opp.company.toLowerCase().includes(keyword)) ||
      (opp.description && opp.description.toLowerCase().includes(keyword));

    const matchesLocation =
      !location ||
      (opp.location && opp.location.toLowerCase().includes(location));

    const matchesType =
      !selectedType ||
      (opp.type && opp.type.toLowerCase() === selectedType.toLowerCase());

    return matchesKeyword && matchesLocation && matchesType;
  });

  if (filtered.length === 0) {
    container.innerHTML = `<p class="loading-text">No opportunities found matching your search criteria.</p>`;
    return;
  }

  container.innerHTML = filtered.map((opp) => {
    const hasApplied = userAppliedIds.has(opp.id);
    return `
      <div class="card" id="card-${opp.id}">
        <div class="card-body">
          <h3>${opp.title}</h3>
          <div class="card-meta">
            <span><strong>${opp.company}</strong></span>
            <span>•</span>
            <span>${opp.location}</span>
            <span>•</span>
            <span>${opp.type}</span>
          </div>
          <p class="card-desc">${opp.description}</p>
        </div>
        <div class="card-action">
          ${
            hasApplied
              ? `<button class="btn btn-applied" disabled>Applied</button>`
              : `<button class="btn btn-primary" onclick="applyOpportunity('${opp.id}')">Apply</button>`
          }
        </div>
      </div>
    `;
  }).join("");
}

// Check Profile Role & CV before Application
window.applyOpportunity = async function (opportunityId) {
  if (!supabaseClient) return;

  const { data: { user } } = await supabaseClient.auth.getUser();
  if (!user) {
    window.location.href = "index.html";
    return;
  }

  const userEmail = user.email ? user.email.toLowerCase() : "";

  // Fetch or use cached profile to verify role
  if (!currentUserProfile) {
    const { data: profile } = await supabaseClient
      .from("profiles")
      .select("status, role, resume_url")
      .eq("id", user.id)
      .maybeSingle();
    currentUserProfile = profile;
  }

  const isAdmin = ADMIN_EMAILS.includes(userEmail) || currentUserProfile?.role === "admin";

  // Prevent Admins from applying
  if (isAdmin) {
    showAdminNotice();
    return;
  }

  // If no CV uploaded, open advisory modal
  if (!currentUserProfile?.resume_url) {
    pendingOpportunityId = opportunityId;
    const cvModal = document.getElementById("cvAdviceModal");
    if (cvModal) {
      cvModal.classList.remove("hidden");
      return;
    }
  }

  // If non-admin and CV check passes, execute application
  await executeApplication(opportunityId, currentUserProfile?.resume_url || null);
};

// Database Insertion
async function executeApplication(opportunityId, resumeUrl) {
  const { data: { user } } = await supabaseClient.auth.getUser();
  if (!user) return;

  const { error } = await supabaseClient.from("applications").insert([
    {
      opportunity_id: opportunityId,
      user_id: user.id,
      user_email: user.email,
      resume_url: resumeUrl
    },
  ]);

  const statusMsg = document.getElementById("statusMessage");

  if (error) {
    if (statusMsg) {
      statusMsg.className = "message error";
      statusMsg.textContent = "Application failed: " + error.message;
      statusMsg.classList.remove("hidden");
    }
    return;
  }

  userAppliedIds.add(opportunityId);

  if (statusMsg) {
    statusMsg.className = "message success";
    statusMsg.textContent = "Application submitted successfully!";
    statusMsg.classList.remove("hidden");
  }

  const cardAction = document.querySelector(`#card-${opportunityId} .card-action`);
  if (cardAction) {
    cardAction.innerHTML = `<button class="btn btn-applied" disabled>Applied</button>`;
  }
}