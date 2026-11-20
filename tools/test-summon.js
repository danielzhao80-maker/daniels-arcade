// 🐾 Summon Battlers: eggs, levels, deck, battles (pets, powers, bosses, AI), stars, rewards, codes, drawing.
// Run: node tools/test-summon.js
const fs = require('fs'), vm = require('vm');
const html = fs.readFileSync(require('path').join(__dirname, '..', 'summon', 'index.html'), 'utf8');
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
    addEventListener: (t, f) => { (el.__on = el.__on || {})[t] = f; }, removeEventListener: () => {},   // (kept, so tests can really tap the game)
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
const reset = (extra) => q(`localStorage.removeItem(SAVE_KEY); S = freshSave(); Object.assign(S, ${JSON.stringify(extra || {})}); save(); battle = null;`);
const run = (n, max) => q(`(function(){ var i = 0; while (battle && !battle.over && i++ < ${max || 20000}) step(); return battle.over; })()`);

// ---- start ----
reset();
check(q('Object.keys(PETS).length') === 524 && q('Object.keys(S.pets).length') === 4 && q('S.deck.length') === 4 && q('S.coins') === 250, 'a new player: 524 pets to find (24 + 500 new), 4 to start with, 🪙 250');
check(q('ANIMALS.length') === 50 && q('Object.keys(ELEMENTS).length') === 10 && q("PETS['fire-cat'].name") === 'Fire Cat' && q("PETS['light-tiger'].rarity") === 'mythic' && q("PETS['fire-cat'].rarity") === 'common', '50 animals × 10 elements ("Fire Cat"); a ✨ Light Tiger is Mythic, a Fire Cat Common');
const rc = JSON.parse(q(`JSON.stringify(RAR_ORDER.map(function(r){ return Object.values(PETS).filter(function(p){ return p.rarity === r; }).length; }))`));
check(rc[0] > rc[1] && rc[1] > rc[2] && rc[2] > rc[3] && rc[3] > rc[4] && rc[4] >= 10, 'the rarer, the fewer: ' + rc.join(' / '));
check(q(`Object.values(PETS).every(function(p){ return p.element && p.role && p.hp > 0 && p.dmg > 0 && p.cost >= 2 && p.cost <= 10; })`), 'every pet has an element, a role and sensible stats');
check(q(`PETS['light-tiger'].hp`) > q(`PETS['fire-cat'].hp`) * 2, 'rarer pets are stronger');
check(['common', 'rare', 'epic', 'legendary', 'mythic'].every((r) => q(`Object.values(PETS).filter(function(p){ return p.rarity === '${r}'; }).length`) > 0), 'pets of every rarity (Common → Mythic)');
check(q('STAGES') === 30 && q('stageInfo(6).boss') === true && q('stageInfo(7).boss') === false && q('stageInfo(30).bossId') === 'voidlord' && q('stageInfo(13).worldDef.name') === 'Ice', '30 stages in 5 worlds, a boss every 6th');
check(q('stageInfo(20).enemyLvl') > q('stageInfo(2).enemyLvl') && q('stageInfo(20).baseHp') > q('stageInfo(2).baseHp'), 'later stages are harder');
check(/locked/.test(q('startStage(2)')), 'stage 2 is locked until you beat stage 1');

