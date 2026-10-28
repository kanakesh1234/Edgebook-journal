"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { motion } from "motion/react";
import { useApp } from "@/lib/store";
import { AuthError } from "@/lib/services/auth";
import { useBootstrap } from "@/lib/bootstrap";
import { Button } from "@/components/ui/button";
import { Field, TextInput } from "@/components/ui/input";
import { toast } from "@/components/ui/toast";
import { Wordmark } from "@/components/landing/logo";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { ArrowRightIcon, CheckIcon, EyeIcon, GoogleIcon } from "@/components/ui/icons";
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
    <div className="grid min-h-dvh lg:grid-cols-[1.08fr_1fr]">
      {/* ------------------------------ Apple HIG Spatial Brand Panel ------------------------------ */}
      <aside className="relative hidden overflow-hidden border-r border-line bg-surface lg:block">
        <div className="grid-backdrop absolute inset-0 opacity-50" aria-hidden />
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "radial-gradient(640px 420px at 15% 20%, rgba(94,92,230,0.10), transparent 70%), radial-gradient(540px 380px at 85% 80%, rgba(236,192,99,0.09), transparent 70%)",
          }}
        />

        <div className="relative flex h-full flex-col justify-between p-12 xl:p-14">
          <div className="flex items-center justify-between">
            <Link href="/" aria-label="Back to home">
              <Wordmark />
            </Link>
            <ThemeToggle />
          </div>

          <div className="my-auto py-8">
            <motion.div
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.55, ease: EASE }}
              className="inline-flex items-center gap-2 rounded-full border border-line-strong bg-raised/85 px-3.5 py-1 text-xs font-semibold text-muted backdrop-blur"
            >
              <span className="h-2 w-2 rounded-full bg-profit" />
              <span>Google Drive Synced · AI Brain v1</span>
            </motion.div>

            <motion.h1
              initial={{ opacity: 0, y: 22 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.68, delay: 0.08, ease: EASE }}
              className="mt-5 max-w-lg font-display text-[42px] font-bold leading-[1.06] tracking-[-0.03em] text-ink xl:text-[48px]"
            >
              Every trade trains{" "}
              <span className="font-serif font-normal italic text-gold-grad">your personal AI Brain.</span>
            </motion.h1>
            <motion.p
              initial={{ opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.68, delay: 0.16, ease: EASE }}
              className="mt-4 max-w-md text-[15px] leading-relaxed text-muted"
            >
              Sign in to sync your private Google Drive journal—complete with pre-trade Thought guardrails, 16:9 trade replays, 3-minute reviews, and spaced-repetition practice arenas.
            </motion.p>

            {/* Live Apple Bento Telemetry Preview Card */}
            <motion.div
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.72, delay: 0.24, ease: EASE }}
              className="mt-8 max-w-lg space-y-3 rounded-[24px] border border-line-strong bg-raised/85 p-5 shadow-xl backdrop-blur-xl"
            >
              <div className="flex items-center justify-between border-b border-line-soft pb-3">
                <div>
                  <p className="text-[10.5px] font-semibold uppercase tracking-[0.1em] text-[#5e5ce6] dark:text-[#a5a4ff]">
                    EdgeBook AI Brain · Drive Record
                  </p>
                  <p className="mt-0.5 text-sm font-semibold text-ink">
                    Plan → Thought → Setup → Autopsy Connected
                  </p>
                </div>
                <span className="rounded-full bg-profit/15 px-2.5 py-0.5 font-mono text-[11px] font-semibold text-profit">
                  94% Clarity
                </span>
              </div>

              <div className="grid grid-cols-3 gap-2.5 pt-1">
                <div className="rounded-2xl border border-line-soft bg-surface px-3 py-2.5">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-faint">16:9 Replays</p>
                  <p className="mt-0.5 text-xs font-semibold text-ink">2-Line Mistake Strip</p>
                </div>
                <div className="rounded-2xl border border-line-soft bg-surface px-3 py-2.5">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-faint">Reviews</p>
                  <p className="mt-0.5 text-xs font-semibold text-ink">3-Min Smart Chips</p>
                </div>
                <div className="rounded-2xl border border-line-soft bg-surface px-3 py-2.5">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-faint">Practice</p>
                  <p className="mt-0.5 text-xs font-semibold text-ink">5 Neural Arenas</p>
                </div>
              </div>
            </motion.div>
          </div>

          <ul className="space-y-2.5 text-[13.5px] text-muted">
            {[
              "Journal & AI Brain stay 100% private in your own Google Drive",
              "Interactive Equity Curve & live-scrubbing session calendar",
              "Instant JSON export and offline local resilience",
            ].map((t, i) => (
              <motion.li
                key={t}
                initial={{ opacity: 0, x: -12 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.36 + i * 0.08, duration: 0.45, ease: EASE }}
                className="flex items-center gap-2.5"
              >
                <CheckIcon className="h-4 w-4 shrink-0 text-profit" />
                {t}
              </motion.li>
            ))}
          </ul>
        </div>
      </aside>

      {/* ------------------------------- Spatial Glass Auth Card ------------------------------ */}
      <main className="relative flex items-center justify-center px-5 py-12 sm:px-10">
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: EASE }}
          className="panel relative w-full max-w-[440px] rounded-[28px] border border-line-strong/80 p-7 shadow-[0_32px_80px_-28px_rgba(0,0,0,0.45)] backdrop-blur-2xl sm:p-9"
        >
          <div className="mb-8 flex items-center justify-between lg:hidden">
            <Link href="/" aria-label="Back to home">
              <Wordmark />
            </Link>
            <ThemeToggle />
          </div>

          <div className="inline-flex items-center gap-1.5 rounded-full bg-gold/15 px-3 py-1 text-[11px] font-semibold text-gold">
            <span>EdgeBook Workspace</span>
          </div>

          <h2 className="mt-3 font-display text-[26px] font-semibold tracking-[-0.025em] text-ink">
            {mode === "signin" ? "Welcome back" : "Create your journal"}
          </h2>
          <p className="mt-1 text-sm text-muted">
            {mode === "signin"
              ? "Sign in to load your Google Drive journal and AI Brain."
              : "One account — private Google Drive sync and AI Brain included."}
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

          {/* Primary: Google OAuth + Drive Sync */}
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
              "group mt-6 flex h-12 w-full items-center justify-center gap-3 rounded-2xl border border-line-strong bg-raised text-[14.5px] font-semibold text-ink shadow-sm transition-all duration-200 hover:border-gold/50 hover:bg-surface hover:shadow-lift active:scale-[0.98] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-gold/20",
              googleLoading && "pointer-events-none opacity-60",
            )}
            aria-label="Continue with Google"
            aria-busy={googleLoading}
          >
            {googleLoading ? (
              <span className="h-[18px] w-[18px] animate-spin rounded-full border-2 border-line-strong border-t-gold" />
            ) : (
              <GoogleIcon className="h-[18px] w-[18px]" />
            )}
            {googleLoading ? "Connecting to Google Drive…" : "Continue with Google Drive"}
            {!googleLoading && (
              <ArrowRightIcon className="h-4 w-4 text-faint transition-transform duration-200 group-hover:translate-x-0.5 group-hover:text-ink" />
            )}
          </button>
          <p className="mt-2 text-center text-[11.5px] text-faint">
            Recommended · Automatically syncs your journal &amp; AI Brain to Google Drive.
          </p>

          {/* Divider */}
          <div className="my-6 flex items-center gap-3 text-[11px] uppercase tracking-widest text-faint">
            <span className="h-px flex-1 bg-line" />
            or local email session
            <span className="h-px flex-1 bg-line" />
          </div>

          {/* Mode tabs */}
          <div
            role="tablist"
            aria-label="Authentication mode"
            className="grid grid-cols-2 gap-1 rounded-2xl border border-line bg-canvas/60 p-1"
          >
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
                  "relative rounded-xl py-2 text-[13.5px] font-semibold transition-colors",
                  mode === m ? "text-ink" : "text-faint hover:text-muted",
                )}
              >
                {mode === m && (
                  <motion.span
                    layoutId="auth-tab"
                    transition={{ type: "spring", stiffness: 480, damping: 38 }}
                    className="absolute inset-0 rounded-xl border border-line-strong bg-raised shadow-sm"
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
                  className="pr-11"
                  value={password}
                  invalid={!!errors.password}
                  onChange={(e) => setPassword(e.target.value)}
                />
                <button
                  type="button"
                  onClick={() => setShowPw((v) => !v)}
                  aria-label={showPw ? "Hide password" : "Show password"}
                  className="absolute right-2.5 top-1/2 grid h-7 w-7 -translate-y-1/2 place-items-center rounded-md text-faint hover:bg-ink/[0.05] hover:text-ink"
                >
                  <EyeIcon className={cn("h-4 w-4 transition-opacity", !showPw && "opacity-60")} />
                </button>
              </div>
            </Field>

            {errors.form && (
              <p role="alert" className="rounded-xl border border-loss/25 bg-loss/[0.07] px-3 py-2.5 text-[13px] text-loss">
                {errors.form}
              </p>
            )}

            <Button type="submit" variant="gold" loading={busy} disabled={busy} className="h-11 w-full rounded-2xl text-[14.5px] font-semibold">
              {mode === "signin" ? "Sign in to Workspace" : "Create Journal"}
              {!busy && <ArrowRightIcon className="h-4 w-4" />}
            </Button>
          </form>

          <p className="mt-6 text-center text-xs leading-relaxed text-faint">
            Your journal and AI Brain stay private — stored in your own Google Drive or locally on this device.
          </p>
        </motion.div>
      </main>
    </div>
  );
}
