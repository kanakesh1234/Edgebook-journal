"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { AnimatePresence, motion, useDragControls, useReducedMotion } from "motion/react";
import { useApp } from "@/lib/store";
import { MINATO_MAX_WIDTH, MINATO_MIN_WIDTH, useUi } from "@/lib/ui-store";
import { scopeToPrimary } from "@/lib/challenges";
import { computeStats } from "@/lib/stats";
import { disciplineSummary } from "@/lib/discipline";
import { evaluateRules, adherenceSummary } from "@/lib/rules";
import { computeInsights, topState, type MinatoState } from "@/lib/minato/insights";
import { buildContext } from "@/lib/minato/context";
import { resolveCoachProvider, type MinatoMessage } from "@/lib/services/ai";
import { todayKey } from "@/lib/format";
import { loadMind, MOOD_LABEL, mindForModel, type Mood } from "@/lib/minato/mind";
import { applyChat, brainForModel, buildRecall, collectWords, emptyBrain, readinessNow, reconcileBrain, trainNet, type MinatoBrain } from "@/lib/minato/brain-ml";
import { evolveMemory, applyDirectives } from "@/lib/minato/evolve";
import { memoryForModel } from "@/lib/minato/retrieve";
import { applyMemoryOp, useMindView } from "@/lib/minato/bridge";
import { sessionNudge } from "@/lib/minato/nudge";
import { routeIntent, planFor, type Intent } from "@/lib/minato/router";
import { applyExtractedMemories, extractStructuredMemoriesFromTurn, readUserSemanticParams } from "@/lib/minato/extract";
import { cn } from "@/lib/utils";
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

const SPRING_EASE: [number, number, number, number] = [0.32, 0.72, 0, 1];

const THREAD_KEY = "edgebook:minato:thread:v1";
const MIND_KEY = "edgebook:minato:mind:v1";
type ChatMsg = MinatoMessage & {
  noted?: Mood[];
  committed?: string[];
  savedFacts?: string[];
};
const BRAIN_MIRROR = "edgebook:minato:brain:v1";
const THREAD_MAX = 60;

/* ------------------------------------------------------------------ */
/*  Light-weight reply formatting (bold, numbered findings, bullets)   */
/* ------------------------------------------------------------------ */

