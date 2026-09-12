"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabaseBrowser } from "@/lib/supabase/client";
import { useProfile, type Profile } from "@/lib/queries/profile";
import { qk } from "@/lib/queries/keys";
import { Button } from "@/components/ui/button";
import { Field, TextInput, Select } from "@/components/ui/field";
import { SkeletonRows } from "@/components/ui/skeleton";
import { signOut } from "@/app/auth-actions";
import type { Database } from "@/lib/supabase/database.types";

type ProfilePatch = Database["public"]["Tables"]["profiles"]["Update"];

export function SettingsScreen() {
  const profile = useProfile();

  if (profile.isPending) {
    return (
      <div className="mx-auto max-w-xl px-4 py-8 flex flex-col gap-6">
        <h1 className="text-display font-medium">Settings</h1>
        <SkeletonRows rows={4} />
      </div>
    );
  }

  if (profile.isError || !profile.data) {
    return (
      <div className="mx-auto max-w-xl px-4 py-8 flex flex-col gap-4">
        <h1 className="text-display font-medium">Settings</h1>
        <p role="alert" className="text-body">
          Could not load your profile.
        </p>
        <p className="text-small text-ink-dim">
          {profile.error?.message ?? "Reload the page, and sign in again if it keeps happening."}
        </p>
        <div>
          <Button onClick={() => profile.refetch()}>Try again</Button>
        </div>
      </div>
    );
  }

  // Keyed on the profile id so the form state is initialised from props
  // once, rather than synchronised into state by an effect.
  return <SettingsForm key={profile.data.id} me={profile.data} />;
}

function SettingsForm({ me }: { me: Profile }) {
  const qc = useQueryClient();

  const [displayName, setDisplayName] = useState(me.display_name);
  const [handle, setHandle] = useState(me.handle);
  const [hideSubjects, setHideSubjects] = useState(me.hide_subjects_from_friends);
  const [work, setWork] = useState<number>(me.pomodoro_work_minutes);
  const [brk, setBrk] = useState<number>(me.pomodoro_break_minutes);

  const browserZone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  const zoneMismatch = me.timezone !== browserZone;

  const save = useMutation({
    mutationFn: async (patch: ProfilePatch) => {
      const supabase = supabaseBrowser();
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) throw new Error("You are signed out. Sign in and try again.");

      const { error } = await supabase
        .from("profiles")
        .update(patch)
        .eq("id", auth.user.id);

      if (error) {
        throw new Error(
          error.message.includes("profiles_handle_key")
            ? "That handle is taken. Try another."
            : error.message.includes("profiles_handle_format")
              ? "Handles use lowercase letters, numbers and underscores, 3 to 20 characters."
              : error.message,
        );
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.profile }),
  });

  return (
    <div className="mx-auto max-w-xl px-4 py-8 flex flex-col gap-8">
      <h1 className="text-display font-medium">Settings</h1>

      <section className="flex flex-col gap-4">
        <h2 className="text-title font-medium">You</h2>

        <Field label="Display name" htmlFor="display-name">
          <TextInput
            id="display-name"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            onBlur={() => {
              if (displayName.trim() && displayName !== me.display_name) {
                save.mutate({ display_name: displayName.trim() });
              }
            }}
            maxLength={60}
          />
        </Field>

        <Field
          label="Handle"
          htmlFor="handle"
          hint="Friends add you by this."
          error={save.error?.message}
        >
          <TextInput
            id="handle"
            value={handle}
            onChange={(e) => setHandle(e.target.value.toLowerCase())}
            onBlur={() => {
              if (handle !== me.handle) save.mutate({ handle });
            }}
            autoCapitalize="none"
            spellCheck={false}
            maxLength={20}
          />
        </Field>
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="text-title font-medium">Timezone</h2>
        <p className="text-small text-ink-dim">
          Your days, streaks and goals are measured in {me.timezone}.
        </p>
        {zoneMismatch ? (
          <div className="border border-hairline rounded-plate p-4 flex flex-col gap-3">
            <p className="text-small">
              This device is in {browserZone}. Updating will re-bucket your
              history into the new zone, so a session near midnight may move to
              a different day.
            </p>
            <div>
              <Button onClick={() => save.mutate({ timezone: browserZone })}>
                Use {browserZone}
              </Button>
            </div>
          </div>
        ) : null}
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="text-title font-medium">Privacy</h2>
        <label className="flex items-start gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={hideSubjects}
            onChange={(e) => {
              setHideSubjects(e.target.checked);
              save.mutate({ hide_subjects_from_friends: e.target.checked });
            }}
            className="mt-1 h-5 w-5 accent-signal"
          />
          <span className="flex flex-col gap-1">
            <span className="text-body">Hide subject names from friends</span>
            <span className="text-small text-ink-dim">
              Friends still see your totals and that you are studying, but not
              what you are studying.
            </span>
          </span>
        </label>
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="text-title font-medium">Pomodoro</h2>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Work" htmlFor="work">
            <Select
              id="work"
              value={work}
              onChange={(e) => {
                const v = Number(e.target.value);
                setWork(v);
                save.mutate({ pomodoro_work_minutes: v });
              }}
            >
              {[15, 20, 25, 30, 40, 45, 50, 60, 90].map((m) => (
                <option key={m} value={m}>{m} minutes</option>
              ))}
            </Select>
          </Field>
          <Field label="Break" htmlFor="break">
            <Select
              id="break"
              value={brk}
              onChange={(e) => {
                const v = Number(e.target.value);
                setBrk(v);
                save.mutate({ pomodoro_break_minutes: v });
              }}
            >
              {[3, 5, 8, 10, 15, 20].map((m) => (
                <option key={m} value={m}>{m} minutes</option>
              ))}
            </Select>
          </Field>
        </div>
      </section>

      <section className="pt-4 border-t border-hairline">
        <form action={signOut}>
          <Button type="submit">Sign out</Button>
        </form>
      </section>
    </div>
  );
}
