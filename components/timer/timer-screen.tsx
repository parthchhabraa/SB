"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { motion, useReducedMotion } from "motion/react";
import { useQueryClient } from "@tanstack/react-query";

import { Button } from "@/components/ui/button";
import { SkeletonRows } from "@/components/ui/skeleton";
import { TimerFace } from "./timer-face";
import { ProgressBar } from "./progress-bar";
import { SubjectSelect } from "./subject-select";
import { ModeSelect } from "./mode-select";
import { ManualEntry } from "./manual-entry";

import { useProfile } from "@/lib/queries/profile";
import { useSubjects, useSubtopics } from "@/lib/queries/subjects";
import {
  useActiveSession,
  useSessionMutations,
  useTodaySeconds,
} from "@/lib/queries/sessions";
import { qk } from "@/lib/queries/keys";
import { supabaseBrowser } from "@/lib/supabase/client";
import { flushQueuedStop, queueStop } from "@/lib/queries/offline-stop";

import { useElapsedSeconds } from "@/lib/time/use-elapsed";
import { useWakeLock } from "@/lib/time/use-wake-lock";
import { useClockSync } from "@/lib/time/use-clock-sync";
import { serverNow } from "@/lib/time/clock";
import { formatDuration, pomodoroPhase, type TimerState } from "@/lib/time/elapsed";
import { SESSION, subjectColorHex } from "@/lib/config";
import { clsx } from "@/lib/clsx";

export function TimerScreen() {
  const profile = useProfile();
  const subjects = useSubjects();
  const active = useActiveSession();

  if (profile.isPending || subjects.isPending || active.isPending) {
    return (
      <div className="mx-auto max-w-md px-4 py-8 flex flex-col gap-6">
        <SkeletonRows rows={4} />
      </div>
    );
  }

  if (!profile.data) {
    return (
      <div className="mx-auto max-w-md px-4 py-8 flex flex-col gap-3">
        <h1 className="text-display font-medium">Timer</h1>
        <p role="alert" className="text-body">
          Could not load your profile. Reload the page, and sign in again if it
          keeps happening.
        </p>
      </div>
    );
  }

  // Keyed on the profile so the pomodoro length is initialised from it once,
  // as props, rather than synchronised into state after the fact.
  return <Timer key={profile.data.id} pomodoroWorkMinutes={profile.data.pomodoro_work_minutes} />;
}

