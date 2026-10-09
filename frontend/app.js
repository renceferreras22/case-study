// Uses your local backend when the page is opened from localhost,
// and the deployed Render backend everywhere else.
const isLocal = ["localhost", "127.0.0.1"].includes(window.location.hostname);
const API_URL = isLocal
  ? "http://localhost:5000"
  : "https://login-system-97ea.onrender.com";

// Render's free tier sleeps when idle, so the first request can take a while.
const REQUEST_TIMEOUT_MS = 60000;

let mode = "login";
let busy = false;

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function showMessage(text) {
  document.getElementById("message").innerText = text;
}

function setMode(newMode) {
  mode = newMode;
  const isLogin = mode === "login";

  document.getElementById("tab-login").classList.toggle("active", isLogin);
  document.getElementById("tab-register").classList.toggle("active", !isLogin);
  document.getElementById("name-field").hidden = isLogin;

  document.getElementById("title").innerText = isLogin
    ? "Welcome back"
    : "Create your account";
  document.getElementById("subtitle").innerText = isLogin
    ? "Sign in to your staff account."
    : "Register a new staff account.";
  document.getElementById("submit-btn").innerText = isLogin
    ? "Sign in"
    : "Create account";
  showMessage("");
}

// Disables the button while a request is running (prevents double submits)
function setBusy(isBusy) {
  busy = isBusy;
  const btn = document.getElementById("submit-btn");
  btn.disabled = isBusy;
  if (isBusy) {
    btn.innerText = "Please wait...";
  } else {
    btn.innerText = mode === "login" ? "Sign in" : "Create account";
  }
}

// Sends a JSON POST request and always returns { ok, data }
async function postJson(path, body) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(`${API_URL}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    // The server might answer with something that isn't JSON (e.g. a 502 page)
    let data = {};
    try {
      data = await response.json();
    } catch (e) {
      data = {};
    }

    return { ok: response.ok, data };
  } finally {
    clearTimeout(timer);
  }
}

function submitForm() {
  if (busy) return;

  if (mode === "login") {
    login();
  } else {
    register();
  }
}

async function register() {
  const name = document.getElementById("name").value.trim();
  const email = document.getElementById("email").value.trim();
  const password = document.getElementById("password").value;

  if (!name || !email || !password) {
    showMessage("All fields are required.");
    return;
  }
  if (!EMAIL_REGEX.test(email)) {
    showMessage("Please enter a valid email address.");
    return;
  }
  if (password.length < 8) {
    showMessage("Password must be at least 8 characters.");
    return;
  }

  setBusy(true);
  showMessage("");

  try {
    const { ok, data } = await postJson("/api/register", {
      name,
      email,
      password,
    });

    if (ok) {
      // Move to the sign-in tab, keep the email filled in, clear the password
      setMode("login");
      document.getElementById("password").value = "";
      showMessage("Registration successful. You can now sign in.");
    } else {
      showMessage(data.message || "Registration failed.");
    }
  } catch (error) {
    showMessage(
      error.name === "AbortError"
        ? "The server is taking too long to respond. Please try again."
        : "Cannot connect to server",
    );
  } finally {
    setBusy(false);
  }
}

async function login() {
  const email = document.getElementById("email").value.trim();
  const password = document.getElementById("password").value;

  if (!email || !password) {
    showMessage("Email and password are required.");
    return;
  }

  setBusy(true);
  showMessage("");

  try {
    const { data } = await postJson("/api/login", { email, password });

    if (data.token) {
      localStorage.setItem("token", data.token);
      if (data.user) {
        localStorage.setItem("user", JSON.stringify(data.user));
      }
      window.location.href = "dashboard.html";
      return; // keep the button disabled while redirecting
    }

    showMessage(data.message || "Login failed");
  } catch (error) {
    showMessage(
      error.name === "AbortError"
        ? "The server is taking too long to respond. Please try again."
        : "Cannot connect to server",
    );
  }

  setBusy(false);
}

// Pressing Enter in any field submits the form
document.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && event.target.tagName === "INPUT") {
    event.preventDefault();
    submitForm();
  }
});
