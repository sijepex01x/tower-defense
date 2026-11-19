// entities.js — IRONHOLD towers / enemies / projectiles / hero logic (Worker 2).
// Factories + per-frame helpers. Pure logic: no DOM, no audio, no rendering.
// Imports only config.js (numbers) and world.js (PATH/KEEP/HERO_POST).
import { TOWERS, ENEMIES, HP_SCALE, UPGRADE_MULT, HEROES } from './config.js';
import { PATH, HERO_POST } from './world.js';

let nextId = 1;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// Effective tower stats at a level, with active decree modifiers applied.
// dmg x1.6/level, range +10%/level, rate +10%/level (contract UPGRADE_MULT).
export function towerStats(type, level = 1, decrees = []) {
  const b = TOWERS[type];
  if (!b) return null;
  const dmgMul = Math.pow(UPGRADE_MULT, level - 1) * (decrees.includes('dmg15') ? 1.15 : 1);
  const rangeMul = Math.pow(1.1, level - 1) * (decrees.includes('range10') ? 1.1 : 1);
  const rateMul = Math.pow(1.1, level - 1);
  return {
    dmg: b.dmg * dmgMul,
    range: b.range * rangeMul,
    rate: b.rate * rateMul,
    splash: b.splash || 0,
    slow: b.slow ? b.slow * (decrees.includes('slow10') ? 1.1 : 1) : 0,
    slowDur: b.slowDur || 0,
    chain: b.chain || 0,
  };
}

// Small particle burst (render draws state.particles generically).
export function burst(state, x, y, color, n = 8) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2;
    const sp = 20 + Math.random() * 70;
    state.particles.push({
      x, y,
      vx: Math.cos(a) * sp,
      vy: Math.sin(a) * sp,
      life: 0.3 + Math.random() * 0.3,
      color,
      r: 2 + Math.random() * 3,
    });
  }
}

// Furthest-along-the-path living enemy within `range` of (x, y).
function acquireTarget(state, x, y, range) {
  let best = null;
  let bestDist = -1;
  for (const e of state.enemies) {
    if (e.dead) continue;
    const d = Math.hypot(e.x - x, e.y - y);
    if (d <= range + e.r && e.dist > bestDist) {
      best = e;
      bestDist = e.dist;
    }
  }
  return best;
}

// Nearest living enemy within `range` of (x, y), excluding ids in `skip`.
function nearestEnemy(state, x, y, range, skip) {
  let best = null;
  let bestD = Infinity;
  for (const e of state.enemies) {
    if (e.dead || (skip && skip.has(e.id))) continue;
    const d = Math.hypot(e.x - x, e.y - y);
    if (d <= range && d < bestD) {
      best = e;
      bestD = d;
    }
  }
  return best;
}

// ---------------------------------------------------------------------------
// Factories
// ---------------------------------------------------------------------------

export function makeTower(type, plot) {
  const b = TOWERS[type];
  if (!b || !plot) return null;
  return {
    id: nextId++,
    type,
    level: 1,
    plotId: plot.id,
    x: plot.x,
    y: plot.y,
    cd: 0,
    invested: b.cost, // game.js overwrites with the actually-paid (discounted) cost
  };
}

export function makeEnemy(type, wave) {
  const b = ENEMIES[type];
  if (!b) return null;
  const hp = Math.round(b.hp * HP_SCALE(wave));
  // Endless scaling: speed +2% per wave past 20 (HP keeps growing via HP_SCALE).
  const endless = Math.max(0, wave - 20);
  return {
    id: nextId++,
    type,
    x: PATH[0].x,
    y: PATH[0].y,
    hp,
    maxHp: hp,
    speed: b.speed * (1 + 0.02 * endless),
    slowUntil: 0, // state.time before which the enemy is slowed
    slowFactor: 0, // fraction of speed removed while slowed
    wp: 0, // index of the next PATH waypoint
    dist: 0, // total px travelled along the path (targeting priority)
    bounty: b.bounty,
    r: b.r,
    boss: !!b.boss,
    leak: b.leak || 1,
    heal: b.heal || 0,
    dead: false,
  };
}

// ---------------------------------------------------------------------------
// Damage / death
// ---------------------------------------------------------------------------

export function damageEnemy(state, e, dmg, byHero = false) {
  if (!e || e.dead) return;
  e.hp -= dmg;
  if (e.hp <= 0) killEnemy(state, e, byHero);
}

