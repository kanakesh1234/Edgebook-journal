import puppeteer from "puppeteer-core";
const EXE = "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser";
const BASE = "http://localhost:3111";
const browser = await puppeteer.launch({ executablePath: EXE, headless: true, args: ["--no-sandbox"] });
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 1000, deviceScaleFactor: 2 });

await page.goto(`${BASE}/login`, { waitUntil: "networkidle0" });
await page.evaluate(() => { localStorage.setItem("edgebook.theme", "light"); });
await page.reload({ waitUntil: "networkidle0" });
await page.type("#email", "m6@edgebook.test");
await page.type("#password", "m6-password-1");
await page.evaluate(() => {
  const tabs = Array.from(document.querySelectorAll("button[role=tab]"));
  (tabs.find(t => t.textContent?.includes("Create account")) as HTMLElement)?.click();
});
await new Promise(r => setTimeout(r, 400));
await page.type("#name", "Minato Trader");
await page.click("button[type=submit]");
await page.waitForFunction(() => location.pathname === "/dashboard", { timeout: 15000 });
await new Promise(r => setTimeout(r, 800));
await page.evaluate(() => {
  const btns = Array.from(document.querySelectorAll("button"));
  (btns.find(b => b.textContent?.includes("Load demo data")) as HTMLElement)?.click();
});
await new Promise(r => setTimeout(r, 2500));

// 1. MINATO closed state (dashboard corner)
await page.screenshot({ path: "/tmp/eb-minato-idle.png", clip: { x: 1040, y: 620, width: 400, height: 380 } });

// 2. Open panel
await page.click('button[aria-label*="MINATO"]');
await new Promise(r => setTimeout(r, 900));
await page.screenshot({ path: "/tmp/eb-minato-open.png", clip: { x: 1000, y: 300, width: 440, height: 700 } });

// 3. Ask a question
await page.evaluate(() => {
  const btns = Array.from(document.querySelectorAll("button"));
  (btns.find(b => b.textContent?.trim() === "Review my last trade") as HTMLElement)?.click();
});
await new Promise(r => setTimeout(r, 700));
await page.screenshot({ path: "/tmp/eb-minato-review.png", clip: { x: 1000, y: 300, width: 440, height: 700 } });
await page.keyboard.press("Escape");
await page.evaluate(() => {
  const btns = Array.from(document.querySelectorAll("button"));
  (btns.find(b => b.getAttribute("aria-label")?.includes("Close MINATO")) as HTMLElement)?.click();
});

// 4. Playbook: add a setup
await page.goto(`${BASE}/lab`, { waitUntil: "networkidle0" });
await new Promise(r => setTimeout(r, 800));
await page.evaluate(() => {
  const btns = Array.from(document.querySelectorAll("button"));
  (btns.find(b => b.textContent?.includes("Add setup")) as HTMLElement)?.click();
});
await new Promise(r => setTimeout(r, 600));
await page.type("#pb-name", "Liquidity Sweep + SMT");
await page.type("#pb-strategy", "Sweep of prior session liquidity, SMT divergence confirms the reversal.");
await page.type("#pb-entry", "After 9:30 AM New York\nWait for liquidity sweep\nWait for SMT divergence\nEnter after confirmation");
await page.type("#pb-invalidation", "Reclaims the swept level mid, or no displacement after confirmation");
await page.type("#pb-exit", "Target opposing PD array / liquidity level. Stop beyond the sweep wick.");
await page.type("#pb-minrr", "2");
await page.evaluate(() => {
  const chips = Array.from(document.querySelectorAll("button"));
  (chips.find(c => c.textContent?.trim() === "NY open") as HTMLElement)?.click();
  (chips.find(c => c.textContent?.trim() === "London") as HTMLElement)?.click();
});
await new Promise(r => setTimeout(r, 300));
const dlg = await page.$('[role="dialog"]');
if (dlg) { await dlg.screenshot({ path: "/tmp/eb-playbook-edit.png" }); console.log("saved playbook editor"); }
await page.evaluate(() => {
  const btns = Array.from(document.querySelectorAll("button"));
  (btns.find(b => b.textContent?.includes("Add to playbook")) as HTMLElement)?.click();
});
await new Promise(r => setTimeout(r, 800));
await page.screenshot({ path: "/tmp/eb-playbook.png", clip: { x: 0, y: 0, width: 1440, height: 900 } });
console.log("saved playbook");

await browser.close();
