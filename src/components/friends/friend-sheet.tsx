"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, animate, motion, useDragControls, useReducedMotion } from "motion/react";
import { Spinner } from "@/components/ui/button";
import { compareMetrics, type FriendItem, type Metrics } from "./friends-state";
import type { FriendsApi } from "./use-friends";
import { Avatar, BOUNCY, INSTANT, Icon, SHEET, SMOOTH, SNAPPY, SwapLabel, Tile, paletteDeep, paletteIndex, spring, useCopy } from "./primitives";

/* ================================================================== */
/*  Small hooks                                                        */
/* ================================================================== */

function useMediaQuery(query: string): boolean {
  const [match, setMatch] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const on = () => setMatch(mq.matches);
    on();
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, [query]);
  return match;
}

/** Counts up to `target` on open, and glides when a live refresh changes it. */
function useCountUp(target: number | null, decimals = 0): number | null {
  const reduce = useReducedMotion();
  const from = useRef(0);
  const first = useRef(true);
  const [value, setValue] = useState<number | null>(null);
  useEffect(() => {
    if (target == null) {
      setValue(null);
      return;
    }
    if (reduce) {
      from.current = target;
      setValue(target);
      return;
    }
    const c = animate(from.current, target, {
      duration: 0.95,
      delay: first.current ? 0.22 : 0,
      ease: [0.16, 1, 0.3, 1],
      onUpdate: (v) => {
        from.current = v;
        const p = 10 ** decimals;
        setValue(Math.round(v * p) / p);
      },
    });
    first.current = false;
    return () => c.stop();
  }, [target, reduce, decimals]);
  return value;
}

/* ================================================================== */
/*  Head to head data                                                  */
/* ================================================================== */

interface VersusData {
  me: Metrics;
  them: Metrics;
}
type VersusState = { status: "loading" } | { status: "ready"; data: VersusData } | { status: "error"; code: string };

const versusCache = new Map<string, { at: number; data: VersusData }>();
const FRESH_MS = 30_000;

/** Stale-while-revalidate: reopening a card shows the last comparison at once, then quietly updates it. */
function useVersus(handle: string, active: boolean) {
  const [state, setState] = useState<VersusState>(() => {
    const c = versusCache.get(handle);
    return c ? { status: "ready", data: c.data } : { status: "loading" };
  });
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    if (!active) return;
    const cached = versusCache.get(handle);
    if (cached && nonce === 0) {
      setState({ status: "ready", data: cached.data });
      if (Date.now() - cached.at < FRESH_MS) return;
    } else {
      setState((s) => (s.status === "ready" ? s : { status: "loading" }));
    }
    const ctl = new AbortController();
    (async () => {
      try {
        const res = await fetch(`/api/friends/competition?handle=${encodeURIComponent(handle)}`, { cache: "no-store", signal: ctl.signal });
        const d = (await res.json().catch(() => ({}))) as { me?: Metrics; them?: Metrics; error?: string };
        if (!res.ok || !d.me || !d.them) {
          throw new Error(typeof d.error === "string" ? d.error : res.status === 401 ? "not_logged_in" : "unknown");
        }
        const data = { me: d.me, them: d.them };
        versusCache.set(handle, { at: Date.now(), data });
        setState({ status: "ready", data });
      } catch (e) {
        if (ctl.signal.aborted) return;
        const code = e instanceof TypeError ? "network" : e instanceof Error ? e.message : "unknown";
        setState((s) => (s.status === "ready" ? s : { status: "error", code })); // keep showing what we have
      }
    })();
    return () => ctl.abort();
  }, [handle, active, nonce]);

  return { state, retry: () => setNonce((n) => n + 1) };
}

function versusError(code: string): { title: string; body: string; retry: boolean } {
  switch (code) {
    case "not_friends":
      return { title: "You're no longer connected", body: "Head to head is only available between friends.", retry: false };
    case "no_metrics":
      return { title: "Comparison isn't ready yet", body: "It appears once both of you have journal data synced.", retry: true };
    case "not_logged_in":
      return { title: "Session expired", body: "Sign in again to compare.", retry: false };
    case "network":
      return { title: "You're offline", body: "Check your connection and try again.", retry: true };
    default:
      return { title: "Couldn't load the comparison", body: "Try again in a moment.", retry: true };
  }
}

/* ================================================================== */
/*  Score ring                                                         */
/* ================================================================== */

