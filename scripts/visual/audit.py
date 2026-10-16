"""Responsive audit: loads every route at phone / tablet / desktop sizes and reports real defects.

  python3 scripts/visual/audit.py [--pages /dashboard,/feed] [--vps iphone,ipad] [--out /tmp/audit] [--theme light|dark]

Needs the harness server running (node scripts/visual/server.mjs) and `playwright` with Chromium.
"""
import argparse, asyncio, json, os, sys, time
from playwright.async_api import async_playwright

VIEWPORTS = {
    "android-s": dict(width=360, height=740, dsf=3, mobile=True),
    "iphone": dict(width=390, height=844, dsf=3, mobile=True),
    "iphone-land": dict(width=844, height=390, dsf=3, mobile=True),
    "ipad": dict(width=768, height=1024, dsf=2, mobile=True),
    "ipad-land": dict(width=1024, height=768, dsf=2, mobile=True),
    "laptop": dict(width=1280, height=800, dsf=1, mobile=False),
    "desktop": dict(width=1440, height=900, dsf=1, mobile=False),
}
PAGES = ["/", "/login", "/privacy", "/dashboard", "/lessons", "/lessons/ls_1", "/lessons/ls_1/edit", "/lessons/new",
         "/journal", "/practice", "/practice/weekly", "/lab", "/friends", "/calendar", "/roadmap", "/progress",
         "/settings", "/compare/fx_0", "/backtesting/create", "/backtesting/session", "/feed"]

AUDIT_JS = r"""
(coarse) => {
  const vw = document.documentElement.clientWidth, vh = innerHeight;
  const visible = (el) => { const r = el.getBoundingClientRect(); const s = getComputedStyle(el);
    return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none' && s.opacity !== '0'; };
  const desc = (el) => { const t = (el.getAttribute('aria-label') || el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 28);
    return el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') + (typeof el.className === 'string' && el.className ? '.' + el.className.split(/\s+/).slice(0, 2).join('.') : '') + (t ? ` “${t}”` : ''); };
  const inScrollX = (el) => { for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) { const o = getComputedStyle(p).overflowX; if ((o === 'auto' || o === 'scroll' || o === 'hidden' || o === 'clip') && p.scrollWidth > p.clientWidth + 1) return true; } return false; };
  const out = { vw, vh, scrollW: document.documentElement.scrollWidth, docH: document.documentElement.scrollHeight };
  out.hOverflow = out.scrollW - vw;
  out.overflowers = [];
  if (out.hOverflow > 1) {
    for (const el of document.querySelectorAll('body *')) {
      if (!visible(el) || inScrollX(el)) continue;
      const r = el.getBoundingClientRect();
      if (r.right > vw + 1 && getComputedStyle(el).position !== 'fixed') out.overflowers.push({ el: desc(el), right: Math.round(r.right) });
      if (out.overflowers.length >= 6) break;
    }
  }
  out.small = [];
  if (coarse) {
    const sel = 'a[href],button,[role=button],[role=tab],input:not([type=hidden]),select,textarea,summary,[tabindex]:not([tabindex="-1"])';
    for (const el of document.querySelectorAll(sel)) {
      if (!visible(el)) continue;
      if (el.closest('[aria-hidden="true"]')) continue;
      const r = el.getBoundingClientRect();
      // inline text links inside prose are exempt (WCAG 2.5.8 inline exception)
      const inline = el.tagName === 'A' && getComputedStyle(el).display === 'inline';
      if (inline) continue;
      if (Math.min(r.width, r.height) < 40) out.small.push({ el: desc(el), w: Math.round(r.width), h: Math.round(r.height) });
    }
  }
  out.tiny = [];
  const seen = new Set();
  for (const el of document.querySelectorAll('body *')) {
    if (el.children.length) continue;
    const t = (el.textContent || '').trim(); if (!t || !visible(el)) continue;
    const fs = parseFloat(getComputedStyle(el).fontSize);
    if (fs < 11) { const k = desc(el); if (!seen.has(k)) { seen.add(k); out.tiny.push({ el: k, fs }); } }
  }
  out.noAlt = [...document.querySelectorAll('img:not([alt])')].filter(visible).length;
  out.h1 = document.querySelectorAll('h1').length;
  out.main = !!document.querySelector('main');
  // content hidden behind the fixed bottom tab bar / sticky chrome at the end of the page
  const tab = document.querySelector('nav[aria-label=Primary].fixed.bottom-0, nav.fixed.bottom-0');
  out.tabbarH = tab && visible(tab) ? Math.round(tab.getBoundingClientRect().height) : 0;
  return out;
}
"""

