/**
 * SM-2 spaced repetition algorithm.
 * Reference: https://www.supermemo.com/en/archives1990-2015/english/ol/sm2
 *
 * For v0: computeInitialIntervals returns fixed review dates.
 * For v1: sm2() will be called after each review session to compute
 *         the next dynamic interval based on recall quality.
 */

// Fixed initial review schedule (days after solving)
const INITIAL_INTERVALS = [1, 3, 7, 14, 30];

/**
 * Returns an array of Date objects for the initial review schedule.
 * @param {Date} solvedDate
 * @returns {Date[]}
 */
export function computeInitialIntervals(solvedDate) {
  return INITIAL_INTERVALS.map((days) => {
    const d = new Date(solvedDate);
    d.setDate(d.getDate() + days);
    // Set to 9 AM local time so calendar events appear in the morning
    d.setHours(9, 0, 0, 0);
    return d;
  });
}

/**
 * SM-2 algorithm — call this after each review session.
 *
 * @param {number} quality   - 0 to 5 (0-2 = failed recall, 3-5 = successful recall)
 * @param {number} repetitions  - number of successful reviews so far
 * @param {number} easeFactor   - current ease factor (start at 2.5)
 * @param {number} interval     - current interval in days
 * @returns {{ repetitions, easeFactor, interval, nextReviewDate: Date }}
 */
export function sm2(quality, repetitions, easeFactor, interval) {
  let newRepetitions = repetitions;
  let newEaseFactor = easeFactor;
  let newInterval = interval;

  if (quality < 3) {
    // Failed recall — reset to beginning
    newRepetitions = 0;
    newInterval = 1;
  } else {
    // Successful recall
    if (newRepetitions === 0) {
      newInterval = 1;
    } else if (newRepetitions === 1) {
      newInterval = 6;
    } else {
      newInterval = Math.round(newInterval * newEaseFactor);
    }
    newRepetitions += 1;
  }

  // Update ease factor — clamp to minimum 1.3
  newEaseFactor = Math.max(
    1.3,
    newEaseFactor + 0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02)
  );

  const nextReviewDate = new Date();
  nextReviewDate.setDate(nextReviewDate.getDate() + newInterval);
  nextReviewDate.setHours(9, 0, 0, 0);

  return {
    repetitions: newRepetitions,
    easeFactor: newEaseFactor,
    interval: newInterval,
    nextReviewDate,
  };
}
