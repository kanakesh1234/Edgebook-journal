"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { todayKey } from "@/lib/format";
import { addNotes, detectMoods, emptyMind, loadMind, MOOD_LABEL, mindForModel, patterns, reconcile, saveMind, type Mood, type MindNote, type MindState } from "@/lib/minato/mind";
import { cn } from "@/lib/utils";
import { EASE } from "@/components/landing/reveal";
import "./minato.css";

const STATE_DOT: Record<MinatoState, string> = {
  idle: "bg-profit",
  curious: "bg-info",
  thinking: "bg-info animate-pulse",
  warning: "bg-gold",
  firm: "bg-loss",
  proud: "bg-profit",
  celebration: "bg-profit",
};

const THREAD_KEY = "edgebook:minato:thread:v1";
const MIND_KEY = "edgebook:minato:mind:v1";
type ChatMsg = MinatoMessage & { noted?: Mood[] };
const THREAD_MAX = 60;

/* ------------------------------------------------------------------ */
/*  Light-weight reply formatting (bold, numbered findings, bullets)   */
/* ------------------------------------------------------------------ */

function renderInline(text: string) {
  // Some models escape Markdown punctuation; never show formatting syntax.
  const normalized = text.replace(/\\\*/g, "*");
  return normalized.split(/(\*\*[^*\n]+\*\*)/g).map((part, i) =>
    part.startsWith("**") && part.endsWith("**") && part.length > 4
      ? <strong key={i} className="font-semibold">{part.slice(2, -2)}</strong>
      : <span key={i}>{part}</span>,
  );
}

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
    if (bullet) return <div key={i} className="minato-supporting-point"><span>•</span><span>{renderInline(bullet[1])}</span></div>;
    if (!line.trim()) return <div key={i} className="h-1.5" aria-hidden />;
    return <p key={i}>{renderInline(line)}</p>;
  });
}

/* ------------------------------------------------------------------ */
/*  Icons                                                              */
/* ------------------------------------------------------------------ */

const Svg = ({ children, className = "h-[17px] w-[17px]" }: { children: React.ReactNode; className?: string }) => (
  <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>{children}</svg>
);
const CloseIcon = () => <Svg><path d="M6 6l12 12M18 6 6 18" /></Svg>;
const ComposeIcon = () => <Svg><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" /></Svg>;
const SendIcon = () => <Svg className="h-4 w-4"><path d="M12 19V5M5 12l7-7 7 7" /></Svg>;

function Avatar({ className }: { className?: string }) {
  return (
    <span className={cn("grid place-items-center overflow-hidden rounded-full bg-gold/15 font-bold text-gold", className)} aria-hidden>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/minato-avatar.jpg"
        alt=""
        width={256}
        height={256}
        className="h-full w-full object-cover"
        onError={(e) => {
          e.currentTarget.style.display = "none";
          e.currentTarget.nextElementSibling?.classList.remove("hidden");
        }}
      />
      <span className="hidden text-sm">M</span>
    </span>
  );
}

/* ------------------------------------------------------------------ */
/*  Mind: what Minato has learned about how the trader feels           */
/* ------------------------------------------------------------------ */

function NoteRow({ n, pending }: { n: MindNote; pending?: boolean }) {
  return (
    <li className="rounded-[18px] bg-ink/[0.05] px-3.5 py-3">
      <div className="flex items-center justify-between gap-2">
        <span className="rounded-full bg-gold/15 px-2.5 py-0.5 text-[11.5px] font-semibold text-gold">{MOOD_LABEL[n.mood]}</span>
        <span className="text-[11.5px] text-faint">{pending ? "Waiting for your next setup" : n.date}</span>
      </div>
      <p className="mt-2 line-clamp-2 text-[13.5px] leading-snug text-ink">“{n.quote}”</p>
      {n.verdict && <p className="mt-1.5 text-[12.5px] leading-snug text-muted">{n.verdict}</p>}
    </li>
  );
}

