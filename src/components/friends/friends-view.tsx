"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Spinner } from "@/components/ui/button";
import { LayoutGroup } from "motion/react";
import { sortFriends, type FriendItem, type RequestItem, type SortMode } from "./friends-state";
import { useFriends, type FriendsApi } from "./use-friends";
import { AddFriend, MyConnectionId } from "./add-friend";
import { FriendSheet } from "./friend-sheet";
import {
  Avatar, Collapse, CollapseItem, Group, Icon, INSTANT, LayoutItem, Section, Segmented, SkeletonRows, SMOOTH, Unavailable,
} from "./primitives";
import "./friends.css";

const SORTS: { value: SortMode; label: string }[] = [
  { value: "process", label: "Process" },
  { value: "points", label: "Points" },
  { value: "win", label: "Win rate" },
];

export function FriendsView() {
  const api = useFriends();
  const { view, load, loadError, refreshFailed } = api;
  const reduce = useReducedMotion();
  const searchRef = useRef<HTMLInputElement>(null);
  const [sort, setSort] = useState<SortMode>("process");
  const [openKey, setOpenKey] = useState<string | null>(null);

  const friends = useMemo(() => sortFriends(view.friends, sort), [view.friends, sort]);
  const selected = openKey ? view.friends.find((f) => f.key === openKey) ?? null : null;

  // The friend you were viewing is gone (removed elsewhere) — let go of the selection.
  useEffect(() => {
    if (openKey && load === "ready" && !selected) setOpenKey(null);
  }, [openKey, load, selected]);

  const hasAnything = view.friends.length + view.incoming.length + view.outgoing.length > 0;

  return (
    <LayoutGroup id="friends">
      <div className="fr-root mx-auto w-full max-w-[620px] pb-10">
        <header className="px-4 pb-5">
          <motion.h1
            initial={reduce ? false : { opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={reduce ? INSTANT : SMOOTH}
            className="fr-large-title"
            style={{ color: "var(--ink)" }}
          >
            Friends
          </motion.h1>
          <p className="fr-subhead mt-1" style={{ color: "var(--muted)", maxWidth: 460 }}>
            Compete on process, not profit alone. Friends see only competition-safe aggregate metrics — never journals, notes or screenshots.
          </p>
        </header>

        <div className="mb-7">
          <AddFriend api={api} inputRef={searchRef} />
        </div>
        <div className="mb-7">
          <MyConnectionId me={api.me} />
        </div>

        {refreshFailed && (
          <div className="fr-footnote mb-6 flex items-center gap-2 px-1" style={{ color: "var(--muted)" }} role="status">
            <Icon.Warning className="h-4 w-4" />
            <span className="flex-1">Couldn't refresh. Showing your last known list.</span>
            <button type="button" className="fr-capsule" style={{ height: 26, padding: "0 11px", fontSize: 13 }} onClick={api.retry}>
              Retry
            </button>
          </div>
        )}

        {load === "loading" && (
          <div aria-busy="true" aria-label="Loading friends">
            <Section title="Friends"><SkeletonRows count={3} /></Section>
          </div>
        )}

        {load === "error" && (
          <Unavailable
            tone="error"
            icon={<Icon.Warning className="h-8 w-8" />}
            title={loadError === "signed_out" ? "Session expired" : loadError === "network" ? "You're offline" : "Couldn't load friends"}
            body={
              loadError === "signed_out"
                ? "Sign in again to see your friends."
                : loadError === "network"
                  ? "Check your connection, then try again."
                  : "Something went wrong on our side. Try again in a moment."
            }
            action={
              loadError === "signed_out" ? undefined : (
                <button type="button" className="fr-capsule fr-capsule--filled" onClick={api.retry}>
                  <Icon.Refresh className="h-4 w-4" /> Try again
                </button>
              )
            }
          />
        )}

        {load === "ready" && (
          <>
            <Collapse show={view.incoming.length > 0}>
              <Section title={`Requests · ${view.incoming.length}`}>
                <Group>
                  <AnimatePresence initial={false}>
                    {view.incoming.map((r) => (
                      <CollapseItem key={r.key}>
                        <IncomingRow item={r} api={api} />
                      </CollapseItem>
                    ))}
                  </AnimatePresence>
                </Group>
              </Section>
            </Collapse>

            <Collapse show={view.outgoing.length > 0}>
              <Section title="Sent">
                <Group>
                  <AnimatePresence initial={false}>
                    {view.outgoing.map((r) => (
                      <CollapseItem key={r.key}>
                        <OutgoingRow item={r} api={api} />
                      </CollapseItem>
                    ))}
                  </AnimatePresence>
                </Group>
              </Section>
            </Collapse>

            {!hasAnything ? (
              <Unavailable
                icon={<Icon.Persons className="h-9 w-9" />}
                title="No friends yet"
                body="Add friends by their Connection ID to compare process scores, challenge progress and Edge Points."
                action={
                  <button type="button" className="fr-capsule fr-capsule--filled" style={{ height: 36, padding: "0 18px", fontSize: 15 }} onClick={() => searchRef.current?.focus()}>
                    <Icon.PersonPlus className="h-4 w-4" /> Add a friend
                  </button>
                }
              />
            ) : (
              <Section
                title={`Friends · ${view.friends.length}`}
                trailing={
                  view.friends.length > 1 ? <Segmented label="Sort friends by" value={sort} onChange={setSort} options={SORTS} /> : undefined
                }
              >
                <Group>
                  {friends.length === 0 ? (
                    <li className="fr-li">
                      <div className="fr-row fr-subhead" style={{ color: "var(--muted)", minHeight: 56 }}>
                        Accepted requests appear here.
                      </div>
                    </li>
                  ) : (
                    <AnimatePresence initial={false} mode="popLayout">
                      {friends.map((f) => (
                        <LayoutItem key={f.key}>
                          <FriendRow friend={f} sort={sort} onOpen={() => setOpenKey(f.key)} />
                        </LayoutItem>
                      ))}
                    </AnimatePresence>
                  )}
                </Group>
              </Section>
            )}
          </>
        )}
      </div>

      <FriendSheet friend={selected} api={api} onClose={() => setOpenKey(null)} />
    </LayoutGroup>
  );
}

/* ---------- Rows ---------- */

function FriendRow({ friend, sort, onOpen }: { friend: FriendItem; sort: SortMode; onOpen: () => void }) {
  const m = friend.metrics;
  const trailing = !m
    ? null
    : sort === "points"
      ? { v: m.edgePoints.toLocaleString(), l: "Points" }
      : sort === "win"
        ? { v: m.winRate == null ? "—" : `${m.winRate}%`, l: "Win rate" }
        : { v: String(m.processScore), l: "Process" };

  return (
    <button type="button" className="fr-row" onClick={onOpen} aria-label={`${friend.displayName}, open profile`}>
      <Avatar name={friend.displayName} seed={friend.handle} layoutId={`fr-avatar-${friend.key}`} />
      <div className="min-w-0 flex-1">
        <p className="fr-headline truncate" style={{ color: "var(--ink)" }}>
          {friend.displayName} <span className="fr-subhead" style={{ color: "var(--faint)", fontWeight: 400 }}>@{friend.handle}</span>
        </p>
        {m ? (
          <p className="fr-subhead fr-num truncate" style={{ color: "var(--muted)" }}>
            {m.trades} trading days · {m.winRate != null ? `${m.winRate}% win` : "— win"} · {m.edgePoints.toLocaleString()} EP
          </p>
        ) : (
          <span className="fr-skel mt-1 block" style={{ height: 12, width: "58%" }} aria-label="Syncing stats" />
        )}
      </div>
      {trailing ? (
        <div className="shrink-0 text-right">
          <p className="fr-headline fr-num" style={{ color: "var(--ink)" }}>{trailing.v}</p>
          <p className="fr-caption" style={{ color: "var(--faint)" }}>{trailing.l}</p>
        </div>
      ) : (
        <Spinner className="h-4 w-4 shrink-0 text-faint" />
      )}
      <Icon.ChevronRight className="h-4 w-4 shrink-0 text-faint" />
    </button>
  );
}

function IncomingRow({ item, api }: { item: RequestItem; api: FriendsApi }) {
  return (
    <div className="fr-row">
      <Avatar name={item.displayName} seed={item.handle || item.id} />
      <div className="min-w-0 flex-1">
        <p className="fr-headline truncate" style={{ color: "var(--ink)" }}>{item.displayName}</p>
        <p className="fr-subhead truncate" style={{ color: "var(--muted)" }}>
          {item.handle ? `@${item.handle} · ` : ""}wants to compete
        </p>
      </div>
      <button type="button" className="fr-capsule fr-capsule--filled" onClick={() => void api.accept(item)} aria-label={`Accept ${item.displayName}`}>
        Accept
      </button>
      <button type="button" className="fr-glyph-btn" onClick={() => void api.decline(item)} aria-label={`Decline ${item.displayName}`} title="Decline">
        <Icon.Xmark className="h-4 w-4" />
      </button>
    </div>
  );
}

function OutgoingRow({ item, api }: { item: RequestItem; api: FriendsApi }) {
  return (
    <div className="fr-row">
      <Avatar name={item.displayName} seed={item.handle || item.id} />
      <div className="min-w-0 flex-1">
        <p className="fr-headline truncate" style={{ color: "var(--ink)" }}>{item.displayName}</p>
        <p className="fr-subhead truncate" style={{ color: "var(--muted)" }}>
          {item.handle ? `@${item.handle} · ` : ""}{item.sending ? "Sending…" : "Waiting for a response"}
        </p>
      </div>
      <button
        type="button"
        className="fr-capsule fr-capsule--quiet"
        disabled={item.syncing}
        onClick={() => void api.cancel(item)}
        aria-label={`Cancel request to ${item.displayName}`}
        style={{ minWidth: 78, opacity: item.syncing ? 0.6 : 1 }}
      >
        {item.syncing ? <Spinner className="h-3.5 w-3.5" /> : "Cancel"}
      </button>
    </div>
  );
}
