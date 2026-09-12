"use client";

import { motion, useReducedMotion } from "motion/react";
import { clsx } from "@/lib/clsx";

/**
 * Progress toward a number, filled with spring physics.
 *
 * Under reduced motion the bar still moves to its new value, it just gets
 * there at once. Removing the movement entirely would remove the information.
 */
export function ProgressBar({
  value,
  label,
  tone = "ink",
  className,
}: {
  /** 0 to 1. */
  value: number;
  label: string;
  tone?: "ink" | "signal";
  className?: string;
}) {
  const reduced = useReducedMotion();
  const pct = Math.min(1, Math.max(0, value));

  return (
    <div
      className={clsx("h-1.5 w-full bg-sunk border border-hairline", className)}
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(pct * 100)}
      aria-label={label}
    >
      <motion.div
        className={clsx("h-full", tone === "signal" ? "bg-signal" : "bg-ink")}
        initial={false}
        animate={{ width: `${pct * 100}%` }}
        transition={
          reduced
            ? { duration: 0 }
            : { type: "spring", stiffness: 180, damping: 26 }
        }
      />
    </div>
  );
}
