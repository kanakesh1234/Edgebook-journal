import { NextResponse } from "next/server";
import { tradesToCsv, tradesToMarkdown, plansToMarkdown, reviewsToMarkdown } from "@/lib/export-zip";
import type { JournalEntry, TradePlan, Challenge, NoTradeLog, JournalSettings } from "@/lib/types";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

export const dynamic = "force-dynamic";

interface ExportBundle {
  entries: JournalEntry[];
  challenges: Challenge[];
  plans: TradePlan[];
  dayLogs: NoTradeLog[];
  settings?: JournalSettings;
  createdAt: number;
}

// In-memory cache for fast retrieval within the same instance
const exportCache = new Map<string, ExportBundle>();

// Disk-backed temp cache for cross-instance / multi-process persistence on the server
const CACHE_DIR = path.join(os.tmpdir(), "edgebook-cli-exports");
try {
  fs.mkdirSync(CACHE_DIR, { recursive: true });
} catch {
  // Ignore temp dir errors
}

function saveBundle(key: string, bundle: ExportBundle) {
  exportCache.set(key, bundle);
  try {
    fs.writeFileSync(path.join(CACHE_DIR, `${key}.json`), JSON.stringify(bundle), "utf-8");
  } catch {
    // Memory cache remains active
  }
}

function loadBundle(key: string): ExportBundle | null {
  const mem = exportCache.get(key);
  if (mem) return mem;
  try {
    const file = path.join(CACHE_DIR, `${key}.json`);
    if (fs.existsSync(file)) {
      const data = JSON.parse(fs.readFileSync(file, "utf-8")) as ExportBundle;
      exportCache.set(key, data);
      return data;
    }
  } catch {
    // Fall back to null
  }
  return null;
}

