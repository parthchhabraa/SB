"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { supabaseServer } from "@/lib/supabase/server";

const credentials = z.object({
  email: z.string().email("That does not look like an email address."),
  password: z
    .string()
    .min(8, "Use at least 8 characters."),
});

export type AuthState = { error: string | null };

export async function signIn(
  _prev: AuthState,
  form: FormData,
): Promise<AuthState> {
  const parsed = credentials.safeParse({
    email: form.get("email"),
    password: form.get("password"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check those details." };
  }

  const supabase = await supabaseServer();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);

  if (error) {
    // Deliberately does not say which of the two was wrong, since that would
    // let anyone check whether an address has an account here.
    return { error: "That email and password do not match an account." };
  }

  // Only same-origin paths are honoured, so ?next= cannot be used to bounce
  // someone to another site after they sign in.
  const next = form.get("next");
  const safe =
    typeof next === "string" && next.startsWith("/") && !next.startsWith("//")
      ? next
      : "/";
  redirect(safe as Parameters<typeof redirect>[0]);
}

export async function signUp(
  _prev: AuthState,
  form: FormData,
): Promise<AuthState> {
  const parsed = credentials.safeParse({
    email: form.get("email"),
    password: form.get("password"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check those details." };
  }

  const supabase = await supabaseServer();
  const { error } = await supabase.auth.signUp(parsed.data);

  if (error) {
    return { error: error.message };
  }

  redirect("/onboarding");
}

export async function signOut() {
  const supabase = await supabaseServer();
  await supabase.auth.signOut();
  redirect("/sign-in");
}
