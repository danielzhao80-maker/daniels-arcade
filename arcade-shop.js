// arcade-shop.js — Daniel's Arcade shop: the catalog, the coin wallet and the shop window.
//
// The ORIGINAL lives in arcade/. Monster Attack!, Buckshot Roulette and REBUILD each carry a
// COPY next to their index.html (like nullp-widget.js), so after editing this file run:
//   cp arcade/arcade-shop.js monster-city/ && cp arcade/arcade-shop.js shooting-game/public/ && cp arcade/arcade-shop.js rebuild/
//
// Everything is kept in localStorage, so the arcade and the games share one wallet whenever
// they run from the same place (all opened as files, or all through Nullp at localhost:4173).
//
//   ArcadeShop.open({ categories })  show the shop (default: the three game-skin tabs)
//   ArcadeShop.load() / update(fn)   read, or read-change-write, the save
//   ArcadeShop.gameSkins(save)       { gun, ability, bg } as the games expect them
//
// Games get new skins live: after every buy/equip the shop calls window.applyArcadeSkins(skins)
// if the page defines it, and fires an "arcade-skins-changed" event on window.
(function () {
  "use strict";
  if (window.ArcadeShop) return;

  const KEY = "daniels-arcade-v1";
  const SKINS_KEY = "daniels-arcade-skins";
  const SECONDS_PER_COIN = 900; // 1 coin per 15 minutes of play

  // ---------------------------------------------------------------- catalog
  const SHOP = {
    Themes: [
      { id: "galaxy", name: "Galaxy", price: 0, vars: { bg: "#0d0b1a", bg2: "#171331", card: "#1d1840", glow1: "#3a1d6e", glow2: "#0f4d63", accent: "#ffd24a" } },
      { id: "sunrise", name: "Sunrise", price: 0, vars: { bg: "#1a0f14", bg2: "#2a1820", card: "#35202a", glow1: "#a3452a", glow2: "#c98a3a", accent: "#ffb86b" } },
      { id: "ocean",  name: "Deep Ocean", price: 2, vars: { bg: "#04121f", bg2: "#0a2236", card: "#0e2c45", glow1: "#0b4f7a", glow2: "#0f7a6e", accent: "#4ae3ff" } },
      { id: "forest", name: "Forest", price: 3, vars: { bg: "#08140c", bg2: "#10261a", card: "#143022", glow1: "#1f5a2f", glow2: "#4a5a12", accent: "#8cf07a" } },
      { id: "lava",   name: "Lava", price: 4, vars: { bg: "#170806", bg2: "#2a0f0a", card: "#34130d", glow1: "#8a1f0a", glow2: "#7a4a05", accent: "#ff7a3d" } },
      { id: "candy",  name: "Candy", price: 5, vars: { bg: "#1a0a1a", bg2: "#2d1230", card: "#3a1740", glow1: "#9a2a7a", glow2: "#2a5a9a", accent: "#ff8ad8" } },
      { id: "gold",   name: "Pure Gold", price: 15, vars: { bg: "#140f02", bg2: "#241b05", card: "#2e2308", glow1: "#8a6a0a", glow2: "#5a3a05", accent: "#ffe066" } },
      { id: "royal",  name: "👑 Owner Royal", price: 0, secret: true, lockText: "Owner only", vars: { bg: "#12061f", bg2: "#22103a", card: "#2c1450", glow1: "#6a1fd6", glow2: "#c98a00", accent: "#ffd24a" } },
    ],
    Avatars: [
      { id: "smile", name: "Smile", price: 0, emoji: "🙂" },
      { id: "dog",   name: "Dog", price: 0, emoji: "🐶" },
      { id: "frog",  name: "Frog", price: 0, emoji: "🐸" },
      { id: "cat",   name: "Cat", price: 1, emoji: "🐱" },
      { id: "robot", name: "Robot", price: 2, emoji: "🤖" },
      { id: "ninja", name: "Ninja", price: 3, emoji: "🥷" },
      { id: "alien", name: "Alien", price: 4, emoji: "👽" },
      { id: "dino",  name: "Dino", price: 5, emoji: "🦖" },
      { id: "dragon", name: "Dragon", price: 8, emoji: "🐉" },
      { id: "crown", name: "King", price: 20, emoji: "👑" },
      { id: "agent", name: "Mystery Secret Agent Merchant", price: 0, emoji: "🕵️", secret: true },
      { id: "royalcrown", name: "Owner Crown", price: 0, emoji: "🫅", secret: true, lockText: "Owner only" },
      { id: "oracle", name: "Astral Oracle", price: 0, emoji: "🔮", secret: true, lockText: "Medium Quest" },
    ],
    Titles: [
      { id: "rookie",  name: "Rookie", price: 0 },
      { id: "player",  name: "Player One", price: 0 },
      // Earned (free) by owning every FREE item in the shop.
      { id: "f2p", name: "👾 Free To Play Monster", price: 0, secret: true, lockText: "Get every FREE item" },
      // Play-time milestones (arcade home → 🏅 Milestones).
      { id: "dedicated", name: "🏅 Dedicated", price: 0, secret: true, lockText: "10 hours played" },
      { id: "veteran", name: "🏅 Arcade Veteran", price: 0, secret: true, lockText: "24 hours played" },
      { id: "gamer",   name: "Gamer", price: 2 },
      { id: "hunter",  name: "Monster Hunter", price: 4 },
      { id: "speller", name: "Spelling Master", price: 4 },
      { id: "boss",    name: "Final Boss", price: 10 },
      { id: "legend",  name: "Arcade Legend", price: 25 },
      { id: "admin",   name: "🛠️ Admin", price: 0, secret: true, lockText: "Admin Panel" },
      { id: "owner",   name: "👑 Owner", price: 0, secret: true, lockText: "Admin Panel" },
      { id: "vip",     name: "💎 VIP", price: 0, secret: true, lockText: "Admin Panel" },
      { id: "astral",  name: "🔮 Astral Seeker", price: 0, secret: true, lockText: "Medium Quest" },
      // Die to the ☠️ Reaper in Monster Attack!, then beat it in your very next match.
      { id: "revenge", name: "⚔️ Revenge", price: 0, secret: true, lockText: "Revenge" },
      // Win Buckshot Roulette 10 times in a row, then wear the Shadow gun skin.
      { id: "champion", name: "🏆 Champion", price: 0, secret: true, lockText: "Champion" },
      // REBUILD: win a battle after your base dropped to 1 HP.
      { id: "comeback", name: "⚡ Fast Comebacker", price: 0, secret: true, lockText: "Comeback" },
    ],
  };

  // "rainbow" as a color means the game cycles through every color.
  const GUN_SKINS = [
    // name, price, bullet, glow, trail
    ["Gold Rush", 2, "#ffd24a", "#fff3b0", "#ffae00"],
    ["Ice Shard", 2, "#9ae6ff", "#e0f8ff", "#3fb8ff"],
    ["Toxic", 3, "#7dff4a", "#d4ffb8", "#2e9e1a"],
    ["Inferno", 3, "#ff5a1f", "#ffc36b", "#b31200"],
    ["Plasma", 4, "#b36bff", "#e6c8ff", "#6a1fd6"],
    ["Ruby", 4, "#ff2d55", "#ff9fb2", "#a3002a"],
    ["Emerald", 4, "#19e68c", "#a8ffd9", "#0a8a52"],
    ["Ocean Wave", 5, "#1fa2ff", "#9fd8ff", "#0a4f9e"],
    ["Bubblegum", 5, "#ff7ad9", "#ffd1f1", "#d63fae"],
    ["Shadow", 6, "#3a3a4a", "#8a8aa0", "#111118"],
    ["Lightning", 6, "#fff64a", "#ffffff", "#4ae3ff"],
    ["Lava Core", 7, "#ff3b00", "#ffd000", "#5a0a00"],
    ["Frostbite", 7, "#d9f6ff", "#ffffff", "#7ab8ff"],
    ["Venom", 8, "#b6ff00", "#eaff9e", "#4a0080"],
    ["Cyber", 9, "#00ffd5", "#b8fff4", "#ff00aa"],
    ["Midnight", 10, "#4a5aff", "#b8c0ff", "#0a0a3a"],
    ["Sunset", 12, "#ff8a3d", "#ffd1a8", "#c2344f"],
    ["Diamond", 15, "#e8fbff", "#ffffff", "#9ae6ff"],
    ["Galaxy", 20, "#8a5aff", "#ff8ad8", "#1a0a4a"],
    ["Rainbow", 30, "rainbow"],
  ];
  const ABILITY_SKINS = [
    // name, price, primary, secondary
    ["Holy Light", 2, "#fff3b0", "#ffd24a"],
    ["Frost Aura", 2, "#9ae6ff", "#ffffff"],
    ["Poison Cloud", 3, "#7dff4a", "#2e9e1a"],
    ["Hellfire", 3, "#ff5a1f", "#ffd000"],
    ["Arcane", 4, "#b36bff", "#4ae3ff"],
    ["Blood Moon", 4, "#c2002f", "#ff6b6b"],
    ["Nature", 4, "#3ecf5a", "#c9ff7a"],
    ["Tidal", 5, "#1fa2ff", "#7af0ff"],
    ["Fairy", 5, "#ff8ad8", "#fff3b0"],
    ["Void", 6, "#2a1a4a", "#b36bff"],
    ["Storm", 6, "#fff64a", "#4ae3ff"],
    ["Magma", 7, "#ff3b00", "#5a0a00"],
    ["Crystal", 7, "#d9f6ff", "#b8a0ff"],
    ["Toxic Neon", 8, "#b6ff00", "#ff00aa"],
    ["Hologram", 9, "#00ffd5", "#ff00aa"],
    ["Starlight", 10, "#ffffff", "#4a5aff"],
    ["Phoenix", 12, "#ff8a3d", "#ffe066"],
    ["Ghost", 15, "#e8e8ff", "#8a8aa0"],
    ["Cosmic", 20, "#8a5aff", "#ff8ad8"],
    ["Rainbow", 30, "rainbow"],
  ];
  const BG_SKINS = [
    // name, price, sky, fog, ground, light
    ["Sunny Day", 2, "#7ec8ff", "#bfe3ff", "#5a9e3a", "#fff6e0"],
    ["Sunset", 2, "#ff9a5a", "#ffb88a", "#6a4a2a", "#ffd0a0"],
    ["Night", 3, "#0a1030", "#10183a", "#1a2a1a", "#7a8aff"],
    ["Blood Moon", 3, "#3a0508", "#5a0a10", "#2a0a0a", "#ff4a4a"],
    ["Snowland", 4, "#dfefff", "#ffffff", "#f4f8ff", "#e0f0ff"],
    ["Desert Heat", 4, "#ffd89a", "#ffe8c0", "#d9a860", "#fff0c0"],
    ["Toxic Swamp", 5, "#3a5a1a", "#4a7a2a", "#2a3a10", "#b6ff00"],
    ["Deep Ocean", 5, "#0a3a6a", "#0f4d8a", "#0a2a4a", "#4ae3ff"],
    ["Candyland", 6, "#ffc8f0", "#ffe0f6", "#ff9ad8", "#fff0fa"],
    ["Volcano", 6, "#3a0a00", "#6a1a05", "#2a1a1a", "#ff6a1f"],
    ["Neon City", 7, "#0a0020", "#200a40", "#10101a", "#ff00aa"],
    ["Haunted", 7, "#1a1a2a", "#3a3a4a", "#1a1a14", "#9ae6ff"],
    ["Jungle", 8, "#2a6a3a", "#4a8a5a", "#1a4a1a", "#d9ffb0"],
    ["Frozen Cave", 8, "#1a3a5a", "#3a6a8a", "#bfe0ff", "#9ae6ff"],
    ["Golden Hour", 10, "#ffb84a", "#ffd08a", "#8a6a2a", "#ffe066"],
    ["Alien Planet", 12, "#3a0a5a", "#6a2a8a", "#1a4a3a", "#7dff4a"],
    ["Cyber Grid", 12, "#001a1a", "#003a3a", "#001010", "#00ffd5"],
    ["Storm", 15, "#2a2f3a", "#4a4f5a", "#2a3020", "#c8d0ff"],
    ["Outer Space", 20, "#000008", "#05051a", "#1a1a2a", "#b8a0ff"],
    ["Heaven", 30, "#fffaf0", "#ffffff", "#fff3d0", "#ffe066"],
  ];
  const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  const RAINBOW = "linear-gradient(90deg,#ff2d55,#ffd24a,#7dff4a,#4ae3ff,#b36bff,#ff2d55)";

  SHOP["Gun Skins"] = [
    { id: "gun-none", name: "Normal", price: 0 },
    { id: "gun-classic-blue", name: "Classic Blue", price: 0, skin: { rainbow: false, bullet: "#5aa9ff", glow: "#d6e9ff", trail: "#2a6fd6" } },
    ...GUN_SKINS.map(([name, price, bullet, glow, trail]) => ({
      id: "gun-" + slug(name), name, price,
      skin: bullet === "rainbow" ? { rainbow: true, bullet: "#ff2d55", glow: "#ffffff", trail: "#4ae3ff" } : { rainbow: false, bullet, glow, trail },
    })),
    // Secret: its shots flick through 5 code colours (see the skin cycler below).
    { id: "gun-codebreaker", name: "Code Breaker", price: 0, secret: true, cycleMs: 900,
      skin: { rainbow: false, bullet: "#00ff88", glow: "#d4ffe8", trail: "#00a85a" },
      cycle: [
        { bullet: "#00ff88", glow: "#d4ffe8", trail: "#00a85a" },
        { bullet: "#ffd24a", glow: "#fff3b0", trail: "#c98a00" },
        { bullet: "#ff2d55", glow: "#ffc2cf", trail: "#a3002a" },
        { bullet: "#4ae3ff", glow: "#d6f8ff", trail: "#0a7fa8" },
        { bullet: "#b36bff", glow: "#ead6ff", trail: "#6a1fd6" },
      ] },
  ];
  SHOP["Ability Skins"] = [
    { id: "ab-none", name: "Normal", price: 0 },
    { id: "ab-spark", name: "Spark", price: 0, skin: { rainbow: false, primary: "#fff1a8", secondary: "#ff9f43" } },
    ...ABILITY_SKINS.map(([name, price, primary, secondary]) => ({
      id: "ab-" + slug(name), name, price,
      skin: primary === "rainbow" ? { rainbow: true, primary: "#ff2d55", secondary: "#4ae3ff" } : { rainbow: false, primary, secondary },
    })),
    { id: "ab-agent", name: "Secret Agent", price: 0, secret: true, skin: { rainbow: false, primary: "#ffd24a", secondary: "#7a3cff" } },
  ];
  SHOP["Backgrounds"] = [
    { id: "bg-none", name: "Normal", price: 0 },
    { id: "bg-clear-sky", name: "Clear Sky", price: 0, skin: { sky: "#8fd3ff", fog: "#cfeeff", ground: "#6b8f4e", light: "#fffbe8" } },
    ...BG_SKINS.map(([name, price, sky, fog, ground, light]) => ({
      id: "bg-" + slug(name), name, price, skin: { sky, fog, ground, light },
    })),
    // Secret: every background, one after another.
    { id: "bg-everything", name: "Every Background", price: 0, secret: true, cycleMs: 8000,
      skin: { sky: BG_SKINS[0][2], fog: BG_SKINS[0][3], ground: BG_SKINS[0][4], light: BG_SKINS[0][5] },
      cycle: BG_SKINS.map(([, , sky, fog, ground, light]) => ({ sky, fog, ground, light })) },
  ];

  const SLOT = { Themes: "theme", Avatars: "avatar", Titles: "title", "Gun Skins": "gun", "Ability Skins": "ability", Backgrounds: "bg" };
  const SKIN_TABS = ["Gun Skins", "Ability Skins", "Backgrounds"];

  // ---------------------------------------------------------------- abilities
  // Small passive boosts, levels 1-5, bought with play coins. Every game has its OWN set
  // (own names, own levels). A game reads one with ArcadeShop.abilityValue(key), where key is
  // the short name below ("tough", "power"...) and the game is the one passed to setGame().
  // value = level × step; "{v}" in the text is replaced by it.
  const ABILITY_TAB = "⚡ Abilities";
  const ABILITY_MAX = 5;
  // 2, 4, 6, 8, 10 coins per level — Monster Attack!'s abilities cost 3× (6, 12, 18, 24, 30).
  const PRICE_MULT = { "monster-city": 3 };
  const abilityCost = (level, game) => bump((level + 1) * 2 * (PRICE_MULT[game] || 1));
  const GAME_NAMES = { "monster-city": "👾 Monster Attack!", buckshot: "🔫 Buckshot Roulette", rebuild: "🧟 REBUILD" };
  const ABILITIES = [
    // Monster Attack!
    { game: "monster-city", key: "tough",  emoji: "🛡️", name: "Monster Hide",   step: 10, text: "+{v}% max HP" },
    { game: "monster-city", key: "power",  emoji: "💥", name: "Heavy Hitter",   step: 8,  text: "+{v}% damage" },
    { game: "monster-city", key: "swift",  emoji: "👟", name: "Sprinter",       step: 5,  text: "+{v}% move speed" },
    { game: "monster-city", key: "reload", emoji: "🔫", name: "Fast Trigger",   step: 6,  text: "+{v}% fire rate" },
    { game: "monster-city", key: "greed",  emoji: "🍖", name: "Flesh Hunter",   step: 10, text: "+{v}% rotten flesh from kills" },
    { game: "monster-city", key: "regen",  emoji: "💚", name: "Mutant Healing", step: 1,  text: "heal {v}% of max HP every 2 seconds" },
    // Buckshot Roulette
    { game: "buckshot", key: "tough",   emoji: "🍀", name: "Lucky Charge", step: 15, text: "{v}% chance of a bonus charge each round" },
    { game: "buckshot", key: "power",   emoji: "🔥", name: "Hot Shell",    step: 10, text: "{v}% chance a live shot on the dealer does +1 damage" },
    { game: "buckshot", key: "regen",   emoji: "🩹", name: "Second Wind",  step: 10, text: "{v}% chance to heal 1 when you shoot yourself with a blank" },
    { game: "buckshot", key: "insight", emoji: "👁️", name: "Sharp Eyes",   step: 8,  text: "{v}% chance to see the shell at the start of your turn" },
    // REBUILD
    { game: "rebuild", key: "tough",  emoji: "🧱", name: "Reinforced Walls", step: 10, text: "+{v}% base HP" },
    { game: "rebuild", key: "power",  emoji: "⚔️", name: "Sharp Words",      step: 8,  text: "+{v}% unit damage" },
    { game: "rebuild", key: "swift",  emoji: "⚡", name: "Quick Hands",      step: 6,  text: "+{v}% unit attack speed" },
    { game: "rebuild", key: "energy", emoji: "💎", name: "Head Start",       step: 5,  text: "+{v} Energy at the start of each battle" },
    { game: "rebuild", key: "greed",  emoji: "🔷", name: "Shard Finder",     step: 10, text: "+{v}% Core Shards from levels" },
    { game: "rebuild", key: "regen",  emoji: "🔧", name: "Auto-Repair",      step: 1,  text: "base repairs {v} HP every 2 seconds" },
    // Secret agent abilities — one per game, from the all-codes reward. They add to several
    // of the game's normal effects at once (bonus), so no game needed new code for them.
    { game: "monster-city", key: "agent", emoji: "🕵️", name: "Agent Mode", secret: true, step: 0,
      bonus: { tough: 15, power: 15, swift: 10, reload: 10 }, text: "+15% max HP, +15% damage, +10% speed, +10% fire rate" },
    { game: "buckshot", key: "agent", emoji: "🕵️", name: "Agent's Luck", secret: true, step: 0,
      bonus: { insight: 25, tough: 25, power: 15 }, text: "25% see the shell, 25% bonus charge, 15% hot shell" },
    { game: "rebuild", key: "agent", emoji: "🕵️", name: "Agent Protocol", secret: true, step: 0,
      bonus: { energy: 20, power: 15, greed: 25 }, text: "+20 Energy, +15% unit damage, +25% Core Shards" },
  ].map((a) => ({ ...a, id: `${a.game}:${a.key}` }));
  let currentGame = null; // set by setGame(); limits the Abilities tab to this game's set

  const abilityLevel = (id, save = load()) => Math.max(0, Math.min(ABILITY_MAX, (save.abilities || {})[id] | 0));
  const abilityMax = (a) => (a.secret ? 1 : ABILITY_MAX);
  // Only the abilities switched on in the ⚡ bar count — up to ACTIVE_SLOTS per game.
  const ACTIVE_SLOTS = 3;
  function activeIds(game, save = load()) {
    const list = (save.active || {})[game];
    if (Array.isArray(list)) return list.filter((id) => abilityLevel(id, save) > 0).slice(0, ACTIVE_SLOTS);
    // Never chosen yet: the first learned ones are on.
    return ABILITIES.filter((a) => a.game === game && abilityLevel(a.id, save) > 0).slice(0, ACTIVE_SLOTS).map((a) => a.id);
  }
  // Sum of every switched-on ability that gives `key` (its own level × step, plus secret bonuses).
  // Admin Panel → 🚀 Super Mode: a big boost to every effect, in every game.
  const SUPER_BONUS = { tough: 50, power: 50, swift: 20, reload: 30, greed: 50, regen: 3, insight: 50, energy: 50 };
  // Where a key means something else in one game. Buckshot's regen is a % chance, not HP healed.
  const SUPER_BONUS_GAME = { buckshot: { regen: 50 } };
  function abilityValue(key, game = currentGame, save = load()) {
    const on = activeIds(game, save);
    const superOn = save.admin && save.admin.super;
    let v = superOn ? ((SUPER_BONUS_GAME[game] || {})[key] ?? SUPER_BONUS[key] ?? 0) : 0;
    for (const a of ABILITIES) {
      if (a.game !== game || !on.includes(a.id)) continue;
      if (a.key === key) v += abilityLevel(a.id, save) * a.step;
      if (a.bonus && a.bonus[key]) v += a.bonus[key];
    }
    return v;
  }
  const effectText = (a, level) => (a.secret ? a.text : a.text.replace("{v}", level * a.step));
  const find = (cat, id) => SHOP[cat].find((i) => i.id === id) || SHOP[cat][0];
  // Admin Panel → 🆓 Free Shop makes every price 0.
  const isFree = (save = load()) => !!(save.admin && save.admin.freeShop);
  // Every price is 5% higher than the number written in the catalog (rounded to whole coins).
  const PRICE_UP = 1.05;
  const bump = (n) => (n > 0 ? Math.max(1, Math.round(n * PRICE_UP)) : 0);
  const priceOf = (item, save) => (isFree(save) ? 0 : bump(item.price));
  const costOf = (lv, save, game) => (isFree(save) ? 0 : abilityCost(lv, game));

  // ---------------------------------------------------------------- codes
  // Each works once per save. Letters are matched without caring about case or spaces.
  const CODES = {
    // 🪙 1
    ARCADE1: 1, PLAYTIME: 1, DANIELROCKS: 1, MONSTER: 1, ZOMBIE: 1, BUCKSHOT: 1, REBUILD: 1,
    SPELLING: 1, NULLP: 1, COINRAIN: 1, GAMER: 1, LEVELUP: 1, POWERUP: 1, HEADSHOT: 1, SKINS: 1,
    SHOPPING: 1, FLESH: 1, SHARDS: 1, ROBERT: 1, BONUS: 1,
    // 🪙 2
    DOUBLE: 2, TWOCOINS: 2, SUPERFAN: 2, BOSSFIGHT: 2, JACKPOT: 2,
    // 🪙 3
    TRIPLE: 3, LEGEND: 3, MEGACOIN: 3, ARCADEKING: 3, DANIEL3000: 3,
  };
  const CODES_TAB = "🎁 Codes";
  const normCode = (c) => String(c || "").toUpperCase().replace(/[^A-Z0-9]/g, "");

  // Returns { ok, coins, msg }.
  function redeem(code) {
    const c = normCode(code);
    if (!c) return { ok: false, msg: "Type a code first." };
    if (!(c in CODES)) return { ok: false, msg: `❌ "${c}" isn't a code.` };
    let fresh = false;
    update((s) => {
      s.redeemed = s.redeemed || [];
      if (s.redeemed.includes(c)) return;
      s.redeemed.push(c);
      s.coins += CODES[c];
      fresh = true;
    });
    if (!fresh) return { ok: false, msg: `You already used ${c}.` };
    const reward = grantSecretReward();
    return { ok: true, coins: CODES[c], reward,
      msg: `🎁 ${c}: +🪙 ${CODES[c]}!` + (reward ? ` 🕵️ ALL ${Object.keys(CODES).length} CODES FOUND! +🪙 ${SECRET_COINS} and the Secret Agent pack!` : "") };
  }

  // Finding every code unlocks the Secret Agent pack, once.
  const SECRET_COINS = 10;
  const SECRET_ITEMS = ["agent", "gun-codebreaker", "ab-agent", "bg-everything"];
  function grantSecretReward() {
    let granted = false;
    update((s) => {
      if (s.secretReward || codesFound(s) < Object.keys(CODES).length) return;
      s.secretReward = true;
      s.coins += SECRET_COINS;
      s.owned = [...new Set([...s.owned, ...SECRET_ITEMS])];
      s.abilities = s.abilities || {};
      for (const a of ABILITIES) if (a.secret) s.abilities[a.id] = 1;
      granted = true;
    });
    return granted;
  }
  const codesFound = (save = load()) => (save.redeemed || []).filter((c) => c in CODES).length;

  // ---------------------------------------------------------------- save
  const fresh = () => ({
    coins: 0, progress: 0, total: 0, perGame: {},
    owned: ["galaxy", "smile", "rookie", "gun-none", "ab-none", "bg-none"],
    equipped: { theme: "galaxy", avatar: "smile", title: "rookie", gun: "gun-none", ability: "ab-none", bg: "bg-none" },
    abilities: {},
    active: {},
    redeemed: [],
  });

  function load() {
    const base = fresh();
    try {
      const stored = JSON.parse(localStorage.getItem(KEY) || "{}");
      return { ...base, ...stored,
        owned: [...new Set([...base.owned, ...(stored.owned || [])])],
        equipped: { ...base.equipped, ...(stored.equipped || {}) },
        abilities: { ...(stored.abilities || {}) },
        active: { ...(stored.active || {}) },
        redeemed: [...(stored.redeemed || [])] };
    } catch {
      return base;
    }
  }

  // Always re-read before writing: the arcade page and a game inside it both change the save.
  const INF_COINS = 999999999;
  const CHAMPION_STREAK = 10;
  const DEFAULT_IDS = ["galaxy", "smile", "rookie", "gun-none", "ab-none", "bg-none"];
  const FREE_ITEMS = () => Object.values(SHOP).flat().filter((i) => i.price === 0 && !i.secret && !DEFAULT_IDS.includes(i.id)).map((i) => i.id);
  let justF2P = false;
  let justChampion = false;
  // Show the Champion news once, from whoever caused it (a win, or equipping the Shadow skin).
  function announceChampion() {
    if (!justChampion) return false;
    justChampion = false;
    toast("🏆 CHAMPION! 10 wins in a row with the Shadow gun — title unlocked!");
    return true;
  }
  const isInf = (save = load()) => !!(save.admin && save.admin.infCoins);
  const coinText = (save = load()) => (isInf(save) ? "∞" : String(save.coins));

  function update(fn) {
    const save = load();
    fn(save);
    save.coins = Math.max(0, Math.min(CAPS.wallet, Math.floor(save.coins) || 0)); // never negative or fractional
    // Admin Panel → ♾️ Infinite Coins: a huge real number (Infinity can't be saved — it comes back
    // as 0), topped up after every change so spending never makes it go down. Shown as ∞.
    if (isInf(save)) save.coins = INF_COINS;
    // 👾 Free To Play Monster: own every FREE (price 0, not secret, not "Normal") shop item.
    if (!save.owned.includes("f2p") && FREE_ITEMS().every((id) => save.owned.includes(id))) {
      save.owned = [...save.owned, "f2p"];
      save.equipped.title = "f2p";
      justF2P = true;
    }
    // 🏆 Champion: 10 Buckshot wins in a row (ever) AND the Shadow gun skin on. Whichever comes
    // last grants it — the 10th win, or putting the skin on later.
    if (!save.owned.includes("champion") && ((save.buckshot && save.buckshot.best) || 0) >= CHAMPION_STREAK
        && save.equipped.gun === "gun-shadow") {
      save.owned = [...save.owned, "champion"];
      save.equipped.title = "champion";
      justChampion = true;
    }
    try { localStorage.setItem(KEY, JSON.stringify(save)); } catch {}
    return save;
  }

  // ---------------------------------------------------------------- caps
  // Limits that keep the coin economy fair. Daily ones reset at local midnight.
  const CAPS = {
    wallet: Infinity,    // no limit on how many play coins you can hold
    playPerDay: 24,      // play-time coins per day (6 hours)
    tradePerDay: 20,     // coins traded into ONE game's currency per day
    bugsPerDay: 5,       // bug reports per day
  };
  const todayKey = () => { const d = new Date(); return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`; };
  // The day's counters, reset when the date changes. Call inside update() to change them.
  function daily(save) {
    if (!save.daily || save.daily.day !== todayKey()) save.daily = { day: todayKey(), play: 0, bugs: 0, trade: {} };
    save.daily.trade = save.daily.trade || {};
    return save.daily;
  }
  const playLeft = (save = load()) => Math.max(0, CAPS.playPerDay - daily(save).play);
  const tradeLeft = (game, save = load()) => Math.max(0, CAPS.tradePerDay - (daily(save).trade[game] || 0));
  const bugsLeft = (save = load()) => Math.max(0, CAPS.bugsPerDay - daily(save).bugs);

  // What the games receive: { gun, ability, bg }, each null when "Normal" is equipped.
  function gameSkins(save = load()) {
    const pick = (cat) => {
      const item = find(cat, save.equipped[SLOT[cat]]);
      if (!item.skin) return null;
      const frame = item.cycle ? item.cycle[Math.floor(Date.now() / item.cycleMs) % item.cycle.length] : null;
      return { id: item.id, name: item.name, ...item.skin, ...(frame || {}) };
    };
    return { gun: pick("Gun Skins"), ability: pick("Ability Skins"), bg: pick("Backgrounds") };
  }

  function shareSkins(save = load()) {
    const skins = gameSkins(save);
    try { localStorage.setItem(SKINS_KEY, JSON.stringify(skins)); } catch {}
    return skins;
  }

  // ---------------------------------------------------------------- shop window
  const CSS = `
  .as-veil{position:fixed;inset:0;z-index:2147483000;display:flex;align-items:center;justify-content:center;padding:16px;
    background:rgba(0,0,0,.65);backdrop-filter:blur(4px);font-family:"Nunito",system-ui,-apple-system,"Segoe UI",sans-serif;color:#f3efff;
    --as-bg:#0d0b1a;--as-bg2:#171331;--as-card:#1d1840;--as-muted:#a79fcf;--as-line:rgba(255,255,255,.1);--as-coin:#ffd24a}
  .as-veil *{box-sizing:border-box;margin:0;padding:0;font-family:inherit}
  .as-box{width:min(760px,100%);max-height:88vh;overflow:auto;background:var(--as-bg);border:1px solid var(--as-line);border-radius:22px;padding:22px;box-shadow:0 30px 80px rgba(0,0,0,.6)}
  .as-head{display:flex;align-items:center;gap:12px;margin-bottom:6px}
  .as-head h2{font-size:1.25rem;font-weight:900;letter-spacing:.04em;margin-right:auto}
  .as-coins{font-weight:900;font-size:1.05rem;color:var(--as-coin);white-space:nowrap}
  .as-x{border:1px solid var(--as-line);background:var(--as-bg2);color:#f3efff;border-radius:10px;padding:8px 12px;cursor:pointer;font-weight:900}
  .as-sub{color:var(--as-muted);font-size:.88rem;margin-bottom:16px;line-height:1.5}
  .as-tabs{display:flex;gap:8px;margin-bottom:16px;flex-wrap:wrap}
  .as-tabs button{font-weight:700;padding:8px 14px;border-radius:999px;background:var(--as-bg2);color:var(--as-muted);border:1px solid var(--as-line);cursor:pointer;font-size:.9rem}
  .as-tabs button.on{background:var(--as-coin);color:#0d0b1a;border-color:var(--as-coin)}
  .as-items{display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:12px}
  .as-item{background:var(--as-card);border:1px solid var(--as-line);border-radius:16px;padding:12px;display:flex;flex-direction:column;align-items:center;gap:8px;text-align:center}
  .as-item.on{border-color:var(--as-coin);box-shadow:0 0 0 1px var(--as-coin) inset}
  .as-item b{font-weight:900;font-size:.95rem}
  .as-sw{width:100%;height:54px;border-radius:10px;display:grid;place-items:center;font-size:2rem;background:var(--as-bg2);position:relative}
  .as-sw.gun{display:flex;align-items:center;justify-content:center;gap:6px;font-size:1.6rem}
  .as-sw.gun i{width:56px;height:6px;border-radius:999px;background:var(--b);box-shadow:0 0 10px var(--g)}
  .as-sw .sun{position:absolute;top:8px;right:14px;width:14px;height:14px;border-radius:50%}
  .as-item button{width:100%;font-weight:900;border-radius:10px;padding:8px;border:0;cursor:pointer;font-size:.9rem}
  .as-buy{background:var(--as-coin);color:#0d0b1a}
  .as-buy:disabled{background:rgba(255,255,255,.08);color:var(--as-muted);cursor:not-allowed}
  .as-use{background:var(--as-bg2);color:#f3efff;border:1px solid var(--as-line)!important}
  .as-now{background:transparent;color:var(--as-coin);cursor:default!important}
  .as-cur{background:var(--as-card);border:1px solid var(--as-line);border-radius:16px;padding:20px;display:flex;flex-direction:column;gap:14px;align-items:center;text-align:center}
  .as-cur .rate{color:var(--as-muted);font-size:.95rem}
  .as-cur .row{display:flex;gap:8px;align-items:center;flex-wrap:wrap;justify-content:center}
  .as-cur input{width:110px;font:900 1.3rem system-ui,sans-serif;text-align:center;padding:8px;border-radius:12px;border:1px solid var(--as-line);background:var(--as-bg2);color:#f3efff}
  .as-cur .quick button{background:var(--as-bg2);color:#f3efff;border:1px solid var(--as-line);border-radius:999px;padding:6px 14px;font-weight:700;cursor:pointer}
  .as-cur .get{font-size:1.6rem;font-weight:900}
  .as-cur .go{background:var(--as-coin);color:#0d0b1a;border:0;border-radius:12px;padding:12px 26px;font-weight:900;font-size:1rem;cursor:pointer}
  .as-cur .go:disabled{background:rgba(255,255,255,.08);color:var(--as-muted);cursor:not-allowed}
  .as-abs{display:grid;grid-template-columns:repeat(auto-fill,minmax(210px,1fr));gap:12px}
  .as-ab{background:var(--as-card);border:1px solid var(--as-line);border-radius:16px;padding:14px;display:flex;flex-direction:column;gap:8px}
  .as-ab .top{display:flex;align-items:center;gap:10px}
  .as-ab .ico{font-size:1.8rem}
  .as-ab b{font-weight:900;font-size:1.05rem}
  .as-ab .pips{display:flex;gap:4px;margin-left:auto}
  .as-ab .pips i{width:10px;height:10px;border-radius:3px;background:rgba(255,255,255,.12)}
  .as-ab .pips i.on{background:var(--as-coin);box-shadow:0 0 6px var(--as-coin)}
  .as-ab .fx{font-size:.85rem;color:var(--as-muted);line-height:1.45}
  .as-ab .fx em{color:#f3efff;font-style:normal;font-weight:700}
  .as-ab button{font-weight:900;border-radius:10px;padding:8px;border:0;cursor:pointer;background:var(--as-coin);color:#0d0b1a;font-size:.9rem}
  .as-ab button:disabled{background:rgba(255,255,255,.08);color:var(--as-muted);cursor:not-allowed}
  .as-code{position:relative;background:var(--as-card);border:1px solid var(--as-line);border-radius:16px;padding:22px;display:flex;flex-direction:column;gap:12px;align-items:center;text-align:center}
  .as-code .as-secret{position:absolute;left:0;bottom:0;width:44px;height:44px;padding:0;border:0;background:transparent;opacity:0;cursor:default}
  .as-code input{width:min(280px,100%);font:900 1.2rem system-ui,sans-serif;text-align:center;letter-spacing:.08em;text-transform:uppercase;padding:10px;border-radius:12px;border:1px solid var(--as-line);background:var(--as-bg2);color:#f3efff}
  .as-code button{background:var(--as-coin);color:#0d0b1a;border:0;border-radius:12px;padding:11px 26px;font-weight:900;font-size:1rem;cursor:pointer}
  .as-code .msg{min-height:1.3em;font-weight:900}
  .as-code .found{color:var(--as-muted);font-size:.85rem}
  .as-toast{position:fixed;left:50%;bottom:24px;z-index:2147483001;transform:translate(-50%,140px);transition:transform .35s cubic-bezier(.2,1.4,.4,1);
    background:#ffd24a;color:#0d0b1a;font:900 1rem system-ui,sans-serif;padding:12px 20px;border-radius:14px;box-shadow:0 10px 30px rgba(0,0,0,.4)}
  .as-toast.show{transform:translate(-50%,0)}`;

  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  let styled = false;
  function style() {
    if (styled) return;
    styled = true;
    const el = document.createElement("style");
    el.textContent = CSS;
    document.head.appendChild(el);
  }

  let toastEl, toastTimer;
  function toast(msg) {
    style();
    if (!toastEl) {
      toastEl = document.createElement("div");
      toastEl.className = "as-toast";
      document.body.appendChild(toastEl);
    }
    toastEl.textContent = msg;
    // Force a layout so the slide-in plays even when the toast was just created.
    void toastEl.offsetWidth;
    toastEl.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove("show"), 2600);
  }

  function preview(cat, item) {
    const s = item.skin;
    if (cat === "Gun Skins") {
      return s
        ? `<div class="as-sw gun" style="--b:${s.rainbow ? RAINBOW : `linear-gradient(90deg, transparent, ${s.trail}, ${s.bullet})`};--g:${s.glow}">🔫<i></i></div>`
        : `<div class="as-sw gun">🔫</div>`;
    }
    if (cat === "Ability Skins") {
      return `<div class="as-sw" style="${s ? `background:${s.rainbow ? RAINBOW : `radial-gradient(circle, ${s.primary} 0 18%, ${s.secondary} 40%, var(--as-bg2) 72%)`}` : ""}">✨</div>`;
    }
    if (cat === "Backgrounds") {
      return s
        ? `<div class="as-sw" style="background:linear-gradient(${s.sky} 0 45%, ${s.fog} 45% 60%, ${s.ground} 60%)"><span class="sun" style="background:${s.light};box-shadow:0 0 12px ${s.light}"></span></div>`
        : `<div class="as-sw" style="font-size:.85rem;color:var(--as-muted)">game default</div>`;
    }
    if (cat === "Themes") {
      const v = item.vars;
      return `<div class="as-sw" style="background:linear-gradient(135deg, ${v.glow1}, ${v.bg} 60%, ${v.glow2});border:2px solid ${v.accent}"></div>`;
    }
    if (cat === "Avatars") return `<div class="as-sw">${item.emoji}</div>`;
    return `<div class="as-sw" style="font-size:.85rem;font-weight:900;color:var(--as-coin)">${esc(item.name)}</div>`;
  }

  // A game can sell its own money for play coins:
  //   ArcadeShop.registerCurrency({ name: "Rotten Flesh", emoji: "🍖", rate: 500, grant(amount) {...} })
  // rate = how much of the game's money one play coin buys. grant() must add it and save it.
  // Call it more than once to sell several things; each gets its own tab.
  const currencies = [];
  const tabOf = (c) => `${c.emoji} ${c.name}`;
  const curFor = (tab) => currencies.find((c) => tabOf(c) === tab);
  function registerCurrency(c) { currencies.push(c); }

  // Most coins that can go into this currency right now: wallet, today's trade cap, and how
  // much more the game can hold (currency.room(), in its own units, if it has a limit).
  // A play coin buys 5% less of a game's money than the game's own rate says.
  const rateOf = (c) => Math.max(1, Math.round(c.rate / PRICE_UP));

  function tradeMax(currency, save) {
    let max = Math.min(save.coins, tradeLeft(currentGame || "arcade", save));
    if (typeof currency.room === "function") max = Math.min(max, Math.floor(Math.max(0, currency.room()) / rateOf(currency)));
    return Math.max(0, max);
  }
  function renderCurrency(box, save, amount, currency) {
    const max = tradeMax(currency, save);
    const n = Math.max(0, Math.min(max, Math.floor(amount) || 0));
    const traded = CAPS.tradePerDay - tradeLeft(currentGame || "arcade", save);
    const full = typeof currency.room === "function" && currency.room() < rateOf(currency);
    box.innerHTML = `<div class="as-cur">
      <div class="rate">🪙 1 play coin = ${esc(currency.emoji)} ${rateOf(currency).toLocaleString()} ${esc(currency.name)}</div>
      ${currency.note ? `<div class="rate">${esc(typeof currency.note === "function" ? currency.note() : currency.note)}</div>` : ""}
      <div class="row">How many coins? <input type="number" min="1" max="${max}" value="${n}" data-amount></div>
      <div class="row quick">${[1, 5, 10].map((q) => `<button data-q="${q}" ${max < q ? "disabled" : ""}>${q}</button>`).join("")}<button data-q="${max}">Max (${max})</button></div>
      <div class="get">= ${esc(currency.emoji)} ${(n * rateOf(currency)).toLocaleString()}</div>
      <button class="go" data-trade ${n < 1 ? "disabled" : ""}>Trade 🪙 ${n}</button>
      <div class="rate">Today: ${traded} / ${CAPS.tradePerDay} coins traded here</div>
      ${full ? `<div class="rate">You're holding the most ${esc(currency.name)} you can — use some first.</div>`
        : traded >= CAPS.tradePerDay ? `<div class="rate">Daily trade cap reached — come back tomorrow.</div>`
        : save.coins < 1 ? `<div class="rate">No play coins yet — play for 15 minutes from the arcade to earn one.</div>` : ""}
    </div>`;
  }

  function renderAbilities(box, save) {
    const games = currentGame ? [currentGame] : Object.keys(GAME_NAMES);
    box.innerHTML = games.map((g) => {
      const cards = ABILITIES.filter((a) => a.game === g).map((a) => {
        const lv = abilityLevel(a.id, save);
        if (a.secret) {
          const isOn = lv && activeIds(a.game, save).includes(a.id);
          return `<div class="as-ab" style="border-color:#7a3cff"><div class="top"><span class="ico">${a.emoji}</span><b>${esc(a.name)}</b>
            <span class="pips" style="font-size:.7rem;color:#b9a2ff;font-weight:900">SECRET</span></div>
            <div class="fx">${lv ? `<em>${esc(a.text)}</em>${isOn ? " · ⚡ ON" : " · off (switch on in the ⚡ bar)"}` : `🔒 Find all ${Object.keys(CODES).length} codes to unlock`}</div>
            <button disabled>${lv ? "Unlocked ✓" : "🔒 Secret"}</button></div>`;
        }
        const isOn = lv && activeIds(a.game, save).includes(a.id);
        const now = lv ? `<em>${esc(effectText(a, lv))}</em>${isOn ? " · ⚡ ON" : " · off (switch on in the ⚡ bar)"}` : "not learned yet";
        const next = lv < ABILITY_MAX ? `<br>next: ${esc(effectText(a, lv + 1))}` : "";
        const btn = lv >= ABILITY_MAX ? `<button disabled>MAX</button>`
          : `<button data-lvl="${esc(a.id)}" ${save.coins < costOf(lv, save, a.game) ? "disabled" : ""}>${lv ? "Upgrade" : "Learn"} 🪙 ${costOf(lv, save, a.game)}</button>`;
        return `<div class="as-ab"><div class="top"><span class="ico">${a.emoji}</span><b>${esc(a.name)}</b>
          <span class="pips">${Array.from({ length: ABILITY_MAX }, (_, i) => `<i class="${i < lv ? "on" : ""}"></i>`).join("")}</span></div>
          <div class="fx">${now}${next}</div>${btn}</div>`;
      }).join("");
      return `${currentGame ? "" : `<h3 style="margin:14px 0 10px;font-weight:900">${esc(GAME_NAMES[g])}</h3>`}<div class="as-abs">${cards}</div>`;
    }).join("");
  }

  function abilitiesChanged(save = load()) {
    const levels = { ...save.abilities };
    try { window.applyArcadeAbilities && window.applyArcadeAbilities(levels); } catch (err) { console.warn("applyArcadeAbilities failed", err); }
    window.dispatchEvent(new CustomEvent("arcade-abilities-changed", { detail: levels }));
    renderBar();
  }

  // ---------------------------------------------------------------- ⚡ ability bar
  // A small tab on the left edge of the game. Open it to switch learned abilities on/off.
  const BAR_CSS = `
  .as-bar{position:fixed;left:0;top:50%;transform:translateY(-50%);z-index:2147482000;display:flex;align-items:center;
    font-family:"Nunito",system-ui,-apple-system,"Segoe UI",sans-serif;color:#f3efff;user-select:none}
  .as-bar *{box-sizing:border-box;margin:0;padding:0;font-family:inherit}
  .as-bar .tab{background:rgba(13,11,26,.85);border:1px solid rgba(255,255,255,.15);border-left:0;border-radius:0 12px 12px 0;
    padding:10px 8px;cursor:pointer;display:flex;flex-direction:column;align-items:center;gap:4px;font-weight:900;font-size:.75rem;backdrop-filter:blur(6px)}
  .as-bar .tab span{font-size:1.3rem}
  .as-bar .panel{display:none;background:rgba(13,11,26,.92);border:1px solid rgba(255,255,255,.15);border-radius:14px;padding:10px;margin-left:6px;
    width:220px;max-height:70vh;overflow:auto;backdrop-filter:blur(6px);box-shadow:0 10px 30px rgba(0,0,0,.5)}
  .as-bar.open .panel{display:block}
  .as-bar h4{font-size:.85rem;font-weight:900;margin-bottom:2px}
  .as-bar .hint{font-size:.72rem;color:#a79fcf;margin-bottom:8px;line-height:1.35}
  .as-bar .chip{width:100%;display:flex;align-items:center;gap:8px;padding:7px 8px;margin-bottom:6px;border-radius:10px;cursor:pointer;
    background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.1);color:#f3efff;text-align:left;font-size:.82rem}
  .as-bar .chip .ico{font-size:1.2rem}
  .as-bar .chip .lv{margin-left:auto;font-size:.7rem;color:#a79fcf;white-space:nowrap}
  .as-bar .chip.on{background:rgba(255,210,74,.16);border-color:#ffd24a;box-shadow:0 0 0 1px #ffd24a inset}
  .as-bar .chip.on .lv{color:#ffd24a}
  .as-bar .chip:disabled{opacity:.45;cursor:not-allowed}
  .as-bar .shop{width:100%;margin-top:2px;padding:7px;border:0;border-radius:10px;background:#ffd24a;color:#0d0b1a;font-weight:900;cursor:pointer;font-size:.8rem}`;

  // Cycling skins (Code Breaker, Every Background) move to their next frame here.
  let lastSkins = "";
  function tickSkins() {
    const skins = gameSkins();
    const json = JSON.stringify(skins);
    if (json === lastSkins) return;
    const first = !lastSkins;
    lastSkins = json;
    if (first) return; // the game already loaded these
    try { window.applyArcadeSkins && window.applyArcadeSkins(skins); } catch (err) { console.warn("applyArcadeSkins failed", err); }
  }

  let bar = null;
  function mountBar() {
    if (bar || !currentGame || !document.body) return;
    tickSkins();
    setInterval(tickSkins, 500);
    const st = document.createElement("style");
    st.textContent = BAR_CSS;
    document.head.appendChild(st);
    bar = document.createElement("div");
    bar.className = "as-bar";
    bar.innerHTML = `<div class="tab" title="Your abilities"><span>⚡</span><b data-count></b></div><div class="panel"></div>`;
    document.body.appendChild(bar);
    // The game must not see these clicks (no shooting through the bar, no stolen focus).
    for (const ev of ["mousedown", "mouseup", "pointerdown", "pointerup", "touchstart", "touchend", "wheel", "contextmenu"]) {
      bar.addEventListener(ev, (e) => e.stopPropagation());
    }
    bar.addEventListener("click", (e) => {
      e.stopPropagation();
      const t = e.target.closest("[data-toggle], .tab, .shop");
      if (!t) return;
      if (t.classList.contains("tab")) { bar.classList.toggle("open"); return renderBar(); }
      if (t.classList.contains("shop")) { bar.classList.remove("open"); return open({ tab: ABILITY_TAB }); }
      const id = t.dataset.toggle;
      let msg = "";
      const save = update((s) => {
        const on = activeIds(currentGame, s);
        const a = ABILITIES.find((x) => x.id === id);
        s.active = s.active || {};
        if (on.includes(id)) { s.active[currentGame] = on.filter((x) => x !== id); msg = `${a.emoji} ${a.name} off`; }
        else if (on.length < ACTIVE_SLOTS) { s.active[currentGame] = [...on, id]; msg = `${a.emoji} ${a.name} on!`; }
        else { s.active[currentGame] = on; msg = `Only ${ACTIVE_SLOTS} at once — switch one off first`; }
      });
      toast(msg);
      abilitiesChanged(save);
    });
    // Another tab or the arcade page changed something.
    window.addEventListener("storage", (e) => { if (e.key === KEY) renderBar(); });
    renderBar();
  }

  function renderBar() {
    if (!bar) return;
    const save = load();
    const mine = ABILITIES.filter((a) => a.game === currentGame);
    const learned = mine.filter((a) => abilityLevel(a.id, save) > 0);
    const on = activeIds(currentGame, save);
    bar.querySelector("[data-count]").textContent = `${on.length}/${ACTIVE_SLOTS}`;
    if (!bar.classList.contains("open")) return;
    bar.querySelector(".panel").innerHTML = `<h4>⚡ Abilities</h4>
      <div class="hint">Tap to switch on or off. Up to ${ACTIVE_SLOTS} at once.</div>
      ${learned.length ? learned.map((a) => {
        const lv = abilityLevel(a.id, save), isOn = on.includes(a.id);
        return `<button class="chip ${isOn ? "on" : ""}" data-toggle="${esc(a.id)}" ${!isOn && on.length >= ACTIVE_SLOTS ? "disabled" : ""}
          title="${esc(effectText(a, lv))}"><span class="ico">${a.emoji}</span><span>${esc(a.name)}</span><span class="lv">${isOn ? "ON · " : ""}Lv ${lv}</span></button>`;
      }).join("") : `<div class="hint">You haven't learned any yet.</div>`}
      <button class="shop">🛒 Learn & upgrade</button>`;
  }

  let veil = null;

  function close() {
    if (!veil) return;
    veil.remove();
    veil = null;
    document.removeEventListener("keydown", swallowKeys, true);
    document.removeEventListener("keyup", swallowKeys, true);
  }

  // While the shop is open the game must not see WASD, Escape, space...
  function swallowKeys(e) {
    e.stopPropagation();
    if (e.type === "keydown" && e.key === "Escape") { e.preventDefault(); close(); }
    // The code box's own listeners never see keys (stopped above), so Enter is handled here.
    if (e.type === "keydown" && e.key === "Enter" && e.target && e.target.dataset && e.target.dataset.code !== undefined) {
      e.preventDefault();
      const go = veil && veil.querySelector("[data-redeem]");
      if (go) go.click();
    }
  }

  function open(opts = {}) {
    // Codes (and the secret corner in them) only live in the arcade's own shop, never in a game's.
    const cats = opts.categories || [...currencies.map(tabOf), ABILITY_TAB, ...SKIN_TABS, ...(currentGame ? [] : [CODES_TAB])];
    let codeMsg = "";
    let amount = 1;
    let tab = opts.tab && cats.includes(opts.tab) ? opts.tab : cats[0];
    style();
    close();
    try { document.exitPointerLock && document.pointerLockElement && document.exitPointerLock(); } catch {}

    veil = document.createElement("div");
    veil.className = "as-veil";
    veil.innerHTML = `<div class="as-box" role="dialog" aria-label="Shop">
      <div class="as-head"><h2>🛒 ${esc(opts.title || (currencies.length ? "SHOP" : "SKIN SHOP"))}</h2><span class="as-coins"></span><button class="as-x" data-close>✕</button></div>
      <p class="as-sub">${esc(opts.subtitle || "Spend the arcade coins you earn by playing (1 every 15 minutes). Buy it once, keep it forever. Skins work in Monster Attack!, Buckshot Roulette and REBUILD.")}</p>
      <div class="as-tabs"></div><div class="as-items"></div></div>`;
    document.body.appendChild(veil);
    document.addEventListener("keydown", swallowKeys, true);
    document.addEventListener("keyup", swallowKeys, true);

    const render = () => {
      const save = load();
      veil.querySelector(".as-coins").textContent = "🪙 " + coinText(save);
      veil.querySelector(".as-tabs").innerHTML = cats
        .map((c) => `<button data-tab="${esc(c)}" class="${c === tab ? "on" : ""}">${esc(c)}</button>`).join("");
      const box = veil.querySelector(".as-items");
      const cur = curFor(tab);
      box.style.display = cur ? "block" : "";
      if (cur) return renderCurrency(box, save, amount, cur);
      box.style.display = tab === ABILITY_TAB ? "block" : box.style.display;
      if (tab === ABILITY_TAB) return renderAbilities(box, save);
      box.style.display = tab === CODES_TAB ? "block" : box.style.display;
      if (tab === CODES_TAB) {
        box.innerHTML = `<div class="as-code"><b>Got a code? Type it here.</b>
          <input data-code maxlength="24" placeholder="TYPE CODE..." autocomplete="off" spellcheck="false">
          <button data-redeem>Redeem</button><div class="msg">${esc(codeMsg)}</div>
          <div class="found">${codesFound(save)} / ${Object.keys(CODES).length} codes found</div>
          ${currentGame ? "" : `<button class="as-secret" data-secret tabindex="-1" aria-hidden="true"></button>`}</div>`;
        const inp = box.querySelector("[data-code]");
        setTimeout(() => inp.focus(), 0);
        return;
      }
      const slot = SLOT[tab];
      box.innerHTML = SHOP[tab].map((item) => {
        const owned = save.owned.includes(item.id);
        const on = save.equipped[slot] === item.id;
        const action = on ? `<button class="as-now" disabled>✓ Using</button>`
          : owned ? `<button class="as-use" data-use="${item.id}">Use</button>`
          : item.secret ? `<button class="as-buy" disabled>🔒 ${esc(item.lockText || "All codes")}</button>`
          : `<button class="as-buy" data-buy="${item.id}" ${save.coins < priceOf(item, save) ? "disabled" : ""}>${priceOf(item, save) === 0 ? "🆓 FREE" : "🪙 " + priceOf(item, save)}</button>`;
        return `<div class="as-item ${on ? "on" : ""}">${preview(tab, item)}<b>${esc(item.name)}</b>${action}</div>`;
      }).join("");
    };

    veil.addEventListener("click", (e) => {
      const t = e.target.closest("button") || e.target;
      if (t === veil || t.dataset.close !== undefined) return close();
      if (t.dataset.tab) { tab = t.dataset.tab; amount = 1; return render(); }
      const currency = curFor(tab);
      if (t.dataset.q) { amount = +t.dataset.q; return render(); }
      if (t.dataset.trade !== undefined && currency) {
        let spent = 0;
        update((s) => {
          const n = Math.max(0, Math.min(tradeMax(currency, s), Math.floor(amount) || 0));
          if (n >= 1) {
            s.coins -= n; spent = n;
            const d = daily(s); d.trade[currentGame || "arcade"] = (d.trade[currentGame || "arcade"] || 0) + n;
            s.stats = s.stats || {}; s.stats.trades = (s.stats.trades || 0) + 1; // for the Medium Quests
          }
        });
        if (!spent) return render();
        try {
          currency.grant(spent * rateOf(currency));
          toast(`${currency.emoji} +${(spent * rateOf(currency)).toLocaleString()} ${currency.name}!`);
        } catch (err) {
          console.warn("currency grant failed, refunding", err);
          update((s) => { s.coins += spent; const d = daily(s); d.trade[currentGame || "arcade"] -= spent; });
          toast("Something went wrong — your coins were given back.");
        }
        amount = 1;
        try { opts.onChange && opts.onChange(load()); } catch (err) { console.warn(err); }
        return render();
      }
      // Invisible bottom-left corner of the Codes tab — only in the arcade's own shop (never in
      // a game's): opens the arcade's Hard Quest / Admin Panel.
      if (t.dataset.secret !== undefined) {
        if (!currentGame && typeof window.arcadeSecret === "function") { close(); window.arcadeSecret(); }
        return;
      }
      if (t.dataset.redeem !== undefined) {
        const r = redeem(veil.querySelector("[data-code]").value);
        codeMsg = r.msg;
        if (r.ok) toast(r.msg);
        try { opts.onChange && opts.onChange(load()); } catch (err) { console.warn(err); }
        return render();
      }
      if (t.dataset.lvl) {
        const a = ABILITIES.find((x) => x.id === t.dataset.lvl);
        let to = 0;
        const save = update((s) => {
          s.abilities = s.abilities || {};
          const lv = abilityLevel(a.id, s);
          if (a.secret || lv >= abilityMax(a) || s.coins < costOf(lv, s, a.game)) return;
          s.coins -= costOf(lv, s, a.game);
          // Read what's switched on BEFORE learning, and save it as the explicit list: otherwise
          // the "first 3 learned" default could let a newly learned ability push one out.
          const on = activeIds(a.game, s);
          s.abilities[a.id] = to = lv + 1;
          s.active = s.active || {};
          s.active[a.game] = !on.includes(a.id) && on.length < ACTIVE_SLOTS ? [...on, a.id] : on;
        });
        if (to) toast(`${a.emoji} ${a.name} is now level ${to}!`);
        abilitiesChanged(save);
        try { opts.onChange && opts.onChange(save); } catch (err) { console.warn(err); }
        return render();
      }
      const buyId = t.dataset.buy, useId = t.dataset.use;
      if (!buyId && !useId) return;
      const slot = SLOT[tab];
      let bought = null;
      const save = update((s) => {
        if (buyId) {
          const item = find(tab, buyId);
          if (item.secret || s.coins < priceOf(item, s) || s.owned.includes(item.id)) return;
          s.coins -= priceOf(item, s);
          s.owned.push(item.id);
          s.equipped[slot] = item.id;
          bought = item;
        } else {
          s.equipped[slot] = useId;
        }
      });
      if (justF2P) { justF2P = false; toast("👾 FREE TO PLAY MONSTER! You collected every free item — title unlocked!"); }
      else if (!announceChampion() && bought) toast(`🎉 You got ${bought.name}!`);
      const skins = shareSkins(save);
      try { window.applyArcadeSkins && window.applyArcadeSkins(skins); } catch (err) { console.warn("applyArcadeSkins failed", err); }
      window.dispatchEvent(new CustomEvent("arcade-skins-changed", { detail: skins }));
      try { opts.onChange && opts.onChange(save); } catch (err) { console.warn(err); }
      render();
    });

    veil.addEventListener("input", (e) => {
      const currency = curFor(tab);
      if (e.target.dataset.amount === undefined || !currency) return;
      amount = +e.target.value;
      const save = load();
      const n = Math.max(0, Math.min(tradeMax(currency, save), Math.floor(amount) || 0));
      veil.querySelector(".as-cur .get").textContent = `= ${currency.emoji} ${(n * rateOf(currency)).toLocaleString()}`;
      const go = veil.querySelector("[data-trade]");
      go.textContent = `Trade 🪙 ${n}`;
      go.disabled = n < 1;
    });

    render();
  }

  window.ArcadeShop = {
    SHOP, SLOT, SKIN_TABS, SECONDS_PER_COIN, RAINBOW,
    find, load, update, gameSkins, shareSkins, open, close, toast, registerCurrency,
    ABILITIES, ABILITY_TAB, ABILITY_MAX, abilityLevel, abilityValue,
    setGame: (g) => {
      currentGame = g;
      if (document.body) mountBar();
      else document.addEventListener("DOMContentLoaded", mountBar, { once: true });
    },
    CAPS, daily, playLeft, tradeLeft, bugsLeft, isInf, coinText, CHAMPION_STREAK, announceChampion, FREE_ITEMS,
    ACTIVE_SLOTS, activeIds, CODES_TAB, grantSecretReward, CODES, SECRET_ITEMS, abilitiesChanged, redeem, codesFound, codeCount: () => Object.keys(CODES).length,
    abilityLevels: () => ({ ...(load().abilities || {}) }),
    isOpen: () => !!veil,
  };
})();
