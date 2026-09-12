"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, TextInput } from "@/components/ui/field";
import { ColorPicker } from "./color-picker";
import { subjectColorHex, type SubjectColorId } from "@/lib/config";
import {
  useSubtopicMutations,
  useSubtopics,
  type Subject,
} from "@/lib/queries/subjects";
import { clsx } from "@/lib/clsx";

export function SubjectRow({
  subject,
  onRename,
  onArchive,
  onMove,
  isFirst,
  isLast,
  busy,
}: {
  subject: Subject;
  onRename: (input: { id: string; name: string; color: string }) => void;
  onArchive: (id: string) => void;
  onMove: (id: string, direction: -1 | 1) => void;
  isFirst: boolean;
  isLast: boolean;
  busy: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [name, setName] = useState(subject.name);
  const [color, setColor] = useState<SubjectColorId>(
    subject.color as SubjectColorId,
  );

  const subtopics = useSubtopics(expanded ? subject.id : null);
  const subtopicMutations = useSubtopicMutations(subject.id);
  const [newSubtopic, setNewSubtopic] = useState("");

  return (
    <li className="border border-hairline bg-raised rounded-plate">
      <div className="flex items-stretch">
        <div className="flex-1 min-w-0 p-3 flex items-center gap-3">
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            aria-expanded={expanded}
            className="flex-1 min-w-0 text-left flex items-center gap-3"
          >
            {/* A solid block in the subject's colour, in the proportion it
                will take in the day strip. It reads as a sample of the thing
                itself rather than as decoration on the edge of the card. */}
            <span
              aria-hidden
              className="h-2 w-5 shrink-0"
              style={{ backgroundColor: subjectColorHex(subject.color) }}
            />
            <span className="min-w-0">
              <span className="block truncate text-body">{subject.name}</span>
              <span className="block text-micro text-ink-dim">
                {expanded
                  ? "Hide subtopics"
                  : subtopics.data
                    ? `${subtopics.data.length} subtopics`
                    : "Show subtopics"}
              </span>
            </span>
          </button>

          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => onMove(subject.id, -1)}
              disabled={isFirst || busy}
              aria-label={`Move ${subject.name} up`}
              className="h-9 w-9 grid place-items-center text-ink-dim hover:text-ink disabled:opacity-30"
            >
              <svg viewBox="0 0 16 16" className="h-4 w-4" aria-hidden>
                <path d="M8 12V4M4.5 7.5 8 4l3.5 3.5" fill="none"
                  stroke="currentColor" strokeWidth="1.25" />
              </svg>
            </button>
            <button
              type="button"
              onClick={() => onMove(subject.id, 1)}
              disabled={isLast || busy}
              aria-label={`Move ${subject.name} down`}
              className="h-9 w-9 grid place-items-center text-ink-dim hover:text-ink disabled:opacity-30"
            >
              <svg viewBox="0 0 16 16" className="h-4 w-4" aria-hidden>
                <path d="M8 4v8M4.5 8.5 8 12l3.5-3.5" fill="none"
                  stroke="currentColor" strokeWidth="1.25" />
              </svg>
            </button>
            <button
              type="button"
              onClick={() => setEditing((v) => !v)}
              aria-expanded={editing}
              className="h-9 px-2 text-small text-ink-dim hover:text-ink"
            >
              {editing ? "Cancel" : "Edit"}
            </button>
          </div>
        </div>
      </div>

      {editing ? (
        <form
          className="border-t border-hairline p-3 flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            onRename({ id: subject.id, name, color });
            setEditing(false);
          }}
        >
          <Field label="Name" htmlFor={`name-${subject.id}`}>
            <TextInput
              id={`name-${subject.id}`}
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={40}
              required
            />
          </Field>

          <ColorPicker value={color} onChange={setColor} />

          <div className="flex gap-2">
            <Button type="submit" variant="primary" disabled={busy}>
              Save
            </Button>
            <Button
              type="button"
              variant="danger"
              disabled={busy}
              onClick={() => {
                onArchive(subject.id);
                setEditing(false);
              }}
            >
              Archive
            </Button>
          </div>
          <p className="text-micro text-ink-dim">
            Archiving hides the subject from the timer. Time you have already
            recorded against it is kept.
          </p>
        </form>
      ) : null}

      {expanded ? (
        <div className="border-t border-hairline p-3 flex flex-col gap-3">
          {subtopics.isPending ? (
            <p className="text-small text-ink-dim">Loading subtopics</p>
          ) : subtopics.data && subtopics.data.length > 0 ? (
            <ul className="flex flex-col gap-1">
              {subtopics.data.map((st) => (
                <li
                  key={st.id}
                  className={clsx(
                    "flex items-center gap-2 py-1.5 pl-3",
                    "border-l border-hairline",
                  )}
                >
                  <span className="flex-1 truncate text-small">{st.name}</span>
                  <button
                    type="button"
                    onClick={() => subtopicMutations.archive.mutate(st.id)}
                    className="text-micro text-ink-dim hover:text-ink px-2 py-1"
                  >
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-small text-ink-dim">
              No subtopics yet. Add one to break this subject down, for example
              a chapter or a paper.
            </p>
          )}

          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (!newSubtopic.trim()) return;
              subtopicMutations.create.mutate(newSubtopic, {
                onSuccess: () => setNewSubtopic(""),
              });
            }}
          >
            <TextInput
              value={newSubtopic}
              onChange={(e) => setNewSubtopic(e.target.value)}
              placeholder="Add a subtopic"
              maxLength={40}
              aria-label={`Add a subtopic to ${subject.name}`}
            />
            <Button type="submit" disabled={!newSubtopic.trim()}>
              Add
            </Button>
          </form>

          {subtopicMutations.create.error ? (
            <p role="alert" className="text-micro text-[#E0603C]">
              {subtopicMutations.create.error.message}
            </p>
          ) : null}
        </div>
      ) : null}
    </li>
  );
}