const R = 46;
const C = 2 * Math.PI * R;

function ScoreRing({ score, empty, children }: { score: number | null; empty: boolean; children: React.ReactNode }) {
  const reduce = useReducedMotion();
  const pct = score == null ? 0 : Math.max(0, Math.min(100, score)) / 100;
  const SIZE = 132;
  return (
    <div
      style={{ position: "relative", width: SIZE, height: SIZE, margin: "0 auto" }}
      role="img"
      aria-label={score == null ? "Process score is syncing" : empty ? "No process score yet" : `Process score ${score} out of 100`}
    >
      <svg viewBox="0 0 100 100" width={SIZE} height={SIZE} style={{ position: "absolute", inset: 0, transform: "rotate(-90deg)" }} aria-hidden="true">
        <circle cx="50" cy="50" r={R} fill="none" stroke="var(--fr-fill-strong)" strokeWidth="6" />
        {score == null ? (
          <circle className="fr-ring-spin" cx="50" cy="50" r={R} fill="none" stroke="var(--gold-strong)" strokeOpacity="0.7" strokeWidth="6" strokeLinecap="round" strokeDasharray={`${C * 0.22} ${C}`} />
        ) : (
          <motion.circle
            cx="50"
            cy="50"
            r={R}
            fill="none"
            stroke="var(--gold-strong)"
            strokeWidth="6"
            strokeLinecap="round"
            strokeDasharray={C}
            initial={{ strokeDashoffset: reduce ? C * (1 - pct) : C }}
            animate={{ strokeDashoffset: C * (1 - pct) }}
            transition={reduce ? INSTANT : { ...spring(1.0, 0.82), delay: 0.24 }}
          />
        )}
      </svg>
      <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center" }}>{children}</div>
    </div>
  );
}

/* ================================================================== */
/*  Pieces                                                             */
/* ================================================================== */

function ActionTile({
  icon,
  label,
  onClick,
  tone,
  disabled,
  hint,
}: {
  icon: React.ReactNode;
  label: React.ReactNode;
  onClick: () => void;
  tone?: "danger";
  disabled?: boolean;
  hint?: string;
}) {
  return (
    <motion.button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={disabled ? hint : undefined}
      whileTap={disabled ? undefined : { scale: 0.94 }}
      transition={SNAPPY}
      className="fr-squircle"
      style={{
        display: "grid",
        justifyItems: "center",
        gap: 6,
        padding: "13px 6px 11px",
        borderRadius: 14,
        border: 0,
        background: "var(--fr-fill)",
        color: tone === "danger" ? "var(--loss)" : "var(--fr-tint-text)",
        opacity: disabled ? 0.45 : 1,
        cursor: disabled ? "default" : "pointer",
      }}
    >
      {icon}
      <span className="fr-caption" style={{ color: tone === "danger" ? "var(--loss)" : "var(--ink)" }}>
        {label}
      </span>
    </motion.button>
  );
}

function StatTile({
  icon,
  color,
  fg,
  label,
  value,
  caption,
  tone,
}: {
  icon: React.ReactNode;
  color: string;
  fg?: string;
  label: string;
  value: string | null;
  caption: string;
  tone?: string;
}) {
  return (
    <div className="fr-squircle" style={{ background: "var(--fr-group)", borderRadius: 14, padding: "12px 14px 13px", boxShadow: "0 0 0 1px var(--fr-hairline)" }}>
      <div className="flex items-center gap-2">
        <Tile color={color} fg={fg} size={24}>
          {icon}
        </Tile>
        <span className="fr-footnote" style={{ color: "var(--muted)" }}>
          {label}
        </span>
      </div>
      <p className="fr-num" style={{ marginTop: 10, fontSize: 26, lineHeight: "30px", fontWeight: 700, letterSpacing: "-0.022em", color: tone ?? "var(--ink)", minHeight: 30 }}>
        {value ?? <span className="fr-skel" style={{ display: "inline-block", width: 64, height: 24, verticalAlign: "middle" }} aria-label="Syncing" />}
      </p>
      <p className="fr-caption" style={{ color: "var(--faint)", marginTop: 1 }}>
        {caption}
      </p>
    </div>
  );
}

/* ================================================================== */
/*  Screens                                                            */
/* ================================================================== */

