"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabaseBrowser } from "@/lib/supabase/client";
import { api, RpcError, type ActiveSession } from "@/lib/supabase/rpc";
import { recordOffsetSample } from "@/lib/time/clock";
import { qk } from "./keys";

/**
 * The session in flight, if any.
 *
 * Every response carries the server's clock, which is folded into the offset
 * so the timer measures against the server rather than the device.
 */
export function useActiveSession() {
  return useQuery({
    queryKey: qk.activeSession,
    queryFn: async (): Promise<ActiveSession | null> => {
      const sentAt = Date.now();
      const row = await api.activeSession(supabaseBrowser());
      if (row) {
        recordOffsetSample({
          sentAt,
          receivedAt: Date.now(),
          serverTime: new Date(row.server_now).getTime(),
        });
      }
      return row;
    },
    // The row itself barely changes; what changes is the clock reading against
    // it, and that is recomputed every frame from the timestamps.
    staleTime: 30_000,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
  });
}

export function useTodaySeconds() {
  return useQuery({
    queryKey: qk.todaySeconds,
    queryFn: () => api.todaySeconds(supabaseBrowser()),
    staleTime: 30_000,
  });
}

/** Turns the RPC hints into something worth showing a person. */
function sessionError(error: unknown): string {
  if (error instanceof RpcError) {
    switch (error.hint) {
      case "active_session_exists":
        return "A session is already running. Stop it before starting another.";
      default:
        return error.message;
    }
  }
  return error instanceof Error
    ? error.message
    : "Something went wrong. Try that again.";
}

export function useSessionMutations() {
  const qc = useQueryClient();

  const settle = async () => {
    await Promise.all([
      qc.invalidateQueries({ queryKey: qk.activeSession }),
      qc.invalidateQueries({ queryKey: qk.todaySeconds }),
      qc.invalidateQueries({ queryKey: qk.goals }),
      qc.invalidateQueries({ queryKey: qk.balance }),
    ]);
  };

  const start = useMutation({
    mutationFn: (args: {
      subjectId: string;
      subtopicId?: string | null;
      mode: "stopwatch" | "pomodoro";
      plannedSeconds?: number | null;
    }) => api.startSession(supabaseBrowser(), args),
    onSuccess: settle,
  });

  const pause = useMutation({
    mutationFn: (id: string) => api.pauseSession(supabaseBrowser(), id),
    onSuccess: settle,
  });

  const resume = useMutation({
    mutationFn: (id: string) => api.resumeSession(supabaseBrowser(), id),
    onSuccess: settle,
  });

  const complete = useMutation({
    mutationFn: (args: { id: string; clientEndedAt?: string }) =>
      api.completeSession(supabaseBrowser(), args.id, args.clientEndedAt),
    onSuccess: settle,
  });

  const discard = useMutation({
    mutationFn: (id: string) => api.discardSession(supabaseBrowser(), id),
    onSuccess: settle,
  });

  const undoDiscard = useMutation({
    mutationFn: (id: string) => api.undoDiscardSession(supabaseBrowser(), id),
    onSuccess: settle,
  });

  const switchSubject = useMutation({
    mutationFn: (args: {
      sessionId: string;
      subjectId: string;
      subtopicId?: string | null;
    }) => api.switchSubject(supabaseBrowser(), args),
    onSuccess: settle,
  });

  const addManual = useMutation({
    mutationFn: (args: {
      subjectId: string;
      startedAt: string;
      endedAt: string;
      subtopicId?: string | null;
      note?: string | null;
    }) => api.addManualSession(supabaseBrowser(), args),
    onSuccess: settle,
  });

  return {
    start,
    pause,
    resume,
    complete,
    discard,
    undoDiscard,
    switchSubject,
    addManual,
    errorMessage: sessionError,
  };
}
