// game.js — IRONHOLD state machine, waves, economy, hero, decrees (Worker 2).
// Single source of truth: the `state` object created by createGame().
// Pure logic: no DOM, no audio, no rendering. Safe to import from node.
// NOTE for main.js (Worker 1): update() applies state.speed internally, so
// pass the RAW frame dt (clamped) — do not multiply by speed beforehand.
// Sound hooks are left to main.js (watch lives/score/alert changes); this
// module only sets state.alert / state.shake / state.floaters.
import {
  START_GOLD, START_LIVES, MAX_WAVES, TOWERS, HEROES, DECREES,
  WAVE_BONUS, WAVE_COUNT, SPAWN_INTERVAL, ENDLESS_SPAWN_INTERVAL,
  SELL_REFUND,
} from './config.js';
import { PLOTS, HERO_POST } from './world.js';
import {
  makeTower, makeEnemy, updateTowers, updateEnemies, updateProjectiles,
  updateHero, damageEnemy, burst,
} from './entities.js';

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

function loadBest() {
  const fallback = { wave: 0, score: 0 };
  try {
    if (typeof localStorage !== 'undefined') {
      const raw = localStorage.getItem('ironhold-best');
      if (raw) {
        const p = JSON.parse(raw);
        if (p && typeof p.wave === 'number' && typeof p.score === 'number') return p;
      }
    }
  } catch (err) { /* storage unavailable (node / private mode) — ignore */ }
  return fallback;
}

function saveBest(state) {
  const w = state.wave;
  const s = state.score;
  if (w > state.best.wave || (w === state.best.wave && s > state.best.score)) {
    state.best = { wave: w, score: s };
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem('ironhold-best', JSON.stringify(state.best));
      }
    } catch (err) { /* ignore */ }
  }
}

export function createGame() {
  return {
    phase: 'title', // title | hero | build | wave | decree | victory | gameover
    paused: false,
    speed: 1, // 1 | 2
    muted: false,
    quality: 'high', // high | low
    gold: START_GOLD,
    lives: START_LIVES,
    wave: 0,
    score: 0, // +10 per kill, +100 per wave cleared
    kills: 0,
    towers: [],
    enemies: [],
    projectiles: [],
    beams: [],
    particles: [],
    floaters: [],
    hero: null, // {id, name, level, heroKills, hp, maxHp, x, y, cd, skillCd, retreating, retreatT}
    decrees: [], // active decree ids (permanent for the run)
    decreeChoices: [], // 3 ids offered in the 'decree' phase
    spawnQueue: [],
    spawnT: 0,
    waveTotal: 0,
    waveSpawned: 0,
    selected: null, // {kind:'plot', id} | {kind:'tower', id}
    time: 0,
    shake: 0,
    best: loadBest(),
    tutorial: true, // hint bar during wave 1
    alert: null, // {text, level: 'info'|'warn'|'danger', t}
    endless: false, // true after choosing Continue Endless on the victory screen
  };
}

// ---------------------------------------------------------------------------
// Wave composition (deterministic per wave so the HUD preview matches the
// actual spawn queue exactly).
// ---------------------------------------------------------------------------