function Overview({ friend, onCompare, onRemove }: { friend: FriendItem; onCompare: () => void; onRemove: () => void }) {
  const m = friend.metrics;
  const { copied, copy } = useCopy();
  const nameId = useId();
  const noData = !!m && m.trades === 0 && m.processScore === 0;

  const ep = useCountUp(m ? m.edgePoints : null);
  const win = useCountUp(m && m.winRate != null ? m.winRate : null);
  const days = useCountUp(m ? m.trades : null);
  const ret = useCountUp(m ? m.returnPct : null, 1);
  const score = useCountUp(m ? m.processScore : null);

  const retTone = !m ? undefined : m.returnPct > 0 ? "var(--profit)" : m.returnPct < 0 ? "var(--loss)" : undefined;

  return (
    <div>
      {/* Hero */}
      <div style={{ padding: "8px 24px 0", textAlign: "center" }}>
        <ScoreRing score={m ? m.processScore : null} empty={noData}>
          <Avatar name={friend.displayName} seed={friend.handle} size={100} layoutId={`fr-avatar-${friend.key}`} />
        </ScoreRing>

        {/* Process score, overlapping the ring like a level badge */}
        <div style={{ position: "relative", height: 0 }}>
          <span
            className="fr-num"
            style={{
              position: "absolute",
              left: "50%",
              top: -20,
              transform: "translateX(-50%)",
              display: "inline-flex",
              alignItems: "baseline",
              gap: 6,
              padding: "4px 12px",
              borderRadius: 999,
              background: "var(--fr-group)",
              boxShadow: "0 0 0 1px var(--fr-hairline), 0 2px 8px rgb(0 0 0 / 0.12)",
              whiteSpace: "nowrap",
            }}
          >
            <span className="fr-caption" style={{ color: "var(--muted)" }}>
              Process
            </span>
            {m ? (
              noData ? (
                <span className="fr-headline" style={{ color: "var(--faint)" }}>—</span>
              ) : (
                <span className="fr-headline" style={{ color: "var(--ink)" }}>{score ?? 0}</span>
              )
            ) : (
              <span className="fr-skel" style={{ display: "inline-block", width: 22, height: 14, alignSelf: "center" }} />
            )}
          </span>
        </div>

        <h2 id={nameId} className="fr-title2" style={{ marginTop: 32, color: "var(--ink)", overflowWrap: "anywhere" }}>
          {friend.displayName}
        </h2>
        <p className="fr-subhead fr-num" style={{ color: "var(--muted)", marginTop: 1 }}>
          @{friend.handle}
        </p>
        <p className="fr-caption" style={{ marginTop: 9, display: "inline-flex", alignItems: "center", gap: 6, color: friend.syncing ? "var(--muted)" : "var(--profit)" }}>
          {friend.syncing ? (
            <>
              <Spinner className="h-3 w-3" /> Syncing stats
            </>
          ) : (
            <>
              <span style={{ width: 7, height: 7, borderRadius: 4, background: "var(--profit)", boxShadow: "0 0 0 3px color-mix(in srgb, var(--profit) 20%, transparent)" }} />
              Friends
            </>
          )}
        </p>
      </div>

      {/* Actions */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10, padding: "20px 20px 0" }}>
        <ActionTile icon={<Icon.Bars className="h-[22px] w-[22px]" />} label="Compare" onClick={onCompare} disabled={!m} hint="Available once their stats sync" />
        <ActionTile
          icon={copied ? <Icon.Check className="h-[22px] w-[22px]" /> : <Icon.Copy className="h-[22px] w-[22px]" />}
          label={<SwapLabel id={copied ? "c" : "n"}>{copied ? "Copied" : "Copy ID"}</SwapLabel>}
          onClick={() => void copy(`@${friend.handle}`)}
        />
        <ActionTile icon={<Icon.PersonMinus className="h-[22px] w-[22px]" />} label="Remove" tone="danger" onClick={onRemove} disabled={friend.syncing} hint="Available once their stats sync" />
      </div>

      {/* Stats */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, padding: "14px 20px 0" }}>
        <StatTile icon={<Icon.Bolt className="h-[15px] w-[15px]" />} color="var(--gold-strong)" fg="var(--on-gold)" label="Edge Points" value={ep == null ? null : ep.toLocaleString()} caption="Virtual points" />
        <StatTile
          icon={<Icon.Target className="h-[15px] w-[15px]" />}
          color="var(--profit)"
          label="Win rate"
          value={m ? (m.winRate == null ? "—" : win == null ? null : `${Math.round(win)}%`) : null}
          caption="of trading days"
        />
        <StatTile icon={<Icon.Calendar className="h-[15px] w-[15px]" />} color="var(--info)" label="Trading days" value={days == null ? null : String(Math.round(days))} caption="Logged so far" />
        <StatTile
          icon={<Icon.TrendUp className="h-[15px] w-[15px]" />}
          color="var(--muted)"
          label="Return"
          value={ret == null ? null : `${ret > 0 ? "+" : ""}${ret.toFixed(1)}%`}
          caption="On starting balance"
          tone={retTone}
        />
      </div>

      <p className="fr-footnote" style={{ color: "var(--faint)", padding: "14px 28px 18px", textAlign: "center" }}>
        Friends see only competition-safe totals — never journals, notes or screenshots.
      </p>
    </div>
  );
}

