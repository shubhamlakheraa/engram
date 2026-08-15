import "dotenv/config";
import express from "express";
import cors from "cors";
import authRoutes from "./routes/auth.js";
import submissionRoutes from "./routes/submissions.js";
import reviewRoutes from "./routes/reviews.js";
import integrationRoutes from "./routes/integrations.js";

const app = express();

app.use(cors({
    origin: true
}));
app.use(express.json());

// Health check
app.get("/health", (_req, res) => res.json({ ok: true }));

// Privacy policy
app.get("/privacy", (_req, res) => {
  res.setHeader("Content-Type", "text/html");
  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Privacy Policy — Engram</title>
  <style>
    body { max-width: 680px; margin: 60px auto; padding: 0 20px 80px;
           font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
           font-size: 16px; line-height: 1.7; color: #1a1a1a; }
    h1 { font-size: 26px; margin-bottom: 4px; }
    h2 { font-size: 17px; margin-top: 36px; margin-bottom: 8px; }
    .meta { color: #888; font-size: 14px; margin-bottom: 40px; }
    ul { padding-left: 20px; }
    li { margin-bottom: 6px; }
    a { color: #7c6af7; }
  </style>
</head>
<body>
  <h1>Privacy Policy — Engram</h1>
  <p class="meta">Last updated: 2026-08-15</p>

  <p>Engram is a Chrome extension that automatically logs your LeetCode solutions and schedules spaced repetition reviews using the FSRS algorithm.</p>

  <h2>What data Engram collects</h2>
  <p>Engram collects only the data necessary to operate the spaced repetition system:</p>
  <ul>
    <li><strong>Email address</strong> — used to create and identify your Engram account</li>
    <li><strong>LeetCode submission data</strong> — problem title, number, difficulty, topics, your solution code, runtime, memory usage, and the date you solved it</li>
    <li><strong>Notes</strong> — the optional quick note you add when logging a problem</li>
  </ul>
  <p>This data is transmitted to Engram's backend server and stored in a private Supabase database accessible only to your account.</p>

  <h2>What Engram shares with third parties</h2>
  <p>Engram integrates with two optional third-party services, both requiring your explicit authorization:</p>
  <ul>
    <li><strong>Notion</strong> — if you connect your Notion account, Engram creates a database page for each problem you log. This sends your submission data to Notion's servers. You can disconnect at any time from the Settings page.</li>
    <li><strong>Google Calendar</strong> — if you connect your Google account, Engram creates calendar events for scheduled reviews. This sends problem titles and review dates to Google's servers. You can disconnect at any time from the Settings page.</li>
  </ul>
  <p>Neither integration is required. If you don't connect them, no data is sent to Notion or Google.</p>

  <h2>What data Engram does NOT collect</h2>
  <ul>
    <li>No analytics or telemetry</li>
    <li>No crash reports</li>
    <li>No browsing history</li>
    <li>No data from any website other than LeetCode submission results</li>
  </ul>

  <h2>Permissions used</h2>
  <ul>
    <li><strong>storage</strong> — stores your login token and settings locally in Chrome</li>
    <li><strong>identity</strong> — used for Google Calendar OAuth</li>
    <li><strong>notifications</strong> — alerts you when a LeetCode submission is accepted</li>
    <li><strong>alarms</strong> — reserved for future scheduled review reminders</li>
    <li><strong>leetcode.com</strong> — reads submission results to capture solve data</li>
    <li><strong>api.notion.com</strong> — creates and updates problem pages in your Notion workspace</li>
    <li><strong>googleapis.com</strong> — creates Google Calendar review events</li>
    <li><strong>engram-ijh1.onrender.com</strong> — communicates with Engram's backend for authentication and data storage</li>
  </ul>

  <h2>Data deletion</h2>
  <p>You can delete your data by contacting us. Uninstalling the extension removes all locally stored data automatically.</p>

  <h2>Changes to this policy</h2>
  <p>If data practices change, this document will be updated with a new "Last updated" date.</p>

  <h2>Contact</h2>
  <p>Questions or concerns: <a href="mailto:lakherashubham.dev@gmail.com">lakherashubham.dev@gmail.com</a></p>
</body>
</html>`);
});

// Routes
app.use("/api/auth", authRoutes);
app.use("/api/submissions", submissionRoutes);
app.use("/api/integrations", integrationRoutes);
app.use("/review", reviewRoutes);          // review page — no /api prefix (user-facing URL)
app.use("/api/reviews", reviewRoutes);          // review completion endpoint

const PORT = process.env.PORT || 3000;
app.listen(PORT, "0.0.0.0", () => {
    console.log(`Engram backend running on port ${PORT}`);
});
