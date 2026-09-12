import { useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { AuthForm } from "@/components/auth-form";
import { OnboardingForm } from "@/components/onboarding-form";
import { SubjectsScreen } from "@/components/subjects/subjects-screen";
import { SettingsScreen } from "@/components/settings-screen";
import { AppNav } from "@/components/app-nav";
import PrivacyPage from "@/app/privacy/page";
import TermsPage from "@/app/terms/page";

import { qk } from "@/lib/queries/keys";
import { signIn, signUp } from "./shims/auth-actions";
import { setPreviewPath } from "./shims/next-navigation";
import { TokensBoard } from "./tokens-board";
import * as fixtures from "./fixtures";

type ScreenId =
  | "tokens"
  | "sign-in"
  | "sign-up"
  | "onboarding"
  | "subjects"
  | "subjects-empty"
  | "subjects-loading"
  | "settings"
  | "privacy"
  | "terms";

const SCREENS: { id: ScreenId; label: string; path: string; chrome: boolean }[] = [
  { id: "tokens", label: "Tokens", path: "/tokens", chrome: false },
  { id: "sign-in", label: "Sign in", path: "/sign-in", chrome: false },
  { id: "sign-up", label: "Sign up", path: "/sign-up", chrome: false },
  { id: "onboarding", label: "Onboarding", path: "/onboarding", chrome: false },
  { id: "subjects", label: "Subjects", path: "/subjects", chrome: true },
  { id: "subjects-empty", label: "Subjects, empty", path: "/subjects", chrome: true },
  { id: "subjects-loading", label: "Subjects, loading", path: "/subjects", chrome: true },
  { id: "settings", label: "Settings", path: "/settings", chrome: true },
  { id: "privacy", label: "Privacy", path: "/privacy", chrome: false },
  { id: "terms", label: "Terms", path: "/terms", chrome: false },
];

/**
 * Each screen gets its own client, seeded with whatever that screen is meant
 * to show. Queries never fetch, so the real components render their real
 * loaded, empty and pending states without a backend behind them.
 */
function clientFor(screen: ScreenId) {
  const client = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        staleTime: Number.POSITIVE_INFINITY,
        gcTime: Number.POSITIVE_INFINITY,
        refetchOnMount: false,
        refetchOnWindowFocus: false,
        refetchOnReconnect: false,
        // The loading screen is produced by leaving a query with no seeded
        // data and a promise that never settles.
        queryFn: () => new Promise(() => {}),
      },
    },
  });

  if (screen === "subjects-loading") return client;

  client.setQueryData(qk.profile, fixtures.profile);
  client.setQueryData(
    qk.subjects,
    screen === "subjects-empty" ? [] : fixtures.subjects,
  );
  for (const subject of fixtures.subjects) {
    client.setQueryData(
      qk.subtopics(subject.id),
      fixtures.subtopics[subject.id] ?? [],
    );
  }

  return client;
}

function Screen({ id }: { id: ScreenId }) {
  switch (id) {
    case "tokens":
      return <TokensBoard />;
    case "sign-in":
      return <Centered><AuthForm mode="sign-in" action={signIn} /></Centered>;
    case "sign-up":
      return <Centered><AuthForm mode="sign-up" action={signUp} /></Centered>;
    case "onboarding":
      return (
        <Centered>
          <OnboardingForm defaultHandle="parth" defaultName="Parth" />
        </Centered>
      );
    case "subjects":
    case "subjects-empty":
    case "subjects-loading":
      return <SubjectsScreen />;
    case "settings":
      return <SettingsScreen />;
    case "privacy":
      return <PrivacyPage />;
    case "terms":
      return <TermsPage />;
  }
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-center px-4 py-10 min-h-[80vh]">
      <div className="w-full max-w-sm">{children}</div>
    </div>
  );
}

export function PreviewApp() {
  const [screen, setScreen] = useState<ScreenId>("tokens");
  const [narrow, setNarrow] = useState(true);

  const current = SCREENS.find((s) => s.id === screen) ?? SCREENS[0]!;
  setPreviewPath(current.path);

  return (
    <div className="min-h-dvh flex flex-col lg:flex-row">
      {/* Preview chrome. Not part of the product, and styled to sit apart
          from it so it cannot be mistaken for a screen. */}
      <aside className="lg:w-56 lg:shrink-0 lg:h-dvh lg:sticky lg:top-0 border-b lg:border-b-0 lg:border-r border-hairline bg-sunk">
        <div className="p-4 flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <p className="text-small text-ink">Design preview</p>
            <p className="text-micro text-ink-dim">
              Real components, fixture data, no backend.
            </p>
          </div>

          <nav aria-label="Screens">
            <ul className="flex flex-wrap lg:flex-col gap-1">
              {SCREENS.map((s) => (
                <li key={s.id}>
                  <button
                    type="button"
                    onClick={() => setScreen(s.id)}
                    aria-current={s.id === screen ? "true" : undefined}
                    className={
                      "w-full text-left px-2.5 py-2 text-small rounded-plate border transition-colors " +
                      (s.id === screen
                        ? "border-hairline-strong bg-raised text-ink"
                        : "border-transparent text-ink-dim hover:text-ink hover:bg-raised")
                    }
                  >
                    {s.label}
                  </button>
                </li>
              ))}
            </ul>
          </nav>

          <label className="flex items-center gap-2 text-micro text-ink-dim cursor-pointer">
            <input
              type="checkbox"
              checked={narrow}
              onChange={(e) => setNarrow(e.target.checked)}
              className="h-4 w-4 accent-signal"
            />
            Phone width
          </label>
        </div>
      </aside>

      <main className="flex-1 min-w-0 flex justify-center">
        {/* A transform makes this element the containing block for the
            fixed-position nav, so the app chrome stays inside the phone frame
            instead of spanning the preview window. */}
        <div
          style={{ transform: "translateZ(0)" }}
          className={
            "w-full bg-surface relative min-h-dvh " +
            (narrow ? "max-w-[420px] lg:border-x border-hairline" : "")
          }
        >
          <QueryClientProvider key={screen} client={clientFor(screen)}>
            <div className={current.chrome ? "pb-20" : ""}>
              <Screen id={screen} />
            </div>
            {current.chrome ? <AppNav /> : null}
          </QueryClientProvider>
        </div>
      </main>
    </div>
  );
}
