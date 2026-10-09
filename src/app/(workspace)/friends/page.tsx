"use client";

import { FriendsView } from "@/components/friends/friends-view";

/**
 * Friends — add by Connection ID, requests, and a shared leaderboard view.
 * Only competition-safe aggregate metrics are shared. Virtual Edge Points only —
 * no money, no wagering. The experience lives in components/friends.
 */
export default function FriendsPage() {
  return <FriendsView />;
}
