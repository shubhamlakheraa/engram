const states = {
  idle: document.getElementById("state-idle"),
  pending: document.getElementById("state-pending"),
  logging: document.getElementById("state-logging"),
  success: document.getElementById("state-success"),
  setup: document.getElementById("state-setup"),
};

function showState(name) {
  Object.values(states).forEach((el) => el.classList.add("hidden"));
  states[name]?.classList.remove("hidden");
}

async function init() {
  const [settings, pending] = await Promise.all([getSettings(), getPending()]);

  if (!settings?.notionApiKey || !settings?.notionDatabaseId) {
    showState("setup");
    return;
  }

  if (!pending) {
    showState("idle");
    return;
  }

  populatePendingUI(pending);
  showState("pending");
}

function populatePendingUI(submission) {
  const titleEl = document.getElementById("problem-title");
  const badgeEl = document.getElementById("problem-difficulty");
  const runtimeEl = document.getElementById("stat-runtime");
  const memoryEl = document.getElementById("stat-memory");
  const langEl = document.getElementById("stat-lang");

  const title = submission.problemNumber
    ? `${submission.problemNumber}. ${submission.problemTitle || submission.titleSlug}`
    : submission.problemTitle || submission.titleSlug || "Problem";

  titleEl.textContent = title;

  const diff = (submission.difficulty || "").toLowerCase();
  badgeEl.textContent = submission.difficulty || "";
  badgeEl.className = `badge ${diff}`;

  runtimeEl.textContent = submission.statusRuntime || "—";
  memoryEl.textContent = submission.statusMemory || "—";
  langEl.textContent = submission.prettyLang || submission.lang || "—";
}

document.getElementById("btn-log").addEventListener("click", async () => {
  const notes = document.getElementById("notes-input").value.trim();
  const pending = await getPending();
  if (!pending) return;

  showState("logging");

  chrome.runtime.sendMessage(
    { type: "LOG_SUBMISSION", data: { ...pending, notes } },
    () => {
      showState("success");
    }
  );
});

document.getElementById("btn-skip").addEventListener("click", async () => {
  await chrome.runtime.sendMessage({ type: "CLEAR_PENDING" });
  showState("idle");
});

document.getElementById("btn-done").addEventListener("click", () => {
  window.close();
});

function getSettings() {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ type: "GET_SETTINGS" }, (res) => {
      resolve(res?.data || null);
    });
  });
}

function getPending() {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ type: "GET_PENDING" }, (res) => {
      resolve(res?.data || null);
    });
  });
}

init();
