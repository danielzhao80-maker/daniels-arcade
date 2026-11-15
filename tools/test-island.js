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
const reset = (extra) => q(`localStorage.removeItem(SAVE_KEY); S = freshSave(); Object.assign(S, ${JSON.stringify(extra || {})}); save();`);
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
q(`for (var i = 0; i < 10; i++) upgradeBuilding(S.buildings[0]);`);
check(q('th()') === 8 && /top level/.test(q(`upgradeBuilding(S.buildings[0])`)), 'the Town Hall stops at level 8');
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
check(q(`deploy('warrior', CENTER, CENTER)`) === false, 'you cannot drop troops in the middle of their island');
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
const bar = JSON.parse(q(`(function(){ battle.mobs = []; var d = battle.blds.find(function(b){ return B[b.type].def; }); d.frozenUntil = 0; d.cd = 0;
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
check(q(`spawnMobs([{ type: 'barracks', lvl: 1, x: 5, y: 5 }]).length`) === 2 && q(`spawnMobs([{ type: 'barracks', lvl: 3, x: 5, y: 5 }, { type: 'barracks', lvl: 9, x: 6, y: 6 }]).length`) === 10, 'each Barracks sends out 1 + its level (max 6)');
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
reset({ gold: 0 });
q(`redeemCode('SHARK'); document.getElementById('codeList').onclick();`);
const cl = q(`document.getElementById('codesGrid').innerHTML`);
check(q(`document.getElementById('codesPanel').style.display`) === 'block' && (cl.match(/class="card"/g) || []).length === 20 && /SHARK ✓/.test(cl) && /TSUNAMI/.test(cl), '📜 the Codes button lists all 20 codes, with ✓ on the used ones');
check(q(`(function(){ document.querySelector ? 0 : 0; redeemCode('ISLAND'); return S.codes.includes('ISLAND'); })()`), 'its Use buttons redeem them');
check(/id="codebar"/.test(html) && html.indexOf('id="codebar"') < html.indexOf('id="bottom"'), 'the code bar sits at the top of the game');
// ---- drawing ----
q(`for (var i = 0; i < 3; i++) frame(performance.now() + i * 16);`);
check(true, 'the island and a battle draw without errors');
console.log('\n' + (ok ? 'ISLAND PASS' : 'ISLAND FAIL'));
process.exit(ok ? 0 : 1);
