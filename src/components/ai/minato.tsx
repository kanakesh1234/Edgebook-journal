"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useApp } from "@/lib/store";
import { useUi } from "@/lib/ui-store";
import { scopeToPrimary } from "@/lib/challenges";
import { computeStats } from "@/lib/stats";
import { disciplineSummary } from "@/lib/discipline";
import { evaluateRules, adherenceSummary } from "@/lib/rules";
import { computeInsights, topState, type MinatoState } from "@/lib/minato/insights";
import { buildContext } from "@/lib/minato/context";
import { resolveCoachProvider, type MinatoMessage } from "@/lib/services/ai";
import { QUICK_PROMPTS } from "@/lib/minato/respond";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { EASE } from "@/components/landing/reveal";

const STATE_DOT: Record<MinatoState, string> = {
  idle: "bg-faint",
  curious: "bg-info",
  thinking: "bg-info animate-pulse",
  warning: "bg-gold",
  firm: "bg-loss",
  proud: "bg-profit",
  celebration: "bg-profit",
};

const STATE_GLYPH: Record<MinatoState, string> = {
  idle: "·",
  curious: "?",
  thinking: "…",
  warning: "!",
  firm: "!!",
  proud: "✓",
  celebration: "★",
};

/**
 * Rotates on every welcome pop-up so the login/signup greeting doesn't
 * feel identical each time. Kept short and process-focused (not generic
 * hype) to match MINATO's tone elsewhere.
 */
const WELCOME_QUOTES = [
  "Process over outcome — every session is evidence, not a verdict.",
  "You don't need to be right. You need to be consistent.",
  "The edge isn't in the setup. It's in doing the setup the same way every time.",
  "A losing trade with a followed plan beats a winning trade with a broken one.",
  "Review honestly today, so tomorrow's you doesn't repeat this.",
  "Discipline compounds quieter than P&L, but it's what P&L is built on.",
  "Your journal remembers what your memory won't. Use it.",
  "Small, repeatable edges beat big, unrepeatable wins.",
];

function pickWelcomeQuote(): string {
  return WELCOME_QUOTES[Math.floor(Math.random() * WELCOME_QUOTES.length)];
}

/**
 * Minimal inline-markdown for MINATO's replies. The model is instructed to
 * write **bold** for emphasis, but the chat bubble was rendering messages
 * as raw text — so people were seeing literal asterisks instead of bold
 * text. This only handles **bold**; line breaks are already preserved by
 * the bubble's `whitespace-pre-wrap`, and full markdown isn't needed here.
 */
function renderMinatoText(text: string) {
  const parts = text.split(/(\*\*[^*\n]+\*\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**") && part.length > 4) {
      return <strong key={i} className="font-semibold">{part.slice(2, -2)}</strong>;
    }
    return <span key={i}>{part}</span>;
  });
}

/**
 * MINATO SENSEI — floating trading companion.
 * Small, premium, quiet by default. Opens into a focused panel fed by
 * the deterministic provider; the AiCoachProvider seam swaps in an LLM
 * later without UI changes.
 */
