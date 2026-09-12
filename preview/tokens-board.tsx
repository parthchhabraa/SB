import { SUBJECT_COLORS } from "@/lib/config";

const TOKENS = [
  { name: "surface", hex: "#16181A", role: "Base plane" },
  { name: "raised", hex: "#1F2225", role: "Panels and cards" },
  { name: "ink", hex: "#E8E6E1", role: "Primary text" },
  { name: "ink-dim", hex: "#8D9297", role: "Secondary text" },
  { name: "signal", hex: "#F0A32B", role: "Running state, and almost nothing else" },
];

const SCALE = [
  { name: "timer", cls: "text-timer font-mono", sample: "01:24:07" },
  { name: "readout", cls: "text-readout font-mono", sample: "4h 12m" },
  { name: "display", cls: "text-display", sample: "Subjects" },
  { name: "title", cls: "text-title", sample: "Section heading" },
  { name: "body", cls: "text-body", sample: "Body copy sits at sixteen pixels." },
  { name: "small", cls: "text-small", sample: "Secondary copy and labels." },
  { name: "micro", cls: "text-micro", sample: "Axis labels and timestamps." },
];

export function TokensBoard() {
  return (
    <div className="mx-auto max-w-xl px-4 py-8 flex flex-col gap-10">
      <header className="flex flex-col gap-2">
        <h1 className="text-display font-medium">Design tokens</h1>
        <p className="text-small text-ink-dim">
          The whole palette is five values. Everything else is these, layered.
        </p>
      </header>

      <section className="flex flex-col gap-3">
        <h2 className="text-title font-medium">Colour</h2>
        <ul className="flex flex-col">
          {TOKENS.map((t) => (
            <li
              key={t.name}
              className="flex items-center gap-4 py-3 border-b border-hairline"
            >
              <span
                aria-hidden
                className="h-10 w-10 shrink-0 border border-hairline"
                style={{ backgroundColor: t.hex }}
              />
              <span className="flex-1 min-w-0">
                <span className="block text-body">{t.name}</span>
                <span className="block text-micro text-ink-dim">{t.role}</span>
              </span>
              <span className="font-mono text-small text-ink-dim">{t.hex}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-title font-medium">Subject colours</h2>
        <p className="text-small text-ink-dim">
          Eight, spaced in hue so they stay separable in a 4px column, and kept
          clear of the amber so no subject reads as the running state.
        </p>
        {/* Shown at the width they actually appear in the day strip, which is
            the only test that matters for this palette. */}
        <div className="flex h-16 gap-px border border-hairline p-2">
          {SUBJECT_COLORS.map((c) => (
            <span
              key={c.id}
              title={c.label}
              className="w-1 shrink-0"
              style={{ backgroundColor: c.hex }}
            />
          ))}
          <span className="w-4" />
          {SUBJECT_COLORS.map((c) => (
            <span
              key={`${c.id}-wide`}
              title={c.label}
              className="flex-1"
              style={{ backgroundColor: c.hex }}
            />
          ))}
        </div>
        <p className="text-micro text-ink-dim">
          Left group is 4px wide, right group is full width.
        </p>
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="text-title font-medium">Type</h2>
        <p className="text-small text-ink-dim">
          IBM Plex Sans for everything, IBM Plex Mono for numerals only.
        </p>
        <ul className="flex flex-col gap-5">
          {SCALE.map((s) => (
            <li key={s.name} className="flex flex-col gap-1">
              <span className="text-micro text-ink-dim">{s.name}</span>
              <span className={s.cls}>{s.sample}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-title font-medium">Depth</h2>
        <p className="text-small text-ink-dim">
          Layered planes and hairlines. No shadows anywhere.
        </p>
        <div className="bg-sunk p-4">
          <div className="bg-surface border border-hairline p-4">
            <div className="bg-raised border border-hairline p-4">
              <div className="bg-raised-high border border-hairline-strong p-4 text-small">
                sunk, surface, raised, raised-high
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
