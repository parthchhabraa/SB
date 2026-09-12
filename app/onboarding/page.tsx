import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import { Providers } from "@/app/providers";
import { OnboardingForm } from "@/components/onboarding-form";

export const metadata = { title: "Set up" };

export default async function OnboardingPage() {
  const supabase = await supabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/sign-in");

  const { data: profile } = await supabase
    .from("profiles")
    .select("handle, display_name, timezone, daily_goal_minutes")
    .eq("id", user.id)
    .maybeSingle();

  if (profile && profile.timezone !== "UTC") redirect("/subjects");

  return (
    <Providers>
      <main className="min-h-dvh flex items-center justify-center px-4 py-10">
        <div className="w-full max-w-sm">
          <OnboardingForm
            defaultHandle={profile?.handle ?? ""}
            defaultName={profile?.display_name ?? ""}
          />
        </div>
      </main>
    </Providers>
  );
}
