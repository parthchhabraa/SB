"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, TextInput } from "@/components/ui/field";
import { SkeletonRows } from "@/components/ui/skeleton";
import { ColorPicker } from "./color-picker";
import { SubjectRow } from "./subject-row";
import {
  useSubjectMutations,
  useSubjects,
  type Subject,
} from "@/lib/queries/subjects";
import { SUBJECT_COLORS, type SubjectColorId } from "@/lib/config";

export function SubjectsScreen() {
  const subjects = useSubjects();
  const { create, rename, archive, reorder } = useSubjectMutations();

  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [color, setColor] = useState<SubjectColorId>("blue");

  const busy =
    create.isPending || rename.isPending || archive.isPending || reorder.isPending;

  function move(id: string, direction: -1 | 1) {
    const list = subjects.data;
    if (!list) return;
    const from = list.findIndex((s) => s.id === id);
    const to = from + direction;
    if (from < 0 || to < 0 || to >= list.length) return;

    const next: Subject[] = [...list];
    const moved = next[from];
    const displaced = next[to];
    if (!moved || !displaced) return;
    next[from] = displaced;
    next[to] = moved;
    reorder.mutate(next);
  }

  // Offer a colour that is not already in use, so a new subject is
  // distinguishable in the day strip without the person having to think.
  function nextFreeColor(list: Subject[] | undefined): SubjectColorId {
    const used = new Set((list ?? []).map((s) => s.color));
    return SUBJECT_COLORS.find((c) => !used.has(c.id))?.id ?? "blue";
  }

  return (
    <div className="mx-auto max-w-xl px-4 py-8 flex flex-col gap-6">
      <header className="flex items-baseline justify-between gap-4">
        <h1 className="text-display font-medium">Subjects</h1>
        {!adding ? (
          <Button
            onClick={() => {
              setColor(nextFreeColor(subjects.data));
              setAdding(true);
            }}
          >
            Add subject
          </Button>
        ) : null}
      </header>

      {adding ? (
        <form
          className="border border-hairline bg-raised rounded-plate p-4 flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            create.mutate(
              { name, color },
              {
                onSuccess: () => {
                  setName("");
                  setAdding(false);
                },
              },
            );
          }}
        >
          <Field
            label="Name"
            htmlFor="new-subject"
            error={create.error?.message}
          >
            <TextInput
              id="new-subject"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Organic chemistry"
              maxLength={40}
              autoFocus
              required
            />
          </Field>

          <ColorPicker value={color} onChange={setColor} />

          <div className="flex gap-2">
            <Button type="submit" variant="primary" disabled={busy || !name.trim()}>
              {create.isPending ? "Adding..." : "Add"}
            </Button>
            <Button
              type="button"
              onClick={() => {
                setAdding(false);
                setName("");
                create.reset();
              }}
            >
              Cancel
            </Button>
          </div>
        </form>
      ) : null}

      {subjects.isPending ? (
        <SkeletonRows rows={3} />
      ) : subjects.isError ? (
        <div
          role="alert"
          className="border border-hairline rounded-plate p-4 flex flex-col gap-3"
        >
          <p className="text-body">Could not load your subjects.</p>
          <p className="text-small text-ink-dim">{subjects.error.message}</p>
          <div>
            <Button onClick={() => subjects.refetch()}>Try again</Button>
          </div>
        </div>
      ) : subjects.data.length === 0 ? (
        <div className="border border-hairline rounded-plate p-6 flex flex-col gap-3">
          <p className="text-body">No subjects yet.</p>
          <p className="text-small text-ink-dim">
            Add one for each thing you study. You pick a subject before starting
            the timer, and its colour is what you will see in the day strip.
          </p>
          <div>
            <Button
              variant="primary"
              onClick={() => {
                setColor(nextFreeColor(subjects.data));
                setAdding(true);
              }}
            >
              Add your first subject
            </Button>
          </div>
        </div>
      ) : (
        <ul className="flex flex-col gap-2">
          {subjects.data.map((s, i) => (
            <SubjectRow
              key={s.id}
              subject={s}
              onRename={(input) => rename.mutate(input)}
              onArchive={(id) => archive.mutate(id)}
              onMove={move}
              isFirst={i === 0}
              isLast={i === subjects.data.length - 1}
              busy={busy}
            />
          ))}
        </ul>
      )}

      {rename.error || archive.error || reorder.error ? (
        <p role="alert" className="text-small text-[#E0603C]">
          {(rename.error ?? archive.error ?? reorder.error)?.message}
        </p>
      ) : null}
    </div>
  );
}
