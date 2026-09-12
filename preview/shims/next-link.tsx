import type { AnchorHTMLAttributes, ReactNode } from "react";

/**
 * Stands in for next/link in the design preview.
 *
 * The preview is a single static page with an internal screen switcher, so
 * links render as anchors and do not navigate. Everything else about the
 * component, including its classes, is the real thing.
 */
export default function Link({
  href,
  children,
  ...rest
}: AnchorHTMLAttributes<HTMLAnchorElement> & {
  href: string;
  children: ReactNode;
}) {
  return (
    <a
      href={href}
      onClick={(e) => e.preventDefault()}
      data-preview-link
      {...rest}
    >
      {children}
    </a>
  );
}