function fmt(v: number | null, unit: "" | "%", signed = false): string {
  if (v == null) return "—";
  const n = unit === "%" ? Math.round(v * 10) / 10 : Math.round(v);
  const s = Math.abs(n).toLocaleString(undefined, { maximumFractionDigits: 1 });
  return `${n < 0 ? "−" : signed && n > 0 ? "+" : ""}${s}${unit}`;
}

/** One bar split between two people: each side's share of the pair. Shifts negatives so returns compare sensibly. */
function Split({ you, them, youColor, themColor, delay }: { you: number | null; them: number | null; youColor: string; themColor: string; delay: number }) {
  const reduce = useReducedMotion();
  const base = Math.min(you ?? 0, them ?? 0, 0);
  const a = (you ?? 0) - base;
  const b = (them ?? 0) - base;
  const share = a + b === 0 ? 50 : (a / (a + b)) * 100;
  const left = Math.min(90, Math.max(10, share)); // both sides always stay visible
  const t = reduce ? INSTANT : { ...spring(0.7, 0.86), delay };
  return (
    <div style={{ display: "flex", gap: 3, height: 8 }} aria-hidden="true">
      <motion.div initial={{ flexGrow: reduce ? left : 50 }} animate={{ flexGrow: left }} transition={t} style={{ flexBasis: 0, borderRadius: "4px 2px 2px 4px", background: youColor }} />
      <motion.div initial={{ flexGrow: reduce ? 100 - left : 50 }} animate={{ flexGrow: 100 - left }} transition={t} style={{ flexBasis: 0, borderRadius: "2px 4px 4px 2px", background: themColor }} />
    </div>
  );
}

