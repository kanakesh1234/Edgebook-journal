import { NextResponse } from "next/server";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import {
  computeAllStats,
  dailyEquityToCsv,
  lessonsToMarkdown,
  noTradeDaysToCsv,
  plansToMarkdown,
  reviewsToMarkdown,
  statsToMarkdown,
  tradesToCsv,
  tradesToMarkdown,
  type ExportLessonRecord,
} from "@/lib/export-zip";
import { generateTradesCsv } from "@/lib/backtesting/csv-export";
import type { PersistedSession } from "@/lib/backtesting/persistence";
import { defaultSettings, type Challenge, type JournalEntry, type JournalSettings, type NoTradeLog, type TradePlan } from "@/lib/types";
import { getGoogleConfig } from "@/lib/server/google-config";
import { APP_SESSION_COOKIE, openAppSession, readCookie, sealAppSession, type AppSession } from "@/lib/server/session";
import { newRequestId, resolveDriveForSession, withDrive } from "@/lib/server/authed-drive";
import { getFile, readJournalDoc } from "@/lib/server/drive";
import { readLessons } from "@/lib/server/lessons-store";
import { blocksToHtml, coverOf, hookOf, readMinutes, textOf } from "@/lib/server/lessons-html";
import { listAccounts } from "@/lib/server/accounts";
import { listFor } from "@/lib/server/friends";

export const dynamic = "force-dynamic";

interface ExportBundle {
  entries: JournalEntry[];
  challenges: Challenge[];
  plans: TradePlan[];
  dayLogs: NoTradeLog[];
  settings?: JournalSettings;
  lessons?: ExportLessonRecord[];
  backtestSessions?: PersistedSession[];
  createdAt: number;
}

