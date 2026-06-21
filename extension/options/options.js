import { searchDatabases, createDatabase } from "../background/notion.js";
import { listCalendars } from "../background/calendar.js";

// ─── DOM refs ────────────────────────────────────────────────────────────────

const notionKeyEl    = document.getElementById("notion-key");
const notionDbEl     = document.getElementById("notion-db");
const notionParentEl = document.getElementById("notion-parent");
const notionStatusEl = document.getElementById("notion-status");
const notionMsgEl    = document.getElementById("notion-msg");

const calSelectEl  = document.getElementById("cal-select");
const calStatusEl  = document.getElementById("cal-status");
const calMsgEl     = document.getElementById("cal-msg");
const btnCalLoad   = document.getElementById("btn-cal-load");

const srIntervalsEl = document.getElementById("sr-intervals");
const saveMsgEl     = document.getElementById("save-msg");

// ─── Load saved settings on open ─────────────────────────────────────────────

chrome.storage.local.get("engramSettings", ({ engramSettings: s }) => {
  if (!s) return;

  if (s.notionApiKey)    notionKeyEl.value    = s.notionApiKey;
  if (s.notionDatabaseId) notionDbEl.value    = s.notionDatabaseId;
  if (s.srIntervals)     srIntervalsEl.value  = s.srIntervals.join(", ");

  if (s.notionApiKey && s.notionDatabaseId) {
    notionStatusEl.classList.add("connected");
  }

  if (s.calendarEnabled) {
    calStatusEl.classList.add("connected");
    btnCalLoad.disabled = false;
    loadCalendars(s.calendarId);
  }
});

// ─── Notion: test connection ──────────────────────────────────────────────────

document.getElementById("btn-notion-test").addEventListener("click", async () => {
  const key = notionKeyEl.value.trim();
  if (!key) return setMsg(notionMsgEl, "Enter your Notion integration token first.", "error");

  setMsg(notionMsgEl, "Testing...", "");
  try {
    const dbs = await searchDatabases(key);
    notionStatusEl.className = "status-dot connected";
    setMsg(notionMsgEl, `Connected. Found ${dbs.length} database(s) accessible.`, "success");
  } catch (err) {
    notionStatusEl.className = "status-dot error";
    setMsg(notionMsgEl, `Failed: ${err.message}`, "error");
  }
});

// ─── Notion: create database ──────────────────────────────────────────────────

document.getElementById("btn-notion-create-db").addEventListener("click", async () => {
  const key    = notionKeyEl.value.trim();
  const parent = extractNotionId(notionParentEl.value.trim());

  if (!key)    return setMsg(notionMsgEl, "Enter your integration token first.", "error");
  if (!parent) return setMsg(notionMsgEl, "Enter the parent page URL or ID.", "error");

  setMsg(notionMsgEl, "Creating database...", "");
  try {
    const dbId = await createDatabase(key, parent);
    notionDbEl.value = dbId;
    notionStatusEl.className = "status-dot connected";
    setMsg(notionMsgEl, "Database created! ID filled in above.", "success");
  } catch (err) {
    setMsg(notionMsgEl, `Failed: ${err.message}`, "error");
  }
});

// ─── Google Calendar: connect ─────────────────────────────────────────────────

document.getElementById("btn-cal-connect").addEventListener("click", async () => {
  setMsg(calMsgEl, "Opening Google sign-in...", "");
  try {
    await loadCalendars();
    btnCalLoad.disabled = false;
    calStatusEl.classList.add("connected");
    setMsg(calMsgEl, "Connected. Select a calendar above.", "success");
  } catch (err) {
    calStatusEl.classList.remove("connected");
    calStatusEl.classList.add("error");
    setMsg(calMsgEl, `Failed: ${err.message}`, "error");
  }
});

btnCalLoad.addEventListener("click", () => loadCalendars());

async function loadCalendars(selectedId = null) {
  try {
    const calendars = await listCalendars();
    calSelectEl.innerHTML = "";
    calSelectEl.disabled = false;

    calendars
      .filter((c) => c.accessRole === "owner" || c.accessRole === "writer")
      .forEach((cal) => {
        const opt = document.createElement("option");
        opt.value = cal.id;
        opt.textContent = cal.summary;
        if (selectedId && cal.id === selectedId) opt.selected = true;
        calSelectEl.appendChild(opt);
      });
  } catch (err) {
    setMsg(calMsgEl, `Could not load calendars: ${err.message}`, "error");
  }
}

// ─── Save all settings ────────────────────────────────────────────────────────

document.getElementById("btn-save").addEventListener("click", async () => {
  const notionApiKey    = notionKeyEl.value.trim();
  const notionDatabaseId = extractNotionId(notionDbEl.value.trim());
  const calendarId      = calSelectEl.value || "primary";
  const calendarEnabled = !calSelectEl.disabled && !!calSelectEl.value;

  const rawIntervals = srIntervalsEl.value
    .split(",")
    .map((s) => parseInt(s.trim(), 10))
    .filter((n) => !isNaN(n) && n > 0);

  const srIntervals = rawIntervals.length ? rawIntervals : [1, 3, 7, 14, 30];

  if (!notionApiKey) {
    return setMsg(saveMsgEl, "Notion API key is required.", "error");
  }

  const settings = {
    notionApiKey,
    notionDatabaseId,
    calendarId,
    calendarEnabled,
    srIntervals,
  };

  await chrome.storage.local.set({ engramSettings: settings });
  setMsg(saveMsgEl, "Settings saved.", "success");

  setTimeout(() => setMsg(saveMsgEl, "", ""), 3000);
});

// ─── Helpers ─────────────────────────────────────────────────────────────────

function setMsg(el, text, type) {
  el.textContent = text;
  el.className = `feedback-msg ${type}`;
}

function extractNotionId(input) {
  if (!input) return "";
  // Support full Notion URLs: https://notion.so/Page-Title-<32-char-id>
  const match = input.match(/([a-f0-9]{32})/i);
  return match ? match[1] : input;
}
