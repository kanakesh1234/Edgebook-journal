/* End-to-end verification driven through the local Brave install. */
import puppeteer, { type Browser, type Page } from "puppeteer-core";

const BASE = "http://localhost:3111";
const EXE = "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser";

let failures = 0;
const ok = (name: string) => console.log(`ok   ${name}`);
const fail = (name: string, extra = "") => {
  failures++;
  console.log(`FAIL ${name} ${extra}`);
};
async function expectText(page: Page, text: string, name = `text "${text}"`) {
  const needle = text.toLowerCase();
  try {
    // Case-insensitive: CSS text-transform (e.g. uppercase labels) is reflected
    // in innerText, so we match on what the user reads, not source casing.
    await page.waitForFunction(
      (t) => document.body?.innerText.toLowerCase().includes(t),
      { timeout: 8000 },
      needle,
    );
    ok(name);
  } catch {
    fail(name);
  }
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function waitForUrl(page: Page, fragment: string, timeout = 12000): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    if (page.url().includes(fragment)) return true;
    await sleep(150);
  }
  return false;
}

/** Set an input's value using only trusted keyboard events (React-safe). */
async function fill(page: Page, sel: string, text: string) {
  await page.waitForSelector(sel, { timeout: 8000 });
  await page.evaluate((s) => {
    const el = document.querySelector(s) as HTMLInputElement | null;
    if (!el) throw new Error(`no element ${s}`);
    el.focus();
    el.select();
  }, sel);
  await sleep(150);
  await page.keyboard.type(text);
}

async function newPage(browser: Browser): Promise<Page> {
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => {
    if (m.type() === "error" && !m.text().includes("favicon")) errors.push(m.text());
  });
  (page as Page & { __errors: string[] }).__errors = errors;
  return page;
}

function drainErrors(page: Page, label: string) {
  const errs = (page as Page & { __errors: string[] }).__errors.splice(0);
  const real = errs.filter((e) => !e.includes("net::") && !e.includes("Hydration") && !e.includes("hydrat"));
  if (real.length > 0) fail(`${label} console/page errors`, `\n     ${real.slice(0, 3).join("\n     ")}`);
  else ok(`${label} no runtime errors`);
}

async function clickByText(page: Page, selector: string, text: string) {
  const clicked = await page.evaluate(
    (sel, t) => {
      const els = Array.from(document.querySelectorAll(sel));
      const el = els.find((e) => (e.textContent ?? "").trim().includes(t));
      if (el) {
        (el as HTMLElement).click();
        return true;
      }
      return false;
    },
    selector,
    text,
  );
  if (!clicked) throw new Error(`No ${selector} with text "${text}"`);
}

