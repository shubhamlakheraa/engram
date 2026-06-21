/**
 * Background service worker — the brain of Engram.
 *
 * Responsibilities:
 *  1. Receive SUBMISSION_ACCEPTED from bridge.js
 *  2. Store submission in chrome.storage temporarily (survives SW sleep)
 *  3. Show a notification so the user knows something was captured
 *  4. On popup "Log It" confirmation: create Notion page + Google Calendar events
 */

import { createNotionPage } from "./notion.js";
import { scheduleCalendarEvents } from "./calendar.js";
import { computeInitialIntervals } from "./spaced-repetition.js";

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === "SUBMISSION_ACCEPTED") {
    handleSubmission(message.data);
    sendResponse({ ok: true });
  }

  if (message.type === "LOG_SUBMISSION") {
    logSubmission(message.data);
    sendResponse({ ok: true });
  }

  if (message.type === "GET_PENDING") {
    chrome.storage.local.get("pendingSubmission", (result) => {
      sendResponse({ data: result.pendingSubmission || null });
    });
    return true; // keep channel open for async sendResponse
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
  // Save to storage — popup will read this when it opens
  await chrome.storage.local.set({ pendingSubmission: data });

  // Show a browser notification
  chrome.notifications.create("engram-submission", {
    type: "basic",
    iconUrl: "../icons/icon48.png",
    title: `Engram: ${data.problemTitle || data.titleSlug} solved!`,
    message: `${data.statusRuntime} · ${data.statusMemory} — Click the Engram icon to add a note.`,
    priority: 2,
  });
}

async function logSubmission(data) {
  const settings = await getSettings();

  if (!settings?.notionApiKey || !settings?.notionDatabaseId) {
    console.error("Engram: Notion not configured. Open options to set up.");
    return;
  }

  const reviewDates = computeInitialIntervals(new Date(data.dateSolved));

  try {
    await createNotionPage(settings.notionApiKey, settings.notionDatabaseId, {
      ...data,
      reviewDates,
      nextReviewDate: reviewDates[0],
    });
  } catch (err) {
    console.error("Engram: Failed to create Notion page", err);
  }

  if (settings?.calendarEnabled && settings?.calendarId) {
    try {
      await scheduleCalendarEvents(settings.calendarId, data, reviewDates);
    } catch (err) {
      console.error("Engram: Failed to schedule calendar events", err);
    }
  }

  await chrome.storage.local.remove("pendingSubmission");
}

function getSettings() {
  return new Promise((resolve) => {
    chrome.storage.local.get("engramSettings", (result) => {
      resolve(result.engramSettings || null);
    });
  });
}
