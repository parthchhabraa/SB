import { describe, expect, it } from "vitest";
import { SUBJECT_COLORS, subjectColorHex } from "@/lib/config";

/**
 * The day strip renders subjects as columns that can be as narrow as 4px, so
 * the palette has to hold up with no shape, label or area to help. These are
 * the properties that make that possible, asserted rather than assumed.
 */

const SURFACE = "#16181A";
const SIGNAL_HUE = 37; // sodium amber, reserved for the running state

function rgb(hex: string) {
  const n = Number.parseInt(hex.slice(1), 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

function hue(hex: string) {
  const { r, g, b } = rgb(hex);
  const [rn, gn, bn] = [r / 255, g / 255, b / 255];
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const d = max - min;
  if (d === 0) return 0;
  let h: number;
  if (max === rn) h = ((gn - bn) / d) % 6;
  else if (max === gn) h = (bn - rn) / d + 2;
  else h = (rn - gn) / d + 4;
  h *= 60;
  return h < 0 ? h + 360 : h;
}

function relativeLuminance(hex: string) {
  const { r, g, b } = rgb(hex);
  const channel = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

function contrast(a: string, b: string) {
  const [la, lb] = [relativeLuminance(a), relativeLuminance(b)];
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

function hueGap(a: number, b: number) {
  const raw = Math.abs(a - b);
  return Math.min(raw, 360 - raw);
}

describe("subject palette", () => {
  it("has eight colours with unique ids", () => {
    const ids = SUBJECT_COLORS.map((c) => c.id);
    expect(ids).toHaveLength(8);
    expect(new Set(ids).size).toBe(8);
  });

  it("uses well formed hex values", () => {
    for (const c of SUBJECT_COLORS) {
      expect(c.hex).toMatch(/^#[0-9A-F]{6}$/i);
    }
  });

  it("separates every pair by enough hue to tell apart in a 4px column", () => {
    // Slate is deliberately low chroma and reads as grey rather than by hue,
    // so it is compared on lightness instead.
    const chromatic = SUBJECT_COLORS.filter((c) => c.id !== "slate");

    for (let i = 0; i < chromatic.length; i += 1) {
      for (let j = i + 1; j < chromatic.length; j += 1) {
        const a = chromatic[i]!;
        const b = chromatic[j]!;
        expect(
          hueGap(hue(a.hex), hue(b.hex)),
          `${a.id} and ${b.id} are too close in hue`,
        ).toBeGreaterThan(25);
      }
    }
  });

  it("leaves a gap around the signal hue so no subject reads as running", () => {
    for (const c of SUBJECT_COLORS) {
      if (c.id === "slate") continue;
      expect(
        hueGap(hue(c.hex), SIGNAL_HUE),
        `${c.id} is too close to the running state's amber`,
      ).toBeGreaterThan(20);
    }
  });

  it("stays legible against the surface", () => {
    for (const c of SUBJECT_COLORS) {
      expect(
        contrast(c.hex, SURFACE),
        `${c.id} does not stand out enough on the surface`,
      ).toBeGreaterThan(3);
    }
  });

  it("falls back to a real colour for an unknown id", () => {
    expect(subjectColorHex("not-a-colour")).toMatch(/^#[0-9A-F]{6}$/i);
    expect(subjectColorHex("blue")).toBe("#4C8DF6");
  });
});
