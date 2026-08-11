import express from "express";
import { nanoid } from "nanoid";
import supabase from "../db/client.js";
import { requireAuth } from "../middleware/auth.js";
import { createProblemPage } from "../services/notion.js";
import { createReviewEvent, refreshAccessToken } from "../services/calendar.js";
import { INITIAL_STABILITY, INITIAL_DIFFICULTY } from "../services/sr.js";

const router = express.Router();

// POST /api/submissions
router.post("/", requireAuth, async (req, res) => {
  const {
    problemNumber, problemTitle, titleSlug, difficulty, topics,
    problemUrl, lang, prettyLang, code,
    statusRuntime, statusMemory, runtimePercentile, memoryPercentile,
    dateSolved, notes,
  } = req.body;

  if (!titleSlug) {
    return res.status(400).json({ error: "titleSlug required" });
  }

  const { data: integration } = await supabase
    .from("user_integrations")
    .select("*")
    .eq("user_id", req.userId)
    .single();

  if (!integration?.notion_token || !integration?.notion_database_id) {
    return res.status(400).json({ error: "Notion not configured" });
  }

  const solvedDate = dateSolved ? new Date(dateSolved) : new Date();
  const firstReviewDate = new Date(solvedDate);
  firstReviewDate.setDate(firstReviewDate.getDate() + 1);

  // ── Create Notion page ────────────────────────────────────────────────────

  let notionPageId = null;
  let notionError  = null;
  try {
    const page = await createProblemPage(
      integration.notion_token,
      integration.notion_database_id,
      {
        problemNumber, problemTitle, titleSlug, difficulty, topics,
        problemUrl, lang, prettyLang,
        runtime: statusRuntime, memory: statusMemory,
        runtimePercentile, memoryPercentile,
        code, notes, dateSolved: solvedDate.toISOString(),
        nextReviewDate: firstReviewDate,
      },
      [firstReviewDate]
    );
    notionPageId = page.id;
  } catch (err) {
    notionError = err.message;
    console.error("Notion page creation failed:", err.message);
  }

  // ── Save problem ──────────────────────────────────────────────────────────

  const { data: problem, error: problemError } = await supabase
    .from("problems")
    .insert({
      user_id:             req.userId,
      problem_number:      problemNumber,
      problem_title:       problemTitle || titleSlug,
      title_slug:          titleSlug,
      difficulty,
      topics:              topics || [],
      problem_url:         problemUrl,
      lang,
      code,
      notes:               notes || null,
      runtime:             statusRuntime,
      memory:              statusMemory,
      runtime_percentile:  runtimePercentile,
      memory_percentile:   memoryPercentile,
      date_solved:         solvedDate.toISOString(),
      notion_page_id:      notionPageId,
      next_review_date:    firstReviewDate.toISOString().split("T")[0],
      last_review_date:    solvedDate.toISOString().split("T")[0],
      stability:           INITIAL_STABILITY,
      memory_difficulty:   INITIAL_DIFFICULTY,
    })
    .select("id")
    .single();

  if (problemError) {
    console.error("Problem insert failed:", problemError);
    return res.status(500).json({ error: "Failed to save problem" });
  }

  // ── Create first review record + Calendar event ───────────────────────────

  const reviewToken = nanoid(12);
  const reviewUrl   = `${process.env.APP_URL}/review/${reviewToken}`;

  const { data: review } = await supabase
    .from("reviews")
    .insert({
      problem_id:     problem.id,
      user_id:        req.userId,
      review_number:  1,
      scheduled_date: firstReviewDate.toISOString().split("T")[0],
      review_token:   reviewToken,
    })
    .select("id")
    .single();

  let accessToken = integration.google_access_token;

  if (accessToken && integration.calendar_id) {
    try {
      const event = await createReviewEvent(
        accessToken,
        integration.calendar_id,
        { problemNumber, problemTitle, titleSlug, difficulty, problemUrl },
        firstReviewDate,
        reviewUrl,
        1
      );

      await supabase
        .from("reviews")
        .update({ calendar_event_id: event.id })
        .eq("id", review.id);

    } catch (err) {
      if (err.message.includes("401") && integration.google_refresh_token) {
        try {
          accessToken = await refreshAccessToken(integration.google_refresh_token);
          await supabase
            .from("user_integrations")
            .update({ google_access_token: accessToken })
            .eq("user_id", req.userId);

          const event = await createReviewEvent(
            accessToken,
            integration.calendar_id,
            { problemNumber, problemTitle, titleSlug, difficulty, problemUrl },
            firstReviewDate,
            reviewUrl,
            1
          );

          await supabase
            .from("reviews")
            .update({ calendar_event_id: event.id })
            .eq("id", review.id);

        } catch (refreshErr) {
          console.error("Calendar event failed after token refresh:", refreshErr.message);
        }
      } else {
        console.error("Calendar event failed:", err.message);
      }
    }
  }

  res.status(201).json({
    ok:           true,
    problemId:    problem.id,
    notionSynced: notionPageId !== null,
    notionError:  notionError,
  });
});

export default router;
