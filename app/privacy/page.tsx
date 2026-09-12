import Link from "next/link";

export const metadata = { title: "Privacy" };

export default function PrivacyPage() {
  return (
    <main className="mx-auto max-w-2xl px-4 py-12 flex flex-col gap-8">
      <header className="flex flex-col gap-2">
        <h1 className="text-display font-medium">Privacy</h1>
        <p className="text-small text-ink-dim">Last updated 12 September 2026.</p>
      </header>

      <section className="flex flex-col gap-3 text-body">
        <h2 className="text-title font-medium">What is stored</h2>
        <p className="text-ink-dim">
          Your email address, the handle and display name you choose, your
          timezone, the subjects you create, and a record of every study session
          with its start and end times. Points, goals, rewards and redemptions
          are stored alongside them.
        </p>
      </section>

      <section className="flex flex-col gap-3 text-body">
        <h2 className="text-title font-medium">What friends can see</h2>
        <p className="text-ink-dim">
          People you have accepted as friends can see your display name, your
          handle, your study totals, and whether you are studying right now. If
          you turn on hiding subject names in settings, they see that you are
          studying but not what. They never see your notes, your points balance,
          your goals or your rewards.
        </p>
      </section>

      <section className="flex flex-col gap-3 text-body">
        <h2 className="text-title font-medium">Who else can see it</h2>
        <p className="text-ink-dim">
          Nobody. Your data is not sold, shared with advertisers, or used to
          train anything. Access is enforced in the database itself rather than
          only in the app, so a bug in a screen cannot expose another
          person&rsquo;s sessions.
        </p>
      </section>

      <section className="flex flex-col gap-3 text-body">
        <h2 className="text-title font-medium">Deleting your data</h2>
        <p className="text-ink-dim">
          Deleting your account removes your profile, subjects, sessions,
          points, goals, rewards and friendships. This cannot be undone.
        </p>
      </section>

      <Link href="/sign-in" className="text-small text-ink underline underline-offset-4">
        Back to sign in
      </Link>
    </main>
  );
}
