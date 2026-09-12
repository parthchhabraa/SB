/**
 * Renders every screen of the design preview in a real browser and saves a
 * screenshot of each, reporting any console or page errors.
 *
 * Used to check a design change without a person having to click through ten
 * screens. Expects the built preview to be served somewhere:
 *
 *   npm run preview:build
 *   npx serve preview-dist   (or any static server)
 *   node scripts/shoot-preview.mjs http://127.0.0.1:3000/ ./shots
 */
import { mkdir } from "node:fs/promises";
import { chromium } from "playwright";

const url = process.argv[2] ?? "http://127.0.0.1:3200/SB/";
const outDir = process.argv[3] ?? "./shots";

const SCREENS = [
  "Tokens", "Sign in", "Sign up", "Onboarding",
  "Subjects", "Subjects, empty", "Subjects, loading",
  "Settings", "Privacy", "Terms",
];

const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

await mkdir(outDir, { recursive: true });

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH ?? undefined,
});
const page = await browser.newPage({
  viewport: { width: 1280, height: 900 },
  deviceScaleFactor: 2,
});

const errors = [];
page.on("pageerror", (e) => errors.push(`page error: ${e}`));
page.on("console", (m) => {
  if (m.type() !== "error") return;
  // Google Fonts is blocked in some sandboxes; that is not a build problem.
  if (/fonts\.(googleapis|gstatic)/.test(m.text())) return;
  errors.push(`console: ${m.text()}`);
});

await page.goto(url, { waitUntil: "domcontentloaded" });
await page.waitForSelector("#root nav", { timeout: 15000 });

for (const label of SCREENS) {
  await page.getByRole("button", { name: label, exact: true }).click();
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${outDir}/${slug(label)}.png`, fullPage: true });
  console.log(`  ${label}`);
}

if (errors.length > 0) {
  console.error(`\n${errors.length} error(s):`);
  for (const e of errors.slice(0, 10)) console.error(`  ${e}`);
  await browser.close();
  process.exit(1);
}

console.log(`\nAll ${SCREENS.length} screens rendered with no errors.`);
await browser.close();
