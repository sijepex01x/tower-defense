// hud.js — IRONHOLD HUD + all panels/screens (Worker 3)
// Draws on the logical 1024x640 canvas. Pure layout: computeLayout(state)
// produces every hit rect; drawHUD draws it, hudHit tests it, so the two
// can never drift apart. All hit targets are >= ~44px on the short side
// where the contract requires touch use (top-bar buttons are 44 tall;
// build-menu cards are >= 64 tall).
//
// Layout note: "narrow" = portrait-ish viewport (window.innerWidth < 700
// or aspect < 0.9). On narrow screens the build/tower panels dock to the
// bottom as a full-width strip; on desktop they float near the plot/tower.
// Range preview: tower selected -> that tower's range; plot selected ->
// range of the most recently built tower type (default Archer).
//
// Extra export beyond the contract: setPreviewType(type) lets a caller
// (e.g. main.js) set which tower type the plot range-preview shows.
// computeLayout is also exported for the QA harness. No other signature
// changes.

import {TOWERS, UPGRADE_MULT, SELL_REFUND, HEROES, ENEMIES} from './config.js';
import {PLOTS, plotAt} from './world.js';

export const LOGICAL_W = 1024;
export const LOGICAL_H = 640;

const TOP_H = 48;
const TOWER_ORDER = ['archer', 'cannon', 'frost', 'sniper', 'tesla'];
const MAX_LEVEL = 3;

// ---------------------------------------------------------------------------
// Decree presentation data (effects are defined by the contract)
const DECREE_INFO = {
  dmg15:    {name: 'Sharpened Steel', short: 'DMG +15%', desc: '+15% tower damage for the rest of the run.'},
  gold100:  {name: 'War Chest',       short: '+100 GOLD', desc: '+100 gold, right now.'},
  lives2:   {name: 'Reinforcements', short: '+2 LIVES',  desc: '+2 lives. The keep stands a little taller.'},
  bounty10: {name: 'Bounty Hunters', short: 'BOUNTY +10%', desc: '+10% gold from every kill.'},
  build20:  {name: 'Master Builders', short: 'BUILD -20%', desc: 'All build costs -20% for the rest of the run.'},
  heroCd20: {name: 'Heroic Focus',   short: 'HERO CD -20%', desc: 'Hero skill cooldown -20%.'},
  range10:  {name: 'Eagle Eyes',     short: 'RANGE +10%', desc: '+10% tower range for the rest of the run.'},
  slow10:   {name: 'Deep Freeze',   short: 'SLOW +10%',  desc: 'Frost towers slow enemies +10% harder.'},
};

let lastBuiltType = 'archer';
export function setPreviewType(type) {
  if (TOWERS && TOWERS[type]) lastBuiltType = type;
}
export function getPreviewType() { return lastBuiltType; }

// ---------------------------------------------------------------------------
// Small helpers

function isNarrow() {
  try {
    if (typeof window === 'undefined') return false;
    if (!window.innerWidth || !window.innerHeight) return false;
    return window.innerWidth < 700 || window.innerWidth / window.innerHeight < 0.9;
  } catch (e) { return false; }
}

function inRect(x, y, r) {
  return !!r && x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
}

