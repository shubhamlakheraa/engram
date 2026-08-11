const BACKEND_URL = "http://localhost:3000";

chrome.runtime.onInstalled.addListener(({ reason }) => {
  if (reason === "install") {
    chrome.tabs.create({ url: chrome.runtime.getURL("../options/options.html") });
  }
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === "SUBMISSION_ACCEPTED") {
    handleSubmission(message.data);
    sendResponse({ ok: true });
  }

  if (message.type === "LOG_SUBMISSION") {
    logSubmission(message.data).then((result) => sendResponse(result));
    return true;
  }

  if (message.type === "GET_PENDING") {
    chrome.storage.local.get("pendingSubmission", (result) => {
      sendResponse({ data: result.pendingSubmission || null });
    });
    return true;
  }

  if (message.type === "CLEAR_PENDING") {
    chrome.storage.local.remove("pendingSubmission");
    sendResponse({ ok: true });
  }

  if (message.type === "GET_SETTINGS") {
    chrome.storage.local.get("engramSettings", (result) => {
      sendResponse({ data: result.engramSettings || null });
    });
    return true;
  }
});

async function handleSubmission(data) {
  await chrome.storage.local.set({ pendingSubmission: data });

  chrome.notifications.create("engram-submission", {
    type:     "basic",
    iconUrl:  "../icons/icon48.png",
    title:    `Engram: ${data.problemTitle || data.titleSlug} solved!`,
    message:  `${data.statusRuntime} · ${data.statusMemory} — Click the Engram icon to add a note.`,
    priority: 2,
  });
}

async function logSubmission(data) {
  const { engramToken } = await chrome.storage.local.get("engramToken");

  if (!engramToken) {
    return { ok: false, error: "Not logged in. Open Engram options to sign in." };
  }

  try {
    const res = await fetch(`${BACKEND_URL}/api/submissions`, {
      method:  "POST",
      headers: {
        "Content-Type":  "application/json",
        "Authorization": `Bearer ${engramToken}`,
      },
      body: JSON.stringify(data),
    });

    const json = await res.json();
    if (!res.ok) return { ok: false, error: json.error || "Submission failed." };

    await chrome.storage.local.remove("pendingSubmission");
    return {
      ok:           true,
      notionSynced: json.notionSynced,
      notionError:  json.notionError || null,
    };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}
