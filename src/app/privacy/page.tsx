import Link from "next/link";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { Wordmark } from "@/components/landing/logo";

export const metadata = { title: "Privacy Policy — Edgebook" };

const SECTIONS = [
  {
    title: "What we collect",
    body: "When you sign in with Google, Edgebook receives your name, email address, and profile picture. This is used only to create and identify your account.",
  },
  {
    title: "Your journal data",
    body: "Your trades, notes, screenshots, and settings are stored in Google Drive or locally on your device. Edgebook does not sell, share, or use your data for advertising.",
  },
  {
    title: "AI coach",
    body: "When you use Minato, the AI coach, relevant parts of your journal are sent to the AI provider solely to generate a reply. Edgebook does not use your journal to train models.",
  },
  {
    title: "Deleting your data",
    body: "You can export or delete your journal files directly inside Google Drive, clear local device storage in Settings, or contact us at any time.",
  },
];

export default function PrivacyPage() {
  return (
    <div className="min-h-dvh bg-canvas text-ink">
      <header className="sticky top-0 z-30 border-b border-line bg-canvas/85 backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-4xl items-center justify-between px-4 sm:px-6 xl:px-8">
          <Link href="/" className="inline-flex items-center gap-2 text-ink transition-opacity hover:opacity-80">
            <Wordmark />
          </Link>
          <div className="flex items-center gap-2.5">
            <Link
              href="/login"
              className="rounded-full border border-line bg-surface px-3.5 py-1.5 text-[13px] font-medium text-muted transition-colors hover:border-line-strong hover:text-ink"
            >
              Log in
            </Link>
            <ThemeToggle className="rounded-full" />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-8 sm:px-6 sm:py-12 xl:py-16">
        <div className="mb-8">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gold">Legal & ownership</p>
          <h1 className="mt-2 font-display text-3xl font-semibold tracking-tight text-ink sm:text-4xl">
            Privacy Policy
          </h1>
          <p className="mt-2 text-sm text-muted">Last updated: September 2026</p>
        </div>

        <div className="space-y-4 sm:space-y-5">
          {SECTIONS.map((s) => (
            <section key={s.title} className="panel p-5 sm:p-7">
              <h2 className="font-display text-[17px] font-semibold tracking-tight text-ink">{s.title}</h2>
              <p className="mt-2 text-[14.5px] leading-relaxed text-muted">{s.body}</p>
            </section>
          ))}

          <section className="panel p-5 sm:p-7">
            <h2 className="font-display text-[17px] font-semibold tracking-tight text-ink">Contact</h2>
            <p className="mt-2 text-[14.5px] leading-relaxed text-muted">
              Questions or deletion requests:{" "}
              <a
                href="mailto:kanakesh939264@gmail.com"
                className="font-medium text-gold underline decoration-gold/40 underline-offset-4 hover:decoration-gold"
              >
                kanakesh939264@gmail.com
              </a>
            </p>
          </section>
        </div>
      </main>
    </div>
  );
}
