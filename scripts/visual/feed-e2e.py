"""End-to-end checks of the Feed against the harness (real components, mock Drive).
   scripts/visual/run.sh python3 scripts/visual/feed-e2e.py
"""
import json, struct, sys, time, urllib.request, wave, io, os
from playwright.sync_api import sync_playwright, expect

BASE = "http://localhost:4173"
fails, passes = [], 0
def state(): return json.load(urllib.request.urlopen(BASE + "/__test/state"))
def reset(mode="rich"): urllib.request.urlopen(BASE + "/__test/reset?mode=" + mode).read()
def check(name, cond, extra=""):
    global passes
    if cond: passes += 1; print(f"  ✅ {name}")
    else: fails.append(name); print(f"  ❌ {name} {extra}")
def feed(): return state()["drive"]["settings"].get("feed") or {}

def wav_bytes():
    b = io.BytesIO()
    with wave.open(b, "wb") as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(8000)
        w.writeframes(b"".join(struct.pack("<h", int(8000 * ((i // 20) % 2 - .5))) for i in range(8000)))
    return b.getvalue()

def open_feed(pw, vp=(390, 844), mobile=True, init=None):
    br = pw.chromium.launch(args=["--no-sandbox"])
    ctx = br.new_context(viewport=dict(width=vp[0], height=vp[1]), is_mobile=mobile, has_touch=mobile, device_scale_factor=1)
    if init: ctx.add_init_script(init)
    pg = ctx.new_page()
    errs = []
    pg.on("pageerror", lambda e: errs.append(str(e)[:200]))
    pg.on("console", lambda m: errs.append(m.text[:200]) if m.type == "error" and "supabase" not in m.text.lower() and "Failed to load resource" not in m.text else None)
    pg.goto(BASE + "/feed"); pg.wait_for_selector("article.fd-card[data-active]", timeout=15000)
    return br, ctx, pg, errs

with sync_playwright() as pw:
    # ---------------------------------------------------------------- 1. loads & plays
    print("\n1. Loads, ranks, plays a replay")
    reset(); br, ctx, pg, errs = open_feed(pw)
    n = pg.locator("article.fd-card").count()
    check("feed has cards and ends with an end card", n >= 5 and pg.locator("article.fd-card").nth(n - 1).get_attribute("aria-label") == "You're all caught up", f"n={n}")
    check("no more than 21 cards (finite batch)", n <= 21)
    check("every card says why it is shown", all(pg.locator("article.fd-card").nth(i).locator(".fd-chip").count() for i in range(n - 1)))
    first = pg.locator("article.fd-card[data-active]")
    check("first card is a replayable trade with chart", first.locator("input[type=range]").count() == 1)
    pg.wait_for_selector("article[data-active] .fd-media canvas", timeout=15000)
    check("chart canvas rendered", True)
    slider = first.locator("input[type=range]")
    v0 = int(slider.input_value())
    check("replay does NOT autoplay by default", True)
    pg.wait_for_timeout(1600); check("…still paused after 1.6s", int(slider.input_value()) == v0)
    first.get_by_label("Play replay").click(); pg.wait_for_timeout(2200)
    v1 = int(slider.input_value()); check("pressing play advances the replay", v1 > v0, f"{v0}->{v1}")
    first.get_by_label("Pause replay").click(); pg.wait_for_timeout(300); v2 = int(slider.input_value()); pg.wait_for_timeout(900)
    check("pause holds position", int(slider.input_value()) == v2)
    first.get_by_label("Forward one bar").click(); check("step forward moves one bar", int(slider.input_value()) > v2)
    slider.evaluate("(el)=>{el.value=1000; el.dispatchEvent(new Event('input',{bubbles:true}))}"); pg.wait_for_timeout(250)
    check("scrubbing to the end shows the journal result", first.locator(".fd-live strong").inner_text().strip().startswith(("+", "−", "-", "$")) and "R" in first.locator(".fd-live strong").inner_text(), first.locator(".fd-live").inner_text())
    check("no console errors during playback", not errs, str(errs))

    # ---------------------------------------------------------------- 2. replay completion → progress → milestone
    print("\n2. Watching a replay to the end is counted once and earns a milestone")
    first.get_by_label("Restart replay").click(); first.get_by_label("Change speed", exact=False).click() if False else None
    for _ in range(2): first.get_by_label("Speed", exact=False).click()   # 1x → 2x → 4x
    first.get_by_label("Play replay").click()
    pg.wait_for_selector("text=First replay", timeout=20000)
    check("milestone toast 'First replay' appears", True)
    pg.wait_for_timeout(2300)
    f = feed(); key = first.get_attribute("data-key")
    check("replay saved to Drive progress", key in f.get("progress", {}).get("replays", []), str(f.get("progress")))
    check("milestone saved to Drive", "first-replay" in f.get("milestones", {}))

    # ---------------------------------------------------------------- 3. favorite + collection → Drive
    print("\n3. Favorite and collections persist to Drive")
    w0 = state()["driveWrites"]
    first.get_by_label("Add to favorites").click()
    check("heart toggles", first.get_by_label("Remove from favorites").count() == 1)
    pg.wait_for_timeout(300); check("write is debounced (not instant)", state()["driveWrites"] == w0)
    pg.wait_for_timeout(2200)
    check("favorite reached Drive", key in feed().get("favorites", []), str(feed()))
    first.get_by_label("Add to a collection").click()
    pg.get_by_role("dialog").wait_for()
    check("collection sheet opens", pg.get_by_role("dialog", name="Save to collection").count() == 1)
    D = pg.get_by_role("dialog"); D.get_by_label("New collection").fill("NY open"); D.get_by_role("button", name="Add", exact=True).click()
    pg.wait_for_timeout(2400)
    cols = feed().get("collections", [])
    check("collection with the card reached Drive", len(cols) == 1 and cols[0]["name"] == "NY open" and key in cols[0]["items"], str(cols))
    pg.keyboard.press("Escape")
    try: pg.get_by_role("dialog").wait_for(state="detached", timeout=3000); closed = True
    except Exception: closed = False
    check("Escape closes the sheet", closed)
    # duplicate name rejected
    first.get_by_label("Add to a collection").click(); D = pg.get_by_role("dialog"); D.get_by_label("New collection").fill("ny OPEN"); D.get_by_role("button", name="Add", exact=True).click()
    check("duplicate collection name is refused", D.get_by_role("alert").count() == 1 and len(feed().get("collections", [])) == 1)
    pg.keyboard.press("Escape"); pg.get_by_role("dialog").wait_for(state="detached", timeout=3000)

    # ---------------------------------------------------------------- 4. reload hydrates from Drive
    print("\n4. After a full reload everything comes back from Drive")
    pg.reload(); pg.wait_for_selector("article.fd-card[data-active]", timeout=15000)
    pg.get_by_role("tab", name="Saved").click(); pg.wait_for_timeout(500)
    check("Saved tab shows the favorited card", pg.locator("article.fd-card").count() == 1 and pg.locator("article.fd-card").first.get_attribute("data-key") == key)
    pg.get_by_role("tab", name="Collections").click(); pg.wait_for_timeout(300)
    check("Collections tab lists 'NY open' (1 item)", pg.get_by_role("button", name="NY open, 1 items", exact=False).count() + pg.get_by_role("button", name="NY open, 1 item", exact=False).count() >= 1)
    pg.get_by_role("button", name="NY open", exact=False).first.click(); pg.wait_for_timeout(500)
    check("opening a collection shows its card", pg.locator("article.fd-card").count() == 1)
    pg.get_by_label("Manage collection").click(); D = pg.get_by_role("dialog"); D.get_by_label("Name").fill("Mornings"); D.get_by_role("button", name="Save name").click(); pg.wait_for_timeout(2400)
    check("rename persisted to Drive", feed()["collections"][0]["name"] == "Mornings")
    pg.get_by_label("Manage collection").click(); D = pg.get_by_role("dialog"); D.get_by_role("button", name="Delete collection").click(); D.get_by_role("button", name="Tap again to delete").click(); pg.wait_for_timeout(2400)
    check("delete removes the collection but keeps the favorite", feed()["collections"] == [] and key in feed()["favorites"])
    pg.get_by_role("tab", name="Progress").click(); pg.wait_for_timeout(300)
    check("Progress panel shows milestones", "First replay" in pg.locator(".fd-panel").inner_text())
    ctx.close(); br.close()

    # ---------------------------------------------------------------- 5. keyboard + end card
    print("\n5. Keyboard navigation reaches the end card")
    reset(); br, ctx, pg, errs = open_feed(pw, (1440, 900), False)
    total = pg.locator("article.fd-card").count()
    for _ in range(total + 2): pg.keyboard.press("j"); pg.wait_for_timeout(420)
    check("J walks to the last card and stops", pg.locator("article.fd-card[data-active]").get_attribute("aria-label") == "You're all caught up")
    check("end card offers a way home (no 'load more')", pg.get_by_role("link", name="Back to Home").count() == 1 and pg.get_by_text("Load more", exact=False).count() == 0)
    pg.keyboard.press("k"); pg.wait_for_timeout(500); pg.keyboard.press("f")
    check("F favorites the active card", pg.locator("article.fd-card[data-active] [aria-pressed=true][data-heart]").count() == 1)
    check("desktop side panel is visible", pg.locator(".fd-side").is_visible())
    ctx.close(); br.close()

    # ---------------------------------------------------------------- 6. healthy session controls
    print("\n6. Healthy session controls")
    reset(); today = time.strftime("%Y-%m-%d")
    seed = f"try{{if(!sessionStorage.getItem('s')){{localStorage.setItem('edgebook.feed.session.v1', JSON.stringify({{day:'{today}',ms:{20*60000+5000},extraMin:0,extensions:0}}));sessionStorage.setItem('s','1')}}}}catch(e){{}}"
    br, ctx, pg, errs = open_feed(pw, init=seed)
    pg.get_by_role("dialog").wait_for(timeout=8000)
    check("break prompt appears at the daily limit", pg.get_by_role("dialog", name="Time for a short break?").count() == 1)
    check("prompt is a choice, not a lock (offers 5 more minutes)", pg.get_by_role("button", name="5 more minutes").count() == 1)
    pg.get_by_role("button", name="5 more minutes").click(); pg.wait_for_timeout(600)
    check("'5 more minutes' dismisses it", pg.get_by_role("dialog").count() == 0)
    saved = json.loads(pg.evaluate("localStorage.getItem('edgebook.feed.session.v1')"))
    check("extension recorded locally (extraMin=5, extensions=1)", saved["extraMin"] == 5 and saved["extensions"] == 1, str(saved))
    pg.get_by_label("Feed settings").click(); pg.get_by_role("radio", name="No limit").click(); pg.wait_for_timeout(2200)
    check("changing the limit persists to Drive", feed().get("prefs", {}).get("dailyMinutes") == 0, str(feed().get("prefs")))
    ctx.close(); br.close()

    # ---------------------------------------------------------------- 7. music gate
    print("\n7. Music: off by default, rights gate, device-only storage")
    reset(); br, ctx, pg, errs = open_feed(pw)
    pg.get_by_label("Feed settings").click(); pg.get_by_role("dialog").wait_for()
    check("music is OFF by default", pg.get_by_role("switch", name="Music during replays").get_attribute("aria-checked") == "false")
    check("autoplay is OFF by default", pg.get_by_role("switch", name="Autoplay replays").get_attribute("aria-checked") == "false")
    choose = pg.get_by_role("button", name="Choose audio file")
    check("'Choose audio file' is disabled until rights are confirmed", choose.is_disabled())
    check("copy states nothing is uploaded or bundled", "never uploaded" in pg.get_by_role("dialog").inner_text() and "doesn’t include any songs" in pg.get_by_role("dialog").inner_text())
    pg.get_by_role("checkbox").check(); check("ticking the box enables it", choose.is_enabled())
    pg.get_by_label("Licence or source note").fill("Own recording")
    pg.set_input_files("input[type=file]", files=[{"name": "my-telugu-track.wav", "mimeType": "audio/wav", "buffer": wav_bytes()}]); pg.wait_for_timeout(900)
    check("track appears in the list", pg.get_by_text("my-telugu-track").count() >= 1)
    check("track is stored in this browser (IndexedDB)", pg.evaluate("""async()=>{const r=await new Promise(res=>{const q=indexedDB.open('keyval-store');q.onsuccess=()=>{const t=q.result.transaction('keyval').objectStore('keyval').getAllKeys();t.onsuccess=()=>res(t.result)}});return r.filter(k=>String(k).startsWith('edgebook.feed.track'))}""") != [])
    pg.set_input_files("input[type=file]", files=[{"name": "notes.txt", "mimeType": "text/plain", "buffer": b"hello"}]); pg.wait_for_timeout(500)
    check("non-audio file is rejected with a reason", pg.locator("text=doesn't look like an audio file").count() + pg.locator("text=doesn’t look like an audio file").count() >= 1 or "audio" in pg.locator(".fd-toast, [role=status]").all_inner_texts().__str__().lower())
    pg.wait_for_timeout(2300)
    check("music preference + source saved to Drive; file bytes are NOT", "custom:" in feed().get("prefs", {}).get("music", {}).get("source", "") and "wav" not in json.dumps(state()["drive"]).lower().replace("my-telugu-track", ""))
    check("audio file name/bytes never sent to Drive", "my-telugu-track" not in json.dumps(state()["drive"]))
    ctx.close(); br.close()

print(f"\n{passes} passed, {len(fails)} failed")
if fails: print("FAILED:", *fails, sep="\n  - "); sys.exit(1)