function rr(ctx, x, y, w, h, rad) {
  const r = Math.min(rad, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function text(ctx, str, x, y, font, color, align) {
  ctx.font = font;
  ctx.fillStyle = color;
  ctx.textAlign = align || 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(String(str), x, y);
}

function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }

// Tower stats at a given level (mirrors contract UPGRADE_MULT rules)
function towerStats(type, level) {
  const b = TOWERS[type];
  const l = Math.max(1, level || 1);
  return {
    dmg: Math.round(b.dmg * Math.pow(UPGRADE_MULT, l - 1)),
    rate: +(b.rate * Math.pow(1.1, l - 1)).toFixed(2),
    range: Math.round(b.range * Math.pow(1.1, l - 1)),
    splash: b.splash || 0,
    slow: b.slow || 0,
    chain: b.chain || 0,
  };
}

function upgradeCost(type, level) {
  return Math.round(TOWERS[type].cost * 0.75 * level);
}

function buildCost(state, type) {
  let c = TOWERS[type].cost;
  if (state.decrees && state.decrees.indexOf('build20') !== -1) c = Math.round(c * 0.8);
  return c;
}

function sellValue(tower) {
  return Math.round((tower.invested || 0) * SELL_REFUND);
}

function selectedTower(state) {
  if (!state.selected || state.selected.kind !== 'tower') return null;
  const list = state.towers || [];
  for (let i = 0; i < list.length; i++) if (list[i].id === state.selected.id) return list[i];
  return null;
}

function selectedPlot(state) {
  if (!state.selected || state.selected.kind !== 'plot') return null;
  for (let i = 0; i < PLOTS.length; i++) if (PLOTS[i].id === state.selected.id) return PLOTS[i];
  return null;
}

// Next-wave preview text, derived from the contract's wave rules.
// Short form: the top bar only has ~200px between the SCORE cluster and
// the START WAVE button, so list the first kind and count the rest —
// the full kind list used to run underneath the button and get clipped.
function wavePreview(wave) {
  if (wave >= 21) return 'Endless — it only gets worse';
  if (wave === 10) return 'Wave 10: THE OGRE + escorts';
  if (wave === 20) return 'Wave 20: THE WARLORD + escorts';
  const count = 6 + wave * 2;
  const kinds = ['Grunts'];
  if (wave >= 3) kinds.push('Runners');
  if (wave >= 5) kinds.push('Armored');
  if (wave >= 7) kinds.push('Healers');
  if (wave >= 8) kinds.push('Splitters');
  const extra = kinds.length > 1 ? ' +' + (kinds.length - 1) : '';
  return 'Wave ' + wave + ': ' + count + ' foes — ' + kinds[0] + extra;
}

// Ultra-short fallback for the top-bar preview when even the short form
// will not fit the gap (e.g. a huge score shrinks it). Always fits:
// at most ~20 chars, ~125px at 12px.
function wavePreviewShort(wave) {
  if (wave >= 21) return 'Endless mode';
  if (wave === 10) return 'Wave 10: THE OGRE';
  if (wave === 20) return 'Wave 20: THE WARLORD';
  return 'Wave ' + wave + ': ' + (6 + wave * 2) + ' foes';
}

function enemiesLeft(state) {
  const queued = Math.max(0, (state.waveTotal || 0) - (state.waveSpawned || 0));
  return queued + (state.enemies ? state.enemies.length : 0);
}

// ---------------------------------------------------------------------------
// Layout — single source of truth for draw + hit

export function computeLayout(state) {
  const narrow = isNarrow();
  const L = {narrow, top: {}, buildMenu: null, towerPanel: null, heroPanel: null,
             decrees: [], alert: null, tutorial: null, screen: null, rangeCircle: null};

  // ---- top bar buttons (right aligned, 44px tall for touch) ----
  const by = 2, bh = 44;
  let bx = LOGICAL_W - 8;
  function take(w) { bx -= w; const r = {x: bx, y: by, w, h: bh}; bx -= 6; return r; }
  L.top.quality = take(52);
  L.top.mute = take(52);
  L.top.pause = take(52);
  L.top.speed = take(64);
  L.top.start = take(150); // build phase only; wave phase shows a WAVE chip here

  // ---- range preview circle ----
  const tower = selectedTower(state);
  const plot = selectedPlot(state);
  if (tower) {
    const st = towerStats(tower.type, tower.level);
    L.rangeCircle = {x: tower.x, y: tower.y, r: st.range, label: TOWERS[tower.type].name + ' range ' + st.range};
  } else if (plot) {
    const st = towerStats(lastBuiltType, 1);
    L.rangeCircle = {x: plot.x, y: plot.y, r: st.range, label: TOWERS[lastBuiltType].name + ' range ' + st.range};
  }

  const inGame = state.phase === 'build' || state.phase === 'wave';

  // ---- build menu (plot selected) ----
  if (inGame && plot) {
    if (narrow) {
      const py = LOGICAL_H - 108, ph = 100;
      const close = {x: LOGICAL_W - 8 - 44, y: py + 28, w: 44, h: 44};
      const cardW = Math.floor((LOGICAL_W - 16 - 52 - 4 * 8) / 5);
      const cards = TOWER_ORDER.map((type, i) => {
        const c = buildCost(state, type);
        return {rect: {x: 8 + i * (cardW + 8), y: py + 4, w: cardW, h: ph - 8},
                type, cost: c, afford: state.gold >= c};
      });
      L.buildMenu = {rect: {x: 8, y: py, w: LOGICAL_W - 16, h: ph}, cards, close};
    } else {
      // Panel is 108 tall: a 28px header row on top (the "BUILD — tap a
      // tower" line lives there on the near-opaque panel base), then the
      // cards below it. The header used to sit at y+16 with the cards
      // starting at y+8, so the semi-transparent cards painted over it
      // and it read muddled.
      const pw = 560, ph = 108;
      const px = clamp(plot.x - pw / 2, 8, LOGICAL_W - 8 - pw);
      const py = plot.y < 320 ? plot.y + 52 : plot.y - 52 - ph;
      const cardW = Math.floor((pw - 16 - 4 * 8) / 5);
      const cards = TOWER_ORDER.map((type, i) => {
        const c = buildCost(state, type);
        return {rect: {x: px + 8 + i * (cardW + 8), y: py + 28, w: cardW, h: ph - 36},
                type, cost: c, afford: state.gold >= c};
      });
      L.buildMenu = {rect: {x: px, y: py, w: pw, h: ph}, cards,
                     close: {x: px + pw - 40, y: py + 4, w: 36, h: 36}};
    }
  }

  // ---- tower panel (tower selected) ----
  if (inGame && tower) {
    const upCost = tower.level >= MAX_LEVEL ? null : upgradeCost(tower.type, tower.level);
    if (narrow) {
      const py = LOGICAL_H - 108, ph = 100;
      L.towerPanel = {
        rect: {x: 8, y: py, w: LOGICAL_W - 16, h: ph},
        upgrade: upCost === null ? null : {x: LOGICAL_W - 8 - 44 - 8 - 190, y: py + 10, w: 190, h: 44, cost: upCost},
        sell: {x: LOGICAL_W - 8 - 44 - 8 - 190 - 8 - 130, y: py + 10, w: 130, h: 44, value: sellValue(tower)},
        close: {x: LOGICAL_W - 8 - 44, y: py + 28, w: 44, h: 44},
        maxed: upCost === null,
      };
    } else {
      // Panel is 192 tall so the "Next level" line (y+120) clears the
      // buttons (top edge y+136) — it used to sit at y+120 with buttons
      // starting at y+120 and was half-covered by the UPGRADE button.
      const pw = 320, ph = 192;
      const px = clamp(tower.x - pw / 2, 8, LOGICAL_W - 8 - pw);
      const py = clamp(tower.y < 320 ? tower.y + 52 : tower.y - 52 - ph, TOP_H + 8, LOGICAL_H - 8 - ph);
      L.towerPanel = {
        rect: {x: px, y: py, w: pw, h: ph},
        upgrade: upCost === null ? null : {x: px + 16, y: py + ph - 56, w: 150, h: 44, cost: upCost},
        sell: {x: px + 16 + 150 + 12, y: py + ph - 56, w: 126, h: 44, value: sellValue(tower)},
        close: {x: px + pw - 40, y: py + 6, w: 34, h: 34},
        maxed: upCost === null,
      };
    }
  }

  // ---- hero panel (always during build/wave when a hero exists) ----
  if (inGame && state.hero) {
    const menuOpen = !!(L.buildMenu || L.towerPanel);
    const hw = 248, hh = 96;
    const hy = narrow && menuOpen ? LOGICAL_H - 108 - 8 - hh : LOGICAL_H - 8 - hh;
    L.heroPanel = {
      rect: {x: 8, y: hy, w: hw, h: hh},
      skill: {x: 8 + 12, y: hy + hh - 48, w: hw - 24, h: 40},
    };
  }

  // ---- active decrees mini panel (bottom-right, above docked menus) ----
  if (inGame && state.decrees && state.decrees.length) {
    const menuOpen = !!(L.buildMenu || L.towerPanel);
    const y = menuOpen && narrow ? LOGICAL_H - 108 - 8 - 22 : LOGICAL_H - 8 - 22;
    let x = LOGICAL_W - 8;
    const chips = [];
    for (let i = state.decrees.length - 1; i >= 0; i--) {
      const info = DECREE_INFO[state.decrees[i]];
      if (!info) continue;
      const w = info.short.length * 7 + 18;
      x -= w;
      chips.unshift({rect: {x, y, w, h: 22}, text: info.short, id: state.decrees[i]});
      x -= 6;
    }
    L.decrees = chips;
  }

  // ---- alert banner ----
  if (state.alert && state.alert.text) {
    L.alert = {text: state.alert.text, level: state.alert.level || 'info', t: state.alert.t || 0};
  }

  // ---- tutorial hint bar (wave 1) ----
  // Docked to the right of the hero panel so it never covers the hero
  // skill button (the old centered bar overlapped its right edge).
  // Width 560 keeps it clear of the right-aligned decree chips: the
  // widest chip ("HERO CD -20%", 109px) starts at x=907, the bar ends
  // at x=824. Only one decree can exist while the tutorial shows.
  if (state.tutorial && (state.phase === 'build' || state.phase === 'wave') && state.wave <= 1) {
    const menuOpen = !!(L.buildMenu || L.towerPanel);
    const y = menuOpen && narrow ? LOGICAL_H - 108 - 8 - 34 : LOGICAL_H - 8 - 34;
    const hx = L.heroPanel ? L.heroPanel.rect.x + L.heroPanel.rect.w + 8 : (LOGICAL_W - 620) / 2;
    const hw = L.heroPanel ? 560 : 620;
    L.tutorial = {rect: {x: hx, y, w: hw, h: 32}};
  }

  // ---- full screens ----
  if (state.phase === 'title') {
    L.screen = {kind: 'title',
      start: {x: (LOGICAL_W - 280) / 2, y: 428, w: 280, h: 64}};
  } else if (state.phase === 'hero') {
    const cw = 300, ch = 380, cy = 128;
    const cards = [];
    const ids = ['aldric', 'lyra'];
    for (let i = 0; i < ids.length; i++) {
      cards.push({rect: {x: 202 + i * 320, y: cy, w: cw, h: ch}, id: ids[i]});
    }
    L.screen = {kind: 'hero', cards};
  } else if (state.phase === 'decree') {
    const cw = 290, ch = 280, cy = 176;
    const cards = (state.decreeChoices || []).slice(0, 3).map((id, i) => ({
      rect: {x: 53 + i * (cw + 24), y: cy, w: cw, h: ch}, id}));
    L.screen = {kind: 'decree', cards};
  } else if (state.phase === 'victory') {
    L.screen = {kind: 'victory',
      endless: {x: (LOGICAL_W - 320) / 2, y: 392, w: 320, h: 56},
      restart: {x: (LOGICAL_W - 320) / 2 - 190, y: 392, w: 170, h: 56},
      title: {x: (LOGICAL_W - 320) / 2 + 340, y: 392, w: 170, h: 56}};
  } else if (state.phase === 'gameover') {
    L.screen = {kind: 'gameover',
      restart: {x: (LOGICAL_W - 200) / 2 - 110, y: 420, w: 200, h: 56},
      title: {x: (LOGICAL_W - 200) / 2 + 110, y: 420, w: 200, h: 56}};
  }

  return L;
}

// ---------------------------------------------------------------------------
// Drawing

function drawButton(ctx, r, label, opts) {
  opts = opts || {};
  ctx.save();
  rr(ctx, r.x, r.y, r.w, r.h, opts.rad || 8);
  ctx.fillStyle = opts.bg || 'rgba(255,255,255,0.08)';
  ctx.fill();
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = opts.border || '#6b5a3a';
  ctx.stroke();
  if (opts.disabled) { ctx.globalAlpha = 0.45; }
  text(ctx, label, r.x + r.w / 2, r.y + r.h / 2 + 1, opts.font || 'bold 15px sans-serif',
       opts.color || '#f3e9d2', 'center');
  ctx.restore();
}

function drawCoin(ctx, x, y, r) {
  ctx.save();
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = '#ffd54a'; ctx.fill();
  ctx.lineWidth = 2; ctx.strokeStyle = '#a67c00'; ctx.stroke();
  ctx.beginPath(); ctx.arc(x, y, r * 0.55, 0, Math.PI * 2);
  ctx.strokeStyle = '#a67c00'; ctx.lineWidth = 1.5; ctx.stroke();
  ctx.restore();
}

function drawHeart(ctx, x, y, s, color) {
  ctx.save();
  ctx.translate(x, y); ctx.scale(s / 10, s / 10);
  ctx.beginPath();
  ctx.moveTo(0, 3);
  ctx.bezierCurveTo(-6, -3, -10, 2, 0, 9);
  ctx.bezierCurveTo(10, 2, 6, -3, 0, 3);
  ctx.fillStyle = color; ctx.fill();
  ctx.restore();
}

function drawTopBar(ctx, state, L) {
  ctx.save();
  ctx.fillStyle = 'rgba(18,14,10,0.92)';
  ctx.fillRect(0, 0, LOGICAL_W, TOP_H);
  ctx.fillStyle = '#8a6d2f';
  ctx.fillRect(0, TOP_H - 2, LOGICAL_W, 2);

  // gold / lives / wave / score
  drawCoin(ctx, 24, TOP_H / 2, 9);
  text(ctx, state.gold, 40, TOP_H / 2 + 1, 'bold 18px sans-serif', '#ffd54a');
  drawHeart(ctx, 128, TOP_H / 2 - 5, 15, '#e74c3c');
  text(ctx, state.lives, 146, TOP_H / 2 + 1, 'bold 18px sans-serif', '#ff8a7a');
  text(ctx, 'WAVE ' + Math.max(1, state.wave) + '/20', 196, TOP_H / 2 + 1,
       'bold 16px sans-serif', '#f3e9d2');
  text(ctx, 'SCORE ' + state.score, 318, TOP_H / 2 + 1,
       'bold 16px sans-serif', '#f3e9d2');

  // center: next-wave preview (build) or enemies left (wave)
  // Centered in the measured free gap between the SCORE cluster and the
  // START/WAVE button — the old code centered at x=560 and long preview
  // lines ran underneath the button. Shrink 14/15px -> 12px if needed,
  // then fall back to the ultra-short form; the text can never reach
  // the button now.
  if (state.phase === 'build' || state.phase === 'wave') {
    ctx.font = 'bold 18px sans-serif';
    const scoreW = ctx.measureText('SCORE ' + state.score).width;
    const gapStart = 318 + scoreW + 14;
    const gapEnd = L.top.start.x - 10;
    const gapW = Math.max(60, gapEnd - gapStart);
    const cx = (gapStart + gapEnd) / 2;
    let label = state.phase === 'build'
      ? wavePreview(state.wave + 1)
      : 'Foes left: ' + enemiesLeft(state);
    const color = state.phase === 'build' ? '#c9b98a' : '#ff9d7a';
    const weight = state.phase === 'build' ? '' : 'bold ';
    let px = state.phase === 'build' ? 14 : 15;
    ctx.font = weight + px + 'px sans-serif';
    if (ctx.measureText(label).width > gapW && px > 12) {
      px = 12;
      ctx.font = weight + px + 'px sans-serif';
    }
    if (ctx.measureText(label).width > gapW && state.phase === 'build') {
      label = wavePreviewShort(state.wave + 1);
      ctx.font = weight + px + 'px sans-serif';
    }
    text(ctx, label, cx, TOP_H / 2 + 1, weight + px + 'px sans-serif', color, 'center');
  }

  // buttons
  if (state.phase === 'build') {
    drawButton(ctx, L.top.start, '▶  START WAVE',
      {bg: '#c99327', border: '#ffe9a8', color: '#1a1206', font: 'bold 16px sans-serif'});
  } else if (state.phase === 'wave') {
    drawButton(ctx, L.top.start, 'WAVE ' + state.wave,
      {bg: 'rgba(255,255,255,0.05)', color: '#c9b98a', font: 'bold 15px sans-serif'});
  }
  drawButton(ctx, L.top.speed, state.speed === 2 ? '2×' : '1×',
    {bg: state.speed === 2 ? '#3d6b35' : undefined, color: state.speed === 2 ? '#d8ffd0' : undefined});
  drawButton(ctx, L.top.pause, state.paused ? '▶' : 'II');
  drawButton(ctx, L.top.mute, state.muted ? '✕' : '♪',
    {color: state.muted ? '#ff8a7a' : undefined});
  drawButton(ctx, L.top.quality, state.quality === 'low' ? 'LO' : 'HI');
  ctx.restore();
}

function drawRangeCircle(ctx, L) {
  if (!L.rangeCircle) return;
  const c = L.rangeCircle;
  ctx.save();
  ctx.beginPath(); ctx.arc(c.x, c.y, c.r, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(255,255,255,0.06)'; ctx.fill();
  ctx.setLineDash([8, 6]);
  ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(255,255,255,0.55)'; ctx.stroke();
  ctx.setLineDash([]);
  text(ctx, c.label, c.x, c.y - c.r - 8, '12px sans-serif', 'rgba(255,255,255,0.75)', 'center');
  ctx.restore();
}

function drawPanelBase(ctx, r) {
  ctx.save();
  rr(ctx, r.x, r.y, r.w, r.h, 10);
  ctx.fillStyle = 'rgba(22,18,13,0.95)'; ctx.fill();
  ctx.lineWidth = 2; ctx.strokeStyle = '#8a6d2f'; ctx.stroke();
  ctx.restore();
}

function drawBuildMenu(ctx, state, L) {
  const m = L.buildMenu;
  if (!m) return;
  drawPanelBase(ctx, m.rect);
  if (!L.narrow) {
    text(ctx, 'BUILD  —  tap a tower', m.rect.x + 12, m.rect.y + 16,
         'bold 12px sans-serif', '#c9b98a');
  }
  for (let i = 0; i < m.cards.length; i++) {
    const card = m.cards[i];
    const t = TOWERS[card.type];
    const r = card.rect;
    ctx.save();
    rr(ctx, r.x, r.y, r.w, r.h, 8);
    ctx.fillStyle = card.afford ? 'rgba(255,255,255,0.07)' : 'rgba(255,255,255,0.02)';
    ctx.fill();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = card.afford ? t.color : '#555';
    ctx.stroke();
    // tower icon: colored stone base + colored top
    const cx = r.x + r.w / 2, cy = r.y + (L.narrow ? 26 : 22);
    ctx.fillStyle = '#9c8d7a';
    ctx.fillRect(cx - 13, cy - 4, 26, 14);
    ctx.beginPath(); ctx.arc(cx, cy - 6, 11, 0, Math.PI * 2);
    ctx.fillStyle = t.color; ctx.fill();
    ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(0,0,0,0.4)'; ctx.stroke();
    text(ctx, t.name, cx, r.y + (L.narrow ? 52 : 46), 'bold 14px sans-serif',
         card.afford ? '#f3e9d2' : '#888', 'center');
    drawCoin(ctx, cx - 16, r.y + r.h - (L.narrow ? 20 : 16), 6);
    text(ctx, card.cost, cx + 12, r.y + r.h - (L.narrow ? 20 : 16) + 1,
         'bold 13px sans-serif', card.afford ? '#ffd54a' : '#a33', 'center');
    // hotkey badge
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(r.x + 4, r.y + 4, 16, 16);
    text(ctx, String(i + 1), r.x + 12, r.y + 12, 'bold 11px sans-serif', '#ddd', 'center');
    ctx.restore();
  }
  drawButton(ctx, m.close, '✕', {font: 'bold 16px sans-serif'});
}

function drawTowerPanel(ctx, state, L) {
  const p = L.towerPanel;
  if (!p) return;
  const tower = selectedTower(state);
  if (!tower) return;
  const t = TOWERS[tower.type];
  const st = towerStats(tower.type, tower.level);
  const next = tower.level < MAX_LEVEL ? towerStats(tower.type, tower.level + 1) : null;
  drawPanelBase(ctx, p.rect);

  if (L.narrow) {
    // one-line stats left, buttons right
    text(ctx, t.name + '  Lv ' + tower.level, p.rect.x + 14, p.rect.y + 22,
         'bold 16px sans-serif', '#f3e9d2');
    let line = 'DMG ' + st.dmg + '  •  RNG ' + st.range + '  •  ' + st.rate + '/s';
    if (t.splash) line += '  •  Splash ' + t.splash;
    if (t.slow) line += '  •  Slow ' + Math.round(t.slow * 100) + '%';
    if (t.chain) line += '  •  Chain ×' + t.chain;
    text(ctx, line, p.rect.x + 14, p.rect.y + 46, '13px sans-serif', '#c9b98a');
    text(ctx, next
      ? 'Upgrade → DMG ' + next.dmg + '  RNG ' + next.range
      : 'MAX LEVEL — fully forged', p.rect.x + 14, p.rect.y + 68,
         '13px sans-serif', next ? '#9ec98a' : '#ffd54a');
    text(ctx, 'Sell refunds 70% of ' + tower.invested + 'g invested',
         p.rect.x + 14, p.rect.y + 88, '12px sans-serif', '#8a7a5a');
    if (p.upgrade) drawButton(ctx, p.upgrade, 'UPGRADE  ' + p.upgrade.cost + 'g',
      {bg: '#3d6b35', border: '#9ec98a', color: '#eaffea', font: 'bold 14px sans-serif'});
    drawButton(ctx, p.sell, 'SELL  +' + p.sell.value + 'g',
      {bg: '#6b3a2e', border: '#d08a7a', color: '#ffe0d8', font: 'bold 14px sans-serif'});
    drawButton(ctx, p.close, '✕', {font: 'bold 16px sans-serif'});
    return;
  }

  text(ctx, t.name + '  —  Level ' + tower.level + '/' + MAX_LEVEL,
       p.rect.x + 16, p.rect.y + 26, 'bold 18px sans-serif', '#f3e9d2');
  text(ctx, t.desc, p.rect.x + 16, p.rect.y + 50, '13px sans-serif', '#c9b98a');
  text(ctx, 'Damage ' + st.dmg + '    Rate ' + st.rate + '/s    Range ' + st.range,
       p.rect.x + 16, p.rect.y + 76, '14px sans-serif', '#f3e9d2');
  let extra = '';
  if (t.splash) extra = 'Splash radius ' + t.splash;
  if (t.slow) extra = 'Slows enemies ' + Math.round(t.slow * 100) + '% for ' + t.slowDur + 's';
  if (t.chain) extra = 'Lightning chains to ' + t.chain + ' enemies';
  if (extra) text(ctx, extra, p.rect.x + 16, p.rect.y + 98, '13px sans-serif', '#c9b98a');
  if (next) {
    text(ctx, 'Next level: DMG ' + next.dmg + '  •  RNG ' + next.range,
         p.rect.x + 16, p.rect.y + 120, '13px sans-serif', '#9ec98a');
  } else {
    text(ctx, 'MAX LEVEL — fully forged.', p.rect.x + 16, p.rect.y + 120,
         '13px sans-serif', '#ffd54a');
  }
  if (p.upgrade) {
    drawButton(ctx, p.upgrade, 'UPGRADE  ' + p.upgrade.cost + 'g',
      {bg: '#3d6b35', border: '#9ec98a', color: '#eaffea', font: 'bold 14px sans-serif'});
  }
  drawButton(ctx, p.sell, 'SELL  +' + p.sell.value + 'g',
    {bg: '#6b3a2e', border: '#d08a7a', color: '#ffe0d8', font: 'bold 14px sans-serif'});
  drawButton(ctx, p.close, '✕', {font: 'bold 15px sans-serif'});
}

function drawHeroPanel(ctx, state, L) {
  const hp = L.heroPanel;
  if (!hp) return;
  const hero = state.hero;
  const def = HEROES[hero.id] || HEROES.aldric;
  drawPanelBase(ctx, hp.rect);
  const r = hp.rect;
  text(ctx, def.name + ' ' + def.title + '  •  Lv ' + hero.level,
       r.x + 12, r.y + 18, 'bold 14px sans-serif', '#f3e9d2');
  // HP bar
  ctx.save();
  rr(ctx, r.x + 12, r.y + 30, r.w - 24, 10, 5);
  ctx.fillStyle = 'rgba(255,255,255,0.12)'; ctx.fill();
  const frac = Math.max(0, hero.hp / hero.maxHp);
  rr(ctx, r.x + 12, r.y + 30, (r.w - 24) * frac, 10, 5);
  ctx.fillStyle = hero.retreating ? '#8a7a5a' : '#5fae5a'; ctx.fill();
  ctx.restore();
  if (hero.retreating) {
    text(ctx, 'Retreating — back in ' + Math.ceil(hero.retreatT || 0) + 's',
         r.x + 12, r.y + 58, '13px sans-serif', '#ffcf8a');
  } else {
    text(ctx, 'HP ' + Math.ceil(hero.hp) + '/' + hero.maxHp,
         r.x + 12, r.y + 58, '12px sans-serif', '#c9b98a');
  }
  const skill = def.skill;
  const ready = !hero.retreating && (hero.skillCd || 0) <= 0;
  const label = ready ? skill.name + '  —  READY  (H)'
    : skill.name + '  —  ' + Math.ceil(hero.skillCd || 0) + 's';
  drawButton(ctx, hp.skill, label, {
    bg: ready ? '#2f5d8a' : 'rgba(255,255,255,0.06)',
    border: ready ? '#9ec8f0' : '#6b5a3a',
    color: ready ? '#eaf4ff' : '#a99e86',
    font: 'bold 13px sans-serif'});
}

function drawDecrees(ctx, L) {
  for (let i = 0; i < L.decrees.length; i++) {
    const c = L.decrees[i];
    ctx.save();
    rr(ctx, c.rect.x, c.rect.y, c.rect.w, c.rect.h, 11);
    ctx.fillStyle = 'rgba(201,147,39,0.22)'; ctx.fill();
    ctx.lineWidth = 1; ctx.strokeStyle = '#c99327'; ctx.stroke();
    text(ctx, c.text, c.rect.x + c.rect.w / 2, c.rect.y + c.rect.h / 2 + 1,
         'bold 11px sans-serif', '#ffd54a', 'center');
    ctx.restore();
  }
}

function drawAlert(ctx, L) {
  const a = L.alert;
  if (!a) return;
  const alpha = a.t < 2 ? 1 : Math.max(0, 1 - (a.t - 2) / 0.6);
  if (alpha <= 0) return;
  const colors = {info: '#2f6fb2', warn: '#b7791f', danger: '#a93226'};
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.font = 'bold 15px sans-serif';
  const w = ctx.measureText(a.text).width + 36;
  const x = (LOGICAL_W - w) / 2, y = TOP_H + 10;
  rr(ctx, x, y, w, 36, 8);
  ctx.fillStyle = colors[a.level] || colors.info; ctx.fill();
  ctx.lineWidth = 1.5; ctx.strokeStyle = 'rgba(255,255,255,0.5)'; ctx.stroke();
  text(ctx, a.text, LOGICAL_W / 2, y + 19, 'bold 15px sans-serif', '#fff', 'center');
  ctx.restore();
}

function drawTutorial(ctx, L) {
  const t = L.tutorial;
  if (!t) return;
  ctx.save();
  rr(ctx, t.rect.x, t.rect.y, t.rect.w, t.rect.h, 8);
  ctx.fillStyle = 'rgba(18,14,10,0.88)'; ctx.fill();
  ctx.lineWidth = 1.5; ctx.strokeStyle = '#8a6d2f'; ctx.stroke();
  text(ctx, 'Tap a glowing plot to build  •  SPACE starts the wave  •  1–5 quick-build  •  H = hero skill',
       t.rect.x + t.rect.w / 2, t.rect.y + 17, '13px sans-serif', '#ffe9a8', 'center');
  ctx.restore();
}

function drawPauseOverlay(ctx, state) {
  if (!state.paused) return;
  ctx.save();
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.fillRect(0, 0, LOGICAL_W, LOGICAL_H);
  text(ctx, 'PAUSED', LOGICAL_W / 2, LOGICAL_H / 2 - 10,
       'bold 44px Georgia, serif', '#f3e9d2', 'center');
  text(ctx, 'Press P or Esc to resume  •  M mute  •  Q quality',
       LOGICAL_W / 2, LOGICAL_H / 2 + 34, '15px sans-serif', '#c9b98a', 'center');
  ctx.restore();
}

// ---------------------------------------------------------------------------
// Full screens

function drawScreenBase(ctx, title, subtitle) {
  ctx.save();
  // night sky + ground
  const g = ctx.createLinearGradient(0, 0, 0, LOGICAL_H);
  g.addColorStop(0, '#1a2436');
  g.addColorStop(0.55, '#232c3d');
  g.addColorStop(0.56, '#2c2417');
  g.addColorStop(1, '#171208');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, LOGICAL_W, LOGICAL_H);
  // stars (deterministic)
  ctx.fillStyle = 'rgba(255,255,255,0.7)';
  for (let i = 0; i < 70; i++) {
    const sx = (i * 173 + 41) % LOGICAL_W;
    const sy = (i * 97 + 13) % 300;
    ctx.fillRect(sx, sy, 2, 2);
  }
  // moon
  ctx.beginPath(); ctx.arc(880, 90, 34, 0, Math.PI * 2);
  ctx.fillStyle = '#f4ead0'; ctx.fill();
  ctx.beginPath(); ctx.arc(868, 82, 30, 0, Math.PI * 2);
  ctx.fillStyle = '#e2d5b0'; ctx.fill();
  // castle silhouette on the horizon
  ctx.fillStyle = '#141a26';
  ctx.fillRect(80, 300, 60, 70);
  ctx.fillRect(150, 280, 90, 90);
  ctx.fillRect(250, 310, 50, 60);
  ctx.fillRect(724, 310, 50, 60);
  ctx.fillRect(784, 280, 90, 90);
  ctx.fillRect(884, 300, 60, 70);
  for (let i = 0; i < 5; i++) {
    ctx.fillRect(150 + i * 20, 268, 10, 12);
    ctx.fillRect(784 + i * 20, 268, 10, 12);
  }
  // banner behind the title
  ctx.fillStyle = 'rgba(120,20,20,0.85)';
  ctx.fillRect(0, 96, LOGICAL_W, 8);
  ctx.restore();
  if (title) {
    text(ctx, title, LOGICAL_W / 2, 190, 'bold 84px Georgia, serif', '#e8c15a', 'center');
    ctx.save();
    ctx.font = 'bold 84px Georgia, serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.strokeStyle = 'rgba(0,0,0,0.6)'; ctx.lineWidth = 2;
    ctx.strokeText(title, LOGICAL_W / 2, 190);
    ctx.restore();
  }
  if (subtitle) {
    text(ctx, subtitle, LOGICAL_W / 2, 248, 'bold 24px Georgia, serif', '#f3e9d2', 'center');
  }
}

function drawTitle(ctx, state, L) {
  drawScreenBase(ctx, 'IRONHOLD', '—  THE LAST BASTION  —');
  text(ctx, 'The Rebel Invasion has begun. Twenty waves march on the keep.',
       LOGICAL_W / 2, 292, '16px sans-serif', '#c9b98a', 'center');
  text(ctx, 'Build towers on the plots. Spend gold wisely. Hold the line.',
       LOGICAL_W / 2, 318, '16px sans-serif', '#c9b98a', 'center');
  drawButton(ctx, L.screen.start, '⚔  START  ⚔',
    {bg: '#c99327', border: '#ffe9a8', color: '#1a1206', font: 'bold 22px Georgia, serif', rad: 10});
  if (state.best && (state.best.wave > 0 || state.best.score > 0)) {
    text(ctx, 'Best stand: Wave ' + state.best.wave + '  •  Score ' + state.best.score,
         LOGICAL_W / 2, 522, 'bold 16px sans-serif', '#ffd54a', 'center');
  }
  text(ctx, 'SPACE start wave  •  F fast-forward  •  P pause  •  M mute  •  1–5 quick-build  •  H hero skill',
       LOGICAL_W / 2, 596, '13px sans-serif', '#8a7a5a', 'center');
}

function drawHeroFigure(ctx, x, y, color, kind) {
  // chunky little hero portrait: cloak/body + head + weapon
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = color;
  ctx.fillRect(-26, -8, 52, 58);            // body / cloak
  ctx.fillStyle = '#e8dcc0';
  ctx.beginPath(); ctx.arc(0, -24, 18, 0, Math.PI * 2); ctx.fill(); // head
  ctx.fillStyle = '#5a4632';
  ctx.fillRect(-18, -38, 36, 10);           // hair / helm brim
  if (kind === 'aldric') {
    ctx.fillStyle = '#c9c9c9';
    ctx.fillRect(18, -30, 6, 64);           // sword
    ctx.fillRect(10, -34, 22, 6);
    ctx.fillStyle = '#7f8c8d';
    ctx.fillRect(-30, -6, 10, 40);          // shield
  } else {
    ctx.strokeStyle = '#8a6d3b'; ctx.lineWidth = 5;
    ctx.beginPath(); ctx.arc(-24, -6, 26, -Math.PI / 2.4, Math.PI / 2.4); ctx.stroke(); // bow
    ctx.strokeStyle = '#ddd'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(-24, -30); ctx.lineTo(-24, 18); ctx.stroke();
  }
  ctx.restore();
}

function drawHeroSelect(ctx, state, L) {
  drawScreenBase(ctx, '', '');
  text(ctx, 'CHOOSE YOUR HERO', LOGICAL_W / 2, 84, 'bold 44px Georgia, serif', '#e8c15a', 'center');
  text(ctx, 'Your hero guards the keep beside your towers — and levels up in battle.',
       LOGICAL_W / 2, 116, '15px sans-serif', '#c9b98a', 'center');
  for (let i = 0; i < L.screen.cards.length; i++) {
    const card = L.screen.cards[i];
    const h = HEROES[card.id];
    const r = card.rect;
    ctx.save();
    rr(ctx, r.x, r.y, r.w, r.h, 12);
    ctx.fillStyle = 'rgba(24,20,15,0.96)'; ctx.fill();
    ctx.lineWidth = 2.5; ctx.strokeStyle = h.color; ctx.stroke();
    ctx.fillStyle = h.color;
    ctx.fillRect(r.x, r.y, r.w, 6);
    drawHeroFigure(ctx, r.x + r.w / 2, r.y + 92, h.color, card.id);
    text(ctx, h.name, r.x + r.w / 2, r.y + 158, 'bold 30px Georgia, serif', '#f3e9d2', 'center');
    text(ctx, h.title, r.x + r.w / 2, r.y + 186, 'italic 16px Georgia, serif', '#c9b98a', 'center');
    text(ctx, 'HP ' + h.hp + '   •   DMG ' + h.dmg + '   •   Range ' + h.range,
         r.x + r.w / 2, r.y + 220, '14px sans-serif', '#f3e9d2', 'center');
    text(ctx, 'Attacks ' + h.rate + '/s  •  Levels up every 10 hero kills',
         r.x + r.w / 2, r.y + 244, '13px sans-serif', '#c9b98a', 'center');
    // skill box
    rr(ctx, r.x + 18, r.y + 264, r.w - 36, 72, 8);
    ctx.fillStyle = 'rgba(47,93,138,0.25)'; ctx.fill();
    ctx.lineWidth = 1.5; ctx.strokeStyle = '#2f5d8a'; ctx.stroke();
    text(ctx, 'SKILL — ' + h.skill.name, r.x + r.w / 2, r.y + 284,
         'bold 14px sans-serif', '#9ec8f0', 'center');
    text(ctx, h.skill.desc, r.x + r.w / 2, r.y + 306,
         '13px sans-serif', '#d8e8f8', 'center');
    text(ctx, 'Cooldown ' + h.skill.cd + 's  •  Press H', r.x + r.w / 2, r.y + 324,
         '12px sans-serif', '#8aa8c8', 'center');
    text(ctx, '— tap this card to choose —', r.x + r.w / 2, r.y + 358,
         '13px sans-serif', '#ffd54a', 'center');
    ctx.restore();
  }
}

function drawDecreeScreen(ctx, state, L) {
  drawScreenBase(ctx, '', '');
  text(ctx, 'ROYAL DECREE', LOGICAL_W / 2, 84, 'bold 44px Georgia, serif', '#e8c15a', 'center');
  text(ctx, 'The wave is repelled. The crown grants one boon — choose wisely, it lasts the whole run.',
       LOGICAL_W / 2, 116, '15px sans-serif', '#c9b98a', 'center');
  for (let i = 0; i < L.screen.cards.length; i++) {
    const card = L.screen.cards[i];
    const info = DECREE_INFO[card.id];
    if (!info) continue;
    const r = card.rect;
    ctx.save();
    rr(ctx, r.x, r.y, r.w, r.h, 12);
    ctx.fillStyle = '#e8dcc0'; ctx.fill();
    ctx.lineWidth = 3; ctx.strokeStyle = '#8a6d2f'; ctx.stroke();
    // seal
    ctx.beginPath(); ctx.arc(r.x + r.w / 2, r.y + 62, 30, 0, Math.PI * 2);
    ctx.fillStyle = '#a93226'; ctx.fill();
    ctx.lineWidth = 2; ctx.strokeStyle = '#7a1f16'; ctx.stroke();
    text(ctx, '✦', r.x + r.w / 2, r.y + 63, 'bold 26px sans-serif', '#ffd54a', 'center');
    text(ctx, info.name, r.x + r.w / 2, r.y + 128, 'bold 22px Georgia, serif', '#2a2118', 'center');
    // wrapped description (manual, short lines)
    const words = info.desc.split(' ');
    let line = '', ly = r.y + 168;
    ctx.font = '15px sans-serif';
    for (let w = 0; w < words.length; w++) {
      const test = line ? line + ' ' + words[w] : words[w];
      if (ctx.measureText(test).width > r.w - 40 && line) {
        text(ctx, line, r.x + r.w / 2, ly, '15px sans-serif', '#4a3f30', 'center');
        line = words[w]; ly += 22;
      } else line = test;
    }
    if (line) text(ctx, line, r.x + r.w / 2, ly, '15px sans-serif', '#4a3f30', 'center');
    text(ctx, '— tap to decree —', r.x + r.w / 2, r.y + r.h - 28,
         '13px sans-serif', '#a93226', 'center');
    ctx.restore();
  }
}

function drawStatsRows(ctx, rows, cx, y0) {
  let y = y0;
  for (let i = 0; i < rows.length; i++) {
    text(ctx, rows[i][0], cx - 130, y, '15px sans-serif', '#c9b98a');
    text(ctx, rows[i][1], cx + 130, y, 'bold 16px sans-serif', '#f3e9d2', 'right');
    y += 30;
  }
  return y;
}

function drawVictory(ctx, state, L) {
  drawScreenBase(ctx, '', '');
  text(ctx, 'VICTORY!', LOGICAL_W / 2, 130, 'bold 64px Georgia, serif', '#ffd54a', 'center');
  text(ctx, 'All twenty waves are broken against the walls. The bastion holds.',
       LOGICAL_W / 2, 176, '17px sans-serif', '#f3e9d2', 'center');
  text(ctx, 'The rebels will regroup — and the endless night is yours to face, if you dare.',
       LOGICAL_W / 2, 202, '15px sans-serif', '#c9b98a', 'center');
  drawStatsRows(ctx, [
    ['Waves cleared', '20'],
    ['Enemies slain', String(state.kills)],
    ['Final score', String(state.score)],
    ['Lives remaining', String(state.lives)],
  ], LOGICAL_W / 2, 258);
  drawButton(ctx, L.screen.endless, '⚔  CONTINUE ENDLESS',
    {bg: '#c99327', border: '#ffe9a8', color: '#1a1206', font: 'bold 17px Georgia, serif'});
  drawButton(ctx, L.screen.restart, 'RESTART',
    {font: 'bold 15px sans-serif'});
  drawButton(ctx, L.screen.title, 'TITLE',
    {font: 'bold 15px sans-serif'});
}

function drawGameOver(ctx, state, L) {
  drawScreenBase(ctx, '', '');
  text(ctx, 'THE KEEP HAS FALLEN', LOGICAL_W / 2, 130, 'bold 52px Georgia, serif', '#e74c3c', 'center');
  text(ctx, 'The rebels pour through the broken gate. The last bastion is silent.',
       LOGICAL_W / 2, 176, '17px sans-serif', '#f3e9d2', 'center');
  drawStatsRows(ctx, [
    ['Wave reached', String(Math.max(1, state.wave)) + ' / 20'],
    ['Enemies slain', String(state.kills)],
    ['Final score', String(state.score)],
    ['Best wave', String(state.best ? state.best.wave : 0)],
    ['Best score', String(state.best ? state.best.score : 0)],
  ], LOGICAL_W / 2, 232);
  drawButton(ctx, L.screen.restart, '↻  TRY AGAIN',
    {bg: '#c99327', border: '#ffe9a8', color: '#1a1206', font: 'bold 17px sans-serif'});
  drawButton(ctx, L.screen.title, 'TITLE',
    {font: 'bold 15px sans-serif'});
}

// ---------------------------------------------------------------------------
// Public API

export function drawHUD(ctx, state) {
  if (!ctx || !state) return;
  const L = computeLayout(state);
  ctx.save();
  if (state.phase === 'title') { drawTitle(ctx, state, L); ctx.restore(); return; }
  if (state.phase === 'hero') { drawHeroSelect(ctx, state, L); ctx.restore(); return; }
  if (state.phase === 'decree') { drawDecreeScreen(ctx, state, L); ctx.restore(); return; }
  if (state.phase === 'victory') { drawVictory(ctx, state, L); ctx.restore(); return; }
  if (state.phase === 'gameover') { drawGameOver(ctx, state, L); ctx.restore(); return; }

  // in-game phases: build / wave
  drawTopBar(ctx, state, L);
  drawRangeCircle(ctx, L);
  drawBuildMenu(ctx, state, L);
  drawTowerPanel(ctx, state, L);
  drawHeroPanel(ctx, state, L);
  drawDecrees(ctx, L);
  drawAlert(ctx, L);
  drawTutorial(ctx, L);
  drawPauseOverlay(ctx, state);
  ctx.restore();
}

export function hudHit(state, x, y) {
  if (!state || typeof x !== 'number' || typeof y !== 'number') return null;
  const L = computeLayout(state);

  // ---- full screens intercept everything ----
  if (L.screen) {
    const s = L.screen;
    if (s.kind === 'title') {
      if (inRect(x, y, s.start)) return {action: 'hero'}; // START -> hero select (no id; main.js sets phase='hero')
      return null;
    }
    if (s.kind === 'hero') {
      for (let i = 0; i < s.cards.length; i++) {
        if (inRect(x, y, s.cards[i].rect)) return {action: 'hero', id: s.cards[i].id};
      }
      return null;
    }
    if (s.kind === 'decree') {
      for (let i = 0; i < s.cards.length; i++) {
        if (inRect(x, y, s.cards[i].rect)) return {action: 'decree', id: s.cards[i].id};
      }
      return null;
    }
    if (s.kind === 'victory') {
      if (inRect(x, y, s.endless)) return {action: 'continueEndless'};
      if (inRect(x, y, s.restart)) return {action: 'restart'};
      if (inRect(x, y, s.title)) return {action: 'title'};
      return null;
    }
    if (s.kind === 'gameover') {
      if (inRect(x, y, s.restart)) return {action: 'restart'};
      if (inRect(x, y, s.title)) return {action: 'title'};
      return null;
    }
    return null;
  }

  // ---- in-game: top bar ----
  if (state.phase === 'build' && inRect(x, y, L.top.start)) return {action: 'startWave'};
  if (inRect(x, y, L.top.speed)) return {action: 'speed'};
  if (inRect(x, y, L.top.pause)) return {action: 'pause'};
  if (inRect(x, y, L.top.mute)) return {action: 'mute'};
  if (inRect(x, y, L.top.quality)) return {action: 'quality'};

  // paused: top-bar buttons still work, world does not
  if (state.paused) return null;

  // ---- hero skill button ----
  if (L.heroPanel && inRect(x, y, L.heroPanel.skill)) return {action: 'skill'};

  // ---- build menu ----
  if (L.buildMenu) {
    if (inRect(x, y, L.buildMenu.close)) return {action: 'close'};
    for (let i = 0; i < L.buildMenu.cards.length; i++) {
      const c = L.buildMenu.cards[i];
      if (inRect(x, y, c.rect)) {
        lastBuiltType = c.type;
        return {action: 'build', type: c.type, plotId: state.selected.id};
      }
    }
    // taps inside the panel but not on a card do nothing
    if (inRect(x, y, L.buildMenu.rect)) return null;
  }

  // ---- tower panel ----
  if (L.towerPanel) {
    if (inRect(x, y, L.towerPanel.close)) return {action: 'close'};
    if (L.towerPanel.upgrade && inRect(x, y, L.towerPanel.upgrade)) {
      return {action: 'upgrade', id: state.selected.id};
    }
    if (inRect(x, y, L.towerPanel.sell)) return {action: 'sell', id: state.selected.id};
    if (inRect(x, y, L.towerPanel.rect)) return null;
  }

  // ---- world: tower first, then plot, then empty space closes panels ----
  const towers = state.towers || [];
  let bestTower = null, bestD = 36 * 36;
  for (let i = 0; i < towers.length; i++) {
    const dx = x - towers[i].x, dy = y - towers[i].y;
    const d = dx * dx + dy * dy;
    if (d < bestD) { bestD = d; bestTower = towers[i]; }
  }
  if (bestTower) return {action: 'tower', id: bestTower.id};

  const plot = plotAt(x, y);
  if (plot) return {action: 'plot', id: plot.id};

  if (state.selected) return {action: 'close'};
  return null;
}
