#!/usr/bin/env node
// tools/test-arcade-page.js — end-to-end test for the Daniel's Arcade hub page.
//
//   cd arcade && npm install && node tools/test-arcade-page.js     (or: npm test)
//
// Loads index.html + arcade-shop.js into jsdom and drives the real DOM with a fake clock
// (Date + setTimeout/setInterval are replaced, so days and the 1-second play timer are under
// the test's control), a stubbed fetch for the Nullp endpoints (/api/arcade/*) and a stubbed
// window.open. Covers: boot + grid + filters + #play route, the play timer (focus, visibility,
// idle, coin rate, daily cap, coin speed), the shop (every tab, buy/use, +5% prices, abilities,
// FREE / secret items, Free Shop, Infinite Coins, 3-slot logic, no trade tab), codes, the quest
// chain, every Admin Panel action, the free stuff (daily, spin, milestones, F2P, Champion),
// bug reports, the accounts client and the game skins.
// The last line is "ARCADE PAGE PASS" or "ARCADE PAGE FAIL (n)"; exit code is nonzero on failure.
"use strict";
process.env.TZ = "UTC"; // day keys are local dates: make "local" predictable
const fs = require("fs");
const path = require("path");
let JSDOM, VirtualConsole;
try { ({ JSDOM, VirtualConsole } = require("jsdom")); }
catch (e) {
  console.error("jsdom not found. Run `npm install` in arcade/.");
  console.log("ARCADE PAGE FAIL (1)");
  process.exit(2);
}

const R = path.resolve(__dirname, "..");
const HTML = fs.readFileSync(path.join(R, "index.html"), "utf8");
const SHOP_JS = fs.readFileSync(path.join(R, "arcade-shop.js"), "utf8");
const KEY = "daniels-arcade-v1", SKINS_KEY = "daniels-arcade-skins", ACC_KEY = "daniels-arcade-account", BUGS_KEY = "daniels-arcade-bugs";
const INF = 999999999;
const DAY = 86400000;
const T0 = Date.UTC(2026, 9, 17, 10, 0, 0); // Sat 17 Oct 2026, 10:00
const DEFAULT_OWNED = ["galaxy", "smile", "rookie", "gun-none", "ab-none", "bg-none"];
const SLUGS = ["monster-city", "rebuild", "shooting-game", "Pocket-Dice", "english-program"];
const HOOK = "window.__hook = { DISCORD, GAMES, get save() { return save; }, " +
  "get discordStatus() { return discordStatus; }, set discordStatus(v) { discordStatus = v; } };";

