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
check(q('S.admin') === true && q(`document.getElementById('adminPanel').style.display`) === 'block' && q(`document.getElementById('btnAdmin').style.display`) === 'inline-block', '🛠️ the admin code opens the Admin Panel (and its button stays at the top)');
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
check(q(`document.getElementById('btnOwner').style.display`) === 'inline-block', '👑 the owner button shows at the top');
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
q(`startDefense(); battle.mobs = []; battle.blds.forEach(function(b){ if (B[b.type].def) b.hp = 0; });`);
check(q(`battle.opts.defense`) && q(`battle.troops.length`) === 4 && q(`battle.troops.every(function(t){ return t.raider; })`), 'raiders land and attack your island');
q(`var n = 0; while (battle && !battle.over && n++ < 6000) { battle.troops.forEach(function(t){ t.hp = Math.max(t.hp, 1e6); t.dmg = 500; }); battleStep(); }`);
const lost = JSON.parse(q(`JSON.stringify({ g: S.gold, w: S.wood, s: S.stone, title: document.getElementById('resTitle').textContent, lost: S.raidsLost })`));
check(lost.g === 500 && lost.w === 400 && lost.s === 300 && /raiders won/.test(lost.title) && lost.lost === 1, 'lose (they destroy half your island): you lose HALF your stuff', JSON.stringify(lost));
check(q(`Math.round((S.nextRaidAt - Date.now()) / 60000)`) === 10, '…and the next raid is 10 minutes away');
q(`battle = null; hidePanels();`);
// win: they all fall
reset({ gold: 100, wood: 100, stone: 100, army: {} });
q(`startDefense(); var loot = Object.assign({}, battle.raid.loot), army = Object.assign({}, battle.raid.army); window.__raid = { loot: loot, army: army }; battle.troops.forEach(function(t){ t.hp = 0; }); battleStep();`);
const won = JSON.parse(q(`JSON.stringify({ g: S.gold, w: S.wood, s: S.stone, army: S.army, raid: window.__raid, title: document.getElementById('resTitle').textContent, won: S.raidsWon, trophies: S.trophies })`));
check(/beat the raiders/.test(won.title) && won.won === 1, 'beat them: you win', JSON.stringify(won));
check(won.army.warrior === won.raid.army.warrior && won.army.archer === won.raid.army.archer, '…the raiders join your army as recruits');
check(won.g === 100 + Math.floor(won.raid.loot.gold / 4) && won.s === 100 + Math.floor(won.raid.loot.stone / 4), '…and you take a quarter of what they carried');
q(`battle = null; hidePanels();`);
reset({ army: { warrior: 19 } });
q(`startDefense(); battle.troops.forEach(function(t){ t.hp = 0; }); battleStep(); battle = null; hidePanels();`);
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

// ---- drawing ----
q(`for (var i = 0; i < 3; i++) frame(performance.now() + i * 16);`);
check(true, 'the island and a battle draw without errors');
console.log('\n' + (ok ? 'ISLAND PASS' : 'ISLAND FAIL'));
process.exit(ok ? 0 : 1);