function generateScript(origin: string, bundle: ExportBundle | null): string {
  const entries = bundle?.entries ?? [];
  const challenges = bundle?.challenges ?? [];
  const plans = bundle?.plans ?? [];
  const dayLogs = bundle?.dayLogs ?? [];
  const settings = bundle?.settings;
  const currency = settings?.currency ?? "USD";

  const csvContent = tradesToCsv(entries, plans, challenges);
  const fullTranscript = tradesToMarkdown(entries, plans, challenges, new Map(), currency);
  const plansMarkdown = plansToMarkdown(plans, challenges);
  const reviewsMarkdown = settings ? reviewsToMarkdown(settings) : "# Reviews\n\nNo reviews recorded yet.\n";
  const challengesJson = JSON.stringify(challenges, null, 2);
  const tradesJson = JSON.stringify(entries, null, 2);

  // Initial living memory profiles
  const traderName = settings?.traderName || settings?.fullName || "Trader";
  const primaryChallenge = challenges.find((c) => c.id === settings?.primaryChallengeId) || challenges[0];

  const profileContent = `# Trader Profile: ${traderName}

- **Name**: ${traderName}
- **Account Currency**: ${currency}
- **Primary Challenge**: ${primaryChallenge?.name || "None designated"}
- **Total Trades Recorded**: ${entries.length}
- **Plans Recorded**: ${plans.length}
- **Trading Style**: Institutional Order Flow & ICT Methodology (IPDA, Killzones, FVGs)

## Active Objectives
- Target: ${primaryChallenge?.targetBalance ? `${primaryChallenge.targetBalance}` : "Consistent Process Execution"}
- Max Drawdown Limit: ${primaryChallenge?.maxDrawdown ? `${primaryChallenge.maxDrawdown}` : "Strict 1% per trade"}
`;

  const psychologyContent = `# Psychology & Behavioral Log

*This file tracks emotional triggers, recurring biases, and discipline breakthroughs across all trading sessions.*

## Observed Patterns & Watch Items
- Check \`trades/trades-full-transcript.md\` for per-trade "Emotion Before", "Emotion After", and "Conviction vs Urgency".
- Watch for:
  - Entering out of FOMO before Killzone sweeps
  - Urgency to "make it back" after a loss
  - Exiting early in fear vs. holding to invalidation/target
`;

  const riskContent = `# Risk Management Dossier

## Hard Rules
1. **Risk Per Trade**: Maximum 1% of account equity per idea.
2. **Daily Loss Limit**: Hard stop for the day after 2 consecutive losses or reaching the daily loss limit.
3. **Invalidation**: Invalidation price is non-negotiable. Moving stop losses wider is strictly forbidden.
4. **Killzone Hours**: Entries strictly during London (02:00–05:00 EST), NY AM (08:30–11:00 EST), or Silver Bullet.
`;

  const actionPlanContent = `# Active Training Action Plan

## Current Focus
1. **Patience for Liquidity Sweeps**: Ensure BSL or SSL is definitively swept before looking for market structure shifts.
2. **Displacement Confirmation**: Require energetic candle bodies leaving clean Fair Value Gaps (FVGs) rather than entering on weak wicks.
3. **Pre-Trade Planning**: Every trade MUST have a recorded plan in \`playbooks/plans.md\` with a defined Draw on Liquidity.
`;

  // Generate markdown files for day logs
  const dayLogScripts = dayLogs
    .slice(-30)
    .map((log) => {
      const content = `# Journal Log — ${log.date}\n**Mindset / Reason**: ${log.reason || "No trades taken"}\n`;
      return `cat << '__EDGEBOOK_DAYLOG__' > "$DIR/journals/${log.date}.md"\n${content}\n__EDGEBOOK_DAYLOG__\n`;
    })
    .join("\n");

  const tradeCount = entries.length;
  const challengeCount = challenges.length;
  const planCount = plans.length;

  return `#!/usr/bin/env bash
# ==============================================================================
# EdgeBook Terminal AI Bridge for Google Gemini Pro & agy
# Institutional Analysis & ICT Mentorship Engine
# ==============================================================================
set -e

DIR="\${1:-edgebook-journal}"

echo "⚡ [EdgeBook] Initializing complete AI trading dossier in ./\$DIR..."
mkdir -p "\$DIR/trades" "\$DIR/journals" "\$DIR/playbooks" "\$DIR/reports" "\$DIR/mentor"

# 1. Populate Tabular & Raw Trades Data
cat << '__EDGEBOOK_TRADES_CSV__' > "\$DIR/trades/trades.csv"
${csvContent.replaceAll("__EDGEBOOK_TRADES_CSV__", "")}
__EDGEBOOK_TRADES_CSV__

cat << '__EDGEBOOK_TRADES_JSON__' > "\$DIR/trades/trades.json"
${tradesJson.replaceAll("__EDGEBOOK_TRADES_JSON__", "")}
__EDGEBOOK_TRADES_JSON__

# 2. Populate Full Word-For-Word Trade Transcript (Every question, answer, emotion, autopsy)
cat << '__EDGEBOOK_TRADES_TRANSCRIPT__' > "\$DIR/trades/trades-full-transcript.md"
${fullTranscript.replaceAll("__EDGEBOOK_TRADES_TRANSCRIPT__", "")}
__EDGEBOOK_TRADES_TRANSCRIPT__

# 3. Populate Pre-Trade Plans (Thesis, draw on liquidity, pre-trade emotions, checklist)
cat << '__EDGEBOOK_PLANS_MD__' > "\$DIR/playbooks/plans.md"
${plansMarkdown.replaceAll("__EDGEBOOK_PLANS_MD__", "")}
__EDGEBOOK_PLANS_MD__

# 4. Populate Challenges & Rules
cat << '__EDGEBOOK_CHALLENGES_JSON__' > "\$DIR/playbooks/challenges.json"
${challengesJson.replaceAll("__EDGEBOOK_CHALLENGES_JSON__", "")}
__EDGEBOOK_CHALLENGES_JSON__

# 5. Populate Weekly & Monthly Review Autopsies
cat << '__EDGEBOOK_REVIEWS_MD__' > "\$DIR/journals/weekly-reviews.md"
${reviewsMarkdown.replaceAll("__EDGEBOOK_REVIEWS_MD__", "")}
__EDGEBOOK_REVIEWS_MD__

# 6. Populate Living Mentor Dossier
cat << '__EDGEBOOK_PROFILE__' > "\$DIR/mentor/TRADER_PROFILE.md"
${profileContent}
__EDGEBOOK_PROFILE__

cat << '__EDGEBOOK_PSYCHOLOGY__' > "\$DIR/mentor/PSYCHOLOGY_LOG.md"
${psychologyContent}
__EDGEBOOK_PSYCHOLOGY__

cat << '__EDGEBOOK_RISK__' > "\$DIR/mentor/RISK_DOSSIER.md"
${riskContent}
__EDGEBOOK_RISK__

cat << '__EDGEBOOK_ACTION_PLAN__' > "\$DIR/mentor/ACTION_PLAN.md"
${actionPlanContent}
__EDGEBOOK_ACTION_PLAN__

# 7. Populate Day Logs
${dayLogScripts}

# 8. Generate GEMINI.md for agy (With Comprehensive Context & Boundary Directives)
cat << 'EOF' > "\$DIR/GEMINI.md"
# EdgeBook Institutional Trading Workspace (Gemini Pro & agy)

You are the trader's elite algorithmic trading mentor, adopting the institutional analysis methodology of Michael J. Huddleston (The Inner Circle Trader - ICT) and quantitative risk principles.

## 🛑 STRICT WORKSPACE BOUNDARY (DO NOT SCAN OUTSIDE THIS DIRECTORY)
- All trading data is ALREADY located inside this folder:
  - \`trades/trades.csv\`: Tabular data for quick stats, dates, instruments, outcomes, and challenges.
  - \`trades/trades-full-transcript.md\`: Complete word-for-word transcript with EVERY question answered: why entered, emotions before/after, conviction vs urgency, pre-trade & execution checklists, reflections, and autopsy notes.
  - \`playbooks/plans.md\`: Pre-trade plans with thesis, draw on liquidity, expected setups, and invalidation criteria.
  - \`playbooks/challenges.json\`: All user challenges (Apex, Topstep, FTMO, etc.), target, start balance, max drawdown, and status.
  - \`journals/\`: Daily notes, psychology, and weekly/monthly review autopsies.
  - \`mentor/\`: The living memory dossier (\`TRADER_PROFILE.md\`, \`PSYCHOLOGY_LOG.md\`, \`RISK_DOSSIER.md\`, \`ACTION_PLAN.md\`).
- **NEVER** run commands searching the user's home directory (\`/Users/...\`, \`~\`, \`/tmp\`, etc.).
- **NEVER** run commands like \`find /Users/...\` or \`ls /Users/...\`. Stay strictly within this workspace directory.
- When asked about trades or challenges, inspect \`trades/trades.csv\`, \`trades/trades-full-transcript.md\`, and \`playbooks/challenges.json\` directly and answer immediately.

## Living Memory Directives
- As you mentor the trader, you are expected to update the living markdown files in \`mentor/\`:
  - When the trader shares an emotional realization, fear, FOMO, or psychological pattern, append it to \`mentor/PSYCHOLOGY_LOG.md\`.
  - When risk limits or challenge targets change, update \`mentor/RISK_DOSSIER.md\`.
  - At the end of every review, update \`mentor/ACTION_PLAN.md\` with specific training homework for the next session.
  - This ensures that ANY AI opening this workspace has 100% full context of where the trader stands and how to train them better.

## Institutional Analysis Framework (ICT Directives)
1. **IPDA & Liquidity Delivery**:
   - Price seeks Liquidity (Buy-Side Liquidity / Sell-Side Liquidity) or rebalances Imbalances (Fair Value Gaps / FVGs).
   - Evaluate whether trades targeted clear liquidity pools or chased price in the middle of a range.
2. **Time & Price (Killzones)**:
   - Verify trade timing strictly adheres to institutional killzones:
     - London Open: 02:00 – 05:00 EST
     - NY AM Session: 08:30 – 11:00 EST (including Silver Bullet: 10:00 – 11:00 EST)
     - NY PM Session: 13:30 – 16:00 EST
   - Flag any trade taken outside of institutional hours or right into major economic news releases.
3. **PD Arrays (Premium vs. Discount)**:
   - Longs must strictly originate in Discount (below 50% equilibrium).
   - Shorts must strictly originate in Premium (above 50% equilibrium).
   - Flag any trade where the trader bought in Premium or sold in Discount.
4. **Displacement & Market Structure Shift (MSS)**:
   - Confirm valid displacement candles creating clean Fair Value Gaps (FVG) and Market Structure Shifts (MSS) vs. retail chop.
5. **Psychology & Discipline Audit**:
   - Cross-reference daily emotion logs in \`journals/\` against executions in \`trades/\`.
   - Identify FOMO, premature entries, moving stop losses, and revenge trading.
6. **Persistent Memory in reports/**:
   - Always persist every comprehensive audit or weekly performance review to \`reports/YYYY-MM-DD-audit.md\`.
   - When asked for future analysis, read prior reports to track whether the trader is repeating past mistakes.
EOF

# 9. Generate Playbook starter
cat << 'EOF' > "\$DIR/playbooks/ict-rules.md"
# Institutional Trading Rules & Playbook

1. **Draw on Liquidity**: Identify the Higher Time Frame (HTF) Draw on Liquidity (BSL or SSL) before opening any lower time frame position.
2. **Session Alignment**: Only take entries during London, NY AM, or Silver Bullet killzones.
3. **Sponsorship**: Look for energetic displacement leaving an FVG following a liquidity sweep.
4. **Risk Limit**: Maximum 1% risk per trade. Invalidation point is non-negotiable.
EOF

# 10. Generate Reports README
cat << 'EOF' > "\$DIR/reports/README.md"
# Analysis & Audit Reports

Audits and reviews generated by \`agy\` are persisted in this directory.
When running subsequent sessions, \`agy\` inspects these reports to ensure compounding progress and discipline.
EOF

echo "✅ [EdgeBook] Workspace ready with ${tradeCount} trades (${planCount} plans, ${challengeCount} challenges) synced into ./\$DIR!"
echo ""
echo "🚀 To launch your private AI mentor with Gemini Pro:"
echo "   cd \$DIR"
echo "   agy"
echo ""
`;
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Partial<ExportBundle>;
    const key = crypto.randomBytes(12).toString("hex");

    const bundle: ExportBundle = {
      entries: Array.isArray(body.entries) ? body.entries : [],
      challenges: Array.isArray(body.challenges) ? body.challenges : [],
      plans: Array.isArray(body.plans) ? body.plans : [],
      dayLogs: Array.isArray(body.dayLogs) ? body.dayLogs : [],
      settings: body.settings,
      createdAt: Date.now(),
    };

    saveBundle(key, bundle);
    return NextResponse.json({ key });
  } catch (err) {
    console.error("[CLI_BRIDGE] Failed to register export bundle:", err);
    return NextResponse.json({ error: "failed_to_register" }, { status: 400 });
  }
}

export async function GET(request: Request) {
  const ua = request.headers.get("user-agent") || "";
  const isCurl = ua.toLowerCase().includes("curl");
  const url = new URL(request.url);
  const origin = url.origin;
  const key = url.searchParams.get("k");

  const bundle = key ? loadBundle(key) : null;

  if (isCurl || url.searchParams.get("format") === "sh") {
    return new NextResponse(generateScript(origin, bundle), {
      status: 200,
      headers: {
        "Content-Type": "text/x-shellscript; charset=utf-8",
        "Cache-Control": "no-store",
      },
    });
  }

  return NextResponse.json({
    name: "edgebook-bridge",
    command: `curl -fsSL "${origin}/api/cli/bridge${key ? `?k=${key}` : ""}" | bash && cd edgebook-journal && agy`,
    tradesSynced: bundle?.entries.length ?? 0,
    challengesSynced: bundle?.challenges.length ?? 0,
    plansSynced: bundle?.plans.length ?? 0,
    targetDir: "edgebook-journal",
    reportsDir: "edgebook-journal/reports",
  });
}
