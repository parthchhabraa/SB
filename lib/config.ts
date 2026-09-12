/**
 * Every tunable number in the product lives here.
 *
 * The SQL side reads the same values from the `app_config` table, which is
 * seeded from this file by `scripts/sync-config.ts`. Change a number here,
 * run that script, and both sides move together. Do not hardcode any of
 * these values anywhere else.
 */

export const POINTS = {
  /** Points earned per minute of completed study time. */
  perMinute: 1,
  /** One-off bonus the first time the daily goal is met on a given local day. */
  dailyGoalBonus: 20,
  /** Bonus per day of current streak, granted once per local day. */
  streakBonusPerDay: 5,
  /** Ceiling on the streak bonus, so a long streak does not run away. */
  streakBonusCap: 50,
} as const;

export const SESSION = {
  /**
   * A running session older than this is finalized automatically at
   * `started_at + maxHours` and flagged `auto_closed`. Without this, a laptop
   * left open overnight mints points for time nobody studied.
   */
  maxHours: 12,
  /** Under this many seconds, discarding is frictionless and silent. */
  frictionlessDiscardSeconds: 60,
  /** How long the undo affordance stays up after a discard. */
  discardUndoSeconds: 5,
} as const;

export const MANUAL_ENTRY = {
  /**
   * Manual entries earn points normally but are capped per local day.
   * They still count toward goals, streaks and stats above the cap; only the
   * points stop. Keeps offline study rewarded without making the friend
   * leaderboard trivially farmable.
   */
  maxMinutesPerDay: 240,
  /** Longest single manual entry accepted. */
  maxMinutesPerEntry: 720,
} as const;

export const POMODORO = {
  defaultWorkMinutes: 25,
  defaultBreakMinutes: 5,
  defaultLongBreakMinutes: 15,
  defaultRoundsBeforeLongBreak: 4,
  minWorkMinutes: 1,
  maxWorkMinutes: 180,
  minBreakMinutes: 1,
  maxBreakMinutes: 60,
} as const;

export const GOALS = {
  defaultDailyMinutes: 120,
  minMinutes: 5,
  maxMinutes: 24 * 60,
} as const;

export const CLOCK = {
  /** Re-measure server clock offset if the last reading is older than this. */
  offsetStaleMs: 60_000,
  /** Reject an offset measurement whose round trip took longer than this. */
  maxAcceptableRttMs: 4_000,
} as const;

/**
 * Subject colors. Hues are spaced to stay separable in a 4px column on the
 * graphite surface, and deliberately avoid amber so no subject can be mistaken
 * for the running state.
 */
export const SUBJECT_COLORS = [
  { id: "blue", hex: "#4C8DF6", label: "Blue" },
  { id: "cyan", hex: "#23B2C8", label: "Cyan" },
  { id: "green", hex: "#3FAE6A", label: "Green" },
  { id: "lime", hex: "#9ABF3A", label: "Lime" },
  { id: "rust", hex: "#E0603C", label: "Rust" },
  { id: "pink", hex: "#D9528C", label: "Pink" },
  { id: "violet", hex: "#9B6BE3", label: "Violet" },
  { id: "slate", hex: "#78889B", label: "Slate" },
] as const;

export type SubjectColorId = (typeof SUBJECT_COLORS)[number]["id"];

export const SUBJECT_COLOR_IDS: readonly SubjectColorId[] =
  SUBJECT_COLORS.map((c) => c.id);

export function subjectColorHex(id: string): string {
  return SUBJECT_COLORS.find((c) => c.id === id)?.hex ?? "#78889B";
}

/** Seeded on signup. Obviously editable, and the copy says so in the UI. */
export const EXAMPLE_REWARDS = [
  { title: "Go out on Friday", costPoints: 600, cooldownHours: 168 },
  { title: "One episode", costPoints: 120, cooldownHours: 24 },
  { title: "Buy the thing in my cart", costPoints: 1500, cooldownHours: null },
] as const;

export const STARTER_SUBJECTS = [
  { name: "Maths", color: "blue" },
  { name: "Physics", color: "cyan" },
  { name: "Chemistry", color: "green" },
] as const;
