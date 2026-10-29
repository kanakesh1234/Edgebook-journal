"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { motion, useReducedMotion } from "motion/react";
import { useApp } from "@/lib/store";
import { AuthError } from "@/lib/services/auth";
import { useBootstrap } from "@/lib/bootstrap";
import { Button } from "@/components/ui/button";
import { Field, TextInput } from "@/components/ui/input";
import { toast } from "@/components/ui/toast";
import { Wordmark } from "@/components/landing/logo";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { CheckIcon, EyeIcon, GoogleIcon } from "@/components/ui/icons";
import { cn } from "@/lib/utils";
import { EASE } from "@/components/landing/reveal";

type Mode = "signin" | "signup";

const DRIVE_MESSAGES: Record<string, { tone: "error" | "info"; text: string }> = {
  not_configured: { tone: "error", text: "Google sign-in isn't configured on this server yet." },
  state_mismatch: { tone: "error", text: "The sign-in attempt expired. Please try again." },
  token_exchange_failed: { tone: "error", text: "Google sign-in couldn't be completed. Please try again." },
  folder_setup_failed: { tone: "error", text: "Your Edge Book Drive folder couldn't be prepared. Please try again." },
  no_email: { tone: "error", text: "Your Google account doesn't share an email address. Please try a different account." },
  account_store_unavailable: { tone: "error", text: "The account store is temporarily unavailable. Please try again in a moment." },
  access_denied: { tone: "info", text: "Sign-in was cancelled." },
  connected: { tone: "info", text: "Google Drive connected — welcome back." },
};

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="grid min-h-dvh place-items-center"><div className="h-6 w-6 animate-spin rounded-full border-2 border-line-strong border-t-gold" /></div>}>
      <LoginView />
    </Suspense>
  );
}

