// const API_URL = "http://localhost:5000";
const API_URL = "https://onrender.com";

let mode = "login";

// Sniff url on window bootup to see if we should trigger password entry
window.addEventListener("DOMContentLoaded", () => {
  const urlParams = new URLSearchParams(window.location.search);
  const token = urlParams.get("token");
  if (token) {
    setMode("reset");
  } else {
    setMode("login");
  }
});

function setMode(newMode) {
  mode = newMode;
  const isLogin = mode === "login";
  const isRegister = mode === "register";
  const isForgot = mode === "forgot";
  const isReset = mode === "reset";

  document.getElementById("tab-login").classList.toggle("active", isLogin);
  document.getElementById("tab-register").classList.toggle("active", isRegister);
  
  // Hide navigation tabs section for password reset scenarios
  document.getElementById("tabs-container").hidden = (isForgot || isReset);

  // Field element views configuration map matching gym architecture requirements
  document.getElementById("name-field").hidden = !isRegister;
  document.getElementById("role-field").hidden = !isRegister; // Shows role choice selector during register only
  document.getElementById("email-field").hidden = isReset;
  document.getElementById("password-field").hidden = isForgot;

  // Text contents strings updates
  if (isLogin) {
    document.getElementById("title").innerText = "Welcome back";
    document.getElementById("subtitle").innerText = "Sign in to your account.";
    document.getElementById("submit-btn").innerText = "Sign in";
    document.getElementById("toggle-link").innerText = "Forgot password?";
  } else if (isRegister) {
    document.getElementById("title").innerText = "Create your account";
    document.getElementById("subtitle").innerText = "Register a new gym portal account.";
    document.getElementById("submit-btn").innerText = "Create account";
    document.getElementById("toggle-link").innerText = ""; 
  } else if (isForgot) {
    document.getElementById("title").innerText = "Reset Password";
    document.getElementById("subtitle").innerText = "Enter your account email to request a reset link.";
    document.getElementById("submit-btn").innerText = "Send reset link";
    document.getElementById("toggle-link").innerText = "Back to login";
  } else if (isReset) {
    document.getElementById("title").innerText = "Set New Password";
    document.getElementById("subtitle").innerText = "Please enter your brand new secure password below.";
    document.getElementById("submit-btn").innerText = "Update password";
    document.getElementById("toggle-link").innerText = "Cancel";
  }

  document.getElementById("message").innerText = "";
}

function handleLinkClick() {
  if (mode === "forgot" || mode === "reset") {
    setMode("login");
  } else {
    setMode("forgot");
  }
}

function submitForm() {
  if (mode === "login") {
    login();
  } else if (mode === "register") {
    register();
  } else if (mode === "forgot") {
    forgotPassword();
  } else if (mode === "reset") {
    resetPassword();
  }
}

async function register() {
  const name = document.getElementById("name").value;
  const email = document.getElementById("email").value;
  const password = document.getElementById("password").value;
  const role = document.getElementById("role").value; // Gets role choice payload value

  try {
    const response = await fetch(`${API_URL}/api/register`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name,
        email,
        password,
        role // Passes choice parameter array values down to node server context
      }),
    });

    const data = await response.json();

    document.getElementById("message").innerText =
      data.message || "Registration complete";
  } catch (error) {
    document.getElementById("message").innerText = "Cannot connect to server";
  }
}

async function login() {
  const email = document.getElementById("email").value;
  const password = document.getElementById("password").value;

  try {
    const response = await fetch(`${API_URL}/api/login`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        email,
        password,
      }),
    });

    const data = await response.json();

    if (data.token && data.user) {
      localStorage.setItem("token", data.token);
      
      // Store current user configuration metrics role for dashboard usage contexts
      localStorage.setItem("role", data.user.role);
      
      // Gym context separation check
      if (data.user.role === "admin") {
        window.location.href = "dashboard.html"; // The gym owner/staff dashboard
      } else {
        window.location.href = "dashboard.html"; // Members view page file (can update to member.html if needed later)
      }
    } else {
      document.getElementById("message").innerText =
        data.message || "Login failed";
    }
  } catch (error) {
    document.getElementById("message").innerText = "Cannot connect to server";
  }
}

async function forgotPassword() {
  const email = document.getElementById("email").value;

  try {
    const response = await fetch(`${API_URL}/api/forgot-password`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        email,
      }),
    });

    const data = await response.json();
    document.getElementById("message").innerText = data.message;
  } catch (error) {
    document.getElementById("message").innerText = "Cannot connect to server";
  }
}

async function resetPassword() {
  const urlParams = new URLSearchParams(window.location.search);
  const token = urlParams.get("token");
  const password = document.getElementById("password").value;

  try {
    const response = await fetch(`${API_URL}/api/reset-password/${token}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        password,
      }),
    });

    const data = await response.json();
    document.getElementById("message").innerText = data.message;
    
    if (response.ok) {
      setTimeout(() => setMode("login"), 3000); 
    }
  } catch (error) {
    document.getElementById("message").innerText = "Cannot connect to server";
  }
}
