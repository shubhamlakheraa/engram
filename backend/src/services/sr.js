/**
 * SM-2 spaced repetition algorithm.
 *
 * quality:      0-5  (0-2 = failed recall, 3-5 = successful recall)
 * repetitions:  number of successful reviews so far
 * easeFactor:   difficulty multiplier, starts at 2.5, min 1.3
 * interval:     current interval in days
 */

export function sm2(quality, repetitions, easeFactor, interval) {
  let newReps = repetitions;
  let newEF = easeFactor;
  let newInterval = interval;

  if (quality < 3) {
    newReps = 0;
    newInterval = 1;
  } else {
    if (newReps === 0) newInterval = 1;
    else if (newReps === 1) newInterval = 6;
    else newInterval = Math.round(newInterval * newEF);
    newReps += 1;
  }

  newEF = Math.max(
    1.3,
    newEF + 0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02)
  );

  const nextReviewDate = new Date();
  nextReviewDate.setDate(nextReviewDate.getDate() + newInterval);

  return {
    repetitions: newReps,
    easeFactor:  parseFloat(newEF.toFixed(2)),
    interval:    newInterval,
    nextReviewDate,
  };
}

// Map the 3 UI buttons to SM-2 quality scores
export const RECALL_QUALITY = {
  clean: 5,  // Remembered cleanly
  hints: 2,  // Needed hints
  blank: 0,  // Completely blanked
};

// Initial fixed intervals before SM-2 takes over (days after solving)
export const INITIAL_INTERVALS = [1, 3, 7, 14, 30];

export function getInitialReviewDates(solvedDate = new Date()) {
  return INITIAL_INTERVALS.map((days) => {
    const d = new Date(solvedDate);
    d.setDate(d.getDate() + days);
    return d;
  });
}
