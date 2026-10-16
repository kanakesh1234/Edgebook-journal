import type { Metadata } from "next";
import { FeedScreen } from "@/components/feed/feed-screen";

export const metadata: Metadata = { title: "Feed · Edgebook" };

export default function FeedPage() {
  return <FeedScreen />;
}
