import type { ReactNode } from "react";
import { clsx } from "@/lib/clsx";

/**
 * A raised plane. Depth here comes from a lightness step plus a hairline,
 * never from a shadow.
 */
export function Plate({
  children,
  className,
  as: Tag = "div",
}: {
  children: ReactNode;
  className?: string;
  as?: "div" | "section" | "article" | "li";
}) {
  return (
    <Tag
      className={clsx(
        "border border-hairline bg-raised rounded-plate",
        className,
      )}
    >
      {children}
    </Tag>
  );
}
