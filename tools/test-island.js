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
check(/id="codebar"/.test(html) && html.indexOf('id="codebar"') < html.indexOf('id="bottom"'), 'the code bar sits at the top of the game');
// ---- drawing ----
q(`for (var i = 0; i < 3; i++) frame(performance.now() + i * 16);`);
check(true, 'the island and a battle draw without errors');
console.log('\n' + (ok ? 'ISLAND PASS' : 'ISLAND FAIL'));
process.exit(ok ? 0 : 1);
