// signup.js - Signup page functionality

/**
 * Show toast notification
 */
function showToast(message, type = "error") {
  const toast = document.getElementById("toast");
  toast.textContent = message;
  toast.className = `toast ${type}`;

  setTimeout(() => toast.classList.add("show"), 10);

  setTimeout(() => {
    toast.classList.remove("show");
  }, 4000);
}

const REQUIREMENTS = [
  { id: "req-length", test: (p) => p.length >= 8,      label: "At least 8 characters" },
  { id: "req-lower",  test: (p) => /[a-z]/.test(p),    label: "One lowercase letter" },
  { id: "req-upper",  test: (p) => /[A-Z]/.test(p),    label: "One uppercase letter" },
  { id: "req-number", test: (p) => /[0-9]/.test(p),    label: "One number" },
];

/**
 * Check password strength and update UI checklist.
 * Returns "none" | "weak" | "fair" | "strong".
 */
function checkPasswordStrength(password) {
  const bar   = document.getElementById("password-strength");
  const label = document.getElementById("strength-label");

  if (!password) {
    bar.className   = "password-strength";
    label.textContent = "";
    REQUIREMENTS.forEach(({ id }) => {
      const el = document.getElementById(id);
      if (el) el.className = "req-item";
    });
    return "none";
  }

  // Update each requirement item
  let metCount = 0;
  REQUIREMENTS.forEach(({ id, test }) => {
    const el = document.getElementById(id);
    if (!el) return;
    const met = test(password);
    if (met) metCount++;
    el.className = met ? "req-item met" : "req-item unmet";
  });

  // Bonus: extra length or special char
  let score = metCount;
  if (password.length >= 12) score++;
  if (/[^a-zA-Z0-9]/.test(password)) score++;

  let level;
  if (metCount < REQUIREMENTS.length) {
    level = "weak";
    bar.className     = "password-strength weak";
    label.textContent = "Weak";
    label.className   = "strength-label weak";
  } else if (score <= 5) {
    level = "fair";
    bar.className     = "password-strength fair";
    label.textContent = "Fair";
    label.className   = "strength-label fair";
  } else {
    level = "strong";
    bar.className     = "password-strength strong";
    label.textContent = "Strong";
    label.className   = "strength-label strong";
  }

  return level;
}

/**
 * Handle form submission
 */
async function handleSignup(event) {
  event.preventDefault();

  const form = event.target;
  const submitBtn = document.getElementById("submit-btn");

  const username = document.getElementById("username").value.trim();
  const email = document.getElementById("email").value.trim();
  const password = document.getElementById("password").value;
  const confirmPassword = document.getElementById("confirm-password").value;
  const termsAccepted = document.getElementById("terms").checked;

  // Validation
  if (!username || !email || !password || !confirmPassword) {
    showToast("Please fill in all fields");
    return;
  }

  if (username.length < 3) {
    showToast("Username must be at least 3 characters");
    return;
  }

  if (!isValidEmail(email)) {
    showToast("Please enter a valid email address");
    return;
  }

  const strength = checkPasswordStrength(password);
  if (strength === "weak" || strength === "none") {
    showToast("Password is too weak. Meet all requirements below.");
    document.getElementById("password").focus();
    return;
  }

  if (password !== confirmPassword) {
    showToast("Passwords do not match");
    return;
  }

  if (!termsAccepted) {
    showToast("Please accept the Terms of Service");
    return;
  }

  // Disable button and show loading
  submitBtn.disabled = true;
  submitBtn.classList.add("loading");
  submitBtn.textContent = "Creating account";

  try {
    const response = await fetch("/auth/signup", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ username, email, password }),
    });

    const data = await response.json();

    if (response.ok) {
      showToast("Account created successfully! Redirecting...", "success");
      setTimeout(() => {
        window.location.href = data.redirect || "/chat";
      }, 1500);
    } else {
      showToast(data.message || "Signup failed. Please try again.");
      submitBtn.disabled = false;
      submitBtn.classList.remove("loading");
      submitBtn.textContent = "Create Account";
    }
  } catch (error) {
    console.error("Signup error:", error);
    showToast("Network error. Please try again.");
    submitBtn.disabled = false;
    submitBtn.classList.remove("loading");
    submitBtn.textContent = "Create Account";
  }
}

/**
 * Validate email format
 */
function isValidEmail(email) {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

/**
 * Initialize event listeners
 */
function init() {
  const signupForm = document.getElementById("signup-form");
  const passwordInput = document.getElementById("password");

  if (signupForm) {
    signupForm.addEventListener("submit", handleSignup);
  }

  // Password strength indicator
  if (passwordInput) {
    passwordInput.addEventListener("input", (e) => {
      checkPasswordStrength(e.target.value);
    });
  }

  // Focus on username input
  const usernameInput = document.getElementById("username");
  if (usernameInput) {
    usernameInput.focus();
  }

  // Check for error/success messages in URL params
  const urlParams = new URLSearchParams(window.location.search);
  const error = urlParams.get("error");
  const success = urlParams.get("success");

  if (error) {
    showToast(decodeURIComponent(error), "error");
  }

  if (success) {
    showToast(decodeURIComponent(success), "success");
  }
}

// Initialize when DOM is ready
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
