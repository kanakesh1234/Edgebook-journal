import puppeteer from "puppeteer-core";
const EXE = "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser";
const BASE = "http://localhost:3111";
const OUT = "/tmp/shots";
import { mkdirSync } from "fs";
mkdirSync(OUT, { recursive: true });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const browser = await puppeteer.launch({ executablePath: EXE, headless: true, args: ["--no-sandbox", "--force-color-profile=srgb"] });

  // Landing — desktop
  let page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 2 });
  await page.goto(BASE, { waitUntil: "load" });
  await sleep(2600);
  await page.screenshot({ path: `${OUT}/01-landing-hero.png` });
  await page.evaluate(() => document.querySelector("#features")?.scrollIntoView({ behavior: "instant", block: "start" }));
  await sleep(1400);
  await page.screenshot({ path: `${OUT}/02-landing-features.png` });
  await page.evaluate(() => document.querySelector("#journey")?.scrollIntoView({ behavior: "instant", block: "center" }));
  await sleep(1600);
  await page.screenshot({ path: `${OUT}/03-landing-journey.png` });
  await page.close();

  // App flow with demo data
  page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 2 });
  await page.goto(`${BASE}/login`, { waitUntil: "load" });
  await sleep(1500);
  await page.screenshot({ path: `${OUT}/04-login.png` });
  await page.evaluate(() => {
    const b = Array.from(document.querySelectorAll("button")).find((e) => (e.textContent ?? "").includes("Explore with demo data")) as HTMLElement;
    b?.click();
  });
  await sleep(3200);
  await page.screenshot({ path: `${OUT}/05-dashboard.png` });
  await page.evaluate(() => window.scrollBy({ top: 900, behavior: "instant" }));
  await sleep(1300);
  await page.screenshot({ path: `${OUT}/06-dashboard-charts.png` });

  await page.goto(`${BASE}/roadmap`, { waitUntil: "load" });
  await sleep(2800);
  await page.screenshot({ path: `${OUT}/07-roadmap.png` });

  await page.goto(`${BASE}/calendar`, { waitUntil: "load" });
  await sleep(1800);
  await page.screenshot({ path: `${OUT}/08-calendar.png` });

  await page.goto(`${BASE}/journal`, { waitUntil: "load" });
  await sleep(1800);
  await page.screenshot({ path: `${OUT}/09-journal.png` });

  // Detail modal
  await page.click("article");
  await sleep(1100);
  await page.screenshot({ path: `${OUT}/10-entry-detail.png` });
  await page.keyboard.press("Escape");
  await sleep(500);

  // New entry modal
  await page.evaluate(() => {
    const b = Array.from(document.querySelectorAll("aside button")).find((e) => (e.textContent ?? "").includes("Add trade")) as HTMLElement;
    b?.click();
  });
  await sleep(1000);
  await page.screenshot({ path: `${OUT}/11-new-entry.png` });
  await page.keyboard.press("Escape");

  await page.goto(`${BASE}/settings`, { waitUntil: "load" });
  await sleep(1200);
  await page.screenshot({ path: `${OUT}/12-settings.png` });

  // Mobile dashboard + roadmap
  const m = await browser.newPage();
  await m.setViewport({ width: 390, height: 844, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
  await m.goto(`${BASE}/login`, { waitUntil: "load" });
  await sleep(1200);
  await m.screenshot({ path: `${OUT}/13-mobile-login.png` });
  await m.goto(`${BASE}/dashboard`, { waitUntil: "load" });
  await sleep(2500);
  await m.screenshot({ path: `${OUT}/14-mobile-dashboard.png` });
  await m.goto(`${BASE}/calendar`, { waitUntil: "load" });
  await sleep(1500);
  await m.screenshot({ path: `${OUT}/15-mobile-calendar.png` });

  await browser.close();
  console.log("screenshots saved to", OUT);
})();
