"use client";

import type { ButtonHTMLAttributes, ReactNode } from "react";
import { clsx } from "@/lib/clsx";

type Variant = "primary" | "quiet" | "danger";

const base =
  "inline-flex items-center justify-center gap-2 rounded-plate border " +
  "px-4 py-2.5 text-small font-medium transition-colors " +
  "disabled:opacity-40 disabled:cursor-not-allowed " +
  "min-h-11"; // a real touch target, since most use is one handed

const variants: Record<Variant, string> = {
  // Ink on ink. The accent is reserved for the running state, so the primary
  // action does not spend it.
  primary:
    "border-ink bg-ink text-surface hover:bg-[#f5f3ee] active:bg-[#d8d5cf]",
  quiet:
    "border-hairline bg-transparent text-ink hover:border-hairline-strong " +
    "hover:bg-raised-high",
  danger:
    "border-hairline bg-transparent text-[#E0603C] hover:border-[#E0603C]",
};

export function Button({
  children,
  variant = "quiet",
  className,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  children: ReactNode;
  variant?: Variant;
}) {
  return (
    <button className={clsx(base, variants[variant], className)} {...rest}>
      {children}
    </button>
  );
}
