import express from "express";
import supabase from "../db/client.js";
import { sm2, RECALL_QUALITY } from "../services/sr.js";
import { updateReviewState } from "../services/notion.js";
import { createReviewEvent, deleteEvent, refreshAccessToken } from "../services/calendar.js";
import { nanoid } from "nanoid";

const router = express.Router();

// GET /review/:token — serve the review page
router.get("/:token", async (req, res) => {
  const { token } = req.params;

  const { data: review } = await supabase
    .from("reviews")
    .select(`
      *,
      problems (
        problem_number, problem_title, title_slug,
        difficulty, lang, code, problem_url, topics,
        ease_factor, interval_days, repetitions
      )
    `)
    .eq("review_token", token)
    .single();

  if (!review) {
    return res.status(404).send(renderError("Review not found or already completed."));
  }

  if (review.completed_date) {
    return res.send(renderAlreadyDone(review.problems));
  }

  res.send(renderReviewPage(review, token));
});

// POST /api/reviews/:token/complete — user submits recall quality
router.post("/:token/complete", async (req, res) => {
  const { token } = req.params;
  const { quality } = req.body; // "clean" | "hints" | "blank"

  if (!["clean", "hints", "blank"].includes(quality)) {
    return res.status(400).json({ error: "quality must be clean, hints, or blank" });
  }

  const { data: review } = await supabase
    .from("reviews")
    .select(`*, problems(*), users(id)`)
    .eq("review_token", token)
    .single();

  if (!review) return res.status(404).json({ error: "Review not found" });
  if (review.completed_date) return res.status(409).json({ error: "Already completed" });

  const problem = review.problems;
  const qualityScore = RECALL_QUALITY[quality];

  // Run SM-2
  const { repetitions, easeFactor, interval, nextReviewDate } = sm2(
    qualityScore,
    problem.repetitions,
    problem.ease_factor,
    problem.interval_days
  );

  // Get user integrations
  const { data: integration } = await supabase
    .from("user_integrations")
    .select("*")
    .eq("user_id", review.user_id)
    .single();

  // Mark review complete
  await supabase
    .from("reviews")
    .update({
      completed_date:    new Date().toISOString(),
      recall_quality:    qualityScore,
      next_interval_days: interval,
    })
    .eq("id", review.id);

  // Update problem SM-2 state
  const { data: updatedProblem } = await supabase
    .from("problems")
    .update({
      repetitions,
      ease_factor:      easeFactor,
      interval_days:    interval,
      next_review_date: nextReviewDate.toISOString().split("T")[0],
    })
    .eq("id", problem.id)
    .select("id")
    .single();

  // Get total completed reviews for Notion review count
  const { count } = await supabase
    .from("reviews")
    .select("*", { count: "exact", head: true })
    .eq("problem_id", problem.id)
    .not("completed_date", "is", null);

  // Update Notion page
  if (integration?.notion_token && problem.notion_page_id) {
    try {
      await updateReviewState(integration.notion_token, problem.notion_page_id, {
        nextReviewDate,
        reviewCount: count,
        easeFactor,
      });
    } catch (err) {
      console.error("Notion update failed:", err.message);
    }
  }

  // Always create the next review row in DB
  const newReviewToken = nanoid(12);
  const reviewUrl = `${process.env.APP_URL}/review/${newReviewToken}`;

  const { data: newReview } = await supabase.from("reviews").insert({
    problem_id:     problem.id,
    user_id:        review.user_id,
    review_number:  review.review_number + 1,
    scheduled_date: nextReviewDate.toISOString().split("T")[0],
    review_token:   newReviewToken,
  }).select("id").single();

  // Schedule Calendar event if configured (optional)
  if (integration?.google_access_token && integration?.calendar_id) {
    let accessToken = integration.google_access_token;

    try {
      const event = await createReviewEvent(
        accessToken, integration.calendar_id,
        problem, nextReviewDate, reviewUrl, review.review_number + 1
      );

      await supabase.from("reviews")
        .update({ calendar_event_id: event.id })
        .eq("id", newReview.id);

    } catch (err) {
      if (err.message.includes("401") && integration.google_refresh_token) {
        try {
          accessToken = await refreshAccessToken(integration.google_refresh_token);
          await supabase.from("user_integrations")
            .update({ google_access_token: accessToken })
            .eq("user_id", review.user_id);

          const event = await createReviewEvent(
            accessToken, integration.calendar_id,
            problem, nextReviewDate, reviewUrl, review.review_number + 1
          );

          await supabase.from("reviews")
            .update({ calendar_event_id: event.id })
            .eq("id", newReview.id);
        } catch (e) {
          console.error("Calendar scheduling failed:", e.message);
        }
      }
    }
  }

  res.json({ ok: true, nextReviewDate, interval, easeFactor });
});

// ── HTML renderers ────────────────────────────────────────────────────────────

