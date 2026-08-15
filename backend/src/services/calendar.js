const CALENDAR_API = "https://www.googleapis.com/calendar/v3";
const TOKEN_URL = "https://oauth2.googleapis.com/token";

async function getCalendarTimezone(accessToken, calendarId) {
  try {
    const res = await fetch(
      `${CALENDAR_API}/calendars/${encodeURIComponent(calendarId)}`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    if (!res.ok) return "UTC";
    const data = await res.json();
    return data.timeZone || "UTC";
  } catch (_) {
    return "UTC";
  }
}

export async function createReviewEvent(accessToken, calendarId, problem, reviewDate, reviewUrl, reviewNum) {
  const { problemNumber, problemTitle, titleSlug, difficulty } = problem;

  const label = problemNumber
    ? `${problemNumber}. ${problemTitle || titleSlug}`
    : problemTitle || titleSlug;

  const emoji = difficulty === "Easy" ? "🟢" : difficulty === "Hard" ? "🔴" : "🟡";
  const dateStr = new Date(reviewDate).toISOString().split("T")[0];
  const timeZone = await getCalendarTimezone(accessToken, calendarId);

  const event = {
    summary: `${emoji} Engram Review #${reviewNum}: ${label}`,
    description: `Time to review your solution!\n\n👉 ${reviewUrl}\n\nLeetCode: ${problem.problemUrl || ""}`,
    start: { dateTime: `${dateStr}T09:00:00`, timeZone },
    end:   { dateTime: `${dateStr}T09:30:00`, timeZone },
    reminders: {
      useDefault: false,
      overrides: [
        { method: "popup", minutes: 0 },   // notification at 9 AM on review day
        { method: "email", minutes: 120 }, // email 2 hours before as backup
      ],
    },
    colorId: "5",
  };

  const res = await fetch(
    `${CALENDAR_API}/calendars/${encodeURIComponent(calendarId)}/events`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(event),
    }
  );

  if (!res.ok) {
    const err = await res.json();
    throw new Error(`Calendar error ${res.status}: ${JSON.stringify(err)}`);
  }

  return res.json();
}

export async function deleteEvent(accessToken, calendarId, eventId) {
  await fetch(
    `${CALENDAR_API}/calendars/${encodeURIComponent(calendarId)}/events/${eventId}`,
    {
      method: "DELETE",
      headers: { Authorization: `Bearer ${accessToken}` },
    }
  );
}

export async function refreshAccessToken(refreshToken) {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id:     process.env.GOOGLE_CLIENT_ID,
      client_secret: process.env.GOOGLE_CLIENT_SECRET,
      refresh_token: refreshToken,
      grant_type:    "refresh_token",
    }),
  });

  if (!res.ok) throw new Error("Failed to refresh Google token");
  const data = await res.json();
  return data.access_token;
}