function renderInline(text: string) {
  const normalized = text.replace(/\\\*/g, "*");
  return normalized.split(/(\*\*[^*\n]+\*\*|`[^`\n]+`)/g).map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**") && part.length > 4) {
      return <strong key={i} className="font-semibold text-ink">{part.slice(2, -2)}</strong>;
    }
    if (part.startsWith("`") && part.endsWith("`") && part.length > 2) {
      return (
        <code key={i} className="rounded bg-ink/[0.08] px-1.5 py-0.5 font-mono text-[12.5px] text-ink">
          {part.slice(1, -1)}
        </code>
      );
    }
    return <span key={i}>{part}</span>;
  });
}

function renderMinatoText(text: string) {
  return text.replace(/\r/g, "").split("\n").map((line, i) => {
    const numbered = line.match(/^(\d+)\.\s+(.+)$/);
    if (numbered) {
      return (
        <div key={i} className="minato-finding">
          <span className="minato-finding-number">{numbered[1]}</span>
          <span className="min-w-0 leading-[1.55]">{renderInline(numbered[2])}</span>
        </div>
      );
    }
    const bullet = line.match(/^\s*[-•–]\s+(.+)$/);
    if (bullet) {
      return (
        <div key={i} className="minato-supporting-point">
          <span>•</span>
          <span className="min-w-0 leading-[1.55]">{renderInline(bullet[1])}</span>
        </div>
      );
    }
    if (!line.trim()) return <div key={i} className="h-2" aria-hidden />;
    return <p key={i} className="leading-[1.58]">{renderInline(line)}</p>;
  });
}

/* ------------------------------------------------------------------ */
/*  Icons                                                              */
/* ------------------------------------------------------------------ */

const Svg = ({ children, className = "h-[17px] w-[17px]" }: { children: React.ReactNode; className?: string }) => (
  <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" aria-hidden>{children}</svg>
);
const CloseIcon = () => <Svg><path d="M6 6l12 12M18 6 6 18" /></Svg>;
const ComposeIcon = () => <Svg><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" /></Svg>;
const SendIcon = () => <Svg className="h-4 w-4"><path d="M12 19V5M5 12l7-7 7 7" /></Svg>;
const ExpandIcon = ({ expanded }: { expanded: boolean }) =>
  expanded ? (
    <Svg><path d="M4 14h6v6M20 10h-6V4M14 10l7-7M3 21l7-7" /></Svg>
  ) : (
    <Svg><path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" /></Svg>
  );

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
/*  Minato                                                             */
/* ------------------------------------------------------------------ */

/**
 * MINATO — Apple HIG Redesigned Companion:
 * - Desktop (≥768px): Docked right-side panel that pushes page content (never covers the calendar),
 *   resizable between 400px and 640px with an expand-to-focus mode, ~70ch readable line length,
 *   comfortable line height, spacious list cards, and ONLY ONE close button (launcher hides when open).
 * - Mobile (<768px): Full-height bottom sheet with a drag handle, sticky keyboard-aware composer,
 *   and safe areas respected.
 */
export function Minato() {
  const allEntries = useApp((s) => s.entries);
  const rawSettings = useApp((s) => s.settings);
  const user = useApp((s) => s.user);
  const dayLogs = useApp((s) => s.dayLogs);
  const plans = useApp((s) => s.plans);

  const open = useUi((s) => s.minatoOpen);
  const setOpen = useUi((s) => s.setMinatoOpen);
  const width = useUi((s) => s.minatoWidth);
  const setWidth = useUi((s) => s.setMinatoWidth);
  const focused = useUi((s) => s.minatoFocused);
  const setFocused = useUi((s) => s.setMinatoFocused);
  const focusId = useUi((s) => s.minatoTradeId);

  const reduce = useReducedMotion();
  const dragControls = useDragControls();
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

  /* ---------------- conversation & memory ---------------- */
  const threadKey = `${THREAD_KEY}:${user?.id ?? "guest"}`;
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [brain, setBrain] = useState<MinatoBrain>(emptyBrain());
  const [mindReady, setMindReady] = useState(false);
  const brainKey = `${BRAIN_MIRROR}:${user?.id ?? "guest"}`;
  const mindKey = `${MIND_KEY}:${user?.id ?? "guest"}`;
  const [hydrated, setHydrated] = useState(false);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [slow, setSlow] = useState(false);
  const [savedBanner, setSavedBanner] = useState<string | null>(null);
  const [pendingSlot, setPendingSlot] = useState<"stop_points" | "risk_per_trade" | "both" | null>(null);
  const [keyboardOffset, setKeyboardOffset] = useState(0);

  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const focusReviewed = useRef(false);
  const resizingRef = useRef(false);

  // Sync CSS variable `--minato-dock-w` on `document.documentElement` so `.app-main` pushes smoothly on desktop
  useEffect(() => {
    const root = document.documentElement;
    if (open) {
      const effectiveW = focused ? 720 : width;
      root.style.setProperty("--minato-dock-w", `${effectiveW}px`);
      root.setAttribute("data-minato-open", "true");
    } else {
      root.style.setProperty("--minato-dock-w", "0px");
      root.removeAttribute("data-minato-open");
    }
    return () => {
      root.style.setProperty("--minato-dock-w", "0px");
      root.removeAttribute("data-minato-open");
    };
  }, [open, width, focused]);

  // Mobile visualViewport keyboard-aware composer offset
  useEffect(() => {
    if (!open || typeof window === "undefined" || !window.visualViewport) return;
    const vv = window.visualViewport;
    const onViewport = () => {
      const kb = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
      setKeyboardOffset(kb);
    };
    vv.addEventListener("resize", onViewport);
    vv.addEventListener("scroll", onViewport);
    onViewport();
    return () => {
      vv.removeEventListener("resize", onViewport);
      vv.removeEventListener("scroll", onViewport);
      setKeyboardOffset(0);
    };
  }, [open]);

  // Subtle "Saved to memory" confirmation banner timeout
  useEffect(() => {
    if (!savedBanner) return;
    const t = window.setTimeout(() => setSavedBanner(null), 3200);
    return () => window.clearTimeout(t);
  }, [savedBanner]);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(threadKey);
      const parsed = raw ? (JSON.parse(raw) as { day?: string; messages?: ChatMsg[] } | ChatMsg[]) : null;
      const sameDay = parsed && !Array.isArray(parsed) && parsed.day === todayKey() && Array.isArray(parsed.messages);
      setMessages(sameDay ? (parsed as { messages: ChatMsg[] }).messages.filter((m) => m && typeof m.text === "string") : []);
    } catch {
      setMessages([]);
    }
    setHydrated(true);
  }, [threadKey]);

  useEffect(() => {
    if (!hydrated) return;
    try {
      window.localStorage.setItem(threadKey, JSON.stringify({ day: todayKey(), messages: messages.slice(-THREAD_MAX) }));
    } catch {
      /* storage full or blocked */
    }
  }, [messages, hydrated, threadKey]);

  // Hydrate brain
  useEffect(() => {
    let b: MinatoBrain | null = useApp.getState().settings.aiBrain?.minato ?? null;
    if (!b) {
      try {
        const raw = window.localStorage.getItem(brainKey);
        if (raw) b = JSON.parse(raw) as MinatoBrain;
      } catch {
        /* ignore */
      }
    }
    setBrain(b ? { ...emptyBrain(), ...b } : { ...emptyBrain(), mind: loadMind(mindKey) });
    setMindReady(true);
  }, [brainKey, mindKey]);

  // Persist brain
  useEffect(() => {
    if (!mindReady) return;
    try {
      window.localStorage.setItem(brainKey, JSON.stringify(brain));
    } catch {
      /* storage blocked */
    }
    const t = window.setTimeout(() => {
      const st = useApp.getState();
      const ai = st.settings.aiBrain;
      if (!ai || JSON.stringify(ai.minato ?? null) === JSON.stringify(brain)) return;
      void st.updateSettings({ aiBrain: { ...ai, minato: brain } });
    }, 2500);
    return () => window.clearTimeout(t);
  }, [brain, mindReady, brainKey]);

  // Reconcile brain with journal
  useEffect(() => {
    if (!mindReady) return;
    setBrain((b) => reconcileBrain(b, allEntries, Date.now(), todayKey()));
    const t = window.setTimeout(
      () =>
        setBrain((b) => {
          const net = trainNet(allEntries, plans ?? [], b.mind, b.net);
          return net === b.net ? b : { ...b, net };
        }),
      700,
    );
    return () => window.clearTimeout(t);
  }, [allEntries, plans, mindReady]);

  // Evolve long-term memory
  useEffect(() => {
    if (!mindReady) return;
    const t = window.setTimeout(() => setBrain((b) => evolveMemory(b, allEntries, plans ?? [], Date.now())), 1100);
    return () => window.clearTimeout(t);
  }, [allEntries, plans, mindReady, brain.mind.stats, brain.mind.notes]);

  const recall = useMemo(
    () => buildRecall(collectWords(allEntries, plans ?? [], rawSettings, brain)),
    [allEntries, plans, rawSettings, brain.days, brain.saved], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const readiness = useMemo(
    () => readinessNow(brain.net, allEntries, plans ?? [], brain.mind, todayKey()),
    [brain.net, brain.mind, allEntries, plans],
  );

  const saveInsight = (full: string) => {
    setBrain((b) => {
      const text = full.slice(0, 600);
      return b.saved.some((x) => x.text === text)
        ? b
        : { ...b, saved: [...b.saved, { id: `s-${Date.now()}`, date: todayKey(), text, at: Date.now() }].slice(-20) };
    });
    setSavedBanner("Saved to memory");
  };

  // Publish to Settings bridge
  useEffect(() => {
    if (mindReady) useMindView.getState().publish(brain);
  }, [brain, mindReady]);
  useEffect(() => {
    useMindView.getState().register((op) => setBrain((b) => applyMemoryOp(b, op, Date.now())));
    return () => useMindView.getState().register(null);
  }, []);
  const lastIntent = useRef<Intent | null>(null);

  const state: MinatoState = busy ? "thinking" : topState(insights);

  useEffect(() => {
    if (!busy) {
      setSlow(false);
      return;
    }
    const t = window.setTimeout(() => setSlow(true), 7000);
    return () => window.clearTimeout(t);
  }, [busy]);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: reduce ? "auto" : "smooth" });
  }, [messages, busy, reduce, open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !e.defaultPrevented && !e.isComposing) setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, setOpen]);

  useEffect(() => {
    if (open && !busy) {
      const t = window.setTimeout(() => inputRef.current?.focus({ preventScroll: true }), 260);
      return () => window.clearTimeout(t);
    }
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  // Desktop left-edge resize handler (400–640px)
  const startResize = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault();
      resizingRef.current = true;
      setFocused(false);
      const onMove = (ev: PointerEvent) => {
        if (!resizingRef.current) return;
        const nextW = window.innerWidth - ev.clientX;
        setWidth(Math.max(MINATO_MIN_WIDTH, Math.min(MINATO_MAX_WIDTH, nextW)));
      };
      const onUp = () => {
        resizingRef.current = false;
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
      };
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
    },
    [setWidth, setFocused],
  );

  const ask = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || busy) return;
      const nowMs = Date.now();
      const msgId = `msg_${nowMs}`;

      // 1. Apply explicit directives ("remember that…" / "forget…")
      const dir = applyDirectives(brain, trimmed, nowMs);

      // 2. Post-turn structured JSON memory extraction (Semantic & Episodic write path)
      const extracted = extractStructuredMemoriesFromTurn({
        text: trimmed,
        messageId: msgId,
        now: nowMs,
        pendingQuestionSlot: pendingSlot,
        linkedTradeIds: focusEntry ? [focusEntry.id] : [],
      });
      const afterExtract = applyExtractedMemories(dir.brain, extracted, nowMs);

      // 3. Apply chat brief & feelings
      const applied = applyChat(afterExtract.brain, trimmed, nowMs, todayKey());

      // 4. Route intent & retrieve hybrid memories within token budget
      const route = routeIntent(trimmed, { hasFocus: !!focusEntry, prev: lastIntent.current });
      lastIntent.current = route.intent;
      const plan = planFor(route);
      const memory = memoryForModel(applied.brain.memory, trimmed, plan, nowMs);
      const semanticParams = readUserSemanticParams(applied.brain.memory);

      // Log retrieval telemetry for Debug Mode in Settings
      if (memory.debug) {
        useMindView.getState().pushDebugLog({
          id: `dbg_${nowMs}`,
          at: nowMs,
          query: trimmed,
          intent: route.intent,
          category: route.category,
          toolsCalled: route.toolsToCall,
          tokenBudget: memory.debug.tokenBudget,
          tokensUsed: memory.debug.tokensUsed,
          retrieved: memory.debug.items,
        });
      }

      const savedFactLabels = [
        ...(dir.remembered ? [dir.remembered] : []),
        ...afterExtract.savedRecords.map((r) => r.short),
      ];
      if (savedFactLabels.length > 0) {
        setSavedBanner(`Saved to memory · ${savedFactLabels[0]}`);
        setPendingSlot(null);
      } else if (dir.forgotten) {
        setSavedBanner(`Removed from memory · ${dir.forgotten}`);
      }

      const moods = applied.moods;
      setBrain(applied.brain);
      const next: ChatMsg[] = [
        ...messages,
        {
          role: "user",
          text: trimmed,
          ...(moods.length ? { noted: moods } : {}),
          ...(applied.commitments.length ? { committed: applied.commitments } : {}),
          ...(savedFactLabels.length ? { savedFacts: savedFactLabels } : {}),
        },
      ];
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
              focusTradeId: focusEntry?.id ?? null,
              prevIntent: lastIntent.current,
              semanticParams,
              companion: {
                ...companion,
                semanticParams,
                mind: mindForModel(applied.brain.mind, moods, nowMs),
                brain: brainForModel(applied.brain, recall, trimmed, readiness, todayKey()),
                memory,
              },
            }),
            signal: controller.signal,
          });
          window.clearTimeout(timeout);
          if (res.ok) {
            const json = (await res.json()) as { text?: string; fallback?: boolean };
            replyText = json.fallback ? null : json.text ?? null;
          }
        } catch {
          /* offline → local provider below */
        }
        if (!replyText) {
          const reply = await provider.reply({ messages: next, focusEntry }, ctx);
          replyText = reply.text;
        }
        // Detect if Minato asked once for missing stop size or risk % so the next user reply is captured into semantic memory
        if (/isn't saved in memory yet/i.test(replyText)) {
          const needsStop = semanticParams.stopPoints === null;
          const needsRisk = semanticParams.riskDollars === null && semanticParams.riskPct === null;
          setPendingSlot(needsStop && needsRisk ? "both" : needsStop ? "stop_points" : "risk_per_trade");
        }
        setMessages([...next, { role: "buddy", text: replyText }]);
      } finally {
        setBusy(false);
      }
    },
    [busy, messages, entries, challenge, companion, provider, focusEntry, ctx, brain, recall, readiness, pendingSlot],
  );

  // Opened from a trade → start its review once.
  useEffect(() => {
    if (open && hydrated && focusEntry && !focusReviewed.current) {
      focusReviewed.current = true;
      void ask(`Review ${focusEntry.setup || focusEntry.instrument || "this trade"}`);
    }
    if (!open) focusReviewed.current = false;
  }, [open, hydrated, focusEntry]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ---------------- suggestions ---------------- */
  const suggestions = useMemo(() => {
    if (focusEntry) return ["What did I do well?", "What should I change?", "Is this a repeat of something?"];
    if (entries.length === 0) return [];
    const today = todayKey();
    const todays = entries.filter((e) => e.date === today);
    const lostToday = todays.length > 0 && todays.reduce((s, e) => s + e.pnl, 0) < 0;
    return [
      lostToday ? "Help me reset after today" : "How am I doing lately?",
      "With my win rate, what's the max losing streak & MNQ/NQ size?",
      "Review my last trade",
      "What pattern keeps repeating?",
    ];
  }, [focusEntry, entries]);

  const greeting = useMemo(() => {
    const h = new Date().getHours();
    const part = h < 5 ? "Hi" : h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
    return firstName ? `${part}, ${firstName}.` : `${part}.`;
  }, [firstName, open]); // eslint-disable-line react-hooks/exhaustive-deps

  const learned = useMemo(
    () => sessionNudge({ memory: brain.memory, readiness, commitments: brain.commitments, today: todayKey(), entries: allEntries }),
    [brain.memory, brain.commitments, readiness, allEntries, open], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const nudge = learned?.text ?? insights[0]?.message;
  const chips = useMemo(() => (learned ? [learned.ask, ...suggestions].slice(0, 4) : suggestions), [learned, suggestions]);
  const newChat = () => {
    setMessages([]);
    setInput("");
    inputRef.current?.focus();
  };

  const feedPhone = pathname.startsWith("/feed") && typeof window !== "undefined" && window.matchMedia("(max-width: 767px)").matches;
  const empty = messages.length === 0 && !busy;
  const desktopPanelWidth = focused ? 720 : width;

  return (
    <>
      {/* Launcher — ONLY visible when Minato is closed so there is NEVER a duplicate close button */}
      <AnimatePresence>
        {!feedPhone && !open && (
          <motion.button
            key="minato-launcher"
            initial={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.7, y: 12 }}
            animate={reduce ? { opacity: 1 } : { opacity: 1, scale: 1, y: 0 }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.7, y: 10 }}
            type="button"
            aria-label="Open Minato"
            aria-expanded={open}
            onClick={() => setOpen(true)}
            whileTap={{ scale: 0.94 }}
            transition={{ duration: 0.28, ease: SPRING_EASE }}
            className="mn-launcher fixed bottom-[calc(var(--tabbar-h)+1rem)] right-[calc(1rem+var(--safe-right))] z-[85] grid h-[52px] w-[52px] place-items-center rounded-full outline-none focus-visible:ring-2 focus-visible:ring-gold/60 md:bottom-6 md:right-6"
          >
            <span className="relative">
              <Avatar className="h-[40px] w-[40px]" />
              <span className={cn("absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full ring-2 ring-[var(--overlay)]", STATE_DOT[state])} />
            </span>
          </motion.button>
        )}
      </AnimatePresence>

      {/* Mobile Scrim Backdrop */}
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
            transition={{ duration: 0.28, ease: SPRING_EASE }}
            className="fixed inset-0 z-[89] bg-black/40 backdrop-blur-[2px] md:hidden"
          />
        )}
      </AnimatePresence>

      {/* Docked Desktop Right-Side Panel & Mobile Full-Height Bottom Sheet */}
      <AnimatePresence>
        {open && (
          <motion.aside
            role="dialog"
            aria-label="Minato"
            initial={reduce ? { opacity: 0 } : { opacity: 0, x: 32, y: 0 }}
            animate={reduce ? { opacity: 1 } : { opacity: 1, x: 0, y: 0 }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, x: 32, y: 0 }}
            transition={{ duration: 0.32, ease: SPRING_EASE }}
            drag="y"
            dragControls={dragControls}
            dragListener={false}
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0, bottom: 0.35 }}
            onDragEnd={(_, info) => {
              if (info.offset.y > 100 || info.velocity.y > 650) setOpen(false);
            }}
            style={
              {
                "--mn-desktop-w": `${desktopPanelWidth}px`,
                paddingBottom: keyboardOffset > 0 ? `${keyboardOffset}px` : undefined,
              } as React.CSSProperties
            }
            className={cn(
              "mn-panel fixed z-[90] flex flex-col overflow-hidden",
              // Mobile (<768px): full-height bottom sheet with rounded top corners and safe-area awareness
              "inset-x-0 bottom-0 h-[calc(100dvh-var(--safe-top)-0.5rem)] rounded-t-[24px]",
              // Desktop (≥768px): docked right-side panel, full viewport height, pushes page content
              "md:inset-y-0 md:left-auto md:right-0 md:h-dvh md:w-[var(--mn-desktop-w)] md:rounded-none md:border-l md:border-line",
            )}
          >
            {/* Desktop Left-Edge Resize Handle (400px – 640px) */}
            <div
              onPointerDown={startResize}
              role="separator"
              aria-orientation="vertical"
              aria-label="Resize Minato panel"
              title="Drag to resize (400–640px)"
              className="mn-resize-handle hidden md:block"
            />

            {/* Mobile Drag Handle */}
            <div
              onPointerDown={(e) => dragControls.start(e)}
              className="flex shrink-0 cursor-grab touch-none justify-center pb-1 pt-2.5 active:cursor-grabbing md:hidden"
            >
              <span className="sheet-handle" />
            </div>

            {/* Header (Single Close Button + Expand-to-Focus + New Chat) */}
            <div className="mn-head flex shrink-0 items-center gap-3 px-4 py-3.5 md:px-5 md:py-4">
              <Avatar className="h-9 w-9 shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="text-[15px] font-semibold leading-tight tracking-[-0.01em] text-ink">Minato</p>
                <p className="flex items-center gap-1.5 truncate text-[12px] text-muted">
                  <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", STATE_DOT[state])} />
                  <span className="truncate">{busy ? "Thinking…" : challenge ? challenge.name : "Your trading companion"}</span>
                </p>
              </div>

              {messages.length > 0 && (
                <button
                  type="button"
                  aria-label="New conversation"
                  title="New conversation"
                  onClick={newChat}
                  className="mn-icon-btn group"
                >
                  <span className="transition-transform duration-300 ease-out group-hover:-rotate-12 group-active:rotate-[-24deg]">
                    <ComposeIcon />
                  </span>
                </button>
              )}

              {/* Desktop Expand-to-Focus toggle */}
              <button
                type="button"
                aria-label={focused ? "Restore panel width" : "Expand to focus mode"}
                title={focused ? "Restore width" : "Expand to focus mode"}
                onClick={() => setFocused(!focused)}
                className="mn-icon-btn hidden md:grid"
              >
                <ExpandIcon expanded={focused} />
              </button>

              {/* Single Close Button */}
              <button
                type="button"
                aria-label="Close Minato"
                title="Close (Esc)"
                onClick={() => setOpen(false)}
                className="mn-icon-btn group"
              >
                <span className="transition-transform duration-300 ease-out group-hover:rotate-90">
                  <CloseIcon />
                </span>
              </button>
            </div>

            {/* Subtle "Saved to memory" toast bar */}
            <AnimatePresence>
              {savedBanner && (
                <motion.div
                  initial={{ opacity: 0, y: -8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.22, ease: SPRING_EASE }}
                  role="status"
                  aria-live="polite"
                  className="mx-4 mt-2.5 flex items-center justify-between gap-2 rounded-full border border-profit/30 bg-profit/10 px-3.5 py-1.5 text-[12px] font-medium text-profit"
                >
                  <span className="flex items-center gap-2 truncate">
                    <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-profit" />
                    <span className="truncate">{savedBanner}</span>
                  </span>
                  <span className="shrink-0 text-[11px] text-muted">Settings → MINATO</span>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Conversation Stream (~70ch readable line length, full paragraphs visible, generous spacing) */}
            <div
              ref={listRef}
              className="flex-1 space-y-4 overflow-y-auto overscroll-contain px-4 pb-5 pt-5 md:px-6"
              aria-live="polite"
            >
              {empty && (
                <motion.div
                  initial={reduce ? false : { opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.35, ease: SPRING_EASE, delay: 0.05 }}
                  className="mx-auto flex h-full min-h-[200px] max-w-[65ch] flex-col justify-center px-1"
                >
                  <p className="font-display text-[28px] font-semibold leading-[1.12] tracking-[-0.03em] text-ink">
                    {greeting}
                  </p>
                  <p className="mt-2.5 max-w-[54ch] text-[15px] leading-[1.55] text-muted">
                    {nudge ??
                      (entries.length === 0
                        ? "Log your first trade and I’ll start learning how you trade."
                        : "Ask me about losing streak probabilities, exact MNQ/NQ position sizing, or your journal patterns.")}
                  </p>
                </motion.div>
              )}

              {messages.map((m, i) => (
                <motion.div
                  key={i}
                  initial={reduce ? false : { opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.26, ease: SPRING_EASE }}
                  className={cn(
                    "mx-auto flex w-full max-w-[70ch] flex-col gap-1.5",
                    m.role === "user" ? "items-end" : "items-start",
                  )}
                >
                  <div
                    className={cn(
                      "rounded-[20px] px-4 py-3 text-[14.5px] leading-[1.58]",
                      m.role === "user"
                        ? "max-w-[88%] rounded-br-[6px] bg-ink text-canvas"
                        : "w-full max-w-[68ch] rounded-bl-[6px] bg-ink/[0.055] text-ink",
                    )}
                  >
                    {m.role === "user" ? (
                      <p className="whitespace-pre-wrap break-words">{m.text}</p>
                    ) : (
                      <div className="space-y-2">{renderMinatoText(m.text)}</div>
                    )}
                  </div>

                  {m.savedFacts && m.savedFacts.length > 0 && (
                    <p className="flex items-center gap-1.5 px-1.5 text-[11.5px] font-medium text-profit">
                      <span className="h-1.5 w-1.5 rounded-full bg-profit" aria-hidden />
                      Saved to memory: {m.savedFacts.join(" · ")}
                    </p>
                  )}
                  {m.noted && m.noted.length > 0 && (
                    <p className="flex items-center gap-1.5 px-1.5 text-[11.5px] text-faint">
                      <span className="h-1.5 w-1.5 rounded-full bg-gold" aria-hidden />
                      Noted {m.noted.map((x) => MOOD_LABEL[x].toLowerCase()).join(" · ")}. I’ll keep it in mind for today.
                    </p>
                  )}
                  {m.committed && m.committed.length > 0 && (
                    <p className="flex items-center gap-1.5 px-1.5 text-[11.5px] text-faint">
                      <span className="h-1.5 w-1.5 rounded-full bg-profit" aria-hidden />
                      Saved your commitment. I&apos;ll check it against your trades.
                    </p>
                  )}
                  {m.role === "buddy" && (
                    <button
                      type="button"
                      onClick={() => saveInsight(m.text)}
                      disabled={brain.saved.some((x) => x.text === m.text.slice(0, 600))}
                      className="group flex min-h-[32px] items-center gap-1.5 px-1.5 text-[11.5px] text-faint transition-colors hover:text-gold disabled:text-gold"
                    >
                      <svg
                        viewBox="0 0 24 24"
                        className="h-3.5 w-3.5 transition-transform duration-300 group-hover:-rotate-6"
                        fill={brain.saved.some((x) => x.text === m.text.slice(0, 600)) ? "currentColor" : "none"}
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinejoin="round"
                        aria-hidden
                      >
                        <path d="M6 4h12v17l-6-4-6 4Z" />
                      </svg>
                      {brain.saved.some((x) => x.text === m.text.slice(0, 600)) ? "Saved to memory" : "Save insight"}
                    </button>
                  )}
                </motion.div>
              ))}

              {busy && (
                <div className="mx-auto flex w-full max-w-[70ch] justify-start">
                  <div className="flex items-center gap-2.5 rounded-[20px] rounded-bl-[6px] bg-ink/[0.06] px-4 py-3">
                    <span className="mn-typing" aria-label="Minato is thinking">
                      <i />
                      <i />
                      <i />
                    </span>
                    {slow && <span className="text-[12px] text-muted">Running calculations & checking journal…</span>}
                  </div>
                </div>
              )}
            </div>

            {/* Suggestions — before conversation starts */}
            {empty && chips.length > 0 && (
              <div className="mn-chips flex shrink-0 gap-2 overflow-x-auto px-4 pb-2.5 pt-1 md:px-5 [scrollbar-width:none]">
                {chips.map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => void ask(p)}
                    className="min-h-[40px] shrink-0 rounded-full bg-ink/[0.06] px-4 py-2 text-[13px] font-medium text-ink transition-[background-color,transform] duration-200 hover:bg-ink/[0.1] active:scale-[0.97]"
                  >
                    {p}
                  </button>
                ))}
              </div>
            )}

            {/* Sticky Keyboard-Aware Composer */}
            <form
              className="shrink-0 border-t border-line/60 bg-surface/60 px-3 pb-[max(0.75rem,var(--safe-bottom))] pt-2.5 md:px-5 md:pb-4"
              onSubmit={(e) => {
                e.preventDefault();
                void ask(input);
              }}
            >
              <div className="mn-field mx-auto flex max-w-[70ch] items-end gap-2 rounded-[22px] bg-ink/[0.06] py-1.5 pl-4 pr-1.5">
                <textarea
                  ref={inputRef}
                  rows={1}
                  aria-label="Message Minato"
                  placeholder={
                    pendingSlot
                      ? "Reply with your stop size (pts) & risk ($ or %)…"
                      : "Ask Minato about streaks, sizing, or trades…"
                  }
                  value={input}
                  onChange={(e) => {
                    setInput(e.target.value);
                    e.currentTarget.style.height = "auto";
                    e.currentTarget.style.height = `${Math.min(e.currentTarget.scrollHeight, 136)}px`;
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                      e.preventDefault();
                      void ask(input);
                    }
                  }}
                  className="max-h-[136px] min-h-[32px] flex-1 resize-none self-center bg-transparent py-[4px] text-[15px] leading-[22px] text-ink outline-none placeholder:text-faint"
                />
                <button type="submit" aria-label="Send" disabled={busy || !input.trim()} className="mn-send group">
                  <span className="transition-transform duration-300 ease-out group-enabled:group-hover:-translate-y-px">
                    <SendIcon />
                  </span>
                </button>
              </div>
            </form>
          </motion.aside>
        )}
      </AnimatePresence>
    </>
  );
}
