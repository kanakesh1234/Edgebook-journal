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

  const viewScript = `#!/usr/bin/env node
const fs = require("fs");
const path = require("path");

const DIR = __dirname;
const C = {
  reset: "\\x1b[0m",
  bold: "\\x1b[1m",
  dim: "\\x1b[2m",
  gold: "\\x1b[38;2;234;179;8m",
  goldSoft: "\\x1b[38;2;250;204;21m",
  emerald: "\\x1b[38;2;52;211;153m",
  rose: "\\x1b[38;2;251;113;133m",
  slate: "\\x1b[38;2;148;163;184m",
  white: "\\x1b[38;2;248;250;252m",
  line: "\\x1b[38;2;71;85;105m",
};

const pad = (s, n) => s + " ".repeat(Math.max(0, n - s.replace(/\\x1b\\[[0-9;]*m/g, "").length));
const rule = (ch = "─", w = 72) => \`\${C.line}\${ch.repeat(w)}\${C.reset}\`;

function renderMarkdown(md) {
  const lines = md.replace(/\\r\\n/g, "\\n").split("\\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/^#{1}\\s+/.test(line)) {
      const title = line.replace(/^#\\s+/, "").trim();
      console.log(\`\\n\${C.gold}\${C.bold}━━━ \${title.toUpperCase()} ━━━\${C.reset}\`);
    } else if (/^#{2,3}\\s+/.test(line)) {
      const title = line.replace(/^#{2,3}\\s+/, "").trim();
      console.log(\`\\n\${C.goldSoft}\${C.bold}▸ \${title}\${C.reset}\`);
    } else if (/^\\s*[-*]{3,}\\s*$/.test(line)) {
      console.log(rule("─", 68));
    } else if (/^\\s*\\|/.test(line)) {
      // Collect markdown table block
      const tbl = [];
      while (i < lines.length && /^\\s*\\|/.test(lines[i])) {
        tbl.push(lines[i]);
        i++;
      }
      i--;
      const rows = tbl
        .filter((r) => !/^\\s*\\|[\\s:|-]+\\|\\s*$/.test(r))
        .map((r) => r.trim().replace(/^\\||\\|$/g, "").split("|").map((c) => c.trim()));
      if (rows.length > 0) {
        const widths = rows[0].map((_, col) => Math.max(...rows.map((r) => (r[col] || "").length)));
        console.log(rule("─", widths.reduce((a, b) => a + b + 3, 1)));
        rows.forEach((r, rIdx) => {
          const formatted = r.map((cell, cIdx) => {
            const raw = pad(cell, widths[cIdx]);
            if (rIdx === 0) return \`\${C.gold}\${C.bold}\${raw}\${C.reset}\`;
            if (/^\\+|win|pass|a\\+/i.test(cell)) return \`\${C.emerald}\${raw}\${C.reset}\`;
            if (/^-\\$|^-\\d|loss|fail|fomo/i.test(cell)) return \`\${C.rose}\${raw}\${C.reset}\`;
            return \`\${C.white}\${raw}\${C.reset}\`;
          });
          console.log(\`\${C.line}│\${C.reset} \${formatted.join(\` \${C.line}│\${C.reset} \`)}\`);
          if (rIdx === 0) console.log(rule("─", widths.reduce((a, b) => a + b + 3, 1)));
        });
        console.log(rule("─", widths.reduce((a, b) => a + b + 3, 1)));
      }
    } else {
      let out = line
        .replace(/\\*\\*([^*]+)\\*\\*/g, \`\${C.white}\${C.bold}$1\${C.reset}\`)
        .replace(/\\\`([^\\\`]+)\\\`/g, \`\${C.goldSoft}$1\${C.reset}\`)
        .replace(/^\\s*[-*]\\s+/, \`  \${C.gold}●\${C.reset} \`)
        .replace(/^\\s*(\\d+\\.)\\s+/, \`  \${C.gold}$1\${C.reset} \`);
      console.log(out);
    }
  }
}

function showHeader() {
  let summary = null;
  try { summary = JSON.parse(fs.readFileSync(path.join(DIR, "stats/summary.json"), "utf8")); } catch {}
  const overall = summary?.overall || {};
  const net = typeof overall.net === "number" ? overall.net : 0;
  const wr = typeof overall.winRate === "number" ? \`\${overall.winRate.toFixed(1)}%\` : "—";
  const pf = typeof overall.profitFactor === "number" ? overall.profitFactor.toFixed(2) : "—";
  const avgR = typeof overall.avgR === "number" ? \`\${overall.avgR > 0 ? "+" : ""}\${overall.avgR.toFixed(2)}R\` : "—";
  const netColor = net >= 0 ? C.emerald : C.rose;
  const netStr = (net >= 0 ? "+$" : "-$") + Math.abs(net).toFixed(2);

  console.log("");
  console.log(rule("━", 72));
  console.log(\`  \${C.gold}\${C.bold}EDGEBOOK\${C.reset}  \${C.slate}·  INSTITUTIONAL TERMINAL DOSSIER\${C.reset}\`);
  console.log(rule("─", 72));
  console.log(
    \`  \${C.slate}Net P&L:\${C.reset} \${netColor}\${C.bold}\${netStr}\${C.reset}   \` +
    \`\${C.slate}Win Rate:\${C.reset} \${C.white}\${C.bold}\${wr}\${C.reset}   \` +
    \`\${C.slate}Profit Factor:\${C.reset} \${C.white}\${C.bold}\${pf}\${C.reset}   \` +
    \`\${C.slate}Avg R:\${C.reset} \${C.goldSoft}\${C.bold}\${avgR}\${C.reset}   \` +
    \`\${C.slate}Trades:\${C.reset} \${C.white}\${C.bold}\${overall.count ?? 0}\${C.reset}\`
  );
  console.log(rule("━", 72));
}

const arg = (process.argv[2] || "").trim().toLowerCase();
const reportsDir = path.join(DIR, "reports");
const reportFiles = fs.existsSync(reportsDir)
  ? fs.readdirSync(reportsDir).filter((f) => f.endsWith(".md") && f !== "README.md").sort().reverse()
  : [];

showHeader();

if (arg === "stats") {
  renderMarkdown(fs.readFileSync(path.join(DIR, "stats/stats-summary.md"), "utf8"));
} else if (arg === "plan") {
  renderMarkdown(fs.readFileSync(path.join(DIR, "mentor/ACTION_PLAN.md"), "utf8"));
} else if (arg === "psych") {
  renderMarkdown(fs.readFileSync(path.join(DIR, "mentor/PSYCHOLOGY_LOG.md"), "utf8"));
} else if (arg === "risk") {
  renderMarkdown(fs.readFileSync(path.join(DIR, "mentor/RISK_DOSSIER.md"), "utf8"));
} else if (arg && reportFiles.some((f) => f.toLowerCase().includes(arg))) {
  const match = reportFiles.find((f) => f.toLowerCase().includes(arg));
  renderMarkdown(fs.readFileSync(path.join(reportsDir, match), "utf8"));
} else {
  if (reportFiles.length > 0) {
    console.log(\`\\n\${C.gold}\${C.bold}  LATEST AUDIT REPORT\${C.reset} \${C.slate}(\${reportFiles[0]})\${C.reset}\`);
    renderMarkdown(fs.readFileSync(path.join(reportsDir, reportFiles[0]), "utf8"));
  } else {
    renderMarkdown(fs.readFileSync(path.join(DIR, "mentor/ACTION_PLAN.md"), "utf8"));
  }
  console.log("\\n" + rule("─", 72));
  console.log(\`  \${C.goldSoft}Commands:\${C.reset} \${C.white}./view.sh stats\${C.reset}  ·  \${C.white}./view.sh plan\${C.reset}  ·  \${C.white}./view.sh psych\${C.reset}  ·  \${C.white}./view.sh risk\${C.reset}\`);
  if (reportFiles.length > 0) {
    console.log(\`  \${C.goldSoft}Reports (\${reportFiles.length}):\${C.reset} \${C.slate}\${reportFiles.slice(0, 4).join(", ")}\${C.reset}\`);
  }
  console.log(rule("─", 72) + "\\n");
}
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

# 9. Future Live Re-Sync Script & Styled Terminal Report Viewer
${writeHeredoc("$DIR/sync.sh", "__EB_SYNC_SH__", syncScript)}
chmod +x "\$DIR/sync.sh"

${writeHeredoc("$DIR/view.sh", "__EB_VIEW_SH__", viewScript)}
chmod +x "\$DIR/view.sh"

# 10. GEMINI.md Instructions for agy
${writeHeredoc(
  "$DIR/GEMINI.md",
  "__EB_GEMINI_MD__",
  `# EdgeBook Institutional Trading Workspace (Gemini Pro & agy)

