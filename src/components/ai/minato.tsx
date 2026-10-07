"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname } from "next/navigation";
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
import Link from "next/link";
import "./minato.css";
import { cn } from "@/lib/utils";
import { SlidersIcon, XIcon } from "@/components/ui/icons";
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

const STATE_LABEL: Record<MinatoState, string> = {
  idle: "Your trading companion",
  curious: "Curious",
  thinking: "Thinking…",
  warning: "Heads up",
  firm: "Being firm",
  proud: "Proud of you",
  celebration: "Celebrating",
};

/** MINATO's portrait, with a quiet monogram fallback if the image is missing. */
function Portrait() {
  const [failed, setFailed] = useState(false);
  if (failed) {
    return <span className="grid h-full w-full place-items-center bg-ink/[0.08] text-[1em] font-semibold text-muted">M</span>;
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src="/minato-avatar.jpg"
      alt=""
      width={256}
      height={256}
      draggable={false}
      className="h-full w-full object-cover"
      onError={() => setFailed(true)}
    />
  );
}

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

function nextWelcomeQuote(): string {
  if (typeof window === "undefined") return WELCOME_QUOTES[0];
  const key = "minato_welcome_quote_index";
  const previous = Number(window.localStorage.getItem(key) ?? "-1");
  const index = (Number.isInteger(previous) ? previous + 1 : 0) % WELCOME_QUOTES.length;
  window.localStorage.setItem(key, String(index));
  return WELCOME_QUOTES[index];
}

/**
 * Minimal inline-markdown for MINATO's replies. The model is instructed to
 * write **bold** for emphasis, but the chat bubble was rendering messages
 * as raw text — so people were seeing literal asterisks instead of bold
 * text. This only handles **bold**; line breaks are already preserved by
 * the bubble's `whitespace-pre-wrap`, and full markdown isn't needed here.
 */
function renderInline(text: string) {
  // Some providers escape Markdown punctuation (\\*\\*label\\*\\*) despite
  // the prompt. Normalize only escaped asterisks before rendering so the
  // chat never exposes formatting syntax to the trader.
  const normalized = text.replace(/\\\*/g, "*");
  const parts = normalized.split(/(\*\*[^*\n]+\*\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**") && part.length > 4) {
      return <strong key={i} className="font-semibold">{part.slice(2, -2)}</strong>;
    }
    return <span key={i}>{part}</span>;
  });
}

/**
 * Give analytical answers a dependable visual hierarchy even when a model
 * returns plain text. Numbered findings become compact cards, supporting
 * bullets stay visibly subordinate, and labels retain their emphasis.
 */
function renderMinatoText(text: string) {
  return text.replace(/\r/g, "").split("\n").map((line, i) => {
    const numbered = line.match(/^(\d+)\.\s+(.+)$/);
    if (numbered) {
      return (
        <div key={i} className="minato-finding">
          <span className="minato-finding-number">{numbered[1]}</span>
          <span className="min-w-0">{renderInline(numbered[2])}</span>
        </div>
      );
    }
    const bullet = line.match(/^\s*[-•–]\s+(.+)$/);
    if (bullet) {
      return <div key={i} className="minato-supporting-point"><span>•</span><span>{renderInline(bullet[1])}</span></div>;
    }
    if (!line.trim()) return <div key={i} className="h-2" aria-hidden />;
    return <p key={i} className={i === 0 ? "font-medium text-ink" : undefined}>{renderInline(line)}</p>;
  });
}

