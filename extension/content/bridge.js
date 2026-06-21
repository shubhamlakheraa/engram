/**
 * Runs in ISOLATED world (extension context).
 * Receives postMessage events from page-interceptor.js and forwards
 * them to the background service worker via chrome.runtime.sendMessage.
 *
 * Also enriches the submission with problem metadata fetched from
 * LeetCode's GraphQL API (same origin, no CORS issue from content script).
 */

console.log("[Engram] bridge loaded ✓");

let capturedCode = null; // temporary store until check/ responds

window.addEventListener("message", async (event) => {
  if (event.source !== window) return;

  const { type, payload } = event.data || {};

  if (type === "ENGRAM_CODE_CAPTURED") {
    capturedCode = payload;
    return;
  }

  if (type === "ENGRAM_SUBMISSION_ACCEPTED") {
    const problemMeta = await fetchProblemMeta();
    const dateSolved = new Date().toISOString();

    const submissionData = {
      ...payload,
      code: capturedCode?.code || "",
      lang: payload.lang || capturedCode?.lang || "",
      prettyLang: payload.prettyLang || "",
      problemUrl: window.location.href.split("?")[0],
      titleSlug: extractTitleSlug(),
      dateSolved,
      ...problemMeta,
    };

    // DEBUG — remove before production
    console.log("[Engram] Submission captured ✓", submissionData);

    chrome.runtime.sendMessage({
      type: "SUBMISSION_ACCEPTED",
      data: submissionData,
    });

    capturedCode = null;
  }
});

function extractTitleSlug() {
  const match = window.location.pathname.match(/\/problems\/([^/]+)/);
  return match ? match[1] : "";
}

async function fetchProblemMeta() {
  const titleSlug = extractTitleSlug();
  if (!titleSlug) return {};

  const query = `
    query getQuestionDetail($titleSlug: String!) {
      question(titleSlug: $titleSlug) {
        questionFrontendId
        title
        difficulty
        topicTags {
          name
        }
      }
    }
  `;

  try {
    const res = await fetch("https://leetcode.com/graphql", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query, variables: { titleSlug } }),
    });

    const { data } = await res.json();
    const q = data?.question || {};

    return {
      problemNumber: q.questionFrontendId || "",
      problemTitle: q.title || "",
      difficulty: q.difficulty || "",
      topics: (q.topicTags || []).map((t) => t.name),
    };
  } catch (_) {
    return {};
  }
}