BENIGN = ("supabase", "net::ERR_", "Failed to load resource", "mock_not_implemented", "favicon")

async def run_one(browser, base, route, vp, theme, outdir, sem):
    async with sem:
        v = VIEWPORTS[vp]
        ctx = await browser.new_context(viewport=dict(width=v["width"], height=v["height"]), device_scale_factor=1 if v["dsf"] > 2 else v["dsf"],
                                        is_mobile=v["mobile"], has_touch=v["mobile"], color_scheme=theme)
        await ctx.add_init_script(f"try{{localStorage.setItem('edgebook.theme','{theme}')}}catch(e){{}}")
        page = await ctx.new_page()
        errs = []
        page.on("pageerror", lambda e: errs.append(f"pageerror: {str(e)[:200]}"))
        page.on("console", lambda m: errs.append(f"console.{m.type}: {m.text[:200]}") if m.type == "error" and not any(b in m.text for b in BENIGN) else None)
        rec = dict(route=route, vp=vp, theme=theme)
        t0 = time.time()
        try:
            await page.goto(base + route, wait_until="load", timeout=30000)
            await page.wait_for_selector("#harness-ready", state="attached", timeout=15000)
            await page.wait_for_timeout(1800)
            rec["final"] = await page.evaluate("location.pathname + location.search")
            rec.update(await page.evaluate(AUDIT_JS, v["mobile"]))
            slug = (route.strip("/").replace("/", "_") or "home")
            await page.screenshot(path=f"{outdir}/{slug}__{vp}__{theme}.png", full_page=False)
        except Exception as e:
            rec["fatal"] = str(e)[:200]
        rec["errors"] = sorted(set(errs))[:6]
        rec["ms"] = int((time.time() - t0) * 1000)
        await ctx.close()
        return rec

async def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--base", default="http://localhost:4173")
    ap.add_argument("--pages", default=",".join(PAGES))
    ap.add_argument("--vps", default=",".join(VIEWPORTS))
    ap.add_argument("--theme", default="light")
    ap.add_argument("--out", default="/tmp/audit")
    ap.add_argument("--conc", type=int, default=5)
    a = ap.parse_args()
    os.makedirs(a.out, exist_ok=True)
    async with async_playwright() as pw:
        browser = await pw.chromium.launch(args=["--no-sandbox"])
        sem = asyncio.Semaphore(a.conc)
        jobs = [run_one(browser, a.base, r, vp, a.theme, a.out, sem) for r in a.pages.split(",") for vp in a.vps.split(",")]
        results = await asyncio.gather(*jobs)
        await browser.close()
    results.sort(key=lambda r: (r["route"], list(VIEWPORTS).index(r["vp"])))
    json.dump(results, open(f"{a.out}/results.json", "w"), indent=1)
    bad = 0
    for r in results:
        flags = []
        if r.get("fatal"): flags.append("FATAL " + r["fatal"])
        if r.get("hOverflow", 0) > 1: flags.append(f"h-overflow +{r['hOverflow']}px")
        if r.get("errors"): flags.append(f"{len(r['errors'])} console error(s)")
        if len(r.get("small", [])) > 0: flags.append(f"{len(r['small'])} small targets")
        if len(r.get("tiny", [])) > 0: flags.append(f"{len(r['tiny'])} tiny text")
        if flags: bad += 1
        print(f"{'✗' if flags else '✓'} {r['route']:<22}{r['vp']:<12} {', '.join(flags)}")
    print(f"\n{len(results)} runs, {bad} with findings → {a.out}/results.json")

asyncio.run(main())
