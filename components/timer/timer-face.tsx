"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { clockDigits } from "@/lib/time/elapsed";
import { clsx } from "@/lib/clsx";

/**
 * The hero number.
 *
 * Each character sits in its own fixed width cell, so a changing digit cannot
 * shift anything beside it. Only the cell whose character actually changed
 * animates: the rest of the face is completely still, which is the difference
 * between an instrument and a web page counting at you.
 */
export function TimerFace({
  seconds,
  running,
  className,
}: {
  seconds: number;
  running: boolean;
  className?: string;
}) {
  const chars = clockDigits(seconds);
  const reduced = useReducedMotion();

  return (
    <div
      className={clsx(
        "flex items-baseline justify-center font-mono text-timer tabular-nums select-none",
        running ? "text-signal" : "text-ink",
        className,
      )}
      // Read as one value rather than as a stream of changing digits.
      role="timer"
      aria-live="off"
      aria-label={`${Math.floor(seconds / 60)} minutes elapsed`}
      data-motion-keep-color
      style={{ transition: "color 200ms" }}
    >
      {chars.map((char, index) => {
        const isColon = char === ":";
        return (
          <span
            key={index}
            className={clsx(
              "relative inline-block overflow-hidden",
              isColon ? "w-[0.34em] text-center" : "w-[0.62em] text-center",
            )}
            style={{ height: "1em", lineHeight: "1em" }}
          >
            {isColon ? (
              <span className="absolute inset-0 flex items-center justify-center opacity-60">
                :
              </span>
            ) : (
              <AnimatePresence initial={false} mode="popLayout">
                <motion.span
                  key={char}
                  className="absolute inset-0 flex items-center justify-center"
                  initial={reduced ? { opacity: 0 } : { y: "-100%" }}
                  animate={reduced ? { opacity: 1 } : { y: "0%" }}
                  exit={reduced ? { opacity: 0 } : { y: "100%" }}
                  transition={
                    reduced
                      ? { duration: 0.08 }
                      : { type: "tween", ease: [0.2, 0, 0, 1], duration: 0.18 }
                  }
                >
                  {char}
                </motion.span>
              </AnimatePresence>
            )}
          </span>
        );
      })}
    </div>
  );
}
