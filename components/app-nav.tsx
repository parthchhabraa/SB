"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { clsx } from "@/lib/clsx";

/**
 * Fixed to the bottom, because the phone is the primary device and the thumb
 * is at the bottom of it. Icons are drawn here rather than pulled from a set,
 * so they can share the hairline weight of everything else.
 */
// Extended as each phase lands. A tab is added when the screen behind it is
// real, so there is never a link to a placeholder.
const ITEMS = [
  { href: "/subjects", label: "Subjects" },
  { href: "/settings", label: "Settings" },
] as const;

function Glyph({ name, active }: { name: string; active: boolean }) {
  const stroke = active ? "var(--color-ink)" : "var(--color-ink-dim)";
  const common = { fill: "none", stroke, strokeWidth: 1.25 } as const;
  return (
    <svg viewBox="0 0 20 20" className="h-5 w-5" aria-hidden>
      {name === "Subjects" ? (
        <>
          <rect x="2.5" y="4" width="15" height="3.5" {...common} />
          <rect x="2.5" y="9.5" width="15" height="3.5" {...common} />
          <rect x="2.5" y="15" width="15" height="1.5" {...common} />
        </>
      ) : null}
      {name === "Settings" ? (
        <>
          <path d="M3 6.5h14M3 13.5h14" {...common} />
          <circle cx="7.5" cy="6.5" r="2" {...common} />
          <circle cx="12.5" cy="13.5" r="2" {...common} />
        </>
      ) : null}
    </svg>
  );
}

export function AppNav() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Sections"
      className="fixed bottom-0 inset-x-0 border-t border-hairline bg-surface"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <ul className="grid" style={{ gridTemplateColumns: `repeat(${ITEMS.length}, 1fr)` }}>
        {ITEMS.map((item) => {
          const active = pathname.startsWith(item.href);
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={clsx(
                  "flex flex-col items-center gap-1 py-2.5 text-micro",
                  active ? "text-ink" : "text-ink-dim",
                )}
              >
                <Glyph name={item.label} active={active} />
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
