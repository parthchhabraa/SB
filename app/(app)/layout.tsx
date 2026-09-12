import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import { Providers } from "@/app/providers";
import { AppNav } from "@/components/app-nav";

export default async function AppLayout({ children }: { children: ReactNode }) {
  const supabase = await supabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/sign-in");

  // An account that has not chosen a handle and timezone yet cannot use the
  // rest of the app correctly, since every date calculation depends on the zone.
  const { data: profile } = await supabase
    .from("profiles")
    .select("timezone")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile || profile.timezone === "UTC") {
    redirect("/onboarding");
  }

  return (
    <Providers>
      <div className="min-h-dvh flex flex-col">
        <main className="flex-1 pb-20">{children}</main>
        <AppNav />
      </div>
    </Providers>
  );
}