let pass = 0, fail = 0, section = "";
const ok = (name, cond) => { if (cond) pass++; else { fail++; console.log(`  FAIL [${section}] ${name}`); } };
let tSect = Date.now();
const sect = (s) => { section = s; console.log(`- ${s}  (+${Date.now() - tSect} ms)`); tSect = Date.now(); };
const dk = (ms) => { const d = new Date(ms); return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`; };
const bump = (n) => (n > 0 ? Math.max(1, Math.round(n * 1.05)) : 0);
const flush = async (n = 6) => { for (let i = 0; i < n; i++) await new Promise((res) => setImmediate(res)); };

// ------------------------------------------------------------------ harness
function defaultFetch(url, init) {
  if (url.startsWith("/api/arcade/discord")) return { status: 200, data: { valid: null, expiresAt: null } };
  if (url === "/api/arcade/save") return { status: 200, data: { ok: true, savedAt: 1 } };
  return { status: 404, data: { error: "Not found." } };
}

function boot(opts = {}) {
  const st = {
    now: opts.now ?? T0, hidden: false, focus: true, timers: [], nextId: 1,
    opened: [], reloads: 0, fetches: [], fetchImpl: opts.fetch || defaultFetch, rand: [],
  };
  let html = HTML;
  const tag = '<script src="arcade-shop.js"></script>';
  if (!html.includes(tag)) throw new Error("arcade-shop.js <script> tag missing from index.html");
  html = html.replace(tag, () => "<script>" + SHOP_JS + "</script>");
  html = html.replace(/<script defer src="nullp-widget\.js"[^>]*><\/script>/, "");
  if (!html.includes("  route();\n</script>")) throw new Error("route();</script> marker missing — update the hook in tools/test-arcade-page.js");
  html = html.replace("  route();\n</script>", () => "  route();\n" + HOOK + "\n</script>");
  const errs = [];
  const vc = new VirtualConsole();
  vc.on("jsdomError", (e) => {
    const m = String((e && e.message) || e);
    if (/Not implemented: navigation/.test(m)) st.reloads++; // location.reload()
    else errs.push(m);
  });
  vc.on("error", (e) => errs.push(String(e)));
  const dom = new JSDOM(html, {
    url: opts.url || "http://localhost:4173/games/arcade/" + (opts.hash || ""),
    runScripts: "dangerously", virtualConsole: vc,
    beforeParse(w) {
      // Fake clock.
      const RD = w.Date;
      class FakeDate extends RD {
        constructor(...a) { if (a.length) super(...a); else super(st.now); }
        static now() { return st.now; }
      }
      w.Date = FakeDate;
      const add = (fn, ms, every, args) => {
        const t = { id: st.nextId++, at: st.now + Math.max(every ? 1 : 0, +ms || 0), ms: Math.max(1, +ms || 0), every, fn, args };
        st.timers.push(t); return t.id;
      };
      const clear = (id) => { st.timers = st.timers.filter((t) => t.id !== id); };
      w.setTimeout = (fn, ms, ...args) => add(fn, ms, false, args);
      w.setInterval = (fn, ms, ...args) => add(fn, ms, true, args);
      w.clearTimeout = clear; w.clearInterval = clear;
      // Window state.
      w.open = (...a) => { st.opened.push(a); return null; };
      Object.defineProperty(w.document, "hidden", { get: () => st.hidden, configurable: true });
      w.document.hasFocus = () => st.focus;
      const rnd = w.Math.random;
      w.Math.random = () => (st.rand.length ? st.rand.shift() : rnd());
      w.TextEncoder = TextEncoder;
      w.fetch = (url, init = {}) => {
        const call = { url: String(url), method: init.method || "GET", headers: init.headers || {}, keepalive: !!init.keepalive, body: init.body ? JSON.parse(init.body) : undefined };
        st.fetches.push(call);
        // Like a real browser: a keepalive request may not carry more than 64 KB.
        if (init.keepalive && init.body && Buffer.byteLength(init.body) > 65536) return Promise.reject(new TypeError("Failed to fetch"));
        let res;
        try { res = st.fetchImpl(call.url, call); } catch (e) { return Promise.reject(e); }
        if (res instanceof Error) return Promise.reject(res);
        return Promise.resolve({ ok: res.status >= 200 && res.status < 300, status: res.status, json: () => Promise.resolve(res.data) });
      };
      for (const [k, v] of Object.entries(opts.seed || {})) w.localStorage.setItem(k, typeof v === "string" ? v : JSON.stringify(v));
    },
  });
  const w = dom.window, d = w.document;
  // Advance the fake clock by `sec` seconds, running every timer that comes due, in order.
  const adv = (sec) => {
    const target = st.now + Math.round(sec * 1000);
    for (;;) {
      let next = null;
      for (const t of st.timers) if (t.at <= target && (!next || t.at < next.at || (t.at === next.at && t.id < next.id))) next = t;
      if (!next) break;
      st.now = next.at;
      if (next.every) next.at += next.ms; else st.timers = st.timers.filter((t) => t !== next);
      try { if (typeof next.fn === "function") next.fn(...next.args); } catch (e) { errs.push("timer: " + (e && e.stack || e)); }
    }
    st.now = target;
  };
  const $ = (s) => d.querySelector(s), $$ = (s) => [...d.querySelectorAll(s)];
  const id = (x) => d.getElementById(x);
  const save = () => JSON.parse(w.localStorage.getItem(KEY) || "{}");
  const setSave = (fn) => { const s = save(); fn(s); w.localStorage.setItem(KEY, JSON.stringify(s)); };
  const go = (hash) => { w.location.hash = hash; adv(0); };
  const input = (type = "keydown") => w.dispatchEvent(new w.Event(type));
  const openShop = () => { $("[data-open-shop]").click(); };
  const tabs = () => $$(".as-tabs button").map((b) => b.textContent);
  const tab = (name) => { const b = $$(".as-tabs button").find((x) => x.textContent === name); if (b) b.click(); return !!b; };
  const item = (itemName) => $$(".as-item").find((x) => x.querySelector("b").textContent === itemName);
  const itemBtn = (itemName) => { const i = item(itemName); return i && i.querySelector("button"); };
  const toast = () => id("toast").textContent;
  const shopToast = () => ($(".as-toast") || {}).textContent || "";
  const dump = () => { const o = {}; for (let i = 0; i < w.localStorage.length; i++) { const k = w.localStorage.key(i); o[k] = w.localStorage.getItem(k); } return o; };
  const type = (el, v) => { el.value = v; el.dispatchEvent(new w.Event("input", { bubbles: true })); };
  const submit = (form) => form.dispatchEvent(new w.Event("submit", { bubbles: true, cancelable: true }));
  // Jump the clock (e.g. to tomorrow) without replaying every timer tick in between.
  const jump = (ms) => { st.now += ms; for (const t of st.timers) t.at += ms; };
  const r = { dom, w, d, st, errs, H: w.__hook, S: w.ArcadeShop, adv, jump, $, $$, id, save, setSave, go, input, openShop, tabs, tab, item, itemBtn, toast, shopToast, dump, type, submit };
  r.reboot = (o = {}) => boot({ fetch: st.fetchImpl, now: st.now, ...o, seed: dump() });
  return r;
}
const S0 = boot().S; // catalog reference
const ALL = Object.values(S0.SHOP).flat();
const CODE_LIST = Object.keys(S0.CODES);
const withDefaults = (s) => ({ owned: [...DEFAULT_OWNED], ...s });

// A save that satisfies all 8 Hard Quest tasks (bug and Discord can be left out).
function hardSave({ bug = true, discord = true } = {}) {
  const ab = {};
  S0.ABILITIES.filter((a) => !a.secret).slice(0, 8).forEach((a, i) => (ab[a.id] = i < 2 ? 5 : 1));
  return {
    coins: 0, total: 7200, perGame: Object.fromEntries(SLUGS.map((g) => [g, 600])),
    redeemed: CODE_LIST.slice(0, 20), abilities: ab,
    owned: [...DEFAULT_OWNED, ...ALL.filter((i) => i.price > 0).slice(0, 15).map((i) => i.id)],
    ...(bug ? { bugsReported: 1 } : {}), ...(discord ? { discordJoined: true } : {}),
  };
}

(async () => {
// ================================================================== 1. boot
sect("1. boot, grid, filters, play route");
let r = boot({ seed: { [KEY]: withDefaults({ coins: 5, owned: [...DEFAULT_OWNED, "gun-ruby"], equipped: { gun: "gun-ruby" } }) } });
ok("no load errors: " + r.errs.join(" | "), r.errs.length === 0);
ok("ArcadeShop + hook loaded", !!r.S && !!r.H);
ok("5 game cards", r.$$("#grid .card").length === 5);
ok("game count text", r.id("gameCount").textContent === "5 games");
ok("wallet shows 5", r.$("[data-coins]").textContent === "5");
ok("filters: All + every tag", JSON.stringify(r.$$("#filters button").map((b) => b.textContent)) ===
  JSON.stringify(["All", "Action", "Shooter", "Strategy", "Spelling", "Story", "3D", "Multiplayer", "Board", "Learning"]));
r.$$("#filters button").find((b) => b.textContent === "Multiplayer").click();
ok("Multiplayer filter -> Buckshot + Track Run", JSON.stringify(r.$$("#grid .card h2").map((h) => h.textContent)) === JSON.stringify(["Buckshot Roulette", "Track Run"]));
ok("filter button on + count", r.$("#filters .on").textContent === "Multiplayer" && r.id("gameCount").textContent === "2 games");
r.$$("#filters button").find((b) => b.textContent === "Learning").click();
ok("Learning filter -> 1 game (singular)", r.id("gameCount").textContent === "1 game");
r.$$("#filters button")[0].click();
ok("All -> 5 cards", r.$$("#grid .card").length === 5);
ok("card links go to #play/<slug>", JSON.stringify(r.$$("#grid .card").map((a) => a.getAttribute("href"))) === JSON.stringify(SLUGS.map((s) => "#play/" + s)));
ok("skins shared at boot", JSON.parse(r.w.localStorage.getItem(SKINS_KEY)).gun.id === "gun-ruby");
ok("not playing at boot", !r.d.body.classList.contains("playing"));
r.go("#play/rebuild");
const skinsParam = (src) => JSON.parse(new URL(src, "http://localhost:4173/games/arcade/").searchParams.get("arcadeSkins"));
let src = r.id("frame").getAttribute("src");
ok("play: body.playing + title", r.d.body.classList.contains("playing") && r.id("playTitle").textContent === "🧟 REBUILD");
ok("play: iframe src ../rebuild/?arcadeSkins= (" + src.slice(0, 40) + ")", src.startsWith("../rebuild/?arcadeSkins="));
ok("play: arcadeSkins carries the equipped gun", skinsParam(src).gun.id === "gun-ruby" && skinsParam(src).ability === null);
r.go("#play/shooting-game");
ok("switch game -> ../shooting-game/", r.id("frame").getAttribute("src").startsWith("../shooting-game/?arcadeSkins=") && r.id("playTitle").textContent.includes("Buckshot"));
r.go("#play/nope");
ok("unknown slug -> home", !r.d.body.classList.contains("playing") && r.id("frame").getAttribute("src") === "about:blank");
r.go("#play/monster-city");
r.id("back").click(); r.adv(0);
ok("◀ Arcade -> home", !r.d.body.classList.contains("playing") && r.id("frame").getAttribute("src") === "about:blank");
// 🎃 Halloween button (T0 is 17 Oct, so the event is on).
const hb = r.id("halloweenBtn");
ok("🎃 Halloween button shows during the event", hb && hb.style.display === "");
r.w.localStorage.setItem("monster_attack_candy", "7"); r.w.dispatchEvent(new r.w.Event("focus"));
ok("it shows Monster Attack!'s candy", /🍬7/.test(hb.textContent));
hb.click(); r.adv(0);
const hsrc = r.id("frame").getAttribute("src");
ok("clicking it opens Monster Attack! on its Halloween menu", r.d.body.classList.contains("playing") && hsrc.startsWith("../monster-city/?arcadeSkins=") && /&open=halloween$/.test(hsrc));
r.id("back").click(); r.adv(0);
r.go("#play/monster-city");
ok("a normal Monster Attack! visit does not jump to it", !/open=halloween/.test(r.id("frame").getAttribute("src")));
hb.click(); r.adv(0);
ok("and the button works while Monster Attack! is already open", /&open=halloween$/.test(r.id("frame").getAttribute("src")));
r.id("back").click(); r.adv(0);
r.w.localStorage.setItem("monster_attack_event_force", "off"); r.w.dispatchEvent(new r.w.Event("focus"));
ok("hidden when the event is off", hb.style.display === "none");
r.w.localStorage.removeItem("monster_attack_event_force"); r.w.localStorage.removeItem("monster_attack_candy"); r.w.dispatchEvent(new r.w.Event("focus"));
ok("🎃 the Halloween section shows during the event", r.d.body.classList.contains("halloween") && /Ends in \d+ days/.test(r.id("hwDays").textContent));
ok("🎃 bats and pumpkins drift around the page", r.$$(".spooky").length === 5);
// Pumpkin patch: once a day, 2-10 candy.
r.w.localStorage.removeItem("arcade_hw_patch"); r.w.localStorage.setItem("monster_attack_candy", "0"); r.w.localStorage.setItem("monster_attack_hw_earned_2026", "0");
r.w.dispatchEvent(new r.w.Event("focus"));
const pumpkins = r.$$("#hwPatch button");
ok("🎃 3 pumpkins to pick from", pumpkins.length === 3 && pumpkins.every((b) => !b.disabled));
pumpkins[1].click();
const gotC = +r.w.localStorage.getItem("monster_attack_candy");
ok("🎃 picking one gives 2-10 candy (" + gotC + ")", gotC >= 2 && gotC <= 10 && +r.w.localStorage.getItem("monster_attack_hw_earned_2026") === gotC && /candy/.test(r.id("hwPatchMsg").textContent));
ok("🎃 then the patch is done for today", r.$$("#hwPatch button").every((b) => b.disabled));
pumpkins[0].click();
ok("🎃 a second pick gives nothing", +r.w.localStorage.getItem("monster_attack_candy") === gotC);
ok("🎃 the section shows the candy and pass progress", r.id("hwCandy").textContent === "🍬 " + gotC && /Halloween Pass: tier \d+\/50/.test(r.id("hwPassText").textContent));
r.id("hwOpen").click(); r.adv(0);
ok("🎃 its button opens Monster Attack!'s Halloween menu", /&open=halloween$/.test(r.id("frame").getAttribute("src")));
r.id("back").click(); r.adv(0);
r.w.localStorage.setItem("monster_attack_event_force", "off"); r.w.dispatchEvent(new r.w.Event("focus"));
ok("🎃 the section hides after the event", !r.d.body.classList.contains("halloween"));
// 🎃 The Halloween Pass items are in the shop, secret (the pass gives them; they cannot be bought).
const hwItems = { Titles: ["hw-sweettooth", "hw-ghosthunter", "hw-night", "pumpkin"], Avatars: ["hw-ghost", "hw-vampire", "hw-pumpkinking"],
                  Backgrounds: ["bg-haunted-night", "bg-graveyard-fog", "bg-pumpkin-moon"], "Gun Skins": ["gun-jack-o-lantern"] };
ok("🎃 4 titles, 3 avatars, 3 backgrounds and a gun skin for the event, all secret",
   Object.entries(hwItems).every(([cat, ids]) => ids.every((id) => { const it = S0.SHOP[cat].find((i) => i.id === id); return it && it.secret && /Halloween Pass/.test(it.lockText); })));
ok("🎃 the avatars have faces and the backgrounds have colours",
   hwItems.Avatars.every((id) => S0.SHOP.Avatars.find((i) => i.id === id).emoji) && hwItems.Backgrounds.every((id) => S0.SHOP.Backgrounds.find((i) => i.id === id).skin.sky));
ok("🎃 the pass counts 50 tiers, 1000 candy for the last", /tier \d+\/50/.test(r.id("hwPassText").textContent));
r.w.localStorage.removeItem("monster_attack_event_force"); r.w.dispatchEvent(new r.w.Event("focus"));
ok("no errors after routing: " + r.errs.join(" | "), r.errs.length === 0);
r = boot({ hash: "#play/Pocket-Dice" });
ok("boot straight into #play/Pocket-Dice", r.d.body.classList.contains("playing") && r.id("frame").getAttribute("src").startsWith("../Pocket-Dice/?arcadeSkins="));
r = boot({ url: "file:///Users/x/Daniel-Projects/arcade/index.html#play/shooting-game" });
ok("file: -> ../shooting-game/public/index.html?arcadeSkins=", r.id("frame").getAttribute("src").startsWith("../shooting-game/public/index.html?arcadeSkins="));
r.go(""); r.id("accountBtn").click();
ok("file: accounts need Nullp (toast, no veil)", /Nullp/.test(r.toast()) && !r.id("accountVeil").classList.contains("open"));
r.w.arcadeSecret(); r.adv(0);
ok("file: no Discord fetch", r.st.fetches.length === 0);
ok("file: no errors: " + r.errs.join(" | "), r.errs.length === 0);

// ================================================================== 2. play timer
sect("2. play timer");
const SPC = 900; // seconds of play per coin (15 minutes)
ok("SECONDS_PER_COIN is 900 (15 min)", S0.SECONDS_PER_COIN === SPC);
ok("daily cap is 24", S0.CAPS.playPerDay === 24);
r = boot({ seed: { [KEY]: { coins: 0 } } });
// Play `sec` seconds with some input every minute (never idle).
const play = (sec) => { for (let i = 0; i < sec; i += 60) { r.input(); r.adv(Math.min(60, sec - i)); } };
r.adv(20);
ok("home: nothing counted", (r.save().total || 0) === 0);
r.go("#play/rebuild"); r.input();
r.adv(10);
let s = r.save();
ok("playing 10s -> total 10, perGame 10, progress 10", s.total === 10 && s.perGame.rebuild === 10 && s.progress === 10);
ok("paused badge hidden while counting", !r.id("paused").classList.contains("show"));
r.st.hidden = true; r.adv(5);
ok("hidden tab: not counted", r.save().total === 10);
ok("hidden tab: paused badge", r.id("paused").classList.contains("show") && r.id("paused").textContent === "⏸ timer paused");
r.st.hidden = false; r.st.focus = false; r.adv(5);
ok("unfocused window: not counted", r.save().total === 10);
r.st.focus = true; r.adv(5);
ok("visible + focused: counted again", r.save().total === 15);
r.input(); r.adv(310);
ok("idle after 5 min with no input (300 of 310 s count)", r.save().total === 315);
ok("idle badge text", r.id("paused").classList.contains("show") && /idle/.test(r.id("paused").textContent));
r.input("mousemove"); r.adv(5);
ok("mouse move ends idle", r.save().total === 320 && !r.id("paused").classList.contains("show"));
r.input("pointerdown"); r.adv(279);
r.input("wheel"); r.adv(300);
ok("899 s: no coin yet", r.save().coins === 0 && r.save().progress === 899);
r.input(); r.adv(1);
s = r.save();
ok("900 s -> 1 coin, progress 0, daily play 1", s.coins === 1 && s.progress === 0 && s.daily.play === 1 && s.daily.day === dk(r.st.now));
ok("coin toast says 15 minutes", r.toast() === "🪙 +1 coin! 15 minutes played");
// 🎃 Halloween (T0 = 17 Oct): the same 900 s of play also earned candy — 1 every 5 minutes.
ok("🎃 900 s of play -> 3 candy, in Monster Attack!'s keys", r.w.localStorage.getItem("monster_attack_candy") === "3"
   && r.w.localStorage.getItem("monster_attack_hw_earned_2026") === "3" && r.w.localStorage.getItem("arcade_hw_play") === "0");

ok("wallet: 1 coin, next coin in 15m", r.$("[data-coins]").textContent === "1" && r.$("[data-next]").textContent === "next coin in 15m");
play(450);
ok("half way: bar 50%, next coin in 8m", r.$("[data-bar]").style.width === "50%" && r.$("[data-next]").textContent === "next coin in 8m");
r.setSave((x) => { x.daily = { day: dk(r.st.now), play: 23, bugs: 0, trade: {} }; x.progress = SPC - 10; });
r.input(); r.adv(10);
ok("24th coin of the day", r.save().coins === 2 && r.save().daily.play === 24);
const t0 = r.save().total;
play(1000);
s = r.save();
ok("daily cap 24: no more coins, time still counts", s.coins === 2 && s.progress === 0 && s.daily.play === 24 && s.total === t0 + 1000 && s.perGame.rebuild === t0 + 1000);
ok("wallet says daily cap", r.$("[data-next]").textContent === "daily cap 24/24");
r.jump(DAY); play(SPC);
s = r.save();
ok("next day: coins again", s.coins === 3 && s.daily.play === 1 && s.daily.day === dk(r.st.now));
r.setSave((x) => { x.admin = { coinBoost: 5 }; x.progress = 0; });
play(SPC / 5 - 1);
ok("coin speed ×5: not yet at 179 s", r.save().coins === 3);
play(1);
ok("coin speed ×5: a coin every 180 s", r.save().coins === 4 && r.save().progress === 0);
r.setSave((x) => { x.admin = {}; });
const rb = r.save().perGame.rebuild;
r.go("#play/monster-city"); play(30);
s = r.save();
ok("perGame per slug", s.perGame["monster-city"] === 30 && s.perGame.rebuild === rb);
ok("bar width = progress", r.$("[data-bar]").style.width === (30 / SPC) * 100 + "%");
r.go(""); r.input(); r.adv(30);
ok("back home: stops counting", r.save().total === rb + 30);
ok("total time shown", r.id("totalTime").textContent === (rb + 30 >= 3600 ? `${Math.floor((rb + 30) / 3600)}h ` : "") + `${Math.floor(((rb + 30) % 3600) / 60)}m`);
r.setSave((x) => { x.admin = { infCoins: true }; x.coins = INF; });
r.go("#play/rebuild"); r.input(); r.adv(1);
ok("∞ wallet while playing", r.$("[data-coins]").textContent === "∞" && r.save().coins === INF);
ok("no errors: " + r.errs.join(" | "), r.errs.length === 0);

// ================================================================== 3. shop
sect("3. shop");
r = boot({ seed: { [KEY]: { coins: 1000 } } });
r.openShop();
const ARC_TABS = ["Themes", "Avatars", "Titles", "⚡ Abilities", "Gun Skins", "Ability Skins", "Backgrounds", "🎁 Codes"];
ok("arcade shop tabs (no trade tab)", JSON.stringify(r.tabs()) === JSON.stringify(ARC_TABS));
const expectBtn = (it, sv, slot) => {
  if (sv.equipped && sv.equipped[slot] === it.id) return "✓ Using";
  if ((sv.owned || DEFAULT_OWNED).includes(it.id)) return "Use";
  if (it.secret) return "🔒 Locked";
  return bump(it.price) === 0 ? "🆓 FREE" : "🪙 " + bump(it.price);
};
for (const t of ARC_TABS) {
  ok(`tab ${t} opens`, r.tab(t) && r.$(".as-tabs .on").textContent === t);
  if (S0.SHOP[t]) {
    const sv = { owned: DEFAULT_OWNED, equipped: { theme: "galaxy", avatar: "smile", title: "rookie", gun: "gun-none", ability: "ab-none", bg: "bg-none" } };
    ok(`${t}: one card per item`, r.$$(".as-item").length === S0.SHOP[t].length);
    const bad = S0.SHOP[t].filter((it) => r.itemBtn(it.name).textContent !== expectBtn(it, sv, S0.SLOT[t]));
    ok(`${t}: every button/price (+5%) right ${bad.map((b) => b.id + "=" + r.itemBtn(b.name).textContent).join(",")}`, bad.length === 0);
    ok(`${t}: secret items locked`, S0.SHOP[t].filter((i) => i.secret).every((i) => r.itemBtn(i.name).disabled));
    // Every locked item says how to get it — a real sentence, not just "Locked".
    const noHow = S0.SHOP[t].filter((i) => i.secret && !(sv.owned || DEFAULT_OWNED).includes(i.id)).filter((i) => {
      const card = r.itemBtn(i.name).closest(".as-item"), how = card && card.querySelector(".as-how");
      return !how || how.textContent.length < 30 || /secret — keep exploring/.test(how.textContent);
    });
    ok(`${t}: every locked item says how to get it ${noHow.map((i) => i.id).join(",")}`, noHow.length === 0);
  }
}
r.tab("⚡ Abilities");
ok("abilities: 3 games, 19 cards", r.$$(".as-items h3").length === 3 && r.$$(".as-ab").length === S0.ABILITIES.length);
ok("abilities: secret ones locked", r.$$(".as-ab").filter((c) => /SECRET/.test(c.textContent)).every((c) => c.querySelector("button").disabled && /🔒/.test(c.textContent)));
ok("bump: 10 -> 11, 2 -> 2, 30 -> 32, 1 -> 1", r.itemBtn && bump(10) === 11 && bump(2) === 2 && bump(30) === 32 && bump(1) === 1);
// buy one item per category
const buys = [["Themes", "Deep Ocean", "theme", "ocean", 2], ["Avatars", "Dragon", "avatar", "dragon", 8], ["Titles", "Arcade Legend", "title", "legend", 26],
  ["Gun Skins", "Rainbow", "gun", "gun-rainbow", 32], ["Ability Skins", "Phoenix", "ability", "ab-phoenix", 13], ["Backgrounds", "Golden Hour", "bg", "bg-golden-hour", 11]];
let coins = 1000;
for (const [t, name, slot, itemId, cost] of buys) {
  r.tab(t);
  r.itemBtn(name).click();
  coins -= cost;
  s = r.save();
  ok(`buy ${name}: -${cost}, owned, equipped`, s.coins === coins && s.owned.includes(itemId) && s.equipped[slot] === itemId);
  ok(`buy ${name}: shop + wallet update`, r.$(".as-coins").textContent === "🪙 " + coins && r.$("[data-coins]").textContent === String(coins) && r.itemBtn(name).textContent === "✓ Using");
}
ok("theme applied to the page", r.d.documentElement.style.getPropertyValue("--accent") === "#4ae3ff");
ok("avatar + title applied", r.$("[data-avatar]").textContent === "🐉" && r.$("[data-title]").textContent === "Arcade Legend");
ok("skins shared after buy", JSON.parse(r.w.localStorage.getItem(SKINS_KEY)).gun.id === "gun-rainbow" && JSON.parse(r.w.localStorage.getItem(SKINS_KEY)).bg.id === "bg-golden-hour");
r.tab("Themes"); r.itemBtn("Galaxy").click();
ok("Use: switches back, free", r.save().equipped.theme === "galaxy" && r.save().coins === coins);
r.itemBtn("Sunrise").click();
ok("FREE item: owned for 0", r.save().owned.includes("sunrise") && r.save().coins === coins);
r.itemBtn("👑 Owner Royal").click();
ok("secret theme can't be bought", !r.save().owned.includes("royal"));
r.setSave((x) => { x.coins = 1; }); r.tab("Gun Skins");
ok("too expensive -> disabled", r.itemBtn("Diamond").disabled);
r.itemBtn("Diamond").click();
ok("disabled buy does nothing", !r.save().owned.includes("gun-diamond") && r.save().coins === 1);
// abilities: Monster Attack! ×3, others ×1
r.setSave((x) => { x.coins = 500; });
r.tab("⚡ Abilities");
const abBtn = (name) => r.$$(".as-ab").find((c) => c.querySelector("b").textContent === name).querySelector("button");
const MC = [6, 13, 19, 25, 32], RB = [2, 4, 6, 8, 11];
let costsOk = true; coins = 500;
for (let lv = 0; lv < 5; lv++) {
  if (abBtn("Monster Hide").textContent !== (lv ? "Upgrade" : "Learn") + " 🪙 " + MC[lv]) costsOk = false;
  abBtn("Monster Hide").click(); coins -= MC[lv];
  if (r.save().abilities["monster-city:tough"] !== lv + 1 || r.save().coins !== coins) costsOk = false;
}
ok("Monster Attack! ability costs ×3 (+5%): 6 13 19 25 32", costsOk);
ok("level 5 -> MAX", abBtn("Monster Hide").textContent === "MAX" && abBtn("Monster Hide").disabled);
costsOk = true;
for (let lv = 0; lv < 5; lv++) {
  if (abBtn("Reinforced Walls").textContent !== (lv ? "Upgrade" : "Learn") + " 🪙 " + RB[lv]) costsOk = false;
  abBtn("Reinforced Walls").click(); coins -= RB[lv];
}
ok("REBUILD ability costs: 2 4 6 8 11", costsOk && r.save().coins === coins && r.save().abilities["rebuild:tough"] === 5);
ok("Buckshot ability first cost 2", abBtn("Lucky Charge").textContent === "Learn 🪙 2");
for (const n of ["Sharp Words", "Quick Hands", "Head Start"]) abBtn(n).click();
s = r.save();
ok("3-slot: first 3 learned are on, 4th is off", JSON.stringify(s.active.rebuild) === JSON.stringify(["rebuild:tough", "rebuild:power", "rebuild:swift"]));
ok("4th card says off", /off \(switch on/.test(abBtn("Head Start").closest(".as-ab").textContent) && /⚡ ON/.test(abBtn("Sharp Words").closest(".as-ab").textContent));
const AI = r.S.activeIds;
ok("activeIds: no list -> first 3 learned in catalog order",
  JSON.stringify(AI("rebuild", { abilities: { "rebuild:regen": 1, "rebuild:tough": 2, "rebuild:greed": 1, "rebuild:power": 1 } })) === JSON.stringify(["rebuild:tough", "rebuild:power", "rebuild:greed"]));
ok("activeIds: list drops unlearned + caps at 3",
  JSON.stringify(AI("rebuild", { abilities: { "rebuild:regen": 1, "rebuild:tough": 1, "rebuild:greed": 1, "rebuild:power": 1 }, active: { rebuild: ["rebuild:swift", "rebuild:regen", "rebuild:tough", "rebuild:greed", "rebuild:power"] } })) === JSON.stringify(["rebuild:regen", "rebuild:tough", "rebuild:greed"]));
ok("activeIds: empty list means none on", AI("rebuild", { abilities: { "rebuild:tough": 1 }, active: { rebuild: [] } }).length === 0);
ok("activeIds: other games untouched", AI("buckshot", s).length === 0);
// Free Shop
r.setSave((x) => { x.coins = 0; x.admin = { freeShop: true }; });
r.tab("Gun Skins");
ok("Free Shop: every unowned non-secret item is FREE", S0.SHOP["Gun Skins"].filter((i) => !i.secret && !r.save().owned.includes(i.id)).every((i) => r.itemBtn(i.name).textContent === "🆓 FREE"));
ok("Free Shop: secret still locked", r.itemBtn("Code Breaker").disabled);
r.itemBtn("Diamond").click();
ok("Free Shop: buy Diamond with 0 coins", r.save().owned.includes("gun-diamond") && r.save().coins === 0);
r.tab("⚡ Abilities");
ok("Free Shop: abilities cost 0", abBtn("Lucky Charge").textContent === "Learn 🪙 0" && !abBtn("Lucky Charge").disabled);
abBtn("Lucky Charge").click();
ok("Free Shop: learned for free", r.save().abilities["buckshot:tough"] === 1 && r.save().coins === 0);
// Infinite Coins
r.setSave((x) => { x.admin = { infCoins: true }; x.coins = INF; });
r.tab("Avatars");
ok("∞ shown in shop", r.$(".as-coins").textContent === "🪙 ∞");
r.itemBtn("King").click();
ok("∞: King bought, wallet never drops", r.save().owned.includes("crown") && r.save().coins === INF);
ok("∞ shown on the page", r.$("[data-coins]").textContent === "∞");
r.$(".as-x").click();
ok("✕ closes the shop", !r.$(".as-veil"));
ok("no errors: " + r.errs.join(" | "), r.errs.length === 0);

// ================================================================== 4. codes
sect("4. codes");
ok("30 codes", CODE_LIST.length === 30);
r = boot({ seed: { [KEY]: { coins: 0 } } });
r.openShop(); r.tab("🎁 Codes");
const redeemUI = (code) => { r.$("[data-code]").value = code; r.$("[data-redeem]").click(); return r.$(".as-code .msg").textContent; };
ok("empty code", redeemUI("") === "Type a code first.");
ok("wrong code", /isn't a code/.test(redeemUI("nope")));
ok(" arcade 1 (lower case + spaces) works", /ARCADE1: \+🪙 1/.test(redeemUI(" arcade 1 ")) && r.save().coins === 1);
ok("same code again refused", /already used/.test(redeemUI("ARCADE1")) && r.save().coins === 1);
ok("found counter", r.$(".as-code .found").textContent === "1 / 30 codes found");
r.$("[data-code]").value = "double";
r.$("[data-code]").dispatchEvent(new r.w.KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
ok("Enter redeems", r.save().coins === 3 && r.save().redeemed.includes("DOUBLE"));
ok("wallet updated by onChange", r.$("[data-coins]").textContent === "3");
let rewardMsgs = 0;
CODE_LIST.filter((c) => !["ARCADE1", "DOUBLE"].includes(c)).forEach((c, i) => {
  const msg = redeemUI(i % 2 ? c.toLowerCase().split("").join(" ") : c);
  if (/ALL 30 CODES FOUND/.test(msg)) rewardMsgs++;
  if (i < 27 && r.save().secretReward) rewardMsgs += 10;
});
s = r.save();
ok("all 30: 45 code coins + 10 bonus", s.coins === 55);
ok("all 30: reward exactly once, on the 30th", rewardMsgs === 1 && s.secretReward === true);
ok("all 30: Secret Agent pack owned", S0.SECRET_ITEMS.every((x) => s.owned.includes(x)));
ok("all 30: secret abilities level 1", S0.ABILITIES.filter((a) => a.secret).every((a) => s.abilities[a.id] === 1));
ok("all 30: counter 30 / 30", r.$(".as-code .found").textContent === "30 / 30 codes found");
r.setSave((x) => { x.redeemed = []; });
CODE_LIST.forEach((c) => redeemUI(c));
ok("codes reset + all again: no second reward", r.save().coins === 100 && !/ALL 30/.test(r.$(".as-code .msg").textContent));
r.tab("Gun Skins");
ok("Code Breaker now usable", r.itemBtn("Code Breaker").textContent === "Use");
r.tab("🎁 Codes");
ok("secret corner present in the arcade", !!r.$("[data-secret]"));
r.$("[data-secret]").click();
ok("secret corner closes the shop, opens the quests", !r.$(".as-veil") && r.id("questVeil").classList.contains("open"));
r.S.open();
ok("arcade's default shop has the Codes tab", r.tabs().includes("🎁 Codes"));
r.S.close();
{ // A game's shop (setGame) never has codes or the corner.
  const g = new JSDOM(`<!DOCTYPE html><body><script>${SHOP_JS}</script></body>`, { runScripts: "dangerously", url: "http://localhost/" });
  const GS = g.window.ArcadeShop; GS.setGame("rebuild"); GS.open({ tab: "🎁 Codes" });
  const gt = [...g.window.document.querySelectorAll(".as-tabs button")].map((b) => b.textContent);
  ok("game shop: no Codes tab, no corner " + gt.join(","), !gt.includes("🎁 Codes") && !g.window.document.querySelector("[data-secret]"));
  g.window.close();
}
ok("no errors: " + r.errs.join(" | "), r.errs.length === 0);

// ================================================================== 5. quests
sect("5. quest chain");
const rows = (box) => r.$$(`#${box} .task`);
const doneRows = (box) => r.$$(`#${box} .task.done`).length;
r = boot({ seed: { [KEY]: hardSave({ bug: false, discord: false }) } });
r.openShop(); r.tab("🎁 Codes"); r.$("[data-secret]").click();
ok("hard: 8 tasks (7 + Discord)", rows("questTasks").length === 8);
ok("hard: 6 done, claim disabled", doneRows("questTasks") === 6 && r.id("questClaim").disabled);
ok("hard: Discord box shown, no code input", !r.id("discordBox").hidden && r.id("discordCode").hidden && r.id("discordCheck").hidden);
ok("discord status asked", r.st.fetches.some((f) => f.url === "/api/arcade/discord?invite=" + encodeURIComponent(r.H.DISCORD.invite)));
r.id("discordJoin").click();
ok("Discord (no code): opens invite, task done", r.st.opened.length === 1 && r.st.opened[0][0] === r.H.DISCORD.invite && r.save().discordJoined === true);
ok("Discord box hides once joined", r.id("discordBox").hidden && doneRows("questTasks") === 7);
r.id("bugBtn").click();
r.id("bugText").value = "The coin bar is stuck sometimes";
r.submit(r.id("bugForm"));
r.w.arcadeSecret();
ok("bug report counts for the quest -> claim enabled", doneRows("questTasks") === 8 && !r.id("questClaim").disabled);
r.id("questClaim").click();
s = r.save();
ok("hard done: tasks fold away", s.hardDone === true && r.id("questTasks").hidden && r.id("questClaim").hidden && r.id("discordBox").hidden);
ok("medium locked without the Astral secret", /Locked/.test(r.id("mediumBox").textContent));
ok("easy locked", /Finish the Medium Quests first/.test(r.id("easyBox").textContent));
ok("admin not unlocked", !s.adminUnlocked && r.id("questAdmin").hidden);
// Discord with a code + expired invite
r = boot({ seed: { [KEY]: hardSave({ discord: false }) } });
r.H.DISCORD.code = "Arch Ade";
r.w.arcadeSecret(); await flush();
ok("code mode: input + Check visible, task name mentions code", !r.id("discordCode").hidden && /code/.test(rows("questTasks")[7].textContent));
r.id("discordJoin").click();
ok("code mode: join opens invite but doesn't count", r.st.opened.length === 1 && !r.save().discordJoined && /code/.test(r.toast()));
r.id("discordCode").value = "nope"; r.id("discordCheck").click();
ok("wrong Discord code refused", !r.save().discordJoined && /not the Discord code/.test(r.toast()));
r.id("discordCode").value = " arch ade "; r.id("discordCode").dispatchEvent(new r.w.KeyboardEvent("keydown", { key: "Enter" }));
ok("right code (case/space-insensitive, Enter) counts", r.save().discordJoined === true && !r.id("questClaim").disabled);
r = boot({ seed: { [KEY]: hardSave({ discord: false }) }, fetch: (u) => (u.startsWith("/api/arcade/discord") ? { status: 200, data: { valid: false, expiresAt: null } } : defaultFetch(u)) });
r.w.arcadeSecret(); await flush();
ok("expired invite: button disabled", r.id("discordJoin").disabled && /expired/.test(r.id("discordJoin").textContent));
r.id("discordJoin").onclick();
ok("expired invite: no window.open, not joined", r.st.opened.length === 0 && !r.save().discordJoined);
// Medium
r = boot({ seed: { [KEY]: { ...hardSave(), mediumUnlocked: true } } });
r.w.arcadeSecret();
ok("medium found but hard not done -> finish Hard first", /Finish the Hard Quest first/.test(r.id("mediumBox").textContent));
const mediumOk = (x) => {
  Object.assign(x.perGame, { "monster-city": 1800, rebuild: 1200, "shooting-game": 1200 });
  x.owned.push("gun-ruby", "ab-spark", "bg-clear-sky");
  x.equipped = { ...(x.equipped || {}), gun: "gun-ruby", ability: "ab-spark", bg: "bg-clear-sky" };
  x.active = { rebuild: ["rebuild:tough", "rebuild:power", "rebuild:swift"] };
  Object.assign(x.abilities, { "rebuild:tough": 1, "rebuild:power": 1, "rebuild:swift": 1 });
  x.stats = { trades: 5 };
};
r = boot({ seed: { [KEY]: { ...hardSave(), hardDone: true, mediumUnlocked: true, coins: 0 } } });
r.w.arcadeSecret();
ok("medium: 6 tasks, claim disabled", rows("mediumBox").length === 6 && r.id("mediumClaim").disabled);
r.setSave(mediumOk); r.w.arcadeSecret();
ok("medium: all done -> claim enabled", doneRows("mediumBox") === 6 && !r.id("mediumClaim").disabled);
r.id("mediumClaim").click();
s = r.save();
ok("medium reward: 15 coins, Astral title + avatar", s.mediumDone && s.coins === 15 && s.owned.includes("astral") && s.owned.includes("oracle") && s.equipped.title === "astral" && s.equipped.avatar === "oracle");
ok("medium reward shown", r.$("[data-title]").textContent === "🔮 Astral Seeker" && r.$("[data-avatar]").textContent === "🔮");
r.id("mediumClaim").onclick();
ok("medium claim only once", r.save().coins === 15);
ok("easy: 3 title tasks, claim disabled", rows("easyBox").length === 3 && r.id("easyClaim").disabled && /Champion/.test(r.id("easyBox").textContent));
r.setSave((x) => { x.owned.push("comeback", "revenge", "gun-shadow"); x.buckshot = { best: 10 }; });
r.openShop(); r.tab("Gun Skins"); r.itemBtn("Shadow").click();
ok("Champion auto-granted (best 10 + Shadow)", r.save().owned.includes("champion") && /CHAMPION/.test(r.shopToast()));
r.S.close(); r.w.arcadeSecret();
ok("easy: all 3 titles -> claim enabled", doneRows("easyBox") === 3 && !r.id("easyClaim").disabled);
r.id("easyClaim").click();
s = r.save();
ok("easy done -> Admin Panel unlocked + opened", s.adminUnlocked && s.easyDone && r.id("adminVeil").classList.contains("open") && !r.id("questVeil").classList.contains("open") && r.d.body.classList.contains("is-admin"));
r.w.arcadeSecret();
ok("quests now show Open Admin Panel, no skip", !r.id("questAdmin").hidden && r.id("questSkip").hidden && r.id("hardSub").textContent === "✅ Complete.");
r = r.reboot();
ok("finished chain survives reload", r.save().adminUnlocked && r.d.body.classList.contains("is-admin"));
// Owner skip
r = boot({ seed: { [KEY]: { owned: [...DEFAULT_OWNED, "owner"] } } });
r.w.arcadeSecret();
ok("owner: skip button shown", !r.id("questSkip").hidden);
r.id("questSkip").click();
ok("owner skip -> admin unlocked + hardDone", r.save().adminUnlocked && r.save().hardDone && r.id("adminVeil").classList.contains("open"));
r = r.reboot();
ok("owner skip survives reload", r.save().adminUnlocked === true);
r = boot({ seed: { [KEY]: {} } }); r.w.arcadeSecret();
ok("non-owner: no skip", r.id("questSkip").hidden);
r = boot({ seed: { [KEY]: { owned: [...DEFAULT_OWNED, "owner", "astral", "oracle"], hardDone: true, mediumUnlocked: true, mediumDone: true } } });
r.w.arcadeSecret(); r.id("questSkip").click();
ok("owner skip after the Medium Quests unlocks", r.save().adminUnlocked === true);
r = r.reboot();
ok("owner skip after the Medium Quests survives reload", r.save().adminUnlocked === true && r.d.body.classList.contains("is-admin"));
// Migrations
r = boot({ seed: { [KEY]: { adminUnlocked: true } } });
ok("old save (Hard Quest only) -> hardDone, admin locked", r.save().hardDone === true && !r.save().adminUnlocked && !r.d.body.classList.contains("is-admin"));
r = boot({ seed: { [KEY]: { adminUnlocked: true, hardDone: true, mediumDone: true } } });
ok("old save (Medium opened admin) -> admin locked", !r.save().adminUnlocked && r.save().mediumDone);
r = boot({ seed: { [KEY]: { adminUnlocked: true, hardDone: true, mediumDone: true, easyDone: true } } });
ok("new save with Easy done keeps admin", r.save().adminUnlocked === true);
r = boot({ seed: { [KEY]: { adminUnlocked: true, hardDone: true } } });
ok("old owner-skip save keeps admin", r.save().adminUnlocked === true);
ok("no errors: " + r.errs.join(" | "), r.errs.length === 0);

// ================================================================== 6. admin panel
sect("6. admin panel");
const adminSeed = () => ({ [KEY]: { coins: 50, hardDone: true, mediumDone: true, easyDone: true, adminUnlocked: true,
  owned: [...DEFAULT_OWNED, "champion", "comeback", "revenge", "astral", "oracle"] } });
r = boot({ seed: adminSeed() });
r.w.arcadeSecret(); r.id("questAdmin").click();
ok("admin panel opens", r.id("adminVeil").classList.contains("open") && !r.id("questVeil").classList.contains("open"));
ok("coins box prefilled", r.id("admCoins").value === "50");
const A = (act) => r.$(`[data-admin="${act}"]`).click();
const T = (k) => r.$(`[data-toggle-admin="${k}"]`).click();
const setCoins = (v) => { r.id("admCoins").value = v; A("setcoins"); };
setCoins("123");
ok("set coins 123", r.save().coins === 123 && r.$("[data-coins]").textContent === "123" && /123/.test(r.toast()));
setCoins("-5"); ok("set coins -5 -> 0", r.save().coins === 0);
setCoins("abc"); ok("set coins abc -> 0", r.save().coins === 0);
setCoins(" 123 "); setCoins("INF");
s = r.save();
ok("set coins inf -> ∞", s.admin.infCoins && s.coins === INF && s.coinsBeforeInf === 123 && r.$("[data-coins]").textContent === "∞" && r.id("admCoins").value === "inf");
ok("∞ toggle shows on", r.$('[data-toggle-admin="infCoins"]').classList.contains("on"));
A("coins10"); ok("+10 with ∞ stays ∞", r.save().coins === INF);
T("infCoins");
ok("∞ off restores the old coins", r.save().coins === 123 && !r.save().admin.infCoins && r.save().coinsBeforeInf === undefined && r.$("[data-coins]").textContent === "123");
T("infCoins"); ok("∞ toggle on", r.save().coins === INF && r.save().coinsBeforeInf === 123);
setCoins("7"); ok("set coins while ∞ -> normal 7", r.save().coins === 7 && !r.save().admin.infCoins);
A("coins10"); A("coins100"); ok("+10 +100", r.save().coins === 117);
// 🎃 Halloween & Backrooms admin buttons
r.w.localStorage.setItem("monster_attack_candy", "5"); r.w.localStorage.removeItem("monster_attack_hw_earned_" + new Date(r.st.now).getFullYear());
A("candy100"); A("candy1000");
ok("admin: +100 and +1000 candy (wallet and pass)", r.w.localStorage.getItem("monster_attack_candy") === "1105"
   && r.w.localStorage.getItem("monster_attack_hw_earned_" + new Date(r.st.now).getFullYear()) === "1100" && /candy/.test(r.toast()));
A("hwitems");
ok("admin: every Halloween title, avatar, background and gun skin", ["hw-sweettooth", "hw-ghosthunter", "hw-night", "pumpkin", "hw-ghost", "hw-vampire", "hw-pumpkinking", "bg-haunted-night", "bg-graveyard-fog", "bg-pumpkin-moon", "gun-jack-o-lantern"].every((id) => r.save().owned.includes(id)));
A("floors");
ok("admin: all 21 Backrooms floors", r.save().specialMaps.length === 21 && r.save().specialMaps.includes("backrooms") && r.save().specialMaps.includes("brfloor20"));
r.$('[data-boost="5"]').click();
ok("coin speed ×5", r.save().admin.coinBoost === 5 && r.$('[data-boost="5"]').classList.contains("on") && !r.$('[data-boost="1"]').classList.contains("on"));
r.$('[data-boost="1"]').click(); ok("coin speed ×1", r.save().admin.coinBoost === 1);
r.id("admItem").value = "gun-diamond"; A("give");
ok("give Diamond", r.save().owned.includes("gun-diamond"));
r.setSave((x) => { x.equipped.gun = "gun-diamond"; });
A("take");
ok("take Diamond -> removed + Normal gun back on", !r.save().owned.includes("gun-diamond") && r.save().equipped.gun === "gun-none");
ok("take shares skins", JSON.parse(r.w.localStorage.getItem(SKINS_KEY)).gun === null);
A("crown"); ok("Owner Crown needs owner", !r.save().owned.includes("royalcrown"));
A("owner");
s = r.save();
ok("owner title (+ admin + vip)", ["owner", "admin", "vip"].every((x) => s.owned.includes(x)) && s.equipped.title === "owner" && r.d.body.classList.contains("is-owner"));
A("royal"); A("crown");
s = r.save();
ok("owner: Royal theme + Crown", s.owned.includes("royal") && s.equipped.theme === "royal" && s.owned.includes("royalcrown") && s.equipped.avatar === "royalcrown");
A("unlock");
s = r.save();
ok("unlock all", ALL.every((i) => s.owned.includes(i.id)));
r.id("admAbility").value = "rebuild:power"; r.id("admAbility").dispatchEvent(new r.w.Event("change"));
ok("ability levels 0..5", r.$$("#admLevel option").length === 6);
r.id("admLevel").value = "4"; A("setab");
ok("set ability", r.save().abilities["rebuild:power"] === 4);
r.id("admAbility").value = "rebuild:agent"; r.id("admAbility").dispatchEvent(new r.w.Event("change"));
ok("secret ability levels 0..1", r.$$("#admLevel option").length === 2);
A("maxab");
s = r.save();
ok("max all", S0.ABILITIES.every((a) => s.abilities[a.id] === (a.secret ? 1 : 5)));
A("clearab");
ok("clear all", Object.keys(r.save().abilities).length === 0 && Object.keys(r.save().active).length === 0);
for (const k of ["freeShop", "super"]) {
  T(k); ok(`${k} on`, r.save().admin[k] === true && r.$(`[data-toggle-admin="${k}"]`).classList.contains("on"));
  T(k); ok(`${k} off`, r.save().admin[k] === false && !r.$(`[data-toggle-admin="${k}"]`).classList.contains("on"));
}
const tot = r.save().total;
A("time"); ok("+1 hour", r.save().total === tot + 3600);
r.setSave((x) => { x.secretReward = false; x.redeemed = []; x.owned = x.owned.filter((i) => !S0.SECRET_ITEMS.includes(i)); });
let c0 = r.save().coins;
A("allcodes");
s = r.save();
ok("find all codes -> 30 + Secret Agent pack", s.redeemed.length === 30 && s.secretReward && S0.SECRET_ITEMS.every((x) => s.owned.includes(x)) && s.coins === c0 + 10 && /Secret Agent/.test(r.toast()));
A("allcodes"); ok("find all codes again: no second pack", r.save().coins === c0 + 10 && !/Secret Agent/.test(r.toast()));
A("resetcodes"); ok("reset codes", r.save().redeemed.length === 0 && r.save().secretReward === true);
A("medium"); ok("unlock medium", r.save().mediumUnlocked === true);
// bugs list
r.w.localStorage.setItem(BUGS_KEY, JSON.stringify([{ at: 1, game: "rebuild", text: "first" }, { at: 2, game: "arcade", text: "second" }, { at: 3, game: "monster-city", text: "third", auto: true }]));
r.w.arcadeSecret(); r.id("questAdmin").click();
ok("bug list: newest first", JSON.stringify(r.$$("#bugList .bug p").map((p) => p.textContent)) === JSON.stringify(["third", "second", "first"]));
ok("bug list: auto label", /caught automatically/.test(r.$$("#bugList .bug")[0].textContent) && r.$$("#bugList .bug")[0].classList.contains("auto"));
r.$('[data-delbug="1"]').click();
ok("delete one bug", JSON.stringify(JSON.parse(r.w.localStorage.getItem(BUGS_KEY)).map((b) => b.text)) === JSON.stringify(["first", "third"]) && r.$$("#bugList .bug").length === 2);
A("clearbugs"); ok("delete all needs a 2nd click", JSON.parse(r.w.localStorage.getItem(BUGS_KEY)).length === 2);
A("clearbugs"); ok("delete all", JSON.parse(r.w.localStorage.getItem(BUGS_KEY)).length === 0 && /No bug reports/.test(r.id("bugList").textContent));
// relock
A("relock"); ok("relock: 1st click only warns", r.save().adminUnlocked === true && /again/.test(r.toast()));
r.adv(4); A("relock"); ok("relock: clicks 4 s apart don't count", r.save().adminUnlocked === true);
A("relock");
s = r.save();
ok("relock: double click locks", !s.adminUnlocked && !s.easyDone && !r.id("adminVeil").classList.contains("open") && !r.d.body.classList.contains("is-admin"));
c0 = s.coins; A("coins10");
ok("locked panel ignores actions", r.save().coins === c0);
r.w.arcadeSecret();
ok("relocked: Easy Quest claimable again", !r.id("easyClaim").disabled && r.id("questAdmin").hidden);
r.id("easyClaim").click();
ok("Easy Quest again -> unlocked", r.save().adminUnlocked === true);
// discord notice
r = boot({ seed: adminSeed(), fetch: (u) => (u.startsWith("/api/arcade/discord") ? { status: 200, data: { valid: true, expiresAt: new Date(T0 + 3 * DAY).toISOString() } } : defaultFetch(u)) });
r.w.arcadeSecret(); r.id("questAdmin").click(); await flush();
ok("admin notice: invite expires in 3 days", !r.id("discordNotice").hidden && /expires in 3 days/.test(r.id("discordNotice").textContent));
r.st.fetchImpl = (u) => (u.startsWith("/api/arcade/discord") ? { status: 200, data: { valid: false, expiresAt: null } } : defaultFetch(u));
r.w.arcadeSecret(); await flush();
ok("admin notice: EXPIRED", /EXPIRED/.test(r.id("discordNotice").textContent));
r.st.fetchImpl = defaultFetch; r.H.discordStatus = { valid: true, expiresAt: new Date(T0 + 30 * DAY).toISOString() };
r.w.arcadeSecret(); r.id("questAdmin").click(); await flush();
ok("admin notice hidden when status unknown/far", r.id("discordNotice").hidden);
// reset save
A("reset"); ok("reset: 1st click only warns", !!r.w.localStorage.getItem(KEY) && r.st.reloads === 0);
A("reset"); ok("reset: double click wipes + reloads", !r.w.localStorage.getItem(KEY) && !r.w.localStorage.getItem(SKINS_KEY) && r.st.reloads === 1);
ok("no errors: " + r.errs.join(" | "), r.errs.length === 0);

// ================================================================== 7. free stuff
sect("7. free stuff");
r = boot({ seed: { [KEY]: { coins: 0 } } });
ok("daily: day 1 next", r.id("dailyClaim").textContent === "Claim day 1" && r.$(".day.next").textContent.startsWith("Day 1"));
r.id("dailyClaim").click();
ok("daily day 1: +1", r.save().coins === 1 && /Day 1/.test(r.toast()));
ok("daily: once per day", r.id("dailyClaim").disabled && r.id("dailyClaim").textContent === "✓ Come back tomorrow");
r.id("dailyClaim").onclick();
ok("daily: 2nd claim same day ignored", r.save().coins === 1);
const DAILY = [1, 1, 2, 2, 3, 3, 5];
let total = 1, ownedBefore = r.save().owned.length;
for (let dday = 2; dday <= 7; dday++) {
  r = r.reboot({ now: r.st.now + DAY });
  if (r.id("dailyClaim").textContent !== `Claim day ${dday}`) ok(`day ${dday} offered`, false);
  r.id("dailyClaim").click(); total += DAILY[dday - 1];
  if (dday === 3) ok("day 3: 3 days got", r.$$(".day.got").length === 3 && !r.$(".day.next"));
}
s = r.save();
ok("7-day streak coins 1+1+2+2+3+3+5", s.coins === total && total === 17 && s.freebies.streak === 7);
ok("day 7: a free skin", s.owned.length === ownedBefore + 1 && /skin/.test(r.toast()));
ok("day 7 claimed: all 7 got", r.$$(".day.got").length === 7);
r = r.reboot({ now: r.st.now + DAY });
ok("day 8 -> back to day 1 of a new week", r.id("dailyClaim").textContent === "Claim day 1" && r.$$(".day.got").length === 0);
r.id("dailyClaim").click(); ok("day 8 pays 1", r.save().coins === 18);
r = r.reboot({ now: r.st.now + DAY });
r.id("dailyClaim").click(); ok("day 9 = day 2", /Day 2/.test(r.toast()));
r = r.reboot({ now: r.st.now + 2 * DAY });
ok("missed a day -> day 1", r.id("dailyClaim").textContent === "Claim day 1");
r.id("dailyClaim").click(); ok("missed a day: streak 1", r.save().freebies.streak === 1);
// spin
const wheelSlot = () => { const a = parseFloat(r.id("wheel").style.transform.match(/rotate\(([-\d.]+)deg\)/)[1]); return ((360 - (a % 360)) % 360 - 22.5) / 45; };
const wheelLabel = () => r.$$("#wheel i")[wheelSlot()].textContent;
r = boot({ seed: { [KEY]: { coins: 0 } } });
r.st.rand.push(0.5, 0); r.id("spinBtn").click();
ok("spin: marked spun and the prize paid at once (the wheel only reveals it)", r.save().freebies.spun === dk(T0) && r.save().coins === 2 && r.id("spinBtn").disabled && r.id("spinMsg").textContent === "Spinning…");
r.adv(3.1);
ok("spin 0.5 -> +2 coins", r.save().coins === 2 && r.id("spinMsg").textContent === "🪙 +2 coins!");
ok("wheel lands on a 🪙2 slice", wheelLabel() === "🪙2");
ok("spin: once per day", r.id("spinBtn").disabled && r.id("spinBtn").textContent === "✓ Spin again tomorrow");
r.id("spinBtn").onclick(); r.adv(4);
ok("spin: 2nd spin ignored", r.save().coins === 2);
r = r.reboot({ now: r.st.now + DAY });
r.st.rand.push(0.995, 0.4); r.id("spinBtn").click();
r = r.reboot();
ok("reload mid-spin: can't spin again today", r.id("spinBtn").disabled && r.id("spinBtn").textContent === "✓ Spin again tomorrow");
ok("reload mid-spin: the prize (jackpot) was still paid", r.save().coins === 12);
r = r.reboot({ now: r.st.now + DAY });
r.st.rand.push(0.995, 0); r.id("spinBtn").click(); r.adv(3.1);
ok("jackpot +10", r.save().coins === 22 && /JACKPOT/.test(r.id("spinMsg").textContent) && wheelLabel() === "🎰10");
r = r.reboot({ now: r.st.now + DAY });
ownedBefore = r.save().owned.length;
r.st.rand.push(0.8, 0, 0); r.id("spinBtn").click(); r.adv(3.1);
ok("skin prize", r.save().owned.length === ownedBefore + 1 && /skin/.test(r.id("spinMsg").textContent) && wheelLabel() === "🎨");
r.setSave((x) => { x.owned = [...new Set([...x.owned, ...ALL.filter((i) => i.price > 0 && i.price <= 8).map((i) => i.id)])]; });
r = r.reboot({ now: r.st.now + DAY });
c0 = r.save().coins;
r.st.rand.push(0.8, 0); r.id("spinBtn").click(); r.adv(3.1);
ok("skin prize with every cheap skin owned -> 2 coins", r.save().coins === c0 + 2 && wheelLabel() === "🪙2");
// milestones
r = boot({ seed: { [KEY]: { coins: 0, total: 29 * 60 } } });
ok("milestones: none ready at 29 min", r.$$("[data-ms]").length === 0 && r.$$("#milestones .ms").length === 6);
r = boot({ seed: { [KEY]: { coins: 0, total: 30 * 60 } } });
ok("30 min: one claim", r.$$("[data-ms]").length === 1);
r.$('[data-ms="m30"]').click();
ok("m30: +3 once", r.save().coins === 3 && r.save().milestones.includes("m30") && r.$$("[data-ms]").length === 0);
const fake = r.d.createElement("button"); fake.dataset.ms = "m30"; r.id("milestones").appendChild(fake); fake.click();
ok("m30 can't be claimed twice", r.save().coins === 3);
const fake2 = r.d.createElement("button"); fake2.dataset.ms = "m60"; r.id("milestones").appendChild(fake2); fake2.click();
ok("m60 can't be claimed early", !(r.save().milestones || []).includes("m60"));
r = boot({ seed: { [KEY]: { coins: 0, total: 1440 * 60, milestones: ["m30"] } } });
ownedBefore = r.S.load().owned.length;
ok("24 h: 5 claims", r.$$("[data-ms]").length === 5);
for (const m of ["m60", "m180", "m360", "m600"]) r.$(`[data-ms="${m}"]`).click();
s = r.save();
ok("m60 + m360 skins, m180 + m360 coins", s.coins === 20 && s.owned.length === ownedBefore + 3);
ok("m600: Dedicated title on", s.owned.includes("dedicated") && s.equipped.title === "dedicated" && r.$("[data-title]").textContent === "🏅 Dedicated");
r.$('[data-ms="m1440"]').click();
ok("m1440: +25 + Arcade Veteran", r.save().coins === 45 && r.save().equipped.title === "veteran");
// Free To Play Monster
const FREE = S0.FREE_ITEMS();
ok("FREE items list", JSON.stringify(FREE) === JSON.stringify(["sunrise", "dog", "frog", "player", "gun-classic-blue", "ab-spark", "bg-clear-sky"]));
r = boot({ seed: { [KEY]: { coins: 0, owned: [...DEFAULT_OWNED, ...FREE.filter((x) => x !== "ab-spark")] } } });
ok("no F2P before the last one", !r.save().owned.includes("f2p"));
r.openShop(); r.tab("Ability Skins"); r.itemBtn("Spark").click();
ok("last FREE item -> F2P title on + toast", r.save().owned.includes("f2p") && r.save().equipped.title === "f2p" && /FREE TO PLAY/.test(r.shopToast()));
ok("F2P title shown on the page", r.$("[data-title]").textContent === "👾 Free To Play Monster");
// Champion
r = boot({ seed: { [KEY]: { owned: [...DEFAULT_OWNED, "gun-shadow"], buckshot: { best: 9 } } } });
r.openShop(); r.tab("Gun Skins"); r.itemBtn("Shadow").click();
ok("best 9 + Shadow: no Champion", !r.save().owned.includes("champion"));
r.itemBtn("Normal").click(); r.setSave((x) => { x.buckshot.best = 10; });
r.itemBtn("Normal").click();
ok("best 10 without Shadow: no Champion", !r.save().owned.includes("champion"));
r.itemBtn("Shadow").click();
ok("best 10 + Shadow: Champion + toast", r.save().owned.includes("champion") && r.save().equipped.title === "champion" && /CHAMPION/.test(r.shopToast()));
ok("no errors: " + r.errs.join(" | "), r.errs.length === 0);

// ================================================================== 8. bugs
sect("8. bug reports");
r = boot({ seed: { [KEY]: {} } });
r.id("bugBtn").click();
ok("bug form opens, game = arcade at home", r.id("bugVeil").classList.contains("open") && r.id("bugGame").value === "arcade" && r.$$("#bugGame option").length === 6);
r.id("bugText").value = "  too short ".slice(0, 11);
r.id("bugText").value = "123456789";
r.submit(r.id("bugForm"));
ok("< 10 letters refused", /at least 10/.test(r.toast()) && !r.w.localStorage.getItem(BUGS_KEY) && !r.save().bugsReported);
r.id("bugText").value = "1234567890"; r.submit(r.id("bugForm"));
ok("10 letters accepted", JSON.parse(r.w.localStorage.getItem(BUGS_KEY)).length === 1 && r.save().bugsReported === 1 && r.save().daily.bugs === 1 && !r.id("bugVeil").classList.contains("open"));
r.go("#play/rebuild"); r.id("bugBtn").click();
ok("bug form preselects the game being played", r.id("bugGame").value === "rebuild");
for (let i = 0; i < 5; i++) { r.id("bugText").value = "Bug number " + i + " happened"; r.submit(r.id("bugForm")); }
ok("5 per day cap", JSON.parse(r.w.localStorage.getItem(BUGS_KEY)).length === 5 && r.save().bugsReported === 5 && /5 reports today/.test(r.toast()));
r.jump(DAY); r.id("bugText").value = "A new day, a new bug"; r.submit(r.id("bugForm"));
ok("next day: allowed again", JSON.parse(r.w.localStorage.getItem(BUGS_KEY)).length === 6 && r.save().bugsReported === 6);
const fw = r.id("frame").contentWindow;
r.id("frame").dispatchEvent(new r.w.Event("load"));
const boom = (msg) => fw.dispatchEvent(new fw.ErrorEvent("error", { message: msg, filename: "http://localhost:4173/games/rebuild/index.html?x=1", lineno: 42 }));
boom("x is not defined"); boom("x is not defined"); boom("y is null");
const pr = new fw.Event("unhandledrejection"); pr.reason = new Error("load failed"); fw.dispatchEvent(pr);
let autos = JSON.parse(r.w.localStorage.getItem(BUGS_KEY)).filter((b) => b.auto);
ok("auto bugs: de-duplicated", autos.length === 3 && autos[0].text === "x is not defined (index.html:42)" && autos[0].game === "rebuild");
ok("auto bugs: promise rejection", autos[2].text === "Promise: load failed");
ok("auto bugs don't count for the quest/cap", r.save().bugsReported === 6);
ok("no errors: " + r.errs.join(" | "), r.errs.length === 0);

// ================================================================== 9. accounts
sect("9. accounts");
const server = { save: null, fail: 0 };
const accFetch = (u, call) => {
  if (u.startsWith("/api/arcade/discord")) return { status: 200, data: { valid: null } };
  if (u === "/api/arcade/signup") return call.body.name === "taken" ? { status: 409, data: { error: "That name is taken" } } : { status: 200, data: { name: call.body.name, token: "tok-" + call.body.name } };
  if (u === "/api/arcade/login") return call.body.password === "good" ? { status: 200, data: { name: call.body.name, token: "tok2", save: server.save, savedAt: 5 } } : { status: 401, data: { error: "Wrong name or password." } };
  if (u === "/api/arcade/save") { if (server.fail) return { status: server.fail, data: { error: "nope" } }; server.save = call.body.save; return { status: 200, data: { ok: true, savedAt: 1000 } }; }
  if (u === "/api/arcade/logout") return { status: 200, data: { ok: true } };
  return { status: 404, data: {} };
};
const LOCAL = { [KEY]: { coins: 9 }, [SKINS_KEY]: { gun: null }, monster_city_points: "40", monster_attack_season_xp: "120", "project-revive-save-v1": { v: 1 }, buckshot_wins: "3", fps_arena_save: "{}", "unrelated-key": "keep", [BUGS_KEY]: "[]" };
r = boot({ seed: LOCAL, fetch: accFetch });
r.id("accountBtn").click();
ok("account panel opens (logged out)", r.id("accountVeil").classList.contains("open") && !r.id("accountOut").hidden && r.id("accountIn").hidden);
r.id("tabSignup").click();
ok("sign-up mode", !r.id("accPass2").hidden && r.id("accGo").textContent === "Sign up");
r.id("accName").value = "danny"; r.id("accPass").value = "abcd"; r.id("accPass2").value = "abce";
r.submit(r.id("accountForm")); await flush();
ok("passwords must match", /don't match/.test(r.id("accMsg").textContent) && !r.st.fetches.some((f) => f.url === "/api/arcade/signup"));
r.id("accName").value = "taken"; r.id("accPass2").value = "abcd";
r.submit(r.id("accountForm")); await flush();
ok("server error shown", /taken/.test(r.id("accMsg").textContent) && !r.w.localStorage.getItem(ACC_KEY));
r.id("accName").value = "danny";
r.submit(r.id("accountForm")); await flush();
ok("sign-up: token stored", JSON.parse(r.w.localStorage.getItem(ACC_KEY)).token === "tok-danny");
let put = r.st.fetches.filter((f) => f.url === "/api/arcade/save").pop();
ok("sign-up: snapshot uploaded with the token", put && put.method === "PUT" && put.headers["X-Arcade-Token"] === "tok-danny");
ok("snapshot = only synced keys", JSON.stringify(Object.keys(put.body.save).sort()) === JSON.stringify([KEY, SKINS_KEY, "buckshot_wins", "fps_arena_save", "monster_attack_season_xp", "monster_city_points", "project-revive-save-v1"].sort()));
ok("small upload uses keepalive", put.keepalive === true);
ok("snapshot values are the raw strings", put.body.save.monster_city_points === "40" && JSON.parse(put.body.save[KEY]).coins === 9);
ok("sign-up: UI logged in", r.id("accountBtn").textContent === "👤 danny" && r.id("playerName").textContent === "danny" && !r.id("accountVeil").classList.contains("open"));
let n = r.st.fetches.length;
r.adv(15); await flush();
ok("15 s autosave skips an unchanged save", r.st.fetches.length === n);
r.setSave((x) => { x.coins = 10; }); r.adv(15); await flush();
ok("15 s autosave uploads a changed save", r.st.fetches.length === n + 1 && JSON.parse(server.save[KEY]).coins === 10);
r.st.hidden = true; r.setSave((x) => { x.coins = 11; }); r.d.dispatchEvent(new r.w.Event("visibilitychange")); await flush();
ok("upload when the tab is hidden", JSON.parse(server.save[KEY]).coins === 11);
r.st.hidden = false;
// 401 on upload logs out
server.fail = 401;
r.id("accountBtn").click(); r.id("accSaveNow").click(); await flush();
ok("401 on upload -> logged out", !r.w.localStorage.getItem(ACC_KEY) && r.id("accountBtn").textContent === "👤 Log in" && /logged out/.test(r.toast()));
ok("401: local progress kept", r.save().coins === 11);
server.fail = 0;
// login with a saved snapshot
server.save = { [KEY]: JSON.stringify({ coins: 77 }), monster_city_points: "99", "evil-key": "x" };
r = boot({ seed: LOCAL, fetch: accFetch });
r.id("accountBtn").click();
r.id("accName").value = "danny"; r.id("accPass").value = "bad"; r.submit(r.id("accountForm")); await flush();
ok("wrong password message", /Wrong name/.test(r.id("accMsg").textContent) && !r.w.localStorage.getItem(ACC_KEY));
r.id("accPass").value = "good"; r.submit(r.id("accountForm")); await flush();
let ls = r.dump();
ok("login: snapshot restored", JSON.parse(ls[KEY]).coins === 77 && ls.monster_city_points === "99");
ok("login: other synced keys cleared", !ls.buckshot_wins && !ls.monster_attack_season_xp && !ls[SKINS_KEY] && !ls["project-revive-save-v1"]);
ok("login: unsynced keys kept / not injected", ls["unrelated-key"] === "keep" && ls[BUGS_KEY] === "[]" && !ls["evil-key"]);
ok("login: token stored, then reload", JSON.parse(ls[ACC_KEY]).token === "tok2" && r.st.reloads === 1);
r = r.reboot();
ok("after reload: logged in with the account's coins", r.id("accountBtn").textContent === "👤 danny" && r.$("[data-coins]").textContent === "77");
await flush();
ok("after reload: uploads once", r.st.fetches.filter((f) => f.url === "/api/arcade/save").length === 1);
// login to an empty account keeps what's here
server.save = null;
let r2 = boot({ seed: LOCAL, fetch: accFetch });
r2.id("accountBtn").click(); r2.id("accName").value = "newbie"; r2.id("accPass").value = "good"; r2.submit(r2.id("accountForm")); await flush();
ok("login to empty account: no reload, local save uploaded", r2.st.reloads === 0 && JSON.parse(server.save[KEY]).coins === 9 && r2.id("accountBtn").textContent === "👤 newbie");
// a big save (> 64 KB, e.g. custom maps) still uploads
server.save = null;
const BIG = "x".repeat(100000);
r2 = boot({ seed: { ...LOCAL, monster_city_custom_map: BIG }, fetch: accFetch });
r2.id("accountBtn").click(); r2.id("tabSignup").click();
r2.id("accName").value = "mapper"; r2.id("accPass").value = r2.id("accPass2").value = "abcd"; r2.submit(r2.id("accountForm")); await flush();
put = r2.st.fetches.filter((f) => f.url === "/api/arcade/save").pop();
ok("big save (100 KB) uploads, without keepalive", server.save && server.save.monster_city_custom_map === BIG && put.keepalive === false);
ok("big save: signed up normally", r2.id("accountBtn").textContent === "👤 mapper" && !/❌/.test(r2.id("accMsg").textContent));
// logout
server.fail = 500;
r.id("accountBtn").click(); r.id("accLogout").click(); await flush();
ok("logout blocked when the save can't upload", !!r.w.localStorage.getItem(ACC_KEY) && /Couldn't save/.test(r.toast()) && r.st.reloads === 0);
server.fail = 0;
r.setSave((x) => { x.coins = 80; });
r.id("accLogout").click(); await flush();
ls = r.dump();
ok("logout: uploads first", JSON.parse(server.save[KEY]).coins === 80);
ok("logout: POST logout sent", r.st.fetches.some((f) => f.url === "/api/arcade/logout" && f.method === "POST"));
ok("logout: token key cleared", !ls[ACC_KEY]);
ok("logout: synced keys cleared, others kept", !ls[KEY] && !ls.monster_city_points && !ls.monster_attack_season_xp && ls["unrelated-key"] === "keep");
ok("logout: reload", r.st.reloads === 1);
r = r.reboot();
await flush();
ok("after logout reload: logged out, nothing uploaded", r.id("accountBtn").textContent === "👤 Log in" && !r.st.fetches.some((f) => f.url === "/api/arcade/save"));
ok("no errors: " + r.errs.join(" | "), r.errs.length === 0);

// ================================================================== 10. skins
sect("10. skins");
r = boot();
const GS = r.S.gameSkins;
const sv = (eq) => ({ equipped: { gun: "gun-none", ability: "ab-none", bg: "bg-none", ...eq } });
ok("Normal -> all null", JSON.stringify(GS(sv({}))) === JSON.stringify({ gun: null, ability: null, bg: null }));
let g = GS(sv({ gun: "gun-rainbow", ability: "ab-spark", bg: "bg-night" }));
ok("rainbow gun, spark, night", g.gun.rainbow === true && g.gun.id === "gun-rainbow" && g.ability.primary === "#fff1a8" && g.bg.sky === "#0a1030" && g.bg.name === "Night");
ok("unknown id falls back to Normal", GS(sv({ gun: "gun-gone" })).gun === null);
const cb = S0.SHOP["Gun Skins"].find((i) => i.id === "gun-codebreaker");
let cyc = true;
for (let k = 0; k < 7; k++) { r.st.now = 900 * (1000 + k); if (GS(sv({ gun: "gun-codebreaker" })).gun.bullet !== cb.cycle[(1000 + k) % 5].bullet) cyc = false; }
ok("Code Breaker cycles its 5 colours every 900 ms", cyc);
const ev = S0.SHOP.Backgrounds.find((i) => i.id === "bg-everything");
cyc = ev.cycle.length === 20;
const seen = new Set();
for (let k = 0; k < 20; k++) { r.st.now = 8000 * (2000 + k) + 100; const b = GS(sv({ bg: "bg-everything" })).bg; seen.add(b.sky); if (b.sky !== ev.cycle[(2000 + k) % 20].sky || b.id !== "bg-everything") cyc = false; }
ok("Every Background shows all 20 backgrounds, 8 s each", cyc && seen.size === 20);
ok("no errors: " + r.errs.join(" | "), r.errs.length === 0);

// ---------------------------------------------------------------- 🎃 custom Pumpkin King avatar
r = boot({ seed: { [KEY]: withDefaults({ owned: [...DEFAULT_OWNED, "hw-pumpkinking"], equipped: { avatar: "smile" } }) } });
const av = r.$("[data-avatar]");
ok("an untouched avatar is just its emoji", !av.querySelector("svg") && av.textContent.length <= 4);
r.setSave((x) => { x.equipped.avatar = "hw-pumpkinking"; }); r.w.dispatchEvent(new r.w.Event("hashchange")); r.adv(0);
ok("🎃 the Pumpkin King avatar is drawn as a picture", !!av.querySelector("svg.pumpkin-av") && av.classList.contains("custom"));
ok("🎃 default look: orange, candle glow, happy", av.innerHTML.includes("#ff7a1a") && av.innerHTML.includes("#ffd23a"));
av.click();
ok("🎃 clicking it opens the pumpkin maker", r.id("avatarVeil").classList.contains("open") && !!r.id("pkPreview").querySelector("svg"));
const parts = S0.PUMPKIN_PARTS;
ok("🎃 5 things to choose: colour, glow, face, hat, buddy", Object.keys(parts).join() === "color,glow,face,hat,extra"
   && r.$$("#pkRows .pk-row").length === 5 && r.$$("#pkRows [data-pk]").length === Object.values(parts).reduce((a, p) => a + p.length, 0));
const pick = (part, id) => r.$$(`#pkRows [data-pk-part="${part}"]`).find((b) => b.dataset.pk === id).click();
pick("color", "purple"); pick("glow", "toxic"); pick("face", "scary"); pick("hat", "witch"); pick("extra", "bat");
ok("🎃 choices are saved", JSON.stringify(r.save().avatarCustom) === JSON.stringify({ color: "purple", glow: "toxic", face: "scary", hat: "witch", extra: "bat" }));
ok("🎃 the top-bar avatar changes at once", av.innerHTML.includes("#8e44ad") && av.innerHTML.includes("#7dff4a") && av.innerHTML.includes("🦇"));
ok("🎃 the picked buttons light up", r.$$("#pkRows .on").map((b) => b.dataset.pk).join() === "purple,toxic,scary,witch,bat");
ok("🎃 every combination draws", Object.values(parts.face).every(([f]) => Object.values(parts.hat).every(([h]) => /<svg[\s\S]*<\/svg>$/.test(S0.pumpkinSVG({ face: f, hat: h })))));
ok("🎃 nonsense in the save falls back to the defaults", JSON.stringify(S0.pumpkinLook({ avatarCustom: { color: "nope", hat: 42 } })) === JSON.stringify({ color: "orange", glow: "candle", face: "happy", hat: "none", extra: "none" }));
ok("🎃 an unknown choice is refused", S0.setAvatarCustom("color", "rainbow-unicorn") === null && r.save().avatarCustom.color === "purple");
r = boot({ seed: { [KEY]: JSON.parse(r.w.localStorage.getItem(KEY)) } });
ok("🎃 it is still your pumpkin after a reload", r.$("[data-avatar]").innerHTML.includes("#8e44ad") && r.$("[data-avatar]").innerHTML.includes("🦇"));
ok("no errors in the pumpkin maker: " + r.errs.join(" | "), r.errs.length === 0);

// ---------------------------------------------------------------- 🎨 every other avatar can be customised too
r = boot({ seed: { [KEY]: withDefaults({ owned: [...DEFAULT_OWNED, "cat", "robot"], equipped: { avatar: "cat" } }) } });
const av2 = r.$("[data-avatar]");
ok("🎨 every avatar is clickable", av2.classList.contains("custom"));
av2.click();
ok("🎨 clicking the Cat opens the avatar maker for the Cat", r.id("avatarVeil").classList.contains("open") && /CAT/.test(r.id("pkTitle").textContent));
const AP = S0.AVATAR_PARTS;
ok("🎨 7 things to choose: colour, pose, background, frame, hat, buddy, effect", Object.keys(AP).join() === "color,pose,bg,frame,hat,buddy,effect" && r.$$("#pkRows .pk-row").length === 7);
const pick2 = (part, id) => r.$$(`#pkRows [data-pk-part="${part}"]`).find((b) => b.dataset.pk === id).click();
pick2("bg", "galaxy"); pick2("frame", "rainbow"); pick2("hat", "crown"); pick2("buddy", "star");
pick2("color", "blue"); pick2("pose", "flip"); pick2("effect", "sparkles");
ok("🎨 the Cat's look is saved", JSON.stringify(r.save().avatarCustoms.cat) === JSON.stringify({ color: "blue", pose: "flip", bg: "galaxy", frame: "rainbow", hat: "crown", buddy: "star", effect: "sparkles" }));
ok("🎨 the Cat itself is recoloured and flipped", /hue-rotate\(190deg\)/.test(av2.innerHTML) && /scale\(-1 1\)/.test(av2.innerHTML) && /✨/.test(av2.innerHTML));
ok("🎨 the top bar shows the dressed-up Cat", !!av2.querySelector("svg.custom-av") && /🐱/.test(av2.innerHTML) && /👑/.test(av2.innerHTML) && /⭐/.test(av2.innerHTML) && /#b36bff/.test(av2.innerHTML));
r.setSave((x) => { x.equipped.avatar = "robot"; }); r.w.dispatchEvent(new r.w.Event("hashchange")); r.adv(0);
ok("🎨 each avatar keeps its own look (the Robot is still plain)", !av2.querySelector("svg") && /🤖/.test(av2.textContent));
av2.click(); pick2("hat", "tophat");
ok("🎨 dressing the Robot does not change the Cat", r.save().avatarCustoms.robot.hat === "tophat" && r.save().avatarCustoms.cat.hat === "crown");
pick2("hat", "none");
ok("🎨 taking everything off makes it plain again", !av2.querySelector("svg"));
ok("🎨 nonsense is refused", S0.setAvatarPart("cat", "hat", "banana") === null && S0.setAvatarPart("hw-pumpkinking", "hat", "crown") === null);
ok("🎨 every avatar can be drawn", S0.SHOP.Avatars.every((a) => /<svg[\s\S]*<\/svg>$|^\S+$/.test(S0.avatarHTML(a.id, { avatarCustoms: { [a.id]: { color: "gold", pose: "tiltl", bg: "fire", frame: "gold", hat: "party", buddy: "zap", effect: "glow" } } }))));
ok("no errors in the avatar maker: " + r.errs.join(" | "), r.errs.length === 0);

console.log(`\n${pass} checks passed, ${fail} failed`);
console.log(fail ? `ARCADE PAGE FAIL (${fail})` : "ARCADE PAGE PASS");
process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); console.log(`ARCADE PAGE FAIL (${fail + 1})`); process.exit(1); });
