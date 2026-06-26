const BACKEND_URL = "http://localhost:3000";

// ─── DOM refs ────────────────────────────────────────────────────────────────

const authFormSection    = document.getElementById("auth-form-section");
const authLoggedinSection = document.getElementById("auth-loggedin-section");
const authEmailEl        = document.getElementById("auth-email");
const authPasswordEl     = document.getElementById("auth-password");
const authEmailDisplay   = document.getElementById("auth-email-display");
const authAvatar         = document.getElementById("auth-avatar");
const pillAccount        = document.getElementById("pill-account");
const authMsgEl          = document.getElementById("auth-msg");

const pillNotion         = document.getElementById("pill-notion");
const notionDisconnected = document.getElementById("notion-disconnected");
const notionConnected    = document.getElementById("notion-connected");
const notionMsgEl        = document.getElementById("notion-msg");

const pillCal            = document.getElementById("pill-cal");
const calDisconnected    = document.getElementById("cal-disconnected");
const calConnected       = document.getElementById("cal-connected");
const calMsgEl           = document.getElementById("cal-msg");

// ─── Init ─────────────────────────────────────────────────────────────────────

chrome.storage.local.get(["engramToken", "engramEmail", "calConnected"], (result) => {
  const { engramToken, engramEmail, calConnected } = result;

  if (engramToken && engramEmail) {
    showLoggedIn(engramEmail);
    refreshIntegrationStatus(engramToken);
  }

  if (calConnected) showCalConnected();
});

async function refreshIntegrationStatus(token) {
  try {
    const res = await fetch(`${BACKEND_URL}/api/integrations/status`, {
      headers: { "Authorization": `Bearer ${token}` },
    });
    if (!res.ok) return;
    const { notion, calendar } = await res.json();
    if (notion.connected)    showNotionConnected();
    if (calendar.connected)  { showCalConnected(); chrome.storage.local.set({ calConnected: true }); }
  } catch (_) {}
}

// ─── State helpers ────────────────────────────────────────────────────────────

function setPill(el, on, onLabel, offLabel) {
  el.className = on ? "pill pill--on" : "pill pill--off";
  el.querySelector(".pill-label").textContent = on ? onLabel : offLabel;
}

function showLoggedIn(email) {
  authFormSection.classList.add("hidden");
  authLoggedinSection.classList.remove("hidden");
  authEmailDisplay.textContent = email;
  authAvatar.textContent = email[0].toUpperCase();
  setPill(pillAccount, true, "Signed in", "Signed out");
}

function showAuthForm() {
  authFormSection.classList.remove("hidden");
  authLoggedinSection.classList.add("hidden");
  setPill(pillAccount, false, "Signed in", "Signed out");
}

function showNotionConnected() {
  notionDisconnected.classList.add("hidden");
  notionConnected.classList.remove("hidden");
  setPill(pillNotion, true, "Connected", "Not connected");
}

function showNotionDisconnected() {
  notionDisconnected.classList.remove("hidden");
  notionConnected.classList.add("hidden");
  setPill(pillNotion, false, "Connected", "Not connected");
}

function showCalConnected() {
  calDisconnected.classList.add("hidden");
  calConnected.classList.remove("hidden");
  setPill(pillCal, true, "Connected", "Not connected");
}

function showCalDisconnected() {
  calDisconnected.classList.remove("hidden");
  calConnected.classList.add("hidden");
  setPill(pillCal, false, "Connected", "Not connected");
}

// ─── Show / hide password ─────────────────────────────────────────────────────

document.getElementById("btn-pw-toggle").addEventListener("click", function () {
  const isPassword = authPasswordEl.type === "password";
  authPasswordEl.type = isPassword ? "text" : "password";
  this.textContent = isPassword ? "Hide" : "Show";
});

// ─── Login ────────────────────────────────────────────────────────────────────

document.getElementById("btn-login").addEventListener("click", async () => {
  const email    = authEmailEl.value.trim();
  const password = authPasswordEl.value;
  if (!email || !password) return setMsg(authMsgEl, "Email and password required.", "error");

  setMsg(authMsgEl, "Logging in...", "");
  try {
    const res  = await fetch(`${BACKEND_URL}/api/auth/login`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ email, password }),
    });
    const data = await res.json();
    if (!res.ok) return setMsg(authMsgEl, data.error || "Login failed.", "error");

    await chrome.storage.local.set({ engramToken: data.token, engramEmail: email });
    showLoggedIn(email);
    refreshIntegrationStatus(data.token);
    setMsg(authMsgEl, "", "");
  } catch (err) {
    setMsg(authMsgEl, `Error: ${err.message}`, "error");
  }
});