function MindPane({ pending, kept, habits }: { pending: MindNote[]; kept: MindNote[]; habits: ReturnType<typeof patterns> }) {
  const empty = pending.length === 0 && kept.length === 0;
  return (
    <div className="flex-1 space-y-5 overflow-y-auto overscroll-contain px-4 py-4">
      {empty && (
        <div className="flex h-full min-h-[200px] flex-col justify-center px-1">
          <p className="font-display text-[22px] font-semibold leading-tight tracking-[-0.025em] text-ink">Tell me how you feel.</p>
          <p className="mt-2 max-w-[32ch] text-[14.5px] leading-snug text-muted">
            I hold it until your next setup, and keep it only if it turns out to matter.
          </p>
        </div>
      )}
      {habits.length > 0 && (
        <section>
          <h3 className="mb-2 px-1 text-[12px] font-semibold uppercase tracking-[0.08em] text-faint">Your patterns</h3>
          <ul className="space-y-2">
            {habits.map((h) => (
              <li key={h.mood} className="rounded-[18px] border border-gold/30 bg-gold/[0.07] px-3.5 py-3 text-[13.5px] leading-snug text-ink">{h.line}</li>
            ))}
          </ul>
        </section>
      )}
      {pending.length > 0 && (
        <section>
          <h3 className="mb-2 px-1 text-[12px] font-semibold uppercase tracking-[0.08em] text-faint">Holding</h3>
          <ul className="space-y-2">{pending.map((n) => <NoteRow key={n.id} n={n} pending />)}</ul>
        </section>
      )}
      {kept.length > 0 && (
        <section>
          <h3 className="mb-2 px-1 text-[12px] font-semibold uppercase tracking-[0.08em] text-faint">Kept because it was useful</h3>
          <ul className="space-y-2">{kept.map((n) => <NoteRow key={n.id} n={n} />)}</ul>
        </section>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Minato                                                             */
/* ------------------------------------------------------------------ */

/**
 * MINATO — the trader's companion. Quiet launcher, one calm panel:
 * greeting, a few relevant suggestions, the conversation, a composer.
 * Everything the trader has recorded (journal, plans, practice, notes,
 * screenshots metadata) reaches the model; the UI stays small.
 */
export function Minato() {
  const allEntries = useApp((s) => s.entries);
  const rawSettings = useApp((s) => s.settings);
  const user = useApp((s) => s.user);
  const dayLogs = useApp((s) => s.dayLogs);
  const plans = useApp((s) => s.plans);
  const open = useUi((s) => s.minatoOpen);
  const setOpen = useUi((s) => s.setMinatoOpen);
  const focusId = useUi((s) => s.minatoTradeId);
  const reduce = useReducedMotion();
  const pathname = usePathname();

  const { entries, settings, challenge } = useMemo(() => scopeToPrimary(rawSettings, allEntries), [rawSettings, allEntries]);
  const provider = useMemo(() => resolveCoachProvider(settings), [settings]);
  const focusEntry = useMemo(() => entries.find((e) => e.id === focusId) ?? null, [entries, focusId]);

  const stats = useMemo(() => computeStats(entries, settings), [entries, settings]);
  const discipline = useMemo(() => disciplineSummary(entries, dayLogs), [entries, dayLogs]);
  const violations = useMemo(() => evaluateRules(entries, settings), [entries, settings]);
  const adherence = useMemo(() => adherenceSummary(entries, settings), [entries, settings]);

  const firstName = (settings.fullName?.trim() || user?.name || "").split(" ")[0] ?? "";

  const ctx = useMemo(
    () =>
      buildContext({
        userFirstName: firstName,
        entries,
        stats,
        discipline,
        adherence,
        playbook: settings.playbook ?? [],
        activeRules: (settings.rules?.rules ?? []).filter((r) => r.enabled),
        violations,
        focusEntry,
        includeNotes: true,
      }),
    [entries, settings, firstName, focusEntry, stats, discipline, adherence, violations],
  );

  const insights = useMemo(() => computeInsights(ctx), [ctx]);

  /* Practice sessions, plans and no-trade days — compact, bounded, JSON-only. */
  const companion = useMemo(() => {
    const pp = rawSettings.practiceProgress;
    const scopedPlans = (plans ?? []).filter((p) => !challenge || !p.challengeId || p.challengeId === challenge.id);
    return {
      practice: pp
        ? {
            xp: pp.xp,
            streak: pp.streak,
            lessonsTheyWrote: (pp.seedLessons ?? []).slice(0, 8),
            accuracyByMode: Object.entries(pp.modePerformance ?? {})
              .filter(([, v]) => v.attempts > 0)
              .map(([mode, v]) => ({ mode, accuracyPct: Math.round((v.correct / v.attempts) * 100), attempts: v.attempts }))
              .sort((a, b) => a.accuracyPct - b.accuracyPct)
              .slice(0, 10),
            masteryByTag: Object.entries(pp.masteryByTag ?? {}).sort((a, b) => a[1] - b[1]).slice(0, 12),
            last14Days: Object.entries(pp.dailyStats ?? {}).sort((a, b) => a[0].localeCompare(b[0])).slice(-14).map(([date, v]) => ({ date, ...v })),
            futureSelfPredictions: (pp.futureSelfPredictions ?? []).slice(-5).map((f) => ({ date: f.date, rule: f.rule, outcome: f.outcome ?? null })),
          }
        : null,
      plans: scopedPlans.slice(-20).map((p) => ({
        date: p.date,
        instrument: p.instrument ?? null,
        bias: p.bias ?? null,
        playbook: p.playbookName ?? null,
        process: (p.preSessionProcess ?? "").slice(0, 400) || null,
      })),
      noTradeDays: dayLogs.slice(-30).map((d) => d.date),
      todayLossLimit: rawSettings.dayLimits?.[todayKey()] ?? null,
    };
  }, [rawSettings, plans, dayLogs, challenge]);

  /* ---------------- conversation (persisted across closes & reloads) ---------------- */
  const threadKey = `${THREAD_KEY}:${user?.id ?? "guest"}`;
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [tab, setTab] = useState<"chat" | "mind">("chat");
  const [mind, setMind] = useState<MindState>(emptyMind());
  const [mindReady, setMindReady] = useState(false);
  const mindKey = `${MIND_KEY}:${user?.id ?? "guest"}`;
  const [hydrated, setHydrated] = useState(false);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [slow, setSlow] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const focusReviewed = useRef(false);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(threadKey);
      const parsed = raw ? (JSON.parse(raw) as ChatMsg[]) : [];
      setMessages(Array.isArray(parsed) ? parsed.filter((m) => m && typeof m.text === "string") : []);
    } catch { setMessages([]); }
    setHydrated(true);
  }, [threadKey]);

  useEffect(() => {
    if (!hydrated) return;
    try { window.localStorage.setItem(threadKey, JSON.stringify(messages.slice(-THREAD_MAX))); } catch { /* storage full or blocked */ }
  }, [messages, hydrated, threadKey]);

  useEffect(() => { setMind(loadMind(mindKey)); setMindReady(true); }, [mindKey]);
  useEffect(() => { if (mindReady) saveMind(mindKey, mind); }, [mind, mindReady, mindKey]);
  // Every time the journal changes, settle held feelings against the setup that was taken.
  useEffect(() => {
    if (!mindReady) return;
    setMind((m) => { const r = reconcile(m, allEntries, Date.now()); return r.changed ? r.state : m; });
  }, [allEntries, mindReady]);

  const pendingNotes = mind.notes.filter((n) => n.status === "pending");
  const keptNotes = mind.notes.filter((n) => n.status === "kept");
  const habits = useMemo(() => patterns(mind), [mind]);

  const state: MinatoState = busy ? "thinking" : topState(insights);

  // "Still working" hint only if an answer takes a while.
  useEffect(() => {
    if (!busy) { setSlow(false); return; }
    const t = window.setTimeout(() => setSlow(true), 7000);
    return () => window.clearTimeout(t);
  }, [busy]);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: reduce ? "auto" : "smooth" });
  }, [messages, busy, reduce, open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape" && !e.defaultPrevented && !e.isComposing) setOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, setOpen]);

  useEffect(() => {
    if (open && !busy) {
      const t = window.setTimeout(() => inputRef.current?.focus({ preventScroll: true }), 320);
      return () => window.clearTimeout(t);
    }
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const ask = useCallback(async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || busy) return;
    const moods = detectMoods(trimmed);
    const nowMs = Date.now();
    const mindNow = moods.length ? addNotes(mind, moods, trimmed, nowMs, todayKey()) : mind;
    if (moods.length) setMind(mindNow);
    const next: ChatMsg[] = [...messages, { role: "user", text: trimmed, ...(moods.length ? { noted: moods } : {}) }];
    setMessages(next);
    setInput("");
    if (inputRef.current) inputRef.current.style.height = "";
    setBusy(true);
    try {
      let replyText: string | null = null;
      try {
        const controller = new AbortController();
        const timeout = window.setTimeout(() => controller.abort(), 56_000);
        const res = await fetch("/api/minato/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            messages: next.map(({ role, text }) => ({ role, text })),
            entries,
            journalProvided: true,
            primaryChallenge: challenge ?? undefined,
            companion: { ...companion, mind: mindForModel(mindNow, moods, nowMs) },
          }),
          signal: controller.signal,
        });
        window.clearTimeout(timeout);
        if (res.ok) {
          const json = (await res.json()) as { text?: string; fallback?: boolean };
          replyText = json.fallback ? null : json.text ?? null;
        }
      } catch { /* offline → local provider below */ }
      if (!replyText) {
        const reply = await provider.reply({ messages: next, focusEntry }, ctx);
        replyText = reply.text;
      }
      setMessages([...next, { role: "buddy", text: replyText }]);
    } finally {
      setBusy(false);
    }
  }, [busy, messages, entries, challenge, companion, provider, focusEntry, ctx, mind]);

  // Opened from a trade → start its review once.
  useEffect(() => {
    if (open && hydrated && focusEntry && !focusReviewed.current) {
      focusReviewed.current = true;
      void ask(`Review ${focusEntry.setup || focusEntry.instrument || "this trade"}`);
    }
    if (!open) focusReviewed.current = false;
  }, [open, hydrated, focusEntry]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ---------------- suggestions that actually fit the moment ---------------- */
  const suggestions = useMemo(() => {
    if (focusEntry) return ["What did I do well?", "What should I change?", "Is this a repeat of something?"];
    if (entries.length === 0) return [];
    const today = todayKey();
    const todays = entries.filter((e) => e.date === today);
    const lostToday = todays.length > 0 && todays.reduce((s, e) => s + e.pnl, 0) < 0;
    const pp = rawSettings.practiceProgress;
    const practised = !!pp && (pp.xp > 0 || Object.keys(pp.modePerformance ?? {}).length > 0);
    return [
      lostToday ? "Help me reset after today" : "How am I doing lately?",
      "Review my last trade",
      "What pattern keeps repeating?",
      practised ? "What should I practise next?" : "How is my mindset?",
    ];
  }, [focusEntry, entries, rawSettings.practiceProgress]);

  const greeting = useMemo(() => {
    const h = new Date().getHours();
    const part = h < 5 ? "Hi" : h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
    return firstName ? `${part}, ${firstName}.` : `${part}.`;
  }, [firstName, open]); // eslint-disable-line react-hooks/exhaustive-deps

  const nudge = insights[0]?.message;
  const newChat = () => { setMessages([]); setInput(""); inputRef.current?.focus(); };

  // Minato stays out of the way: it appears at the end of a page, after a long pause, or when opened from a trade.
  const [nearEnd, setNearEnd] = useState(false);
  const [dwell, setDwell] = useState(false);
  useEffect(() => {
    const check = () => {
      const d = document.documentElement;
      const scrollable = d.scrollHeight > window.innerHeight + 120;
      const bottom = window.scrollY + window.innerHeight;
      setNearEnd((prev) => scrollable && (bottom >= d.scrollHeight - 140 || (prev && bottom >= d.scrollHeight - 420)));
    };
    check();
    window.addEventListener("scroll", check, { passive: true });
    window.addEventListener("resize", check);
    return () => { window.removeEventListener("scroll", check); window.removeEventListener("resize", check); };
  }, [pathname]);
  useEffect(() => {
    setDwell(false);
    const t = window.setTimeout(() => setDwell(true), 45_000);
    return () => window.clearTimeout(t);
  }, [pathname]);
  const showLauncher = open || nearEnd || dwell;

  const feedPhone = pathname.startsWith("/feed") && typeof window !== "undefined" && window.matchMedia("(max-width: 767px)").matches;
  const empty = messages.length === 0 && !busy;

  return (
    <>
      {/* Launcher */}
      <AnimatePresence>
      {!feedPhone && showLauncher && (
        <motion.button
          key="minato-launcher"
          initial={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.6, y: 14 }}
          animate={reduce ? { opacity: 1 } : { opacity: 1, scale: 1, y: 0 }}
          exit={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.7, y: 10 }}
          type="button"
          aria-label={open ? "Close Minato" : "Open Minato"}
          aria-expanded={open}
          onClick={() => setOpen(!open)}
          whileTap={{ scale: 0.94 }}
          transition={{ type: "spring", stiffness: 380, damping: 26 }}
          className={cn(
            "mn-launcher fixed bottom-[calc(var(--tabbar-h)+1rem)] right-[calc(1rem+var(--safe-right))] z-[90] grid h-[52px] w-[52px] place-items-center rounded-full outline-none focus-visible:ring-2 focus-visible:ring-gold/60 md:bottom-5 md:right-5",
            open && "max-md:hidden",
          )}
        >
          <AnimatePresence mode="wait" initial={false}>
            {open ? (
              <motion.span key="x" initial={{ rotate: -90, opacity: 0 }} animate={{ rotate: 0, opacity: 1 }} exit={{ rotate: 90, opacity: 0 }} transition={{ duration: 0.22, ease: EASE }} className="text-ink">
                <CloseIcon />
              </motion.span>
            ) : (
              <motion.span key="a" initial={{ rotate: 40, opacity: 0 }} animate={{ rotate: 0, opacity: 1 }} exit={{ rotate: -40, opacity: 0 }} transition={{ duration: 0.22, ease: EASE }} className="relative">
                <Avatar className="h-[40px] w-[40px]" />
                <span className={cn("absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full ring-2 ring-[var(--overlay)]", STATE_DOT[state])} />
              </motion.span>
            )}
          </AnimatePresence>
        </motion.button>
      )}
      </AnimatePresence>

      {/* Phones: tap outside closes (tab bar stays usable) */}
      <AnimatePresence>
        {open && (
          <motion.button
            key="minato-backdrop"
            type="button"
            aria-label="Close Minato"
            tabIndex={-1}
            onClick={() => setOpen(false)}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
            className="fixed inset-x-0 top-0 bottom-[var(--tabbar-h)] z-[89] bg-black/25 md:hidden"
          />
        )}
      </AnimatePresence>

      {/* Panel */}
      <AnimatePresence>
        {open && (
          <motion.div
            role="dialog"
            aria-label="Minato"
            initial={reduce ? { opacity: 0 } : { opacity: 0, y: 18, scale: 0.97 }}
            animate={reduce ? { opacity: 1 } : { opacity: 1, y: 0, scale: 1 }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, y: 12, scale: 0.98 }}
            transition={{ duration: 0.32, ease: EASE }}
            style={{ transformOrigin: "bottom right" }}
            className="mn-panel fixed inset-x-3 bottom-[calc(var(--tabbar-h)+0.75rem)] z-[90] flex h-[min(620px,calc(100dvh-var(--tabbar-h)-var(--topbar-h)-1.5rem))] flex-col overflow-hidden rounded-[26px] md:inset-x-auto md:bottom-[84px] md:right-5 md:h-[min(620px,calc(100dvh-7.5rem))] md:w-[min(400px,calc(100vw-2.5rem))]"
          >
            {/* Header */}
            <div className="mn-head flex items-center gap-3 px-4 py-3">
              <Avatar className="h-9 w-9 shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="text-[15px] font-semibold leading-tight tracking-[-0.01em] text-ink">Minato</p>
                <p className="flex items-center gap-1.5 truncate text-[12px] text-muted">
                  <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", STATE_DOT[state])} />
                  <span className="truncate">{busy ? "Thinking…" : challenge ? challenge.name : "Your trading companion"}</span>
                </p>
              </div>
              {messages.length > 0 && (
                <button type="button" aria-label="New conversation" title="New conversation" onClick={newChat} className="mn-icon-btn group">
                  <span className="transition-transform duration-300 ease-out group-hover:-rotate-12 group-active:rotate-[-24deg]"><ComposeIcon /></span>
                </button>
              )}
              <button type="button" aria-label="Close Minato" onClick={() => setOpen(false)} className="mn-icon-btn group">
                <span className="transition-transform duration-300 ease-out group-hover:rotate-90"><CloseIcon /></span>
              </button>
            </div>

            {/* Chat | Mind */}
            <div className="px-4 pb-2">
              <div role="tablist" aria-label="Minato views" className="relative grid grid-cols-2 rounded-full bg-ink/[0.06] p-0.5 text-[13px] font-medium">
                {(["chat", "mind"] as const).map((t) => (
                  <button
                    key={t}
                    type="button"
                    role="tab"
                    aria-selected={tab === t}
                    onClick={() => setTab(t)}
                    className={cn("relative h-8 rounded-full outline-none transition-colors duration-200 focus-visible:ring-2 focus-visible:ring-gold/50", tab === t ? "text-ink" : "text-muted hover:text-ink")}
                  >
                    {tab === t && <motion.span layoutId="mn-tab" transition={{ type: "spring", stiffness: 420, damping: 34 }} className="absolute inset-0 rounded-full bg-surface shadow-[0_1px_3px_rgb(0_0_0/0.12)]" />}
                    <span className="relative inline-flex items-center gap-1.5">
                      {t === "chat" ? "Chat" : "Mind"}
                      {t === "mind" && pendingNotes.length > 0 && <span className="h-1.5 w-1.5 rounded-full bg-gold" aria-label={`${pendingNotes.length} held`} />}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            {tab === "mind" && <MindPane pending={pendingNotes} kept={keptNotes} habits={habits} />}

            {/* Conversation */}
            <div ref={listRef} className={cn("flex-1 space-y-2.5 overflow-y-auto overscroll-contain px-4 py-4", tab !== "chat" && "hidden")} aria-live="polite">
              {empty && (
                <motion.div initial={reduce ? false : { opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, ease: EASE, delay: 0.08 }} className="flex h-full min-h-[180px] flex-col justify-center px-1">
                  <p className="font-display text-[28px] font-semibold leading-[1.1] tracking-[-0.03em] text-ink">{greeting}</p>
                  <p className="mt-2 max-w-[30ch] text-[14.5px] leading-snug text-muted">
                    {nudge ?? (entries.length === 0 ? "Log your first trade and I’ll start learning how you trade." : "What’s on your mind about your trading?")}
                  </p>
                </motion.div>
              )}

              {messages.map((m, i) => (
                <motion.div
                  key={i}
                  initial={reduce ? false : { opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.28, ease: EASE }}
                  className={cn("flex flex-col gap-1", m.role === "user" ? "items-end" : "items-start")}
                >
                  <div
                    className={cn(
                      "max-w-[88%] rounded-[20px] px-3.5 py-2.5 text-[14px] leading-[1.45]",
                      m.role === "user" ? "rounded-br-[6px] bg-ink text-canvas" : "rounded-bl-[6px] bg-ink/[0.06] text-ink",
                    )}
                  >
                    {m.role === "user" ? <p className="whitespace-pre-wrap break-words">{m.text}</p> : <div className="space-y-1">{renderMinatoText(m.text)}</div>}
                  </div>
                  {m.noted && m.noted.length > 0 && (
                    <button type="button" onClick={() => setTab("mind")} className="flex items-center gap-1.5 px-1.5 text-[11.5px] text-faint transition-colors hover:text-gold">
                      <span className="h-1.5 w-1.5 rounded-full bg-gold" aria-hidden />
                      Noted {m.noted.map((x) => MOOD_LABEL[x].toLowerCase()).join(" · ")}. Holding it for your next setup.
                    </button>
                  )}
                </motion.div>
              ))}

              {busy && (
                <div className="flex justify-start">
                  <div className="flex items-center gap-2.5 rounded-[20px] rounded-bl-[6px] bg-ink/[0.06] px-4 py-3">
                    <span className="mn-typing" aria-label="Minato is thinking"><i /><i /><i /></span>
                    {slow && <span className="text-[12px] text-muted">Going through your journal…</span>}
                  </div>
                </div>
              )}
            </div>

            {/* Suggestions — only before the conversation starts */}
            {tab === "chat" && empty && suggestions.length > 0 && (
              <div className="mn-chips flex gap-2 overflow-x-auto px-4 pb-2.5 pt-1 [scrollbar-width:none]">
                {suggestions.map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => void ask(p)}
                    className="shrink-0 rounded-full bg-ink/[0.06] px-3.5 py-2 text-[13px] font-medium text-ink transition-[background-color,transform] duration-200 hover:bg-ink/[0.1] active:scale-[0.97]"
                  >
                    {p}
                  </button>
                ))}
              </div>
            )}

            {/* Composer */}
            <form
              className={cn("px-3 pb-3 pt-1", tab !== "chat" && "hidden")}
              onSubmit={(e) => { e.preventDefault(); void ask(input); }}
            >
              <div className="mn-field flex items-end gap-2 rounded-[22px] bg-ink/[0.06] py-1.5 pl-4 pr-1.5">
                <textarea
                  ref={inputRef}
                  rows={1}
                  aria-label="Message Minato"
                  placeholder="Ask Minato…"
                  value={input}
                  onChange={(e) => {
                    setInput(e.target.value);
                    e.currentTarget.style.height = "auto";
                    e.currentTarget.style.height = `${Math.min(e.currentTarget.scrollHeight, 120)}px`;
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); void ask(input); }
                  }}
                  className="max-h-[120px] min-h-[28px] flex-1 resize-none self-center bg-transparent py-[3px] text-[15px] leading-[22px] text-ink outline-none placeholder:text-faint"
                />
                <button type="submit" aria-label="Send" disabled={busy || !input.trim()} className="mn-send group">
                  <span className="transition-transform duration-300 ease-out group-enabled:group-hover:-translate-y-px"><SendIcon /></span>
                </button>
              </div>
            </form>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