const exportCache = new Map<string, ExportBundle>();
const CACHE_DIR = path.join(os.tmpdir(), "edgebook-cli-exports");
try {
  fs.mkdirSync(CACHE_DIR, { recursive: true });
} catch {
  // Ignore temp dir errors on read-only environments
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

async function loadLessonsForUser(email: string): Promise<ExportLessonRecord[]> {
  try {
    const [friends, allLessons, accounts] = await Promise.all([listFor(email), readLessons(), listAccounts()]);
    const visibleAuthors = new Set<string>([email]);
    for (const f of friends) {
      if (f.status === "accepted") visibleAuthors.add(f.from === email ? f.to : f.from);
    }
    const byEmail = new Map(accounts.map((a) => [a.email.toLowerCase(), a]));
    const who = (em: string) => {
      const a = byEmail.get(em.toLowerCase());
      return { handle: a?.handle ?? "trader", name: a?.name?.split(" ")[0] ?? a?.handle ?? "Trader" };
    };
    return allLessons
      .filter((l) => visibleAuthors.has(l.author))
      .map((l) => {
        const html = l.html ?? blocksToHtml(l.blocks ?? []);
        return {
          id: l.id,
          title: l.title,
          subtitle: l.subtitle,
          html,
          cover: l.cover ?? coverOf(html),
          customCover: l.cover ?? null,
          excerpt: textOf(html).slice(0, 180),
          hook: hookOf(html),
          readMins: readMinutes(html),
          createdAt: l.createdAt,
          author: who(l.author),
          bylines: l.bylines ?? [],
          mine: l.author === email,
          likes: l.likes.length,
          likedByMe: l.likes.includes(email),
          reposts: l.reposts.length,
          repostedByMe: l.reposts.includes(email),
          savedByMe: (l.saves ?? []).includes(email),
          comments: l.comments.map((c) => ({ id: c.id, body: c.body, at: c.at, by: who(c.by).name })),
        };
      });
  } catch {
    return [];
  }
}

/** Pulls the trader's entire historical + live journal, backtests, and lessons directly from Google Drive. */
async function loadServerDriveBundle(session: AppSession): Promise<ExportBundle | null> {
  const config = getGoogleConfig();
  if (!config) return null;
  const resolved = await resolveDriveForSession(session, config);
  if (!resolved.ok) return null;

  const requestId = newRequestId();
  const [doc, backtestsRaw, lessons] = await Promise.all([
    withDrive(resolved.drive, "cliBridgeJournal", requestId, (t) => readJournalDoc(t, resolved.drive.folders)).catch(() => null),
    withDrive(resolved.drive, "cliBridgeBacktests", requestId, async (t) => {
      const blob = await getFile(t, resolved.drive.folders.journals, "backtests.json");
      if (!blob) return [] as PersistedSession[];
      const parsed = JSON.parse(await blob.text()) as { sessions?: PersistedSession[] };
      return Array.isArray(parsed.sessions) ? parsed.sessions : [];
    }).catch(() => [] as PersistedSession[]),
    loadLessonsForUser(session.email),
  ]);

  if (!doc || typeof doc !== "object") {
    return { entries: [], challenges: [], plans: [], dayLogs: [], lessons, backtestSessions: backtestsRaw, createdAt: Date.now() };
  }

  const d = doc as { entries?: JournalEntry[]; plans?: TradePlan[]; dayLogs?: NoTradeLog[]; settings?: JournalSettings };
  const settings = d.settings ?? defaultSettings();
  return {
    entries: Array.isArray(d.entries) ? d.entries : [],
    challenges: Array.isArray(settings.challenges) ? settings.challenges : [],
    plans: Array.isArray(d.plans) ? d.plans : [],
    dayLogs: Array.isArray(d.dayLogs) ? d.dayLogs : [],
    settings,
    lessons,
    backtestSessions: backtestsRaw,
    createdAt: Date.now(),
  };
}

function sanitizeFilename(raw: string, fallback = "file"): string {
  const cleaned = raw.trim().replace(/[^\w.-]+/g, "_").replace(/_+/g, "_").replace(/^[_.-]+|[_.-]+$/g, "");
  return cleaned.slice(0, 80) || fallback;
}

/** Emits a safe bash heredoc block that preserves verbatim text and handles CRLF/trailing newlines. */
function writeHeredoc(targetPath: string, tag: string, content: string, onlyIfMissing = false): string {
  const normalized = content.replace(/\r\n/g, "\n").replaceAll(tag, "");
  const body = normalized.endsWith("\n") ? normalized : `${normalized}\n`;
  const writeCmd = `cat << '${tag}' > "${targetPath}"\n${body}${tag}`;
  return onlyIfMissing ? `if [ ! -f "${targetPath}" ]; then\n${writeCmd}\nfi` : writeCmd;
}

function generateScript(origin: string, bundle: ExportBundle | null, syncQuery: string): string {
  const entries = bundle?.entries ?? [];
  const challenges = bundle?.challenges ?? [];
  const plans = bundle?.plans ?? [];
  const dayLogs = bundle?.dayLogs ?? [];
  const settings: JournalSettings = { ...defaultSettings(), ...(bundle?.settings ?? {}), challenges };
  const lessons = bundle?.lessons ?? [];
  const backtests = bundle?.backtestSessions ?? [];
  const currency = settings.currency ?? "USD";

  const csvContent = tradesToCsv(entries, plans, challenges);
  const fullTranscript = tradesToMarkdown(entries, plans, challenges, new Map(), currency);
  const plansMarkdown = plansToMarkdown(plans, challenges);
  const reviewsMarkdown = reviewsToMarkdown(settings);
  const allStats = computeAllStats(entries, settings, dayLogs, plans);
  const statsMd = statsToMarkdown(allStats, settings);
  const equityCsv = dailyEquityToCsv(allStats.overall);
  const noTradeCsv = noTradeDaysToCsv(dayLogs);
  const noTradeMd = dayLogs.length
    ? [
        "# No-Trade & Discipline Day Logs",
        "",
        ...[...dayLogs]
          .sort((a, b) => b.date.localeCompare(a.date))
          .map((l) => `- **${l.date}**: ${l.reason || "No trades taken"}`),
      ].join("\n")
    : "# No-Trade Day Logs\n\nNo no-trade days logged yet.\n";
  const lessonsMd = lessonsToMarkdown(lessons);

  const traderName = settings.traderName || settings.fullName || "Trader";
  const primaryChallenge = challenges.find((c) => c.id === settings.primaryChallengeId) || challenges[0];

  const profileContent = `# Trader Profile: ${traderName}

- **Name**: ${traderName}
- **Account Currency**: ${currency}
- **Primary Challenge**: ${primaryChallenge?.name || "None designated"}
- **Total Trades Recorded**: ${entries.length}
- **Plans Recorded**: ${plans.length}
- **Lessons Exported**: ${lessons.length}
- **Trading Style**: Institutional Order Flow & ICT Methodology (IPDA, Killzones, FVGs)

## Active Objectives
- Target: ${primaryChallenge?.targetBalance ?? settings.targetEquity ?? "Consistent Process Execution"}
- Max Drawdown Limit: ${primaryChallenge?.maxDrawdown ?? settings.maxDrawdown ?? "Strict 1% per trade"}
`;

  const psychologyContent = `# Psychology & Behavioral Log

*This file tracks emotional triggers, recurring biases, and discipline breakthroughs across all trading sessions.*

## Observed Patterns & Watch Items
- Inspect \`trades/trades-full-transcript.md\` for per-trade "Emotion Before", "Emotion After", and "Conviction vs Urgency".
- Inspect \`stats/stats-summary.md\` for mistake cost breakdowns and discipline scores.
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

  const backtestBlocks = backtests
    .filter((s) => Array.isArray(s.trades) && s.trades.length > 0)
    .map((s, idx) => {
      const safeName = sanitizeFilename(`${s.config?.sessionName || "session"}_${s.id}`, `session_${idx}`);
      return writeHeredoc(`$DIR/backtesting/${safeName}-trades.csv`, `__EB_BT_${idx}__`, generateTradesCsv(s.trades, s.config));
    })
    .join("\n\n");

  const syncUrl = `${origin}/api/cli/bridge${syncQuery}`;
  const syncScript = `#!/usr/bin/env bash
set -e
DIR="$(cd "$(dirname "$0")" && pwd)"
echo "🔄 [EdgeBook] Refreshing live trades, plans, stats, and lessons from Drive..."
curl -fsSL "${syncUrl}" | bash -s -- "$DIR"
`;

  // Compact lessons JSON if raw HTML would bloat the script unnecessarily (full text is in lessons-readable.md)
  const lightLessons = lessons.map((l) => ({ ...l, html: l.html && l.html.length > 20_000 ? `${l.html.slice(0, 20_000)}…` : l.html }));

  return `#!/usr/bin/env bash
# ==============================================================================
# EdgeBook Terminal AI Bridge for Google Gemini Pro & agy
# Complete Historical + Live Data Sync & ICT Mentorship Engine
# ==============================================================================
set -e

DIR="\${1:-edgebook-journal}"

echo "⚡ [EdgeBook] Syncing complete trading archive into \$DIR..."
mkdir -p "\$DIR/trades" "\$DIR/journals" "\$DIR/playbooks" "\$DIR/stats" "\$DIR/lessons" "\$DIR/backtesting" "\$DIR/reports" "\$DIR/mentor"

# 1. Trades (All historical + recent trades: CSV, raw JSON, and full Q&A transcript)
${writeHeredoc("$DIR/trades/trades.csv", "__EB_TRADES_CSV__", csvContent)}
${writeHeredoc("$DIR/trades/trades.json", "__EB_TRADES_JSON__", JSON.stringify(entries, null, 2))}
${writeHeredoc("$DIR/trades/trades-full-transcript.md", "__EB_TRADES_MD__", fullTranscript)}

# 2. Pre-Trade Plans, Challenges, Playbook Setups & Rules
${writeHeredoc("$DIR/playbooks/plans.md", "__EB_PLANS_MD__", plansMarkdown)}
${writeHeredoc("$DIR/playbooks/plans.json", "__EB_PLANS_JSON__", JSON.stringify(plans, null, 2))}
${writeHeredoc("$DIR/playbooks/challenges.json", "__EB_CHALLENGES_JSON__", JSON.stringify(challenges, null, 2))}
${writeHeredoc("$DIR/playbooks/setups.json", "__EB_SETUPS_JSON__", JSON.stringify(settings.playbook ?? [], null, 2))}
${writeHeredoc("$DIR/playbooks/rules.json", "__EB_RULES_JSON__", JSON.stringify({ rules: settings.rules ?? null, dayLimits: settings.dayLimits ?? {} }, null, 2))}

# 3. Reviews & All No-Trade Day Logs
${writeHeredoc("$DIR/journals/weekly-reviews.md", "__EB_REVIEWS_MD__", reviewsMarkdown)}
${writeHeredoc("$DIR/journals/reviews.json", "__EB_REVIEWS_JSON__", JSON.stringify({ reviews: settings.reviews ?? { weekly: {}, monthly: {} }, weeklyReviews: settings.weeklyReviews ?? {} }, null, 2))}
${writeHeredoc("$DIR/journals/no-trade-days.csv", "__EB_NOTRADE_CSV__", noTradeCsv)}
${writeHeredoc("$DIR/journals/no-trade-days.md", "__EB_NOTRADE_MD__", noTradeMd)}

# 4. Complete Calculated Statistics & Equity Curve
${writeHeredoc("$DIR/stats/stats-summary.md", "__EB_STATS_MD__", statsMd)}
${writeHeredoc("$DIR/stats/summary.json", "__EB_STATS_JSON__", JSON.stringify(allStats, null, 2))}
${writeHeredoc("$DIR/stats/daily-equity.csv", "__EB_EQUITY_CSV__", equityCsv)}

# 5. Lessons (User & Circle Lessons + Comments)
${writeHeredoc("$DIR/lessons/lessons-readable.md", "__EB_LESSONS_MD__", lessonsMd)}
${writeHeredoc("$DIR/lessons/lessons.json", "__EB_LESSONS_JSON__", JSON.stringify(lightLessons, null, 2))}

# 6. Backtesting Sessions
${writeHeredoc("$DIR/backtesting/sessions.json", "__EB_BACKTESTS_JSON__", JSON.stringify(backtests, null, 2))}
${backtestBlocks}

# 7. Living Mentor Dossier (AI Brain always refreshed; mentor .md files preserved if already customized)
${writeHeredoc("$DIR/mentor/ai-brain.json", "__EB_AIBRAIN_JSON__", JSON.stringify(settings.aiBrain ?? null, null, 2))}
${writeHeredoc("$DIR/mentor/TRADER_PROFILE.md", "__EB_PROFILE_MD__", profileContent, true)}
${writeHeredoc("$DIR/mentor/PSYCHOLOGY_LOG.md", "__EB_PSYCH_MD__", psychologyContent, true)}
${writeHeredoc("$DIR/mentor/RISK_DOSSIER.md", "__EB_RISK_MD__", riskContent, true)}
${writeHeredoc("$DIR/mentor/ACTION_PLAN.md", "__EB_ACTION_MD__", actionPlanContent, true)}

# 8. Starter Playbook & Reports README (preserved if already present)
${writeHeredoc(
  "$DIR/playbooks/ict-rules.md",
  "__EB_ICT_RULES__",
  `# Institutional Trading Rules & Playbook\n\n1. **Draw on Liquidity**: Identify the Higher Time Frame (HTF) Draw on Liquidity (BSL or SSL) before opening any lower time frame position.\n2. **Session Alignment**: Only take entries during London, NY AM, or Silver Bullet killzones.\n3. **Sponsorship**: Look for energetic displacement leaving an FVG following a liquidity sweep.\n4. **Risk Limit**: Maximum 1% risk per trade. Invalidation point is non-negotiable.\n`,
  true,
)}
${writeHeredoc(
  "$DIR/reports/README.md",
  "__EB_REPORTS_README__",
  `# Analysis & Audit Reports\n\nAudits and reviews generated by \`agy\` are persisted in this directory.\nWhen running subsequent sessions, \`agy\` inspects these reports to ensure compounding progress and discipline.\n`,
  true,
)}

# 9. Future Live Re-Sync Script (run ./sync.sh anytime inside this folder)
${writeHeredoc("$DIR/sync.sh", "__EB_SYNC_SH__", syncScript)}
chmod +x "\$DIR/sync.sh"

# 10. GEMINI.md Instructions for agy
${writeHeredoc(
  "$DIR/GEMINI.md",
  "__EB_GEMINI_MD__",
  `# EdgeBook Institutional Trading Workspace (Gemini Pro & agy)

You are the trader's elite algorithmic trading mentor, adopting the institutional analysis methodology of Michael J. Huddleston (The Inner Circle Trader - ICT) and quantitative risk principles.

## 🛑 STRICT WORKSPACE BOUNDARY (DO NOT SCAN OUTSIDE THIS DIRECTORY)
- ALL historical and recent trading data is ALREADY synced inside this folder:
  - \`trades/trades.csv\` & \`trades/trades.json\`: Every trade recorded (Date, Instrument, Direction, P&L, R:R, Challenge, Setup, Mistake tags).
  - \`trades/trades-full-transcript.md\`: Complete word-for-word transcript with EVERY question & answer: why entered, emotions before/after, conviction vs urgency, pre-trade & execution checklists, reflections, and autopsy notes.
  - \`playbooks/plans.md\` & \`playbooks/plans.json\`: Pre-trade plans (thesis, draw on liquidity, invalidation, pre-trade emotions, rules).
  - \`playbooks/challenges.json\`: All prop firm challenges (targets, starting balance, max drawdown, status).
  - \`playbooks/setups.json\` & \`playbooks/rules.json\`: Trader's custom playbook setups and hard daily limits.
  - \`stats/stats-summary.md\` & \`stats/summary.json\`: Pre-computed win rate, expectancy, profit factor, hold times, session analytics, rule adherence, and mistake cost breakdown.
  - \`journals/weekly-reviews.md\` & \`journals/no-trade-days.md\`: Weekly/monthly autopsies, daily grades, commitments, and discipline logs.
  - \`lessons/lessons-readable.md\`: Trading lessons and notes linked to trades.
  - \`backtesting/\`: Historical replay backtest sessions and trades.
  - \`mentor/\`: Living memory dossier (\`TRADER_PROFILE.md\`, \`PSYCHOLOGY_LOG.md\`, \`RISK_DOSSIER.md\`, \`ACTION_PLAN.md\`, \`ai-brain.json\`).
- **NEVER** run commands searching the user's home directory (\`/Users/...\`, \`~\`, \`/tmp\`, etc.). Stay strictly inside this directory.
- To pull newly added trades from the website later, tell the trader to run \`./sync.sh\` (or run it if asked to refresh).

## Living Memory Directives
- As you mentor the trader, continuously update the living markdown files in \`mentor/\`:
  - Record emotional realizations, triggers, FOMO, or breakthroughs in \`mentor/PSYCHOLOGY_LOG.md\`.
  - Update challenge limits or risk rules in \`mentor/RISK_DOSSIER.md\`.
  - Update \`mentor/ACTION_PLAN.md\` with actionable homework after every review.
  - Save full session audits in \`reports/YYYY-MM-DD-audit.md\`.

## Institutional Analysis Framework (ICT Directives)
1. **IPDA & Liquidity Delivery**: Evaluate whether trades targeted clear Buy-Side / Sell-Side Liquidity or chased mid-range price.
2. **Time & Price (Killzones)**: Verify London (02:00–05:00 EST), NY AM (08:30–11:00 EST), Silver Bullet (10:00–11:00 EST), and NY PM (13:30–16:00 EST).
3. **PD Arrays (Premium vs. Discount)**: Longs must originate in Discount (<50%); shorts in Premium (>50%).
4. **Displacement & MSS**: Confirm energetic displacement leaving clean FVGs rather than retail chop.
5. **Psychology & Discipline Audit**: Cross-reference \`playbooks/plans.md\`, \`trades/trades-full-transcript.md\`, and \`stats/stats-summary.md\` to expose hidden emotional leaks.`,
)}

echo "✅ [EdgeBook] Synced ${entries.length} trades, ${plans.length} plans, ${challenges.length} challenges, ${lessons.length} lessons, and full stats into \$DIR!"
echo ""
echo "🚀 To launch your private AI mentor with Gemini Pro:"
echo "   cd \$DIR"
echo "   agy"
echo "   (Tip: run ./sync.sh inside \$DIR anytime later to pull new trades!)"
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
      lessons: Array.isArray(body.lessons) ? body.lessons : undefined,
      backtestSessions: Array.isArray(body.backtestSessions) ? body.backtestSessions : undefined,
      createdAt: Date.now(),
    };

    saveBundle(key, bundle);

    // Issue a stateless signed CLI token if the browser has a valid EdgeBook Google session.
    // This guarantees GET /api/cli/bridge works across any Vercel instance and pulls all Drive history anytime.
    let token: string | null = null;
    const config = getGoogleConfig();
    if (config) {
      const cookie = readCookie(request, APP_SESSION_COOKIE);
      const session = openAppSession(cookie, config.tokenSecret);
      if (session) {
        token = sealAppSession(session, config.tokenSecret);
      }
    }

    return NextResponse.json({ key, token });
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
  const token = url.searchParams.get("t");

  const memBundle = key ? loadBundle(key) : null;
  let driveBundle: ExportBundle | null = null;

  if (token) {
    const config = getGoogleConfig();
    const session = config ? openAppSession(token, config.tokenSecret) : null;
    if (session) {
      driveBundle = await loadServerDriveBundle(session).catch(() => null);
    }
  }

  // Prefer the richest dataset: Drive is canonical across serverless instances & future ./sync.sh runs,
  // while memBundle preserves instant browser-local edits if Drive hasn't caught up yet.
  let bundle: ExportBundle | null = driveBundle ?? memBundle;
  if (driveBundle && memBundle) {
    const useMemEntries = memBundle.entries.length > driveBundle.entries.length;
    bundle = {
      entries: useMemEntries ? memBundle.entries : driveBundle.entries,
      challenges: useMemEntries && memBundle.challenges.length >= driveBundle.challenges.length ? memBundle.challenges : driveBundle.challenges,
      plans: useMemEntries && memBundle.plans.length >= driveBundle.plans.length ? memBundle.plans : driveBundle.plans,
      dayLogs: useMemEntries && memBundle.dayLogs.length >= driveBundle.dayLogs.length ? memBundle.dayLogs : driveBundle.dayLogs,
      settings: useMemEntries && memBundle.settings ? memBundle.settings : driveBundle.settings ?? memBundle.settings,
      lessons: driveBundle.lessons?.length ? driveBundle.lessons : memBundle.lessons,
      backtestSessions: driveBundle.backtestSessions?.length ? driveBundle.backtestSessions : memBundle.backtestSessions,
      createdAt: Date.now(),
    };
  }

  const syncParams = new URLSearchParams();
  if (token) syncParams.set("t", token);
  else if (key) syncParams.set("k", key);
  const syncQuery = syncParams.toString() ? `?${syncParams.toString()}` : "";

  if (isCurl || url.searchParams.get("format") === "sh") {
    return new NextResponse(generateScript(origin, bundle, syncQuery), {
      status: 200,
      headers: {
        "Content-Type": "text/x-shellscript; charset=utf-8",
        "Cache-Control": "no-store",
      },
    });
  }

  return NextResponse.json({
    name: "edgebook-bridge",
    command: `curl -fsSL "${origin}/api/cli/bridge${syncQuery}" | bash && cd edgebook-journal && agy`,
    tradesSynced: bundle?.entries.length ?? 0,
    challengesSynced: bundle?.challenges.length ?? 0,
    plansSynced: bundle?.plans.length ?? 0,
    lessonsSynced: bundle?.lessons?.length ?? 0,
    source: driveBundle ? "google_drive" : memBundle ? "session_snapshot" : "none",
    targetDir: "edgebook-journal",
    reportsDir: "edgebook-journal/reports",
  });
}
