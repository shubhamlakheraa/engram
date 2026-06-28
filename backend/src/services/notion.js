const NOTION_API = "https://api.notion.com/v1";
const NOTION_VERSION = "2022-06-28";

function headers(token) {
  return {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
    "Notion-Version": NOTION_VERSION,
  };
}

export async function createProblemPage(token, databaseId, problem, reviewDates) {
  const {
    problemNumber, problemTitle, titleSlug, difficulty,
    problemUrl, lang, prettyLang, runtime, memory,
    runtimePercentile, memoryPercentile, code, notes,
    topics, dateSolved, nextReviewDate,
  } = problem;

  const title = problemNumber
    ? `${problemNumber}. ${problemTitle || titleSlug}`
    : problemTitle || titleSlug;

  const body = {
    parent: { database_id: databaseId },
    properties: {
      Name:           { title: [{ text: { content: title } }] },
      "Problem #":    { number: problemNumber ? parseInt(problemNumber, 10) : null },
      URL:            { url: problemUrl || null },
      Difficulty:     { select: difficulty ? { name: difficulty } : null },
      Language:       { select: (prettyLang || lang) ? { name: prettyLang || lang } : null },
      Runtime:        { rich_text: [{ text: { content: runtime || "" } }] },
      Memory:         { rich_text: [{ text: { content: memory || "" } }] },
      "Runtime %":    { number: runtimePercentile ? parseFloat(runtimePercentile.toFixed(1)) : null },
      "Memory %":     { number: memoryPercentile ? parseFloat(memoryPercentile.toFixed(1)) : null },
      Topics:         { multi_select: (topics || []).map((t) => ({ name: t })) },
      "Date Solved":  { date: { start: dateSolved ? dateSolved.split("T")[0] : new Date().toISOString().split("T")[0] } },
      "Next Review":  { date: nextReviewDate ? { start: new Date(nextReviewDate).toISOString().split("T")[0] } : null },
      "Review Count": { number: 0 },
      "Ease Factor":  { number: 1.0 },
      Status:         { select: { name: "Solved" } },
    },
    children: buildPageBlocks(code, notes, reviewDates),
  };

  const res = await fetch(`${NOTION_API}/pages`, {
    method: "POST",
    headers: headers(token),
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.json();
    throw new Error(`Notion error ${res.status}: ${JSON.stringify(err)}`);
  }

  return res.json();
}

export async function updateReviewState(token, pageId, { nextReviewDate, reviewCount, stability }) {
  const body = {
    properties: {
      "Next Review":  { date: { start: new Date(nextReviewDate).toISOString().split("T")[0] } },
      "Review Count": { number: reviewCount },
      "Ease Factor":  { number: parseFloat(stability.toFixed(2)) },
    },
  };

  const res = await fetch(`${NOTION_API}/pages/${pageId}`, {
    method: "PATCH",
    headers: headers(token),
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.json();
    throw new Error(`Notion update error ${res.status}: ${JSON.stringify(err)}`);
  }

  return res.json();
}

export async function createDatabase(token, parentPageId = null) {
  // Databases can't sit at workspace root — create a container page first
  if (!parentPageId) {
    const pageRes = await fetch(`${NOTION_API}/pages`, {
      method: "POST",
      headers: headers(token),
      body: JSON.stringify({
        parent: { type: "workspace", workspace: true },
        properties: {
          title: [{ type: "text", text: { content: "Engram" } }],
        },
      }),
    });
    if (!pageRes.ok) {
      const err = await pageRes.json();
      throw new Error(`Notion error ${pageRes.status}: ${JSON.stringify(err)}`);
    }
    const page = await pageRes.json();
    parentPageId = page.id;
  }

  const res = await fetch(`${NOTION_API}/databases`, {
    method: "POST",
    headers: headers(token),
    body: JSON.stringify({
      parent: { type: "page_id", page_id: parentPageId },
      title: [{ type: "text", text: { content: "Engram — LeetCode Tracker" } }],
      properties: {
        Name:           { title: {} },
        "Problem #":    { number: { format: "number" } },
        URL:            { url: {} },
        Difficulty:     { select: { options: [{ name: "Easy", color: "green" }, { name: "Medium", color: "yellow" }, { name: "Hard", color: "red" }] } },
        Language:       { select: { options: [] } },
        Topics:         { multi_select: { options: [] } },
        Runtime:        { rich_text: {} },
        Memory:         { rich_text: {} },
        "Runtime %":    { number: { format: "percent" } },
        "Memory %":     { number: { format: "percent" } },
        "Date Solved":  { date: {} },
        "Next Review":  { date: {} },
        "Review Count": { number: { format: "number" } },
        "Stability":    { number: { format: "number" } },
        Status:         { select: { options: [{ name: "Solved", color: "green" }, { name: "Reviewing", color: "blue" }] } },
      },
    }),
  });

  if (!res.ok) {
    const err = await res.json();
    throw new Error(`Notion error ${res.status}: ${JSON.stringify(err)}`);
  }

  const data = await res.json();
  return data.id;
}

function buildPageBlocks(code, notes, reviewDates) {
  const blocks = [];

  if (code) {
    blocks.push({
      object: "block",
      type: "heading_2",
      heading_2: { rich_text: [{ text: { content: "My Solution" } }] },
    });

    chunkString(code, 2000).forEach((chunk) => {
      blocks.push({
        object: "block",
        type: "code",
        code: { rich_text: [{ text: { content: chunk } }], language: "plain text" },
      });
    });
  }

  blocks.push({
    object: "block",
    type: "heading_2",
    heading_2: { rich_text: [{ text: { content: "Notes & Approach" } }] },
  });

  blocks.push({
    object: "block",
    type: "paragraph",
    paragraph: {
      rich_text: [{ text: { content: notes || "Add your notes here — key insight, pattern used, edge cases..." } }],
    },
  });

  if (reviewDates?.length) {
    blocks.push({
      object: "block",
      type: "heading_2",
      heading_2: { rich_text: [{ text: { content: "Review Schedule" } }] },
    });

    reviewDates.forEach((date, i) => {
      blocks.push({
        object: "block",
        type: "to_do",
        to_do: {
          rich_text: [{ text: { content: `Review ${i + 1} — ${new Date(date).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}` } }],
          checked: false,
        },
      });
    });
  }

  return blocks;
}

function chunkString(str, size) {
  const chunks = [];
  for (let i = 0; i < str.length; i += size) chunks.push(str.slice(i, i + size));
  return chunks;
}
