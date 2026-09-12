import { clsx } from "@/lib/clsx";

/**
 * Loading placeholders match the shape of what is coming, so the layout does
 * not jump when real content lands. No spinners anywhere in the product.
 */
export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={clsx(
        "animate-[pulse_1.6s_ease-in-out_infinite] bg-raised-high rounded-plate",
        className,
      )}
    />
  );
}

export function SkeletonRows({ rows = 3 }: { rows?: number }) {
  return (
    <div className="flex flex-col gap-2" aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading</span>
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} className="h-16 w-full" />
      ))}
    </div>
  );
}