// ---- eggs ----
reset({ coins: 100 });
const h1 = JSON.parse(q(`JSON.stringify(hatch('basic', false, 0.99, 0))`));   // r1 0.99 → the last bucket (mythic-ish)
check(!h1.error && q('S.coins') === 0 && q('S.hatched') === 1, '🥚 hatch an egg for 🪙 100');
check(/You need/.test(q(`hatch('basic').error`)), 'not enough coins: no egg');
check(q(`rollRarity(EGGS.basic.odds, 0)`) === 'common' && q(`rollRarity(EGGS.basic.odds, 0.999)`) === 'mythic' && q(`rollRarity(EGGS.golden.odds, 0)`) === 'rare', 'rarity odds (an egg can even be Mythic; golden eggs are never Common)');
reset({ coins: 1000 });
const dup = JSON.parse(q(`JSON.stringify(hatch('basic', false, 0.01, 0))`));   // a common — mouse is pool[0]
check(dup.id === 'mouse' && dup.fresh === false && dup.shards === 10 && q('S.pets.mouse.shards') === 10, 'a pet you already have → 10 shards instead');
q(`hatch('basic', false, 0.7, 0)`);   // a rare
check(Object.keys(JSON.parse(q('JSON.stringify(S.pets)'))).length === 5 && q('S.deck.length') === 5, 'a NEW pet joins your pets (and your deck, if there\'s room)');
// level up
check(q(`levelUp('mouse')`) === null && q('S.pets.mouse.lvl') === 2 && q('S.pets.mouse.shards') === 0 && q('S.coins') === 1000 - 200 - 60, '⬆️ level up with shards + coins');
check(/shards/.test(q(`levelUp('mouse')`)), '…not without enough shards');
check(q('Math.round(lvlMul(2) * 100)') === 115, '+15% stats a level');
// deck
check(q(`toggleDeck('mouse')`) === null && !q(`S.deck.includes('mouse')`) && q(`toggleDeck('mouse')`) === null && q(`S.deck.includes('mouse')`), 'take a pet out of the deck and put it back');
check(/don't have/.test(q(`toggleDeck('kraken')`)), "can't use a pet you don't have");
q(`S.deck = ['mouse']; save();`);
check(/at least 1/.test(q(`toggleDeck('mouse')`)), 'the deck keeps at least 1 pet');
q(`S.pets = {}; Object.keys(PETS).forEach(function(k){ S.pets[k] = { lvl: 1, shards: 0 }; }); S.deck = ['mouse','bunny','bee','frog','snail','bird'];`);
check(/full/.test(q(`toggleDeck('kraken')`)), 'a deck holds 6');

// ---- a battle ----
reset();
check(q('startStage(1, function(){ return 0.5; })') === null && q('battle.st.n') === 1 && q('battle.energy[0]') === 5, '⚔️ start stage 1 (⚡ 5 to begin)');
check(q(`summon(0, 'mouse')`) === true && q('battle.energy[0]') === 3 && q('battle.units.length') === 1, 'summon a pet: it costs ⚡ (Mouse 2)');
check(q(`summon(0, 'kraken')`) === false, "can't summon a pet that isn't in your deck");
q(`battle.energy[0] = 1;`);
check(q(`summon(0, 'frog')`) === false, 'not enough ⚡: no summon');
q(`for (var i = 0; i < ENERGY_EVERY * 3; i++) step();`);
check(q('battle.energy[0]') >= 3, '⚡ fills up over time');
check(q(`battle.units.some(function(u){ return u.side === 1; })`), '🤖 the enemy summons pets too');
const x0 = q('battle.units[0].x'); q('for (var i = 0; i < 30; i++) step();');
check(q('(function(){ var u = battle.units.find(function(v){ return v.side === 0; }); return !u || u.x > ' + x0 + '; })()'), 'your pets walk towards the enemy');
// a fight: fox vs mouse
reset(); q(`startStage(1, function(){ return 0.5; }); battle.aiWait = 1e9; battle.units = [makeUnit(0, 'fox', 1, 500, 1), makeUnit(1, 'mouse', 1, 520, 1)];`);
q(`for (var i = 0; i < 300; i++) step();`);
check(q(`battle.units.filter(function(u){ return u.side === 1; }).length`) === 0 && q(`battle.units.some(function(u){ return u.side === 0 && u.id === 'fox'; })`), 'pets fight: the Fox beats a Mouse');
// win by breaking the base
reset(); q(`startStage(1, function(){ return 0.5; }); battle.aiWait = 1e9; battle.base[1] = 30; battle.units = [makeUnit(0, 'frog', 3, BASE_X[1] - 60, 1)];`);
run(); check(q('battle.over') && /VICTORY/.test(q(`document.getElementById('resTitle').textContent`)), '🏯 break the enemy base: VICTORY');
check(q('S.stage') === 2 && q('S.stars[1]') === 3 && q('S.coins') > 250, 'stage 2 unlocked, ⭐⭐⭐ (your base untouched), coins');
// lose
reset({ stage: 1 }); q(`startStage(1, function(){ return 0.5; }); battle.aiWait = 1e9; battle.base[0] = 20; battle.units = [makeUnit(1, 'frog', 3, BASE_X[0] + 60, 1)];`);
run(); check(/Defeat/.test(q(`document.getElementById('resTitle').textContent`)) && q('S.stage') === 1, '🏰 your base falls: Defeat (stage stays locked)');
// stars
reset(); q(`startStage(1, function(){ return 0.5; }); battle.base[0] = battle.baseMax[0] * 0.6;`);
check(q('starsFor(battle)') === 2, '⭐⭐ with 60% of your base left'); q('battle.base[0] = battle.baseMax[0] * 0.3;'); check(q('starsFor(battle)') === 1, '⭐ with 30%');
q('battle = null;');

// ---- powers ----
const duel = (a, b, steps, opts) => { reset(); q(`startStage(1, function(){ return 0.5; }); battle.aiWait = 1e9; battle.units = [makeUnit(0, '${a}', 1, 450, 1), makeUnit(1, '${b}', 1, ${opts && opts.bx || 470}, 1)]; for (var i = 0; i < ${steps}; i++) step();`); };
reset(); q(`startStage(1, function(){ return 0.5; }); battle.aiWait = 1e9; var mo = makeUnit(0, 'mouse', 1, 450, 1), be = makeUnit(1, 'bee', 1, 470, 1), fr = makeUnit(1, 'frog', 1, 470, 1); battle.units = [mo, be]; mo.cd = 1; step(); window.__fly = be.maxHp - be.hp; battle.units = [mo, fr]; mo.cd = 1; step(); window.__gnd = fr.maxHp - fr.hp;`);
check(q('__fly') > 0 && Math.abs(q('__fly') * 2 - q('__gnd')) < 1e-6, '🕊️ ground pets only do HALF damage to flyers (Mouse vs Bee)', q('__fly') + ' vs ' + q('__gnd'));
reset(); q(`startStage(1, function(){ return 0.5; }); battle.aiWait = 1e9; var bi = makeUnit(0, 'bird', 1, 450, 1), be2 = makeUnit(1, 'bee', 1, 470, 1); battle.units = [bi, be2]; bi.cd = 1; step(); window.__sh = be2.maxHp - be2.hp;`);
check(Math.abs(q('__sh') - q(`def('bird').dmg`)) < 1e-6, '…shooters do full damage to them (Songbird vs Bee)');
duel('snake', 'snail', 80);
check(q(`battle.units.find(function(u){ return u.id === 'snail'; }).poison`) > 0, '🐍 poison');
duel('penguin', 'frog', 80, { bx: 560 });
check(q(`battle.units.find(function(u){ return u.id === 'frog'; }).frozen`) > 0 || q(`battle.units.find(function(u){ return u.id === 'frog'; }).hp`) < q(`def('frog').hp`), '🐧 snowballs freeze');
reset(); q(`startStage(1, function(){ return 0.5; }); battle.aiWait = 1e9; battle.units = [makeUnit(0, 'wolf', 1, 300, 1)]; for (var i = 0; i < 361; i++) step();`);
check(q(`battle.units.some(function(u){ return u.id === 'pup'; })`), '🐺 the Wolf calls a 🐶 pup');
reset(); q(`startStage(1, function(){ return 0.5; }); battle.aiWait = 1e9; var ph = makeUnit(0, 'phoenix', 1, 300, 1); battle.units = [ph]; hurt(battle, ph, 99999);`);
check(q('battle.units[0].hp') === q('battle.units[0].maxHp') && q('battle.units[0].revived') === true, '🐦‍🔥 the Phoenix comes back to life once');
q(`hurt(battle, battle.units[0], 99999); step();`);
check(q('battle.units.length') === 0, '…only once');
reset(); q(`startStage(1, function(){ return 0.5; }); battle.aiWait = 1e9; var pf = makeUnit(0, 'puffer', 1, 400, 1), e1 = makeUnit(1, 'mouse', 1, 430, 1); battle.units = [pf, e1]; hurt(battle, pf, 99999); step();`);
check(q(`battle.units.every(function(u){ return u.id !== 'mouse'; })`), '🐡 the Pufferfish explodes when it is beaten');
reset(); q(`startStage(1, function(){ return 0.5; }); battle.aiWait = 1e9; var tu = makeUnit(0, 'turtle', 1, 400, 1); battle.units = [tu]; hurt(battle, tu, 100);`);
check(Math.round(q('battle.units[0].maxHp - battle.units[0].hp')) === 50, '🐢 the shell blocks half the damage');
reset(); q(`startStage(1, function(){ return 0.5; }); battle.aiWait = 1e9; var un = makeUnit(0, 'unicorn', 1, 400, 1), fr = makeUnit(0, 'frog', 1, 420, 1), en = makeUnit(1, 'snail', 1, 425, 1); fr.hp = 10; battle.units = [un, fr, en]; for (var i = 0; i < 60; i++) step();`);
check(q(`battle.units.find(function(u){ return u.id === 'frog'; }).hp`) > 10, '🦄 the Unicorn heals its friends');
reset(); q(`startStage(1, function(){ return 0.5; }); battle.aiWait = 1e9; battle.units = [makeUnit(0, 'lion', 1, 400, 1), makeUnit(0, 'frog', 1, 420, 1)];`);
check(Math.abs(q(`auraBoost(battle, battle.units[1])`) - 1.25) < 1e-9, '🦁 the Lion King: +25% damage to pets near him');
q('battle = null;');

// ---- 🏰 bases fight back ----
reset(); q(`startStage(1, function(){ return 0.5; }); battle.aiWait = 1e9; battle.units = [makeUnit(1, 'snail', 1, BASE_X[0] + 120, 1)]; battle.units[0].frozen = 1e9; for (var i = 0; i < 45; i++) step();`);
check(q('battle.units[0].hp') < q('battle.units[0].maxHp'), '🏰 your base shoots enemies that come close');
reset(); q(`startStage(1, function(){ return 0.5; }); battle.aiWait = 1e9; battle.units = [makeUnit(1, 'snail', 1, 500, 1)]; battle.units[0].frozen = 1e9; for (var i = 0; i < 45; i++) step();`);
check(q('battle.units[0].hp') === q('battle.units[0].maxHp'), '…but not ones far away');
q('battle = null;');

// ---- 🔓 abilities unlock with levels ----
check(JSON.stringify(JSON.parse(q(`JSON.stringify(abilitiesOf('fire-cat'))`))) === JSON.stringify([[3, 'burn'], [6, 'crit'], [10, 'giant']]), 'a Fire Cat: 🔥 Burn at Lv 3, 🗡️ Critical Hits at Lv 6, 🌟 Giant Form at Lv 10');
check(q(`abilitiesAt('fire-cat', 2).length`) === 0 && q(`abilitiesAt('fire-cat', 6).length`) === 2 && q(`abilitiesAt('light-tiger', 10).includes('titan')`), '…they unlock as it levels up (Mythic ultimate: 👑 Titan)');
check(q(`abilitiesOf('dragon').length`) === 3 && q(`abilitiesOf('dragon')[0][1]`) === 'burn', 'the original pets get abilities too (🐉 Dragon: Burn)');
reset(); q(`startStage(1, function(){ return 0.5; }); battle.aiWait = 1e9;`);
const ab = (id, lvl, foe, steps, setup) => q(`(function(){ var u = makeUnit(0, '${id}', ${lvl}, 450, 1), e = makeUnit(1, '${foe || 'frog'}', 1, 470, 1); e.frozen = 0; ${setup || ''}; battle.units = [u, e]; u.cd = 1; for (var i = 0; i < ${steps || 1}; i++) step(); return JSON.stringify({ u: { hp: u.hp, max: u.maxHp, dmg: u.dmg }, e: { hp: e.hp, max: e.maxHp, burn: e.burn, poison: e.poison, frozen: e.frozen } }); })()`);
let r = JSON.parse(ab('fire-cat', 3)); check(r.e.burn > 0, '🔥 Burn sets enemies on fire');
r = JSON.parse(ab('ice-cat', 3)); check(r.e.frozen > 0, '❄️ Frostbite freezes them');
r = JSON.parse(ab('toxic-cat', 3)); check(r.e.poison > 0, '☠️ Venom poisons them');
r = JSON.parse(ab('fire-cat', 1)); check(!(r.e.burn > 0), '…not before Lv 3');
const giant = JSON.parse(ab('fire-cat', 10)), noGiant = JSON.parse(ab('fire-cat', 9));
check(Math.abs(giant.u.max / noGiant.u.max - 1.4 * (1 + 0.15 * 9) / (1 + 0.15 * 8)) < 1e-9, '🌟 Giant Form: +40% health at Lv 10');
q(`var a1 = makeUnit(0, 'earth-cow', 3, 450, 1); battle.units = [a1]; hurt(battle, a1, 100);`);
check(Math.round(q('battle.units[0].maxHp - battle.units[0].hp')) === Math.round(100 * 0.7 * 0.75), '🪨 Stone Skin: 25% less damage (on top of a tank\'s shell)');
q(`var rv = makeUnit(0, 'fire-dolphin', 10, 450, 1); battle.units = [rv]; hurt(battle, rv, 1e9);`);
check(q('battle.units[0].hp') === q('battle.units[0].maxHp') * 0.5, '♻️ Second Life: comes back once with half health');
q(`var ch = makeUnit(0, 'storm-cat', 3, 450, 1), e1 = makeUnit(1, 'frog', 1, 470, 1), e2 = makeUnit(1, 'frog', 1, 520, 1); battle.units = [ch, e1, e2]; ch.cd = 1; step();`);
check(q('battle.units[2].hp') < q('battle.units[2].maxHp'), '⚡ Chain Lightning jumps to a 2nd enemy');
q(`var th = makeUnit(0, 'storm-tiger', 10, 300, 1), far = makeUnit(1, 'snail', 1, 800, 1); far.frozen = 1e9; battle.units = [th, far]; for (var i = 0; i < 301; i++) step();`);
check(q('battle.units.find(function(u){ return u.side === 1; }).hp') < q('battle.units.find(function(u){ return u.side === 1; }).maxHp'), '🌩️ Thunder Call strikes the strongest enemy from far away');
q(`var hs = makeUnit(0, 'wind-cat', 3, 300, 1); battle.units = [hs]; var x0 = hs.x; step(); window.__hs = hs.x - x0; var no = makeUnit(0, 'wind-cat', 1, 300, 1); battle.units = [no]; x0 = no.x; step(); window.__nh = no.x - x0;`);
check(Math.abs(q('__hs') / q('__nh') - 1.3) < 1e-6, '🌪️ Haste: 30% faster');
q('battle = null;');
// enemy worlds use the new pets too
check(q(`WORLDS.every(function(w){ return w.pool.some(function(id){ return PETS[id].gen; }); })`), 'every world also sends new elemental pets');
// collection filters
reset(); q(`S.pets['fire-cat'] = { lvl: 1, shards: 0 }; petFilter.rarity = 'common'; petFilter.element = 'fire'; petFilter.owned = false; petFilter.text = ''; window.__f1 = filteredPets().length; petFilter.owned = true; window.__f2 = filteredPets(); petFilter.rarity = ''; petFilter.element = ''; petFilter.owned = false; petFilter.text = 'fire c'; window.__f3 = filteredPets(); petFilter.text = '';`);
check(q('__f1') > 5 && JSON.stringify(q('__f2')) === JSON.stringify(['fox', 'fire-cat']) === false && q('__f2').includes('fire-cat') && q('__f3').length === 1, '🔎 filter by rarity, element, mine only, and search');
q(`renderPets(); showPet('fire-cat');`);
check(/Lv 3: 🔥 Burn/.test(q(`document.getElementById('petInfo').innerHTML`)) && /🔒/.test(q(`document.getElementById('petInfo').innerHTML`)), 'a pet shows its abilities (🔒 until unlocked)');

// ---- bosses ----
reset({ stage: 6 }); q(`startStage(6, function(){ return 0.5; }); battle.aiWait = 1e9; for (var i = 0; i < 100; i++) step();`);
check(q(`battle.units.some(function(u){ return u.id === 'ogre' && u.side === 1; })`) && q('battle.st.boss'), '👹 a boss stage: the Meadow Ogre comes out');
q(`battle.base[1] = 0; step();`);
check(q('S.freeEggs.golden') === 1 && /Meadow Ogre/.test(q(`document.getElementById('resText').textContent`)), 'beat a boss stage the first time: a free 🌟 Golden Egg');
q('battle = null;');

// ---- a whole battle with the AI on both sides ----
reset({ stage: 12 }); q(`S.pets = {}; Object.keys(PETS).forEach(function(k){ S.pets[k] = { lvl: 5, shards: 0 }; }); S.deck = ['dragon','trex','unicorn','wolf','octopus','phoenix']; startStage(12);`);
q(`var i = 0; while (battle && !battle.over && i++ < BATTLE_TIME + 10) { if (i % 40 === 0) { var c = S.deck.filter(function(id){ return PETS[id].cost <= battle.energy[0]; }); if (c.length) summon(0, c[i % c.length]); } step(); battle && battle.units.forEach(function(u){ if (!isFinite(u.hp) || !isFinite(u.x)) throw new Error('NaN ' + u.id); }); }`);
check(q('battle.over') && q('battle.units.length') < 200, 'a full stage-12 boss battle plays out (no NaN, ends)', q(`document.getElementById('resTitle').textContent`));
q('battle = null;');

// ---- codes + free eggs ----
reset();
check(/\+300/.test(q(`redeemCode('summon')`)) && q('S.coins') === 550 && /already/.test(q(`redeemCode('SUMMON')`)), '🎁 codes (once each)');
check(/free/.test(q(`redeemCode('EGGHUNT')`)) && q('S.freeEggs.basic') === 1 && !q(`hatch('basic', true).error`) && q('S.coins') === 550, '…a free egg (hatching it costs nothing)');
check(/❌/.test(q(`redeemCode('NOPE')`)), 'a wrong code');

// ---- arcade titles ----
q(`window.__titles = []; window.ArcadeShop = Object.assign(window.ArcadeShop || {}, { earnTitle: function(id){ __titles.push(id); return true; } });`);
reset({ coins: 1e6, hatched: 9 }); q(`hatch('basic', false, 0.5, 0);`);
check(q(`__titles.includes('sb-summoner')`), '🐣 10 eggs hatched → the Summoner arcade title');
q(`hatch('basic', false, 0.999, 0);`);
check(q(`__titles.includes('sb-mythic')`), '🤫 hatch a Mythic → the secret Mythic Finder title');

// ---- screens + drawing ----
reset();
q(`renderMenu(); renderMap(); renderPets(); renderEggs(); showPet('mouse'); startStage(1); for (var i = 0; i < 200; i++) step(); renderHud(); draw();`);
check(/Stage 1/.test(q(`document.getElementById('hudStage').textContent`)) && /data-stage="1"/.test(q(`document.getElementById('worlds').innerHTML`)), 'the menu, map, pets, eggs and battle screens all draw');
check(q('nullpState().pets') === 4, 'Nullp can read the game');

console.log(ok ? '\nSUMMON PASS' : '\nSUMMON FAIL');
process.exit(ok ? 0 : 1);
