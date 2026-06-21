/**
 * Notion API integration.
 *
 * Creates a page in the user's Engram database with all submission data.
 * The database must have the exact property schema defined in createDatabaseSchema().
 * Users can create the database via the options page "Set Up Notion" button.
 */

const NOTION_API = "https://api.notion.com/v1";
const NOTION_VERSION = "2022-06-28";

function headers(apiKey) {
  return {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
    "Notion-Version": NOTION_VERSION,
  };
}

/**
 * Creates a new page in the Engram Notion database for a solved problem.
 * @param {string} apiKey
 * @param {string} databaseId
 * @param {object} submission
 */
export async function createNotionPage(apiKey, databaseId, submission) {
  const {
    problemNumber,
    problemTitle,
    titleSlug,
    difficulty,
    problemUrl,
    lang,
    prettyLang,
    statusRuntime,
    statusMemory,
    runtimePercentile,
    memoryPercentile,
    code,
    notes,
    topics,
    dateSolved,
    nextReviewDate,
    reviewDates,
  } = submission;

  const title = problemNumber
    ? `${problemNumber}. ${problemTitle || titleSlug}`
    : problemTitle || titleSlug;

  const body = {
    parent: { database_id: databaseId },
    properties: {
      Name: {
        title: [{ text: { content: title } }],
      },
      "Problem #": {
        number: problemNumber ? parseInt(problemNumber, 10) : null,
      },
      URL: {
        url: problemUrl || null,
      },
      Difficulty: {
        select: difficulty ? { name: difficulty } : null,
      },
      Language: {
        select: prettyLang || lang ? { name: prettyLang || lang } : null,
      },
      Runtime: {
        rich_text: [{ text: { content: statusRuntime || "" } }],
      },
      Memory: {
        rich_text: [{ text: { content: statusMemory || "" } }],
      },
      "Runtime %": {
        number: runtimePercentile ? parseFloat(runtimePercentile.toFixed(1)) : null,
      },
      "Memory %": {
        number: memoryPercentile ? parseFloat(memoryPercentile.toFixed(1)) : null,
      },
      Topics: {
        multi_select: (topics || []).map((t) => ({ name: t })),
      },
      "Date Solved": {
        date: { start: dateSolved ? dateSolved.split("T")[0] : new Date().toISOString().split("T")[0] },
      },
      "Next Review": {
        date: nextReviewDate
          ? { start: nextReviewDate.toISOString().split("T")[0] }
          : null,
      },
      "Review Count": {
        number: 0,
      },
      "Ease Factor": {
        number: 2.5,
      },
      Status: {
        select: { name: "Solved" },
      },
    },
    children: buildPageContent(code, notes, reviewDates),
  };

  const res = await fetch(`${NOTION_API}/pages`, {
    method: "POST",
    headers: headers(apiKey),
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.json();
    throw new Error(`Notion API error ${res.status}: ${JSON.stringify(err)}`);
  }

  return res.json();
}

function buildPageContent(code, notes, reviewDates) {
  const blocks = [];

  // Solution code block
  if (code) {
    blocks.push({
      object: "block",
      type: "heading_2",
      heading_2: {
        rich_text: [{ text: { content: "My Solution" } }],
      },
    });

    // Notion code blocks have a 2000 char limit per block
    const chunks = chunkString(code, 2000);
    chunks.forEach((chunk) => {
      blocks.push({
        object: "block",
        type: "code",
        code: {
          rich_text: [{ text: { content: chunk } }],
          language: "plain text",
        },
      });
    });
  }

  // Notes section
  blocks.push({
    object: "block",
    type: "heading_2",
    heading_2: {
      rich_text: [{ text: { content: "Notes & Approach" } }],
    },
  });

  blocks.push({
    object: "block",
    type: "paragraph",
    paragraph: {
      rich_text: [
        {
          text: {
            content: notes || "Add your notes here — key insight, pattern used, edge cases...",
          },
        },
      ],
    },
  });

  // Review schedule
  if (reviewDates?.length) {
    blocks.push({
      object: "block",
      type: "heading_2",
      heading_2: {
        rich_text: [{ text: { content: "Review Schedule" } }],
      },
    });

    reviewDates.forEach((date, i) => {
      const label = `Review ${i + 1} — ${date.toLocaleDateString("en-US", {
        weekday: "long",
        month: "long",
        day: "numeric",
      })}`;

      blocks.push({
        object: "block",
        type: "to_do",
        to_do: {
          rich_text: [{ text: { content: label } }],
          checked: false,
        },
      });
    });
  }

  return blocks;
}

/**
 * Creates the Engram database in a Notion page.
 * Called from the options page when user clicks "Create Notion Database".
 * @param {string} apiKey
 * @param {string} parentPageId  - The Notion page where the DB will be created
 * @returns {string} databaseId
 */
export async function createDatabase(apiKey, parentPageId) {
  const body = {
    parent: { page_id: parentPageId },
    title: [{ text: { content: "Engram — LeetCode Tracker" } }],
    properties: {
      Name: { title: {} },
      "Problem #": { number: { format: "number" } },
      URL: { url: {} },
      Difficulty: {
        select: {
          options: [
            { name: "Easy", color: "green" },
            { name: "Medium", color: "yellow" },
            { name: "Hard", color: "red" },
          ],
        },
      },
      Language: { select: { options: [] } },
      Runtime: { rich_text: {} },
      Memory: { rich_text: {} },
      "Runtime %": { number: { format: "percent" } },
      "Memory %": { number: { format: "percent" } },
      Topics: { multi_select: { options: [] } },
      "Date Solved": { date: {} },
      "Next Review": { date: {} },
      "Review Count": { number: { format: "number" } },
      "Ease Factor": { number: { format: "number" } },
      Status: {
        select: {
          options: [
            { name: "Solved", color: "green" },
            { name: "Needs Review", color: "orange" },
            { name: "Mastered", color: "blue" },
          ],
        },
      },
    },
  };

  const res = await fetch(`${NOTION_API}/databases`, {
    method: "POST",
    headers: headers(apiKey),
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.json();
    throw new Error(`Notion API error ${res.status}: ${JSON.stringify(err)}`);
  }

  const data = await res.json();
  return data.id;
}

/**
 * Verifies an API key and returns the list of accessible databases.
 * Used to validate user's key in options page.
 */
export async function searchDatabases(apiKey) {
  const res = await fetch(`${NOTION_API}/search`, {
    method: "POST",
    headers: headers(apiKey),
    body: JSON.stringify({ filter: { value: "database", property: "object" } }),
  });

  if (!res.ok) throw new Error(`Notion auth failed: ${res.status}`);
  const data = await res.json();
  return data.results || [];
}

function chunkString(str, size) {
  const chunks = [];
  for (let i = 0; i < str.length; i += size) {
    chunks.push(str.slice(i, i + size));
  }
  return chunks;
}
