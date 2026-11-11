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

let currentUser = null;
let currentProfileData = null;

function showMessage(text, isError = false) {
  const msgElem = document.getElementById("statusMessage");
  if (!msgElem) return;
  msgElem.textContent = text;
  msgElem.className = `message ${isError ? "error" : "success"}`;
  msgElem.classList.remove("hidden");
  window.scrollTo({ top: 0, behavior: "smooth" });
}

document.addEventListener("DOMContentLoaded", async () => {
  if (!supabaseClient) {
    console.error("Supabase failed to initialize.");
    return;
  }

  // Session & Auth Check
  const { data: { session }, error } = await supabaseClient.auth.getSession();
  if (error || !session) {
    window.location.href = "index.html";
    return;
  }

  currentUser = session.user;

  // Setup Top-Right Sign Out
  const logoutBtn = document.getElementById("logoutBtn");
  if (logoutBtn) {
    logoutBtn.addEventListener("click", async () => {
      await supabaseClient.auth.signOut();
      window.location.href = "index.html";
    });
  }

  // Tab Switching
  setupTabs();

  // CV Delete Modal Setup
  setupDeleteCvModal();

  // Load Data
  await loadUserProfile();
  await loadAppliedOpportunities();

  // Form Submit Handler
  setupProfileForm();
});

function setupTabs() {
  const tabBasicInfo = document.getElementById("tabBasicInfo");
  const tabApplications = document.getElementById("tabApplications");
  const basicInfoSection = document.getElementById("basicInfoSection");
  const applicationsSection = document.getElementById("applicationsSection");

  if (tabBasicInfo && tabApplications) {
    tabBasicInfo.addEventListener("click", () => {
      tabBasicInfo.classList.add("active");
      tabApplications.classList.remove("active");
      basicInfoSection.classList.remove("hidden");
      applicationsSection.classList.add("hidden");
    });

    tabApplications.addEventListener("click", () => {
      tabApplications.classList.add("active");
      tabBasicInfo.classList.remove("active");
      applicationsSection.classList.remove("hidden");
      basicInfoSection.classList.add("hidden");
    });
  }
}

// User Profile Loader
async function loadUserProfile() {
  const emailInput = document.getElementById("profileEmail");
  const displayEmail = document.getElementById("displayEmail");
  const displayFullName = document.getElementById("displayFullName");

  if (emailInput) emailInput.value = currentUser.email || "";
  if (displayEmail) displayEmail.textContent = currentUser.email || "";

  try {
    const { data: profile, error } = await supabaseClient
      .from("profiles")
      .select("*")
      .eq("id", currentUser.id)
      .maybeSingle();

    if (error && error.code !== "PGRST116") {
      console.warn("Could not fetch profile details:", error.message);
    }

    currentProfileData = profile;

    const name = profile?.full_name || currentUser.user_metadata?.full_name || "Graduate";
    if (displayFullName) displayFullName.textContent = name;

    // Render resume status and toggle delete button visibility
    renderCvStatus(profile?.resume_url);

    // Populate form fields
    document.getElementById("profileFullName").value = profile?.full_name || currentUser.user_metadata?.full_name || "";
    document.getElementById("profilePhone").value = profile?.phone || "";
    document.getElementById("profileInstitution").value = profile?.institution || "";
    document.getElementById("profileCourse").value = profile?.course || "";
    document.getElementById("profileBio").value = profile?.bio || "";
  } catch (err) {
    console.error("Profile load exception:", err);
  }
}

// Render CV status text & toggle Delete button
function renderCvStatus(resumeUrl) {
  const resumeStatus = document.getElementById("resumeStatus");
  const deleteCvBtn = document.getElementById("deleteCvBtn");

  if (resumeUrl) {
    if (resumeStatus) {
      resumeStatus.innerHTML = `Current resume: <a href="${resumeUrl}" target="_blank" style="color: #0f172a; font-weight: 600; text-decoration: underline;">View Uploaded Resume</a>`;
    }
    if (deleteCvBtn) {
      deleteCvBtn.classList.remove("hidden");
    }
  } else {
    if (resumeStatus) {
      resumeStatus.innerHTML = `<span style="color: #64748b;">No CV currently uploaded.</span>`;
    }
    if (deleteCvBtn) {
      deleteCvBtn.classList.add("hidden");
    }
  }
}