You are the trader's elite algorithmic trading mentor, adopting the institutional analysis methodology of Michael J. Huddleston (The Inner Circle Trader - ICT) and quantitative risk principles.

## 🎨 RESPONSE & FORMATTING STANDARD (CRITICAL — FOLLOW ON EVERY REPLY)
1. **ZERO SOURCE LEAKS (UNLESS EXPLICITLY ASKED)**:
   - **NEVER** mention file paths (\`trades/trades.csv\`, \`stats/stats-summary.md\`, \`mentor/PSYCHOLOGY_LOG.md\`), line numbers (\`:705-755\`), or internal database IDs (\`e_mwkt...\`, \`pl-mwkt...\`) in your visible response.
   - **NEVER** announce internal file writes (do NOT write *"Logged to mentor/PSYCHOLOGY_LOG.md"* or *"see stats/..."*). Update \`mentor/\` and \`reports/\` silently in the background.
   - Speak naturally as a seasoned institutional trading mentor who already knows the trader's tape, rules, and psychology—only reveal file/data sources if the trader explicitly asks *"where did you get that?"* or *"show me the source"*.
2. **PREMIUM INSTITUTIONAL TERMINAL FORMATTING**:
   - Open substantive reviews with a clean section header: \`━━━ 📊 <TITLE> ━━━\`.
   - Use **aligned Markdown tables** for all numeric breakdowns (trade summaries, wins vs. losses, hold times, session splits, checklist pass/fail) so metrics scan like a Bloomberg terminal.
   - Use refined markers (\`▸\`, \`●\`, \`✓\`, \`✕\`) and short bold lead-ins; avoid dense walls of text or clutter.
   - Keep quick factual answers (e.g., *"what was my last trade"*) razor-sharp: a clean trade scorecard table + 3–4 tight bullet insights on execution, checklist, and mindset—no raw IDs or file citations.
   - Close deep audits with a dedicated \`━━━ 🎯 NEXT-SESSION PROTOCOL ━━━\` section listing 2–3 non-negotiable rules for the next trading day.
   - Format every saved audit report in \`reports/YYYY-MM-DD-<topic>.md\` with the same executive dossier layout (Executive Verdict, Metrics Table, ICT & Killzone Audit, Behavioral Leaks, Next-Session Protocol) so \`./view.sh\` renders it cleanly.

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
- To pull newly added trades from the website later, run \`./sync.sh\` if the trader asks to refresh.

## Living Memory Directives (Silent Background Updates)
- Silently maintain the living markdown dossier in \`mentor/\` as you converse:
  - Record emotional realizations, triggers, FOMO, or breakthroughs in \`mentor/PSYCHOLOGY_LOG.md\`.
  - Update challenge limits or risk rules in \`mentor/RISK_DOSSIER.md\`.
  - Update \`mentor/ACTION_PLAN.md\` with actionable homework after every review.
  - Save full session audits in \`reports/YYYY-MM-DD-<topic>.md\`.

## Institutional Analysis Framework (ICT Directives)
1. **IPDA & Liquidity Delivery**: Evaluate whether trades targeted clear Buy-Side / Sell-Side Liquidity or chased mid-range price.
2. **Time & Price (Killzones)**: Verify London (02:00–05:00 EST), NY AM (08:30–11:00 EST), Silver Bullet (10:00–11:00 EST), and NY PM (13:30–16:00 EST).
3. **PD Arrays (Premium vs. Discount)**: Longs must originate in Discount (<50%); shorts in Premium (>50%).
4. **Displacement & MSS**: Confirm energetic displacement leaving clean FVGs rather than retail chop.
5. **Psychology & Discipline Audit**: Cross-reference pre-trade plans, full trade transcripts, and computed stats internally to expose hidden emotional leaks.`,
)}

printf "\\n\\033[38;2;71;85;105m━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\\033[0m\\n"
printf "  \\033[1;38;2;234;179;8mEDGEBOOK\\033[0m  \\033[38;2;148;163;184m·  INSTITUTIONAL TERMINAL DOSSIER READY\\033[0m\\n"
printf "\\033[38;2;71;85;105m────────────────────────────────────────────────────────────────────────\\033[0m\\n"
printf "  \\033[38;2;52;211;153m✓\\033[0m Synced \\033[1m${entries.length}\\033[0m trades · \\033[1m${plans.length}\\033[0m plans · \\033[1m${challenges.length}\\033[0m challenges · \\033[1m${lessons.length}\\033[0m lessons\\n"
printf "\\n"
printf "  \\033[38;2;250;204;21m▸ agy\\033[0m          Launch your private ICT mentor (Gemini Pro)\\n"
printf "  \\033[38;2;250;204;21m▸ ./view.sh\\033[0m    View styled stats, action plan & saved reports\\n"
printf "  \\033[38;2;250;204;21m▸ ./sync.sh\\033[0m    Pull newly logged trades anytime\\n"
printf "\\033[38;2;71;85;105m━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\\033[0m\\n\\n"
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
