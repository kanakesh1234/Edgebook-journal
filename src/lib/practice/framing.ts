/**
 * Adaptive framing — the SAME trade is asked about differently depending on how it went.
 *
 *   mistake trades (blunder / slip)  → "which mistake did you record?", "how serious?", "how many times bigger
 *                                      than your average loss?", "how far past your stop did you let it run?",
 *                                      "how often have you made this mistake, and what has it cost in total?"
 *   everything else                  → keeps the ordinary recall questions (and gets fewer of them — see focus.ts)
 *   high levels                      → typed answers with no choices (the "mastery" stage)
 *
 * Like every other builder here, each answer is computed from fields the trader recorded. Nothing is invented.
 */
import type { JournalEntry } from "@/lib/types";
import { formatDateMedium } from "@/lib/format";
import type { Rng } from "./math/rng.ts";
import type { PracticeQuestion } from "./engine.ts";
import { choiceQ, fmtMoney, hasShots, isNum, numberQ, round, shuffle, sideOf } from "./qbuild.ts";
import { focusOf, isMistakeTrade, MISTAKE_LABELS, mistakeOf, SEVERITY_LABELS } from "./focus.ts";

const NO_MISTAKE = "No mistake";
const ALL_LABELS = [NO_MISTAKE, ...Object.values(MISTAKE_LABELS), "Another mistake"];

/** Trades where the trader named a mistake in the Autopsy, grouped by mistake key. */
function mistakeGroups(all: JournalEntry[]): { reviewed: JournalEntry[]; byKey: Map<string, JournalEntry[]> } {
  const reviewed = all.filter((e) => typeof e.review?.followUp?.mistake === "string" && e.review.followUp.mistake.length > 0);
  const byKey = new Map<string, JournalEntry[]>();
  for (const trade of reviewed) {
    const named = mistakeOf(trade);
    if (!named) continue;
    byKey.set(named.key, [...(byKey.get(named.key) ?? []), trade]);
  }
  return { reviewed, byKey };
}

const withFp = (q: PracticeQuestion | null, fp: string): PracticeQuestion | null => (q ? { ...q, fp } : null);