// Delete CV Modal & Logic
function setupDeleteCvModal() {
  const deleteCvBtn = document.getElementById("deleteCvBtn");
  const deleteCvModal = document.getElementById("deleteCvModal");
  const cancelDeleteCvBtn = document.getElementById("cancelDeleteCvBtn");
  const closeDeleteCvModalBtn = document.getElementById("closeDeleteCvModalBtn");
  const confirmDeleteCvBtn = document.getElementById("confirmDeleteCvBtn");

  const hideModal = () => {
    if (deleteCvModal) deleteCvModal.classList.add("hidden");
  };

  if (deleteCvBtn) {
    deleteCvBtn.addEventListener("click", () => {
      if (deleteCvModal) deleteCvModal.classList.remove("hidden");
    });
  }

  if (cancelDeleteCvBtn) cancelDeleteCvBtn.addEventListener("click", hideModal);
  if (closeDeleteCvModalBtn) closeDeleteCvModalBtn.addEventListener("click", hideModal);

  if (deleteCvModal) {
    deleteCvModal.addEventListener("click", (e) => {
      if (e.target === deleteCvModal) hideModal();
    });
  }

  if (confirmDeleteCvBtn) {
    confirmDeleteCvBtn.addEventListener("click", async () => {
      hideModal();
      await executeDeleteCv();
    });
  }
}

// Execute Storage & Database Deletion
async function executeDeleteCv() {
  try {
    const resumeUrl = currentProfileData?.resume_url;

    if (resumeUrl) {
      // Try extracting file path from Supabase Public Storage URL
      let filePath = null;
      if (resumeUrl.includes("/storage/v1/object/public/resumes/")) {
        filePath = resumeUrl.split("/storage/v1/object/public/resumes/")[1];
      }

      if (filePath) {
        const { error: storageError } = await supabaseClient.storage
          .from("resumes")
          .remove([decodeURIComponent(filePath)]);

        if (storageError) {
          console.warn("Storage removal warning:", storageError.message);
        }
      }
    }

    // Set resume_url to NULL in profiles table
    const { error: dbError } = await supabaseClient
      .from("profiles")
      .update({
        resume_url: null,
        updated_at: new Date().toISOString()
      })
      .eq("id", currentUser.id);

    if (dbError) throw dbError;

    if (currentProfileData) {
      currentProfileData.resume_url = null;
    }

    // Update UI elements
    renderCvStatus(null);
    const fileInput = document.getElementById("profileResume");
    if (fileInput) fileInput.value = "";
    
    const fileUploadText = document.getElementById("fileUploadName");
    if (fileUploadText) fileUploadText.textContent = "Choose a file or drag & drop";

    showMessage("Your CV has been successfully deleted.");
  } catch (err) {
    console.error("Delete CV Exception:", err);
    showMessage("Failed to delete CV: " + err.message, true);
  }
}

