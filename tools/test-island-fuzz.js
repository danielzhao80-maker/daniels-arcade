// 🏝️ Island Clash fuzz test: a 'random player' does thousands of random things; after every one we check nothing
// broke (no errors, no NaN, resources within storage, no overlapping / sunk buildings, limits kept, battles end).
// Run: node tools/test-island-fuzz.js [rounds]
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



function q(js){ return vm.runInNewContext(js, ctx, {filename:'game.js', timeout:600000}); }
let ok = true;
function check(pass, label, extra) {
  if (!pass) ok = false;
  console.log('  ' + (pass ? 'PASS' : 'FAIL'), label + (extra ? '  (' + extra + ')' : ''));
}
const ARC = 'daniels-arcade-v1';
const setArcade = obj => { if (obj === null) delete store[ARC]; else store[ARC] = JSON.stringify(obj); };
// The special-maps grid as the Worlds menu drew it: [title, grid], grid.children = cards.
const ROUNDS = +process.argv[2] || 3000;
const OWNERMODE = !!process.env.FUZZ_OWNER;   // FUZZ_OWNER=1: also mash every Owner Panel button (limits may be broken on purpose)
q(`localStorage.removeItem(SAVE_KEY); S = freshSave(); save();`);
const result = q(`(function(){
  var errors = [], seen = {}, OWNERMODE = ${OWNERMODE};
  var pick = function(a){ return a[Math.floor(Math.random() * a.length)]; };
  var rint = function(a, b){ return a + Math.floor(Math.random() * (b - a + 1)); };
  function inv(where) {
    var cap = capOf();
    ['gold','wood','stone'].forEach(function(k){ var v = S[k]; if (!isFinite(v) || v < -1e-6 || v > cap + 1e-6) errors.push(where + ': ' + k + '=' + v + ' cap=' + cap); });
    if (!isFinite(S.trophies) || S.trophies < 0) errors.push(where + ': trophies=' + S.trophies);
    var tiles = {};
    S.buildings.forEach(function(b){ var key = b.x + ',' + b.y; if (tiles[key]) errors.push(where + ': two buildings on ' + key); tiles[key] = 1; if (!isLand(b.x, b.y)) errors.push(where + ': ' + b.type + ' in the sea'); if (!(b.lvl >= 1)) errors.push(where + ': bad level'); });
    if (!OWNERMODE) Object.keys(B).forEach(function(t){ if (t !== 'townhall' && countOf(t) > limitOf(t, th())) errors.push(where + ': too many ' + t); });   // (the owner may break limits on purpose)
    if ((S.pets || []).length > petLimit() && !OWNERMODE) errors.push(where + ': too many pets ' + S.pets.length);
    (S.pets || []).forEach(function(k){ if (!MOB[k] || MOB[k].golem) errors.push(where + ': bad pet ' + k); });
    if (armyUsed() > armyCap()) errors.push(where + ': army ' + armyUsed() + '/' + armyCap());
    if (th() > rank()) errors.push(where + ': Town Hall ' + th() + ' above rank ' + rank());
    Object.keys(S.army).forEach(function(k){ if (!(S.army[k] >= 0)) errors.push(where + ': army ' + k + '=' + S.army[k]); });
  }
  function fightOnce() {
    var isl = Math.random() < 0.7 ? genIsland(rint(1, 16), rint(1, 9999)) : Object.assign(myIslandSnapshot(), { loot: { gold: 50, wood: 50, stone: 50 } });
    if (Math.random() < 0.3) isl.golems = Object.keys(GOLEM_COST).filter(function(){ return Math.random() < 0.5; });
    var online = Math.random() < 0.2;
    var err = startBattle(isl, online ? { online: true } : {});
    if (err) return;
    var steps = 0;
    while (battle && !battle.over) {
      if (Math.random() < 0.08) { var k = pick(Object.keys(battle.army)); var r = landRadius(isl.th) + Math.random() * 3; var a = Math.random() * 6.283; deploy(k, CENTER + Math.cos(a) * r, CENTER + Math.sin(a) * r); }
      if (Math.random() < 0.01) castAbility(pick(Object.keys(AB)), Math.random() * GRID, Math.random() * GRID);
      if (Math.random() < 0.002) endBattle(true);
      battleStep(); steps++;
      if (battle) {
        battle.troops.forEach(function(t){ if (!isFinite(t.hp) || !isFinite(t.x) || !isFinite(t.y)) errors.push('troop NaN ' + t.kind); });
        (battle.mobs || []).forEach(function(m){ if (!isFinite(m.hp) || !isFinite(m.x)) errors.push('mob NaN ' + m.kind); });
        battle.blds.forEach(function(b){ if (!isFinite(b.hp) || b.hp < 0) errors.push('building hp ' + b.hp); });
      }
      if (steps % 400 === 0) frame(performance.now() + steps);
      if (steps > BATTLE_FRAMES + 50) { errors.push('battle never ended'); break; }
    }
    if (online) { NET.theirs = { pct: rint(0, 100), stars: rint(0, 3), frames: rint(100, 5400) }; onlineResult(); NET.mine = null; NET.theirs = null; }
    battle = null; hidePanels();
  }
  var actions = {
    build: function(){ placeBuilding(pick(BUILD_ORDER), rint(0, GRID - 1), rint(0, GRID - 1)); },
    upgrade: function(){ upgradeBuilding(pick(S.buildings)); },
    perk: function(){ var t = S.buildings.filter(function(b){ return PERKS[b.type]; }); if (t.length) buyPerk(pick(t), rint(0, 2)); },
    train: function(){ train(pick(Object.keys(T)), rint(1, 6)); },
    code: function(){ redeemCode(Math.random() < 0.7 ? pick(Object.keys(CODES)) : 'X' + rint(0, 99)); },
    golem: function(){ buyGolem(pick(Object.keys(GOLEM_COST))); },
    move: function(){ moveBuilding(pick(S.buildings), rint(0, GRID - 1), rint(0, GRID - 1)); },
    produce: function(){ produce(Math.random() * 600); },
    rich: function(){ var c = capOf(); S.gold = Math.min(c, S.gold + 2000); S.wood = Math.min(c, S.wood + 2000); S.stone = Math.min(c, S.stone + 2000); },
    fight: fightOnce,
    raid: function(){ var e = startDefense(); if (e) return; var n = 0; while (battle && !battle.over && n++ < BATTLE_FRAMES + 50) { if (Math.random() < 0.05) { var k = pick(Object.keys(S.army)); deployDefender(k, CENTER + Math.random() * 8 - 4, CENTER + Math.random() * 8 - 4); } battleStep(); if (battle) battle.troops.forEach(function(t){ if (!isFinite(t.hp) || !isFinite(t.x)) errors.push('raider NaN'); }); } if (battle && !battle.over) errors.push('raid never ended'); battle = null; hidePanels(); },
    rankup: function(){ if (Math.random() < 0.5) { S.rank = Math.min(MAX_TH, rank() + 1); return; }   // half the time: a won challenge
      var e = startRankUp(); if (e) return; var n = 0; while (battle && !battle.over && n++ < BATTLE_FRAMES + 50) { if (Math.random() < 0.1) { var k = pick(Object.keys(battle.army)); deploy(k, CENTER - landRadius(battle.island.th) - 1, CENTER + Math.random() * 2 - 1); } battleStep(); } battle = null; hidePanels(); },
    prestige: function(){ if (Math.random() < 0.4) { S.prestige = Math.min(MAX_PRESTIGE, prest() + 1); return; }
      var e = Math.random() < 0.5 ? startPrestige() : (prest() ? startBattle(prestMap(rint(1, prest()))) : 'none'); if (e) return; var n = 0; while (battle && !battle.over && n++ < BATTLE_FRAMES + 50) { if (Math.random() < 0.1) { var k = pick(Object.keys(battle.army)); deploy(k, CENTER - landRadius(battle.island.th) - 1, CENTER + Math.random() * 2 - 1); } battleStep(); battle && battle.mobs.forEach(function(m){ if (!isFinite(m.hp) || !isFinite(m.x)) errors.push('mob NaN ' + m.kind); }); } battle = null; hidePanels(); renderPrestige(); },
    trade: function(){ if (Math.random() < 0.5) merchantTrade(pick(RES), pick(RES), rint(0, 3000)); else takeDeal(rint(0, 3)); renderTrade(); },
    pet: function(){ if (Math.random() < 0.7) buyPet(pick(Object.keys(MOB)), rint(1, 3)); else if ((S.pets || []).length) releasePet(rint(0, S.pets.length - 1)); },
    admin: function(){ S.admin = true; var acts = ['res', 'troops', 'golem', 'codes', 'apet', 'atower', 'astore', 'aabil', 'adeals', 'askip'];
      var a = pick(acts), arg = a === 'res' ? pick(['gold', 'wood', 'stone']) : a === 'troops' ? pick(Object.keys(T)) : a === 'golem' ? pick(Object.keys(GOLEM_COST)) : a === 'apet' ? pick(Object.keys(MOB)) : a === 'atower' ? pick(Object.keys(B)) : '';
      var r = panelAction(a, arg, false); if (typeof r !== 'string') errors.push('admin ' + a + ' returned ' + r); S.admin = false; },
    owner: function(){ if (!OWNERMODE) return; S.owner = true;
      var acts = ['res', 'troops', 'golem', 'codes', 'th', 'rank', 'raid', 'trophies', 'infinite', 'inftroops', 'infpets', 'allpets', 'allpetsinf', 'pets0', 'pnext', 'pmax', 'prestige', 'tower', 'gateplace', 'gatespeed', 'gateamount', 'maxstore', 'newdeals', 'allon', 'alloff', 'army0', 'golem0', 'noraids', 'maxkeep', 'maxbase'];
      var a = pick(acts), arg = a === 'res' ? pick(['gold', 'wood', 'stone']) : a === 'troops' ? pick(Object.keys(T)) : a === 'golem' ? pick(Object.keys(GOLEM_COST).concat(['all'])) : a === 'tower' ? pick(Object.keys(B).concat(['all'])) : String(rint(0, 12));
      var r = panelAction(a, arg, true); if (typeof r !== 'string') errors.push('owner ' + a + ' returned ' + r); },
    ownerfight: function(){ if (!OWNERMODE) return; S.owner = true; var acts = ['raidnow', 'revengenow', 'ptrial', 'pmap'];
      var r = panelAction(pick(acts), String(rint(1, 10)), true); if (typeof r !== 'string') errors.push('ownerfight returned ' + r);
      var n = 0; while (battle && !battle.over && n++ < BATTLE_FRAMES + 50) { if (Math.random() < 0.05) panelAction(pick(['gatenow', 'abil', 'win']), '', true); if (battle && Math.random() < 0.1 && !battle.opts.defense) deploy(pick(Object.keys(T)), 0, 0); if (battle && battle.opts.defense && Math.random() < 0.05) deployDefender(pick(Object.keys(T)), CENTER, CENTER); battleStep(); if (battle) (battle.mobs || []).concat(battle.homeMobs || [], battle.troops, battle.foes || []).forEach(function(m){ if (!isFinite(m.hp) || !isFinite(m.x) || !isFinite(m.y)) errors.push('NaN ' + m.kind); }); }
      battle = null; hidePanels(); },
    rebirth: function(){ if (Math.random() < 0.5) { S.buildings.find(function(b){ return b.type === 'townhall'; }).lvl = MAX_TH; S.rank = MAX_TH; } var r = doRebirth(); if (typeof r !== 'string') errors.push('rebirth returned ' + r); renderPrestige(); renderBoard(); },
    grow: function(){ if (Math.random() < 0.3) { var r = doReset(Math.random() < 0.5); if (typeof r !== 'string') errors.push('reset returned ' + r); } else growNode(pick(GROWTH).id); renderTree(); },
    reload: function(){ save(); load(); },
    ui: function(){ renderTop(); renderBuild(); renderArmy(); renderRaids(); renderInfo(); showInfo(pick(S.buildings)); hideInfo(); hidePanels(); frame(performance.now()); },
  };
  var names = Object.keys(actions), weights = { rich: 2, build: 4, upgrade: 4, train: 3, rankup: 2 };
  var bag = []; names.forEach(function(n){ for (var i = 0; i < (weights[n] || 1); i++) bag.push(n); });
  for (var i = 0; i < ${ROUNDS}; i++) {
    var name = pick(bag);
    var __t0 = Date.now(); try { actions[name](); seen['ms_' + name] = Math.max(seen['ms_' + name] || 0, Date.now() - __t0); } catch (e) { errors.push(name + ' threw: ' + e.message + ' @ ' + String(e.stack).split('\\n')[1]); battle = null; }
    seen[name] = (seen[name] || 0) + 1;
    inv(name);
    if (errors.length > 20) break;
  }
  return JSON.stringify({ errors: errors.slice(0, 20), seen: seen, th: th(), buildings: S.buildings.length, trophies: S.trophies, raid: S.raidLevel, golems: (S.golems || []).length });
})()`);
const r = JSON.parse(result);
console.log('  done:', JSON.stringify({ th: r.th, buildings: r.buildings, trophies: r.trophies, raid: r.raid, golems: r.golems }));
console.log('  actions:', JSON.stringify(r.seen));
check(r.errors.length === 0, `${ROUNDS} random actions, no bugs found`, r.errors.join(' | '));
console.log('\n' + (ok ? 'ISLAND FUZZ PASS' : 'ISLAND FUZZ FAIL'));
process.exit(ok ? 0 : 1);
