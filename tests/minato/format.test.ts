import { strict as assert } from "node:assert";
import { parseMinato, minatoPlainText } from "../../src/lib/minato/format.ts";

let passed = 0;
const ok = (c: unknown, m: string) => {
  assert.ok(c, m);
  passed++;
};

// ---- new-style reply: lead + metric rows + note + folded working
{
  const r = parseMinato(
    [
      "At **$47** risk and a **17.75-pt stop**, size **1 MNQ** or **0 NQ**.",
      "- **MNQ ($2/pt)** · 1 contract · $35.5 risk",
      "- **NQ ($20/pt)** · Too big — 1 contract risks $355",
      "> Assumed 17.75 pts because your stop isn't saved yet.",
      "",
      "---",
      "**Working**",
      "- MNQ: `floor($47 / (17.75 × $2))` = 1",
    ].join("\n"),
  );
  ok(r.visible[0]?.type === "p", "first block is the lead paragraph");
  ok(r.visible[1]?.type === "kv" && r.visible[1].rows.length === 2, "metric rows grouped");
  ok(r.visible[2]?.type === "note", "blockquote becomes a note");
  ok(r.working.length === 1 && r.working[0]?.type === "list", "working folded, title line consumed");
  ok(r.workingTitle === "working", "default working title");
}

// ---- old-style reply (what the model used to send): caveats tuck away without a divider
{
  const r = parseMinato(
    [
      "Your max losing streak is **8**.",
      "1. **Streaks**: P(≥3) = **41%**",
      "3. **Assumptions & Caveat**: Assumes independent Bernoulli trials at 62.5% win rate across a very small sample of eight decided trades.",
      "**Assumptions Caveat:** All numbers assume independent trials.",
      "**Follow-up:** Want me to adjust risk?",
    ].join("\n"),
  );
  ok(r.working.length >= 1, "assumptions moved into working");
  const visibleText = JSON.stringify(r.visible);
  ok(!/Bernoulli/.test(visibleText), "caveat text not visible by default");
  ok(/Follow-up/.test(visibleText), "follow-up stays visible");
}

// ---- divider with nothing above it must not swallow the answer
{
  const r = parseMinato("---\nJust this.");
  ok(r.visible.length === 1 && r.working.length === 0, "leading divider ignored");
}

// ---- tables
{
  const r = parseMinato("Compare:\n| Setup | Win % |\n|---|---|\n| ORB | 61 |\n| FVG | 54 |");
  const t = r.visible.find((b) => b.type === "table");
  ok(t && t.type === "table" && t.head.length === 2 && t.rows.length === 2, "markdown table parsed");
}

// ---- long "label: sentence" bullets are NOT metric rows
{
  const r = parseMinato("- **Note**: " + "this is a very long explanatory sentence ".repeat(4));
  ok(r.visible[0]?.type === "list", "long value stays a plain bullet");
}

// ---- escaped asterisks are repaired; clipboard text is clean
{
  const r = parseMinato("Win rate is \\*\\*63%\\*\\*.");
  ok(r.visible[0]?.type === "p" && r.visible[0].text.includes("**63%**"), "escaped bold repaired");
  const plain = minatoPlainText("Hi **there**\n---\n**Working**\n- `x`");
  ok(plain === "Hi there\nWorking\n- x", "plain text strips markup and dividers");
}

console.log(`=== MINATO FORMAT: ${passed} assertions passed ===`);