// Update Profile & Upload Resume
function setupProfileForm() {
  const form = document.getElementById("profileForm");
  const saveBtn = document.getElementById("saveProfileBtn");
  const fileInput = document.getElementById("profileResume");
  const fileUploadName = document.getElementById("fileUploadName");

  if (fileInput && fileUploadName) {
    fileInput.addEventListener("change", () => {
      if (fileInput.files.length > 0) {
        fileUploadName.textContent = fileInput.files[0].name;
      } else {
        fileUploadName.textContent = "Choose a file or drag & drop";
      }
    });
  }

  if (!form) return;

  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    const fullName = document.getElementById("profileFullName").value.trim();
    const phone = document.getElementById("profilePhone").value.trim();
    const institution = document.getElementById("profileInstitution").value.trim();
    const course = document.getElementById("profileCourse").value.trim();
    const bio = document.getElementById("profileBio").value.trim();
    const file = fileInput?.files?.[0];

    let resumeUrl = currentProfileData?.resume_url || null;

    saveBtn.disabled = true;
    saveBtn.textContent = "Uploading & Saving...";

    try {
      // Upload CV to Storage if a new file was selected
      if (file) {
        if (file.size > 30 * 1024 * 1024) {
          showMessage("File size exceeds 30MB limit.", true);
          saveBtn.disabled = false;
          saveBtn.textContent = "Save Profile";
          return;
        }

        const fileExt = file.name.split(".").pop();
        const filePath = `${currentUser.id}/resume_${Date.now()}.${fileExt}`;

        const { error: uploadError } = await supabaseClient.storage
          .from("resumes")
          .upload(filePath, file, { upsert: true });

        if (uploadError) {
          showMessage("Resume upload failed: " + uploadError.message, true);
          saveBtn.disabled = false;
          saveBtn.textContent = "Save Profile";
          return;
        }

        const { data: urlData } = supabaseClient.storage
          .from("resumes")
          .getPublicUrl(filePath);

        resumeUrl = urlData.publicUrl;
      }

      // Prepare database payload
      const updates = {
        id: currentUser.id,
        email: currentUser.email,
        full_name: fullName,
        phone: phone,
        institution: institution,
        course: course,
        bio: bio,
        resume_url: resumeUrl,
        updated_at: new Date().toISOString()
      };

      const { error: profileError } = await supabaseClient
        .from("profiles")
        .upsert(updates);

      if (profileError) {
        showMessage("Failed to update profile: " + profileError.message, true);
        return;
      }

      if (!currentProfileData) currentProfileData = {};
      currentProfileData.resume_url = resumeUrl;
      currentProfileData.full_name = fullName;

      document.getElementById("displayFullName").textContent = fullName || "Graduate";

      renderCvStatus(resumeUrl);

      showMessage("Profile and resume saved successfully!");
    } catch (err) {
      showMessage("An unexpected error occurred: " + err.message, true);
    } finally {
      saveBtn.disabled = false;
      saveBtn.textContent = "Save Profile";
    }
  });
}

// Fetch Applied Opportunities
async function loadAppliedOpportunities() {
  const container = document.getElementById("applicationsList");
  if (!container) return;

  try {
    const { data: applications, error: appsError } = await supabaseClient
      .from("applications")
      .select("opportunity_id, created_at")
      .eq("user_id", currentUser.id)
      .order("created_at", { ascending: false });

    if (appsError) {
      container.innerHTML = `<p class="message error">Could not load applications: ${appsError.message}</p>`;
      return;
    }

    if (!applications || applications.length === 0) {
      container.innerHTML = `<p class="loading-text">You haven't applied to any opportunities yet.</p>`;
      return;
    }

    const oppIds = applications.map(a => a.opportunity_id);
    const { data: opportunities, error: oppsError } = await supabaseClient
      .from("opportunities")
      .select("*")
      .in("id", oppIds);

    if (oppsError) {
      container.innerHTML = `<p class="message error">Could not load listing details: ${oppsError.message}</p>`;
      return;
    }

    const oppMap = new Map((opportunities || []).map(o => [o.id, o]));

    container.innerHTML = applications.map(app => {
      const opp = oppMap.get(app.opportunity_id);
      const appliedDate = app.created_at ? new Date(app.created_at).toLocaleDateString() : "Recently";

      if (!opp) {
        return `
          <div class="app-card">
            <div class="app-card-header">
              <h3>Archived Opportunity</h3>
              <span class="badge-submitted">Applied</span>
            </div>
            <p class="app-card-date">Submitted on: ${appliedDate}</p>
          </div>
        `;
      }

      return `
        <div class="app-card">
          <div class="app-card-header">
            <h3>${opp.title}</h3>
            <span class="badge-submitted">Submitted</span>
          </div>
          <div class="app-card-meta">
            <span><strong>${opp.company}</strong></span>
            <span>•</span>
            <span>${opp.location}</span>
            <span>•</span>
            <span>${opp.type}</span>
          </div>
          <p class="app-card-date"><i class="fa-regular fa-clock"></i> Applied on ${appliedDate}</p>
        </div>
      `;
    }).join("");
  } catch (err) {
    container.innerHTML = `<p class="message error">Error loading records: ${err.message}</p>`;
  }
}