function renderReviewPage(review, token) {
  const p = review.problems;
  const diff = (p.difficulty || "").toLowerCase();
  const diffColor = diff === "easy" ? "#2db55d" : diff === "hard" ? "#ef4444" : "#f59e0b";

  const codeHtml = p.code
    ? `<pre class="code">${escapeHtml(p.code)}</pre>`
    : `<p class="no-code">Solution not available.</p>`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Engram Review</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body { background: #0f0f0f; color: #f0f0f0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; min-height: 100vh; padding: 40px 20px; }
    .container { max-width: 720px; margin: 0 auto; }
    .logo { font-size: 11px; font-weight: 700; letter-spacing: .15em; text-transform: uppercase; color: #7c6af7; margin-bottom: 32px; }
    .header { margin-bottom: 24px; }
    .badge { display: inline-block; font-size: 11px; font-weight: 600; padding: 3px 10px; border-radius: 999px; background: ${diffColor}22; color: ${diffColor}; text-transform: uppercase; letter-spacing: .05em; margin-bottom: 10px; }
    h1 { font-size: 22px; font-weight: 700; margin-bottom: 4px; }
    .meta { font-size: 13px; color: #666; }
    .section-title { font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: .08em; color: #555; margin: 28px 0 12px; }
    .code { background: #1a1a1a; border: 1px solid #2a2a2a; border-radius: 8px; padding: 20px; font-family: "SF Mono", "Fira Code", monospace; font-size: 13px; line-height: 1.6; overflow-x: auto; white-space: pre-wrap; color: #e0e0e0; }
    .divider { border: none; border-top: 1px solid #1e1e1e; margin: 32px 0; }
    .question { font-size: 17px; font-weight: 600; text-align: center; margin-bottom: 20px; }
    .buttons { display: flex; gap: 12px; justify-content: center; }
    .btn { flex: 1; max-width: 180px; padding: 14px 20px; border: none; border-radius: 8px; font-size: 14px; font-weight: 600; cursor: pointer; transition: opacity .15s; }
    .btn:hover { opacity: .85; }
    .btn-clean { background: #2db55d; color: #fff; }
    .btn-hints { background: #f59e0b; color: #000; }
    .btn-blank { background: #ef4444; color: #fff; }
    .result { display: none; text-align: center; padding: 40px 20px; }
    .result h2 { font-size: 20px; margin-bottom: 8px; }
    .result p { color: #888; font-size: 14px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="logo">engram</div>

    <div class="header">
      <div class="badge">${p.difficulty || "Unknown"}</div>
      <h1>${escapeHtml(p.problem_number ? `${p.problem_number}. ${p.problem_title}` : p.problem_title)}</h1>
      <p class="meta">${escapeHtml(p.lang || "")} · <a href="${p.problem_url || "#"}" target="_blank" style="color:#7c6af7">View on LeetCode</a></p>
    </div>

    <div class="section-title">Your Solution</div>
    ${codeHtml}

    <hr class="divider">

    <div id="review-form">
      <p class="question">How well did you remember the approach?</p>
      <div class="buttons">
        <button class="btn btn-clean" onclick="submit('clean')">✓ Clean</button>
        <button class="btn btn-hints" onclick="submit('hints')">~ Needed hints</button>
        <button class="btn btn-blank" onclick="submit('blank')">✗ Blanked</button>
      </div>
    </div>

    <div class="result" id="result">
      <h2 id="result-title"></h2>
      <p id="result-msg"></p>
    </div>
  </div>

  <script>
    async function submit(quality) {
      document.getElementById('review-form').style.display = 'none';

      const res = await fetch('/api/reviews/${token}/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ quality }),
      });

      const data = await res.json();
      const el = document.getElementById('result');
      el.style.display = 'block';

      if (res.ok) {
        const next = new Date(data.nextReviewDate).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
        document.getElementById('result-title').textContent = 'Logged ✓';
        document.getElementById('result-msg').textContent = 'Next review scheduled for ' + next + '. Calendar event added.';
      } else {
        document.getElementById('result-title').textContent = 'Something went wrong';
        document.getElementById('result-msg').textContent = data.error || 'Please try again.';
      }
    }
  </script>
</body>
</html>`;
}

function renderAlreadyDone(problem) {
  return `<!DOCTYPE html><html><body style="font-family:sans-serif;text-align:center;padding:60px;background:#0f0f0f;color:#f0f0f0">
    <h2>Already completed ✓</h2>
    <p style="color:#888">You already reviewed ${escapeHtml(problem?.problem_title || "this problem")}.</p>
  </body></html>`;
}

function renderError(msg) {
  return `<!DOCTYPE html><html><body style="font-family:sans-serif;text-align:center;padding:60px;background:#0f0f0f;color:#f0f0f0">
    <h2>Not found</h2><p style="color:#888">${escapeHtml(msg)}</p>
  </body></html>`;
}

function escapeHtml(str) {
  return String(str || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export default router;