export function framedQuestions(entry: JournalEntry, all: JournalEntry[], rng: Rng, pin: string): PracticeQuestion[] {
  const out: Array<PracticeQuestion | null> = [];
  const T = entry.id;
  const id = (suffix: string) => `${T}:${suffix}`;
  const look = (text: string) => (hasShots(entry) ? `Look at the chart above. ${text}` : text);
  const focus = focusOf(entry, all);
  const mistakeTrade = isMistakeTrade(focus.kind);
  const noun = focus.severity > 0 ? SEVERITY_LABELS[focus.severity as 1 | 2 | 3].noun : "mistake";
  const named = mistakeOf(entry);
  const lost = isNum(entry.pnl) && entry.pnl < 0;

  /* ---------- what did you record? (every reviewed trade) ---------- */
  const recorded = entry.review?.followUp?.mistake;
  if (recorded) {
    const answer = named?.label ?? NO_MISTAKE;
    const wrong = shuffle(ALL_LABELS.filter((label) => label !== answer), rng);
    const prompt = mistakeTrade
      ? look(`You rated this trade a ${noun}${lost ? ` and it cost ${fmtMoney(entry.pnl)}` : ""}. Which mistake did you record on it?`)
      : look("Which mistake did you record on this trade (if any)?");
    out.push(choiceQ(id("mistake-type"), T, "mistake-type", 1, pin, prompt, answer, wrong, named ? `You named “${answer}” in your review.` : "You recorded no mistake on this trade.", rng));
  }
  if (focus.severity > 0) {
    const label = SEVERITY_LABELS[focus.severity as 1 | 2 | 3].label;
    out.push(choiceQ(id("mistake-severity"), T, "mistake-severity", 2, pin, look("How serious did you rate the mistake on this trade?"), label, Object.values(SEVERITY_LABELS).map((s) => s.label), `You rated it “${label}”. ${focus.severity === 3 ? "That is a serious breach of your process — revise it until it is automatic." : "Small slips repeat; this is how they get caught."}`, rng));
  }

  /* ---------- what did it cost? (mistake trades that lost) ---------- */
  const losses = all.filter((e) => isNum(e.pnl) && e.pnl < 0);
  if (mistakeTrade && lost && losses.length >= 3) {
    const avg = Math.abs(losses.reduce((sum, e) => sum + e.pnl, 0) / losses.length);
    const times = Math.abs(entry.pnl) / avg;
    out.push(numberQ(
      id("mistake-size"), T, "mistake-cost", 3, pin,
      `This trade lost ${fmtMoney(Math.abs(entry.pnl)).replace("+", "")}. Your average losing trade is $${round(avg)} (across ${losses.length} losers). How many times bigger than your average loss was it?`,
      round(times, 2), 0.1, "×", `${round(Math.abs(entry.pnl))} ÷ ${round(avg)} = ${round(times)}× your average loss.`, { group: "tm" },
    ));
  }

  const { ep, sl, xp } = { ep: entry.entryPrice, sl: entry.stopLoss, xp: entry.exitPrice };
  const side = sideOf(entry)?.toLowerCase();
  if (mistakeTrade && lost && isNum(ep) && isNum(sl) && isNum(xp) && ep !== sl && (side === "long" || side === "short")) {
    const risk = Math.abs(ep - sl);
    const lostPts = side === "short" ? xp - ep : ep - xp;
    if (lostPts > risk * 1.15 + 0.01) {
      const past = lostPts - risk;
      out.push(numberQ(
        id("stop-overrun"), T, "stop-overrun", 4, pin,
        `Entry ${ep}, stop ${sl}, exit ${xp} on a ${side} trade. How many points past your stop did you let it run?`,
        round(past), 0.25, "pts", `You lost ${round(lostPts)} points against a ${round(risk)}-point stop: ${round(lostPts)} − ${round(risk)} = ${round(past)} points past it.`, { group: "tm", compareHint: true },
      ));
      const saved = Math.abs(entry.pnl) * (1 - risk / lostPts);
      out.push(numberQ(
        id("stop-saved"), T, "stop-saved", 4, pin,
        `Entry ${ep}, stop ${sl}, exit ${xp} on a ${side} trade that lost $${round(Math.abs(entry.pnl))}. If you had exited at your stop, about how many dollars less would you have lost?`,
        round(saved, 2), Math.max(1, saved * 0.03), "$", `The stop was ${round(risk)} of the ${round(lostPts)} points lost, so honouring it saves $${round(Math.abs(entry.pnl))} × (1 − ${round(risk)}/${round(lostPts)}) ≈ $${round(saved)}.`, { group: "tm", compareHint: true },
      ));
    }
  }

  /* ---------- how often, and what has it cost in total? (the repeated-mistake pattern) ---------- */
  const { reviewed, byKey } = mistakeGroups(all);
  if (mistakeTrade && named && reviewed.length >= 3) {
    const mine = byKey.get(named.key) ?? [];
    if (mine.length >= 2) {
      const dates = mine.map((e) => formatDateMedium(e.date)).join(", ");
      out.push(withFp(numberQ(
        id("mistake-repeat"), T, "mistake-repeat", 3, pin,
        `You recorded “${named.label}” on this trade. On how many of your ${reviewed.length} reviewed trades did you record the same mistake?`,
        mine.length, 0, "trades", `It shows up on ${mine.length} trades: ${dates}.`, { group: "tm", chartTradeIds: mine.slice(0, 4).map((e) => e.id) },
      ), `${id("mistake-repeat")}@${mine.length}of${reviewed.length}`));
      const total = mine.reduce((sum, e) => sum + e.pnl, 0);
      out.push(withFp(numberQ(
        id("mistake-total"), T, "mistake-total", 4, pin,
        `Add up the P&L of every trade where you recorded “${named.label}”. What has that mistake cost (or made) you in total?`,
        round(total), Math.max(1, Math.abs(total) * 0.01), "$", `${mine.map((e) => `${formatDateMedium(e.date)} ${fmtMoney(e.pnl)}`).join(" + ")} = ${fmtMoney(round(total))}.`, { group: "tm", chartTradeIds: mine.slice(0, 4).map((e) => e.id) },
      ), `${id("mistake-total")}@${mine.length}x${Math.round(total)}`));
    }
    const ranked = [...byKey.entries()].sort((a, b) => b[1].length - a[1].length);
    const top = ranked[0];
    if (top && top[1].length >= 2 && (ranked.length === 1 || ranked[1]![1].length < top[1].length)) {
      const label = mistakeOf(top[1][0]!)!.label;
      out.push(withFp(choiceQ(
        id("mistake-most"), T, "mistake-pattern", 3, pin,
        `Across your ${reviewed.length} reviewed trades, which mistake have you recorded most often?`, label,
        shuffle(ALL_LABELS.filter((l) => l !== label && l !== NO_MISTAKE), rng), `“${label}” appears on ${top[1].length} trades — more than any other.`, rng,
      ), `${id("mistake-most")}@${top[0]}${top[1].length}of${reviewed.length}`));
    }
  }

  /* ---------- mastery: type it, no choices ---------- */
  if (isNum(entry.pnl) && entry.pnl !== 0) {
    out.push(numberQ(id("pnl-typed"), T, "pnl-typed", 4, pin, look("Type the P&L you recorded on this trade."), entry.pnl, Math.max(0.5, Math.abs(entry.pnl) * 0.005), "$", `Recorded P&L is ${fmtMoney(entry.pnl)}.`, { group: "tm" }));
  }
  const ranked = all.filter((e) => isNum(e.pnl)).sort((a, b) => b.pnl - a.pnl);
  const position = ranked.findIndex((e) => e.id === entry.id);
  if (ranked.length >= 4 && position >= 0) {
    out.push(withFp(numberQ(id("rank-typed"), T, "rank-typed", 4, pin, `Where does this trade rank by P&L among your ${ranked.length} recorded trades? Type the place (1 = best).`, position + 1, 0, "", `Ranked ${position + 1} of ${ranked.length} by P&L.`, { group: "tm" }), `${id("rank-typed")}@n${ranked.length}`));
  }

  return out.filter((q): q is PracticeQuestion => q != null);
}
