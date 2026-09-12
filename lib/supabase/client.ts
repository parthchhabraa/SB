"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "./database.types";
import { publicEnv } from "@/lib/env";

let cached: ReturnType<typeof createBrowserClient<Database>> | null = null;

export function supabaseBrowser() {
  cached ??= createBrowserClient<Database>(
    publicEnv.supabaseUrl,
    publicEnv.supabaseAnonKey,
  );
  return cached;
}

export type SupabaseBrowser = ReturnType<typeof supabaseBrowser>;