function Timer({ pomodoroWorkMinutes }: { pomodoroWorkMinutes: number }) {
  useClockSync();

  const qc = useQueryClient();
  const subjects = useSubjects();
  const active = useActiveSession();
  const today = useTodaySeconds();
  const m = useSessionMutations();

  const [pickedSubject, setPickedSubject] = useState<string | null>(null);
  const [pickedSubtopic, setPickedSubtopic] = useState<string | null>(null);
  const [mode, setMode] = useState<"stopwatch" | "pomodoro">("stopwatch");
  const [workMinutes, setWorkMinutes] = useState(pomodoroWorkMinutes);
  const [showManual, setShowManual] = useState(false);
  const [switching, setSwitching] = useState(false);
  const [discarded, setDiscarded] = useState<string | null>(null);

  const session = active.data ?? null;
  const running = session?.status === "running";


  useWakeLock(running);

  // Replay a stop that was made while offline, as soon as there is a
  // connection to replay it onto.
  useEffect(() => {
    const flush = async () => {
      if (await flushQueuedStop(supabaseBrowser())) {
        await qc.invalidateQueries({ queryKey: qk.activeSession });
        await qc.invalidateQueries({ queryKey: qk.todaySeconds });
      }
    };
    void flush();
    window.addEventListener("online", flush);
    return () => window.removeEventListener("online", flush);
  }, [qc]);

  const state: TimerState | null = session
    ? {
        startedAt: new Date(session.started_at).getTime(),
        closedPausedSeconds: session.closed_paused_seconds,
        pausedAt: session.paused_at ? new Date(session.paused_at).getTime() : null,
        plannedSeconds: session.planned_seconds,
      }
    : null;

  const elapsed = useElapsedSeconds(state);
  const phase = state ? pomodoroPhase(state, serverNow()) : null;

  // The server's total already includes whatever the running session has
  // accrued, so only the time since that measurement is added. Adding the
  // session's whole elapsed time would count the same minutes twice.
  const todayLive =
    (today.data?.seconds ?? 0) +
    (running && today.data
      ? Math.max(0, (serverNow() - today.data.asOf) / 1000)
      : 0);

  const subjectList = subjects.data ?? [];
  const activeSubjectId = session?.subject_id ?? pickedSubject;
  const subtopics = useSubtopics(activeSubjectId);
  const currentSubject = subjectList.find((s) => s.id === activeSubjectId);

  if (subjectList.length === 0) {
    return (
      <div className="mx-auto max-w-md px-4 py-8 flex flex-col gap-4">
        <h1 className="text-display font-medium">Timer</h1>
        <div className="border border-hairline rounded-plate p-6 flex flex-col gap-3">
          <p className="text-body">You need a subject before you can start.</p>
          <p className="text-small text-ink-dim">
            A subject is what you pick before the timer runs, and its colour is
            what you will see in your day.
          </p>
          <div>
            <Link
              href="/subjects"
              className="inline-flex items-center justify-center min-h-11 px-4 py-2.5 rounded-plate border border-ink bg-ink text-surface text-small font-medium"
            >
              Add a subject
            </Link>
          </div>
        </div>
      </div>
    );
  }

  if (showManual) {
    return (
      <div className="mx-auto max-w-md px-4 py-8">
        <ManualEntry subjects={subjectList} onDone={() => setShowManual(false)} />
      </div>
    );
  }

  const canStart = pickedSubject !== null && !m.start.isPending;
  const mutationError =
    m.start.error ?? m.complete.error ?? m.pause.error ?? m.resume.error;

  return (
    <TimerStage running={running}>
      {/* With a session in flight the face is the only thing on screen worth
          looking at, so it sits in the middle rather than stacked at the top.
          Idle, the screen is a list to work down, so it starts at the top. */}
      <div
        className={clsx(
          "mx-auto max-w-md px-4 py-6 flex flex-col gap-7",
          session && "min-h-[calc(100dvh-5rem)] justify-center",
        )}
      >
        <header className="flex items-baseline justify-between gap-4">
          <h1 className="text-display font-medium">Timer</h1>
          <p className="text-small text-ink-dim">
            Today{" "}
            <span className="font-mono text-ink">
              {formatDuration(todayLive)}
            </span>
          </p>
        </header>

        {session?.auto_closed_last ? (
          <p
            role="status"
            className="text-small text-ink-dim border border-hairline rounded-plate p-3"
          >
            A session was left running for more than {SESSION.maxHours} hours, so
            it was stopped at the {SESSION.maxHours} hour mark. You can correct
            it with a manual entry.
          </p>
        ) : null}

        {/* The face. Its bezel is the one place the accent appears. */}
        <section
          className={clsx(
            "border rounded-plate px-4 py-8 flex flex-col gap-5 transition-colors duration-200",
            running ? "border-signal bg-sunk" : "border-hairline bg-raised",
          )}
          data-motion-keep-color
        >
          <TimerFace seconds={elapsed} running={running} />

          {phase ? (
            <div className="flex flex-col gap-2">
              <ProgressBar
                value={phase.progress}
                label="Pomodoro progress"
                tone={running ? "signal" : "ink"}
              />
              <p className="text-small text-ink-dim text-center">
                {phase.complete
                  ? "Work phase done. Stop to log it, then take your break."
                  : `${formatDuration(phase.remainingSeconds)} left of ${formatDuration(phase.plannedSeconds)}`}
              </p>
            </div>
          ) : null}

          {currentSubject ? (
            <p className="flex items-center justify-center gap-2 text-small text-ink-dim">
              <span
                aria-hidden
                className="h-2 w-5 shrink-0"
                style={{ backgroundColor: subjectColorHex(currentSubject.color) }}
              />
              {currentSubject.name}
              {session?.status === "paused" ? " (paused)" : ""}
            </p>
          ) : null}
        </section>

        {session ? (
          <RunningControls
            paused={session.status === "paused"}
            elapsed={elapsed}
            busy={m.pause.isPending || m.resume.isPending || m.complete.isPending}
            onPause={() => m.pause.mutate(session.id)}
            onResume={() => m.resume.mutate(session.id)}
            onStop={() => {
              if (!navigator.onLine) {
                // Record when this actually happened, and send it when there
                // is a connection to send it on.
                queueStop(session.id);
              }
              m.complete.mutate({ id: session.id });
            }}
            onDiscard={() => {
              m.discard.mutate(session.id, {
                onSuccess: () => setDiscarded(session.id),
              });
            }}
            onSwitch={() => setSwitching((v) => !v)}
            switching={switching}
          />
        ) : (
          <div className="flex flex-col gap-6">
            <SubjectSelect
              subjects={subjectList}
              subtopics={subtopics.data ?? []}
              subjectId={pickedSubject}
              subtopicId={pickedSubtopic}
              onSubject={(id) => {
                setPickedSubject(id);
                setPickedSubtopic(null);
              }}
              onSubtopic={setPickedSubtopic}
            />

            <ModeSelect
              mode={mode}
              onMode={setMode}
              workMinutes={workMinutes}
              onWorkMinutes={setWorkMinutes}
            />

            <StartButton
              disabled={!canStart}
              pending={m.start.isPending}
              onClick={() => {
                if (pickedSubject === null) return;
                m.start.mutate({
                  subjectId: pickedSubject,
                  subtopicId: pickedSubtopic,
                  mode,
                  plannedSeconds: mode === "pomodoro" ? workMinutes * 60 : null,
                });
              }}
            />

            <button
              type="button"
              onClick={() => setShowManual(true)}
              className="text-small text-ink-dim hover:text-ink underline underline-offset-4 self-start"
            >
              Add time you studied offline
            </button>
          </div>
        )}

        {switching && session ? (
          <section className="border border-hairline rounded-plate p-3 flex flex-col gap-4">
            <p className="text-small text-ink-dim">
              Switching stops this session and starts a new one, so both are
              recorded separately.
            </p>
            <SubjectSelect
              subjects={subjectList}
              subtopics={[]}
              subjectId={session.subject_id}
              subtopicId={null}
              onSubject={(id) => {
                if (id === session.subject_id) return;
                m.switchSubject.mutate(
                  { sessionId: session.id, subjectId: id },
                  { onSuccess: () => setSwitching(false) },
                );
              }}
              onSubtopic={() => undefined}
              disabled={m.switchSubject.isPending}
            />
          </section>
        ) : null}

        {discarded ? (
          <DiscardUndo
            onUndo={() => {
              m.undoDiscard.mutate(discarded, {
                onSuccess: () => setDiscarded(null),
              });
            }}
            onDismiss={() => setDiscarded(null)}
          />
        ) : null}

        {mutationError ? (
          <p role="alert" className="text-small text-[#E0603C]">
            {m.errorMessage(mutationError)}
          </p>
        ) : null}
      </div>
    </TimerStage>
  );
}

