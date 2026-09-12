"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Field, TextInput } from "@/components/ui/field";
import type { AuthState } from "@/app/auth-actions";

function Submit({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="primary" disabled={pending} className="w-full">
      {pending ? `${label}...` : label}
    </Button>
  );
}

export function AuthForm({
  mode,
  action,
  next,
}: {
  mode: "sign-in" | "sign-up";
  action: (prev: AuthState, form: FormData) => Promise<AuthState>;
  next?: string;
}) {
  const [state, formAction] = useActionState<AuthState, FormData>(action, {
    error: null,
  });

  const isSignIn = mode === "sign-in";

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col gap-2">
        {/* The mark: a hairline plate with a single lit segment, which is the
            same idea the timer bezel uses when running. */}
        <div
          aria-hidden
          className="h-6 w-6 border border-hairline-strong rounded-plate relative"
        >
          <span className="absolute left-1 top-1 h-1 w-3 bg-signal" />
        </div>
        <h1 className="text-display font-medium">
          {isSignIn ? "Sign in" : "Create an account"}
        </h1>
        <p className="text-small text-ink-dim">
          {isSignIn
            ? "Pick up where your timer left off."
            : "Track study time, set a goal, and spend what you earn."}
        </p>
      </header>

      <form action={formAction} className="flex flex-col gap-5">
        {next ? <input type="hidden" name="next" value={next} /> : null}

        <Field label="Email" htmlFor="email">
          <TextInput
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            required
            autoCapitalize="none"
            spellCheck={false}
          />
        </Field>

        <Field
          label="Password"
          htmlFor="password"
          hint={isSignIn ? undefined : "At least 8 characters."}
          error={state.error ?? undefined}
        >
          <TextInput
            id="password"
            name="password"
            type="password"
            autoComplete={isSignIn ? "current-password" : "new-password"}
            required
            minLength={8}
          />
        </Field>

        <Submit label={isSignIn ? "Sign in" : "Create account"} />
      </form>

      <p className="text-small text-ink-dim">
        {isSignIn ? "No account yet? " : "Already have an account? "}
        <Link
          href={isSignIn ? "/sign-up" : "/sign-in"}
          className="text-ink underline underline-offset-4"
        >
          {isSignIn ? "Create one" : "Sign in"}
        </Link>
      </p>
    </div>
  );
}
