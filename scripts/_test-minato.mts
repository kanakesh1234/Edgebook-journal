import puppeteer from "puppeteer-core";
const EXE = "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser";
const browser = await puppeteer.launch({ executablePath: EXE, headless: true, args: ["--no-sandbox"] });
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 900 });

// Sign up
await page.goto("http://localhost:3000/login", { waitUntil: "networkidle0" });
await page.type("#email", "aitest@edgebook.test");
await page.type("#password", "aitest-password-1");
await page.evaluate(() => {
  const tabs = Array.from(document.querySelectorAll("button[role=tab]"));
  (tabs.find(t => t.textContent?.includes("Create account")) as HTMLElement)?.click();
});
await new Promise(r => setTimeout(r, 400));
await page.type("#name", "AI Tester");
await page.click("button[type=submit]");
await page.waitForFunction(() => location.pathname === "/dashboard", { timeout: 20000 });
await new Promise(r => setTimeout(r, 600));

// Load demo data
await page.evaluate(() => {
  const btns = Array.from(document.querySelectorAll("button"));
  (btns.find(b => b.textContent?.includes("Load demo data")) as HTMLElement)?.click();
});
await new Promise(r => setTimeout(r, 2000));

// Get cookies for API calls
const cookies = await page.cookies();
const cookieStr = cookies.map(c => `${c.name}=${c.value}`).join("; ");

// Test MINATO chat — hold time question
console.log("=== Hold time question:");
const hRes = await fetch("http://localhost:3000/api/minato/chat", {
  method: "POST",
  headers: { "Content-Type": "application/json", Cookie: cookieStr },
  body: JSON.stringify({ messages: [{ role: "user", text: "What is my average winning trade hold time?" }] }),
});
const hJson = await hRes.json() as { text: string; meta: { deterministic: boolean; provider: string } };
console.log(`  provider: ${hJson.meta.provider} | deterministic: ${hJson.meta.deterministic}`);
console.log(`  text: ${hJson.text.slice(0, 200)}`);

// Test MINATO chat — pattern question
console.log("\n=== Pattern question:");
const pRes = await fetch("http://localhost:3000/api/minato/chat", {
  method: "POST",
  headers: { "Content-Type": "application/json", Cookie: cookieStr },
  body: JSON.stringify({ messages: [{ role: "user", text: "What patterns do you see in my trading?" }] }),
});
const pJson = await pRes.json() as { text: string; meta: { deterministic: boolean; provider: string } };
console.log(`  provider: ${pJson.meta.provider} | deterministic: ${pJson.meta.deterministic}`);
console.log(`  text: ${pJson.text.slice(0, 200)}`);

// Test MINATO chat — open-ended (LLM should render)
console.log("\n=== Open-ended question (LLM should respond):");
const oRes = await fetch("http://localhost:3000/api/minato/chat", {
  method: "POST",
  headers: { "Content-Type": "application/json", Cookie: cookieStr },
  body: JSON.stringify({ messages: [{ role: "user", text: "Bro, how am I doing overall? Give me the honest picture." }] }),
});
const oJson = await oRes.json() as { text: string; meta: { deterministic: boolean; provider: string } };
console.log(`  provider: ${oJson.meta.provider} | deterministic: ${oJson.meta.deterministic}`);
console.log(`  text: ${oJson.text.slice(0, 300)}`);

// Test time window question
console.log("\n=== Time window question:");
const tRes = await fetch("http://localhost:3000/api/minato/chat", {
  method: "POST",
  headers: { "Content-Type": "application/json", Cookie: cookieStr },
  body: JSON.stringify({ messages: [{ role: "user", text: "What time do I perform best?" }] }),
});
const tJson = await tRes.json() as { text: string; meta: { deterministic: boolean; provider: string } };
console.log(`  provider: ${tJson.meta.provider} | deterministic: ${tJson.meta.deterministic}`);
console.log(`  text: ${tJson.text.slice(0, 200)}`);

await browser.close();
