document.addEventListener("DOMContentLoaded", () => {
  const openModalBtn = document.getElementById("openModalBtn");
  const closeModalBtn = document.getElementById("closeModalBtn");
  const authModal = document.getElementById("authModal");

  const modalTabs = document.getElementById("modalTabs");
  const tabSignIn = document.getElementById("tabSignIn");
  const tabSignUp = document.getElementById("tabSignUp");
  const signInForm = document.getElementById("signInForm");
  const signUpForm = document.getElementById("signUpForm");
  const otpForm = document.getElementById("otpForm");
  const authMessage = document.getElementById("authMessage");

  const otpTargetEmail = document.getElementById("otpTargetEmail");
  const otpCodeInput = document.getElementById("otpCode");
  const resendOtpBtn = document.getElementById("resendOtpBtn");
  const backToSignupBtn = document.getElementById("backToSignupBtn");

  const signInSubmitBtn = document.getElementById("signInSubmitBtn");
  const signUpSubmitBtn = document.getElementById("signUpSubmitBtn");
  const verifyOtpBtn = document.getElementById("verifyOtpBtn");

  let pendingEmail = "";

  function showMessage(text, isError = false) {
    if (!authMessage) return;
    authMessage.textContent = text;
    authMessage.className = `message ${isError ? "error" : "info"}`;
    authMessage.classList.remove("hidden");
  }

  function clearMessage() {
    if (!authMessage) return;
    authMessage.textContent = "";
    authMessage.className = "message hidden";
  }

  function openModal() {
    if (authModal) {
      authModal.classList.remove("hidden");
      showSignInView();
    }
  }

  function closeModal() {
    if (authModal) {
      authModal.classList.add("hidden");
      clearMessage();
    }
  }

  function showSignInView() {
    if (modalTabs) modalTabs.classList.remove("hidden");
    if (tabSignIn) tabSignIn.classList.add("active");
    if (tabSignUp) tabSignUp.classList.remove("active");
    if (signInForm) signInForm.classList.remove("hidden");
    if (signUpForm) signUpForm.classList.add("hidden");
    if (otpForm) otpForm.classList.add("hidden");
    clearMessage();
  }

  function showSignUpView() {
    if (modalTabs) modalTabs.classList.remove("hidden");
    if (tabSignUp) tabSignUp.classList.add("active");
    if (tabSignIn) tabSignIn.classList.remove("active");
    if (signUpForm) signUpForm.classList.remove("hidden");
    if (signInForm) signInForm.classList.add("hidden");
    if (otpForm) otpForm.classList.add("hidden");
    clearMessage();
  }

  function showOtpView(email) {
    pendingEmail = email;
    if (otpTargetEmail) otpTargetEmail.textContent = email;
    if (modalTabs) modalTabs.classList.add("hidden");
    if (signInForm) signInForm.classList.add("hidden");
    if (signUpForm) signUpForm.classList.add("hidden");
    if (otpForm) otpForm.classList.remove("hidden");
    if (otpCodeInput) {
      otpCodeInput.value = "";
      otpCodeInput.focus();
    }
    clearMessage();
  }

  if (openModalBtn) openModalBtn.addEventListener("click", openModal);
  if (closeModalBtn) closeModalBtn.addEventListener("click", closeModal);

  window.addEventListener("click", (e) => {
    if (e.target === authModal) closeModal();
  });

  if (tabSignIn) tabSignIn.addEventListener("click", showSignInView);
  if (tabSignUp) tabSignUp.addEventListener("click", showSignUpView);
  if (backToSignupBtn) backToSignupBtn.addEventListener("click", showSignUpView);

  // Cloudflare Worker
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

  async function routeUser(user) {
    const email = user.email ? user.email.toLowerCase() : "";
    if (ADMIN_EMAILS.includes(email)) {
      window.location.href = "admin.html";
      return;
    }

    try {
      const { data: profile } = await supabaseClient
        .from("profiles")
        .select("role, status")
        .eq("id", user.id)
        .maybeSingle();

      if (profile && profile.status === "banned") {
        await supabaseClient.auth.signOut();
        showMessage("Your account has been suspended. Please contact administration. Email: nkepedavid@gmail.com", true);
        return;
      }

      if (profile && profile.role === "admin") {
        window.location.href = "admin.html";
      } else {
        window.location.href = "dashboard.html";
      }
    } catch {
      window.location.href = "dashboard.html";
    }
  }

  // Sign In
  if (signInForm) {
    signInForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      clearMessage();

      if (!supabaseClient) {
        showMessage("Supabase client is not loaded.", true);
        return;
      }

      const email = document.getElementById("signinEmail").value.trim();
      const password = document.getElementById("signinPassword").value;

      if (signInSubmitBtn) {
        signInSubmitBtn.disabled = true;
        signInSubmitBtn.textContent = "Signing In...";
      }

      try {
        const { data, error } = await supabaseClient.auth.signInWithPassword({
          email,
          password,
        });

        if (error) {
          showMessage(error.message, true);
          return;
        }

        if (data?.session && data?.user) {
          const { data: profile } = await supabaseClient
            .from("profiles")
            .select("status")
            .eq("id", data.user.id)
            .maybeSingle();

          if (profile && profile.status === "banned") {
            await supabaseClient.auth.signOut();
            showMessage("Your account has been suspended. Please contact administration. Email: nkepedavid@gmail.com", true);
            return;
          }

          await routeUser(data.user);
        }
      } catch (err) {
        showMessage(err.message || "An unexpected error occurred", true);
      } finally {
        if (signInSubmitBtn) {
          signInSubmitBtn.disabled = false;
          signInSubmitBtn.textContent = "Sign In";
        }
      }
    });
  }

  // Sign Up
  if (signUpForm) {
    signUpForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      clearMessage();

      if (!supabaseClient) {
        showMessage("Supabase client is not loaded.", true);
        return;
      }

      const email = document.getElementById("signupEmail").value.trim();
      const password = document.getElementById("signupPassword").value;

      if (signUpSubmitBtn) {
        signUpSubmitBtn.disabled = true;
        signUpSubmitBtn.textContent = "Creating Account...";
      }

      try {
        const { data, error } = await supabaseClient.auth.signUp({
          email,
          password,
        });

        if (error) {
          showMessage(error.message, true);
          return;
        }

        if (data?.user && (!data.session || data.user.identities?.length > 0)) {
          showOtpView(email);
          showMessage("Verification code sent! Check your inbox.", false);
        } else if (data?.session && data?.user) {
          await routeUser(data.user);
        }
      } catch (err) {
        showMessage(err.message || "An unexpected error occurred", true);
      } finally {
        if (signUpSubmitBtn) {
          signUpSubmitBtn.disabled = false;
          signUpSubmitBtn.textContent = "Create Account";
        }
      }
    });
  }

  // Verify one time password
  if (otpForm) {
    otpForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      clearMessage();

      const token = (otpCodeInput?.value || "").trim();

      if (!token || token.length !== 8) {
        showMessage("Please enter the 8-digit verification code.", true);
        return;
      }

      if (verifyOtpBtn) {
        verifyOtpBtn.disabled = true;
        verifyOtpBtn.textContent = "Verifying...";
      }

      try {
        const { data, error } = await supabaseClient.auth.verifyOtp({
          email: pendingEmail,
          token: token,
          type: "signup",
        });

        if (error) {
          showMessage(error.message, true);
          return;
        }

        if (data?.user) {
          showMessage("Email verified successfully! Redirecting...", false);
          setTimeout(() => routeUser(data.user), 1000);
        }
      } catch (err) {
        showMessage(err.message || "Verification failed. Please try again.", true);
      } finally {
        if (verifyOtpBtn) {
          verifyOtpBtn.disabled = false;
          verifyOtpBtn.textContent = "Verify & Continue";
        }
      }
    });
  }

  // Resend OTP
  if (resendOtpBtn) {
    resendOtpBtn.addEventListener("click", async () => {
      if (!pendingEmail) return;
      clearMessage();

      resendOtpBtn.disabled = true;
      resendOtpBtn.textContent = "Resending...";

      try {
        const { error } = await supabaseClient.auth.resend({
          type: "signup",
          email: pendingEmail,
        });

        if (error) {
          showMessage(error.message, true);
        } else {
          showMessage("A fresh verification code has been dispatched to your email.", false);
        }
      } catch (err) {
        showMessage(err.message || "Could not resend code.", true);
      } finally {
        setTimeout(() => {
          resendOtpBtn.disabled = false;
          resendOtpBtn.textContent = "Resend code";
        }, 5000);
      }
    });
  }
});
