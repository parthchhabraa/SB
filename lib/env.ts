import { z } from "zod";

// Parsed once at module load so a missing or malformed value fails loudly at
// startup rather than as a confusing runtime error inside a query.
const schema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(
    "NEXT_PUBLIC_SUPABASE_URL must be a full URL, for example https://abc.supabase.co",
  ),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(
    1,
    "NEXT_PUBLIC_SUPABASE_ANON_KEY is missing. Copy it from your Supabase project settings.",
  ),
});

// Next.js inlines NEXT_PUBLIC_* at build time only when referenced statically,
// so these cannot be read from a dynamic key.
const parsed = schema.safeParse({
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
});

if (!parsed.success) {
  const detail = parsed.error.issues.map((i) => i.message).join("\n  ");
  throw new Error(
    `Supabase is not configured.\n  ${detail}\n` +
      "Copy .env.example to .env.local and fill in your project's values.",
  );
}

export const publicEnv = {
  supabaseUrl: parsed.data.NEXT_PUBLIC_SUPABASE_URL,
  supabaseAnonKey: parsed.data.NEXT_PUBLIC_SUPABASE_ANON_KEY,
} as const;
