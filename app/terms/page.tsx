import Link from "next/link";

export const metadata = { title: "Terms" };

export default function TermsPage() {
  return (
    <main className="mx-auto max-w-2xl px-4 py-12 flex flex-col gap-8">
      <header className="flex flex-col gap-2">
        <h1 className="text-display font-medium">Terms</h1>
        <p className="text-small text-ink-dim">Last updated 12 September 2026.</p>
      </header>

      <section className="flex flex-col gap-3 text-body">
        <h2 className="text-title font-medium">Using the app</h2>
        <p className="text-ink-dim">
          You need an account to track time. Keep your password to yourself, and
          do not use the app to harass anyone through the friends features.
        </p>
      </section>

      <section className="flex flex-col gap-3 text-body">
        <h2 className="text-title font-medium">Your data is yours</h2>
        <p className="text-ink-dim">
          The sessions, subjects and rewards you create belong to you. You can
          delete them, or your whole account, at any time.
        </p>
      </section>

      <section className="flex flex-col gap-3 text-body">
        <h2 className="text-title font-medium">Points and rewards</h2>
        <p className="text-ink-dim">
          Points exist inside this app only. They have no monetary value, cannot
          be transferred, and cannot be bought. The rewards are ones you write
          for yourself, and honouring them is up to you.
        </p>
      </section>

      <section className="flex flex-col gap-3 text-body">
        <h2 className="text-title font-medium">No guarantee</h2>
        <p className="text-ink-dim">
          The app is provided as it is. Time is recorded as accurately as we can
          manage, but it is not a legal record of anything.
        </p>
      </section>

      <Link href="/sign-in" className="text-small text-ink underline underline-offset-4">
        Back to sign in
      </Link>
    </main>
  );
}
