"use client";

import { useCallback, useSyncExternalStore } from "react";
import { elapsedSeconds, type TimerState } from "./elapsed";
import { serverNow } from "./clock";

/**
 * Subscribes to animation frames. The callback only tells React to look
 * again; what it sees is whatever the snapshot below computes.
 */
function subscribeToFrames(onChange: () => void): () => void {
  let frame = requestAnimationFrame(function loop() {
    onChange();
    frame = requestAnimationFrame(loop);
  });
  return () => cancelAnimationFrame(frame);
}

const noSubscription = () => () => undefined;

/**
 * The elapsed second currently on screen.
 *
 * The clock is an external source, so it is read through
 * useSyncExternalStore rather than mirrored into state: every frame asks what
 * the value is now, and React re-renders only on the frame where the whole
 * second changes. Nothing accumulates, so nothing can fall behind a refresh,
 * a backgrounded tab or a sleeping laptop.
 *
 * A paused session subscribes to nothing at all. Its value is a function of
 * two fixed timestamps, so there is no clock to read and no frame to wait for.
 */
export function useElapsedSeconds(state: TimerState | null): number {
  const running = state !== null && state.pausedAt === null;

  const snapshot = useCallback(() => {
    if (state === null) return 0;
    // While paused, any `now` gives the same answer, so the pause instant is
    // passed rather than the clock.
    const at = state.pausedAt ?? serverNow();
    return Math.floor(elapsedSeconds(state, at));
    // The query hands back a new object each time even when the values are
    // identical, so the snapshot is keyed on the values themselves.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state?.startedAt, state?.closedPausedSeconds, state?.pausedAt]);

  return useSyncExternalStore(
    running ? subscribeToFrames : noSubscription,
    snapshot,
    // Rendered on the server before any clock is available.
    () => 0,
  );
}