export function Minato() {
  const allEntries = useApp((s) => s.entries);
  const rawSettings = useApp((s) => s.settings);
  const user = useApp((s) => s.user);
  const dayLogs = useApp((s) => s.dayLogs);
  const open = useUi((s) => s.minatoOpen);
  const setOpen = useUi((s) => s.setMinatoOpen);
  const focusId = useUi((s) => s.minatoTradeId);
  const reduce = useReducedMotion();

  // MINATO follows the primary challenge — same source of truth as Home.
  const { entries, settings } = useMemo(() => scopeToPrimary(rawSettings, allEntries), [rawSettings, allEntries]);

  const provider = useMemo(() => resolveCoachProvider(settings), [settings]);
  const focusEntry = useMemo(
    () => entries.find((e) => e.id === focusId) ?? null,
    [entries, focusId],
  );

  const stats = useMemo(() => computeStats(entries, settings), [entries, settings]);
  const discipline = useMemo(() => disciplineSummary(entries, dayLogs), [entries, dayLogs]);
  const violations = useMemo(() => evaluateRules(entries, settings), [entries, settings]);
  const adherence = useMemo(() => adherenceSummary(entries, settings), [entries, settings]);

  const ctx = useMemo(
    () =>
      buildContext({
        userFirstName: (settings.fullName?.trim() || user?.name || "").split(" ")[0] ?? "",
        entries,
        stats,
        discipline,
        adherence,
        playbook: settings.playbook ?? [],
        activeRules: (settings.rules?.rules ?? []).filter((r) => r.enabled),
        violations,
        focusEntry,
        includeNotes: true, // MINATO has full access to the authenticated user's recorded context
      }),
    [entries, settings, user, focusEntry, stats, discipline, adherence, violations],
  );

  const insights = useMemo(() => computeInsights(ctx), [ctx]);

  const [messages, setMessages] = useState<MinatoMessage[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);

  // "thinking" should reflect an actual in-flight request, not just
  // whether the panel happens to be open — previously it showed
  // "thinking" the entire time the panel was open, even at rest.
  const state: MinatoState = busy ? "thinking" : topState(insights);

  // Greet on open
  useEffect(() => {
    if (open) {
      setMessages((m) =>
        m.length > 0 ? m : [{ role: "buddy", text: `${provider.greeting(ctx)}\n\n"${pickWelcomeQuote()}"` }],
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Full-screen welcome overlay — separate from the chat panel entirely.
  // Shows once per login/signup (new browser session), dismisses on any
  // click anywhere on the blurred backdrop.
  const [showWelcome, setShowWelcome] = useState(false);
  const [welcomeQuote] = useState(pickWelcomeQuote);
  const status = useApp((s) => s.status);
  useEffect(() => {
    if (status !== "authenticated") return;
    if (typeof window === "undefined") return;
    if (sessionStorage.getItem("minato_welcomed") === "1") return;
    sessionStorage.setItem("minato_welcomed", "1");
    const t = setTimeout(() => setShowWelcome(true), 900);
    return () => clearTimeout(t);
  }, [status]);

  // Trade-review context message when opened from an entry
  useEffect(() => {
    if (open && focusEntry && messages.length > 0 && messages[messages.length - 1]?.role === "buddy" && !focusReviewed.current) {
      focusReviewed.current = true;
      void ask(`Review ${focusEntry.setup || focusEntry.instrument || "this trade"}`);
    }
    if (!open) focusReviewed.current = false;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, focusEntry]);

  const focusReviewed = useRef(false);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: reduce ? "auto" : "smooth" });
  }, [messages, reduce]);

  const ask = async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || busy) return;
    const next: MinatoMessage[] = [...messages, { role: "user", text: trimmed }];
    setMessages(next);
    setInput("");
    setBusy(true);
    try {
      // Server computes deterministic facts from the persisted journal
      // (hallucination-proof), then renders via OpenRouter when configured.
      let replyText: string | null = null;
      try {
        const res = await fetch("/api/minato/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ messages: next, entries: useApp.getState().entries }),
        });
        if (res.ok) {
          const json = (await res.json()) as { text?: string; fallback?: boolean };
          replyText = json.fallback ? null : json.text ?? null;
        }
      } catch {
        /* offline → deterministic fallback below */
      }
      if (!replyText) {
        const reply = await provider.reply({ messages: next, focusEntry }, ctx);
        replyText = reply.text;
      }
      setMessages([...next, { role: "buddy", text: replyText }]);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      {/* Full-screen welcome overlay — login/signup only, separate from the chat panel */}
      <AnimatePresence>
        {showWelcome && (
          <motion.div
            role="dialog"
            aria-label="Welcome from MINATO"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.35, ease: EASE }}
            onClick={() => setShowWelcome(false)}
            className="fixed inset-0 z-[200] flex cursor-pointer flex-col items-center justify-center gap-5 bg-ink/50 px-6 backdrop-blur-md"
          >
            <motion.span
              initial={reduce ? { opacity: 0 } : { opacity: 0, y: 14, scale: 0.9 }}
              animate={reduce ? { opacity: 1 } : { opacity: 1, y: 0, scale: 1 }}
              transition={{ duration: 0.4, ease: EASE, delay: 0.05 }}
              className="grid h-24 w-24 place-items-center overflow-hidden rounded-full border-2 border-gold/50 bg-raised text-3xl font-bold text-gold shadow-overlay"
              aria-hidden
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/minato-avatar.png"
                alt=""
                className="h-full w-full object-cover"
                onError={(e) => {
                  e.currentTarget.style.display = "none";
                  e.currentTarget.nextElementSibling?.classList.remove("hidden");
                }}
              />
              <span className="hidden">M</span>
            </motion.span>
            <motion.div
              initial={reduce ? { opacity: 0 } : { opacity: 0, y: 10 }}
              animate={reduce ? { opacity: 1 } : { opacity: 1, y: 0 }}
              transition={{ duration: 0.4, ease: EASE, delay: 0.15 }}
              className="max-w-sm text-center"
            >
              <p className="text-lg font-semibold tracking-[-0.01em] text-canvas">
                Welcome back{ctx.userFirstName ? `, ${ctx.userFirstName}` : ""}.
              </p>
              <p className="mt-2 text-[15px] italic leading-relaxed text-canvas/80">&ldquo;{welcomeQuote}&rdquo;</p>
              <p className="mt-4 text-[11px] uppercase tracking-wider text-canvas/50">Tap anywhere to continue</p>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Floating companion */}
      <button
        type="button"
        aria-label={open ? "Close MINATO" : "Open MINATO — your trading companion"}
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        className={cn(
          "fixed bottom-5 right-5 z-[90] flex items-center gap-2 rounded-full border bg-surface py-2 pl-3 pr-4 shadow-lift transition-all duration-200 hover:scale-[1.03] active:scale-95",
          open ? "border-gold/50" : "border-line-strong",
        )}
      >
        <span
          className={cn(
            "grid h-8 w-8 place-items-center overflow-hidden rounded-full border text-sm font-bold",
            open ? "border-gold/60 bg-gold/15 text-gold" : "border-line-strong bg-raised text-gold",
          )}
          aria-hidden
        >
          {open ? (
            "×"
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src="/minato-avatar.png"
              alt=""
              className="h-full w-full object-cover"
              onError={(e) => {
                e.currentTarget.style.display = "none";
                e.currentTarget.nextElementSibling?.classList.remove("hidden");
              }}
            />
          )}
          {!open && <span className="hidden">{STATE_GLYPH[state]}</span>}
        </span>
        <span className="text-left">
          <span className="block text-[11px] font-bold tracking-wide text-ink">MINATO</span>
          <span className="flex items-center gap-1 text-[9px] font-medium uppercase tracking-wider text-faint">
            <span className={cn("h-1.5 w-1.5 rounded-full", STATE_DOT[state])} />
            {state === "idle" ? "sensei" : state}
          </span>
        </span>
      </button>

      {/* Panel */}
      <AnimatePresence>
        {open && (
          <motion.div
            role="dialog"
            aria-label="MINATO — trading companion"
            initial={reduce ? { opacity: 0 } : { opacity: 0, y: 24, scale: 0.97 }}
            animate={reduce ? { opacity: 1 } : { opacity: 1, y: 0, scale: 1 }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, y: 16, scale: 0.98 }}
            transition={{ duration: 0.3, ease: EASE }}
            className="panel fixed bottom-20 right-5 z-[90] flex max-h-[min(600px,calc(100dvh-7rem))] w-[min(400px,calc(100vw-2.5rem))] flex-col overflow-hidden shadow-overlay"
          >
            {/* Header */}
            <div className="flex items-center justify-between border-b border-line px-5 py-3.5">
              <div className="flex items-center gap-2.5">
                <span className="grid h-9 w-9 shrink-0 place-items-center overflow-hidden rounded-full border border-gold/40 bg-gold/10 text-sm font-bold text-gold" aria-hidden>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src="/minato-avatar.png"
                    alt=""
                    className="h-full w-full object-cover"
                    onError={(e) => {
                      e.currentTarget.style.display = "none";
                      e.currentTarget.nextElementSibling?.classList.remove("hidden");
                    }}
                  />
                  <span className="hidden">M</span>
                </span>
                <div>
                  <p className="text-sm font-bold tracking-wide text-ink">MINATO SENSEI</p>
                  <p className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wider text-faint">
                    <span className={cn("h-1.5 w-1.5 rounded-full bg-profit")} />
                    trading companion
                  </p>
                </div>
              </div>
            </div>

            {/* Insights */}
            {insights.length > 0 && (
              <div className="space-y-2 border-b border-line-soft bg-raised/40 px-4 py-3">
                {insights.slice(0, 2).map((ins) => (
                  <div key={ins.id} className="flex items-start gap-2.5">
                    <span className={cn("mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full", STATE_DOT[ins.state])} aria-hidden />
                    <p className="text-[12.5px] leading-relaxed text-muted">{ins.message}</p>
                  </div>
                ))}
              </div>
            )}

            {/* Messages */}
            <div ref={listRef} className="min-h-40 flex-1 space-y-3 overflow-y-auto px-4 py-4" aria-live="polite">
              {messages.map((m, i) => (
                <div key={i} className={cn("flex", m.role === "user" ? "justify-end" : "justify-start")}>
                  <p
                    className={cn(
                      "max-w-[85%] whitespace-pre-wrap rounded-2xl px-3.5 py-2.5 text-[13px] leading-relaxed",
                      m.role === "user"
                        ? "rounded-br-md bg-ink text-canvas"
                        : "rounded-bl-md border border-line bg-raised text-ink",
                    )}
                  >
                    {renderMinatoText(m.text)}
                  </p>
                </div>
              ))}
              {busy && (
                <div className="flex justify-start">
                  <p className="rounded-2xl rounded-bl-md border border-line bg-raised px-3.5 py-2.5 text-[13px] text-faint">
                    {reduce ? "…" : "…"}
                  </p>
                </div>
              )}
            </div>

            {/* Quick prompts */}
            {QUICK_PROMPTS.length > 0 && (
              <div className="flex gap-1.5 overflow-x-auto border-t border-line-soft px-4 py-2.5 [scrollbar-width:none]">
                {QUICK_PROMPTS.map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => void ask(p)}
                    disabled={busy}
                    className="shrink-0 rounded-full border border-line bg-raised/60 px-3 py-1.5 text-[11px] font-medium text-muted transition-colors hover:border-line-strong hover:text-ink disabled:opacity-50"
                  >
                    {p}
                  </button>
                ))}
              </div>
            )}

            {/* Input */}
            <form
              className="flex items-center gap-2 border-t border-line px-4 py-3"
              onSubmit={(e) => {
                e.preventDefault();
                void ask(input);
              }}
            >
              <input
                aria-label="Ask MINATO"
                placeholder="Ask about your journal…"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                className="min-w-0 flex-1 rounded-control border border-line bg-raised px-3 py-2 text-[13px] text-ink placeholder:text-faint focus:border-gold/60 focus:outline-none focus:ring-4 focus:ring-gold/10"
              />
              <Button type="submit" variant="gold" size="sm" disabled={busy || !input.trim()}>
                Ask
              </Button>
            </form>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