/**
 * The room dims when the timer starts. One step of surface, nothing else, so
 * the number is the only lit thing on the screen.
 */
function TimerStage({
  running,
  children,
}: {
  running: boolean;
  children: React.ReactNode;
}) {
  return (
    <div
      className="min-h-full transition-colors duration-300"
      style={{
        backgroundColor: running ? "var(--color-sunk)" : "var(--color-surface)",
      }}
      data-motion-keep-color
    >
      {children}
    </div>
  );
}

function StartButton({
  disabled,
  pending,
  onClick,
}: {
  disabled: boolean;
  pending: boolean;
  onClick: () => void;
}) {
  const reduced = useReducedMotion();

  return (
    <motion.button
      type="button"
      disabled={disabled}
      onClick={onClick}
      // The plate seats when pressed. Weighted rather than springy, because a
      // switch with a detent does not wobble.
      whileTap={reduced || disabled ? undefined : { scale: 0.985 }}
      transition={{ type: "tween", ease: [0.2, 0, 0, 1], duration: 0.14 }}
      className={clsx(
        "w-full min-h-14 border border-ink bg-ink text-surface rounded-plate",
        "text-title font-medium transition-colors",
        "disabled:opacity-40 disabled:cursor-not-allowed",
      )}
    >
      {pending ? "Starting..." : disabled ? "Pick a subject to start" : "Start"}
    </motion.button>
  );
}

