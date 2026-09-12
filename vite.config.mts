import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwind from "@tailwindcss/vite";
import { fileURLToPath } from "node:url";

const here = (p: string) => fileURLToPath(new URL(p, import.meta.url));

/**
 * Builds the static design preview in preview/ for GitHub Pages.
 *
 * It compiles the application's real components rather than a copy of them, so
 * what gets reviewed is the code that ships. The Next.js specific imports are
 * aliased to small shims, since none of them can run on a static page.
 *
 * This config is not used by the application build, which is still next build.
 */
export default defineConfig({
  root: here("preview"),
  // GitHub Pages serves a project site from /<repo>/.
  base: process.env.PREVIEW_BASE ?? "/SB/",
  plugins: [react(), tailwind()],
  publicDir: here("public"),
  resolve: {
    alias: [
      { find: "next/link", replacement: here("preview/shims/next-link.tsx") },
      { find: "next/navigation", replacement: here("preview/shims/next-navigation.ts") },
      { find: "@/app/auth-actions", replacement: here("preview/shims/auth-actions.ts") },
      { find: /^@\//, replacement: `${here(".")}/` },
    ],
  },
  define: {
    // lib/env parses these at import time and throws when they are absent.
    // The preview never makes a request, so placeholders are enough.
    "process.env.NEXT_PUBLIC_SUPABASE_URL": JSON.stringify("https://preview.invalid"),
    "process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY": JSON.stringify("preview-only"),
  },
  build: {
    outDir: here("preview-dist"),
    emptyOutDir: true,
  },
});
