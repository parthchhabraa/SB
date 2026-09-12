"use client";

import { subjectColorHex } from "@/lib/config";
import type { Subject, Subtopic } from "@/lib/queries/subjects";
import { clsx } from "@/lib/clsx";

export function SubjectSelect({
  subjects,
  subtopics,
  subjectId,
  subtopicId,
  onSubject,
  onSubtopic,
  disabled,
}: {
  subjects: Subject[];
  subtopics: Subtopic[];
  subjectId: string | null;
  subtopicId: string | null;
  onSubject: (id: string) => void;
  onSubtopic: (id: string | null) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex flex-col gap-4">
      <fieldset className="flex flex-col gap-2" disabled={disabled}>
        <legend className="text-small text-ink-dim mb-2">Subject</legend>
        <ul className="flex flex-col gap-1.5">
          {subjects.map((s) => {
            const selected = s.id === subjectId;
            return (
              <li key={s.id}>
                <button
                  type="button"
                  onClick={() => onSubject(s.id)}
                  aria-pressed={selected}
                  disabled={disabled}
                  className={clsx(
                    "w-full flex items-center gap-3 px-3 py-3 min-h-12",
                    "border rounded-plate text-left transition-colors",
                    selected
                      ? "border-ink bg-raised-high"
                      : "border-hairline bg-raised hover:border-hairline-strong",
                    disabled && "opacity-50",
                  )}
                >
                  <span
                    aria-hidden
                    className="h-2 w-5 shrink-0"
                    style={{ backgroundColor: subjectColorHex(s.color) }}
                  />
                  <span className="flex-1 truncate text-body">{s.name}</span>
                </button>
              </li>
            );
          })}
        </ul>
      </fieldset>

      {subjectId && subtopics.length > 0 ? (
        <fieldset className="flex flex-col gap-2" disabled={disabled}>
          <legend className="text-small text-ink-dim mb-2">
            Subtopic, if you want one
          </legend>
          <div className="flex flex-wrap gap-1.5">
            <SubtopicChip
              label="None"
              selected={subtopicId === null}
              onClick={() => onSubtopic(null)}
              disabled={disabled}
            />
            {subtopics.map((st) => (
              <SubtopicChip
                key={st.id}
                label={st.name}
                selected={st.id === subtopicId}
                onClick={() => onSubtopic(st.id)}
                disabled={disabled}
              />
            ))}
          </div>
        </fieldset>
      ) : null}
    </div>
  );
}

function SubtopicChip({
  label,
  selected,
  onClick,
  disabled,
}: {
  label: string;
  selected: boolean;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      disabled={disabled}
      className={clsx(
        "px-3 py-2 min-h-10 text-small border rounded-plate transition-colors",
        selected
          ? "border-ink text-ink bg-raised-high"
          : "border-hairline text-ink-dim hover:text-ink hover:border-hairline-strong",
      )}
    >
      {label}
    </button>
  );
}