function RunningControls({
  paused,
  elapsed,
  busy,
  onPause,
  onResume,
  onStop,
  onDiscard,
  onSwitch,
  switching,
}: {
  paused: boolean;
  elapsed: number;
  busy: boolean;
  onPause: () => void;
  onResume: () => void;
  onStop: () => void;
  onDiscard: () => void;
  onSwitch: () => void;
  switching: boolean;
}) {
  // Under a minute there is nothing worth keeping, so throwing it away takes
  // one tap and no dialog. Past that, a discard is worth a question.
  const frictionless = elapsed < SESSION.frictionlessDiscardSeconds;
  const [confirming, setConfirming] = useState(false);

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-2">
        <Button
          variant="quiet"
          disabled={busy}
          onClick={paused ? onResume : onPause}
          className="min-h-14 text-title"
        >
          {paused ? "Resume" : "Pause"}
        </Button>
        <Button
          variant="primary"
          disabled={busy}
          onClick={onStop}
          className="min-h-14 text-title"
        >
          Stop
        </Button>
      </div>

      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={onSwitch}
          aria-expanded={switching}
          className="text-small text-ink-dim hover:text-ink underline underline-offset-4"
        >
          {switching ? "Keep this subject" : "Switch subject"}
        </button>

        {frictionless ? (
          <button
            type="button"
            onClick={onDiscard}
            className="text-small text-ink-dim hover:text-ink underline underline-offset-4"
          >
            Discard
          </button>
        ) : confirming ? (
          <span className="flex items-center gap-2 text-small">
            <span className="text-ink-dim">
              Discard {formatDuration(elapsed)}?
            </span>
            <button
              type="button"
              onClick={() => {
                setConfirming(false);
                onDiscard();
              }}
              className="text-[#E0603C] underline underline-offset-4"
            >
              Discard
            </button>
            <button
              type="button"
              onClick={() => setConfirming(false)}
              className="text-ink-dim underline underline-offset-4"
            >
              Keep
            </button>
          </span>
        ) : (
          <button
            type="button"
            onClick={() => setConfirming(true)}
            className="text-small text-ink-dim hover:text-ink underline underline-offset-4"
          >
            Discard
          </button>
        )}
      </div>
    </div>
  );
}

function DiscardUndo({
  onUndo,
  onDismiss,
}: {
  onUndo: () => void;
  onDismiss: () => void;
}) {
  useEffect(() => {
    const id = window.setTimeout(onDismiss, SESSION.discardUndoSeconds * 1000);
    return () => window.clearTimeout(id);
  }, [onDismiss]);

  return (
    <div
      role="status"
      className="flex items-center justify-between gap-3 border border-hairline rounded-plate bg-raised-high px-3 py-2.5"
    >
      <span className="text-small">Session discarded.</span>
      <button
        type="button"
        onClick={onUndo}
        className="text-small text-ink underline underline-offset-4"
      >
        Undo
      </button>
    </div>
  );
}