export function killEnemy(state, e, byHero = false) {
  if (!e || e.dead) return;
  e.dead = true;
  e.hp = 0;
  const bounty = Math.round(e.bounty * (state.decrees.includes('bounty10') ? 1.1 : 1));
  state.gold += bounty;
  state.kills += 1;
  state.score += 10; // score = kills (+10 each) + waves cleared (+100 each, in game.js)
  state.floaters.push({ x: e.x, y: e.y - e.r - 6, text: '+' + bounty + 'g', color: '#ffd700', life: 1 });

  if (byHero && state.hero) {
    state.hero.heroKills += 1;
    const nl = Math.min(5, 1 + Math.floor(state.hero.heroKills / 10));
    if (nl > state.hero.level) {
      state.hero.level = nl;
      state.floaters.push({ x: state.hero.x, y: state.hero.y - 24, text: 'LEVEL UP!', color: '#7fb069', life: 1.5 });
    }
  }

  // Splitter splits into 2 minis at the death position; they continue
  // along the path from the parent's current waypoint.
  if (e.type === 'splitter') {
    for (let i = 0; i < 2; i++) {
      const m = makeEnemy('mini', state.wave);
      if (!m) continue;
      m.x = e.x + (i === 0 ? -10 : 10);
      m.y = e.y;
      m.wp = e.wp;
      m.dist = e.dist;
      state.enemies.push(m);
    }
  }

  if (e.boss) {
    state.shake = 16;
    const name = e.type === 'ogre' ? 'Ogre' : 'Warlord';
    state.alert = { text: name + ' slain! +' + bounty + ' gold', level: 'info', t: 0 };
    burst(state, e.x, e.y, '#f4d35e', 24);
  } else {
    burst(state, e.x, e.y, '#c0392b', 6);
  }
}

// Enemy reached the keep: costs lives (1, boss 5), alarm + flash, removed.
function leakEnemy(state, e) {
  if (e.dead) return;
  e.dead = true;
  state.lives -= e.leak;
  state.shake = Math.max(state.shake, e.boss ? 14 : 8);
  state.alert = {
    text: e.boss
      ? 'The ' + (e.type === 'ogre' ? 'Ogre' : 'Warlord') + ' breached the keep! -' + e.leak + ' lives'
      : 'An enemy breached the keep! -1 life',
    level: 'danger',
    t: 0,
  };
}

// ---------------------------------------------------------------------------
// Per-frame updates
// ---------------------------------------------------------------------------

export function updateTowers(state, dt) {
  for (const t of state.towers) {
    t.cd -= dt;
    if (t.cd > 0) continue;
    const st = towerStats(t.type, t.level, state.decrees);
    if (!st) continue;
    const target = acquireTarget(state, t.x, t.y, st.range);
    if (!target) continue;

    if (t.type === 'frost') {
      // Frost: no projectile — slows (and lightly damages) every enemy in range.
      t.cd = 1 / st.rate;
      for (const e of state.enemies) {
        if (e.dead) continue;
        if (Math.hypot(e.x - t.x, e.y - t.y) <= st.range + e.r) {
          e.slowUntil = state.time + st.slowDur;
          e.slowFactor = st.slow;
          state.particles.push({ x: e.x, y: e.y - e.r, vx: 0, vy: -12, life: 0.3, color: '#bcd9f7', r: 2 });
          if (st.dmg > 0) damageEnemy(state, e, st.dmg);
        }
      }
      continue;
    }

    if (t.type === 'tesla') {
      // Chain lightning: instant, jumps to the nearest enemy within 70px of
      // the previous target, up to `chain` hits total.
      t.cd = 1 / st.rate;
      let from = { x: t.x, y: t.y - 10 };
      let cur = target;
      const hit = new Set();
      for (let i = 0; i < st.chain && cur; i++) {
        state.beams.push({ x1: from.x, y1: from.y, x2: cur.x, y2: cur.y, life: 0.15 });
        damageEnemy(state, cur, st.dmg);
        hit.add(cur.id);
        from = { x: cur.x, y: cur.y };
        cur = nearestEnemy(state, from.x, from.y, 70, hit);
      }
      continue;
    }

    // Archer / cannon / sniper: fire a projectile at the target.
    t.cd = 1 / st.rate;
    const speed = t.type === 'sniper' ? 900 : t.type === 'cannon' ? 280 : 420;
    state.projectiles.push({
      x: t.x,
      y: t.y - 10,
      target,
      type: t.type,
      dmg: st.dmg,
      splash: st.splash,
      speed,
    });
    state.particles.push({ x: t.x, y: t.y - 14, vx: 0, vy: -20, life: 0.12, color: '#ffd166', r: 4 });
  }
}

