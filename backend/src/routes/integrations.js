import express from "express";
import supabase from "../db/client.js";
import { requireAuth } from "../middleware/auth.js";

const router = express.Router();

// ── Notion OAuth ──────────────────────────────────────────────────────────────

const NOTION_AUTH_URL  = "https://api.notion.com/v1/oauth/authorize";
const NOTION_TOKEN_URL = "https://api.notion.com/v1/oauth/token";

// GET /api/integrations/notion/connect  (requires JWT via Authorization header)
// Extension opens this URL in a new tab. We redirect to Notion's consent screen.
router.get("/notion/connect", requireAuth, (req, res) => {
  const params = new URLSearchParams({
    client_id:     process.env.NOTION_CLIENT_ID,
    redirect_uri:  process.env.NOTION_REDIRECT_URI,
    response_type: "code",
    owner:         "user",
    state:         req.userId,
  });

  res.redirect(`${NOTION_AUTH_URL}?${params}`);
});

// GET /api/integrations/notion/callback
// Notion redirects here after the user approves. Exchange code → access token.
router.get("/notion/callback", async (req, res) => {
  const { code, state: userId, error } = req.query;

  if (error || !code) {
    return res.send(renderPage("Connection failed", error || "No code received.", false));
  }

  const credentials = Buffer.from(
    `${process.env.NOTION_CLIENT_ID}:${process.env.NOTION_CLIENT_SECRET}`
  ).toString("base64");

  const tokenRes = await fetch(NOTION_TOKEN_URL, {
    method:  "POST",
    headers: {
      "Content-Type":  "application/json",
      "Authorization": `Basic ${credentials}`,
    },
    body: JSON.stringify({
      grant_type:   "authorization_code",
      code,
      redirect_uri: process.env.NOTION_REDIRECT_URI,
    }),
  });

  if (!tokenRes.ok) {
    const err = await tokenRes.text();
    console.error("Notion token exchange failed:", err);
    return res.send(renderPage("Connection failed", "Could not exchange token. Please try again.", false));
  }

  const { access_token, workspace_name } = await tokenRes.json();

  const { createDatabase } = await import("../services/notion.js");

  // Check if the user already has a database — reuse it if still accessible.
  const { data: existing } = await supabase
    .from("user_integrations")
    .select("notion_database_id")
    .eq("user_id", userId)
    .single();

  let databaseId = null;

  if (existing?.notion_database_id) {
    try {
      const check = await fetch(
        `https://api.notion.com/v1/databases/${existing.notion_database_id}`,
        {
          headers: {
            Authorization: `Bearer ${access_token}`,
            "Notion-Version": "2022-06-28",
          },
        }
      );
      if (check.ok) {
        databaseId = existing.notion_database_id;
        console.log("Reusing existing Notion database:", databaseId);
      }
    } catch (_) {}
  }

  if (!databaseId) {
    try {
      databaseId = await createDatabase(access_token);
    } catch (err) {
      console.error("Auto-create Notion DB failed:", err.message);
      return res.send(renderPage(
        "One more step",
        "Engram couldn't create a database — you may not have selected any pages. Please go back to the extension, click Disconnect, then Connect Notion again and select at least one page (or choose All).",
        false
      ));
    }
  }

  await supabase.from("user_integrations").upsert(
    {
      user_id:             userId,
      notion_token:        access_token,
      notion_database_id:  databaseId,
      updated_at:          new Date().toISOString(),
    },
    { onConflict: "user_id" }
  );

  const isNew = !existing?.notion_database_id || existing.notion_database_id !== databaseId;
  res.send(renderPage(
    "Notion connected!",
    isNew
      ? `Your Engram database has been created in "${workspace_name || "your workspace"}". You can close this tab.`
      : `Reconnected to your existing Engram database in "${workspace_name || "your workspace"}". You can close this tab.`,
    true
  ));
});

// ── Google OAuth ──────────────────────────────────────────────────────────────

const GOOGLE_AUTH_URL  = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_SCOPES = [
  "https://www.googleapis.com/auth/calendar.events",
  "https://www.googleapis.com/auth/calendar.readonly",
].join(" ");

