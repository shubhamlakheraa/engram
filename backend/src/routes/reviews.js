import express from "express";
import supabase from "../db/client.js";
import { fsrs, RECALL_QUALITY } from "../services/sr.js";
import { updateReviewState } from "../services/notion.js";
import { createReviewEvent, refreshAccessToken } from "../services/calendar.js";
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
        difficulty, lang, code, notes, problem_url, topics,
        stability, memory_difficulty, last_review_date, date_solved
      )
    `)
    .eq("review_token", token)
    .single();

  if (!review) {
    return res.status(404).send(renderError("Review link not found or expired."));
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

  if (!review)                  return res.status(404).json({ error: "Review not found" });
  if (review.completed_date)    return res.status(409).json({ error: "Already completed" });

  const problem = review.problems;
  const rating  = RECALL_QUALITY[quality]; // "good" | "hard" | "again"

  // Days elapsed since last review (or date_solved for review #1)
  const lastDate   = problem.last_review_date || problem.date_solved;
  const elapsedMs  = Date.now() - new Date(lastDate).getTime();
  const elapsedDays = Math.max(1, Math.round(elapsedMs / (1000 * 60 * 60 * 24)));

  const { stability, difficulty, intervalDays, nextReviewDate } = fsrs(
    rating,
    problem.stability    ?? 1.0,
    problem.memory_difficulty ?? 7.2102,
    elapsedDays
  );

  // Load user integrations
  const { data: integration } = await supabase
    .from("user_integrations")
    .select("*")
    .eq("user_id", review.user_id)
    .single();

  // Mark review complete
  await supabase
    .from("reviews")
    .update({
      completed_date:     new Date().toISOString(),
      recall_quality:     quality,           // "clean" | "hints" | "blank"
      next_interval_days: intervalDays,
    })
    .eq("id", review.id);

  // Update problem FSRS state
  await supabase
    .from("problems")
    .update({
      stability,
      memory_difficulty:  difficulty,
      last_review_date:   new Date().toISOString().split("T")[0],
      next_review_date:   nextReviewDate.toISOString().split("T")[0],
    })
    .eq("id", problem.id);

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
        stability,
      });
    } catch (err) {
      console.error("Notion update failed:", err.message);
    }
  }

  // Create next review row
  const newReviewToken = nanoid(12);
  const reviewUrl = `${process.env.APP_URL}/review/${newReviewToken}`;

  const { data: newReview } = await supabase
    .from("reviews")
    .insert({
      problem_id:     problem.id,
      user_id:        review.user_id,
      review_number:  review.review_number + 1,
      scheduled_date: nextReviewDate.toISOString().split("T")[0],
      review_token:   newReviewToken,
    })
    .select("id")
    .single();

  // Schedule next Calendar event
  if (integration?.google_access_token && integration?.calendar_id) {
    let accessToken = integration.google_access_token;

    const scheduleEvent = async (token) => {
      const event = await createReviewEvent(
        token, integration.calendar_id,
        problem, nextReviewDate, reviewUrl, review.review_number + 1
      );
      await supabase
        .from("reviews")
        .update({ calendar_event_id: event.id })
        .eq("id", newReview.id);
    };

    try {
      await scheduleEvent(accessToken);
    } catch (err) {
      if (err.message.includes("401") && integration.google_refresh_token) {
        try {
          accessToken = await refreshAccessToken(integration.google_refresh_token);
          await supabase
            .from("user_integrations")
            .update({ google_access_token: accessToken })
            .eq("user_id", review.user_id);
          await scheduleEvent(accessToken);
        } catch (e) {
          console.error("Calendar scheduling failed after refresh:", e.message);
        }
      } else {
        console.error("Calendar scheduling failed:", err.message);
      }
    }
  }

  res.json({ ok: true, nextReviewDate, intervalDays, stability });
});

// ── HTML renderers ────────────────────────────────────────────────────────────

function renderReviewPage(review, token) {
  const p        = review.problems;
  const diff     = (p.difficulty || "").toLowerCase();
  const diffColor = diff === "easy" ? "#2db55d" : diff === "hard" ? "#ef4444" : "#f59e0b";
  const title    = p.problem_number
    ? `${p.problem_number}. ${p.problem_title}`
    : p.problem_title || p.title_slug;

  const notesHtml = p.notes
    ? `<p class="notes-text">${escapeHtml(p.notes)}</p>`
    : `<p class="notes-placeholder">No notes saved for this problem.</p>`;

  const codeHtml = p.code
    ? `<pre class="code">${escapeHtml(p.code)}</pre>`
    : `<p class="no-code">Solution not available.</p>`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Engram Review — ${escapeHtml(title)}</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

    body {
      background: #0f0f0f; color: #f0f0f0;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      min-height: 100vh; padding: 48px 20px 80px;
    }
    .container { max-width: 720px; margin: 0 auto; }

    .logo { font-size: 11px; font-weight: 700; letter-spacing: .15em;
            text-transform: uppercase; color: #7c6af7; margin-bottom: 36px; }

    /* ── Problem header ── */
    .badge { display: inline-block; font-size: 11px; font-weight: 600;
             padding: 3px 10px; border-radius: 999px;
             background: ${diffColor}22; color: ${diffColor};
             text-transform: uppercase; letter-spacing: .05em; margin-bottom: 10px; }
    h1 { font-size: 22px; font-weight: 700; margin-bottom: 6px; }
    .meta { font-size: 13px; color: #666; }
    .meta a { color: #7c6af7; text-decoration: none; }
    .meta a:hover { text-decoration: underline; }

    /* ── Recall prompt ── */
    .recall-prompt { margin: 32px 0 24px; padding: 20px 24px;
                     background: #141416; border: 1px solid #2a2a2a; border-radius: 10px; }
    .recall-prompt p { font-size: 14px; color: #888; line-height: 1.6; }
    .recall-prompt strong { color: #ccc; }

    /* ── Section ── */
    .section { margin-top: 28px; }
    .section-title { font-size: 11px; font-weight: 700; text-transform: uppercase;
                     letter-spacing: .1em; color: #444; margin-bottom: 12px; }

    /* ── Notes ── */
    .notes-text { font-size: 14px; line-height: 1.7; color: #ccc;
                  padding: 16px 20px; background: #141416;
                  border: 1px solid #2a2a2a; border-radius: 8px; white-space: pre-wrap; }
    .notes-placeholder { font-size: 14px; color: #555; font-style: italic;
                         padding: 14px 20px; background: #141416;
                         border: 1px solid #222; border-radius: 8px; }

    /* ── Code ── */
    .code { background: #141416; border: 1px solid #2a2a2a; border-radius: 8px;
            padding: 20px; font-family: "SF Mono","Fira Code",monospace;
            font-size: 13px; line-height: 1.6; overflow-x: auto;
            white-space: pre-wrap; color: #e0e0e0; }

    /* ── Buttons ── */
    .btn { display: inline-flex; align-items: center; gap: 6px;
           padding: 10px 18px; border-radius: 8px; font-size: 14px;
           font-weight: 600; cursor: pointer; border: none;
           transition: opacity .15s, transform .1s; }
    .btn:hover { opacity: .85; }
    .btn:active { transform: scale(.97); }

    .btn-ghost { background: transparent; border: 1px solid #333; color: #aaa; }
    .btn-ghost:hover { border-color: #555; color: #eee; opacity: 1; }

    .btn-primary { background: #7c6af7; color: #fff; }

    /* ── Rating row ── */
    .rating-row { display: flex; gap: 10px; flex-wrap: wrap; }
    .btn-rate { flex: 1; min-width: 120px; padding: 14px 16px;
                border-radius: 8px; font-size: 13px; font-weight: 600;
                cursor: pointer; border: 2px solid transparent;
                transition: opacity .15s, border-color .15s, transform .1s; }
    .btn-rate:active { transform: scale(.97); }
    .btn-rate:hover { opacity: .85; }

    .btn-clean { background: #2db55d22; color: #2db55d; border-color: #2db55d44; }
    .btn-hints { background: #f59e0b22; color: #f59e0b; border-color: #f59e0b44; }
    .btn-blank { background: #ef444422; color: #ef4444; border-color: #ef444444; }

    .btn-rate.selected { border-width: 2px; filter: brightness(1.3); }
    .btn-clean.selected { border-color: #2db55d; background: #2db55d33; }
    .btn-hints.selected { border-color: #f59e0b; background: #f59e0b33; }
    .btn-blank.selected { border-color: #ef4444; background: #ef444433; }

    .btn-confirm { margin-top: 14px; width: 100%; padding: 14px;
                   background: #7c6af7; color: #fff; border: none;
                   border-radius: 8px; font-size: 14px; font-weight: 700;
                   cursor: pointer; transition: opacity .15s; }
    .btn-confirm:hover { opacity: .85; }
    .btn-confirm:disabled { opacity: .35; cursor: not-allowed; }

    /* ── Phase reveal actions ── */
    .reveal-actions { display: flex; gap: 10px; margin-top: 20px; flex-wrap: wrap; }

    /* ── Divider ── */
    hr { border: none; border-top: 1px solid #1e1e1e; margin: 32px 0; }

    /* ── Result ── */
    .result { display: none; text-align: center; padding: 48px 20px; }
    .result-icon { font-size: 40px; margin-bottom: 16px; }
    .result h2 { font-size: 20px; margin-bottom: 8px; }
    .result p { color: #666; font-size: 14px; }
    .result .next { color: #7c6af7; font-weight: 600; }

    .error-inline { color: #ef4444; font-size: 13px; margin-top: 10px; display: none; }

    .hidden { display: none !important; }
  </style>
</head>
<body>
  <div class="container">
    <div class="logo">engram</div>

    <!-- ── Problem header (always visible) ── -->
    <div class="badge">${p.difficulty || "Unknown"}</div>
    <h1>${escapeHtml(title)}</h1>
    <p class="meta">
      ${escapeHtml(p.lang || "")}
      ${p.problem_url ? `· <a href="${escapeHtml(p.problem_url)}" target="_blank" rel="noopener">View on LeetCode ↗</a>` : ""}
    </p>

    <!-- ── Phase 1: Recall prompt ── -->
    <div id="phase-recall">
      <div class="recall-prompt">
        <p><strong>Try to recall the approach before revealing anything.</strong><br>
        Open LeetCode and attempt the problem, or think through the solution in your head.</p>
      </div>

      <div class="reveal-actions">
        <button class="btn btn-ghost" onclick="revealHint()">Show my notes →</button>
        <button class="btn btn-primary" onclick="iRememberedIt()">I remembered it ✓</button>
      </div>
    </div>

    <!-- ── Phase 2: Hint (notes) ── -->
    <div id="phase-hint" class="hidden">
      <div class="section">
        <div class="section-title">Your notes</div>
        ${notesHtml}
      </div>

      <div class="reveal-actions" style="margin-top: 16px;">
        <button class="btn btn-ghost" onclick="revealSolution()">Show full solution →</button>
      </div>
    </div>

    <!-- ── Phase 3: Full solution ── -->
    <div id="phase-solution" class="hidden">
      <div class="section">
        <div class="section-title">Your solution</div>
        ${codeHtml}
      </div>
    </div>

    <!-- ── Rating section (appears after any reveal) ── -->
    <div id="rating-section" class="hidden">
      <hr>
      <div class="section-title">How did it go?</div>
      <div class="rating-row">
        <button id="btn-clean" class="btn-rate btn-clean" onclick="selectRating('clean')">✓ Got it clean</button>
        <button id="btn-hints" class="btn-rate btn-hints" onclick="selectRating('hints')">~ Needed hints</button>
        <button id="btn-blank" class="btn-rate btn-blank" onclick="selectRating('blank')">✗ Blanked</button>
      </div>
      <button id="btn-confirm" class="btn-confirm" onclick="submitRating()" disabled>Log this review</button>
      <p id="rating-error" class="error-inline"></p>
    </div>

    <!-- ── Result ── -->
    <div class="result" id="result">
      <div class="result-icon">✓</div>
      <h2>Review logged</h2>
      <p>Next review: <span class="next" id="result-next"></span></p>
    </div>
  </div>

  <script>
    let selectedQuality = null;

    function revealHint() {
      document.getElementById('phase-hint').classList.remove('hidden');
      document.getElementById('phase-recall').querySelector('.reveal-actions').innerHTML =
        '<button class="btn btn-ghost" onclick="revealSolution()">Show full solution →</button>';
      showRating('hints');
    }

    function revealSolution() {
      document.getElementById('phase-hint').classList.remove('hidden');
      document.getElementById('phase-solution').classList.remove('hidden');
      // Hide any intermediate reveal buttons
      const hintActions = document.getElementById('phase-hint').querySelector('.reveal-actions');
      if (hintActions) hintActions.style.display = 'none';
      const recallActions = document.getElementById('phase-recall').querySelector('.reveal-actions');
      if (recallActions) recallActions.style.display = 'none';
      showRating('blank');
    }

    function iRememberedIt() {
      document.getElementById('phase-recall').querySelector('.reveal-actions').style.display = 'none';
      showRating('clean');
    }

    function showRating(preselect) {
      document.getElementById('rating-section').classList.remove('hidden');
      selectRating(preselect);
      document.getElementById('rating-section').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }

    function selectRating(quality) {
      selectedQuality = quality;
      document.querySelectorAll('.btn-rate').forEach(btn => btn.classList.remove('selected'));
      document.getElementById('btn-' + quality).classList.add('selected');
      document.getElementById('btn-confirm').disabled = false;
    }

    async function submitRating() {
      if (!selectedQuality) return;

      const confirmBtn = document.getElementById('btn-confirm');
      const errorEl    = document.getElementById('rating-error');
      confirmBtn.disabled = true;
      confirmBtn.textContent = 'Logging…';
      errorEl.style.display = 'none';

      try {
        const res = await fetch('/api/reviews/${token}/complete', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ quality: selectedQuality }),
        });

        const data = await res.json();

        if (res.status === 409) {
          // Already completed in another tab — show done state
          document.getElementById('rating-section').style.display = 'none';
          showResult('Already logged');
          return;
        }

        if (!res.ok) {
          errorEl.textContent = data.error || 'Something went wrong. Please try again.';
          errorEl.style.display = 'block';
          confirmBtn.disabled = false;
          confirmBtn.textContent = 'Log this review';
          return;
        }

        const next = new Date(data.nextReviewDate).toLocaleDateString('en-US', {
          weekday: 'long', month: 'long', day: 'numeric',
        });
        showResult(next);

      } catch (err) {
        errorEl.textContent = 'Network error. Check your connection and try again.';
        errorEl.style.display = 'block';
        confirmBtn.disabled = false;
        confirmBtn.textContent = 'Log this review';
      }
    }

    function showResult(nextDateStr) {
      document.getElementById('phase-recall').style.display = 'none';
      document.getElementById('phase-hint').style.display = 'none';
      document.getElementById('phase-solution').style.display = 'none';
      document.getElementById('rating-section').style.display = 'none';
      document.getElementById('result-next').textContent = nextDateStr;
      document.getElementById('result').style.display = 'block';
    }
  </script>
</body>
</html>`;
}

function renderAlreadyDone(problem) {
  const title = problem?.problem_number
    ? `${problem.problem_number}. ${problem.problem_title}`
    : problem?.problem_title || "this problem";

  return `<!DOCTYPE html>
<html>
<body style="font-family:-apple-system,sans-serif;text-align:center;padding:80px 20px;background:#0f0f0f;color:#f0f0f0">
  <div style="font-size:40px;margin-bottom:16px;color:#2db55d">✓</div>
  <h2 style="margin-bottom:8px">Already reviewed</h2>
  <p style="color:#666">You already completed this review for <strong style="color:#ccc">${escapeHtml(title)}</strong>.</p>
</body>
</html>`;
}

function renderError(msg) {
  return `<!DOCTYPE html>
<html>
<body style="font-family:-apple-system,sans-serif;text-align:center;padding:80px 20px;background:#0f0f0f;color:#f0f0f0">
  <div style="font-size:40px;margin-bottom:16px;color:#ef4444">✗</div>
  <h2 style="margin-bottom:8px">Not found</h2>
  <p style="color:#666">${escapeHtml(msg)}</p>
</body>
</html>`;
}

function escapeHtml(str) {
  return String(str || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export default router;
