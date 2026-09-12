import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes } from "react";
import { clsx } from "@/lib/clsx";

const control =
  "w-full rounded-plate border border-hairline bg-sunk px-3 py-2.5 " +
  "text-body text-ink placeholder:text-ink-dim " +
  "focus:border-hairline-strong min-h-11";

export function Field({
  label,
  hint,
  error,
  children,
  htmlFor,
}: {
  label: string;
  hint?: string;
  error?: string;
  children: ReactNode;
  htmlFor?: string;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={htmlFor} className="text-small text-ink-dim">
        {label}
      </label>
      {children}
      {hint && !error ? (
        <p className="text-micro text-ink-dim">{hint}</p>
      ) : null}
      {/* Errors say what broke and how to fix it, and are announced. */}
      {error ? (
        <p role="alert" className="text-micro text-[#E0603C]">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export function TextInput({
  className,
  ...rest
}: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={clsx(control, className)} {...rest} />;
}

export function Select({
  className,
  children,
  ...rest
}: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={clsx(control, className)} {...rest}>
      {children}
    </select>
  );
}