// GET /api/integrations/google/connect
router.get("/google/connect", requireAuth, (req, res) => {
  const params = new URLSearchParams({
    client_id:     process.env.GOOGLE_CLIENT_ID,
    redirect_uri:  process.env.GOOGLE_REDIRECT_URI,
    response_type: "code",
    scope:         GOOGLE_SCOPES,
    access_type:   "offline",
    prompt:        "consent",
    state:         req.userId,
  });

  res.redirect(`${GOOGLE_AUTH_URL}?${params}`);
});

// GET /api/integrations/google/callback
router.get("/google/callback", async (req, res) => {
  const { code, state: userId, error } = req.query;

  if (error || !code) {
    return res.send(renderPage("Connection failed", error || "No code received.", false));
  }

  const tokenRes = await fetch(GOOGLE_TOKEN_URL, {
    method:  "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id:     process.env.GOOGLE_CLIENT_ID,
      client_secret: process.env.GOOGLE_CLIENT_SECRET,
      redirect_uri:  process.env.GOOGLE_REDIRECT_URI,
      grant_type:    "authorization_code",
    }),
  });

  if (!tokenRes.ok) {
    return res.send(renderPage("Connection failed", "Could not exchange token. Please try again.", false));
  }

  const { access_token, refresh_token } = await tokenRes.json();

  await supabase.from("user_integrations").upsert(
    {
      user_id:              userId,
      google_access_token:  access_token,
      google_refresh_token: refresh_token,
      updated_at:           new Date().toISOString(),
    },
    { onConflict: "user_id" }
  );

  res.send(renderPage("Google Calendar connected!", "You can close this tab and return to the extension.", true));
});

// POST /api/integrations/notion/database  — save just the database ID
router.post("/notion/database", requireAuth, async (req, res) => {
  const { notionDatabaseId } = req.body;
  if (!notionDatabaseId) return res.status(400).json({ error: "notionDatabaseId required" });

  const { error } = await supabase.from("user_integrations").upsert(
    { user_id: req.userId, notion_database_id: notionDatabaseId, updated_at: new Date().toISOString() },
    { onConflict: "user_id" }
  );
  if (error) return res.status(500).json({ error: "Failed to save" });
  res.json({ ok: true });
});

// POST /api/integrations/notion/create-database — create a Notion DB via OAuth token
router.post("/notion/create-database", requireAuth, async (req, res) => {
  const { parentPageId } = req.body;
  if (!parentPageId) return res.status(400).json({ error: "parentPageId required" });

  const { data: integration } = await supabase
    .from("user_integrations")
    .select("notion_token")
    .eq("user_id", req.userId)
    .single();

  if (!integration?.notion_token) {
    return res.status(400).json({ error: "Notion not connected" });
  }

  const { createDatabase } = await import("../services/notion.js");
  try {
    const databaseId = await createDatabase(integration.notion_token, parentPageId);
    await supabase.from("user_integrations").upsert(
      { user_id: req.userId, notion_database_id: databaseId, updated_at: new Date().toISOString() },
      { onConflict: "user_id" }
    );
    res.json({ ok: true, databaseId });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Status ────────────────────────────────────────────────────────────────────

// GET /api/integrations/status
router.get("/status", requireAuth, async (req, res) => {
  const { data } = await supabase
    .from("user_integrations")
    .select("notion_token, notion_database_id, google_access_token, calendar_id")
    .eq("user_id", req.userId)
    .single();

  res.json({
    notion:   { connected: !!data?.notion_token, hasDatabaseId: !!data?.notion_database_id },
    calendar: { connected: !!data?.google_access_token, calendarId: data?.calendar_id },
  });
});

// ── HTML helper ───────────────────────────────────────────────────────────────

function renderPage(title, message, success) {
  const color = success ? "#2db55d" : "#ef4444";
  const icon  = success ? "✓" : "✗";
  return `<!DOCTYPE html><html><body style="font-family:-apple-system,sans-serif;text-align:center;padding:80px 20px;background:#0f0f0f;color:#f0f0f0">
    <div style="font-size:48px;margin-bottom:16px;color:${color}">${icon}</div>
    <h2 style="margin-bottom:8px">${title}</h2>
    <p style="color:#888">${message}</p>
  </body></html>`;
}

export default router;