function Name({ children, align }: { children: React.ReactNode; align: "center" }) {
  return (
    <span className="fr-footnote" style={{ display: "block", maxWidth: "100%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "var(--muted)", textAlign: align }}>
      {children}
    </span>
  );
}

function NotEnoughData({ meEmpty, themEmpty, name }: { meEmpty: boolean; themEmpty: boolean; name: string }) {
  const body =
    meEmpty && themEmpty
      ? "Neither of you has logged a trading day yet. Head to head unlocks once you both have."
      : themEmpty
        ? `${name} hasn't logged a trading day yet. Head to head unlocks as soon as they do.`
        : "Log a trading day in your journal and Head to head unlocks.";
  return (
    <div style={{ padding: "30px 28px 38px", textAlign: "center" }}>
      <span className="fr-squircle" style={{ display: "inline-grid", placeItems: "center", width: 64, height: 64, borderRadius: 21, background: "color-mix(in srgb, var(--gold) 14%, transparent)", color: "var(--gold)" }}>
        <Icon.Bars className="h-8 w-8" />
      </span>
      <h3 className="fr-title2" style={{ marginTop: 16, color: "var(--ink)" }}>Not enough data yet</h3>
      <p className="fr-subhead" style={{ margin: "6px auto 0", maxWidth: 300, color: "var(--muted)" }}>{body}</p>
    </div>
  );
}

function Versus({ friend, api, active }: { friend: FriendItem; api: FriendsApi; active: boolean }) {
  void api;
  const { state, retry } = useVersus(friend.handle, active);

  if (state.status === "loading") {
    return (
      <div style={{ padding: "6px 20px 24px", display: "grid", gap: 14 }} aria-busy="true" aria-label="Loading comparison">
        <div className="fr-skel fr-squircle" style={{ height: 118, borderRadius: 16 }} />
        <div className="fr-squircle" style={{ background: "var(--fr-group)", borderRadius: 16, padding: 16, display: "grid", gap: 20, boxShadow: "0 0 0 1px var(--fr-hairline)" }}>
          {[0, 1, 2, 3].map((i) => (
            <div key={i} style={{ display: "grid", gap: 9, justifyItems: "center" }}>
              <span className="fr-skel" style={{ height: 10, width: 80, animationDelay: `${i * 90}ms` }} />
              <span className="fr-skel" style={{ height: 8, width: "100%", animationDelay: `${i * 90 + 40}ms` }} />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (state.status === "error") {
    const e = versusError(state.code);
    return (
      <div style={{ padding: "26px 28px 34px", textAlign: "center" }} role="alert">
        <span className="fr-squircle" style={{ display: "inline-grid", placeItems: "center", width: 60, height: 60, borderRadius: 20, background: "color-mix(in srgb, var(--loss) 12%, transparent)", color: "var(--loss)" }}>
          <Icon.Warning className="h-7 w-7" />
        </span>
        <h3 className="fr-headline" style={{ marginTop: 14, color: "var(--ink)" }}>{e.title}</h3>
        <p className="fr-subhead" style={{ marginTop: 4, color: "var(--muted)" }}>{e.body}</p>
        {e.retry && (
          <button type="button" className="fr-capsule" style={{ marginTop: 16 }} onClick={retry}>
            <Icon.Refresh className="h-4 w-4" /> Try again
          </button>
        )}
      </div>
    );
  }

  const { me, them } = state.data;
  const meEmpty = me.trades === 0;
  const themEmpty = them.trades === 0;
  // Two people can only be compared when both have actually traded.
  if (meEmpty || themEmpty) return <NotEnoughData meEmpty={meEmpty} themEmpty={themEmpty} name={friend.displayName} />;

  const v = compareMetrics(me, them);
  const youPalette = paletteIndex(me.handle);
  const themPalette = paletteIndex(friend.handle, youPalette);
  const youColor = paletteDeep(youPalette);
  const themColor = paletteDeep(themPalette);

  const scored = v.rows.filter((r) => r.lead);
  const biggest = scored
    .filter((r) => r.lead !== "tie" && r.you != null && r.them != null)
    .map((r) => ({ r, gap: Math.abs((r.you as number) - (r.them as number)) / Math.max(Math.abs(r.you as number), Math.abs(r.them as number), 1) }))
    .sort((x, y) => y.gap - x.gap)[0]?.r;

  const headline =
    v.yourLeads === v.theirLeads ? "All square" : v.yourLeads > v.theirLeads ? `You lead in ${v.yourLeads} of ${v.scored}` : `${friend.displayName} leads in ${v.theirLeads} of ${v.scored}`;
  const detail = biggest ? `Biggest gap: ${biggest.label.toLowerCase()} — ${fmt(biggest.you, biggest.unit, biggest.key === "return")} vs ${fmt(biggest.them, biggest.unit, biggest.key === "return")}` : "Dead even on every measure";

  return (
    <div style={{ padding: "6px 20px 24px", display: "grid", gap: 14 }}>
      {/* Scoreboard */}
      <div className="fr-squircle" style={{ background: "var(--fr-group)", borderRadius: 16, padding: "16px 14px 14px", boxShadow: "0 0 0 1px var(--fr-hairline)", textAlign: "center" }}>
        <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) auto minmax(0,1fr)", alignItems: "center", gap: 8 }}>
          <div style={{ display: "grid", justifyItems: "center", gap: 6, minWidth: 0 }}>
            <Avatar name={me.displayName} seed={me.handle} palette={youPalette} size={44} />
            <Name align="center">You</Name>
          </div>
          <div className="fr-num" style={{ display: "flex", alignItems: "baseline", gap: 8, fontSize: 36, lineHeight: "40px", fontWeight: 700, letterSpacing: "-0.03em" }}>
            <motion.span initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ ...BOUNCY, delay: 0.05 }} style={{ color: v.yourLeads >= v.theirLeads ? "var(--ink)" : "var(--faint)" }}>{v.yourLeads}</motion.span>
            <span style={{ fontSize: 20, color: "var(--faint)", fontWeight: 500 }}>–</span>
            <motion.span initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ ...BOUNCY, delay: 0.12 }} style={{ color: v.theirLeads >= v.yourLeads ? "var(--ink)" : "var(--faint)" }}>{v.theirLeads}</motion.span>
          </div>
          <div style={{ display: "grid", justifyItems: "center", gap: 6, minWidth: 0 }}>
            <Avatar name={friend.displayName} seed={friend.handle} palette={themPalette} size={44} />
            <Name align="center">{friend.displayName}</Name>
          </div>
        </div>
        <p className="fr-subhead" style={{ marginTop: 12, color: "var(--ink)", fontWeight: 600 }}>{headline}</p>
        <p className="fr-footnote" style={{ marginTop: 2, color: "var(--muted)" }}>{detail}</p>
      </div>

      {/* Categories: your value · one split bar · their value */}
      <div className="fr-squircle" style={{ background: "var(--fr-group)", borderRadius: 16, boxShadow: "0 0 0 1px var(--fr-hairline)", overflow: "hidden" }}>
        {v.rows.map((r, i) => {
          const signed = r.key === "return";
          const tone = (n: number | null, leads: boolean) =>
            !leads ? "var(--muted)" : signed && n != null ? (n > 0 ? "var(--profit)" : n < 0 ? "var(--loss)" : "var(--ink)") : "var(--ink)";
          const youLeads = r.lead === "you";
          const themLeads = r.lead === "them";
          const info = r.lead === null;
          return (
            <div
              key={r.key}
              role="group"
              aria-label={`${r.label}: you ${fmt(r.you, r.unit, signed)}, ${friend.displayName} ${fmt(r.them, r.unit, signed)}`}
              style={{ position: "relative", padding: info ? "11px 16px 12px" : "12px 16px 14px" }}
            >
              {i > 0 && <span style={{ position: "absolute", top: 0, left: 16, right: 0, height: 1, background: "var(--fr-sep)" }} />}
              <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) auto minmax(0,1fr)", alignItems: "baseline", gap: 10, marginBottom: info ? 0 : 8 }}>
                <span className="fr-num" style={{ fontSize: 15, fontWeight: youLeads ? 700 : 500, color: tone(r.you, youLeads || info) }}>{fmt(r.you, r.unit, signed)}</span>
                <span className="fr-footnote" style={{ color: "var(--muted)", textAlign: "center" }}>{r.label}</span>
                <span className="fr-num" style={{ fontSize: 15, fontWeight: themLeads ? 700 : 500, textAlign: "right", color: tone(r.them, themLeads || info) }}>{fmt(r.them, r.unit, signed)}</span>
              </div>
              {!info && <Split you={r.you} them={r.them} youColor={youColor} themColor={themColor} delay={0.1 + i * 0.05} />}
            </div>
          );
        })}
      </div>
      <p className="fr-footnote" style={{ color: "var(--faint)", textAlign: "center", padding: "0 10px" }}>
        The lead is decided by process, Edge Points, win rate and return. Trading days are shown for context only.
      </p>
    </div>
  );
}

/* ================================================================== */
/*  Remove confirmation — an iOS-style action sheet                    */
/* ================================================================== */

function ConfirmRemove({ name, onConfirm, onCancel }: { name: string; onConfirm: () => void; onCancel: () => void }) {
  const reduce = useReducedMotion();
  const cancelRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  useEffect(() => {
    const t = window.setTimeout(() => cancelRef.current?.focus({ preventScroll: true }), 60);
    return () => window.clearTimeout(t);
  }, []);
  const btn: React.CSSProperties = { width: "100%", height: 54, border: 0, background: "transparent", fontSize: 17, cursor: "pointer", letterSpacing: "-0.014em" };
  return (
    <motion.div
      style={{ position: "absolute", inset: 0, zIndex: 5, display: "flex", alignItems: "flex-end", padding: 10 }}
      initial="out"
      animate="in"
      exit="out"
    >
      <motion.button
        type="button"
        aria-label="Cancel"
        tabIndex={-1}
        variants={{ out: { opacity: 0 }, in: { opacity: 1 } }}
        onClick={onCancel}
        style={{ position: "absolute", inset: 0, border: 0, background: "rgb(0 0 0 / 0.32)", cursor: "default" }}
      />
      <motion.div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        variants={{ out: { y: reduce ? 0 : "115%", opacity: reduce ? 0 : 1 }, in: { y: 0, opacity: 1 } }}
        transition={reduce ? INSTANT : SHEET}
        style={{ position: "relative", width: "100%", display: "grid", gap: 8 }}
      >
        <div className="fr-squircle" style={{ background: "var(--overlay)", borderRadius: 16, overflow: "hidden", boxShadow: "0 0 0 1px var(--fr-hairline), 0 18px 40px -16px rgb(0 0 0 / 0.5)" }}>
          <div style={{ padding: "16px 20px 14px", textAlign: "center", borderBottom: "1px solid var(--fr-sep)" }}>
            <p id={titleId} className="fr-footnote" style={{ color: "var(--muted)", fontWeight: 600 }}>
              Remove {name}?
            </p>
            <p className="fr-footnote" style={{ color: "var(--muted)", marginTop: 3 }}>
              You'll stop seeing each other's stats. You can send a new request later.
            </p>
          </div>
          <button type="button" onClick={onConfirm} style={{ ...btn, color: "var(--loss)", fontWeight: 600 }}>
            Remove Friend
          </button>
        </div>
        <button ref={cancelRef} type="button" onClick={onCancel} className="fr-squircle" style={{ ...btn, background: "var(--overlay)", borderRadius: 16, color: "var(--fr-tint-text)", fontWeight: 700, boxShadow: "0 0 0 1px var(--fr-hairline)" }}>
          Cancel
        </button>
      </motion.div>
    </motion.div>
  );
}

/* ================================================================== */
/*  The sheet                                                          */
/* ================================================================== */

export function FriendSheet({ friend, api, onClose }: { friend: FriendItem | null; api: FriendsApi; onClose: () => void }) {
  if (typeof document === "undefined") return null;
  return createPortal(
    <AnimatePresence>{friend && <SheetBody key="sheet" friend={friend} api={api} onClose={onClose} />}</AnimatePresence>,
    document.body,
  );
}

type Screen = "overview" | "versus";

const screenVariants = {
  enter: (d: number) => ({ x: d > 0 ? "26%" : "-26%", opacity: 0 }),
  center: { x: 0, opacity: 1 },
  exit: (d: number) => ({ x: d > 0 ? "-26%" : "26%", opacity: 0 }),
};

function SheetBody({ friend, api, onClose }: { friend: FriendItem; api: FriendsApi; onClose: () => void }) {
  const reduce = useReducedMotion();
  const isMobile = useMediaQuery("(max-width: 639px)");
  const panelRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  const drag = useDragControls();
  const [screen, setScreen] = useState<Screen>("overview");
  const [dir, setDir] = useState(1);
  const [confirming, setConfirming] = useState(false);
  const [height, setHeight] = useState<number | "auto">("auto");
  const confirmingRef = useRef(false);
  confirmingRef.current = confirming;
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  const go = (s: Screen) => {
    setDir(s === "versus" ? 1 : -1);
    setScreen(s);
  };

  // Scroll lock, focus in / out, Escape, and a Tab trap — same contract as the app's Modal.
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const t = window.setTimeout(() => panelRef.current?.focus({ preventScroll: true }), 40);

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        if (confirmingRef.current) setConfirming(false);
        else closeRef.current();
        return;
      }
      if (e.key !== "Tab" || !panelRef.current) return;
      const scope = confirmingRef.current ? panelRef.current.querySelector<HTMLElement>('[role="alertdialog"]') : panelRef.current;
      const items = Array.from((scope ?? panelRef.current).querySelectorAll<HTMLElement>('button:not([disabled]):not([tabindex="-1"]), a[href]'));
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;
      if (e.shiftKey && (active === first || active === panelRef.current)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.clearTimeout(t);
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
      opener?.focus?.({ preventScroll: true });
    };
  }, []);

  // Animate the sheet's height as screens change (Overview is taller than Head to head and vice-versa).
  useLayoutEffect(() => {
    const el = innerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setHeight(Math.ceil(el.getBoundingClientRect().height)));
    ro.observe(el);
    return () => ro.disconnect();
  }, [screen]);

  const titleId = useId();
  const openInitial = isMobile ? { y: "100%" } : { opacity: 0, y: 28 };
  const openExit = isMobile ? { y: "100%" } : { opacity: 0, y: 16, transition: { duration: 0.18 } };

  return (
    <div className="fr-root" style={{ position: "fixed", inset: 0, zIndex: 70, display: "flex", alignItems: isMobile ? "flex-end" : "center", justifyContent: "center", padding: isMobile ? 0 : 24 }}>
      <motion.button
        type="button"
        aria-label="Close"
        tabIndex={-1}
        onClick={onClose}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.25 }}
        style={{ position: "absolute", inset: 0, border: 0, cursor: "default", background: "rgb(8 6 3 / 0.42)", backdropFilter: "blur(6px)", WebkitBackdropFilter: "blur(6px)" }}
      />

      <motion.div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={screen === "overview" ? undefined : titleId}
        aria-label={screen === "overview" ? `${friend.displayName}'s profile` : undefined}
        tabIndex={-1}
        className="fr-material fr-sheet fr-squircle"
        initial={reduce ? { opacity: 0 } : openInitial}
        animate={{ opacity: 1, y: 0 }}
        exit={reduce ? { opacity: 0 } : openExit}
        transition={reduce ? INSTANT : SHEET}
        drag={isMobile && !reduce ? "y" : false}
        dragControls={drag}
        dragListener={false}
        dragConstraints={{ top: 0, bottom: 0 }}
        dragElastic={{ top: 0.04, bottom: 0.75 }}
        onDragEnd={(_, info) => {
          if (info.offset.y > 110 || info.velocity.y > 650) onClose();
        }}
        style={{
          position: "relative",
          width: "100%",
          maxWidth: isMobile ? undefined : 408,
          maxHeight: isMobile ? "92dvh" : "min(92dvh, 780px)",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          outline: "none",
          paddingBottom: isMobile ? "env(safe-area-inset-bottom)" : 0,
        }}
      >
        {/* Top bar: grabber, back, title, close. Dragging it moves the sheet on phones. */}
        <div
          onPointerDown={(e) => isMobile && drag.start(e)}
          style={{ position: "relative", flex: "none", display: "grid", gridTemplateColumns: "1fr auto 1fr", alignItems: "center", height: 56, padding: "8px 14px 0", touchAction: isMobile ? "none" : undefined }}
        >
          {isMobile && <span aria-hidden="true" style={{ position: "absolute", top: 6, left: "50%", width: 38, height: 5, borderRadius: 3, background: "var(--fr-fill-strong)", transform: "translateX(-50%)" }} />}
          <div style={{ justifySelf: "start", gridColumn: 1, gridRow: 1 }}>
            <AnimatePresence initial={false}>
              {screen === "versus" && (
                <motion.button
                  key="back"
                  type="button"
                  onClick={() => go("overview")}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -10 }}
                  transition={reduce ? INSTANT : SNAPPY}
                  className="fr-body"
                  style={{ display: "inline-flex", alignItems: "center", gap: 2, border: 0, background: "transparent", color: "var(--fr-tint-text)", cursor: "pointer", padding: "4px 6px 4px 0", fontWeight: 500 }}
                >
                  <Icon.ChevronLeft className="h-[18px] w-[18px]" />
                  Back
                </motion.button>
              )}
            </AnimatePresence>
          </div>
          <AnimatePresence initial={false} mode="wait">
            {screen === "versus" && (
              <motion.h2 key="t" id={titleId} className="fr-headline" initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }} style={{ color: "var(--ink)" }}>
                Head to head
              </motion.h2>
            )}
          </AnimatePresence>
          <button type="button" onClick={onClose} aria-label="Close" className="fr-glyph-btn" style={{ justifySelf: "end", gridColumn: 3, gridRow: 1 }}>
            <Icon.Xmark className="h-4 w-4" />
          </button>
        </div>

        {/* Screens */}
        <div style={{ flex: "1 1 auto", minHeight: 0, overflowY: "auto", overscrollBehavior: "contain" }}>
          <motion.div initial={false} animate={{ height }} transition={reduce ? INSTANT : SMOOTH} style={{ position: "relative", overflow: "hidden" }}>
            <AnimatePresence mode="popLayout" custom={dir} initial={false}>
              <motion.div
                key={screen}
                ref={innerRef}
                custom={dir}
                variants={screenVariants}
                initial="enter"
                animate="center"
                exit="exit"
                transition={reduce ? INSTANT : SHEET}
              >
                {screen === "overview" ? (
                  <Overview friend={friend} onCompare={() => go("versus")} onRemove={() => setConfirming(true)} />
                ) : (
                  <Versus friend={friend} api={api} active />
                )}
              </motion.div>
            </AnimatePresence>
          </motion.div>
        </div>

        <AnimatePresence>
          {confirming && (
            <ConfirmRemove
              name={friend.displayName}
              onCancel={() => setConfirming(false)}
              onConfirm={() => {
                setConfirming(false);
                onClose();
                void api.remove(friend);
              }}
            />
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  );
}