const ANALYSIS_STEPS = [
  "Reading your journal…",
  "Checking patterns and plan adherence…",
  "Preparing a focused answer…",
] as const;

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
  const { entries, settings, challenge } = useMemo(() => scopeToPrimary(rawSettings, allEntries), [rawSettings, allEntries]);
  const updateSettings = useApp((s) => s.updateSettings);
  // Most journal questions need a sharply scoped answer, not a long model
  // generation. A smaller default makes the companion feel responsive while
  // leaving the user-controlled budget available for deep reviews.
  const responseTokenLimit = Math.min(8_000, Math.max(250, settings.aiPrefs?.responseTokenLimit ?? 900));

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
  const [analysisStep, setAnalysisStep] = useState(0);
  const [replySizeDraft, setReplySizeDraft] = useState<string | null>(null);
  const [optionsOpen, setOptionsOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // "thinking" should reflect an actual in-flight request, not just
  // whether the panel happens to be open — previously it showed
  // "thinking" the entire time the panel was open, even at rest.
  const state: MinatoState = busy ? "thinking" : topState(insights);

  /* ---------------------------------------------------------------- */
  /*  Launcher visibility — hidden until needed.                       */
  /*  Appears when: the panel is open · the page is scrolled to its    */
  /*  end · the pointer visits the bottom-right corner · it receives   */
  /*  keyboard focus. Otherwise a quiet edge handle is all you see.    */
  /* ---------------------------------------------------------------- */
  const pathname = usePathname();
  const [atEnd, setAtEnd] = useState(false);
  const [peek, setPeek] = useState(false);
  const peekTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wasOpen = useRef(open);

  const holdPeek = () => {
    if (peekTimer.current) clearTimeout(peekTimer.current);
    setPeek(true);
  };
  const releasePeek = (ms = 1400) => {
    if (peekTimer.current) clearTimeout(peekTimer.current);
    peekTimer.current = setTimeout(() => setPeek(false), ms);
  };

  useEffect(() => {
    const check = () => {
      const el = document.documentElement;
      const scrollable = el.scrollHeight > window.innerHeight + 40;
      setAtEnd(scrollable && el.scrollHeight - (window.scrollY + window.innerHeight) < 160);
    };
    check();
    const settle = window.setTimeout(check, 450); // after the new route has rendered
    window.addEventListener("scroll", check, { passive: true });
    window.addEventListener("resize", check);
    const ro = new ResizeObserver(check);
    ro.observe(document.body);
    return () => {
      window.clearTimeout(settle);
      window.removeEventListener("scroll", check);
      window.removeEventListener("resize", check);
      ro.disconnect();
    };
  }, [pathname]);

  // Mouse visiting the bottom-right corner brings the launcher in (like the Dock).
  useEffect(() => {
    let inCorner = false;
    const onMove = (e: PointerEvent) => {
      if (e.pointerType !== "mouse") return;
      const now = window.innerWidth - e.clientX < 170 && window.innerHeight - e.clientY < 110;
      if (now === inCorner) return;
      inCorner = now;
      if (now) holdPeek();
      else releasePeek();
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    return () => window.removeEventListener("pointermove", onMove);
  }, []);

  // After closing the panel, linger briefly so the launcher doesn't vanish under the cursor.
  useEffect(() => {
    if (wasOpen.current && !open) {
      holdPeek();
      releasePeek(1800);
    }
    wasOpen.current = open;
  }, [open]);

  useEffect(() => () => { if (peekTimer.current) clearTimeout(peekTimer.current); }, []);

  const launcherVisible = open || peek || atEnd;

  // Greet on open
  useEffect(() => {
    if (open) {
      setMessages((m) =>
        m.length > 0 ? m : [{ role: "buddy", text: provider.greeting(ctx) }],
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Full-screen welcome overlay — separate from the chat panel entirely.
  // Shows once per login/signup (new browser session), dismisses on any
  // click anywhere on the blurred backdrop.
  const [showWelcome, setShowWelcome] = useState(false);
  const [welcomeQuote, setWelcomeQuote] = useState("");
  const status = useApp((s) => s.status);
  useEffect(() => {
    if (status !== "authenticated") return;
    if (typeof window === "undefined") return;
    if (sessionStorage.getItem("minato_welcomed") === "1") return;
    sessionStorage.setItem("minato_welcomed", "1");
    setWelcomeQuote(nextWelcomeQuote());
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

  useEffect(() => {
    if (!busy) {
      setAnalysisStep(0);
      return;
    }
    const interval = window.setInterval(() => {
      setAnalysisStep((step) => Math.min(step + 1, ANALYSIS_STEPS.length - 1));
    }, 1100);
    return () => window.clearInterval(interval);
  }, [busy]);

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
        // Keep the interaction quick. If the remote analysis service does
        // not respond promptly, the local evidence-based provider answers
        // instead rather than leaving the trader watching a stalled panel.
        const controller = new AbortController();
        const timeout = window.setTimeout(() => controller.abort(), 7_500);
        const res = await fetch("/api/minato/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          // Send only the current primary challenge's journal. This keeps the
          // server analysis both relevant and much smaller/faster.
          body: JSON.stringify({
            messages: next,
            entries,
            journalProvided: true,
            primaryChallenge: challenge ?? undefined,
            responseTokenLimit,
          }),
          signal: controller.signal,
        });
        window.clearTimeout(timeout);
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

  const stateLabel = state === "thinking" || busy ? "Thinking…" : STATE_LABEL[state];

  // Focus the composer on devices with a precise pointer (never pops a phone keyboard).
  useEffect(() => {
    if (!open) return;
    if (!window.matchMedia("(pointer: fine)").matches) return;
    const t = window.setTimeout(() => inputRef.current?.focus(), 260);
    return () => window.clearTimeout(t);
  }, [open]);

  const commitReplySize = () => {
    const nextLimit = Math.min(8_000, Math.max(250, Number(replySizeDraft ?? responseTokenLimit) || responseTokenLimit));
    setReplySizeDraft(null);
    if (nextLimit !== responseTokenLimit) {
      void updateSettings({ aiPrefs: { ...(rawSettings.aiPrefs ?? { includeNotes: true }), responseTokenLimit: nextLimit } });
    }
  };

  return (
    <>
      {/* Welcome — a centred sheet over a soft blurred scrim (login/signup only) */}
      <AnimatePresence>
        {showWelcome && (
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label="Welcome from MINATO"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3, ease: EASE }}
            onClick={() => setShowWelcome(false)}
            className="fixed inset-0 z-[200] grid cursor-pointer place-items-center bg-black/35 px-6 backdrop-blur-xl"
          >
            <motion.div
              onClick={(e) => e.stopPropagation()}
              initial={reduce ? { opacity: 0 } : { opacity: 0, y: 24, scale: 0.95 }}
              animate={reduce ? { opacity: 1 } : { opacity: 1, y: 0, scale: 1 }}
              transition={{ type: "spring", stiffness: 340, damping: 30, delay: 0.05 }}
              className="w-full max-w-[340px] cursor-default rounded-[26px] bg-overlay px-7 pb-6 pt-8 text-center shadow-overlay"
            >
              <span className="mx-auto block h-[88px] w-[88px] overflow-hidden rounded-full shadow-lift" aria-hidden>
                <Portrait />
              </span>
              <p className="mt-5 text-[22px] font-semibold tracking-[-0.02em] text-ink">
                Welcome back{ctx.userFirstName ? `, ${ctx.userFirstName}` : ""}.
              </p>
              <p className="mt-2.5 text-[15px] leading-relaxed text-muted">{welcomeQuote}</p>
              <button
                type="button"
                autoFocus
                onClick={() => setShowWelcome(false)}
                className="mt-6 w-full rounded-[13px] bg-gold-strong py-3 text-[16px] font-semibold text-on-gold transition-transform active:scale-[0.98]"
              >
                Continue
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Edge handle — the only trace of MINATO while the launcher is tucked away. */}
      <AnimatePresence>
        {!launcherVisible && (
          <motion.button
            key="minato-handle"
            type="button"
            aria-label="Open MINATO — your trading companion"
            onClick={() => setOpen(true)}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
            className="group fixed bottom-28 right-0 z-[89] flex h-14 w-6 items-center justify-end lg:bottom-24"
          >
            <span className="block h-9 w-[4px] rounded-l-full bg-ink/20 transition-all duration-200 group-hover:w-[7px] group-hover:bg-gold/60 group-active:w-[9px]" />
          </motion.button>
        )}
      </AnimatePresence>

      {/* Launcher — a single round portrait with a status dot */}
      <motion.button
        type="button"
        aria-label={open ? "Close MINATO" : "Open MINATO — your trading companion"}
        aria-expanded={open}
        onClick={() => {
          setOpen(!open);
          holdPeek();
        }}
        onPointerEnter={holdPeek}
        onPointerLeave={() => releasePeek()}
        onFocus={holdPeek}
        onBlur={() => releasePeek(300)}
        initial={false}
        animate={
          launcherVisible
            ? { opacity: 1, y: 0, scale: 1 }
            : reduce
              ? { opacity: 0 }
              : { opacity: 0, y: 18, scale: 0.9 }
        }
        whileTap={launcherVisible ? { scale: 0.92 } : undefined}
        transition={{ type: "spring", stiffness: 380, damping: 32 }}
        style={{ pointerEvents: launcherVisible ? "auto" : "none" }}
        className="mn-launcher fixed bottom-5 right-5 z-[90] grid h-[54px] w-[54px] place-items-center rounded-full"
      >
        <AnimatePresence mode="wait" initial={false}>
          {open ? (
            <motion.span
              key="x"
              initial={{ opacity: 0, rotate: -45, scale: 0.7 }}
              animate={{ opacity: 1, rotate: 0, scale: 1 }}
              exit={{ opacity: 0, rotate: 45, scale: 0.7 }}
              transition={{ duration: 0.18 }}
              className="text-ink"
            >
              <XIcon className="h-5 w-5" />
            </motion.span>
          ) : (
            <motion.span
              key="face"
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.8 }}
              transition={{ duration: 0.18 }}
              className="block h-[46px] w-[46px] overflow-hidden rounded-full"
            >
              <Portrait />
            </motion.span>
          )}
        </AnimatePresence>
        {!open && (
          <span
            aria-hidden
            className={cn("absolute bottom-0 right-0 h-[14px] w-[14px] rounded-full ring-[3px] ring-overlay", STATE_DOT[state])}
          />
        )}
      </motion.button>

      {/* Panel */}
      <AnimatePresence>
        {open && (
          <motion.div
            role="dialog"
            aria-label="MINATO — trading companion"
            onKeyDown={(e) => {
              if (e.key === "Escape") setOpen(false);
            }}
            initial={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.92, y: 14 }}
            animate={reduce ? { opacity: 1 } : { opacity: 1, scale: 1, y: 0 }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.96, y: 8, transition: { duration: 0.16 } }}
            transition={{ type: "spring", stiffness: 380, damping: 34 }}
            style={{ transformOrigin: "bottom right" }}
            className="mn-panel fixed bottom-[88px] right-5 z-[90] flex max-h-[min(640px,calc(100dvh-8rem))] w-[min(400px,calc(100vw-2.5rem))] flex-col overflow-hidden rounded-[22px] max-sm:inset-x-3 max-sm:w-auto"
          >
            {/* Header */}
            <header className="mn-head flex items-center gap-3 px-4 pb-3 pt-3.5">
              <span className="block h-10 w-10 shrink-0 overflow-hidden rounded-full" aria-hidden>
                <Portrait />
              </span>
              <div className="min-w-0 flex-1">
                <h2 className="text-[16px] font-semibold leading-tight tracking-[-0.01em] text-ink">MINATO</h2>
                <p className="mt-0.5 flex items-center gap-1.5 text-[12px] text-muted">
                  <span aria-hidden className={cn("h-1.5 w-1.5 rounded-full", STATE_DOT[state])} />
                  {stateLabel}
                </p>
              </div>
              <button
                type="button"
                className="mn-icon-btn"
                aria-label="Reply options"
                aria-expanded={optionsOpen}
                aria-controls="minato-options"
                onClick={() => setOptionsOpen((v) => !v)}
              >
                <SlidersIcon className="h-4 w-4" />
              </button>
              <button type="button" className="mn-icon-btn" aria-label="Close MINATO" onClick={() => setOpen(false)}>
                <XIcon className="h-4 w-4" />
              </button>
            </header>

            {/* Reply options (collapsed by default) */}
            <AnimatePresence initial={false}>
              {optionsOpen && (
                <motion.div
                  id="minato-options"
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.25, ease: EASE }}
                  className="overflow-hidden"
                >
                  <div className="mx-4 mt-3 rounded-[12px] bg-ink/[0.05] px-3.5 py-3">
                    <label
                      className="flex items-center justify-between gap-3 text-[14px] text-ink"
                      title="Set a custom reply budget from 250 to 8,000 tokens"
                    >
                      Reply size
                      <span className="flex items-center gap-2 text-[13px] text-muted">
                        <input
                          aria-label="MINATO reply size in tokens"
                          type="number"
                          min={250}
                          max={8000}
                          step={250}
                          value={replySizeDraft ?? responseTokenLimit}
                          onChange={(e) => setReplySizeDraft(e.target.value)}
                          onBlur={commitReplySize}
                          onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
                          className="w-[72px] rounded-[8px] bg-raised px-2 py-1 text-right text-[14px] text-ink tabular-nums shadow-[0_0_0_0.5px_var(--line-strong)] focus:outline-none focus:ring-2 focus:ring-gold/50"
                        />
                        tokens
                      </span>
                    </label>
                    <p className="mt-1.5 text-[12px] leading-snug text-muted">
                      The longest reply MINATO will write.{" "}
                      <Link href="/settings?pane=minato" className="text-gold underline-offset-2 hover:underline">
                        More in Settings
                      </Link>
                    </p>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Scope + insights */}
            {(challenge || insights.length > 0) && (
              <div className="mx-4 mt-3 overflow-hidden rounded-[12px] bg-ink/[0.05] [&>*+*]:border-t-[0.5px] [&>*+*]:border-line-strong/50">
                {challenge && (
                  <p className="px-3.5 py-2 text-[12px] text-muted">
                    Analysing only <strong className="font-semibold text-ink">{challenge.name}</strong>
                  </p>
                )}
                {insights.slice(0, 2).map((ins) => (
                  <div key={ins.id} className="flex items-start gap-2.5 px-3.5 py-2.5">
                    <span className={cn("mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full", STATE_DOT[ins.state])} aria-hidden />
                    <p className="text-[13px] leading-snug text-muted">{ins.message}</p>
                  </div>
                ))}
              </div>
            )}

            {/* Messages */}
            <div
              ref={listRef}
              role="log"
              aria-live="polite"
              aria-label="Conversation with MINATO"
              className="min-h-40 flex-1 space-y-2 overflow-y-auto px-4 py-4"
            >
              {messages.map((m, i) => (
                <motion.div
                  key={i}
                  initial={reduce ? { opacity: 0 } : { opacity: 0, y: 8, scale: 0.97 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  transition={{ duration: 0.28, ease: EASE }}
                  style={{ transformOrigin: m.role === "user" ? "bottom right" : "bottom left" }}
                  className={cn("flex", m.role === "user" ? "justify-end" : "justify-start")}
                >
                  <div
                    className={cn(
                      "max-w-[88%] rounded-[18px] px-3.5 py-2.5 text-[14px] leading-[1.45]",
                      m.role === "user"
                        ? "rounded-br-[6px] bg-gold-strong text-on-gold"
                        : "rounded-bl-[6px] bg-ink/[0.06] text-ink",
                    )}
                  >
                    {m.role === "user" ? (
                      // The user's own words are plain text — never run through the assistant
                      // formatter (its first line forces `text-ink`, unreadable on a filled bubble).
                      <p className="whitespace-pre-wrap break-words">{m.text}</p>
                    ) : (
                      renderMinatoText(m.text)
                    )}
                  </div>
                </motion.div>
              ))}
              {busy && (
                <motion.div
                  initial={reduce ? { opacity: 0 } : { opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="flex justify-start"
                >
                  <div className="flex items-center gap-2.5 rounded-[18px] rounded-bl-[6px] bg-ink/[0.06] px-3.5 py-3 text-[13px] text-muted">
                    <span className="mn-typing" aria-hidden>
                      <i />
                      <i />
                      <i />
                    </span>
                    <span>{reduce ? "Analysing your journal…" : ANALYSIS_STEPS[analysisStep]}</span>
                  </div>
                </motion.div>
              )}
            </div>

            {/* Suggestions */}
            {QUICK_PROMPTS.length > 0 && (
              <div className="mn-chips flex gap-2 overflow-x-auto px-4 pb-2.5 pt-1 [scrollbar-width:none]">
                {QUICK_PROMPTS.map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => void ask(p)}
                    disabled={busy}
                    className="shrink-0 rounded-[10px] bg-ink/[0.06] px-3 py-2 text-[13px] text-ink transition-all hover:bg-ink/[0.1] active:scale-[0.97] disabled:opacity-50"
                  >
                    {p}
                  </button>
                ))}
              </div>
            )}

            {/* Composer */}
            <form
              className="px-3 pb-3 pt-1"
              onSubmit={(e) => {
                e.preventDefault();
                void ask(input);
              }}
            >
              <div className="mn-field flex items-center gap-1.5 rounded-[22px] bg-ink/[0.06] py-1 pl-4 pr-1">
                <input
                  ref={inputRef}
                  aria-label="Ask MINATO"
                  placeholder="Ask about your journal"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  enterKeyHint="send"
                  autoComplete="off"
                  className="min-w-0 flex-1 bg-transparent py-2 text-[16px] text-ink placeholder:text-muted/70 focus:outline-none sm:text-[14px]"
                />
                <button type="submit" className="mn-send" aria-label="Send" disabled={busy || !input.trim()}>
                  <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <path d="M12 19V5M5.5 11.5 12 5l6.5 6.5" />
                  </svg>
                </button>
              </div>
            </form>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
