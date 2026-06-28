// FSRS-4.5 spaced repetition algorithm.
//
// Core state per problem: stability (S) and difficulty (D).
//   S — days until retrievability drops to 90%
//   D — inherent card difficulty, 1.0 (easiest) to 10.0 (hardest)
//
// Forgetting curve: R(t) = 0.9 ^ (t / S)
// Next interval:    days = S  (reviews at 90% target retention)

// Default parameters from the FSRS-4.5 paper.
const W = [
  0.4072,  // w0:  initial S for "again"
  1.1829,  // w1:  initial S for "hard"
  3.1262,  // w2:  initial S for "good"
  15.4722, // w3:  initial S for "easy"
  7.2102,  // w4:  initial D for "good" (used as mean difficulty)
  0.5316,  // w5:  difficulty delta per rating step
  1.0651,  // w6:  difficulty mean-reversion factor
  0.0589,  // w7:  (reserved)
  1.5330,  // w8:  stability increase exponent
  0.1544,  // w9:  stability decay exponent
  1.0071,  // w10: retrievability sensitivity
  1.9395,  // w11: S after forgetting — base
  0.1100,  // w12: S after forgetting — D exponent
  0.2900,  // w13: S after forgetting — S exponent
  2.2700,  // w14: S after forgetting — R sensitivity
  0.2500,  // w15: "hard" rating multiplier
  2.9898,  // w16: "easy" rating multiplier
];

const RATINGS = { again: 1, hard: 2, good: 3, easy: 4 };
const TARGET_RETENTION = 0.9;

export const INITIAL_STABILITY    = 1.0;
export const INITIAL_DIFFICULTY   = W[4]; // 7.2102

// Maps UI button labels to FSRS rating strings.
export const RECALL_QUALITY = {
  clean: "good",
  hints: "hard",
  blank: "again",
};

function clamp(v, min, max) {
  return Math.min(Math.max(v, min), max);
}

function retrievability(elapsedDays, stability) {
  return Math.pow(TARGET_RETENTION, elapsedDays / stability);
}

function stabilityAfterRecall(D, S, R, rating) {
  const multiplier = rating === "hard" ? W[15] : rating === "easy" ? W[16] : 1.0;
  return S * (
    Math.exp(W[8]) *
    (11 - D) *
    Math.pow(S, -W[9]) *
    (Math.exp(W[10] * (1 - R)) - 1) *
    multiplier +
    1
  );
}

function stabilityAfterForgetting(D, S, R) {
  return (
    W[11] *
    Math.pow(D, -W[12]) *
    (Math.pow(S + 1, W[13]) - 1) *
    Math.exp(W[14] * (1 - R))
  );
}

function updatedDifficulty(D, rating) {
  const r = RATINGS[rating];
  const delta = -W[5] * (r - 3); // positive = easier, negative = harder
  // Mean-revert towards W[4] to prevent drift to extremes
  return clamp(W[6] * W[4] + (1 - W[6]) * (D + delta), 1, 10);
}

function intervalDays(stability) {
  // R(t) = 0.9^(t/S) = targetRetention  →  t = S  when targetRetention = 0.9
  return Math.max(1, Math.round(stability));
}

/**
 * Run one FSRS review step.
 *
 * @param {string} rating       - "again" | "hard" | "good" | "easy"
 * @param {number} stability    - current stability in days
 * @param {number} difficulty   - current difficulty (1–10)
 * @param {number} elapsedDays  - days since last review (must be ≥ 1)
 * @returns {{ stability, difficulty, intervalDays, nextReviewDate }}
 */
export function fsrs(rating, stability, difficulty, elapsedDays) {
  const elapsed = Math.max(1, elapsedDays);
  const R = retrievability(elapsed, stability);

  const newS = rating === "again"
    ? stabilityAfterForgetting(difficulty, stability, R)
    : stabilityAfterRecall(difficulty, stability, R, rating);

  const safeS = Math.max(0.1, newS);
  const newD   = updatedDifficulty(difficulty, rating);
  const days   = intervalDays(safeS);

  const nextReviewDate = new Date();
  nextReviewDate.setDate(nextReviewDate.getDate() + days);

  return {
    stability:   parseFloat(safeS.toFixed(4)),
    difficulty:  parseFloat(newD.toFixed(4)),
    intervalDays: days,
    nextReviewDate,
  };
}
