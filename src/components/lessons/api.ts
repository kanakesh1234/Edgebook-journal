import { toast } from "@/components/ui/toast";

const MESSAGES: Record<string, string> = {
  not_logged_in: "You're signed out. Sign in again and retry.",
  storage_unavailable: "Lessons storage isn't reachable right now. Try again in a moment.",
  rate_limited: "You're doing that too fast. Wait a few seconds and retry.",
  not_found: "That lesson no longer exists or isn't shared with you.",
  comments_off: "Comments are turned off for this lesson.",
  reposts_off: "Reposts are turned off for this lesson.",
  too_many_comments: "This lesson has reached its comment limit.",
};

/** POST to /api/lessons. Returns true on success; on failure shows a short toast (never the raw server error) and returns false. */
export async function lessonsPost(body: object): Promise<boolean> {
  const r = await fetch("/api/lessons", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).catch(() => null);
  if (r?.ok) return true;
  const code = ((await r?.json().catch(() => null)) as { error?: string } | null)?.error ?? "";
  toast.error("That didn't work", r ? MESSAGES[code] ?? "Something went wrong. Please try again." : "Check your connection and try again.");
  return false;
}