(async () => {
  const browser = await puppeteer.launch({
    executablePath: EXE,
    headless: true,
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
  });

  /* ---------------------------- Landing page ---------------------------- */
  let page = await newPage(browser);
  await page.goto(BASE, { waitUntil: "networkidle0", timeout: 30000 });
  await expectText(page, "measured daily.", "landing hero headline");
  await expectText(page, "Everything a serious journal needs", "landing features section");
  await expectText(page, "Progress you can", "landing journey section");
  const candleCount = await page.$$eval("svg line", (els) => els.length);
  if (candleCount > 5) ok(`landing animated candles (${candleCount} lines)`); else fail("landing candles");
  drainErrors(page, "landing");
  await page.close();

  /* ------------------------------- Login -------------------------------- */
  page = await newPage(browser);
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle0" });
  await expectText(page, "Continue with Google", "login google button visible");
  await expectText(page, "or continue with email", "login email path visible");

  // Sign-up flow validation first (weak password)
  await clickByText(page, "button[role=tab]", "Create account");
  await sleep(400);
  await page.type("#name", "Kai Testworth");
  await page.type("#email", "kai@edgebook.test");
  await page.type("#password", "short");
  await clickByText(page, "button[type=submit]", "Create journal");
  await sleep(500);
  await expectText(page, "Use at least 8 characters", "signup weak-password validation");

  // Real signup
  await page.click("#password", { clickCount: 3 });
  await page.type("#password", "super-secret-9");
  await clickByText(page, "button[type=submit]", "Create journal");
  (await waitForUrl(page, "/dashboard")) ? ok("signup redirects to dashboard") : fail("signup redirect");

  /* ------------------------------ Dashboard ----------------------------- */
  await expectText(page, "Your dashboard is waiting for data", "dashboard empty state");
  await expectText(page, "Load demo data", "dashboard demo CTA");
  drainErrors(page, "dashboard-empty");

  // Load demo data
  await clickByText(page, "button", "Load demo data");
  await sleep(1200);
  await expectText(page, "Total P&L", "dashboard KPI cards appear");
  await expectText(page, "Equity curve", "equity curve panel");
  await expectText(page, "Winning days", "win rate panel");
  const hasRecharts = await page.$(".recharts-surface");
  hasRecharts ? ok("charts rendered") : fail("charts rendered");
  drainErrors(page, "dashboard-demo");

  /* ------------------------------- Roadmap ------------------------------ */
  await page.goto(`${BASE}/roadmap`, { waitUntil: "networkidle0" });
  await expectText(page, "of the journey complete", "roadmap progress header");
  await expectText(page, "milestone", "roadmap milestone rail");
  await expectText(page, "Current equity", "roadmap equity stat");
  await expectText(page, "Drawdown budget", "roadmap drawdown meter");
  const roadPaths = await page.$$eval("svg path", (els) => els.length);
  roadPaths > 4 ? ok(`roadmap road svg (${roadPaths} paths)`) : fail("roadmap road svg");
  drainErrors(page, "roadmap");

  /* ------------------------------- Calendar ----------------------------- */
  await page.goto(`${BASE}/calendar`, { waitUntil: "networkidle0" });
  await expectText(page, "one day at a time", "calendar header");
  const monthLabel = await page.$eval("h2", (el) => el.textContent ?? "");
  ok(`calendar month label: ${monthLabel.trim()}`);

  // Click a day that has trades: find any button whose aria-label contains "$"
  const clickedDay = await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll("button[aria-label]"));
    const b = btns.find((e) => /\$|−/.test(e.getAttribute("aria-label") ?? "") && /, \d{2}/.test(e.getAttribute("aria-label") ?? ""));
    if (b) (b as HTMLElement).click();
    return !!b;
  });
  clickedDay ? ok("calendar day clicked") : fail("calendar day click");
  await sleep(600);
  await expectText(page, "Add trade for this day", "calendar day modal opens");
  await page.keyboard.press("Escape");
  await sleep(400);

  // Month navigation
  await page.click('button[aria-label="Next month"]');
  await sleep(500);
  const label2 = await page.$eval("h2", (el) => el.textContent ?? "");
  if (label2 !== monthLabel) ok(`calendar month nav (${label2.trim()})`); else fail("calendar month nav");
  drainErrors(page, "calendar");

  /* -------------------------- Journal gallery --------------------------- */
  await page.goto(`${BASE}/journal`, { waitUntil: "networkidle0" });
  await expectText(page, "entries recorded", "journal gallery header");
  await sleep(600);

  // Open detail of first card
  await page.click("article");
  await sleep(700);
  await expectText(page, "Edit entry", "entry detail modal opens");
  drainErrors(page, "journal-detail");

  // Create a new entry via global modal
  await page.keyboard.press("Escape");
  await sleep(400);
  await page.click('header button[aria-label="Add trade"]').catch(async () => {
    // topbar add button only on <lg; use sidebar button
    await clickByText(page, "aside button", "Add trade");
  });
  await sleep(600);
  await expectText(page, "Log a trade", "new-entry modal opens");
  await fill(page, "#entry-pnl", "420.50");
  await fill(page, "#entry-rr", "2.4");
  await fill(page, "#entry-instrument", "NQ");
  await fill(page, "#entry-notes", "E2E smoke test session — clean breakout, held to target.");
  await clickByText(page, "button[type=submit]", "Add to journal");
  await sleep(900);
  await expectText(page, "Green day logged", "create-entry toast");
  await expectText(page, "Setup checklist", "review flow opens after save");
  await page.keyboard.press("Escape");
  await sleep(400);
  drainErrors(page, "journal-create");

  // Search for it
  await fill(page, 'input[aria-label="Search journal"]', "E2E smoke test");
  await sleep(700);
  const cardsAfterSearch = await page.$$eval("article", (a) => a.length);
  cardsAfterSearch === 1 ? ok("search narrows to the new entry") : fail(`search expected 1 card, got ${cardsAfterSearch}`);

  // Edit it
  await page.click("article");
  await sleep(600);
  await clickByText(page, "button", "Edit entry");
  await sleep(600);
  await fill(page, "#entry-pnl", "-180");
  await clickByText(page, "button[type=submit]", "Save changes");
  await sleep(900);
  await expectText(page, "Entry updated", "edit-entry toast");
  drainErrors(page, "journal-edit");

  // Delete it
  await page.click("article");
  await sleep(600);
  await clickByText(page, "button", "Delete");
  await sleep(600);
  await clickByText(page, "button", "Delete");
  await sleep(900);
  await expectText(page, "Entry deleted", "delete-entry toast");
  drainErrors(page, "journal-delete");

  /* ------------------------------- Settings ------------------------------ */
  await page.goto(`${BASE}/settings`, { waitUntil: "networkidle0" });
  await expectText(page, "Journey plan", "settings journey plan panel");
  await expectText(page, "Export journal", "settings export tile");
  await fill(page, "#set-target", "24000");
  await clickByText(page, "button", "Save plan");
  await sleep(800);
  await expectText(page, "Journey plan updated", "settings save toast");
  drainErrors(page, "settings");

  /* ------------------------------ Trading Lab ---------------------------- */
  await page.goto(`${BASE}/lab`, { waitUntil: "networkidle0" });
  await expectText(page, "Trading Lab", "lab header");
  await expectText(page, "Account & Risk", "lab risk parameters");
  await expectText(page, "First Trade — 6/6 required", "lab first trade section");
  await expectText(page, "Second Trade — 7/7 required", "lab second trade section");
  await expectText(page, "Common Mistakes — Never Repeat", "lab common mistakes");
  await expectText(page, "$75", "lab predefined risk limits");
  drainErrors(page, "lab");

  /* ------------------------------- MINATO ------------------------------- */
  await page.goto(`${BASE}/dashboard`, { waitUntil: "networkidle0" });
  await sleep(600);
  await page.click('button[aria-label*="MINATO"]');
  await sleep(700);
  await expectText(page, "MINATO SENSEI", "minato panel opens");
  await clickByText(page, "button", "How am I doing?");
  await sleep(600);
  await expectText(page, "Adherence", "minato data-grounded reply");
  await page.click('button[aria-label="Close MINATO"]');
  await sleep(400);
  drainErrors(page, "minato");

  /* ------------------------------ Mobile view ---------------------------- */
  const mobile = await newPage(browser);
  await mobile.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
  await mobile.goto(BASE, { waitUntil: "networkidle0" });
  const heroVisible = await mobile.evaluate(() => !!document.querySelector("h1"));
  heroVisible ? ok("mobile landing renders") : fail("mobile landing");
  await mobile.goto(`${BASE}/calendar`, { waitUntil: "networkidle0" });
  const bottomTabs = await mobile.$$eval("nav.fixed nav, nav", (els) => els.length);
  bottomTabs >= 1 ? ok("mobile bottom tabs present") : fail("mobile bottom tabs");
  drainErrors(mobile, "mobile-calendar");
  await mobile.close();

  await browser.close();
  console.log(failures === 0 ? "\nALL E2E CHECKS PASSED" : `\n${failures} E2E FAILURES`);
  process.exit(failures === 0 ? 0 : 1);
})().catch((e) => {
  console.error("E2E crashed:", e);
  process.exit(1);
});