export function updateEnemies(state, dt) {
  for (const e of state.enemies) {
    if (e.dead) continue;

    // Healer aura: heals nearby allies 5 hp/s, never above maxHp (not self).
    if (e.type === 'healer') {
      for (const o of state.enemies) {
        if (o === e || o.dead) continue;
        if (o.hp < o.maxHp && Math.hypot(o.x - e.x, o.y - e.y) <= 60) {
          o.hp = Math.min(o.maxHp, o.hp + e.heal * dt);
        }
      }
    }

    const slowed = state.time < e.slowUntil;
    const sp = e.speed * (slowed ? (1 - e.slowFactor) : 1);
    let move = sp * dt;
    while (move > 0) {
      const wp = PATH[e.wp + 1];
      if (!wp) {
        leakEnemy(state, e);
        break;
      }
      const dx = wp.x - e.x;
      const dy = wp.y - e.y;
      const d = Math.hypot(dx, dy);
      if (d <= move) {
        e.x = wp.x;
        e.y = wp.y;
        e.dist += d;
        move -= d;
        e.wp += 1;
        if (e.wp >= PATH.length - 1) {
          leakEnemy(state, e);
          break;
        }
      } else {
        e.x += (dx / d) * move;
        e.y += (dy / d) * move;
        e.dist += move;
        move = 0;
      }
    }
  }
}

function impact(state, p, tgt) {
  if (p.splash > 0) {
    burst(state, tgt.x, tgt.y, '#e07a5f', 10);
    for (const e of state.enemies) {
      if (e.dead) continue;
      if (Math.hypot(e.x - tgt.x, e.y - tgt.y) <= p.splash + e.r) {
        damageEnemy(state, e, p.dmg, p.byHero === true);
      }
    }
  } else {
    damageEnemy(state, tgt, p.dmg, p.byHero === true);
    state.particles.push({ x: tgt.x, y: tgt.y, vx: 0, vy: 0, life: 0.15, color: '#ffd166', r: 3 });
  }
}

export function updateProjectiles(state, dt) {
  for (const p of state.projectiles) {
    if (p.dead) continue;
    const tgt = p.target;
    if (!tgt || tgt.dead) {
      p.dead = true; // target died / leaked before impact: fizzle
      continue;
    }
    const dx = tgt.x - p.x;
    const dy = tgt.y - p.y;
    const d = Math.hypot(dx, dy);
    const step = p.speed * dt;
    if (d <= step + 6) {
      p.dead = true;
      impact(state, p, tgt);
    } else {
      p.x += (dx / d) * step;
      p.y += (dy / d) * step;
    }
  }
  state.projectiles = state.projectiles.filter((p) => !p.dead);
}

export function updateHero(state, dt) {
  const h = state.hero;
  if (!h) return;

  if (h.retreating) {
    h.retreatT -= dt;
    if (h.retreatT <= 0) {
      h.retreating = false;
      h.hp = h.maxHp;
      h.x = HERO_POST.x;
      h.y = HERO_POST.y;
      state.floaters.push({ x: h.x, y: h.y - 24, text: 'Hero returns!', color: '#4a7fb5', life: 1.2 });
    }
    return;
  }

  h.cd -= dt;
  if (h.skillCd > 0) h.skillCd -= dt;

  // Enemies swinging past the hero's post wound him (10 dps, boss 30 dps).
  // This is the only damage source that can drop him to 0 HP -> retreat.
  for (const e of state.enemies) {
    if (e.dead) continue;
    if (Math.hypot(e.x - h.x, e.y - h.y) <= 70) {
      h.hp -= (e.boss ? 30 : 10) * dt;
    }
  }
  if (h.hp <= 0) {
    h.hp = 0;
    h.retreating = true;
    h.retreatT = 10;
    state.alert = { text: h.name + ' has fallen! Retreating to recover…', level: 'warn', t: 0 };
    return;
  }

  // Auto-attack: nearest enemy in range.
  const cfg = HEROES[h.id];
  if (!cfg) return;
  const dmg = cfg.dmg * (1 + 0.15 * (h.level - 1)); // +15% dmg per level
  const range = cfg.range + 8 * (h.level - 1); // +8 range per level
  if (h.cd <= 0) {
    let best = null;
    let bestD = Infinity;
    for (const e of state.enemies) {
      if (e.dead) continue;
      const d = Math.hypot(e.x - h.x, e.y - h.y);
      if (d <= range + e.r && d < bestD) {
        best = e;
        bestD = d;
      }
    }
    if (best) {
      h.cd = 1 / cfg.rate;
      if (h.id === 'lyra') {
        state.projectiles.push({
          x: h.x, y: h.y - 8, target: best, type: 'arrow',
          dmg, splash: 0, speed: 520, byHero: true,
        });
      } else {
        state.beams.push({ x1: h.x, y1: h.y, x2: best.x, y2: best.y, life: 0.12 });
        damageEnemy(state, best, dmg, true);
      }
    }
  }
}
