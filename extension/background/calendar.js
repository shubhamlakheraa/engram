/**
 * Google Calendar integration.
 *
 * Uses chrome.identity to get an OAuth2 token (no backend needed).
 * Creates one calendar event per review date, each linking back to the Notion page.
 */

const CALENDAR_API = "https://www.googleapis.com/calendar/v3";

/**
 * @param {string} calendarId    - e.g. "primary" or a specific calendar ID
 * @param {object} submission    - problem data
 * @param {Date[]} reviewDates   - array of scheduled review dates
 * @param {string} [notionUrl]   - optional link to the Notion page
 */
export async function scheduleCalendarEvents(
  calendarId,
  submission,
  reviewDates,
  notionUrl = ""
) {
  const token = await getAuthToken();

  const { problemNumber, problemTitle, titleSlug, difficulty } = submission;
  const label = problemNumber
    ? `${problemNumber}. ${problemTitle || titleSlug}`
    : problemTitle || titleSlug;

  const difficultyEmoji =
    difficulty === "Easy" ? "🟢" : difficulty === "Hard" ? "🔴" : "🟡";

  const results = [];

  for (let i = 0; i < reviewDates.length; i++) {
    const date = reviewDates[i];
    const reviewNum = i + 1;

    const event = buildEvent(
      `${difficultyEmoji} Engram Review #${reviewNum}: ${label}`,
      `Review your solution for ${label}.\n\n${notionUrl ? `Notion: ${notionUrl}\n` : ""}LeetCode: ${submission.problemUrl || ""}\n\nDifficulty: ${difficulty || "Unknown"} · Language: ${submission.prettyLang || submission.lang || ""}`,
      date
    );

    const res = await fetch(
      `${CALENDAR_API}/calendars/${encodeURIComponent(calendarId)}/events`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(event),
      }
    );

    if (!res.ok) {
      const err = await res.json();
      console.error(`Engram: Calendar event ${reviewNum} failed`, err);
      continue;
    }

    results.push(await res.json());
  }

  return results;
}

function buildEvent(title, description, date) {
  // All-day event on the review date
  const dateStr = date.toISOString().split("T")[0];

  return {
    summary: title,
    description,
    start: { date: dateStr },
    end: { date: dateStr },
    reminders: {
      useDefault: false,
      overrides: [
        { method: "popup", minutes: 0 }, // reminder at start of day
      ],
    },
    colorId: "5", // banana yellow — stands out but not alarming
  };
}

/**
 * Gets an OAuth2 access token using chrome.identity.
 * Prompts the user to log in if not already authenticated.
 */
function getAuthToken() {
  return new Promise((resolve, reject) => {
    chrome.identity.getAuthToken({ interactive: true }, (token) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
      } else {
        resolve(token);
      }
    });
  });
}

/**
 * Lists the user's calendars — used in options page for picker.
 */
export async function listCalendars() {
  const token = await getAuthToken();

  const res = await fetch(`${CALENDAR_API}/users/me/calendarList`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) throw new Error(`Calendar API error: ${res.status}`);
  const data = await res.json();
  return data.items || [];
}
