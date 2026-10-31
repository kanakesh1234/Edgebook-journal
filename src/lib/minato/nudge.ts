/**
 * Session nudge: the ONE line Minato may volunteer when the panel opens, and only when what it has learned is relevant to
 * what is happening right now (a loss was just taken, a second trade is coming, the readiness check is high).
 * Silence is the default. Wording is hedged: these are patterns in the trader's own records, never a verdict.
 */
import type { JournalEntry } from "../types";
import type { Commitment, Readiness } from "./brain-ml";
import { activeItems, type MemoryStore } from "./memory";

export interface Nudge { text: string; ask: string }

export function sessionNudge(i: { memory?: MemoryStore; readiness: Readiness | null; commitments: Commitment[]; today: string; entries: JournalEntry[] }): Nudge | null {
  const live = new Set(activeItems(i.memory).filter((x) => x.status === "supported" || x.status === "established").map((x) => x.id));
  const todays = i.entries.filter((e) => e.date === i.today).sort((a, b) => a.createdAt - b.createdAt);
  const last = todays[todays.length - 1];

  if (last && last.pnl < 0) {
    if (live.has("sem:post-loss:slips-after-loss")) return { text: "You just took a loss, and after losses your next trade has more often broken your own process. Take a breath before the next one.", ask: "Why do I slip after a loss?" };
    if (live.has("sem:size-after-loss:size-up-after-loss")) return { text: "After a loss you have tended to size up. Keep the next trade at your normal size.", ask: "Why do I size up after a loss?" };
  }
  if (todays.length >= 2 && live.has("sem:late-day:later-trades-slip")) return { text: "Your third trade of the day onward has slipped more often. Make sure the next one is worth taking.", ask: "Why do my later trades slip?" };
  if (i.readiness?.level === "high") return { text: `Today carries a higher chance of a slip than usual${i.readiness.drivers.length ? `, because ${i.readiness.drivers.join(" and ")}` : ""}. Stay sharp.`, ask: "Why is today higher risk for me?" };
  const open = i.commitments.filter((c) => c.status === "open").sort((a, b) => b.date.localeCompare(a.date))[0];
  if (open) return { text: `You told me: “${open.text.slice(0, 110)}”. I’ll check it against your trades.`, ask: "How am I doing on my commitment?" };
  if (live.has("sem:trend:worsening")) return { text: "Your last stretch of trades has slipped a little more than before.", ask: "Why has my process slipped lately?" };
  return null;
}
