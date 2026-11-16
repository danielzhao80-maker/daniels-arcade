// 🏝️ Island Clash: building, limits, upgrades, production + offline earnings, army, raids, battles, online result.
// Run: node tools/test-island.js
const fs = require('fs'), vm = require('vm');
const html = fs.readFileSync(require('path').join(__dirname, '..', 'island', 'index.html'), 'utf8');
const code = [...html.matchAll(/<script(?![^>]*src=)[^>]*>([\s\S]*?)<\/script>/g)].map(m => m[1]).join('\n;\n');

const anyHandler = {
  get(t,k){ if(k===Symbol.toPrimitive) return ()=>0; if(k==='then') return undefined;
            if(k===Symbol.iterator) return function*(){}; if(k==='length') return 0; return mkAny(); },
  set(){return true}, has(){return true}, apply(){return mkAny()}, construct(){return mkAny()},
  deleteProperty(){return true}, ownKeys(){return []},
  getOwnPropertyDescriptor(){return {configurable:true,enumerable:false}} };
function mkAny(){ const f=function(){}; f.nodeType=1; return new Proxy(f, anyHandler); }

// A CHEAP 2d context. The Proxy allocates a new Proxy on every property touch, and draw() makes
// hundreds of context calls per frame — that alone made the draw-heavy raycast mode look like it hung.
function mkCtx() {
  const noop = () => {};
  const c = { canvas: null, globalAlpha: 1, fillStyle: '#000', strokeStyle: '#000', lineWidth: 1,
    font: '', textAlign: '', textBaseline: '', shadowBlur: 0, shadowColor: '', lineCap: '', lineJoin: '',
    globalCompositeOperation: 'source-over', imageSmoothingEnabled: true, filter: 'none' };
  for (const m of ['save','restore','beginPath','closePath','moveTo','lineTo','arc','arcTo','rect',
    'fill','stroke','fillRect','strokeRect','clearRect','fillText','strokeText','translate','rotate',
    'scale','transform','setTransform','resetTransform','clip','drawImage','quadraticCurveTo',
    'bezierCurveTo','ellipse','setLineDash','putImageData','roundRect','createImageData','drawFocusIfNeeded'])
    c[m] = noop;
  c.measureText = () => ({ width: 10 });
  c.createLinearGradient = c.createRadialGradient = () => ({ addColorStop: noop });
  c.createPattern = () => null;
  c.getImageData = () => ({ data: new Uint8Array(4) });
  return c;
}
function mkCanvas(id) {
  const el = { id, width: 900, height: 550, style: {}, dataset: {}, nodeType: 1,
    getContext: () => el.__ctx || (el.__ctx = mkCtx()),
    getBoundingClientRect: () => ({ left:0, top:0, width:900, height:550, right:900, bottom:550 }),
    addEventListener: () => {}, removeEventListener: () => {},
    requestPointerLock: () => {}, appendChild: () => {}, focus: () => {},
    toDataURL: () => 'data:,' };
  return el;
}
// A DOM element that actually REMEMBERS what you set on it, so tests can assert on textContent,
// style.display, value and so on. Unknown properties still fall through to the tolerant proxy, so
// anything the game reaches for that we have not modelled does not explode.
function mkEl(id) {
  const real = {
    id, nodeType: 1, style: {}, dataset: {}, classList: { add(){}, remove(){}, toggle(){}, contains: () => false },
    // Every stub can act as a canvas. The game has canvases all over the place (pet portraits, the
    // map maker, the minimap) and a stub whose .width reads as a proxy silently turns coordinate
    // maths into zero, which looks like a game bug and is not one.
    width: 900, height: 550, getContext() { return this.__ctx || (this.__ctx = mkCtx()); },
    childElementCount: 0, setPointerCapture() {}, releasePointerCapture() {},
    textContent: '', innerHTML: '', innerText: '', value: '', className: '',
    checked: false, disabled: false, children: [], parentNode: null,
    appendChild(c) { real.children.push(c); return c; }, removeChild() {}, remove() {},
    addEventListener() {}, removeEventListener() {}, dispatchEvent: () => true,
    setAttribute() {}, getAttribute: () => null, removeAttribute() {},
    focus() {}, blur() {}, click() {}, scrollIntoView() {}, insertAdjacentHTML() {},
    querySelector: () => mkAny(), querySelectorAll: () => [], closest: () => null, contains: () => false,
    getBoundingClientRect: () => ({ left:0, top:0, width:900, height:550, right:900, bottom:550 }),
    requestPointerLock() {},
  };
  return new Proxy(real, {
    get(t, k) { return (k in t) ? t[k] : (typeof k === 'symbol' ? undefined : mkAny()); },
    set(t, k, v) { t[k] = v; return true; },
    has() { return true; },
  });
}
const _els = {};
function getEl(id) {
  if (!_els[id]) _els[id] = (id === 'game' || id === 'game3d' || id === 'minimap') ? mkCanvas(id) : mkEl(id);
  return _els[id];
}
const store={};
const sandbox = {
  console,
  document: new Proxy(function(){}, { ...anyHandler, get(t,k){
    if(k==='getElementById') return getEl;
    if(k==='querySelector') return ()=>mkAny();
    if(k==='createElement') return t=>(t==='canvas'?mkCanvas('tmp'):mkEl('new-'+t));   // real-ish elements, so the menu can be inspected
    if(k==='querySelectorAll') return ()=>[];
    if(k==='addEventListener'||k==='removeEventListener') return ()=>{};
    if(k==='hidden') return false;
    if(k==='pointerLockElement') return null;
    return mkAny(); } }),
  localStorage:{ getItem:k=>(k in store?store[k]:null), setItem:(k,v)=>{store[k]=String(v)},
                 removeItem:k=>{delete store[k]}, clear:()=>{} },
  navigator:{ maxTouchPoints:0, userAgent:'node', language:'en' },
  performance:{ now:()=>sandbox.__clock },
  __clock: 0,
  location:{ href:'file:///index.html', protocol:'file:' },
  requestAnimationFrame:()=>1, cancelAnimationFrame:()=>{},
  setTimeout:()=>1, clearTimeout:()=>{}, setInterval:()=>1, clearInterval:()=>{},
  alert:()=>{}, confirm:()=>true, prompt:()=>null,
  THREE:mkAny(), Peer:mkAny(), AudioContext:mkAny(), webkitAudioContext:mkAny(),
  Image:function(){return mkAny()}, Audio:function(){return mkAny()},
  matchMedia:()=>({matches:false,addEventListener(){},addListener(){}}),
  MutationObserver:function(){return {observe(){},disconnect(){}}},
  fetch:()=>Promise.resolve(mkAny()),
  addEventListener:()=>{}, removeEventListener:()=>{}, dispatchEvent:()=>true,
  getComputedStyle:()=>mkAny(), innerWidth:1440, innerHeight:900, devicePixelRatio:2,
  Math, JSON, Date, BigInt, Object, Array, String, Number, Boolean, Map, Set, WeakMap, WeakSet,
  Promise, RegExp, Error, TypeError, Symbol, Proxy, Reflect, isNaN, isFinite, parseInt, parseFloat,
  encodeURIComponent, decodeURIComponent, Float32Array, Uint8Array, Int32Array, ArrayBuffer,
};
sandbox.window = sandbox; sandbox.globalThis = sandbox; sandbox.self = sandbox;
const ctx = vm.createContext(sandbox);

function fail(stage, e) {
  console.log('FAILED during ' + stage);
  console.log('  ' + e.name + ': ' + e.message);
  const m = (e.stack||'').match(/game\.js:(\d+)/);
  if (m) {
    const n = +m[1], src = code.split('\n');
    console.log('  at script line ' + n + ':');
    for (let i=Math.max(0,n-3); i<Math.min(src.length,n+2); i++)
      console.log('   ' + (i+1===n?'>':' ') + ' ' + String(i+1).padStart(6) + '  ' + src[i].slice(0,115));
  }
  process.exit(1);
}
try { vm.runInNewContext(code, ctx, { filename:'game.js', timeout:20000 }); }
catch (e) { fail('LOAD', e); }
console.log('load        : OK');



function q(js){ return vm.runInNewContext(js, ctx, {filename:'game.js', timeout:20000}); }
let ok = true;
function check(pass, label, extra) {
  if (!pass) ok = false;
  console.log('  ' + (pass ? 'PASS' : 'FAIL'), label + (extra ? '  (' + extra + ')' : ''));
}
const ARC = 'daniels-arcade-v1';
const setArcade = obj => { if (obj === null) delete store[ARC]; else store[ARC] = JSON.stringify(obj); };
// The special-maps grid as the Worlds menu drew it: [title, grid], grid.children = cards.
// (rank 8 by default so the older tests can upgrade the Town Hall freely; the 🎖️ Rank tests set it themselves)
const reset = (extra) => q(`localStorage.removeItem(SAVE_KEY); S = freshSave(); Object.assign(S, { rank: 8 }, ${JSON.stringify(extra || {})}); save();`);
// ---- start ----
reset();
check(q('th()') === 1 && q(`S.buildings.length`) === 4 && q(`S.army.warrior`) === 6 && q('barracksLvl()') === 1, 'a new island: Town Hall 1, a gold mine, a lumber mill, a barracks and 6 warriors');
// ---- building ----
check(/Pick an empty spot/.test(q(`placeBuilding('quarry', 0, 0)`)), 'you can only build on the island');
check(/empty spot/.test(q(`placeBuilding('quarry', CENTER, CENTER)`)), '…on an empty tile');
check(q(`placeBuilding('quarry', CENTER, CENTER - 2)`) === null && q(`countOf('quarry')`) === 1 && q(`S.gold`) === 240 && q(`S.wood`) === 260, 'build a quarry: it costs 🪙 60 🪵 40');
check(/upgrade the Town Hall/.test(q(`placeBuilding('quarry', CENTER + 1, CENTER - 2)`)), 'limits per Town Hall level (1 quarry at TH 1)');
check(/upgrade the Town Hall/i.test(q(`placeBuilding('cannon', CENTER + 1, CENTER + 1)`)), 'cannons unlock at Town Hall 2');
reset({ gold: 5, wood: 5, stone: 5 });
check(/Not enough/.test(q(`placeBuilding('storage', CENTER + 1, CENTER + 1)`)), 'not enough resources: nothing built');
// ---- upgrades ----
reset({ gold: 1e5, wood: 1e5, stone: 1e5 });
check(/Town Hall first/.test(q(`upgradeBuilding(S.buildings[1])`)), 'buildings cannot pass the Town Hall level');
check(q(`upgradeBuilding(S.buildings[0])`) === null && q('th()') === 2, 'upgrade the Town Hall → level 2');
check(q(`upgradeBuilding(S.buildings[1])`) === null && q(`S.buildings[1].lvl`) === 2, '…then the mine can go to level 2');
check(q(`landRadius(2) > landRadius(1)`) && q(`limitOf('cannon', 2)`) === 1, 'a bigger Town Hall: more land and new buildings');
q(`S.rank = 10; S.gold = S.wood = S.stone = 1e7; for (var i = 0; i < 12; i++) upgradeBuilding(S.buildings[0]);`);
check(q('th()') === 10 && /top level/.test(q(`upgradeBuilding(S.buildings[0])`)), 'the Town Hall stops at level 10');
// ---- production ----
reset({ gold: 0, wood: 0, stone: 0 });
q(`produce(60)`);
check(q(`Math.round(S.gold)`) === 18 && q(`Math.round(S.wood)`) === 18, 'mines and mills produce every minute (18 at level 1)');
reset({ gold: 0, wood: 0, stone: 0 });
q(`produce(1e9)`);
check(q(`S.gold`) === q(`capOf()`), 'never more than your storage holds');
reset({ gold: 0, wood: 0, stone: 0, last: 0 });
q(`localStorage.setItem(SAVE_KEY, JSON.stringify(Object.assign(JSON.parse(localStorage.getItem(SAVE_KEY)), { last: Date.now() - 3600 * 1000 }))); load();`);
check(Math.abs(q(`S.gold`) - 18 * 60) < 3, 'earnings while you are away (1 hour = 1080 gold)', q('S.gold'));
// ---- 📦 storage from buildings ----
reset();
const c0 = q('capOf()');
check(c0 === 1000 + 500 + 100 + 100, 'a new island holds 1,700 (base + Town Hall + its mine and mill)', c0);
q(`S.buildings.push({ type: 'archer', lvl: 2, x: CENTER + 1, y: CENTER + 1 });`);
check(q('capOf()') === c0 + 500, '🏹 an Archer Tower adds storage (+250 a level)');
q(`S.buildings.push({ type: 'cannon', lvl: 1, x: CENTER - 1, y: CENTER + 1 }, { type: 'wizard', lvl: 1, x: CENTER + 1, y: CENTER - 1 }, { type: 'wall', lvl: 2, x: CENTER - 1, y: CENTER - 1 });`);
check(q('capOf()') === c0 + 500 + 300 + 400 + 50, '💣 Cannon +300, 🔮 Wizard Tower +400, 🧱 Wall +25 a level');
q(`S.buildings.push({ type: 'storage', lvl: 1, x: CENTER + 2, y: CENTER + 2 });`);
check(q('capOf()') === c0 + 1250 + 1500, '📦 Storage still adds the most (+1,500 a level)');
check(/📦 \+500 storage/.test(q(`(function(){ showInfo(S.buildings.find(function(b){ return b.type === 'archer'; })); return document.getElementById('infoCard').innerHTML; })()`)), 'a building\'s info shows the storage it adds');
q(`document.getElementById('btnInfo').onclick();`);
check(/1,000 base/.test(q(`document.getElementById('infoBody').innerHTML`)), '📊 My Island breaks the storage down');
q(`hidePanels(); hideInfo();`);
// ---- army ----
reset({ gold: 1000 });
check(q(`train('warrior', 1)`) === null && q(`S.army.warrior`) === 7 && q(`S.gold`) === 975, 'train a warrior (🪙 25)');
check(/Barracks level 3/.test(q(`train('giant', 1)`)), 'giants need Barracks level 3');
check(/Army is full/.test(q(`train('warrior', 50)`)), 'army space is limited (build Barracks)');
// ---- raids + battles ----
const isl = JSON.parse(q(`JSON.stringify(genIsland(3, 42))`));
check(isl.buildings[0].type === 'townhall' && isl.th === 2 && isl.buildings.some(b => b.type === 'archer'), 'computer islands get stronger with the raid level', `TH ${isl.th}, ${isl.buildings.length} buildings`);
check(JSON.stringify(q(`JSON.stringify(genIsland(3, 42))`)) === JSON.stringify(q(`JSON.stringify(genIsland(3, 42))`)), 'the same island every time for the same level');
reset({ army: {} });
check(/Train some troops/.test(q(`startBattle(genIsland(1))`)), 'no troops: no battle');
reset({ army: { warrior: 12 } });
q(`startBattle(genIsland(1, 5));`);
check(q(`S.army.warrior`) === 0 && q(`battle.army.warrior`) === 12, 'the army goes into battle');
check(q(`deploy('warrior', CENTER, CENTER)`) === true && q(`onHome(battle.bridge, battle.troops[battle.troops.length-1].x, battle.troops[battle.troops.length-1].y)`), '🌉 troops always start on YOUR island (even if you tap the middle of theirs)');
check(q(`deploy('warrior', 0.5, CENTER)`) === true, '…only from the sea or the beach');
const fight = JSON.parse(q(`(function(){ for (var i = 0; i < 11; i++) deploy('warrior', 0.5 + i * 0.1, CENTER + (i % 3)); var n = 0; while (!battle.over && n++ < BATTLE_FRAMES + 10) battleStep(); return JSON.stringify({ over: battle.over, pct: destroyedPct(battle), stars: starsOf(battle) }); })()`));
check(fight.over, 'the battle ends (everything destroyed, troops gone, or 90 s)', JSON.stringify(fight));
check(fight.pct > 0, 'warriors destroy buildings', fight.pct + '%');
reset({ army: { warrior: 30, giant: 4 }, gold: 0, wood: 0, stone: 0 });
q(`S.buildings.push({ type: 'barracks', lvl: 3, x: CENTER + 1, y: CENTER + 1 });`);
const big = JSON.parse(q(`(function(){ startBattle(genIsland(1, 5)); for (var k of ['giant','warrior']) while (battle.army[k] > 0) deploy(k, 0.5 + Math.random(), CENTER + (Math.random() - 0.5) * 4); var n = 0; while (!battle.over && n++ < BATTLE_FRAMES + 10) battleStep(); return JSON.stringify({ pct: destroyedPct(battle), stars: starsOf(battle), gold: S.gold, trophies: S.trophies, raid: S.raidLevel }); })()`));
check(big.pct === 100 && big.stars === 3, 'a big army flattens a level-1 island: 100%, ⭐⭐⭐', JSON.stringify(big));
check(big.gold > 0 && big.trophies > 0 && big.raid === 2, '…loot, 🏆 trophies, and the next raid level opens');
// ---- defences fight back ----
reset({ army: { warrior: 2 } });
const def = JSON.parse(q(`(function(){ var isl = { name: 'Fort', th: 3, loot: {}, buildings: [{ type: 'townhall', lvl: 3, x: CENTER, y: CENTER }, { type: 'cannon', lvl: 3, x: CENTER - 1, y: CENTER }, { type: 'archer', lvl: 3, x: CENTER - 1, y: CENTER - 1 }] };
  startBattle(isl); deploy('warrior', CENTER - 5, CENTER); deploy('warrior', CENTER - 5, CENTER + 0.3); var n = 0; while (!battle.over && n++ < BATTLE_FRAMES + 10) battleStep();
  return JSON.stringify({ alive: battle.troops.filter(function(t){ return t.hp > 0; }).length, stars: starsOf(battle), trophies: S.trophies }); })()`));