function rngFor(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function mix(n, wave, rand) {
  const pool = [['grunt', 5]];
  if (wave >= 3) pool.push(['runner', 3]);
  if (wave >= 5) pool.push(['armored', 2]);
  if (wave >= 7) pool.push(['healer', 1]);
  if (wave >= 8) pool.push(['splitter', 2]);
  const total = pool.reduce((s, p) => s + p[1], 0);
  const out = [];
  for (let i = 0; i < n; i++) {
    let r = rand() * total;
    for (const [type, w] of pool) {
      r -= w;
      if (r <= 0) {
        out.push(type);
        break;
      }
    }
    if (out.length === i) out.push('grunt'); // unreachable safety net
  }
  return out;
}

// Enemy type list for a wave, in spawn order. Boss waves: boss first + escorts.
export function waveComposition(wave) {
  const rand = rngFor((wave * 2654435761) >>> 0);
  if (wave === 10) return ['ogre', ...mix(8, wave, rand)];
  if (wave === 20) return ['warlord', ...mix(12, wave, rand)];
  return mix(WAVE_COUNT(wave), wave, rand);
}

// {type: count} preview of a wave, for the HUD next-wave panel.
export function previewWave(wave) {
  const counts = {};
  for (const t of waveComposition(wave)) counts[t] = (counts[t] || 0) + 1;
  return counts;
}

// ---------------------------------------------------------------------------
// Wave flow
// ---------------------------------------------------------------------------

export function startWave(state) {
  if (state.phase !== 'build') return false;
  state.wave += 1;
  state.spawnQueue = waveComposition(state.wave).map((t) => makeEnemy(t, state.wave));
  state.waveTotal = state.spawnQueue.length;
  state.waveSpawned = 0;
  state.spawnT = SPAWN_INTERVAL;
  state.phase = 'wave';
  state.selected = null;
  if (state.wave > 1) state.tutorial = false;
  state.alert = { text: 'Wave ' + state.wave + ' — the invasion comes!', level: 'info', t: 0 };
  return true;
}

function rollDecrees(state) {
  const owned = new Set(state.decrees);
  const avail = Object.keys(DECREES).filter((id) => !owned.has(id));
  const out = [];
  while (avail.length > 0 && out.length < 3) {
    out.push(avail.splice(Math.floor(Math.random() * avail.length), 1)[0]);
  }
  return out;
}

function waveClear(state) {
  const bonus = WAVE_BONUS(state.wave);
  state.gold += bonus;
  state.score += 100;
  state.projectiles = [];
  state.floaters.push({ x: 512, y: 300, text: 'Wave cleared! +' + bonus + 'g', color: '#ffd700', life: 1.5 });
  saveBest(state);
  if (state.wave === MAX_WAVES && !state.endless) {
    state.phase = 'victory';
    return;
  }
  const choices = rollDecrees(state);
  if (choices.length === 0) {
    // Pool exhausted (all 8 decrees owned) — straight back to building.
    state.phase = 'build';
    return;
  }
  state.decreeChoices = choices;
  state.phase = 'decree';
}

function gameOver(state) {
  state.lives = Math.max(0, state.lives);
  state.enemies = [];
  state.projectiles = [];
  state.phase = 'gameover';
  saveBest(state);
}

// ---------------------------------------------------------------------------
// Per-frame update (applies state.speed internally; pass raw dt)
// ---------------------------------------------------------------------------

export function update(state, dt) {
  if (state.paused) return;
  const sdt = dt * state.speed;
  state.time += sdt;

  // Decay transient FX.
  for (const b of state.beams) b.life -= sdt;
  state.beams = state.beams.filter((b) => b.life > 0);
  for (const p of state.particles) {
    p.life -= sdt;
    p.x += p.vx * sdt;
    p.y += p.vy * sdt;
  }
  state.particles = state.particles.filter((p) => p.life > 0);
  for (const f of state.floaters) {
    f.life -= sdt;
    f.y -= 20 * sdt;
  }
  state.floaters = state.floaters.filter((f) => f.life > 0);
  if (state.shake > 0) state.shake = Math.max(0, state.shake - 30 * sdt);
  if (state.alert) {
    state.alert.t += sdt;
    if (state.alert.t > 3) state.alert = null;
  }

  if (state.phase !== 'wave') return;

  // Spawn queue.
  if (state.spawnQueue.length > 0) {
    state.spawnT -= sdt;
    if (state.spawnT <= 0) {
      const e = state.spawnQueue.shift();
      if (e) {
        state.enemies.push(e);
        state.waveSpawned += 1;
      }
      state.spawnT = state.endless ? ENDLESS_SPAWN_INTERVAL : SPAWN_INTERVAL;
    }
  }

  updateTowers(state, sdt);
  updateEnemies(state, sdt);
  updateProjectiles(state, sdt);
  updateHero(state, sdt);
  state.enemies = state.enemies.filter((e) => !e.dead);

  if (state.lives <= 0) {
    gameOver(state);
    return;
  }
  if (state.spawnQueue.length === 0 && state.enemies.length === 0) {
    waveClear(state);
  }
}

// ---------------------------------------------------------------------------
// Economy: build / upgrade / sell
// ---------------------------------------------------------------------------

export function towerCost(type, decrees = []) {
  const base = TOWERS[type].cost;
  return Math.round(base * (decrees.includes('build20') ? 0.8 : 1));
}

export function upgradeCost(tower) {
  // upgrade cost = round(base * 0.75 * current level)
  return Math.round(TOWERS[tower.type].cost * 0.75 * tower.level);
}

export function buildTower(state, plotId, type) {
  // Building is allowed in the build phase and mid-wave.
  if (state.phase !== 'build' && state.phase !== 'wave') return false;
  const plot = PLOTS.find((p) => p.id === plotId);
  if (!plot || !TOWERS[type]) return false;
  if (state.towers.some((t) => t.plotId === plotId)) return false;
  const cost = towerCost(type, state.decrees);
  if (state.gold < cost) return false;
  state.gold -= cost;
  const t = makeTower(type, plot);
  if (!t) return false;
  t.invested = cost; // actually paid (after build20 discount)
  state.towers.push(t);
  state.selected = { kind: 'tower', id: t.id };
  return true;
}

export function upgradeTower(state, id) {
  const t = state.towers.find((tw) => tw.id === id);
  if (!t || t.level >= 3) return false;
  const cost = upgradeCost(t);
  if (state.gold < cost) return false;
  state.gold -= cost;
  t.level += 1;
  t.invested += cost;
  return true;
}

export function sellTower(state, id) {
  const i = state.towers.findIndex((tw) => tw.id === id);
  if (i < 0) return false;
  const t = state.towers[i];
  state.gold += Math.round(t.invested * SELL_REFUND); // 70% of total invested
  state.towers.splice(i, 1);
  if (state.selected && state.selected.kind === 'tower' && state.selected.id === id) {
    state.selected = null;
  }
  return true;
}

// ---------------------------------------------------------------------------
// Hero
// ---------------------------------------------------------------------------

export function chooseHero(state, id) {
  if (state.phase !== 'hero') return false;
  const cfg = HEROES[id];
  if (!cfg) return false;
  state.hero = {
    id,
    name: cfg.name,
    level: 1,
    heroKills: 0,
    hp: cfg.hp,
    maxHp: cfg.hp,
    x: HERO_POST.x,
    y: HERO_POST.y,
    cd: 0,
    skillCd: 0,
    retreating: false,
    retreatT: 0,
  };
  state.phase = 'build';
  return true;
}

export function useHeroSkill(state) {
  const h = state.hero;
  if (!h || h.retreating || h.skillCd > 0) return false;
  const alive = state.enemies.filter((e) => !e.dead);
  if (alive.length === 0) return false; // nothing to hit: don't burn the cooldown
  const cfg = HEROES[h.id];
  const cdMul = state.decrees.includes('heroCd20') ? 0.8 : 1;
  h.skillCd = cfg.skill.cd * cdMul;
  const dmgMul = 1 + 0.15 * (h.level - 1);

  if (h.id === 'aldric') {
    // Whirlwind: AoE damage around Aldric.
    const r = cfg.skill.aoeR;
    const dmg = cfg.skill.aoeDmg * dmgMul;
    burst(state, h.x, h.y, '#4a7fb5', 20);
    state.beams.push({ x1: h.x - r, y1: h.y, x2: h.x + r, y2: h.y, life: 0.25 });
    for (const e of [...state.enemies]) {
      if (e.dead) continue;
      if (Math.hypot(e.x - h.x, e.y - h.y) <= r + e.r) damageEnemy(state, e, dmg, true);
    }
  } else {
    // Lyra — Arrow Volley: 8 arrows onto the densest cluster.
    let center = null;
    let bestCount = -1;
    for (const e of alive) {
      let c = 0;
      for (const o of alive) {
        if (Math.hypot(o.x - e.x, o.y - e.y) <= 70) c++;
      }
      if (c > bestCount) {
        bestCount = c;
        center = e;
      }
    }
    const inCluster = alive
      .filter((e) => Math.hypot(e.x - center.x, e.y - center.y) <= 70)
      .sort((a, b) => Math.hypot(a.x - center.x, a.y - center.y) - Math.hypot(b.x - center.x, b.y - center.y))
      .slice(0, cfg.skill.arrows);
    for (const e of inCluster) {
      state.beams.push({ x1: e.x, y1: e.y - 160, x2: e.x, y2: e.y, life: 0.2 });
      burst(state, e.x, e.y, '#7fb069', 4);
      damageEnemy(state, e, cfg.skill.arrowDmg * dmgMul, true);
    }
  }
  return true;
}

// ---------------------------------------------------------------------------
// Decrees
// ---------------------------------------------------------------------------

export function chooseDecree(state, id) {
  if (state.phase !== 'decree') return false;
  if (!state.decreeChoices.includes(id)) return false;
  state.decrees.push(id);
  state.decreeChoices = [];
  // Immediate-effect decrees apply now; the rest are read dynamically
  // (dmg15/range10/slow10 in entities, bounty10 in killEnemy, build20 in
  // towerCost, heroCd20 in useHeroSkill) and persist for the run.
  if (id === 'gold100') state.gold += 100;
  if (id === 'lives2') state.lives += 2;
  state.phase = 'build';
  return true;
}

// ---------------------------------------------------------------------------
// Victory / endless
// ---------------------------------------------------------------------------

export function continueEndless(state) {
  if (state.phase !== 'victory') return false;
  state.endless = true;
  state.phase = 'build';
  state.alert = { text: 'Endless mode — the invasion never ends!', level: 'warn', t: 0 };
  return true;
}

// ---------------------------------------------------------------------------
// Toggles / restart
// ---------------------------------------------------------------------------

export function togglePause(state) {
  state.paused = !state.paused;
  return state.paused;
}

export function toggleSpeed(state) {
  state.speed = state.speed === 1 ? 2 : 1;
  return state.speed;
}

export function toggleMute(state) {
  state.muted = !state.muted;
  return state.muted;
}

export function toggleQuality(state) {
  state.quality = state.quality === 'high' ? 'low' : 'high';
  return state.quality;
}

export function restart(state) {
  const muted = state.muted;
  const quality = state.quality;
  const fresh = createGame();
  for (const k of Object.keys(fresh)) state[k] = fresh[k];
  state.muted = muted; // keep the player's mute/quality preference
  state.quality = quality;
  return state;
}
