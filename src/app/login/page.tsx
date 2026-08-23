"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { motion } from "motion/react";
import { useApp } from "@/lib/store";
import { AuthError } from "@/lib/services/auth";
import { useBootstrap } from "@/lib/bootstrap";
import { Button, Spinner } from "@/components/ui/button";
import { Field, TextInput } from "@/components/ui/input";
import { toast } from "@/components/ui/toast";
import { Wordmark } from "@/components/landing/logo";
import { ArrowRightIcon, CheckIcon, EyeIcon, SparklesIcon } from "@/components/ui/icons";
import { cn } from "@/lib/utils";
import { EASE } from "@/components/landing/reveal";

const DEMO_EMAIL = "demo@edgebook.app";
const DEMO_PASSWORD = "edgebook-demo-2026";

type Mode = "signin" | "signup";

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="grid min-h-dvh place-items-center"><Spinner className="h-6 w-6 text-gold" /></div>}>
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
  const [busy, setBusy] = useState<"form" | "demo" | null>(null);

  // Already signed in → straight to the journal
  useEffect(() => {
    if (status === "authenticated") router.replace("/dashboard");
  }, [status, router]);

  const validate = (): boolean => {
    const next: typeof errors = {};
    const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
    if (!emailOk) next.email = mode === "signup" ? "Enter a valid email." : undefined;
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
    setBusy("form");
    setErrors({});
    try {
      if (mode === "signup") {
        await useApp.getState().signUp(name, email, password);
        toast.celebrate("Welcome to Edgebook", "Your journal is ready — add your first trade.");
      } else {
        await useApp.getState().signIn(email, password);
        toast.success("Welcome back", "Good to see you again.");
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
      setBusy(null);
    }
  };

  const enterDemo = async () => {
    if (busy) return;
    setBusy("demo");
    try {
      try {
        await useApp.getState().signIn(DEMO_EMAIL, DEMO_PASSWORD);
      } catch {
        await useApp.getState().signUp("Demo Trader", DEMO_EMAIL, DEMO_PASSWORD);
      }
      if (useApp.getState().entries.length === 0) {
        await useApp.getState().loadDemoData();
      }
      toast.info("Demo journal loaded", "Four months of sample trades. Clear them anytime in Settings.");
      router.replace("/dashboard");
    } catch {
      toast.error("Could not start the demo", "Please try again.");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="grid min-h-dvh lg:grid-cols-[1fr_1.1fr]">
      {/* ------------------------------ Brand panel ------------------------------ */}
      <aside className="relative hidden overflow-hidden border-r border-line bg-surface lg:block">
        <div className="grid-backdrop absolute inset-0 opacity-60" aria-hidden />
        <div className="absolute -left-24 top-1/3 h-96 w-96 rounded-full bg-gold/[0.07] blur-[120px]" aria-hidden />
        <div className="absolute -right-16 bottom-10 h-80 w-80 rounded-full bg-profit/[0.05] blur-[110px]" aria-hidden />

        <div className="relative flex h-full flex-col justify-between p-12">
          <Link href="/" aria-label="Back to home">
            <Wordmark />
          </Link>

          <div>
            <motion.h1
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7, ease: EASE }}
              className="max-w-md font-display text-5xl font-bold leading-[1.06] tracking-[-0.03em] text-ink"
            >
              The review is{" "}
              <span className="font-serif font-normal italic text-gold-grad">the edge.</span>
            </motion.h1>
            <motion.p
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7, delay: 0.12, ease: EASE }}
              className="mt-5 max-w-sm leading-relaxed text-muted"
            >
              Sign in and pick up exactly where the market left you — every session measured,
              every lesson kept.
            </motion.p>

            {/* Decorative road */}
            <motion.svg
              viewBox="0 0 420 120"
              className="mt-12 w-full max-w-sm"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.3, duration: 0.8 }}
              aria-hidden
            >
              <path
                d="M8 100 C90 100 110 30 200 30 C290 30 310 88 412 88"
                fill="none"
                stroke="#2a3750"
                strokeWidth="14"
                strokeLinecap="round"
              />
              <path
                d="M8 100 C90 100 110 30 200 30 C290 30 310 88 412 88"
                fill="none"
                stroke="#ecc063"
                strokeWidth="1.6"
                strokeDasharray="6 14"
                strokeLinecap="round"
                style={{ animation: "dash-flow 1.4s linear infinite" }}
              />
              <circle cx="8" cy="100" r="7" fill="#0f1520" stroke="#97a3ba" strokeWidth="2" />
              <circle cx="412" cy="88" r="7" fill="#35e0a1" />
              <text x="26" y="118" fontSize="10" fill="#5c6b85" fontFamily="var(--font-mono)">START</text>
              <text x="392" y="70" fontSize="10" fill="#35e0a1" fontFamily="var(--font-mono)" textAnchor="end">TARGET</text>
            </motion.svg>
          </div>

          <ul className="space-y-3 text-sm text-muted">
            {[
              "Local-first — entries never leave this device",
              "Screenshots, analytics, roadmap & calendar",
              "Export everything as JSON anytime",
            ].map((t, i) => (
              <motion.li
                key={t}
                initial={{ opacity: 0, x: -14 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.4 + i * 0.1, duration: 0.5, ease: EASE }}
                className="flex items-center gap-2.5"
              >
                <CheckIcon className="h-4 w-4 shrink-0 text-profit" />
                {t}
              </motion.li>
            ))}
          </ul>
        </div>
      </aside>

      {/* ------------------------------- Form panel ------------------------------ */}
      <main className="relative flex items-center justify-center px-5 py-12 sm:px-10">
        <div className="dot-backdrop absolute inset-0 opacity-40 [mask-image:radial-gradient(60%_60%_at_50%_40%,black,transparent)]" aria-hidden />

        <motion.div
          initial={{ opacity: 0, y: 28 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.65, ease: EASE }}
          className="panel relative w-full max-w-md p-7 sm:p-9"
        >
          <div className="mb-8 lg:hidden">
            <Link href="/" aria-label="Back to home">
              <Wordmark />
            </Link>
          </div>

          <h2 className="font-display text-2xl font-bold tracking-tight text-ink">
            {mode === "signin" ? "Welcome back" : "Create your journal"}
          </h2>
          <p className="mt-1.5 text-sm text-muted">
            {mode === "signin"
              ? "Sign in to continue your streak."
              : "One account, stored privately on this device."}
          </p>

          {/* Mode tabs */}
          <div
            role="tablist"
            aria-label="Authentication mode"
            className="mt-7 grid grid-cols-2 gap-1 rounded-xl border border-line bg-canvas/60 p-1"
          >
            {(["signin", "signup"] as const).map((m) => (
              <button
                key={m}
                role="tab"
                aria-selected={mode === m}
                onClick={() => {
                  setMode(m);
                  setErrors({});
                }}
                className={cn(
                  "relative rounded-lg py-2 text-sm font-medium transition-colors",
                  mode === m ? "text-ink" : "text-faint hover:text-muted",
                )}
              >
                {mode === m && (
                  <motion.span
                    layoutId="auth-tab"
                    transition={{ type: "spring", stiffness: 480, damping: 38 }}
                    className="absolute inset-0 rounded-lg border border-line-strong bg-raised shadow-inner"
                  />
                )}
                <span className="relative">{m === "signin" ? "Sign in" : "Create account"}</span>
              </button>
            ))}
          </div>

          <form onSubmit={submit} noValidate className="mt-6 space-y-4">
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
                  className="absolute right-2.5 top-1/2 grid h-7 w-7 -translate-y-1/2 place-items-center rounded-md text-faint hover:bg-white/5 hover:text-ink"
                >
                  <EyeIcon className={cn("h-4 w-4 transition-opacity", !showPw && "opacity-60")} />
                </button>
              </div>
            </Field>

            {errors.form && (
              <p role="alert" className="rounded-lg border border-loss/25 bg-loss/[0.07] px-3 py-2.5 text-[13px] text-loss">
                {errors.form}
              </p>
            )}

            <Button type="submit" size="lg" loading={busy === "form"} disabled={busy !== null} className="w-full">
              {mode === "signin" ? "Sign in" : "Create journal"}
              {!busy && <ArrowRightIcon className="h-4 w-4" />}
            </Button>
          </form>

          <div className="my-6 flex items-center gap-3 text-[11px] uppercase tracking-widest text-faint">
            <span className="h-px flex-1 bg-line" />
            or
            <span className="h-px flex-1 bg-line" />
          </div>

          <Button variant="gold" size="lg" loading={busy === "demo"} disabled={busy !== null} onClick={enterDemo} className="w-full">
            <SparklesIcon className="h-4 w-4" />
            Explore with demo data
          </Button>

          <p className="mt-6 text-center text-xs leading-relaxed text-faint">
            Accounts live only in this browser&apos;s storage.
            <br className="sm:hidden" /> No servers, no tracking, no spam.
          </p>
        </motion.div>
      </main>
    </div>
  );
}
