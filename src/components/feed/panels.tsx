"use client";

import { useState } from "react";
import { todayKey } from "@/lib/format";
import { milestoneRows } from "@/lib/feed/milestones";
import { LIMITS } from "@/lib/feed/state";
import type { FeedCollection, FeedState } from "@/lib/feed/types";
import { useFeed } from "./feed-store";
import { CheckIcon, PlusIcon } from "./feed-icons";

/* ------------------------------- collections ------------------------------- */

export function CollectionsPanel({ onOpen }: { onOpen: (c: FeedCollection) => void }) {
  const collections = useFeed((s) => s.state.collections);
  const create = useFeed((s) => s.createCollection);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [err, setErr] = useState("");

  const submit = () => {
    const r = create(name);
    if (!r.ok) { setErr(r.reason === "empty" ? "Give it a name." : r.reason === "duplicate" ? "You already have one with that name." : `Up to ${LIMITS.collections} collections.`); return; }
    setName(""); setErr(""); setAdding(false);
  };

  return (
    <div className="fd-panel" role="region" aria-label="Collections">
      <h2>Collections</h2>
      <p className="fd-help">Group charts, setups and lessons however you study — by session, by mistake, by market.</p>
      <div className="fd-tiles">
        {collections.map((c) => (
          <button key={c.id} className="fd-tile" onClick={() => onOpen(c)} aria-label={`${c.name}, ${c.items.length} items`}>
            <b>{c.name}</b><span>{c.items.length} {c.items.length === 1 ? "item" : "items"}</span>
          </button>
        ))}
        {!adding && (
          <button className="fd-tile" style={{ borderStyle: "dashed", justifyItems: "center", alignContent: "center" }} onClick={() => setAdding(true)} aria-label="New collection">
            <PlusIcon style={{ width: 22, height: 22 }} /><span>New collection</span>
          </button>
        )}
      </div>
      {adding && (
        <form onSubmit={(e) => { e.preventDefault(); submit(); }} className="fd-card-box">
          <label className="fd-label" htmlFor="fd-col-name">Name</label>
          <input id="fd-col-name" autoFocus className="fd-input" value={name} maxLength={LIMITS.nameLength} onChange={(e) => { setName(e.target.value); setErr(""); }} placeholder="e.g. A+ setups" />
          {err && <p role="alert" className="fd-help" style={{ color: "var(--st-down)" }}>{err}</p>}
          <div className="fd-row"><button type="submit" className="fd-linkbtn is-primary">Create</button><button type="button" className="fd-linkbtn" onClick={() => { setAdding(false); setErr(""); setName(""); }}>Cancel</button></div>
        </form>
      )}
      {collections.length === 0 && !adding && <p className="fd-empty">No collections yet. Tap <b>Collect</b> on any card to start one.</p>}
    </div>
  );
}

/* -------------------------------- progress -------------------------------- */

function lastDays(s: FeedState, n: number) {
  const out: { day: string; n: number }[] = [];
  const base = new Date(`${todayKey()}T12:00:00Z`).getTime();
  for (let i = n - 1; i >= 0; i--) {
    const day = new Date(base - i * 86_400_000).toISOString().slice(0, 10);
    const d = s.progress.day[day];
    out.push({ day, n: d ? d.cards + d.replays + d.lessons : 0 });
  }
  return out;
}

export function ProgressPanel({ minutes, limit }: { minutes: number; limit: number }) {
  const state = useFeed((s) => s.state);
  const today = state.progress.day[todayKey()] ?? { cards: 0, replays: 0, lessons: 0 };
  const rows = milestoneRows(state);
  const days = lastDays(state, 14);
  const max = Math.max(1, ...days.map((d) => d.n));
  const earned = rows.filter((r) => r.done).length;

  return (
    <div className="fd-panel" role="region" aria-label="Progress">
      <h2>Your progress</h2>
      <div className="fd-stats" aria-label="Today">
        <div className="fd-stat"><b className="fd-num">{today.cards}</b><span>cards today</span></div>
        <div className="fd-stat"><b className="fd-num">{today.replays}</b><span>replays</span></div>
        <div className="fd-stat"><b className="fd-num">{minutes}{limit > 0 ? <small style={{ fontSize: "0.75rem", fontWeight: 500 }}>/{limit}</small> : null}</b><span>min today</span></div>
      </div>

      <div className="fd-card-box">
        <p className="fd-label">Last 14 days</p>
        <div className="fd-days" role="img" aria-label={`Cards studied per day over the last 14 days: ${days.map((d) => d.n).join(", ")}`}>
          {days.map((d) => <i key={d.day} className={d.n === 0 ? "is-zero" : undefined} style={{ height: `${Math.max(4, (d.n / max) * 100)}%` }} title={`${d.day}: ${d.n}`} />)}
        </div>
        <p className="fd-help">{state.progress.totalCards} cards reviewed in total. Missing a day costs you nothing — nothing here resets.</p>
      </div>

      <div className="fd-card-box">
        <p className="fd-label">Milestones · {earned} of {rows.length}</p>
        {rows.map((r) => (
          <div key={r.def.id} className={`fd-ms${r.done ? " is-done" : ""}`}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
              <span><b>{r.def.title}</b><br /><span className="fd-help">{r.def.detail}</span></span>
              <span className="fd-help fd-num" style={{ flex: "none" }}>{r.done ? <CheckIcon style={{ width: 18, height: 18, color: "var(--st-gold)" }} aria-label="Earned" /> : `${r.value}/${r.def.target}`}</span>
            </div>
            <div className="fd-bar" aria-hidden><i style={{ width: `${(r.value / r.def.target) * 100}%` }} /></div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ------------------------------ desktop side ------------------------------ */

export function SidePanel({ minutes, limit, saved }: { minutes: number; limit: number; saved: number }) {
  const state = useFeed((s) => s.state);
  const today = state.progress.day[todayKey()] ?? { cards: 0, replays: 0, lessons: 0 };
  return (
    <aside className="fd-side" aria-label="Feed overview">
      <div className="fd-card-box">
        <h4>Today</h4>
        <div className="fd-stats">
          <div className="fd-stat"><b className="fd-num">{today.cards}</b><span>cards</span></div>
          <div className="fd-stat"><b className="fd-num">{today.replays}</b><span>replays</span></div>
          <div className="fd-stat"><b className="fd-num">{minutes}</b><span>{limit > 0 ? `of ${limit} min` : "min"}</span></div>
        </div>
        <p className="fd-help">{saved} saved · {state.collections.length} collection{state.collections.length === 1 ? "" : "s"}</p>
      </div>
      <div className="fd-card-box fd-key-hint">
        <h4>Keyboard</h4>
        {([["J / ↓", "Next card"], ["K / ↑", "Previous card"], ["Space", "Play / pause replay"], ["F", "Favorite"], ["C", "Add to collection"], ["M", "Music on / off"]] as const).map(([k, v]) => (
          <p key={k} className="fd-help" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}><span>{v}</span><span className="fd-key">{k}</span></p>
        ))}
      </div>
    </aside>
  );
}
