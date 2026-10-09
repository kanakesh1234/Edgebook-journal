"use client";

import Link from "next/link";
import { useEffect, useId, useMemo, useRef, useState, type RefObject } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Spinner } from "@/components/ui/button";
import { HANDLE_RE, cleanName, normalizeHandle, relationFor } from "./friends-state";
import type { FriendsApi } from "./use-friends";
import { Avatar, BOUNCY, Group, Icon, INSTANT, SMOOTH, SNAPPY, Section, SwapLabel, Tile, useCopy } from "./primitives";

interface Person {
  handle: string;
  displayName: string;
}

/** Network result for one specific handle. Kept apart from what's typed so a slow reply can't land on the wrong text. */
type Lookup = { handle: string; status: "searching" | "found" | "missing" | "limited" | "error"; person?: Person };

type Input =
  | { kind: "empty" }
  | { kind: "hint"; text: string }
  | { kind: "self" }
  | { kind: "search"; handle: string };

/** Everything we can tell from the text alone, without the network. */
function classify(query: string, mine: string | null): Input {
  const h = normalizeHandle(query);
  if (!h) return { kind: "empty" };
  if (!/^[a-z0-9_]+$/.test(h)) return { kind: "hint", text: "Connection IDs use letters, numbers and underscores." };
  if (h.length < 3) return { kind: "hint", text: "Connection IDs have at least 3 characters." };
  if (h.length > 24) return { kind: "hint", text: "Connection IDs have at most 24 characters." };
  if (mine && h === mine.toLowerCase()) return { kind: "self" };
  return HANDLE_RE.test(h) ? { kind: "search", handle: h } : { kind: "empty" };
}

const DEBOUNCE_MS = 420;