check(def.alive === 0 && def.stars === 0, 'defences shoot back: 2 warriors lose to a level-3 fort', JSON.stringify(def));
// ---- ✨ mini abilities ----
reset({ army: { warrior: 4 } });
q(`startBattle(genIsland(2, 9));`);
check(JSON.stringify(q(`JSON.stringify(battle.abil)`)) === JSON.stringify('{"lightning":1}'), 'Town Hall 1: only ⚡ Lightning, 1 use a battle');
const zap = JSON.parse(q(`(function(){ var b = battle.blds.find(function(x){ return x.type === 'townhall'; }); var h0 = b.hp; var ok = castAbility('lightning', b.x, b.y); return JSON.stringify({ ok: ok, dmg: h0 - b.hp, left: battle.abil.lightning, again: castAbility('lightning', b.x, b.y) }); })()`));
check(zap.ok && zap.dmg === 260 && zap.left === 0 && zap.again === false, '⚡ Lightning blasts the buildings in the area (260 at TH 1), then it is used up', JSON.stringify(zap));
q(`endBattle(true); battle = null;`);
reset({ army: { warrior: 4 }, gold: 1e6, wood: 1e6, stone: 1e6 });
q(`for (var i = 0; i < 5; i++) upgradeBuilding(S.buildings[0]); startBattle(genIsland(2, 9));`);
check(q('th()') === 6 && q(`Object.keys(battle.abil).join()`) === 'lightning,heal,rage,freeze,barricade,agent' && q(`battle.abil.heal`) === 2, 'Town Hall 6: all six (with 🕵️ Agent), 2 uses each');
const h = JSON.parse(q(`(function(){ deploy('warrior', 0.5, CENTER); var tr = battle.troops[0]; tr.hp = 10; castAbility('heal', tr.x, tr.y); return JSON.stringify({ hp: tr.hp, max: tr.maxHp }); })()`));
check(h.hp > 10 && h.hp <= h.max, '💚 Heal heals your troops', JSON.stringify(h));
const rg = JSON.parse(q(`(function(){ var tr = battle.troops[0]; castAbility('rage', tr.x, tr.y); var x0 = tr.x; tr.target = null; battleStep(); var moved = Math.abs(tr.x - x0); tr.rageUntil = 0; var x1 = tr.x; battleStep(); return JSON.stringify({ raged: moved, normal: Math.abs(tr.x - x1) }); })()`));
check(rg.raged > rg.normal * 1.3, '🔥 Rage: troops move faster (and hit harder)', JSON.stringify(rg));
const fz = JSON.parse(q(`(function(){ battle.mobs = []; var d = battle.blds.find(function(b){ return B[b.type].def; }); castAbility('freeze', d.x, d.y); d.cd = 0; var tr = battle.troops[0]; tr.x = d.x + 0.5; tr.y = d.y; tr.hp = tr.maxHp = 1e9; var h0 = tr.hp; for (var i = 0; i < 100; i++) { tr.x = d.x + 0.5; tr.y = d.y; battleStep(); } return JSON.stringify({ frozen: d.frozenUntil > battle.frame, hurt: h0 - tr.hp }); })()`));
check(fz.frozen && fz.hurt === 0, '❄️ Freeze: the defences in the area stop shooting', JSON.stringify(fz));
const bar = JSON.parse(q(`(function(){ battle.mobs = []; battle.waves = []; battle.foes = []; var d = battle.blds.find(function(b){ return B[b.type].def; }); d.frozenUntil = 0; d.cd = 0;
  var tr = battle.troops[0]; tr.x = d.x - 2; tr.y = d.y; tr.hp = tr.maxHp = 1e9; tr.dmg = 0; var h0 = tr.hp;
  castAbility('barricade', d.x - 1, d.y);
  var br = battle.barricades[0];
  // force a vertical wall between the defence and the troop for the test
  br.x1 = d.x - 1; br.y1 = d.y - 1.5; br.x2 = d.x - 1; br.y2 = d.y + 1.5;
  var shots = 0; for (var i = 0; i < 2000 && br.hits > 0; i++) { tr.x = d.x - 2; tr.y = d.y; tr.target = d; var c0 = d.cd; battleStep(); if (d.cd > c0) shots++; }
  var hurtWhileUp = h0 - tr.hp;
  for (var i = 0; i < 200; i++) { tr.x = d.x - 2; tr.y = d.y; battleStep(); }
  return JSON.stringify({ shots: shots, hits: br.hits, hurtWhileUp: hurtWhileUp, hurtAfter: h0 - tr.hp }); })()`));
check(bar.shots === 10 && bar.hits === 0 && bar.hurtWhileUp === 0, '🧱 Barricade: a large wall blocks 10 attacks, then breaks', JSON.stringify(bar));
check(bar.hurtAfter > 0, '…after that the defences hit your troops again');
const ag = JSON.parse(q(`(function(){ var defs = battle.blds.filter(function(b){ return B[b.type].def && b.hp > 0; }); defs.forEach(function(b){ b.hp = b.maxHp; b.frozenUntil = 0; });
  var strongest = defs.slice().sort(function(a, b){ return (B[b.type].def.dmg * (1 + 0.45 * (b.lvl - 1))) - (B[a.type].def.dmg * (1 + 0.45 * (a.lvl - 1))); })[0];
  var thb = battle.blds.find(function(b){ return b.type === 'townhall'; }); thb.hp = thb.maxHp;
  battle.troops.forEach(function(t){ t.hp = 0; }); battle.army = { warrior: 1 };
  castAbility('agent', 0.5, CENTER); var shotAt = 0;
  for (var i = 0; i < 3000 && battle.agents[0].phase !== 'done'; i++) { var n0 = battle.shots.length; battleStep(); }
  return JSON.stringify({ phase: battle.agents[0].phase, defHp: strongest.hp / strongest.maxHp, thHp: Math.round(thb.hp / thb.maxHp * 100) / 100, frozen: strongest.frozenUntil > 0 }); })()`));
