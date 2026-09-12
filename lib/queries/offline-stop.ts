"use client";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { api } from "@/lib/supabase/rpc";
import { serverNow } from "@/lib/time/clock";

/**
 * Stopping a session while offline.
 *
 * Losing signal mid-session is ordinary on a phone, and the common case is
 * that someone stops studying at that moment and walks away. The stop is
 * recorded locally with the time it actually happened, corrected for device
 * clock skew, and replayed when the connection returns.
 *
 * The server clamps the replayed timestamp into the session's own span, so a
 * queued stop cannot extend a session or place it before its start.
 */
const KEY = "pending-session-stop";

type PendingStop = { sessionId: string; endedAt: string };

function read(): PendingStop | null {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      "sessionId" in parsed &&
      "endedAt" in parsed &&
      typeof parsed.sessionId === "string" &&
      typeof parsed.endedAt === "string"
    ) {
      return { sessionId: parsed.sessionId, endedAt: parsed.endedAt };
    }
    return null;
  } catch {
    // Private browsing, or storage that has been cleared or blocked.
    return null;
  }
}

export function queueStop(sessionId: string): void {
  try {
    const pending: PendingStop = {
      sessionId,
      endedAt: new Date(serverNow()).toISOString(),
    };
    window.localStorage.setItem(KEY, JSON.stringify(pending));
  } catch {
    // Nothing can be done, and the session is still running server side, so
    // the 12 hour cap remains the backstop.
  }
}

export function clearQueuedStop(): void {
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    // Ignored for the same reason as above.
  }
}

export function queuedStop(): PendingStop | null {
  return read();
}

/** Replays a queued stop. Returns true when one was actually sent. */
export async function flushQueuedStop(
  client: SupabaseClient<Database>,
): Promise<boolean> {
  const pending = read();
  if (!pending) return false;

  try {
    await api.completeSession(client, pending.sessionId, pending.endedAt);
    clearQueuedStop();
    return true;
  } catch {
    // The session may have been stopped elsewhere, or the connection is still
    // down. Drop it either way rather than retrying forever: a stop that is
    // hours stale is worse than the 12 hour cap that would catch it anyway.
    const age = Date.now() - new Date(pending.endedAt).getTime();
    if (age > 12 * 60 * 60 * 1000) clearQueuedStop();
    return false;
  }
}