export function AddFriend({ api, inputRef }: { api: FriendsApi; inputRef: RefObject<HTMLInputElement | null> }) {
  const { view, me } = api;
  const reduce = useReducedMotion();
  const inputId = useId();
  const [query, setQuery] = useState("");
  const [lookup, setLookup] = useState<Lookup | null>(null);

  const input = useMemo(() => classify(query, me.handle), [query, me.handle]);
  const viewRef = useRef(view);
  viewRef.current = view;

  const token = useRef(0);
  const launched = useRef("");

  const search = async (handle: string) => {
    const mine = ++token.current;
    launched.current = handle;

    // Already connected / requested? We know that without asking the server.
    const known = relationFor(viewRef.current, handle);
    if (known.relation !== "none") {
      setLookup({ handle, status: "found", person: { handle, displayName: known.displayName ?? handle } });
      return;
    }

    setLookup({ handle, status: "searching" });
    try {
      const res = await fetch(`/api/friends?search=${encodeURIComponent(handle)}`, { cache: "no-store" });
      if (mine !== token.current) return; // a newer search owns the screen
      if (res.status === 429) return setLookup({ handle, status: "limited" });
      if (!res.ok) return setLookup({ handle, status: "error" });
      const d = (await res.json()) as { results?: Person[] };
      const first = d.results?.[0];
      setLookup(
        first
          ? { handle, status: "found", person: { handle: first.handle, displayName: cleanName(first.displayName, first.handle) } }
          : { handle, status: "missing" },
      );
    } catch {
      if (mine === token.current) setLookup({ handle, status: "error" });
    }
  };

  // Debounced live search as you type.
  const searchHandle = input.kind === "search" ? input.handle : null;
  useEffect(() => {
    token.current += 1; // anything in flight is now stale
    if (!searchHandle) return;
    const t = window.setTimeout(() => {
      if (launched.current !== searchHandle) void search(searchHandle);
    }, DEBOUNCE_MS);
    return () => window.clearTimeout(t);
    // `search` only reads refs and setState.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchHandle]);

  const current = input.kind === "search" && lookup?.handle === input.handle ? lookup : null;
  const pending = input.kind === "search" && (!current || current.status === "searching");

  const clear = () => {
    setQuery("");
    setLookup(null);
    launched.current = "";
    inputRef.current?.focus();
  };

  // After a request goes out, let the confirmation land, then reset the field for the next ID.
  const resetTimer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(resetTimer.current), []);
  const add = async (person: Person) => {
    const r = await api.send(person);
    if (r.ok) {
      window.clearTimeout(resetTimer.current);
      resetTimer.current = window.setTimeout(() => {
        setQuery((q) => (normalizeHandle(q) === person.handle.toLowerCase() ? "" : q));
        launched.current = "";
        inputRef.current?.focus();
      }, 1100);
    }
  };

  /* ---------- What goes under the field ---------- */
  let slot: { key: string; node: React.ReactNode } | null = null;
  if (input.kind === "hint") {
    slot = { key: "hint", node: <Note text={input.text} /> };
  } else if (input.kind === "self") {
    slot = { key: "self", node: <Note icon={<Icon.At className="h-4 w-4" />} text="That's your own Connection ID. Share it with a friend instead." /> };
  } else if (current?.status === "found" && current.person) {
    slot = { key: `found-${current.person.handle}`, node: <ResultRow person={current.person} api={api} onAdd={add} /> };
  } else if (current?.status === "missing") {
    slot = { key: "missing", node: <Note tone="error" icon={<Icon.Search className="h-4 w-4" />} text="No trader found with that ID. Check the spelling and try again." /> };
  } else if (current?.status === "limited") {
    slot = { key: "limited", node: <Note tone="error" icon={<Icon.Clock className="h-4 w-4" />} text="Too many searches. Wait a minute, then try again." /> };
  } else if (current?.status === "error") {
    slot = {
      key: "error",
      node: (
        <Note
          tone="error"
          icon={<Icon.Warning className="h-4 w-4" />}
          text="Couldn't search right now."
          action={
            <button type="button" className="fr-capsule" style={{ height: 26, padding: "0 11px", fontSize: 13 }} onClick={() => input.kind === "search" && void search(input.handle)}>
              Try again
            </button>
          }
        />
      ),
    };
  }

  const spin = pending;

  return (
    <div>
      <label htmlFor={inputId} className="sr-only">
        Connection ID
      </label>
      <div className="fr-search fr-squircle">
        <Icon.Search className="pointer-events-none absolute left-3 h-[18px] w-[18px] text-faint" />
        <input
          id={inputId}
          ref={inputRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && input.kind === "search") {
              e.preventDefault();
              if (launched.current !== input.handle || current?.status === "error") void search(input.handle);
            }
            if (e.key === "Escape" && query) {
              e.stopPropagation();
              clear();
            }
          }}
          placeholder="Add by Connection ID"
          inputMode="text"
          enterKeyHint="search"
          autoCapitalize="none"
          autoCorrect="off"
          autoComplete="off"
          spellCheck={false}
          maxLength={40}
          aria-describedby={`${inputId}-status`}
          aria-invalid={input.kind === "hint" || undefined}
        />
        <div className="absolute right-2 flex items-center">
          <AnimatePresence initial={false} mode="popLayout">
            {spin ? (
              <motion.span key="spin" initial={{ opacity: 0, scale: 0.6 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.6 }} transition={SNAPPY} className="grid h-6 w-6 place-items-center text-faint">
                <Spinner className="h-4 w-4" />
              </motion.span>
            ) : query ? (
              <motion.button
                key="clear"
                type="button"
                initial={{ opacity: 0, scale: 0.6 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.6 }}
                transition={SNAPPY}
                onClick={clear}
                aria-label="Clear"
                className="fr-glyph-btn"
                style={{ width: 20, height: 20 }}
              >
                <Icon.Xmark className="h-3 w-3" />
              </motion.button>
            ) : null}
          </AnimatePresence>
        </div>
      </div>

      <div id={`${inputId}-status`} aria-live="polite">
        <AnimatePresence initial={false}>
          {slot && (
            <motion.div
              key="slot"
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={reduce ? INSTANT : { height: SMOOTH, opacity: { duration: 0.2 } }}
              style={{ overflow: "hidden", margin: "0 -6px", padding: "0 6px" }}
            >
              <div style={{ paddingTop: 10, paddingBottom: 6 }}>
                <AnimatePresence mode="wait" initial={false}>
                  <motion.div
                    key={slot.key}
                    initial={reduce ? false : { opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, transition: { duration: 0.1 } }}
                    transition={reduce ? INSTANT : SNAPPY}
                  >
                    {slot.node}
                  </motion.div>
                </AnimatePresence>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

/* ---------- Pieces ---------- */

function Note({ text, icon, tone = "neutral", action }: { text: string; icon?: React.ReactNode; tone?: "neutral" | "error"; action?: React.ReactNode }) {
  return (
    <div className="fr-footnote flex items-center gap-2 px-1" style={{ color: tone === "error" ? "var(--loss)" : "var(--muted)", minHeight: 28 }} role={tone === "error" ? "alert" : undefined}>
      {icon}
      <span className="min-w-0 flex-1">{text}</span>
      {action}
    </div>
  );
}

/** One found trader. The action is derived from the live view, so it follows optimistic state automatically. */
function ResultRow({ person, api, onAdd }: { person: Person; api: FriendsApi; onAdd: (p: Person) => void }) {
  const rel = relationFor(api.view, person.handle);
  const outgoing = api.view.outgoing.find((o) => o.handle.toLowerCase() === person.handle.toLowerCase());
  const incoming = api.view.incoming.find((o) => o.handle.toLowerCase() === person.handle.toLowerCase());

  let action: React.ReactNode;
  if (rel.relation === "friend") {
    action = (
      <span className="fr-capsule fr-capsule--quiet" style={{ minWidth: 96, background: "transparent" }}>
        <Icon.Check className="h-4 w-4" /> Friends
      </span>
    );
  } else if (rel.relation === "outgoing") {
    const sending = !!outgoing?.sending;
    action = (
      <span className="fr-capsule fr-capsule--quiet" style={{ minWidth: 96 }} role="status">
        <SwapLabel id={sending ? "sending" : "sent"}>
          {sending ? <Spinner className="h-3.5 w-3.5" /> : <motion.span initial={{ scale: 0.4 }} animate={{ scale: 1 }} transition={BOUNCY} style={{ display: "grid" }}><Icon.Check className="h-4 w-4" /></motion.span>}
          {sending ? "Sending" : "Requested"}
        </SwapLabel>
      </span>
    );
  } else if (rel.relation === "incoming" && incoming) {
    action = (
      <button type="button" className="fr-capsule fr-capsule--filled" style={{ minWidth: 96 }} onClick={() => void api.accept(incoming)}>
        Accept
      </button>
    );
  } else {
    action = (
      <button type="button" className="fr-capsule fr-capsule--filled" style={{ minWidth: 96 }} onClick={() => onAdd(person)} aria-label={`Send friend request to ${person.displayName}`}>
        <Icon.Plus className="h-3.5 w-3.5" /> Add
      </button>
    );
  }

  const caption =
    rel.relation === "incoming" ? "Wants to compete with you" : rel.relation === "friend" ? "Already your friend" : `@${person.handle}`;

  return (
    <Group>
      <li className="fr-li" style={{ ["--fr-sep-inset" as string]: "72px" }}>
        <div className="fr-row">
          <Avatar name={person.displayName} seed={person.handle} />
          <div className="min-w-0 flex-1">
            <p className="fr-headline truncate" style={{ color: "var(--ink)" }}>
              {person.displayName}
            </p>
            <p className="fr-subhead truncate" style={{ color: "var(--muted)" }}>
              {caption}
            </p>
          </div>
          {action}
        </div>
      </li>
    </Group>
  );
}

/* ---------- Your Connection ID ---------- */

export function MyConnectionId({ me }: { me: FriendsApi["me"] }) {
  const { copied, copy } = useCopy();
  return (
    <Section footer="Friends enter this ID to find you. Your email address is never shown.">
      <Group>
        <li className="fr-li">
          {me.status === "ready" && !me.handle ? (
            <Link href="/settings" className="fr-row" style={{ textDecoration: "none" }}>
              <Tile color="var(--fr-fill-strong)" fg="var(--muted)">
                <Icon.At className="h-[18px] w-[18px]" />
              </Tile>
              <span className="min-w-0 flex-1">
                <span className="fr-headline block" style={{ color: "var(--ink)" }}>Choose your Connection ID</span>
                <span className="fr-subhead block" style={{ color: "var(--muted)" }}>Friends need it to find you</span>
              </span>
              <Icon.ChevronRight className="h-4 w-4 text-faint" />
            </Link>
          ) : (
            <div className="fr-row" style={{ minHeight: 56 }}>
              <Tile color="var(--gold-strong)" fg="var(--on-gold)">
                <Icon.At className="h-[18px] w-[18px]" />
              </Tile>
              <div className="min-w-0 flex-1">
                <p className="fr-subhead" style={{ color: "var(--muted)" }}>Your Connection ID</p>
                {me.status === "loading" ? (
                  <span className="fr-skel mt-1 block" style={{ height: 16, width: 120 }} aria-label="Loading your Connection ID" />
                ) : me.status === "error" ? (
                  <p className="fr-body" style={{ color: "var(--muted)" }}>Unavailable right now</p>
                ) : (
                  <p className="fr-headline truncate fr-num" style={{ color: "var(--ink)" }}>@{me.handle}</p>
                )}
              </div>
              {me.status === "ready" && me.handle && (
                <button type="button" className="fr-capsule" style={{ minWidth: 92 }} onClick={() => void copy(`@${me.handle}`)} aria-label={copied ? "Copied" : "Copy your Connection ID"}>
                  <SwapLabel id={copied ? "copied" : "copy"}>
                    {copied ? <Icon.Check className="h-4 w-4" /> : <Icon.Copy className="h-4 w-4" />}
                    {copied ? "Copied" : "Copy"}
                  </SwapLabel>
                </button>
              )}
            </div>
          )}
        </li>
      </Group>
    </Section>
  );
}
