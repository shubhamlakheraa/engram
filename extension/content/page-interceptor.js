/**
 * Runs in MAIN world (page's JS context).
 *
 * Intercepts two LeetCode fetch calls:
 *   1. POST /prob/submit/                    → captures submitted code + lang
 *   2. GET  /submissions/detail/{id}/v2/check/ → captures verdict + stats
 *
 * Communicates with bridge.js (ISOLATED world) via window.postMessage.
 */

(function () {
  console.log("[Engram] page-interceptor loaded ✓");

  const originalFetch = window.fetch.bind(window);

  window.fetch = async function (...args) {
    const request = args[0];
    const url = typeof request === "string" ? request : request?.url;

    if (typeof url !== "string") return originalFetch(...args);

    // ── 1. Capture submitted code from submit POST ──────────────────────────
    if (/\/problems\/[^/]+\/submit\//.test(url)) {
      let requestBody = null;
      try {
        const init = args[1];
        console.log("[Engram] submit hit — init:", init, "request type:", typeof request, request instanceof Request);
        if (init?.body) {
          console.log("[Engram] body type:", typeof init.body, "value:", init.body);
          requestBody = JSON.parse(init.body);
        } else if (request instanceof Request) {
          const text = await request.clone().text();
          console.log("[Engram] Request body text:", text);
          requestBody = text ? JSON.parse(text) : null;
        }
      } catch (e) {
        console.log("[Engram] body parse error:", e);
      }

      const response = await originalFetch(...args);
      const clone = response.clone();

      clone
        .json()
        .then((data) => {
          if (data.submission_id) {
            console.log("[Engram] Code captured ✓", {
              submissionId: data.submission_id,
              lang: requestBody?.lang,
              codeLength: requestBody?.typed_code?.length,
            });
            window.postMessage(
              {
                type: "ENGRAM_CODE_CAPTURED",
                payload: {
                  submissionId: String(data.submission_id),
                  code: requestBody?.typed_code || "",
                  lang: requestBody?.lang || "",
                },
              },
              "*"
            );
          }
        })
        .catch(() => {});

      return response;
    }

    // ── 2. Capture verdict from polling check ───────────────────────────────
    if (/\/submissions\/detail\/[^/]+\/v2\/check\//.test(url)) {
      const response = await originalFetch(...args);
      const clone = response.clone();

      clone
        .json()
        .then((data) => {
          if (data.status_msg === "Accepted" && data.finished === true) {
            console.log("[Engram] Accepted verdict captured ✓", data);
            window.postMessage(
              {
                type: "ENGRAM_SUBMISSION_ACCEPTED",
                payload: {
                  submissionId: String(url.match(/\/detail\/([^/]+)\//)?.[1] || ""),
                  statusMsg: data.status_msg,
                  statusRuntime: data.status_runtime || "",
                  statusMemory: data.status_memory || "",
                  runtimePercentile: data.runtime_percentile || 0,
                  memoryPercentile: data.memory_percentile || 0,
                  totalCorrect: data.total_correct || 0,
                  totalTestcases: data.total_testcases || 0,
                  lang: data.lang || "",
                  prettyLang: data.pretty_lang || "",
                },
              },
              "*"
            );
          }
        })
        .catch(() => {});

      return response;
    }

    // DEBUG — log every unmatched fetch to find the submit URL
    console.log("[Engram] unmatched fetch →", url);
    return originalFetch(...args);
  };
})();
