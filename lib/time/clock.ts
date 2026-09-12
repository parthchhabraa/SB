"use client";

/**
 * Agreement with the server's clock.
 *
 * Elapsed time is measured against the server, not the device, because a phone
 * with a wrong system clock would otherwise show a wrong number with no sign
 * that anything was amiss. The offset is measured with a round trip
 * correction, and re-measured whenever the tab comes back to the foreground.
 */
import { CLOCK } from "@/lib/config";

let offsetMs = 0;
let measuredAt = 0;

/** The server's idea of now, in milliseconds. */
export function serverNow(): number {
  return Date.now() + offsetMs;
}

export function clockOffsetMs(): number {
  return offsetMs;
}

export function offsetIsStale(): boolean {
  return Date.now() - measuredAt > CLOCK.offsetStaleMs;
}

/**
 * Measures the offset against one server timestamp.
 *
 * The reading is discarded if the round trip took too long, since half of a
 * slow round trip is a poor estimate of one leg and would make the correction
 * worse than no correction.
 */
export function recordOffsetSample(args: {
  sentAt: number;
  receivedAt: number;
  serverTime: number;
}): boolean {
  const rtt = args.receivedAt - args.sentAt;
  if (rtt < 0 || rtt > CLOCK.maxAcceptableRttMs) return false;

  // The server read its clock somewhere inside the round trip; the midpoint is
  // the best single guess available.
  const clientMidpoint = args.sentAt + rtt / 2;
  offsetMs = args.serverTime - clientMidpoint;
  measuredAt = Date.now();
  return true;
}

/** Test seam. Not used by the app. */
export function resetClockOffset(): void {
  offsetMs = 0;
  measuredAt = 0;
}