// ─── Register ─────────────────────────────────────────────────────────────────

document.getElementById("btn-register").addEventListener("click", async () => {
  const email    = authEmailEl.value.trim();
  const password = authPasswordEl.value;
  if (!email || !password) return setMsg(authMsgEl, "Email and password required.", "error");

  setMsg(authMsgEl, "Creating account...", "");
  try {
    const res  = await fetch(`${BACKEND_URL}/api/auth/register`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ email, password }),
    });
    const data = await res.json();
    if (!res.ok) return setMsg(authMsgEl, data.error || "Registration failed.", "error");

    await chrome.storage.local.set({ engramToken: data.token, engramEmail: email });
    showLoggedIn(email);
    setMsg(authMsgEl, "", "");
  } catch (err) {
    setMsg(authMsgEl, `Error: ${err.message}`, "error");
  }
});

// ─── Logout ───────────────────────────────────────────────────────────────────

document.getElementById("btn-logout").addEventListener("click", async () => {
  await chrome.storage.local.remove(["engramToken", "engramEmail", "calConnected"]);
  showAuthForm();
  showNotionDisconnected();
  showCalDisconnected();
});

// ─── Notion: connect ──────────────────────────────────────────────────────────

document.getElementById("btn-notion-connect").addEventListener("click", async () => {
  const { engramToken } = await chrome.storage.local.get("engramToken");
  if (!engramToken) return setMsg(notionMsgEl, "Sign in first.", "error");

  chrome.tabs.create({
    url: `${BACKEND_URL}/api/integrations/notion/connect?jwt=${encodeURIComponent(engramToken)}`,
  });

  setMsg(notionMsgEl, "Waiting for Notion authorization...", "");

  let attempts = 0;
  const poll = setInterval(async () => {
    if (++attempts > 40) {
      clearInterval(poll);
      setMsg(notionMsgEl, "Timed out. Try connecting again.", "error");
      return;
    }
    try {
      const res = await fetch(`${BACKEND_URL}/api/integrations/status`, {
        headers: { "Authorization": `Bearer ${engramToken}` },
      });
      if (!res.ok) return;
      const { notion } = await res.json();
      if (notion.connected) {
        clearInterval(poll);
        showNotionConnected();
        setMsg(notionMsgEl, "", "");
      }
    } catch (_) {}
  }, 3000);
});

// ─── Notion: disconnect ───────────────────────────────────────────────────────

document.getElementById("btn-notion-disconnect").addEventListener("click", () => {
  showNotionDisconnected();
  setMsg(notionMsgEl, "Disconnected. Click Connect Notion to relink.", "");
});

// ─── Google Calendar: connect ─────────────────────────────────────────────────

document.getElementById("btn-cal-connect").addEventListener("click", async () => {
  const { engramToken } = await chrome.storage.local.get("engramToken");
  if (!engramToken) return setMsg(calMsgEl, "Sign in first.", "error");

  chrome.tabs.create({
    url: `${BACKEND_URL}/api/integrations/google/connect?jwt=${encodeURIComponent(engramToken)}`,
  });

  setMsg(calMsgEl, "Waiting for Google authorization...", "");

  let attempts = 0;
  const poll = setInterval(async () => {
    if (++attempts > 40) {
      clearInterval(poll);
      setMsg(calMsgEl, "Timed out. Try connecting again.", "error");
      return;
    }
    try {
      const res = await fetch(`${BACKEND_URL}/api/integrations/status`, {
        headers: { "Authorization": `Bearer ${engramToken}` },
      });
      if (!res.ok) return;
      const { calendar } = await res.json();
      if (calendar.connected) {
        clearInterval(poll);
        await chrome.storage.local.set({ calConnected: true });
        showCalConnected();
        setMsg(calMsgEl, "", "");
      }
    } catch (_) {}
  }, 3000);
});

// ─── Google Calendar: disconnect ─────────────────────────────────────────────

document.getElementById("btn-cal-disconnect").addEventListener("click", async () => {
  await chrome.storage.local.remove("calConnected");
  showCalDisconnected();
  setMsg(calMsgEl, "Disconnected. Click Connect Google Account to relink.", "");
});

// ─── Helper ───────────────────────────────────────────────────────────────────

function setMsg(el, text, type) {
  el.textContent = text;
  el.className   = `feedback-msg${type ? " " + type : ""}`;
}
