/**
 * Elapsed time for the session on screen.
 *
 * Everything here is a pure function of timestamps. Nothing accumulates, and
 * there is no counter to fall behind: a refresh, a backgrounded tab or a
 * sleeping laptop changes none of the inputs, so the number is simply correct
 * again when the screen comes back.
 */

export type TimerState = {
  /** When the session started, from the server. */
  startedAt: number;
  /** Seconds of pauses that have already ended. Never includes an open one. */
  closedPausedSeconds: number;
  /** When the current pause began, or null when running. */
  pausedAt: number | null;
  /** Pomodoro work length. Null for stopwatch sessions. */
  plannedSeconds: number | null;
};

/**
 * Seconds of actual study time so far.
 *
 * While paused, the clock is read at the moment the pause began, so the
 * displayed number holds still rather than being frozen by a stopped counter.
 */
export function elapsedSeconds(state: TimerState, now: number): number {
  const readAt = state.pausedAt ?? now;
  const raw = (readAt - state.startedAt) / 1000 - state.closedPausedSeconds;
  // A clock that has been corrected backwards, or a pause written a moment
  // before the start, must not produce a negative timer.
  return raw > 0 ? raw : 0;
}

/** Seconds spent paused, including a pause that is still open. */
export function pausedSeconds(state: TimerState, now: number): number {
  const open = state.pausedAt === null ? 0 : (now - state.pausedAt) / 1000;
  return state.closedPausedSeconds + (open > 0 ? open : 0);
}

/**
 * Where a pomodoro work phase stands.
 *
 * The boundary is derived from the start time rather than scheduled, so a tab
 * that was backgrounded past the end shows a finished pomodoro when it comes
 * back instead of depending on a timer having fired while it was hidden.
 */
export type PomodoroPhase = {
  plannedSeconds: number;
  remainingSeconds: number;
  /** 0 to 1, clamped. */
  progress: number;
  complete: boolean;
};

export function pomodoroPhase(
  state: TimerState,
  now: number,
): PomodoroPhase | null {
  if (state.plannedSeconds === null || state.plannedSeconds <= 0) return null;

  const elapsed = elapsedSeconds(state, now);
  const remaining = state.plannedSeconds - elapsed;

  return {
    plannedSeconds: state.plannedSeconds,
    remainingSeconds: remaining > 0 ? remaining : 0,
    progress: Math.min(1, Math.max(0, elapsed / state.plannedSeconds)),
    complete: remaining <= 0,
  };
}

/**
 * Splits a duration into the fields the timer face shows.
 *
 * Hours are not capped at 24: a session can legitimately run for half a day,
 * and rolling over would be a lie.
 */
export type Clock = { hours: number; minutes: number; seconds: number };

export function toClock(totalSeconds: number): Clock {
  const whole = Math.floor(totalSeconds > 0 ? totalSeconds : 0);
  return {
    hours: Math.floor(whole / 3600),
    minutes: Math.floor((whole % 3600) / 60),
    seconds: whole % 60,
  };
}

/**
 * The timer face as individual characters, so only the digit that changes has
 * to move. Hours appear once there are any, and not before, so a short session
 * is not padded with a dead leading pair.
 */
export function clockDigits(totalSeconds: number): string[] {
  const { hours, minutes, seconds } = toClock(totalSeconds);
  const pad = (n: number) => String(n).padStart(2, "0");

  return hours > 0
    ? [...pad(hours), ":", ...pad(minutes), ":", ...pad(seconds)]
    : [...pad(minutes), ":", ...pad(seconds)];
}

/** Compact duration for totals, as in "4h 12m". Not for the timer face. */
export function formatDuration(totalSeconds: number): string {
  const { hours, minutes } = toClock(totalSeconds);
  if (hours === 0 && minutes === 0) {
    const s = Math.floor(totalSeconds > 0 ? totalSeconds : 0);
    return `${s}s`;
  }
  if (hours === 0) return `${minutes}m`;
  return minutes === 0 ? `${hours}h` : `${hours}h ${minutes}m`;
}