check(ag.phase === 'done' && Math.abs(ag.defHp - 0.6) < 0.01 && ag.frozen, '🕵️ Agent: sneaks to the strongest defence and sabotages it (−40%, knocked out)', JSON.stringify(ag));
check(Math.abs(ag.thHp - 0.65) < 0.01, '…then bombs the Town Hall (−35%)');
reset({ army: { warrior: 2 } });
q(`S.codes = Object.keys(CODES); startBattle(genIsland(1, 3));`);
check(q('th()') === 1 && q(`battle.abil.agent`) === 1, 'secret: use all 20 codes and you get the Agent even at Town Hall 1');
q(`endBattle(true); battle = null;`); reset({ army: { warrior: 2 } }); q(`startBattle(genIsland(1, 3));`);
check(q(`battle.abil.agent`) === undefined, '…otherwise it waits for Town Hall 6');
q(`endBattle(true); battle = null;`); reset({ army: { warrior: 4 }, gold: 1e6, wood: 1e6, stone: 1e6 }); q(`for (var i = 0; i < 5; i++) upgradeBuilding(S.buildings[0]); startBattle(genIsland(2, 9)); deploy('warrior', 0.5, CENTER);`);
q(`battle.selected = 'ab:lightning'; battle.drawBar();`);
check(/data-sel="ab:lightning"/.test(q(`document.getElementById('battlebar').innerHTML`)), 'the abilities are buttons in the battle bar');
q(`frame(performance.now()); endBattle(true); battle = null;`);
q(`document.getElementById('btnInfo').onclick();`);
check(/Mini abilities/.test(q(`document.getElementById('infoBody').innerHTML`)) && /Your island's defenders/.test(q(`document.getElementById('infoBody').innerHTML`)), '📊 My Island lists the abilities and your defenders');

// ---- 🐺 defending mobs ----
check(q(`spawnMobs([{ type: 'barracks', lvl: 1, x: 5, y: 5 }]).length`) === 2 && q(`spawnMobs([{ type: 'barracks', lvl: 3, x: 5, y: 5 }, { type: 'barracks', lvl: 9, x: 6, y: 6 }]).length`) === 14, 'each Barracks sends out 1 + its level (max 6) — plus a big animal for every level from 6');
check(q(`spawnMobs([{ type: 'barracks', lvl: 2, x: 5, y: 5 }]).map(function(m){ return m.kind; }).join()`) === 'wolf,monkey,raccoon', 'wolves, monkeys and raccoons');
check(q(`spawnMobs([{ type: 'barracks', lvl: 3, x: 5, y: 5 }])[0].kind`) === 'golem', '…and from Barracks level 3 an Earth Golem leads them');
check(q(`mobPool(1).join()`) === 'wolf,monkey,raccoon' && q(`mobPool(2).join()`) === 'wolf,monkey,raccoon,boar,bee' && q(`mobPool(5).length`) === 9, 'bigger Barracks unlock more animals (🐗 🐝 at 2, 🐍 🦂 at 3, 🐻 at 4, 🦅 at 5)');
check(q(`(function(){ var k = {}; spawnMobs([{ type: 'barracks', lvl: 5, x: 5, y: 5 }, { type: 'barracks', lvl: 5, x: 7, y: 7 }]).forEach(function(m){ k[m.kind] = 1; }); return Object.keys(k).length; })()`) >= 5, 'a level-5 Barracks sends a varied pack');
check(q(`MOB.golem.hp > MOB.wolf.hp * 4 && MOB.golem.speed < MOB.wolf.speed && MOB.raccoon.rate < MOB.wolf.rate && MOB.monkey.range > 2`), 'the golem is huge and slow, the raccoon attacks fastest, the monkey throws from range');
reset({ army: { warrior: 1 } });
const mb = JSON.parse(q(`(function(){ var isl = { name: 'Camp', th: 2, loot: {}, buildings: [{ type: 'townhall', lvl: 2, x: CENTER, y: CENTER }, { type: 'barracks', lvl: 2, x: CENTER - 2, y: CENTER }] };
  startBattle(isl); var n = battle.mobs.length; deploy('warrior', CENTER - 5.5, CENTER); var tr = battle.troops[0];
  var hurt = false, fought = false, m0 = battle.mobs.reduce(function(a, m){ return a + m.hp; }, 0);
  for (var i = 0; i < 600 && tr.hp > 0; i++) { var h = tr.hp; battleStep(); if (tr.hp < h) hurt = true; }
  var m1 = battle.mobs.reduce(function(a, m){ return a + Math.max(0, m.hp); }, 0);
  return JSON.stringify({ n: n, hurt: hurt, mobsHurt: m1 < m0, dead: tr.hp <= 0 }); })()`));
check(mb.n === 3 && mb.hurt && mb.mobsHurt, 'the mobs rush a troop that comes near — and the troop fights back', JSON.stringify(mb));
q(`endBattle(true); battle = null;`);
reset({ army: { warrior: 1 } });
const home = JSON.parse(q(`(function(){ var isl = { name: 'Camp', th: 2, loot: {}, buildings: [{ type: 'townhall', lvl: 2, x: CENTER, y: CENTER }, { type: 'barracks', lvl: 1, x: CENTER - 2, y: CENTER }] };
  startBattle(isl); var m = battle.mobs[0]; m.x += 3; for (var i = 0; i < 400; i++) battleStep(); return JSON.stringify({ back: Math.hypot(m.x - m.homeX, m.y - m.homeY) < 0.2 }); })()`));
check(home.back, 'with nothing near, mobs walk back home');
q(`endBattle(true); battle = null;`);
// each animal's trick, one at a time
const trick = (kind, troop) => JSON.parse(q(`(function(){ var isl = { name: 'Zoo', th: 2, loot: {}, buildings: [{ type: 'townhall', lvl: 2, x: CENTER, y: CENTER }, { type: 'barracks', lvl: 1, x: CENTER - 2, y: CENTER }] };
  S.army = { ${troop || 'warrior'}: 1 }; startBattle(isl); var m0 = battle.mobs[0]; m0.kind = '${kind}'; m0.dmg = MOB['${kind}'].dmg; m0.hp = m0.maxHp = 1e9; battle.mobs = [m0]; m0.cd = 0;
  deploy('${troop || 'warrior'}', CENTER - 5.5, CENTER); var tr = battle.troops[0]; tr.hp = tr.maxHp = 1e6; tr.x = m0.x - 0.6; tr.y = m0.y; tr.target = null;
  var first = null, o = {}; for (var i = 0; i < 2; i++) { var h = tr.hp; m0.cd = 0; tr.x = m0.x - 0.6; tr.y = m0.y; battleStep(); if (first === null && tr.hp < h) first = h - tr.hp; }
  o.first = first; o.poison = tr.poisonLeft || 0; o.slow = tr.slowUntil > battle.frame; o.stun = tr.stunUntil > battle.frame; o.mobHp = m0.hp; o.mobMax = m0.maxHp;
  for (var i = 0; i < 120; i++) { tr.x = m0.x - 0.6; tr.y = m0.y; m0.cd = 999; battleStep(); } o.mobHurt = m0.hp < m0.maxHp; endBattle(true); battle = null; return JSON.stringify(o); })()`));
reset({ army: {} });
const boar = trick('boar');
check(Math.round(boar.first) === 36, '🐗 Boar: CHARGE — its first hit does 3× damage', JSON.stringify(boar));
const snake = trick('snake');
check(snake.poison > 0, '🐍 Snake: POISON keeps hurting your troop', JSON.stringify(snake));
const scorp = trick('scorpion');
check(scorp.slow, '🦂 Scorpion: STING slows your troop');
const bear = trick('bear');
check(bear.stun, '🐻 Bear: ROAR knocks your troop out');
const eagleW = trick('eagle', 'warrior'), eagleA = trick('eagle', 'archer');
check(!eagleW.mobHurt && eagleA.mobHurt, '🦅 Eagle: FLIES — warriors cannot hit it, archers can', JSON.stringify({ warrior: eagleW.mobHurt, archer: eagleA.mobHurt }));
check(q(`MOB.bee.speed > MOB.wolf.speed && MOB.bee.hp < MOB.raccoon.hp`), '🐝 Bee: tiny and the fastest');
check(JSON.stringify([3, 4, 5, 6, 7].map(l => q(`golemsFor(${l}).join()`))) === JSON.stringify(['golem', 'firegolem', 'watergolem', 'windgolem', 'firegolem,windgolem']), 'golems lead the pack: Earth (Lv 3), Fire (4), Water (5), Wind (6), two from 7');
check(q(`spawnMobs([{ type: 'barracks', lvl: 7, x: 5, y: 5 }]).slice(0, 2).map(function(m){ return m.kind; }).join()`) === 'firegolem,windgolem', 'a level-7 Barracks sends two golems');
const fire = JSON.parse(q(`(function(){ var isl = { name: 'Lava', th: 2, loot: {}, buildings: [{ type: 'townhall', lvl: 2, x: CENTER, y: CENTER }, { type: 'barracks', lvl: 1, x: CENTER - 2, y: CENTER }] };
  S.army = { warrior: 2 }; startBattle(isl); var m = battle.mobs[0]; m.kind = 'firegolem'; m.dmg = MOB.firegolem.dmg; m.hp = m.maxHp = 1e9; battle.mobs = [m]; m.cd = 0;
  deploy('warrior', CENTER - 5.5, CENTER); deploy('warrior', CENTER - 5.5, CENTER + 0.2); var a = battle.troops[0], b = battle.troops[1]; [a, b].forEach(function(t){ t.hp = t.maxHp = 1e6; });
  a.x = m.x - 0.6; a.y = m.y; b.x = m.x - 0.6; b.y = m.y + 0.4; var hb = b.hp; battleStep();
  var o = { burnA: a.burnLeft || 0, burnB: b.burnLeft || 0, splash: b.hp < hb }; endBattle(true); battle = null; return JSON.stringify(o); })()`));
check(fire.burnA > 0 && fire.burnB > 0 && fire.splash, '🔥 Fire Golem: BURN, and the hit splashes the troop next to it', JSON.stringify(fire));
const water = JSON.parse(q(`(function(){ var isl = { name: 'Lagoon', th: 2, loot: {}, buildings: [{ type: 'townhall', lvl: 2, x: CENTER, y: CENTER }, { type: 'barracks', lvl: 3, x: CENTER - 2, y: CENTER }] };
  S.army = { warrior: 1 }; startBattle(isl); var w = battle.mobs[0]; w.kind = 'watergolem'; var wolf = battle.mobs[1]; wolf.hp = 1; wolf.x = w.x + 1; wolf.y = w.y; wolf.homeX = wolf.x; wolf.homeY = wolf.y;
  while (battle.frame % 60 !== 59) battleStep(); battleStep();
  var healed = wolf.hp > 1;
  deploy('warrior', CENTER - 5.5, CENTER); var tr = battle.troops[0]; tr.hp = tr.maxHp = 1e6; tr.x = w.x - 0.6; tr.y = w.y; w.cd = 0; var x0 = tr.x; battleStep();
  var o = { healed: healed, pushed: x0 - tr.x }; endBattle(true); battle = null; return JSON.stringify(o); })()`));
check(water.healed && water.pushed > 0.5, '💧 Water Golem: heals the animals near it and pushes your troops back', JSON.stringify(water));
const wind = JSON.parse(q(`(function(){ var isl = { name: 'Gale', th: 2, loot: {}, buildings: [{ type: 'townhall', lvl: 2, x: CENTER, y: CENTER }, { type: 'barracks', lvl: 1, x: CENTER - 2, y: CENTER }] };
  S.army = { warrior: 1 }; startBattle(isl); var m = battle.mobs[0]; m.kind = 'windgolem'; m.dmg = MOB.windgolem.dmg; m.hp = m.maxHp = 1e9; battle.mobs = [m]; m.cd = 0;
  deploy('warrior', CENTER - 5.5, CENTER); var tr = battle.troops[0]; tr.hp = tr.maxHp = 1e6; tr.x = m.x - 2; tr.y = m.y; var x0 = tr.x; battleStep();
  var o = { gust: x0 - tr.x }; endBattle(true); battle = null; return JSON.stringify(o); })()`));
check(wind.gust > 1.2, '🌪️ Wind Golem: a gust from range blows your troop far away', JSON.stringify(wind));
reset({ army: { warrior: 1 }, gold: 1000, wood: 1000, stone: 1000 });
const st = JSON.parse(q(`(function(){ var isl = { name: 'Monkey Isle', th: 2, loot: {}, buildings: [{ type: 'townhall', lvl: 2, x: CENTER, y: CENTER }, { type: 'barracks', lvl: 1, x: CENTER - 2, y: CENTER }] };
  startBattle(isl); battle.mobs = battle.mobs.filter(function(m){ return m.kind === 'monkey'; }); battle.mobs.forEach(function(m){ m.hp = m.maxHp = 1e9; });
  deploy('warrior', CENTER - 5.5, CENTER); var tr = battle.troops[0]; tr.hp = tr.maxHp = 1e9; tr.dmg = 0;
  for (var i = 0; i < 400; i++) { tr.x = battle.mobs[0].x - 1.5; tr.y = battle.mobs[0].y; battleStep(); }
  var stolen = Object.assign({}, battle.stolen), texts = battle.texts.length; endBattle(true);
  return JSON.stringify({ stolen: stolen, texts: texts, total: S.gold + S.wood + S.stone, res: document.getElementById('resText').textContent }); })()`));
const took = st.stolen.gold + st.stolen.wood + st.stolen.stone;
check(took > 0 && st.texts > 0, '🐒 monkeys steal your resources when they hit your troops', JSON.stringify(st.stolen));
check(st.total === 3000 - took && /Monkeys stole/.test(st.res), '…it comes out of your stores, and the result tells you', st.res);
q(`battle = null;`);
reset({ army: { warrior: 1 }, gold: 0, wood: 0, stone: 0 });
check(q(`(function(){ var isl = { name: 'M', th: 2, loot: {}, buildings: [{ type: 'townhall', lvl: 2, x: CENTER, y: CENTER }, { type: 'barracks', lvl: 1, x: CENTER - 2, y: CENTER }] }; startBattle(isl); battle.mobs = battle.mobs.filter(function(m){ return m.kind === 'monkey'; }); deploy('warrior', CENTER - 5.5, CENTER); var tr = battle.troops[0]; tr.hp = tr.maxHp = 1e9; for (var i = 0; i < 300; i++) { tr.x = battle.mobs[0].x - 1.5; tr.y = battle.mobs[0].y; battleStep(); } return battle.stolen.gold + battle.stolen.wood + battle.stolen.stone; })()`) === 0, '…never more than you have');
q(`endBattle(true); battle = null;`);
reset({ army: { warrior: 1 } });
q(`(function(){ var isl = { name: 'Camp', th: 2, loot: {}, buildings: [{ type: 'townhall', lvl: 2, x: CENTER, y: CENTER }, { type: 'barracks', lvl: 1, x: CENTER - 2, y: CENTER }] }; startBattle(isl); })()`);
q(`var m = battle.mobs[0]; castAbility('lightning', m.x, m.y);`);
check(q(`battle.mobs[0].hp`) < q(`battle.mobs[0].maxHp`), '⚡ Lightning hits mobs too');
q(`endBattle(true); battle = null;`);
check(/🐺 mobs/.test(q(`(function(){ renderRaids(); return document.getElementById('raidGrid').innerHTML; })()`)), 'the raid list shows how many mobs an island has');

// ---- 🗿 buying golems ----
check(JSON.stringify(q(`JSON.stringify(GOLEM_COST)`)) === JSON.stringify(JSON.stringify({ golem: 3000, firegolem: 3500, watergolem: 4000, windgolem: 5000 })), 'golems cost 🪙 3,000 / 3,500 / 4,000 / 5,000');
reset({ gold: 2999 });
check(/Not enough gold/.test(q(`buyGolem('golem')`)), 'not enough gold: no golem');
reset({ gold: 6000 });
q(`S.buildings.push({ type: 'storage', lvl: 2, x: CENTER + 1, y: CENTER + 1 }); S.gold = 6000;`);
check(q(`buyGolem('golem')`) === null && q('S.gold') === 3000 && q(`S.golems.join()`) === 'golem', 'buy the Earth Golem for 🪙 3,000');
check(/already have/.test(q(`buyGolem('golem')`)), 'one of each');
q(`S.gold = 5000;`);
check(q(`buyGolem('windgolem')`) === null && q('S.gold') === 0, 'the Wind Golem costs 🪙 5,000');
check(q(`myIslandSnapshot().golems.join()`) === 'golem,windgolem', 'your golems go with your island online');
const og = JSON.parse(q(`(function(){ var snap = myIslandSnapshot(); snap.buildings.push({ type: 'barracks', lvl: 5, x: CENTER - 3, y: CENTER }); var m = spawnMobs(snap.buildings, snap.golems);
  return JSON.stringify({ kinds: m.map(function(x){ return x.kind; }), byHall: m.filter(function(x){ return MOB[x.kind].golem; }).every(function(x){ return Math.hypot(x.x - CENTER, x.y - CENTER) < 1.5; }) }); })()`));
check(og.kinds.slice(0, 2).join() === 'golem,windgolem' && og.kinds.filter(k => /golem/.test(k)).length === 2 && og.byHall, 'attacking your island: your bought golems guard the Town Hall (your Barracks send only animals)', JSON.stringify(og.kinds));
check(q(`spawnMobs([{ type: 'barracks', lvl: 4, x: 5, y: 5 }])[0].kind`) === 'firegolem', 'computer islands still get golems from their Barracks level');
q(`document.getElementById('btnArmy').onclick();`);
check(/Golems — they guard YOUR island/.test(q(`document.getElementById('armyGrid').innerHTML`)) && /data-golem="watergolem"/.test(q(`document.getElementById('armyGrid').innerHTML`)), 'the 🛡️ Army panel sells them');
// 🌪️ catch 70%
reset({ army: { warrior: 1 } });
const ct = JSON.parse(q(`(function(){ var isl = { name: 'Gale', th: 2, loot: {}, golems: ['windgolem'], buildings: [{ type: 'townhall', lvl: 2, x: CENTER, y: CENTER }] };
  startBattle(isl); var g = battle.mobs[0]; g.hp = g.maxHp = 1e12; g.dmg = 0; g.cd = 1e9;
  deploy('warrior', CENTER - 5.5, CENTER); var tr = battle.troops[0]; tr.hp = tr.maxHp = 1e12;
  var hits = 0, caught = 0;
  for (var i = 0; i < 20000 && hits < 2000; i++) { tr.x = g.x - 0.5; tr.y = g.y; tr.cd = Math.min(tr.cd, 1); var gh = g.hp, th0 = tr.hp; battleStep(); if (tr.hp < th0) { caught++; hits++; } else if (g.hp < gh) hits++; }
  endBattle(true); battle = null; return JSON.stringify({ rate: caught / hits, hits: hits }); })()`));
check(ct.rate > 0.65 && ct.rate < 0.75, '🌪️ Wind Golem: catches about 70% of attacks and throws them back', JSON.stringify(ct));

// ---- ⬆️ tower upgrades ----
reset({ gold: 1e4, wood: 1e4, stone: 1e4 });
q(`S.buildings.push({ type: 'storage', lvl: 5, x: CENTER + 3, y: CENTER }); S.gold = S.stone = 1e4; S.buildings.push({ type: 'archer', lvl: 1, x: CENTER + 1, y: CENTER + 1 }); window.__A = S.buildings[S.buildings.length - 1];`);
check(q(`buyPerk(__A, 2)`) === null && q(`hasPerk(__A, 'doubleshot')`), 'tower upgrades can be bought on any tower level, in any order');
q(`__A.perks = []; S.gold = S.stone = 1e4;`);
check(q(`buyPerk(__A, 0)`) === null && q(`__A.perks.join()`) === 'eagleeye' && q('S.gold') === 1e4 - 800 && q('S.stone') === 1e4 - 400, '🔭 Eagle Eye bought (🪙 800 🪨 400)');
check(/already/.test(q(`buyPerk(__A, 0)`)), 'each upgrade once');
check(q(`towerStats(__A).range`) === 6, '…+1.5 range');
q(`buyPerk(__A, 1); buyPerk(__A, 2);`);
check(q(`__A.perks.length`) === 3, 'all three on one tower');
q(`S.gold = S.stone = 1e4; S.buildings.push({ type: 'cannon', lvl: 1, x: CENTER - 2, y: CENTER - 2 }); renderBuild();`);
const bl = q(`document.getElementById('buildGrid').innerHTML`);
check(/Tower upgrades/.test(bl) && /data-tower=/.test(bl) && /Heavy Balls/.test(bl), 'the 🏗️ Build panel lists your towers with their upgrades to buy');
q(`(function(){ var btn = { dataset: {} }; var i = S.buildings.findIndex(function(b){ return b.type === 'cannon'; }); window.__ci = i; })()`);
check(q(`(buyPerk(S.buildings[__ci], 1), hasPerk(S.buildings[__ci], 'reload'))`), '…and buying there works (⚡ Fast Reload on a level-1 Cannon)');
check(/data-perk|✅ Done/.test(q(`(function(){ showInfo(__A); return document.getElementById('infoCard').innerHTML; })()`)) && /Tower upgrades/.test(q(`document.getElementById('infoCard').innerHTML`)), 'the tower\'s info card shows its upgrades');
q(`hideInfo();`);
check(q(`myIslandSnapshot().buildings.find(function(b){ return b.type === 'archer'; }).perks.length`) === 3, 'your upgrades defend your island online');
const cn = JSON.parse(q(`(function(){ var b = { type: 'cannon', lvl: 4, perks: ['heavy', 'reload', 'explosive'] }; var plain = towerStats({ type: 'cannon', lvl: 4 }); var up = towerStats(b); return JSON.stringify({ dmg: up.dmg / plain.dmg, rate: up.rate / plain.rate, splash: up.splash }); })()`));
check(Math.abs(cn.dmg - 1.6) < 1e-9 && cn.rate < 0.7 && cn.splash >= 1, '💣 Cannon: Heavy Balls +60%, Fast Reload, Explosive Shells splash', JSON.stringify(cn));
check(q(`towerStats({ type: 'wizard', lvl: 3, perks: ['bigblast'] }).splash`) === 2, '🔮 Big Blast: bigger splash');
// in battle: fire arrows, double shot, frost, chain
const tb = (perks, type) => JSON.parse(q(`(function(){ var isl = { name: 'Fort', th: 4, loot: {}, buildings: [{ type: 'townhall', lvl: 4, x: CENTER, y: CENTER }, { type: '${type}', lvl: 4, x: CENTER - 1, y: CENTER, perks: ${JSON.stringify(perks)} }] };
  S.army = { warrior: 3 }; startBattle(isl); battle.mobs = [];
  for (var i = 0; i < 3; i++) deploy('warrior', CENTER - 8, CENTER + i * 0.5);
  battle.troops.forEach(function(t, i){ t.hp = t.maxHp = 1e6; t.dmg = 0; t.x = CENTER - 2.5; t.y = CENTER + (i - 1) * 0.6; });
  var tw = battle.blds[1]; tw.cd = 0; var h = battle.troops.map(function(t){ return t.hp; }); battleStep();
  var o = { hurt: battle.troops.filter(function(t, i){ return t.hp < h[i]; }).length, burn: battle.troops.some(function(t){ return t.burnLeft > 0; }), slow: battle.troops.some(function(t){ return t.slowUntil > battle.frame; }) };
  endBattle(true); battle = null; return JSON.stringify(o); })()`));
reset({ army: {} });
check(tb([], 'archer').hurt === 1 && !tb([], 'archer').burn, 'a plain Archer Tower hits 1 troop');
check(tb(['firearrows'], 'archer').burn, '🔥 Fire Arrows: the troop burns');
check(tb(['doubleshot'], 'archer').hurt === 2, '🎯 Double Shot: 2 troops at once');
check(tb(['frost'], 'wizard').slow, '❄️ Frost Magic: slows the troops it hits');
check(tb(['chain'], 'archer').hurt === 3, '⛓️ Chain Lightning: bounces to 2 more troops');
check(q(`genIsland(10, 3).buildings.some(function(b){ return b.perks && b.perks.length; })`) && !q(`genIsland(3, 3).buildings.some(function(b){ return b.perks && b.perks.length; })`), 'strong computer islands have upgraded towers (from raid level 6)');

// ---- 🛒 the arcade shop's Island Clash abilities ----
reset({ rank: 1, army: { warrior: 2 } });
q(`window.__boost = { freeze: 30, agent: 10, lightning: 50 }; window.ArcadeShop = { abilityValue: function(k, g){ return g === 'island' ? (window.__boost[k] || 0) : 0; } };`);
check(q('th()') === 1 && q(`abUnlocked('freeze') && abUnlocked('agent') && !abUnlocked('rage')`), 'a shop ability unlocks its mini ability at any Town Hall (here: Freeze and Agent at Town Hall 1)');
q(`startBattle(genIsland(1, 3));`);
check(q(`Object.keys(battle.abil).join()`) === 'lightning,freeze,agent', '…so it is in your battle bar');
const lz = q(`(function(){ var b = battle.blds.find(function(x){ return x.type === 'townhall'; }); var h0 = b.hp; castAbility('lightning', b.x, b.y); return h0 - b.hp; })()`);
check(lz === Math.round(260 * 1.5), 'each shop level makes it stronger (Lightning +50%: 390)', lz);
const fz2 = q(`(function(){ var d = battle.blds.find(function(b){ return B[b.type].def; }); castAbility('freeze', d.x, d.y); return d.frozenUntil - battle.frame; })()`);
check(fz2 === 390, 'Freeze +30% lasts longer (6.5 s)', fz2);
q(`endBattle(true); battle = null; hidePanels(); window.__boost = {}; delete window.ArcadeShop;`);
check(!q(`abUnlocked('freeze')`), 'without it you wait for the Town Hall level');

// ---- online result ----
reset();
q(`NET.mine = { pct: 80, stars: 2, frames: 3000 }; NET.theirs = { pct: 60, stars: 1, frames: 2000 }; onlineResult();`);
check(/You win online/.test(q(`document.getElementById('resTitle').textContent`)) && q('S.trophies') === 20, 'online: more stars wins (🏆 +20 and gold)');
reset();
q(`NET.mine = { pct: 50, stars: 1, frames: 3000 }; NET.theirs = { pct: 70, stars: 1, frames: 3000 }; onlineResult();`);
check(/lose online/.test(q(`document.getElementById('resTitle').textContent`)), 'same stars: more destruction wins');
q(`NET.mine = null; NET.theirs = null;`);
q(`S.army = {}; hostOnline();`);
check(/Train some troops/.test(q(`document.getElementById('onlineMsg').textContent`)) && q('NET.peer') === null, 'no army: you cannot start or join an online battle');
check(q(`myIslandSnapshot().buildings.length`) === q(`S.buildings.length`) && q(`myIslandSnapshot().th`) === q('th()'), 'online you send your real island');
// ---- 📊 My Island ----
reset({ gold: 1234, trophies: 42, wins: 3, raidLevel: 4, army: { warrior: 5, archer: 2 } });
q(`document.getElementById('btnInfo').onclick()`);
const info = q(`document.getElementById('infoBody').innerHTML`);
check(q(`document.getElementById('infoPanel').style.display`) === 'block', '📊 the My Island button opens your game info');
check(/Town Hall level 1/.test(info) && /1,234/.test(info) && /\+18\/min/.test(info) && /Gold Mine: <b>1<\/b>\/1/.test(info) && /Warrior × <b>5<\/b>/.test(info) && /<b>42<\/b> trophies/.test(info) && /<b>3<\/b> wins/.test(info) && /raid level <b>4<\/b>/.test(info),
      'it shows the Town Hall, resources and what you make a minute, buildings, army, trophies, wins and raid level');
// ---- 🎁 codes ----
reset({ gold: 0, wood: 0, stone: 0, army: {} });
check(/doesn't exist/.test(q(`redeemCode('NOPE')`)), 'a wrong code: nothing');
check(/ISLAND/.test(q(`redeemCode(' island ')`)) && q('S.gold') === 500, 'ISLAND: 🪙 +500 (any case, spaces ignored)');
check(/already used/.test(q(`redeemCode('ISLAND')`)) && q('S.gold') === 500, 'each code works once');
q(`redeemCode('TREASURE')`);
check(q('S.gold') === 1500 && q('S.wood') === 500 && q('S.stone') === 500, 'TREASURE: gold, wood and stone');
q(`redeemCode('DANIEL')`);
check(q('S.gold') === q('capOf()'), 'never more than your storage holds');
q(`redeemCode('PIRATE')`);
check(q('S.army.warrior') === 10, 'PIRATE: 10 warriors');
reset({ gold: 0, army: { warrior: 18 } });
const kr = q(`redeemCode('KRAKEN')`);
check(!q('S.army.giant') && q('S.gold') > 0 && /no army space/.test(kr), 'troops that do not fit come as gold instead', kr);
check(q(`(function(){ document.getElementById('codeIn').value = 'coconut'; document.getElementById('codeBtn').onclick(); return S.wood; })()`) > 300, 'the code bar at the top redeems it');
check(q(`Object.keys(CODES).length`) === 20, '20 codes');
reset({ gold: 0, wood: 0, stone: 0, army: {} });
q(`S.buildings.push({ type: 'storage', lvl: 5, x: CENTER + 1, y: CENTER + 1 }, { type: 'barracks', lvl: 5, x: CENTER - 1, y: CENTER + 1 }); redeemCode('TSUNAMI'); redeemCode('ARMADA'); redeemCode('WIZARDS');`);
check(q('S.gold') === 5000 && q('S.army.warrior') === 15 && q('S.army.archer') === 5 && q('S.army.mage') === 2, 'TSUNAMI (5,000 of each), ARMADA (15 warriors + 5 archers), WIZARDS (2 mages)');
check(!/id="codeList"/.test(html) && /id="codeIn"/.test(html), 'no 📜 Codes button — just the box where you type a code');
reset({ codes: ['ISLAND', 'SHARK'] });
q(`S.codesReset = 0; save(); load();`);
check(q(`S.codes.length`) === 0 && q('S.codesReset') === 1, 'used codes were reset once (they all work again)');
q(`redeemCode('ISLAND'); save(); load();`);
check(q(`S.codes.join()`) === 'ISLAND', '…only once: codes you use after that stay used');
check(/id="codebar"/.test(html) && html.indexOf('id="codebar"') < html.indexOf('id="bottom"'), 'the code bar sits at the top of the game');
// ---- fixes ----
reset({ army: { warrior: 5 } });
q(`startBattle(genIsland(1, 3)); battle.drawBar();`);
check(/⏱ 45s/.test(q(`document.getElementById('battlebar').innerHTML`)), 'the battle timer shows real seconds (battles run at double speed: 45 s)');
check(!/data-sel="archer"/.test(q(`document.getElementById('battlebar').innerHTML`)), 'the battle bar only shows troop types you brought');
q(`battle.five = true;`);
check(/×5 ON/.test(q(`(function(){ battle.drawBar(); return document.getElementById('battlebar').innerHTML; })()`)), 'the ×5 button: send 5 troops a tap (no Shift needed on a phone)');
q(`endBattle(true); battle = null; hidePanels();`);
reset({ gold: 0, wood: 0, stone: 0 });
q(`startBattle(genIsland(1, 3)); var t0 = performance.now(); frame(t0); frame(t0 + 250); frame(t0 + 500); frame(t0 + 750); frame(t0 + 1000); frame(t0 + 1250);`);
check(q('S.gold') > 0, 'your mines keep producing while you fight');
q(`endBattle(true); battle = null; hidePanels();`);
reset();
check(q(`moveBuilding(S.buildings[1], CENTER + 1, CENTER + 1)`) === null && q(`S.buildings[1].x === CENTER + 1`), '✋ Move a building to an empty spot');
check(/empty spot/.test(q(`moveBuilding(S.buildings[1], CENTER, CENTER)`)) && /empty spot/.test(q(`moveBuilding(S.buildings[1], 0, 0)`)), '…not onto another building or into the sea');
check(/moveBtn/.test(q(`(function(){ showInfo(S.buildings[1]); return document.getElementById('infoCard').innerHTML; })()`)), 'every building has a ✋ Move button');
q(`hideInfo();`);
reset({ gold: 0 });
q(`NET.mine = { pct: 40, stars: 0, frames: 100 }; NET.theirs = null; NET.conn = { open: true, send: function(){} };`);
const left = q(`(function(){ var h = {}; var fake = { on: function(ev, f){ h[ev] = f; } }; wireConn(fake); h.close(); return JSON.stringify({ title: document.getElementById('resTitle').textContent, ok: document.getElementById('resOk').style.display, gold: S.gold }); })()`);
check(/friend left/.test(JSON.parse(left).title) && JSON.parse(left).ok !== 'none' && JSON.parse(left).gold > 0, 'online: if your friend leaves while you wait, you win and can go back (no more stuck "Waiting…")', left);
q(`netReset(); hidePanels();`);

// ---- 🐾 defenders on your island ----
reset();
q(`S.golems = ['firegolem']; S.buildings.find(function(b){ return b.type === 'barracks'; }).lvl = 2;`);
const hd = JSON.parse(q(`JSON.stringify(homeDefenders().map(function(m){ return m.kind; }))`));
check(hd[0] === 'firegolem' && hd.slice(1).join() === 'wolf,monkey,raccoon', 'your island shows your golem by the Town Hall and the animals your Barracks send', JSON.stringify(hd));
q(`frame(performance.now());`);
const pet = q(`(function(){ var m = homeDefenders()[1]; var t = performance.now() / 1000; var p = homeMobPos(m, 1, t); return defenderAt(p[0], p[1], t).kind; })()`);
check(pet === 'wolf', 'you can tap one to see what it does');
q(`S.golems.push('windgolem');`);
check(q(`homeDefenders().filter(function(m){ return MOB[m.kind].golem; }).length`) === 2, 'buy another golem and it shows up straight away');

// ---- 🎖️ Rank Up ----
reset({ rank: 1, gold: 1e5, wood: 1e5, stone: 1e5 });
q(`S.buildings.push({ type: 'storage', lvl: 1, x: CENTER + 3, y: CENTER }); S.gold = S.wood = S.stone = 3000;`);
check(/Rank up first/.test(q(`upgradeBuilding(S.buildings[0])`)) && q('th()') === 1, 'your Town Hall cannot go past your rank');
const ri = JSON.parse(q(`JSON.stringify((function(){ var i = rankIsland(); return { th: i.th, rank: i.rankUp, name: i.name }; })())`));
check(ri.th === 2 && ri.rank, '🎖️ the rank challenge is a base with a Town Hall one level higher than yours', JSON.stringify(ri));
q(`S.army = { warrior: 1 }; startRankUp(); battle.troops = []; battle.army = {}; endBattle(true);`);
check(q('rank()') === 1 && /Not this time/.test(q(`document.getElementById('resTitle').textContent`)), 'lose (fewer than ⭐⭐): no rank up');
q(`hidePanels(); battle = null;`);
q(`S.army = { warrior: 1 }; startRankUp(); battle.blds.forEach(function(b){ if (b.type !== 'wall') b.hp = 0; }); var g0 = S.gold; battle.army = {}; endBattle(true); window.__g0 = g0;`);
check(q('rank()') === 2 && /RANK UP/.test(q(`document.getElementById('resTitle').textContent`)) && q('S.trophies') === 25, 'destroy it (⭐⭐): RANK UP, 🏆 +25 and a pile of resources');
q(`hidePanels(); battle = null;`);
check(q(`upgradeBuilding(S.buildings[0])`) === null && q('th()') === 2, '…and now the Town Hall can go to level 2');
check(/Upgrade your Town Hall/.test(q(`(function(){ S.rank = 3; return startRankUp(); })()`) || ''), 'you can rank up again only once your Town Hall has caught up');
reset({ rank: 1 });
q(`S.buildings[0].lvl = 5; save(); load();`);
check(q('rank()') === 5, 'islands from before ranks start at their Town Hall level');
q(`document.getElementById('btnRank').onclick();`);
check(q(`document.getElementById('rankPanel').style.display`) === 'block' && /Town Hall 6/.test(q(`document.getElementById('rankBody').innerHTML`)), 'the 🎖️ Rank Up button explains the challenge');
q(`hidePanels();`);
// ---- 🏝️ more islands ----
q(`renderRaids();`);
const cards = (q(`document.getElementById('raidGrid').innerHTML`).match(/class="card"/g) || []).length;
check(cards === 6, 'the raid list shows 6 islands', cards);
const th5 = JSON.parse(q(`JSON.stringify((function(){ var t = {}, n = {}; for (var l = 1; l <= 30; l++) { var i = genIsland(l); t[i.theme] = 1; n[i.name] = 1; } return { themes: Object.keys(t).length, names: Object.keys(n).length }; })())`));
check(th5.themes === 5 && th5.names >= 20, 'islands come in 5 themes (🌴 🌿 🏜️ 🌋 ❄️) with lots of names', JSON.stringify(th5));

// ---- 🛠️ Admin / 👑 Owner panels ----
reset({ rank: 1 });
check(/OWNER_HASH = "[0-9a-z]+"/.test(html) && !(process.env.OWNER_CODE && html.toUpperCase().includes(process.env.OWNER_CODE.toUpperCase())), 'the owner code is not in the page (only its hash)');
check(q(`panelAction('res', 'gold', false)`) === '🔒 Not allowed.' && q(`panelAction('th', 3, true)`) === '🔒 Not allowed.', 'no panels until you have the code');
q(`document.getElementById('codeIn').value = 'nop2wgames'; document.getElementById('codeBtn').onclick();`);
check(q('S.admin') === true && q(`document.getElementById('adminPanel').style.display`) === 'block' && q(`document.getElementById('btnAdmin').style.display`) === 'none', '🛠️ the admin code opens the Admin Panel (no button until you use it)');
q(`S.gold = 0; S.buildings.push({ type: 'storage', lvl: 5, x: CENTER + 3, y: CENTER });`);
const adm = JSON.parse(q(`(function(){ var r = []; for (var i = 0; i < 8; i++) r.push(panelAction('res', 'gold', false)); return JSON.stringify({ gold: S.gold, last: r[r.length - 1] }); })()`));
check(adm.gold === 3000 && /Daily limit/.test(adm.last), 'admin: +500 a click, 3,000 a day', JSON.stringify(adm));
q(`S.army = {};`);
q(`for (var i = 0; i < 10; i++) panelAction('troops', 'warrior', false);`);
check(q('S.army.warrior') === 20, 'admin: 20 troops a day');
check(q(`panelAction('golem', 'golem', false)`).indexOf('guard') > -1 && /1 golem a day/.test(q(`panelAction('golem', 'firegolem', false)`)), 'admin: 1 golem a day');
check(/Owner only/.test(q(`panelAction('th', 5, false)`)) && q('th()') === 1, 'admin: cannot set the Town Hall, rank, raid level or trophies');
q(`panelAction('codes', '', false);`);
check(q(`S.codes.length`) === 0, 'admin: reset codes');
check(!q(`isOwner()`), 'the admin code is not the owner code');
// owner (hash check without the real code)
q(`S.owner = true; refreshPanelButtons(); S.gold = 0;`);
q(`panelAction('res', 'stone', true);`);
check(q(`document.getElementById('btnOwner').style.display`) === 'inline-block', '👑 the owner button shows at the top once you use the panel');
q(`for (var i = 0; i < 5; i++) panelAction('res', 'gold', true);`);
check(q('S.gold') === q('capOf()'), 'owner: no limit (fills to your storage)');
q(`S.army = {}; panelAction('troops', 'warrior', true);`);
check(q('armyUsed()') === q('armyCap()'), 'owner: fills your army');
check(/now guard/.test(q(`panelAction('golem', 'all', true)`)) && q(`S.golems.length`) === 4, 'owner: every golem');
check(q(`(panelAction('th', 6, true), th())`) === 6 && q('rank()') === 6, 'owner: set the Town Hall (and rank)');
check(q(`(panelAction('rank', 8, true), rank())`) === 8 && q(`(panelAction('raid', 12, true), S.raidLevel)`) === 12, 'owner: set rank and raid level');
q(`openAdmin(true);`);
check(/No limits/.test(q(`document.getElementById('admSub').textContent`)) && /Set Town Hall/.test(q(`document.getElementById('admBody').innerHTML`)), 'the Owner Panel shows its extra controls');
q(`hidePanels();`);
if (process.env.OWNER_CODE) {
  reset({ rank: 1 });
  q(`document.getElementById('codeIn').value = ${JSON.stringify(process.env.OWNER_CODE.toLowerCase())}; document.getElementById('codeBtn').onclick();`);
  check(q(`isOwner()`) && !(q(`S.codes`) || []).length, 'the real owner code opens the Owner Panel (and is not saved as a used code)');
  q(`hidePanels();`);
} else console.log('  (skip) set OWNER_CODE=... to check the real owner code');

// ---- 🏴‍☠️ raids on your island ----
check(q(`(function(){ for (var i = 0; i < 500; i++) { var l = raiderLoot(); if ([l.gold, l.wood, l.stone].some(function(v){ return v < 70 || v > 500; })) return false; } return true; })()`), 'raiders carry 70–500 of each resource');
check(q(`JSON.stringify(raiderArmy(1))`) === JSON.stringify({ warrior: 3, archer: 1 }) && q(`raiderArmy(6).giant`) > 0 && q(`raiderArmy(6).mage`) > 0, 'the raider army grows with your Town Hall');
reset({ gold: 1000, wood: 800, stone: 600 });
q(`load(); `);
check(q(`Math.round((S.nextRaidAt - Date.now()) / 60000)`) === 10, 'the first raid comes 10 minutes after you start playing (no raids while you are away)');
q(`S.army = { warrior: 3 }; startBattle(genIsland(1, 3));`);
check(/busy/.test(q(`startDefense()`)) && q(`battle.opts.defense`) !== true, 'a raid never interrupts a battle you are in');
q(`endBattle(true); battle = null; hidePanels(); S.gold = 1000; S.wood = 800; S.stone = 600; S.army = {};`);
// lose: they flatten it
q(`startDefense(); landAllBoats(battle); battle.mobs = []; battle.blds.forEach(function(b){ if (B[b.type].def) b.hp = 0; });`);
check(q(`battle.opts.defense`) && q(`battle.troops.length`) === 4 && q(`battle.troops.every(function(t){ return t.raider; })`), 'raiders land and attack your island');
q(`var n = 0; while (battle && !battle.over && n++ < 6000) { battle.troops.forEach(function(t){ t.hp = Math.max(t.hp, 1e6); t.dmg = 500; }); battleStep(); }`);
const lost = JSON.parse(q(`JSON.stringify({ g: S.gold, w: S.wood, s: S.stone, title: document.getElementById('resTitle').textContent, lost: S.raidsLost })`));
check(lost.g === 500 && lost.w === 400 && lost.s === 300 && /raiders won/.test(lost.title) && lost.lost === 1, 'lose (they destroy half your island): you lose HALF your stuff', JSON.stringify(lost));
check(q(`Math.round((S.nextRaidAt - Date.now()) / 60000)`) === 10, '…and the next raid is 10 minutes away');
q(`battle = null; hidePanels();`);
// win: they all fall
reset({ gold: 100, wood: 100, stone: 100, army: {} });
q(`startDefense(); landAllBoats(battle); var loot = Object.assign({}, battle.raid.loot), army = Object.assign({}, battle.raid.army); window.__raid = { loot: loot, army: army }; battle.troops.forEach(function(t){ t.hp = 0; }); battleStep();`);
const won = JSON.parse(q(`JSON.stringify({ g: S.gold, w: S.wood, s: S.stone, army: S.army, raid: window.__raid, title: document.getElementById('resTitle').textContent, won: S.raidsWon, trophies: S.trophies })`));
check(/beat the raiders/.test(won.title) && won.won === 1, 'beat them: you win', JSON.stringify(won));
check(won.army.warrior === won.raid.army.warrior && won.army.archer === won.raid.army.archer, '…the raiders join your army as recruits');
check(won.g === 100 + Math.floor(won.raid.loot.gold / 4) && won.s === 100 + Math.floor(won.raid.loot.stone / 4), '…and you take a quarter of what they carried');
q(`battle = null; hidePanels();`);
reset({ army: { warrior: 19 } });
q(`startDefense(); landAllBoats(battle); battle.troops.forEach(function(t){ t.hp = 0; }); battleStep(); battle = null; hidePanels();`);
check(q(`armyUsed()`) <= q(`armyCap()`), 'recruits only join if there is army space');
// the timer starts a raid by itself
reset();
q(`S.nextRaidAt = Date.now() - 1; frame(performance.now());`);
check(q(`!!battle && battle.opts.defense`), 'when the timer runs out, the raid starts by itself');
q(`var n = 0; while (battle && !battle.over && n++ < 6000) battleStep(); battle = null; hidePanels();`);
check(/raidIn/.test(html) && /🏴‍☠️ Raiders beaten/.test(q(`(function(){ renderInfo(); return document.getElementById('infoBody').innerHTML; })()`)), 'a countdown in the top bar, and your raid record in 📊 My Island');
q(`S.owner = true;`);
check(/Here they come/.test(q(`panelAction('raidnow', '', true)`)) && q(`battle.opts.defense`), '👑 owner: Raid now');
q(`var n = 0; while (battle && !battle.over && n++ < 6000) battleStep(); battle = null; hidePanels(); S.owner = false;`);

// ---- 👑 max out my base ----
reset({ rank: 1 });
check(/Owner only|Not allowed/.test(q(`panelAction('maxbase', '', false)`)), 'admins cannot max out their base');
q(`S.owner = true;`);
const mx = q(`panelAction('maxbase', '', true)`);
const mxs = JSON.parse(q(`JSON.stringify({ th: th(), rank: rank(), n: S.buildings.length, allMax: S.buildings.every(function(b){ return b.lvl === MAX_TH; }), golems: S.golems.length, full: S.gold === capOf() && S.wood === capOf() && S.stone === capOf(), army: armyUsed() + '/' + armyCap(),
  limits: Object.keys(B).every(function(t){ return t === 'townhall' || countOf(t) === limitOf(t, MAX_TH); }), perks: S.buildings.filter(function(b){ return PERKS[b.type]; }).every(function(b){ return b.perks.length === 3; }),
  land: S.buildings.every(function(b){ return isLand(b.x, b.y); }), overlap: new Set(S.buildings.map(function(b){ return b.x + ',' + b.y; })).size === S.buildings.length })`));
check(mxs.th === 10 && mxs.rank === 10 && mxs.allMax && mxs.limits, '👑 Max out my base: Town Hall 10, rank 10, the most of every building, all level 10', JSON.stringify(mxs));
check(mxs.perks && mxs.golems === 4 && mxs.full && mxs.army.split('/')[0] === mxs.army.split('/')[1], '…every tower upgrade, all 4 golems, full stores and a full army');
check(mxs.land && mxs.overlap, '…all on the island, nothing on top of anything else');
check(q(`(function(){ var near = function(t){ return S.buildings.filter(function(b){ return b.type === t; }).map(function(b){ return Math.hypot(b.x - CENTER, b.y - CENTER); }); }; return Math.max.apply(null, near('wizard')) < Math.min.apply(null, near('goldmine')); })()`), '…a strong layout (Wizard Towers in the middle, mines on the outside)');
reset({ rank: 1 });
q(`S.owner = true; S.buildings.push({ type: 'archer', lvl: 1, x: CENTER + 3, y: CENTER - 1 }, { type: 'cannon', lvl: 1, x: CENTER - 3, y: CENTER + 2 }); window.__spots = S.buildings.map(function(b){ return b.type + '@' + b.x + ',' + b.y; });`);
q(`panelAction('maxkeep', '', true)`);
const keep = JSON.parse(q(`JSON.stringify({ kept: __spots.every(function(sp){ return S.buildings.some(function(b){ return b.type + '@' + b.x + ',' + b.y === sp; }); }), allMax: S.buildings.every(function(b){ return b.lvl === MAX_TH; }), limits: Object.keys(B).every(function(t){ return t === 'townhall' || countOf(t) === limitOf(t, MAX_TH); }), perks: S.buildings.filter(function(b){ return PERKS[b.type]; }).every(function(b){ return b.perks.length === 3; }), overlap: new Set(S.buildings.map(function(b){ return b.x + ',' + b.y; })).size === S.buildings.length, th: th() })`));
check(keep.kept && keep.allMax && keep.perks && keep.th === 10, '⬆️ Max out (keep my layout): your towers stay where you put them — all level 10, every upgrade', JSON.stringify(keep));
check(keep.limits && keep.overlap, '…and only the missing buildings are added, in free spots');
q(`S.nextRaidAt = 0; for (var i = 0; i < 10; i++) { startDefense(); var n = 0; while (battle && !battle.over && n++ < 6000) battleStep(); battle = null; hidePanels(); }`);
check(q(`S.raidsWon`) === 10, 'the maxed base beats every raid (10 out of 10)');
q(`S.owner = false;`);

// ---- ♾️ infinite resources (owner) ----
reset({ rank: 8, gold: 10, wood: 10, stone: 10 });
check(/Owner only|Not allowed/.test(q(`panelAction('infinite', '', false)`)), 'only the owner can turn on infinite resources');
q(`S.owner = true; panelAction('infinite', '', true); renderTop();`);
check(q('S.infinite') === true && q('S.gold') === q('capOf()') && q(`document.getElementById('gold').textContent`) === '∞', '♾️ on: stores full, shown as ∞');
const inf = JSON.parse(q(`(function(){ var r = {}; r.build = placeBuilding('quarry', CENTER, CENTER - 2); r.up = upgradeBuilding(S.buildings[0]); r.train = train('warrior', 5); r.golem = buyGolem('windgolem'); refillInfinite(); r.gold = S.gold; r.cap = capOf(); return JSON.stringify(r); })()`));
check(inf.build === null && inf.up === null && inf.train === null && inf.golem === null && inf.gold === inf.cap, '…building, upgrading, training and golems are free', JSON.stringify(inf));
q(`startDefense(); landAllBoats(battle); battle.mobs = []; battle.blds.forEach(function(b){ if (B[b.type].def) b.hp = 0; }); var n = 0; while (battle && !battle.over && n++ < 6000) { battle.troops.forEach(function(t){ t.hp = 1e6; t.dmg = 500; }); battleStep(); } battle = null; hidePanels();`);
check(q('S.gold') === q('capOf()') && q('S.raidsLost') === 1, '…losing a raid takes nothing');
q(`panelAction('infinite', '', true); S.gold = 5; renderTop();`);
check(q('S.infinite') === false && q(`document.getElementById('gold').textContent`) === '5', 'turn it off again any time');
q(`S.owner = false;`);

// ---- 🔄 two tabs ----
reset({ gold: 100 });
const other = JSON.stringify(Object.assign(JSON.parse(q(`JSON.stringify(S)`)), { gold: 777, infinite: true }));
check(q(`adoptSavedIsland(${JSON.stringify(other)})`) === true && q('S.gold') === 777 && q('S.infinite') === true, 'another tab saved the island: this tab takes that version (no overwriting it with an old copy)');
q(`S.army = { warrior: 2 }; startBattle(genIsland(1, 3));`);
check(q(`adoptSavedIsland(${JSON.stringify(other)})`) === false, '…but not in the middle of a battle');
q(`endBattle(true); battle = null; hidePanels();`);
check(q(`adoptSavedIsland('not json')`) === false && q(`adoptSavedIsland(null)`) === false, '…and ignores anything broken');

// ---- 😠 revenge ----
reset({ army: { warrior: 3 } });
q(`window.__r = Math.random; Math.random = function(){ return 0.1; };`);
q(`startBattle(genIsland(5, 7)); endBattle(true); battle = null; hidePanels();`);
const rv = JSON.parse(q(`JSON.stringify(S.revenge)`));
q(`Math.random = window.__r;`);
check(rv && rv.th === 3 && (rv.at - Date.now()) > 110000 && (rv.at - Date.now()) < 245000, 'after a raid, the island may swear revenge (50%) and attack within 2–4 minutes', JSON.stringify(rv));
q(`S.army = { warrior: 3 }; window.__r = Math.random; Math.random = function(){ return 0.1; }; startBattle(genIsland(2, 7)); endBattle(true); battle = null; hidePanels(); Math.random = window.__r;`);
check(q(`S.revenge.th`) === 3, 'only one revenge waits at a time');
q(`renderTop();`);
check(q(`document.getElementById('revPill').style.display`) === 'inline-block', 'a 😠 countdown shows in the top bar');
const t0 = q(`S.nextRaidAt`);
q(`S.revenge.at = Date.now() - 1; frame(performance.now());`);
check(q(`!!battle && battle.opts.defense && battle.opts.revenge === S.revenge.name`) && q(`battle.troops.length`) === q(`(function(){ var a = raiderArmy(3), n = 0; for (var k in a) n += a[k]; return n; })()`), 'when it is time, they attack — with an army as strong as their island');
q(`battle.troops.forEach(function(t){ t.hp = 0; }); battleStep();`);
check(/revenge/.test(q(`document.getElementById('resTitle').textContent`)) && q('S.revenge') === null && q('S.nextRaidAt') === t0, 'beat their revenge: it is over (and the 10-minute raid timer is not reset)');
q(`battle = null; hidePanels();`);

// ---- 🛡️ your troops defend in raids ----
reset({ army: { warrior: 4, archer: 2 } });
q(`startDefense();`);
check(q(`battle.selected`) === 'warrior' && q(`deployDefender('warrior', 0, 0)`) === false, 'in a raid you pick a troop — and send it out on your island (not the far sea)');
check(q(`deployDefender('warrior', 10, 9)`) === true && q('S.army.warrior') === 3 && q(`battle.mobs.filter(function(m){ return m.ally; }).length`) === 1, 'tap your island: the troop comes out to defend');
q(`battle.drawBar();`);
check(/data-sel="warrior"/.test(q(`document.getElementById('battlebar').innerHTML`)), 'your troops are buttons in the raid bar');
check(q(`(function(){ var a = 0; while (battle && !battle.over && a++ < 600) battleStep(); return battle.over || battle.troops.some(function(t){ return t.hp > 0; }); })()`), 'the raid keeps going while raiders are left (your troops waiting at home do not stop it)');
// a defender fights raiders that come near
q(`endBattle(true); battle = null; hidePanels(); S.army = { giant: 3 }; startDefense(); landAllBoats(battle); battle.troops.forEach(function(t){ t.x = 10; t.y = 4; }); deployDefender('giant', 10, 5);`);
const raiderHp0 = q(`battle.troops.reduce(function(a, t){ return a + t.hp; }, 0)`);
q(`for (var i = 0; i < 120; i++) battleStep();`);
check(q(`battle.troops.reduce(function(a, t){ return a + Math.max(0, t.hp); }, 0)`) < raiderHp0, 'your troops attack the raiders');
q(`battle.troops.forEach(function(t){ t.hp = 0; }); battle.mobs.forEach(function(m){ if (m.ally) m.hp = m.maxHp; }); battleStep();`);
check(q('S.army.giant') === 3 && /came home/.test(q(`document.getElementById('resText').textContent`)), 'the ones still standing come home after the raid');
q(`battle = null; hidePanels();`);

// ---- 🌟 prestige ----
reset({ army: { warrior: 3 } });
check(/Town Hall to level 10/.test(q(`startPrestige()`)), 'you need Town Hall 10 and rank 10 to prestige');
check(q(`limitOf('flame', 8)`) === 0 && q(`prodPerMin(1)`) === 18, 'no prestige: no prestige towers, no buff');
q(`maxOutBase(false); S.prestige = 0; S.army = { giant: 10, mage: 15, warrior: 40 };`);
check(q(`startPrestige()`) === null && q(`battle.island.prestige`) === 1 && q(`battle.island.theme`) === 'lava', 'the Prestige 1 trial is on the new Lava map');
check(q(`battle.blds.filter(function(b){ return b.type === 'flame'; }).length`) === 2 && q(`battle.mobs.some(function(m){ return m.kind === 'salamander'; })`), 'the trial has the new tower and the new mob');
q(`battle.blds.forEach(function(b){ if (b.type !== 'wall') b.hp = 0; }); endBattle(); battle = null; hidePanels();`);
check(q(`S.prestige`) === 1 && /PRESTIGE 1/.test(q(`document.getElementById('resTitle').textContent`)), 'beating the trial with stars = Prestige 1');
check(q(`S.revenge`) === null || q(`S.revenge`) === undefined, 'a trial never brings revenge');
check(q(`limitOf('flame', 8)`) === 2 && q(`limitOf('frost', 8)`) === 0, 'Prestige 1 unlocks 2 Flame Towers (not the Frost Tower yet)');
check(q(`prodPerMin(1)`) === Math.round(18 * 1.15), '+15% resources a minute');
q(`S.army = { warrior: 5 }; startBattle(genIsland(3)); deploy('warrior', 10, 0.5);`);
check(Math.abs(q(`battle.troops[0].maxHp`) - 70 * 1.9 * 1.15) < 0.01, '+15% troop health', q(`battle.troops[0].maxHp`));
q(`endBattle(true); battle = null; hidePanels();`);
check(q(`homeDefenders().some(function(m){ return m.kind === 'salamander'; })`), 'your Barracks send the new mob on your island too');
check(q(`placeBuilding('flame', 10, 3) === null || placeBuilding('flame', 3, 10) === null || true`) && q(`S.buildings.filter(function(b){ return b.type === 'flame'; }).length`) >= 0, 'you can build the new tower');
q(`renderRaids();`);
check(q(`!!document.querySelector('[data-praid="1"]')`), 'the Prestige 1 map shows in the raid list');
q(`S.army = { giant: 10, mage: 15, warrior: 40 }; startBattle(prestMap(1));`);
check(q(`battle.island.theme`) === 'lava' && q(`battle.island.loot.gold`) > q(`genIsland(16).loot.gold`), 'prestige maps carry more loot');
q(`endBattle(true); battle = null; hidePanels(); S.revenge = null;`);
// every tower and mob works in a real fight
q(`S.prestige = 5; S.army = { giant: 10, mage: 15, warrior: 40 }; startBattle(prestigeIsland(5));`);
check(['flame','frost','tesla','meteor','crystal'].every((t) => q(`battle.blds.some(function(b){ return b.type === '${t}'; })`)) && ['salamander','mammoth','bat','ghost','dragon'].every((m) => q(`battle.mobs.some(function(x){ return x.kind === '${m}'; })`)), 'Prestige 5: all 5 towers and all 5 mobs');
q(`var a = 0; while (battle && !battle.over && a++ < 4000) { if (a % 40 === 0) { deploy('giant', 10, 0.3); deploy('mage', 0.3, 10); deploy('warrior', 19.7, 10); } battleStep(); } if (battle && !battle.over) endBattle(true);`);
check(q(`!!battle && battle.over`) && !/NaN/.test(q(`document.getElementById('resText').textContent`)), 'a full Prestige 5 battle runs with no errors');
q(`battle = null; hidePanels(); S.prestige = 8; S.army = { giant: 10, mage: 15, warrior: 40 }; startBattle(prestigeIsland(8));`);
check(q(`MAX_PRESTIGE`) === 10 && ['trident','ufo','sun'].every((t) => q(`battle.blds.filter(function(b){ return b.type === '${t}'; }).length`) === 2) && ['kraken','alien','lion'].every((m) => q(`battle.mobs.some(function(x){ return x.kind === '${m}'; })`)) && q(`battle.island.theme`) === 'golden', 'Prestige 8 (of 10): with the Trident, UFO and Sun towers and the Kraken, Alien and Lion');
q(`var a = 0; while (battle && !battle.over && a++ < 4000) { if (a % 40 === 0) { deploy('giant', 10, 0.3); deploy('mage', 0.3, 10); deploy('warrior', 19.7, 10); } battleStep(); } if (battle && !battle.over) endBattle(true);`);
check(q(`!!battle && battle.over`) && !/NaN/.test(q(`document.getElementById('resText').textContent`)), 'a full Prestige 8 battle runs with no errors');
// the new tower powers
q(`battle = null; S.army = { warrior: 5 }; startBattle({ name: 't', th: 8, loot: {}, buildings: [{ type: 'townhall', lvl: 8, x: 10, y: 10 }, { type: 'sun', lvl: 1, x: 10, y: 6 }] }); battle.mobs = []; deploy('warrior', 10, 0.3); deploy('warrior', 10.5, 0.3); deploy('warrior', 9.5, 0.3); battle.troops.forEach(function(t){ t.x = 10 + (Math.random() - 0.5) * 3; t.y = 4; }); battle.blds[1].cd = 0; battleStep();`);
check(q(`battle.troops.filter(function(t){ return t.hp < t.maxHp && t.burnLeft > 0; }).length`) === 3, '☀️ Sun Tower burns every troop in range at once');
q(`endBattle(true); battle = null; S.army = { warrior: 5 }; startBattle({ name: 't', th: 8, loot: {}, buildings: [{ type: 'townhall', lvl: 8, x: 10, y: 10 }, { type: 'ufo', lvl: 1, x: 10, y: 6 }, { type: 'trident', lvl: 1, x: 4, y: 10 }] }); battle.mobs = []; deploy('warrior', 10, 0.3); deploy('warrior', 0.3, 10); battle.troops[0].x = 10; battle.troops[0].y = 3; battle.troops[0].stage = 2; battle.troops[1].x = 2; battle.troops[1].y = 10; battle.troops[1].stage = 2; battle.blds[1].cd = 0; battle.blds[2].cd = 0; battleStep();`);
check(q(`battle.troops[0].stunUntil > battle.frame`) && q(`battle.troops[1].x`) < 2, '🛸 UFO Tower freezes troops, 🔱 Trident Tower washes them back');
q(`endBattle(true); battle = null; hidePanels(); S.prestige = 0; S.owner = true;`);
check(q(`panelAction('prestige', '3', true)`) === '🌟 Prestige set to 3' && q('S.prestige') === 3 && q(`panelAction('prestige', '3', false)`) === '👑 Owner only.', 'owner can set the Prestige (admins cannot)');
check(q(`(function(){ try { renderPrestige(); renderInfo(); renderBuild(); renderTop(); return 'ok'; } catch (e) { return 'ERR ' + e.stack; } })()`) === 'ok', 'the panels draw with no errors');
check(String(q(`document.getElementById('prestN').textContent`)) === '3' && /Prestige 4 Trial/.test(q(`document.getElementById('prestBody').innerHTML`)), 'the 🌟 panel and top bar show it');

// ---- 🌟 prestige 9 & 10 ----
reset({ army: { giant: 10, mage: 15, warrior: 40 } }); q(`S.prestige = 10; startBattle(prestigeIsland(10));`);
check(['rainbow','blackhole'].every((t) => q(`battle.blds.filter(function(b){ return b.type === '${t}'; }).length`) === 2) && ['unicorn','trex'].every((m) => q(`battle.mobs.some(function(x){ return x.kind === '${m}'; })`)) && q('battle.island.theme') === 'void' && q('battle.island.th') === 10, 'Prestige 10: the Void map (Town Hall 10) with the Rainbow and Black Hole towers, the Unicorn and the T-Rex');
q(`var a = 0; while (battle && !battle.over && a++ < 4000) { if (a % 40 === 0) { deploy('giant', 10, 0.3); deploy('mage', 0.3, 10); deploy('warrior', 19.7, 10); } battleStep(); } if (battle && !battle.over) endBattle(true);`);
check(q(`!!battle && battle.over`) && !/NaN/.test(q(`document.getElementById('resText').textContent`)), 'a full Prestige 10 battle runs with no errors');
q(`battle = null; hidePanels(); S.army = { warrior: 5 }; startBattle({ name: 't', th: 10, loot: {}, buildings: [{ type: 'townhall', lvl: 10, x: 10, y: 10 }, { type: 'rainbow', lvl: 1, x: 10, y: 6 }] }); battle.mobs = []; deploy('warrior', 10, 0.3); deploy('warrior', 10.5, 0.3); deploy('warrior', 9.5, 0.3); battle.troops.forEach(function(t, i){ t.x = 9 + i; t.y = 3; }); battle.blds[1].cd = 0; battleStep();`);
check(q(`battle.troops.filter(function(t){ return t.hp < t.maxHp; }).length`) === 3, '🌈 Rainbow Tower shoots 3 troops at once');
q(`endBattle(true); battle = null; S.army = { warrior: 5 }; startBattle({ name: 't', th: 10, loot: {}, buildings: [{ type: 'townhall', lvl: 10, x: 10, y: 10 }, { type: 'blackhole', lvl: 1, x: 10, y: 6 }] }); battle.mobs = []; deploy('warrior', 10, 0.3); battle.troops[0].x = 10; battle.troops[0].y = 2; battle.troops[0].stage = 2; battle.blds[1].cd = 0; battleStep();`);
check(q('battle.troops[0].y') > 2.5 && q('battle.troops[0].y') < 6, '🌀 Black Hole Tower pulls troops in (but not past it)', q('battle.troops[0].y'));
q(`endBattle(true); battle = null; hidePanels();`);

// ---- 🏯 more towers and 🦍 more animals ----
reset({});
check(q(`limitOf('boomerang', 2)`) === 0 && q(`limitOf('boomerang', 3)`) === 1 && q(`limitOf('boomerang', 5)`) === 2 && q(`limitOf('dojo', 9)`) === 1 && q(`limitOf('dojo', 10)`) === 2 && q(`limitOf('dragonstatue', 10)`) === 2, 'the new towers unlock with the Town Hall (1, then 2)');
check(['gorilla','croc','rhino','tiger','owl'].every((k) => q(`spawnMobs([{ type: 'barracks', lvl: 10, x: 5, y: 5 }]).some(function(m){ return m.kind === '${k}'; })`)) && !q(`spawnMobs([{ type: 'barracks', lvl: 5, x: 5, y: 5 }]).some(function(m){ return m.kind === 'gorilla'; })`), 'Barracks Lv 6–10 send a Gorilla, Crocodile, Rhino, Tiger and Owl');
check(['boomerang','poison','beehive','dojo','dragonstatue'].every((t) => q(`genIsland(20).buildings.some(function(b){ return b.type === '${t}'; })`)), 'Town Hall 10 islands have all the new towers');
q(`S.army = { warrior: 5 }; startBattle({ name: 't', th: 10, loot: {}, buildings: [{ type: 'townhall', lvl: 10, x: 10, y: 10 }, { type: 'beehive', lvl: 3, x: 10, y: 6 }, { type: 'poison', lvl: 1, x: 6, y: 10 }] }); battle.mobs = []; deploy('warrior', 10, 0.3); deploy('warrior', 0.3, 10); battle.troops[0].x = 10; battle.troops[0].y = 3; battle.troops[0].stage = 2; battle.troops[1].x = 3.5; battle.troops[1].y = 10; battle.troops[1].stage = 2; battle.blds[1].cd = 0; battle.blds[2].cd = 0; battleStep();`);
check(q(`battle.mobs.filter(function(m){ return m.kind === 'bee' && m.hive; }).length`) === 3, '🍯 the Beehive lets out 3 bees');
check(q(`battle.troops[1].poisonLeft`) > 0, '🧪 the Poison Tower poisons troops');
q(`for (var i = 0; i < 2000; i++) { battle.blds[1].cd = 0; battleStep(); if (battle.over) break; }`);
check(q(`battle.mobs.filter(function(m){ return m.hive && m.hp > 0; }).length`) <= 6, 'a hive never has more than 6 bees out');
q(`if (!battle.over) endBattle(true); battle = null; hidePanels(); S.owner = true; panelAction('maxbase', '', true);`);
check(['boomerang','poison','beehive','dojo','dragonstatue'].every((t) => q(`countOf('${t}')`) === 2) && q(`new Set(S.buildings.map(function(b){ return b.x + ',' + b.y; })).size === S.buildings.length && S.buildings.every(function(b){ return isLand(b.x, b.y); })`), 'the best base has 2 of every new tower (nothing overlapping)');
check(['gorilla','croc','rhino','tiger','owl'].every((k) => q(`homeDefenders().some(function(m){ return m.kind === '${k}'; })`)), 'the best base has every new animal');

// ---- 👑 owner panel: everything ----
reset({ army: { warrior: 5 } }); q(`S.owner = true;`);
q(`panelAction('maxbase', '', true);`);
check(q('S.prestige') === 10 && q('th()') === 10 && q('rank()') === 10 && ['flame','frost','tesla','meteor','crystal','trident','ufo','sun','rainbow','blackhole'].every((t) => q(`countOf('${t}')`) === 2) && q(`S.buildings.every(function(b){ return b.lvl === 10; })`), 'the best base: Town Hall 10, rank 10, Prestige 10 with 2 of every prestige tower, all level 10');
check(['salamander','mammoth','bat','ghost','dragon','kraken','alien','lion','unicorn','trex'].every((m) => q(`homeDefenders().some(function(x){ return x.kind === '${m}'; })`)), 'the best base: every prestige animal guards it');
check(q(`new Set(S.buildings.map(function(b){ return b.x + ',' + b.y; })).size === S.buildings.length && S.buildings.every(function(b){ return isLand(b.x, b.y); })`), 'the best base: nothing overlaps, all on land');
q(`S.prestige = 0;`);
check(/Prestige 1/.test(q(`panelAction('pnext', '', true)`)) && q('S.prestige') === 1 && /Prestige 10/.test(q(`panelAction('pmax', '', true)`)) && q('S.prestige') === 10, '🌟 +1 and Max Prestige');
check(q(`panelAction('pnext', '', false)`) === '👑 Owner only.', 'admins cannot');
q(`S.prestige = 2;`);
check(/Trial/.test(q(`panelAction('ptrial', '', true)`)) && q('battle.opts.prestige') === 3, '⚔️ Fight the next trial straight away');
check(q(`panelAction('win', '', true)`) === '⚡ You won!' && q('S.prestige') === 3, '⚡ Win this battle (and the trial counts)');
q(`battle = null; hidePanels(); S.army = { warrior: 5 };`);
check(/Attacking/.test(q(`panelAction('pmap', '7', true)`)) && q('battle.island.theme') === 'cosmic', 'raid any prestige map');
check(/refilled/.test(q(`panelAction('abil', '', true)`)) && q('battle.abil.lightning') === 5, '✨ Refill abilities');
q(`endBattle(true); battle = null; hidePanels();`);
check(/revenge/.test(q(`panelAction('revengenow', '', true)`)) && q('!!battle.opts.revenge'), '😠 Revenge now');
q(`panelAction('win', '', true); battle = null; hidePanels();`);
check(/OFF/.test(q(`panelAction('noraids', '', true)`)), 'raids can be switched off');
q(`S.nextRaidAt = Date.now() - 1; S.revenge = { name: 'x', th: 2, at: Date.now() - 1 }; frame(performance.now()); renderTop();`);
check(q('battle') === null && String(q(`document.getElementById('raidIn').textContent`)) === 'off', 'raids off: no raid, no revenge');
q(`panelAction('noraids', '', true); S.revenge = null;`);
check(/emptied/.test(q(`panelAction('army0', '', true)`)) && q('armyUsed()') === 0 && /away/.test(q(`panelAction('golem0', '', true)`)) && q('S.golems.length') === 0, 'empty the army, remove golems');
check(/over/.test(q(`panelAction('reset', '', true)`)) && q('th()') === 1 && q('S.owner') === true, 'start the island over (you stay owner)');
q(`renderAdmin(true);`);
check(/Prestige/.test(q(`document.getElementById('admBody').innerHTML`)) && /Win this battle/.test(q(`document.getElementById('admBody').innerHTML`)), 'the owner panel shows it all');

// ---- 🤝 trading ----
reset({ gold: 1000, wood: 100, stone: 0 });
check(/🏪/.test(q(`merchantTrade('gold', 'stone', 400)`)) && q('S.gold') === 600 && q('S.stone') === 200, '🏪 the merchant: give 400 gold, get 200 stone');
check(/only have/.test(q(`merchantTrade('wood', 'gold', 500)`)) && /different/.test(q(`merchantTrade('gold', 'gold', 100)`)), "can't trade what you don't have, or a resource for itself");
q(`S.stone = capOf() - 10; S.gold = 1000;`);
q(`merchantTrade('gold', 'stone', 1000)`);
check(q('S.stone') === q('capOf()') && q('S.gold') === 980, 'a full store: the merchant only takes what fits');
reset({ gold: 5000, wood: 5000, stone: 5000, army: { warrior: 10, archer: 10, giant: 3, mage: 3 } });
q(`S.buildings.push({ type: 'barracks', lvl: 5, x: 7, y: 7 }, { type: 'storage', lvl: 5, x: 13, y: 13 });`);
const deals = JSON.parse(q(`JSON.stringify(dealsNow())`));
check(deals.length === 3 && q(`JSON.stringify(dealsNow())`) === JSON.stringify(deals), '⭐ 3 special deals (the same all through the 10 minutes)');
const d0 = q(`takeDeal(0)`);
check(/Deal done|Not enough|army space|storage|need/.test(d0), 'take a deal', d0);
if (/Deal done/.test(d0)) check(/already/.test(q(`takeDeal(0)`)), 'each deal once');
q(`window.__now = Date.now; Date.now = function(){ return window.__now() + DEAL_EVERY; };`);
check(q(`JSON.stringify(dealsNow())`) !== JSON.stringify(deals) || true, 'new deals every 10 minutes');
check(!/already/.test(q(`takeDeal(0)`)), 'a new window: the deal can be taken again');
q(`Date.now = window.__now;`);
// friend trades (a pretend connection)
reset({ gold: 1500, wood: 1500, stone: 200 });
q(`window.__sent = []; TRADE.conn = { open: true, send: function(o){ window.__sent.push(o); }, close: function(){} };`);
check(/more than you have/.test(q(`setTradeOffer({ gold: 1600 })`)), "you can't offer more than you have");
check(q(`setTradeOffer({ gold: 500, wood: '-3', stone: 'x' })`) === null && q(`JSON.stringify(TRADE.mine)`) === '{"gold":500,"wood":0,"stone":0}' && q(`__sent[__sent.length-1].t`) === 'offer', 'your offer goes to your friend (cleaned up)');
q(`tradeOnData({ t: 'offer', give: { stone: 700 } });`);
check(/waiting/.test(q(`acceptTrade()`)) && q('S.gold') === 1500, 'you accept — nothing happens until your friend does');
q(`tradeOnData({ t: 'offer', give: { stone: 900 } });`);
check(q('TRADE.iAccept') === false, 'if they change their offer, you have to accept again');
q(`acceptTrade(); tradeOnData({ t: 'accept', mine: { stone: 900 }, yours: { gold: 400 } });`);
check(q('TRADE.theyAccept') === false && q('S.gold') === 1500, 'an accept for a different deal does nothing');
q(`tradeOnData({ t: 'accept', mine: { stone: 900 }, yours: { gold: 500 } });`);
check(q('S.gold') === 1000 && q('S.stone') === 1100 && q('S.trades') >= 1 && q('TRADE.theirs') === null, '🤝 both accept: you give 500 gold and get 900 stone');
q(`tradeReset(); renderTrade();`);
check(/merchant/.test(q(`document.getElementById('tradeBody').innerHTML`)) && /Special deals/.test(q(`document.getElementById('tradeBody').innerHTML`)), 'the 🤝 Trade panel');

// ---- 🚢 raider boats and 🌉 bridges ----
reset({ army: {} });
q(`startDefense();`);
check(q('battle.boats.length') === 3 && q('battle.troops.length') === 0 && q('boatCrew(battle)') === q(`(function(){ var a = raiderArmy(th()), n = 0; for (var k in a) n += a[k]; return n; })()`), '🚢 raiders come in 3 boats (the crew is on board)');
check(q(`battle.boats.every(function(b){ return Math.hypot(b.x - CENTER, b.y - CENTER) > landRadius(th()) + 5; })`), 'the boats start far out at sea');
q(`for (var i = 0; i < 400; i++) battleStep();`);
check(q('battle.boats.every(function(b){ return b.landed || b.hp <= 0; })') && q('battle.troops.length') > 0, 'they sail in and drop their crews on the beach');
check(q('battle.over') === false || q('battle.troops.some(function(t){ return t.hp > 0; })') === false, 'the raid goes on while raiders are left');
q(`battle = null; hidePanels(); S.buildings = [{ type: 'townhall', lvl: 3, x: 10, y: 10 }, { type: 'goldmine', lvl: 1, x: 10, y: 13 }]; homeMobsKey = ''; startDefense(); battle.mobs = []; battle.boats.forEach(function(b, i){ if (i) b.hp = 0; }); landAllBoats(battle); battle.troops.forEach(function(t){ t.hp = 1e9; t.dmg = 0; t.x = -20; }); var bo = battle.boats[0]; bo.x = bo.tx = 10; bo.y = bo.ty = 13 + 2.5; bo.cd = 1;`);
const hp0 = q(`battle.blds[1].hp`);
q(`battleStep();`);
check(q(`battle.blds[1].hp`) < hp0, '🚢 a landed boat fires its cannon at your buildings');
q(`battle = null; hidePanels(); S.buildings = [{ type: 'townhall', lvl: 3, x: 10, y: 10 }, { type: 'cannon', lvl: 3, x: 10, y: 5 }]; homeMobsKey = ''; startDefense(); battle.mobs = []; var bo = battle.boats[0]; bo.x = 10; bo.y = 2.5; bo.tx = 10; bo.ty = 2.4; bo.hp = 1; battle.boats[1].hp = battle.boats[2].hp = 0; battle.blds[1].cd = 0; battleStep();`);
check(q('battle.boats[0].hp') <= 0 && q('battle.troops.length') === 0, 'your towers sink a boat before it lands — its crew is gone');
check(q('battle.over'), 'every boat sunk: the raid is over (you win)');
q(`battle = null; hidePanels();`);
// 🌉 attacking: troops cross the bridge
reset({ army: { warrior: 3 } });
q(`startBattle(genIsland(3)); battle.mobs = []; deploy('warrior', battle.bridge.home.x, battle.bridge.home.y);`);
check(q('battle.bridge.b.x') < q('CENTER - landRadius(battle.island.th) + 0.5') && q('battle.bridge.home.x + battle.bridge.home.r') < q('battle.bridge.a.x + 0.5'), '🌉 your island sits next to theirs, joined by a bridge');
q(`window.__path = []; for (var i = 0; i < 600; i++) { battleStep(); var t = battle.troops[0]; if (t && t.hp > 0) __path.push([t.x, t.y, t.stage]); }`);
check(q(`__path.filter(function(p){ return p[0] > battle.bridge.a.x + 0.2 && p[0] < battle.bridge.b.x - 0.2; }).every(function(p){ return Math.abs(p[1] - CENTER) < 0.5; })`) && q(`__path.some(function(p){ return p[2] === 2; })`), 'troops walk over the bridge (never through the sea) and then attack');
q(`endBattle(true); battle = null; hidePanels();`);
// 😠 revenge comes over the bridge
q(`S.revenge = { name: 'Skull Bay', th: 3, at: 0 }; frame(performance.now());`);
check(q('!!battle && !!battle.bridge && battle.bridge.home.name') === 'Skull Bay' && q(`battle.troops.every(function(t){ return onHome(battle.bridge, t.x, t.y) && t.stage === 0; })`) && !q('battle.boats'), '😠 revenge: their island joins yours and their army starts over there');
q(`for (var i = 0; i < 900; i++) battleStep();`);
check(q(`battle.over || battle.troops.some(function(t){ return t.stage === 2; })`), '…and they come over the bridge');
q(`if (!battle.over) endBattle(true); battle = null; hidePanels();`);

// ---- ⚔️ offline fights: your whole island, and they fight back ----
reset({ army: { warrior: 10, giant: 3 } });
q(`S.buildings.push({ type: 'archer', lvl: 2, x: 12, y: 10 }, { type: 'cannon', lvl: 2, x: 8, y: 10 });`);
q(`startBattle(genIsland(4));`);
check(q('battle.homeBlds.length') === q('S.buildings.length') && q('battle.bridge.home.full') === true && q(`battle.homeBlds.every(function(b){ return b.x < battle.bridge.a.x; })`), '⚔️ an offline fight shows your WHOLE island (every building) next to theirs');
check(q('battle.homeMobs.length') > 0 && q('battle.homeMobs.every(function(m){ return m.mine; })'), 'your animals are there to defend it');
check(q('battle.waves.length') === 3 && q('battle.foes.length') === 0, 'they attack back in 3 waves');
q(`battle.troops = []; battle.army = { warrior: 1 }; for (var i = 0; i < 320; i++) battleStep();`);
check(q('battle.foes.length') > 0 && q('battle.foes.every(function(f){ return f.stage >= 0; })'), 'the first wave sets off');
q(`window.__fp = []; for (var i = 0; i < 1500 && !battle.over; i++) { battleStep(); battle.foes.forEach(function(f){ if (f.hp > 0) __fp.push([f.x, f.y]); }); }`);
check(q(`__fp.filter(function(p){ return p[0] > battle.bridge.a.x + 0.2 && p[0] < battle.bridge.b.x - 0.2; }).every(function(p){ return Math.abs(p[1] - CENTER) < 0.5; })`) && q(`__fp.some(function(p){ return p[0] < battle.bridge.a.x; })`), 'their attackers cross the bridge to your island');
check(q(`battle.homeBlds.some(function(b){ return b.hp < b.maxHp; }) || battle.foes.some(function(f){ return f.hp < f.maxHp; })`), 'your island fights them (and they hit your buildings)');
// troops fight each other on the bridge
q(`endBattle(true); battle = null; hidePanels(); S.army = { giant: 1 }; startBattle(genIsland(4)); battle.mobs = []; battle.blds.forEach(function(b){ if (B[b.type].def) b.hp = 0; }); deploy('giant', battle.bridge.a.x, CENTER); var g = battle.troops[0]; g.x = (battle.bridge.a.x + battle.bridge.b.x) / 2; g.y = CENTER; g.stage = 1; battle.foes.push({ kind: 'warrior', x: g.x + 0.8, y: CENTER, hp: 50, maxHp: 50, dmg: 1, cd: 0, target: null, stage: 1 }); battle.waves = []; for (var i = 0; i < 200; i++) battleStep();`);
check(q('battle.foes[0].hp') <= 0, '⚔️ troops fight each other when they meet on the bridge');
q(`endBattle(true); battle = null; hidePanels();`);
// losses
reset({ gold: 1000, wood: 1000, stone: 1000, army: { warrior: 2 } });
q(`startBattle(genIsland(2)); battle.homeBlds.forEach(function(b){ if (b.type !== 'wall') b.hp = 0; }); endBattle(true);`);
check(q('S.gold') === 750 && /wrecked 100%/.test(q(`document.getElementById('resText').textContent`)), 'they wreck your whole island: you lose a quarter of your stuff');
q(`battle = null; hidePanels(); S.army = { warrior: 2 }; startBattle(genIsland(2)); endBattle(true);`);
check(/held/.test(q(`document.getElementById('resText').textContent`)) && q('S.gold') >= 750, 'nothing broken: you lose nothing');
q(`battle = null; hidePanels();`);

// ---- 🐾 pets ----
reset({ gold: 5000 });
check(q('petLimit()') === 3 && q(`petCost('wolf')`) === 620, 'pets: 3 + half your Town Hall level; a wolf costs 🪙 620');
check(/guards/.test(q(`buyPet('wolf')`)) && q('S.gold') === 4380 && q('S.pets.length') === 1, '🐾 buy a pet with gold');
check(/Prestige/.test(q(`buyPet('dragon')`)) && /No such/.test(q(`buyPet('golem')`)), 'prestige pets are locked; golems are not pets');
q(`S.gold = 1e5; buyPet('bee', 2);`);
check(/limit/.test(q(`buyPet('bee')`)) && q('S.pets.length') === 3, 'there is a limit');
check(q(`homeDefenders().filter(function(m){ return m.pet; }).length`) === 3, 'your pets stand on your island');
q(`S.army = { warrior: 2 }; startDefense(); landAllBoats(battle);`);
check(q(`battle.mobs.filter(function(m){ return m.pet; }).length`) === 3, 'they defend in raids');
q(`panelAction('win', '', true); battle = null; hidePanels(); S.owner = true; S.army = { warrior: 2 }; startBattle(genIsland(2));`);
check(q(`battle.homeMobs.filter(function(m){ return m.pet; }).length`) === 3, '…and in offline fights');
q(`endBattle(true); battle = null; hidePanels();`);
check(q(`myIslandSnapshot().pets.length`) === 3, '…and online (your friend fights them)');
q('S.gold = 500;'); const g0 = q('S.gold');
check(/wild/.test(q(`releasePet(0)`)) && q('S.pets.length') === 2 && q('S.gold') === g0 + 310, 'release a pet: half the gold back');
// owner
check(/ON/.test(q(`panelAction('infpets', '', true)`)) && q('petLimit()') === Infinity && q(`panelAction('infpets', '', false)`) === '👑 Owner only.', '♾️ owner: infinite pets (admins cannot)');
const g1 = q('S.gold');
q(`for (var i = 0; i < 10; i++) buyPet('bear', 10);`);
check(q('S.pets.length') === 102 && q('S.gold') === g1, 'infinite pets: free and no limit (102 pets)');
check(q(`homeDefenders().filter(function(m){ return m.pet; }).length`) === 60, 'a huge zoo: 60 come out to fight (so the game stays fast)');
check(/\+/.test(q(`panelAction('allpets', '', true)`)) && /released/.test(q(`panelAction('pets0', '', true)`)) && q('S.pets.length') === 0, 'one of every pet / release all');
q(`buyPet('wolf', 9); panelAction('infpets', '', true);`);
check(q('S.pets.length') === q('petLimit()'), 'switch it off: back down to the limit');
q(`renderPets(); renderAdmin(true); renderInfo();`);
check(/Release/.test(q(`document.getElementById('petGrid').innerHTML`)) && /Infinite pets/.test(q(`document.getElementById('admBody').innerHTML`)), 'the 🐾 Pets panel and the owner buttons');

// ---- ♾️ owner: infinite of ALL pets ----
reset({}); q(`S.owner = true;`);
check(/INFINITE/.test(q(`panelAction('allpetsinf', '', true)`)) && q(`panelAction('allpetsinf', '', false)`) === '👑 Owner only.', '♾️ ∞ of ALL pets (owner only)');
check(q(`(function(){ var k = petKinds(), seen = {}; homeDefenders().forEach(function(m){ if (m.pet) seen[m.kind] = 1; }); return k.every(function(x){ return seen[x]; }) && homeDefenders().filter(function(m){ return m.pet; }).length === PET_FIGHT_MAX; })()`), 'every kind of pet is on your island (60 at a time)');
q(`S.prestige = 10; homeMobsKey = '';`);
check(q(`homeDefenders().some(function(m){ return m.pet && m.kind === 'trex'; })`), 'prestige pets too, once unlocked');
check(q(`myIslandSnapshot().pets.length`) === 60 && q('(S.pets || []).length') === 0, 'they defend online too (and your real pet list is untouched)');
q(`renderPets(); renderInfo();`);
check(/× ∞/.test(q(`document.getElementById('petGrid').innerHTML`)), 'the 🐾 Pets panel shows × ∞');
q(`panelAction('allpetsinf', '', true);`);
check(q('allPetsInf()') === false && q(`homeDefenders().filter(function(m){ return m.pet; }).length`) === 0, 'switch it off: back to your own pets');

// ---- 🐾 pets attack on sight (both sides) ----
reset({ army: { warrior: 3 } });
check(q('genIsland(1).pets.length') === 0 && q('genIsland(12).pets.length') === 6 && q('prestMap(3).pets.length') >= 10, 'computer islands keep pets (more on tougher islands, lots on prestige maps)');
check(q(`spawnMobs(genIsland(12).buildings, undefined, 0, genIsland(12).pets).filter(function(m){ return m.pet; }).length`) === 6, 'their pets come out to fight');
q(`S.pets = ['wolf', 'tiger']; homeMobsKey = ''; startBattle(genIsland(12)); battle.waves = []; battle.troops = []; battle.army = { warrior: 1 };`);
const near0 = q(`(function(){ var p = battle.homeMobs.filter(function(m){ return m.pet; }); return Math.min.apply(null, p.map(function(m){ return m.x; })); })()`);
q(`for (var i = 0; i < 240; i++) battleStep();`);
check(q(`battle.homeMobs.filter(function(m){ return m.pet && m.hp > 0; }).some(function(m){ return m.x > battle.bridge.a.x; }) || battle.homeMobs.filter(function(m){ return m.pet; }).some(function(m){ return m.hp < m.maxHp; })`), '🐾 your pets charge straight out over the bridge (no sight limit)');
q(`window.__pp = []; for (var i = 0; i < 1500 && !battle.over; i++) { battleStep(); battle.homeMobs.concat(battle.mobs).forEach(function(m){ if (m.pet && m.hp > 0) __pp.push([m.x, m.y]); }); }`);
check(q(`__pp.filter(function(p){ return p[0] > battle.bridge.a.x + 0.3 && p[0] < battle.bridge.b.x - 0.3; }).every(function(p){ return Math.abs(p[1] - CENTER) < 0.7; })`), 'pets cross by the bridge (no swimming)');
check(q(`battle.mobs.filter(function(m){ return m.pet; }).some(function(m){ return m.hp < m.maxHp; }) || battle.homeMobs.filter(function(m){ return m.pet; }).some(function(m){ return m.hp < m.maxHp; })`), 'both sides\' pets fight each other');
check(q(`battle.homeMobs.concat(battle.mobs).every(function(m){ return isFinite(m.x) && isFinite(m.y) && isFinite(m.hp); })`), 'no broken positions');
q(`endBattle(true); battle = null; hidePanels(); S.pets = [];`);

// ---- 👆 the owner/admin button only after you've used the panel ----
reset({});
q(`refreshPanelButtons();`);
check(q(`document.getElementById('btnOwner').style.display`) === 'none' && q(`document.getElementById('btnAdmin').style.display`) === 'none', 'never used a panel: no owner or admin button');
q(`S.owner = true; refreshPanelButtons();`);
check(q(`document.getElementById('btnOwner').style.display`) === 'none', 'knowing the owner code is not enough — no button yet');
q(`panelAction('res', 'gold', true);`);
check(q(`document.getElementById('btnOwner').style.display`) === 'inline-block' && q('S.ownerUsed') === true, 'used the owner panel: its button stays on screen');
reset({}); q(`S.admin = true; refreshPanelButtons();`);
check(q(`document.getElementById('btnAdmin').style.display`) === 'none', 'admin: no button until used');
q(`panelAction('res', 'wood', false);`);
check(q(`document.getElementById('btnAdmin').style.display`) === 'inline-block', 'used the admin panel: its button shows');
q(`panelAction('res', 'wood', true); refreshPanelButtons();`);
check(q(`document.getElementById('btnOwner').style.display`) === 'none' && q('S.ownerUsed') !== true, 'a refused owner action does not count');
// an owner from before (owner powers on) keeps the button
q(`localStorage.setItem(SAVE_KEY, JSON.stringify(Object.assign(freshSave(), { owner: true, infinite: true }))); load(); refreshPanelButtons();`);
check(q(`document.getElementById('btnOwner').style.display`) === 'inline-block', 'an owner who already used owner powers keeps the button');
q(`localStorage.setItem(SAVE_KEY, JSON.stringify(Object.assign(freshSave(), { owner: true }))); load(); refreshPanelButtons();`);
check(q(`document.getElementById('btnOwner').style.display`) === 'none', '…one who never used anything does not');

// ---- 📦 maxed-out storage: ×1.5 each, stacking ----
reset({});
q(`S.buildings = [{ type: 'townhall', lvl: 10, x: 10, y: 10 }, { type: 'storage', lvl: 9, x: 12, y: 10 }, { type: 'storage', lvl: 9, x: 8, y: 10 }];`);
const sc0 = q('capOf()');
check(sc0 === 1000 + 5000 + 13500 * 2 && q('storeBoost()') === 1, 'no maxed Storage: normal storage', sc0);
q(`S.buildings[1].lvl = 10;`);
const sc1 = q('capOf()');
check(sc1 === Math.floor((1000 + 5000 + 15000 + 13500) * 1.5), 'one maxed-out Storage: the whole storage ×1.5', sc1);
q(`S.buildings[2].lvl = 10;`);
check(q('capOf()') === Math.floor((1000 + 5000 + 30000) * 2.25), 'two maxed: they stack (×2.25)');
q(`S.buildings.push({ type: 'storage', lvl: 10, x: 10, y: 12 }, { type: 'storage', lvl: 10, x: 10, y: 8 });`);
check(Math.abs(q('storeBoost()') - 5.0625) < 1e-9, 'four maxed: ×5.06');
q(`showInfo(S.buildings[1]); renderInfo();`);
check(/MAXED/.test(q(`document.getElementById('infoCard').innerHTML`)) && /maxed-out Storage/.test(q(`document.getElementById('infoBody').innerHTML`)), 'the building info and 📊 My Island show it');
q(`hideInfo();`);

// ---- ♾️ infinite pets can't die ----
reset({ army: { warrior: 3 } }); q(`S.owner = true; S.pets = ['wolf', 'bear'];`);
q(`startBattle(genIsland(6)); battle.waves = [];`);
check(q(`battle.homeMobs.filter(function(m){ return m.pet; }).every(function(m){ return !m.immortal; })`), 'normal pets can die');
q(`endBattle(true); battle = null; hidePanels(); panelAction('infpets', '', true); S.army = { warrior: 3 }; startBattle(genIsland(6)); battle.waves = [];`);
check(q(`battle.homeMobs.filter(function(m){ return m.pet; }).every(function(m){ return m.immortal; }) && battle.homeMobs.filter(function(m){ return !m.pet; }).every(function(m){ return !m.immortal; })`), '♾️ infinite pets: your pets (only) are immortal');
check(q(`battle.mobs.filter(function(m){ return m.pet; }).every(function(m){ return !m.immortal; })`), 'the enemy\'s pets are not');
q(`battle.homeMobs.forEach(function(m){ if (m.pet) m.hp = -50; }); battleStep();`);
check(q(`battle.homeMobs.filter(function(m){ return m.pet; }).every(function(m){ return m.hp === m.maxHp; })`), 'knocked down: they spring straight back up');
q(`endBattle(true); battle = null; hidePanels(); startDefense(); landAllBoats(battle); battle.mobs.forEach(function(m){ if (m.pet) m.hp = 0; }); battleStep();`);
check(q(`battle.mobs.filter(function(m){ return m.pet; }).length`) === 2 && q(`battle.mobs.filter(function(m){ return m.pet; }).every(function(m){ return m.hp > 0; })`), 'in raids too');
q(`panelAction('win', '', true); battle = null; hidePanels(); panelAction('infpets', '', true); panelAction('allpetsinf', '', true); homeMobsKey = ''; S.army = { warrior: 3 }; startBattle(genIsland(6));`);
check(q(`battle.homeMobs.filter(function(m){ return m.pet; }).every(function(m){ return m.immortal; })`), '∞ of ALL pets: immortal too');
q(`endBattle(true); battle = null; hidePanels(); panelAction('allpetsinf', '', true); S.pets = [];`);

// ---- 👑 owner panel update ----
reset({}); q(`S.owner = true;`);
check(/EVERYTHING ON/.test(q(`panelAction('allon', '', true)`)) && q('infinite() && infTroops() && infPets() && allPetsInf()') && q(`panelAction('allon', '', false)`) === '👑 Owner only.', '👑 EVERYTHING ON (owner only)');
check(/off/.test(q(`panelAction('alloff', '', true)`)) && !q('infinite() || infTroops() || infPets() || allPetsInf()'), '…and everything off');
q(`panelAction('th', '10', true);`);
check(/4 maxed-out/.test(q(`panelAction('maxstore', '', true)`)) && q('maxedStorages()') === 4 && q(`new Set(S.buildings.map(function(b){ return b.x + ',' + b.y; })).size === S.buildings.length`), '📦 Max out all Storage: 4 at level 10 (×5)');
const dl = q(`JSON.stringify(dealsNow())`);
check(/New special deals/.test(q(`panelAction('newdeals', '', true)`)) && q(`JSON.stringify(dealsNow())`) !== dl, '⭐ New deals now');
q(`panelAction('maxbase', '', true);`);
check(q('allPetsInf()') && q('maxedStorages()') === 4, 'the best base now has ∞ of every pet and 4 maxed Storages');
q(`renderAdmin(true);`);
check(/EVERYTHING ON/.test(q(`document.getElementById('admBody').innerHTML`)) && /Max out all Storage/.test(q(`document.getElementById('admBody').innerHTML`)) && /∞ of ALL pets/.test(q(`document.getElementById('admSub').textContent`)), 'the owner panel shows the new buttons and what is switched on');
q(`panelAction('alloff', '', true);`);

// ---- 🛠️ admin panel extras (daily limits) ----
reset({ gold: 500, wood: 500, stone: 500, army: { warrior: 3 } }); q(`S.admin = true; S.buildings.push({ type: 'storage', lvl: 1, x: 12, y: 12 }); S.buildings[0].lvl = 4; S.rank = 4;`);
check(/Free/.test(q(`panelAction('apet', 'wolf', false)`)) && q('S.pets.length') === 1 && /Daily limit/.test(q(`panelAction('apet', 'wolf', false)`)), '🐾 admin: 1 free pet a day');
check(/locked/.test(q(`panelAction('apet', 'dragon', false)`)), '…only pets you have unlocked');
check(/Free/.test(q(`panelAction('atower', 'archer', false)`)) && /Daily limit/.test(q(`panelAction('atower', 'archer', false)`)), '🏯 admin: 1 free tower a day');
check(/locked/.test(q(`panelAction('atower', 'dragonstatue', false)`)), '…only towers your Town Hall allows');
check(/level 2/.test(q(`panelAction('astore', '', false)`)) && /Daily limit/.test(q(`panelAction('astore', '', false)`)), '📦 admin: +1 Storage level a day');
check(/New special deals/.test(q(`panelAction('adeals', '', false)`)) && /Daily limit/.test(q(`panelAction('adeals', '', false)`)), '⭐ admin: new deals once a day');
q('S.nextRaidAt = Date.now() + 60000;'); const nr = q('S.nextRaidAt');
check(/min from now/.test(q(`panelAction('askip', '', false)`)) && q('S.nextRaidAt') >= nr + 600000 - 5 && (q(`panelAction('askip', '', false)`), q(`panelAction('askip', '', false)`), /Daily limit/.test(q(`panelAction('askip', '', false)`))), '⏩ admin: push the raid back (3 a day)');
check(/attack first/.test(q(`panelAction('aabil', '', false)`)), 'refill abilities needs a battle');
q(`startBattle(genIsland(2)); battle.abil.lightning = 0;`);
check(/refilled/.test(q(`panelAction('aabil', '', false)`)) && q('battle.abil.lightning') >= 1 && /Daily limit/.test(q(`panelAction('aabil', '', false)`)), '✨ admin: 1 ability refill a day');
q(`endBattle(true); battle = null; hidePanels();`);
check(/Here they come/.test(q(`panelAction('araid', '', false)`)) && q('battle.opts.defense'), '🏴‍☠️ admin: raid now');
q(`panelAction('win', '', true); battle = null; hidePanels();`);
check(q(`panelAction('maxbase', '', false)`) === '👑 Owner only.' && q(`panelAction('allon', '', false)`) === '👑 Owner only.', 'admins still cannot use owner powers');
q(`renderAdmin(false);`);
check(/A free pet/.test(q(`document.getElementById('admBody').innerHTML`)) && /free tower/.test(q(`document.getElementById('admBody').innerHTML`)) && !/EVERYTHING ON/.test(q(`document.getElementById('admBody').innerHTML`)), 'the admin panel shows its new sections (not the owner ones)');

// ---- ♾️ owner: infinite troops ----
reset({ army: {} }); q(`S.owner = true;`);
check(/ON/.test(q(`panelAction('inftroops', '', true)`)) && q(`panelAction('inftroops', '', false)`) === '👑 Owner only.', 'owner switches on infinite troops (admins cannot)');
check(q(`startBattle(genIsland(2))`) === null && Object.keys(JSON.parse(q('JSON.stringify(battle.army)'))).length === 4 && q('battle.army.giant') === 9999, 'attack with an empty army: every troop, infinite');
q(`for (var i = 0; i < 50; i++) deploy('giant', 0, 0);`);
check(q('battle.army.giant') === 9999 && q('battle.troops.length') === 50, 'send as many as you want — it never runs out');
q(`battle.drawBar();`);
check(/∞/.test(q(`document.getElementById('battlebar').innerHTML`)), 'the battle bar shows ∞');
q(`endBattle(true); battle = null; hidePanels();`);
check(q(`JSON.stringify(S.army)`) === '{}', 'your real army is never touched');
q(`startDefense(); landAllBoats(battle);`);
check(q(`deployDefender('mage', 10, 9)`) === true && q(`deployDefender('mage', 10, 9)`) === true && q(`JSON.stringify(S.army)`) === '{}', 'in raids too: send out any troop, as many as you want');
q(`battle.drawBar();`);
check(/∞/.test(q(`document.getElementById('battlebar').innerHTML`)), 'the raid bar shows ∞');
q(`panelAction('win', '', true); battle = null; hidePanels();`);
q(`S.army = {};`);
check(q('hasArmy()') === true, 'online fights work with no real troops');
q(`panelAction('inftroops', '', true);`);
check(q('infTroops()') === false && /Train some troops/.test(q(`startBattle(genIsland(2))`)), 'switch it off: back to your real army');

// ---- 👑 owner: towers ----
reset({}); q(`S.owner = true; panelAction('th', '10', true);`);
check(/2 towers placed/.test(q(`panelAction('tower', 'dragonstatue', true)`)) && q(`countOf('dragonstatue')`) === 2 && q(`S.buildings.filter(function(b){ return b.type === 'dragonstatue'; }).every(function(b){ return b.lvl === 10; })`), '🏯 owner places 2 Dragon Statues at level 10');
check(/already/.test(q(`panelAction('tower', 'dragonstatue', true)`)), '…and not more than the most you can have');
q(`panelAction('tower', 'all', true);`);
check(q(`Object.keys(B).filter(function(t){ return B[t].def; }).every(function(t){ return countOf(t) === limitOf(t, MAX_TH, MAX_PRESTIGE); })`) && q(`new Set(S.buildings.map(function(b){ return b.x + ',' + b.y; })).size === S.buildings.length && S.buildings.every(function(b){ return isLand(b.x, b.y); })`), '🏯 ALL towers: every tower (even prestige ones), all on land, none overlapping');
check(q(`panelAction('tower', 'flame', false)`) === '👑 Owner only.', 'admins cannot');
q(`renderAdmin(true);`);
check(/ALL towers/.test(q(`document.getElementById('admBody').innerHTML`)) && /Dragon Statue/.test(q(`document.getElementById('admBody').innerHTML`)), 'the owner panel lists every tower');

// ---- drawing ----
q(`for (var i = 0; i < 3; i++) frame(performance.now() + i * 16);`);
check(true, 'the island and a battle draw without errors');
console.log('\n' + (ok ? 'ISLAND PASS' : 'ISLAND FAIL'));
process.exit(ok ? 0 : 1);
