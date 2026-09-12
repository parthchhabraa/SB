"use client";

import { POMODORO } from "@/lib/config";
import { clsx } from "@/lib/clsx";

export function ModeSelect({
  mode,
  onMode,
  workMinutes,
  onWorkMinutes,
  disabled,
}: {
  mode: "stopwatch" | "pomodoro";
  onMode: (mode: "stopwatch" | "pomodoro") => void;
  workMinutes: number;
  onWorkMinutes: (minutes: number) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex flex-col gap-3">
      {/* Two states of one control, so it reads as a switch on a panel rather
          than as two competing buttons. */}
      <div
        role="radiogroup"
        aria-label="Timer mode"
        className="grid grid-cols-2 border border-hairline rounded-plate overflow-hidden"
      >
        {(["stopwatch", "pomodoro"] as const).map((m) => (
          <button
            key={m}
            type="button"
            role="radio"
            aria-checked={mode === m}
            disabled={disabled}
            onClick={() => onMode(m)}
            className={clsx(
              "px-3 py-2.5 min-h-11 text-small transition-colors",
              mode === m
                ? "bg-raised-high text-ink"
                : "bg-transparent text-ink-dim hover:text-ink",
            )}
          >
            {m === "stopwatch" ? "Stopwatch" : "Pomodoro"}
          </button>
        ))}
      </div>

      {mode === "pomodoro" ? (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-small text-ink-dim mr-1">Work for</span>
          {[15, 25, POMODORO.defaultWorkMinutes, 45, 50, 60]
            .filter((v, i, arr) => arr.indexOf(v) === i)
            .sort((a, b) => a - b)
            .map((m) => (
              <button
                key={m}
                type="button"
                aria-pressed={workMinutes === m}
                disabled={disabled}
                onClick={() => onWorkMinutes(m)}
                className={clsx(
                  "px-2.5 py-1.5 min-h-9 text-small border rounded-plate tabular-nums",
                  workMinutes === m
                    ? "border-ink text-ink"
                    : "border-hairline text-ink-dim hover:text-ink",
                )}
              >
                {m}m
              </button>
            ))}
        </div>
      ) : null}
    </div>
  );
}
