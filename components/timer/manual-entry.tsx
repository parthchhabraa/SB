"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, Select, TextInput } from "@/components/ui/field";
import { SubjectSelect } from "./subject-select";
import { MANUAL_ENTRY } from "@/lib/config";
import { formatDuration } from "@/lib/time/elapsed";
import { useSessionMutations } from "@/lib/queries/sessions";
import { useSubtopics, type Subject } from "@/lib/queries/subjects";

/**
 * Time studied away from the app.
 *
 * Entered as a start and an end rather than a duration, because the database
 * derives every figure from timestamps and a duration would have to be turned
 * back into a pair somewhere. Doing it here keeps the rule in one place.
 */
export function ManualEntry({
  subjects,
  onDone,
}: {
  subjects: Subject[];
  onDone: () => void;
}) {
  const { addManual, errorMessage } = useSessionMutations();

  const [subjectId, setSubjectId] = useState<string | null>(
    subjects[0]?.id ?? null,
  );
  const [subtopicId, setSubtopicId] = useState<string | null>(null);
  const [date, setDate] = useState(() => localDateValue(new Date()));
  const [startTime, setStartTime] = useState("09:00");
  const [minutes, setMinutes] = useState(60);
  const [note, setNote] = useState("");

  // Reading the clock during render would make the render impure, and the
  // answer only needs to change when one of the fields does, so it is re-read
  // on every edit. The server is the real guard against a future entry.
  const [nowMs, setNowMs] = useState(() => Date.now());

  const subtopics = useSubtopics(subjectId);

  const startedAt = new Date(`${date}T${startTime}`);
  const endedAt = new Date(startedAt.getTime() + minutes * 60_000);
  const valid =
    subjectId !== null &&
    !Number.isNaN(startedAt.getTime()) &&
    endedAt.getTime() <= nowMs;

  const problem =
    subjectId === null
      ? "Pick a subject."
      : Number.isNaN(startedAt.getTime())
        ? "Check the date and time."
        : endedAt.getTime() > nowMs
          ? "That block ends in the future. Pick an earlier time or a shorter length."
          : undefined;

  return (
    <form
      className="flex flex-col gap-6"
      onSubmit={(e) => {
        e.preventDefault();
        // `valid` is computed from nowMs, which is re-read on every edit.
        // If the form has sat open long enough for that to go stale, the
        // server refuses a future entry and its message is shown below.
        if (!valid || subjectId === null) return;
        addManual.mutate(
          {
            subjectId,
            subtopicId,
            startedAt: startedAt.toISOString(),
            endedAt: endedAt.toISOString(),
            note: note.trim() || null,
          },
          { onSuccess: onDone },
        );
      }}
    >
      <header className="flex flex-col gap-1">
        <h2 className="text-title font-medium">Add time you studied offline</h2>
        <p className="text-small text-ink-dim">
          This counts toward your goals and stats. It earns points up to{" "}
          {MANUAL_ENTRY.maxMinutesPerDay / 60} hours a day, and friends can see
          it was added by hand.
        </p>
      </header>

      <SubjectSelect
        subjects={subjects}
        subtopics={subtopics.data ?? []}
        subjectId={subjectId}
        subtopicId={subtopicId}
        onSubject={(id) => {
          setSubjectId(id);
          setSubtopicId(null);
        }}
        onSubtopic={setSubtopicId}
      />

      <div className="grid grid-cols-2 gap-3">
        <Field label="Date" htmlFor="manual-date">
          <TextInput
            id="manual-date"
            type="date"
            value={date}
            max={localDateValue(new Date(nowMs))}
            onChange={(e) => {
              setDate(e.target.value);
              setNowMs(Date.now());
            }}
            required
          />
        </Field>
        <Field label="Started at" htmlFor="manual-time">
          <TextInput
            id="manual-time"
            type="time"
            value={startTime}
            onChange={(e) => {
              setStartTime(e.target.value);
              setNowMs(Date.now());
            }}
            required
          />
        </Field>
      </div>

      <Field
        label="For how long"
        htmlFor="manual-minutes"
        hint={`Ends at ${endTimeLabel(endedAt)}, ${formatDuration(minutes * 60)} of study.`}
      >
        <Select
          id="manual-minutes"
          value={minutes}
          onChange={(e) => {
            setMinutes(Number(e.target.value));
            setNowMs(Date.now());
          }}
        >
          {[15, 30, 45, 60, 90, 120, 180, 240, 300, 360].map((m) => (
            <option key={m} value={m}>
              {formatDuration(m * 60)}
            </option>
          ))}
        </Select>
      </Field>

      <Field label="Note, if you want one" htmlFor="manual-note">
        <TextInput
          id="manual-note"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Library, past papers"
          maxLength={500}
        />
      </Field>

      {problem || addManual.error ? (
        <p role="alert" className="text-small text-[#E0603C]">
          {addManual.error ? errorMessage(addManual.error) : problem}
        </p>
      ) : null}

      <div className="flex gap-2">
        <Button
          type="submit"
          variant="primary"
          disabled={!valid || addManual.isPending}
        >
          {addManual.isPending ? "Adding..." : "Add"}
        </Button>
        <Button type="button" onClick={onDone}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

/** A yyyy-mm-dd value in the viewer's own zone, not UTC. */
function localDateValue(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function endTimeLabel(d: Date): string {
  if (Number.isNaN(d.getTime())) return "an invalid time";
  return d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}
