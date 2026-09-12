"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { supabaseBrowser } from "@/lib/supabase/client";
import { api, RpcError } from "@/lib/supabase/rpc";
import { Button } from "@/components/ui/button";
import { Field, TextInput, Select } from "@/components/ui/field";
import { GOALS } from "@/lib/config";

const GOAL_CHOICES = [30, 60, 90, 120, 180, 240, 300, 360] as const;

export function OnboardingForm({
  defaultHandle,
  defaultName,
}: {
  defaultHandle: string;
  defaultName: string;
}) {
  const router = useRouter();
  const [handle, setHandle] = useState(defaultHandle);
  const [displayName, setDisplayName] = useState(defaultName);
  const [goal, setGoal] = useState<number>(GOALS.defaultDailyMinutes);

  // The browser is the only thing that actually knows the person's zone, and
  // every date calculation in the app depends on getting it right.
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";

  const save = useMutation({
    mutationFn: async () => {
      const supabase = supabaseBrowser();
      await api.completeOnboarding(supabase, {
        handle: handle.trim().toLowerCase(),
        displayName: displayName.trim(),
        timezone,
        dailyGoalMinutes: goal,
      });
    },
    onSuccess: () => {
      router.replace("/subjects");
      router.refresh();
    },
  });

  const handleError =
    save.error instanceof RpcError && save.error.hint === "handle_taken"
      ? "That handle is taken. Try another."
      : save.error
        ? "Could not save that. Check your connection and try again."
        : undefined;

  const handleValid = /^[a-z0-9_]{3,20}$/.test(handle.trim().toLowerCase());

  return (
    <form
      className="flex flex-col gap-8"
      onSubmit={(e) => {
        e.preventDefault();
        save.mutate();
      }}
    >
      <header className="flex flex-col gap-2">
        <h1 className="text-display font-medium">Set up your account</h1>
        <p className="text-small text-ink-dim">
          Three things, then you can start the timer.
        </p>
      </header>

      <Field
        label="Handle"
        htmlFor="handle"
        hint="Lowercase letters, numbers and underscores. Friends add you by this."
        error={handleError}
      >
        <TextInput
          id="handle"
          value={handle}
          onChange={(e) => setHandle(e.target.value)}
          autoCapitalize="none"
          spellCheck={false}
          required
          minLength={3}
          maxLength={20}
        />
      </Field>

      <Field label="Display name" htmlFor="display-name">
        <TextInput
          id="display-name"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          required
          maxLength={60}
        />
      </Field>

      <Field
        label="Daily goal"
        htmlFor="goal"
        hint={`Times are recorded in ${timezone}. You can change all of this later.`}
      >
        <Select
          id="goal"
          value={goal}
          onChange={(e) => setGoal(Number(e.target.value))}
        >
          {GOAL_CHOICES.map((m) => (
            <option key={m} value={m}>
              {m < 60 ? `${m} minutes` : `${m / 60} hour${m === 60 ? "" : "s"}`}
            </option>
          ))}
        </Select>
      </Field>

      <Button
        type="submit"
        variant="primary"
        disabled={save.isPending || !handleValid || displayName.trim().length === 0}
      >
        {save.isPending ? "Saving..." : "Start"}
      </Button>
    </form>
  );
}
