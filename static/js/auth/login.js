// login.js - Login page functionality

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

/**
 * Handle form submission
 */
async function handleLogin(event) {
  event.preventDefault();

  const form = event.target;
  const submitBtn = document.getElementById("submit-btn");
  const email = document.getElementById("email").value.trim();
  const password = document.getElementById("password").value;

  // Validation
  if (!email || !password) {
    showToast("Please fill in all fields");
    return;
  }

  if (!isValidEmail(email)) {
    showToast("Please enter a valid email address");
    return;
  }

  // Disable button and show loading
  submitBtn.disabled = true;
  submitBtn.classList.add("loading");
  submitBtn.textContent = "Signing in";

  try {
    const response = await fetch("/auth/login", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ email, password }),
    });

    const data = await response.json();

    if (response.ok) {
      showToast("Login successful! Redirecting...", "success");
      setTimeout(() => {
        window.location.href = data.redirect || "/chat";
      }, 1000);
    } else {
      showToast(data.message || "Invalid email or password");
      submitBtn.disabled = false;
      submitBtn.classList.remove("loading");
      submitBtn.textContent = "Sign In";
    }
  } catch (error) {
    console.error("Login error:", error);
    showToast("Network error. Please try again.");
    submitBtn.disabled = false;
    submitBtn.classList.remove("loading");
    submitBtn.textContent = "Sign In";
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
  const loginForm = document.getElementById("login-form");

  if (loginForm) {
    loginForm.addEventListener("submit", handleLogin);
  }

  // Focus on email input
  const emailInput = document.getElementById("email");
  if (emailInput) {
    emailInput.focus();
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
