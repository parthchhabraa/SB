"use client";

import { SUBJECT_COLORS, type SubjectColorId } from "@/lib/config";
import { clsx } from "@/lib/clsx";

/**
 * A closed palette rather than a free hex field. Two subjects that are
 * indistinguishable at 4px would make the day strip unreadable, which is the
 * one thing it cannot be.
 */
export function ColorPicker({
  value,
  onChange,
}: {
  value: SubjectColorId;
  onChange: (next: SubjectColorId) => void;
}) {
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="text-small text-ink-dim mb-2">Colour</legend>
      <div className="flex flex-wrap gap-2">
        {SUBJECT_COLORS.map((c) => {
          const selected = c.id === value;
          return (
            <label
              key={c.id}
              className={clsx(
                "relative h-11 w-11 cursor-pointer rounded-plate border transition-colors",
                selected ? "border-ink" : "border-hairline hover:border-hairline-strong",
              )}
            >
              <input
                type="radio"
                name="subject-color"
                value={c.id}
                checked={selected}
                onChange={() => onChange(c.id)}
                className="sr-only peer"
              />
              <span
                aria-hidden
                className="absolute inset-2 block"
                style={{ backgroundColor: c.hex }}
              />
              <span className="sr-only">{c.label}</span>
              {/* Focus has to be visible on a control whose input is hidden. */}
              <span className="absolute inset-0 peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-ink peer-focus-visible:outline-offset-2" />
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
