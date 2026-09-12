"use client";

import { useQuery } from "@tanstack/react-query";
import { supabaseBrowser } from "@/lib/supabase/client";
import { qk } from "./keys";

export type Profile = {
  id: string;
  handle: string;
  display_name: string;
  timezone: string;
  daily_goal_minutes: number;
  hide_subjects_from_friends: boolean;
  pomodoro_work_minutes: number;
  pomodoro_break_minutes: number;
  pomodoro_long_break_minutes: number;
  pomodoro_rounds_before_long_break: number;
};

export function useProfile() {
  return useQuery({
    queryKey: qk.profile,
    queryFn: async (): Promise<Profile | null> => {
      const supabase = supabaseBrowser();
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) return null;

      const { data, error } = await supabase
        .from("profiles")
        // One string literal, not a concatenation: postgrest-js infers the
        // result type from the literal, and a joined string erases it.
        .select("id, handle, display_name, timezone, daily_goal_minutes, hide_subjects_from_friends, pomodoro_work_minutes, pomodoro_break_minutes, pomodoro_long_break_minutes, pomodoro_rounds_before_long_break")
        .eq("id", auth.user.id)
        .maybeSingle();

      if (error) throw new Error(error.message);
      return data;
    },
  });
}