function LoginView() {
  useBootstrap();
  const router = useRouter();
  const params = useSearchParams();
  const status = useApp((s) => s.status);
  const reduce = useReducedMotion();

  const [mode, setMode] = useState<Mode>(params.get("mode") === "signup" ? "signup" : "signin");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [errors, setErrors] = useState<{ name?: string; email?: string; password?: string; form?: string }>({});
  const [busy, setBusy] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);

  const driveParam = params.get("drive");
  const driveMessage = !googleLoading && driveParam
    ? (DRIVE_MESSAGES[driveParam] ?? { tone: "error" as const, text: "Google sign-in encountered an unexpected issue. Please try again." })
    : undefined;

  useEffect(() => {
    if (driveParam === "connected") {
      router.replace("/dashboard");
      return;
    }
    if (status === "authenticated") router.replace("/dashboard");
  }, [status, router, driveParam]);

  const validate = (): boolean => {
    const next: typeof errors = {};
    if (!email.trim()) next.email = "Email is required.";
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) next.email = "That email doesn't look right.";
    if (!password) next.password = "Password is required.";
    else if (mode === "signup" && password.length < 8) next.password = "Use at least 8 characters.";
    if (mode === "signup" && name.trim().length > 40) next.name = "Keep it under 40 characters.";
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate() || busy) return;
    setBusy(true);
    setErrors({});
    try {
      if (mode === "signup") {
        await useApp.getState().signUp(name, email, password);
        toast.success("Welcome to Edgebook", "Your journal is ready — add your first trade.");
      } else {
        await useApp.getState().signIn(email, password);
      }
      router.replace("/dashboard");
    } catch (err) {
      if (err instanceof AuthError) {
        if (err.code === "email_taken") setErrors({ email: err.message });
        else if (err.code === "weak_password") setErrors({ password: err.message });
        else setErrors({ form: err.message });
      } else {
        setErrors({ form: "Something went wrong. Please try again." });
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="relative min-h-dvh overflow-hidden">
      {/* soft ambient light, nothing more */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(900px 520px at 12% 8%, color-mix(in srgb, var(--gold) 11%, transparent), transparent 70%), radial-gradient(700px 480px at 92% 96%, color-mix(in srgb, var(--profit) 8%, transparent), transparent 70%)",
        }}
      />

      <header className="relative z-10 mx-auto flex h-16 max-w-[1200px] items-center justify-between px-5 sm:px-8">
        <Link href="/" aria-label="Back to home" className="rounded-lg">
          <Wordmark />
        </Link>
        <ThemeToggle className="rounded-full" />
      </header>

      <div className="relative z-10 mx-auto grid max-w-[1200px] items-center gap-12 px-5 pb-16 pt-4 sm:px-8 lg:min-h-[calc(100dvh-4rem)] lg:grid-cols-[1.05fr_1fr] lg:gap-20 lg:pb-10 lg:pt-0">
        {/* ------------------------------ editorial side ------------------------------ */}
        <aside className="hidden lg:block">
          <motion.h1
            initial={reduce ? false : { opacity: 0, y: 22 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.9, ease: EASE }}
            className="max-w-xl font-display text-[clamp(2.6rem,4.6vw,4.2rem)] font-semibold leading-[1.04] tracking-[-0.045em] text-ink"
          >
            Every session sharpens{" "}
            <span className="font-serif text-[1.08em] font-normal italic tracking-[-0.02em] text-gold">your personal edge.</span>
          </motion.h1>

          <motion.svg
            viewBox="0 0 520 90"
            className="mt-12 w-full max-w-lg"
            aria-hidden
            initial={reduce ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.35, duration: 0.6 }}
          >
            <defs>
              <linearGradient id="login-eq" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%" stopColor="var(--color-profit)" />
                <stop offset="100%" stopColor="var(--color-gold)" />
              </linearGradient>
            </defs>
            <motion.path
              d="M4 76 C60 72 92 52 140 56 C190 60 218 34 272 38 C322 42 352 62 400 44 C450 26 478 16 514 10"
              fill="none"
              stroke="url(#login-eq)"
              strokeWidth="3"
              strokeLinecap="round"
              initial={reduce ? false : { pathLength: 0 }}
              animate={{ pathLength: 1 }}
              transition={{ duration: 1.8, delay: 0.5, ease: "easeInOut" }}
            />
            <motion.circle
              cx="514"
              cy="10"
              r="5"
              fill="var(--color-gold)"
              initial={reduce ? false : { opacity: 0, scale: 0 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 2.2, duration: 0.4 }}
            />
          </motion.svg>

          <ul className="mt-12 space-y-3.5 text-[16px] text-muted">
            {[
              "Your journal is saved to your own Google Drive, or stays on this device",
              "Plan, thought, setup, replay and autopsy in one flow",
              "Export everything as JSON whenever you want",
            ].map((t, i) => (
              <motion.li
                key={t}
                initial={reduce ? false : { opacity: 0, x: -12 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.7 + i * 0.1, duration: 0.6, ease: EASE }}
                className="flex items-start gap-3"
              >
                <CheckIcon className="mt-1 h-4 w-4 shrink-0 text-profit" />
                {t}
              </motion.li>
            ))}
          </ul>
        </aside>

        {/* --------------------------------- the sheet --------------------------------- */}
        <main className="flex justify-center lg:justify-end">
          <motion.div
            initial={reduce ? false : { opacity: 0, y: 28, scale: 0.985 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 0.8, delay: 0.1, ease: EASE }}
            className="w-full max-w-[440px] rounded-[32px] border border-line-strong/70 bg-surface p-7 shadow-[0_40px_90px_-40px_rgba(0,0,0,0.5)] [corner-shape:squircle] sm:p-9"
          >
            <h2 className="font-display text-[30px] font-semibold tracking-[-0.035em] text-ink">
              {mode === "signin" ? "Welcome back." : "Create your journal."}
            </h2>
            <p className="mt-1.5 text-[15px] leading-snug text-muted">
              {mode === "signin"
                ? "Sign in to open your journal and AI Brain."
                : "One account. Private Google Drive sync included."}
            </p>

            {driveMessage && (
              <p
                role="status"
                className={cn(
                  "mt-5 rounded-2xl border px-3.5 py-2.5 text-[13px]",
                  driveMessage.tone === "error"
                    ? "border-loss/25 bg-loss/[0.07] text-loss"
                    : "border-info/25 bg-info/[0.06] text-info",
                )}
              >
                {driveMessage.text}
              </p>
            )}

            {/* Primary: Google OAuth + Drive sync */}
            <button
              type="button"
              disabled={googleLoading || busy}
              onClick={(e) => {
                e.preventDefault();
                if (googleLoading || busy) return;
                setGoogleLoading(true);
                window.location.assign("/api/auth/google/start?next=/dashboard");
              }}
              className={cn(
                "group mt-7 flex h-12 w-full items-center justify-center gap-3 rounded-full bg-ink text-[15.5px] font-medium text-canvas transition duration-200 hover:opacity-90 active:scale-[0.985] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-gold/25",
                googleLoading && "pointer-events-none opacity-60",
              )}
              aria-label="Continue with Google"
              aria-busy={googleLoading}
            >
              {googleLoading ? (
                <span className="h-[18px] w-[18px] animate-spin rounded-full border-2 border-canvas/30 border-t-canvas" />
              ) : (
                <GoogleIcon className="h-[18px] w-[18px]" />
              )}
              {googleLoading ? "Connecting to Google Drive…" : "Continue with Google"}
            </button>
            <p className="mt-2.5 text-center text-[12.5px] text-faint">
              Recommended. Syncs your journal to your own Google Drive.
            </p>

            <div className="my-6 flex items-center gap-3 text-[12.5px] text-faint">
              <span className="h-px flex-1 bg-line" />
              or use email on this device
              <span className="h-px flex-1 bg-line" />
            </div>

            {/* Mode tabs */}
            <div role="tablist" aria-label="Authentication mode" className="grid grid-cols-2 gap-1 rounded-full bg-ink/[0.07] p-1">
              {(["signin", "signup"] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  role="tab"
                  aria-selected={mode === m}
                  onClick={() => {
                    setMode(m);
                    setErrors({});
                  }}
                  className={cn(
                    "relative rounded-full py-2 text-[13.5px] font-medium transition-colors",
                    mode === m ? "text-ink" : "text-faint hover:text-muted",
                  )}
                >
                  {mode === m && (
                    <motion.span
                      layoutId="auth-tab"
                      transition={{ type: "spring", stiffness: 480, damping: 38 }}
                      className="absolute inset-0 rounded-full border border-line-soft bg-raised shadow-sm"
                    />
                  )}
                  <span className="relative">{m === "signin" ? "Sign in" : "Create account"}</span>
                </button>
              ))}
            </div>

            <form onSubmit={submit} noValidate className="mt-5 space-y-4">
              {mode === "signup" && (
                <Field label="Name" error={errors.name} htmlFor="name">
                  <TextInput
                    id="name"
                    autoComplete="name"
                    placeholder="Alex Trader"
                    className="h-12 rounded-2xl"
                    value={name}
                    invalid={!!errors.name}
                    onChange={(e) => setName(e.target.value)}
                  />
                </Field>
              )}

              <Field label="Email" error={errors.email} htmlFor="email">
                <TextInput
                  id="email"
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  placeholder="you@example.com"
                  className="h-12 rounded-2xl"
                  value={email}
                  invalid={!!errors.email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </Field>

              <Field label="Password" error={errors.password} htmlFor="password" hint={mode === "signup" ? "min 8 characters" : undefined}>
                <div className="relative">
                  <TextInput
                    id="password"
                    type={showPw ? "text" : "password"}
                    autoComplete={mode === "signup" ? "new-password" : "current-password"}
                    placeholder="••••••••"
                    className="h-12 rounded-2xl pr-12"
                    value={password}
                    invalid={!!errors.password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPw((v) => !v)}
                    aria-label={showPw ? "Hide password" : "Show password"}
                    className="absolute right-3 top-1/2 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-full text-faint hover:bg-ink/[0.06] hover:text-ink"
                  >
                    <EyeIcon className={cn("h-4 w-4 transition-opacity", !showPw && "opacity-60")} />
                  </button>
                </div>
              </Field>

              {errors.form && (
                <p role="alert" className="rounded-2xl border border-loss/25 bg-loss/[0.07] px-3.5 py-2.5 text-[13px] text-loss">
                  {errors.form}
                </p>
              )}

              <Button type="submit" variant="gold" loading={busy} disabled={busy} className="h-12 w-full rounded-full text-[15.5px] font-medium">
                {mode === "signin" ? "Sign in" : "Create journal"}
              </Button>
            </form>

            <p className="mt-6 text-center text-[12.5px] leading-relaxed text-faint">
              Your journal stays private: in your own Google Drive, or locally on this device.
            </p>
          </motion.div>
        </main>
      </div>
    </div>
  );
}
