// IRONHOLD renderer — draws the whole world (map, towers, enemies, hero,
// projectiles, beams, particles, floaters). NO HUD panels/screens (hud.js).
// Respects state.quality: 'low' skips particles and shadows.
//
// STYLE: Minecraft x sandbox — blocky voxel for ALL units (same spirit as
// DEADZONE v2's characters). Square heads/bodies/limbs, square eyes, boxy
// weapons, stepped-square roofs. Visuals ONLY: radii, ranges, speeds and
// all gameplay are untouched; figures keep the same footprint as before.
import { TOWERS, ENEMIES, HEROES, TILE, COLS, ROWS, LOGICAL_W, LOGICAL_H } from './config.js';
import { PATH, KEEP, PLOTS, DECOR, HERO_POST, pathPointAt } from './world.js';
import { mulberry32 } from './random.js';

// Total path length (px), derived from PATH so it always matches world.js.
const PATH_TOTAL = PATH.slice(0, -1).reduce(
  (sum, p, i) => sum + Math.hypot(PATH[i + 1].x - p.x, PATH[i + 1].y - p.y),
  0,
);

// ---- deterministic grass tufts (fixed seed, drawn under the path) ----
const _rng = mulberry32(20261119);
const TUFTS = [];
for (let i = 0; i < 160; i++) {
  TUFTS.push({ x: _rng() * LOGICAL_W, y: _rng() * LOGICAL_H, r: 1.5 + _rng() * 2.5, dark: _rng() < 0.5 });
}

const PROJECTILE_COLORS = {
  arrow: '#d9f99d',
  cannon: '#3a3a3a',
  frost: '#bfe3ff',
  bullet: '#fde68a',
  tesla: '#f4d35e',
  heroArrow: '#d9f99d',
  heroSword: '#e2e8f0',
};

function clamp(v, a, b) {
  return v < a ? a : v > b ? b : v;
}

function circle(ctx, x, y, r) {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
}

function shadow(ctx, x, y, rx, ry, alpha) {
  ctx.fillStyle = 'rgba(0,0,0,' + alpha + ')';
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
  ctx.fill();
}

// Square (voxel) shadow under blocky units.
function blockShadow(ctx, x, y, w, h, alpha) {
  ctx.fillStyle = 'rgba(0,0,0,' + alpha + ')';
  ctx.fillRect(x - w / 2, y, w, h);
}

function nearestEnemy(state, x, y, range) {
  let best = null;
  let bestD = range * range;
  for (const e of state.enemies) {
    const dx = e.x - x;
    const dy = e.y - y;
    const d2 = dx * dx + dy * dy;
    if (d2 < bestD) {
      bestD = d2;
      best = e;
    }
  }
  return best;
}

function effectiveRange(state, tower) {
  const base = TOWERS[tower.type].range;
  let r = base * (1 + 0.1 * (tower.level - 1));
  if (state.decrees && state.decrees.includes('range10')) r *= 1.1;
  return r;
}

// ---------------------------------------------------------------- map --
function drawMap(ctx, state) {
  // Grass base with subtle checker.
  for (let ty = 0; ty < ROWS; ty++) {
    for (let tx = 0; tx < COLS; tx++) {
      ctx.fillStyle = (tx + ty) % 2 === 0 ? '#6a9e4f' : '#649548';
      ctx.fillRect(tx * TILE, ty * TILE, TILE, TILE);
    }
  }
  // Grass tufts.
  ctx.fillStyle = '#557d3d';
  for (const t of TUFTS) {
    if (t.dark) {
      ctx.fillRect(t.x, t.y, t.r, 1.5);
    } else {
      ctx.fillStyle = '#7fb069';
      ctx.fillRect(t.x, t.y, t.r, 1.5);
      ctx.fillStyle = '#557d3d';
    }
  }

  // Path: wide dirt road with darker edge, rounded joins.
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(PATH[0].x, PATH[0].y);
  for (let i = 1; i < PATH.length; i++) ctx.lineTo(PATH[i].x, PATH[i].y);
  ctx.strokeStyle = '#8a6a3e';
  ctx.lineWidth = 60;
  ctx.stroke();
  ctx.strokeStyle = '#b08954';
  ctx.lineWidth = 50;
  ctx.stroke();
  // Cobble dashes down the middle.
  ctx.strokeStyle = 'rgba(120,90,50,0.55)';
  ctx.lineWidth = 3;
  ctx.setLineDash([8, 22]);
  ctx.beginPath();
  ctx.moveTo(PATH[0].x, PATH[0].y);
  for (let i = 1; i < PATH.length; i++) ctx.lineTo(PATH[i].x, PATH[i].y);
  ctx.stroke();
  ctx.setLineDash([]);

  // Direction arrows along the path.
  ctx.fillStyle = 'rgba(255,255,255,0.4)';
  for (let d = 90; d < PATH_TOTAL - 20; d += 130) {
    const p = pathPointAt(d);
    const pA = pathPointAt(Math.max(0, d - 2));
    const pB = pathPointAt(Math.min(PATH_TOTAL, d + 2));
    const ang = Math.atan2(pB.y - pA.y, pB.x - pA.x);
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(ang);
    ctx.beginPath();
    ctx.moveTo(10, 0);
    ctx.lineTo(-6, -8);
    ctx.lineTo(-2, 0);
    ctx.lineTo(-6, 8);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  // West gate (spawn) at the path entrance.
  ctx.fillStyle = '#3f3f46';
  ctx.fillRect(0, 96 - 34, 14, 68);
  ctx.fillStyle = '#57534e';
  ctx.fillRect(0, 96 - 40, 20, 8);
  ctx.fillRect(0, 96 + 32, 20, 8);
  ctx.fillStyle = '#1c1917';
  ctx.fillRect(4, 96 - 26, 8, 52);
  ctx.fillStyle = '#f4d35e';
  ctx.font = 'bold 11px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('GATE', 30, 60);

  // Build plots: square stone slabs (voxel style).
  for (const plot of PLOTS) {
    const occupied = state.towers.some((t) => t.plotId === plot.id);
    const isSel = state.selected && state.selected.kind === 'plot' && state.selected.id === plot.id;
    ctx.fillStyle = occupied ? '#7c7f82' : '#9aa0a6';
    ctx.fillRect(plot.x - 22, plot.y - 22, 44, 44);
    ctx.fillStyle = occupied ? '#8d9094' : '#b0b6bc';
    ctx.fillRect(plot.x - 18, plot.y - 18, 36, 36);
    ctx.strokeStyle = isSel ? '#f4d35e' : 'rgba(0,0,0,0.35)';
    ctx.lineWidth = isSel ? 3 : 2;
    ctx.strokeRect(plot.x - 22, plot.y - 22, 44, 44);
    if (!occupied) {
      // Hammer icon hint on empty plots.
      ctx.strokeStyle = 'rgba(255,255,255,0.75)';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(plot.x - 6, plot.y + 7);
      ctx.lineTo(plot.x + 2, plot.y - 5);
      ctx.moveTo(plot.x - 2, plot.y - 9);
      ctx.lineTo(plot.x + 8, plot.y - 3);
      ctx.stroke();
      if (isSel) {
        ctx.fillStyle = 'rgba(244,211,94,0.25)';
        ctx.fillRect(plot.x - 28, plot.y - 28, 56, 56);
      }
    }
  }

  // Decor: trees, rocks, houses.
  for (const d of DECOR) {
    if (d.kind === 'tree') {
      shadow(ctx, d.x, d.y + 10, 14, 5, 0.25);
      ctx.fillStyle = '#6b4f2a';
      ctx.fillRect(d.x - 3, d.y, 6, 12);
      ctx.fillStyle = '#2d6a2e';
      circle(ctx, d.x, d.y - 4, 15);
      ctx.fillStyle = '#3a8a3c';
      circle(ctx, d.x - 5, d.y - 10, 9);
      circle(ctx, d.x + 6, d.y - 9, 8);
    } else if (d.kind === 'rock') {
      ctx.fillStyle = '#8d8d8d';
      ctx.beginPath();
      ctx.moveTo(d.x - 12, d.y + 8);
      ctx.lineTo(d.x - 6, d.y - 8);
      ctx.lineTo(d.x + 6, d.y - 10);
      ctx.lineTo(d.x + 13, d.y + 6);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#a8a8a8';
      ctx.beginPath();
      ctx.moveTo(d.x - 6, d.y - 8);
      ctx.lineTo(d.x + 6, d.y - 10);
      ctx.lineTo(d.x + 2, d.y - 2);
      ctx.closePath();
      ctx.fill();
    } else if (d.kind === 'house') {
      shadow(ctx, d.x, d.y + 12, 18, 5, 0.25);
      ctx.fillStyle = '#d6c9a8';
      ctx.fillRect(d.x - 16, d.y - 6, 32, 20);
      ctx.fillStyle = '#a4442e';
      ctx.beginPath();
      ctx.moveTo(d.x - 19, d.y - 6);
      ctx.lineTo(d.x, d.y - 20);
      ctx.lineTo(d.x + 19, d.y - 6);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#f4d35e';
      ctx.fillRect(d.x - 9, d.y + 2, 6, 6);
      ctx.fillRect(d.x + 4, d.y + 2, 6, 6);
      ctx.fillStyle = '#6b4f2a';
      ctx.fillRect(d.x - 3, d.y + 6, 6, 8);
    }
  }

  // Hero post marker (small banner) — always visible so the player knows the spot.
  ctx.fillStyle = '#e2e8f0';
  ctx.fillRect(HERO_POST.x - 1, HERO_POST.y - 26, 2, 26);
  ctx.fillStyle = '#4a7fb5';
  ctx.beginPath();
  ctx.moveTo(HERO_POST.x + 1, HERO_POST.y - 26);
  ctx.lineTo(HERO_POST.x + 14, HERO_POST.y - 21);
  ctx.lineTo(HERO_POST.x + 1, HERO_POST.y - 16);
  ctx.closePath();
  ctx.fill();

  // The Keep — the last bastion, east edge.
  shadow(ctx, KEEP.x, KEEP.y + 34, 46, 10, 0.3);
  ctx.fillStyle = '#8d99ae';
  ctx.fillRect(KEEP.x - 34, KEEP.y - 30, 68, 64);
  ctx.fillStyle = '#6c7a8d';
  // Battlements.
  for (let i = 0; i < 4; i++) {
    ctx.fillRect(KEEP.x - 34 + i * 18, KEEP.y - 40, 12, 12);
  }
  // Central tower.
  ctx.fillStyle = '#7c8a9e';
  ctx.fillRect(KEEP.x - 14, KEEP.y - 58, 28, 30);
  ctx.fillStyle = '#5d6b7d';
  for (let i = 0; i < 2; i++) ctx.fillRect(KEEP.x - 14 + i * 16, KEEP.y - 66, 10, 10);
  // Flag.
  ctx.fillStyle = '#3f3f46';
  ctx.fillRect(KEEP.x - 1, KEEP.y - 84, 2, 20);
  ctx.fillStyle = '#e63946';
  ctx.beginPath();
  ctx.moveTo(KEEP.x + 1, KEEP.y - 84);
  ctx.lineTo(KEEP.x + 18, KEEP.y - 79);
  ctx.lineTo(KEEP.x + 1, KEEP.y - 74);
  ctx.closePath();
  ctx.fill();
  // Door + windows.
  ctx.fillStyle = '#3f2d20';
  ctx.fillRect(KEEP.x - 8, KEEP.y + 12, 16, 22);
  ctx.fillStyle = '#f4d35e';
  ctx.fillRect(KEEP.x - 24, KEEP.y - 16, 8, 10);
  ctx.fillRect(KEEP.x + 16, KEEP.y - 16, 8, 10);
  ctx.fillStyle = '#e2e8f0';
  ctx.font = 'bold 11px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('KEEP', KEEP.x, KEEP.y + 48);
}

// ------------------------------------------------------------- towers --
// Blocky voxel towers: square brick/stone base, wood details, stepped
// square-cone roof. Each level adds block detail (battlements, then roof).
// Footprint is unchanged (44px base, same as the old round base).
const TOWER_MID = {
  archer: { color: '#8b5a2b', dark: '#6b4423' },
  cannon: { color: '#3f3f46', dark: '#2b2b31' },
  frost: { color: '#5aa9e6', dark: '#3d7fb5' },
  sniper: { color: '#7c5a3a', dark: '#5d422a' },
  tesla: { color: '#b45309', dark: '#8a3d06' },
};

function drawTower(ctx, state, t) {
  const cfg = TOWERS[t.type];
  const low = state.quality === 'low';
  const range = effectiveRange(state, t);
  const target = nearestEnemy(state, t.x, t.y, range);
  const aim = target ? Math.atan2(target.y - t.y, target.x - t.x) : -Math.PI / 2;
  const isSel = state.selected && state.selected.kind === 'tower' && state.selected.id === t.id;
  const mid = TOWER_MID[t.type];

  if (!low) blockShadow(ctx, t.x, t.y + 18, 44, 7, 0.3);

  // Selected: range circle + ring.
  if (isSel) {
    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    circle(ctx, t.x, t.y, range);
    ctx.strokeStyle = 'rgba(244,211,94,0.8)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(t.x, t.y, range, 0, Math.PI * 2);
    ctx.stroke();
  }

  // Square brick/stone base (44px) with brick seams.
  ctx.fillStyle = '#6c7a8d';
  ctx.fillRect(t.x - 22, t.y - 22, 44, 44);
  ctx.fillStyle = '#8d99ae';
  ctx.fillRect(t.x - 19, t.y - 19, 38, 38);
  ctx.strokeStyle = 'rgba(0,0,0,0.25)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(t.x - 19, t.y - 6);
  ctx.lineTo(t.x + 19, t.y - 6);
  ctx.moveTo(t.x - 19, t.y + 7);
  ctx.lineTo(t.x + 19, t.y + 7);
  ctx.moveTo(t.x - 6, t.y - 19);
  ctx.lineTo(t.x - 6, t.y - 6);
  ctx.moveTo(t.x + 7, t.y - 6);
  ctx.lineTo(t.x + 7, t.y + 7);
  ctx.moveTo(t.x - 6, t.y + 7);
  ctx.lineTo(t.x - 6, t.y + 19);
  ctx.stroke();

  // Level 2+: corner battlement blocks.
  if (t.level >= 2) {
    ctx.fillStyle = '#aab4c0';
    const c = 19;
    const s = 7;
    ctx.fillRect(t.x - c - s / 2, t.y - c - s / 2, s, s);
    ctx.fillRect(t.x + c - s / 2, t.y - c - s / 2, s, s);
    ctx.fillRect(t.x - c - s / 2, t.y + c - s / 2, s, s);
    ctx.fillRect(t.x + c - s / 2, t.y + c - s / 2, s, s);
  }

  // Mid block (grows slightly with level) — wood/stone/ice per type.
  const midS = 22 + t.level * 2;
  ctx.fillStyle = mid.color;
  ctx.fillRect(t.x - midS / 2, t.y - midS / 2, midS, midS);
  ctx.fillStyle = mid.dark;
  ctx.fillRect(t.x - midS / 2, t.y + midS / 2 - 4, midS, 4);

  // Level 3: square cone roof — stepped shrinking squares + gold cap.
  if (t.level >= 3) {
    ctx.fillStyle = mid.dark;
    ctx.fillRect(t.x - 9, t.y - 9, 18, 18);
    ctx.fillStyle = cfg.color;
    ctx.fillRect(t.x - 6, t.y - 6, 12, 12);
    ctx.fillStyle = '#f4d35e';
    ctx.fillRect(t.x - 2, t.y - 2, 4, 4);
  }

  // Type detail on top (weapons poke out above the roof).
  if (t.type === 'archer') {
    // Green cap block + boxy bow toward the aim.
    ctx.fillStyle = cfg.color;
    ctx.fillRect(t.x - 7, t.y - 7, 14, 14);
    ctx.save();
    ctx.translate(t.x, t.y);
    ctx.rotate(aim);
    ctx.fillStyle = '#5b3a1e';
    ctx.fillRect(6, -7, 3, 7);
    ctx.fillRect(6, 0, 3, 7);
    ctx.fillStyle = '#e2e8f0';
    ctx.fillRect(12, -2, 6, 4);
    ctx.restore();
  } else if (t.type === 'cannon') {
    // Boxy barrel toward the aim + square muzzle.
    ctx.save();
    ctx.translate(t.x, t.y);
    ctx.rotate(aim);
    ctx.fillStyle = '#1f2937';
    ctx.fillRect(0, -4, 20, 8);
    ctx.fillStyle = '#57534e';
    ctx.fillRect(16, -5, 7, 10);
    ctx.restore();
    ctx.fillStyle = '#f4d35e';
    ctx.fillRect(t.x - 2, t.y - 2, 4, 4);
  } else if (t.type === 'frost') {
    // Ice crystal block: pale inner square + sparkle squares.
    ctx.fillStyle = '#bfe3ff';
    ctx.fillRect(t.x - 6, t.y - 6, 12, 12);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(t.x - 2, t.y - 2, 4, 4);
    ctx.fillRect(t.x + 8, t.y - 10, 3, 3);
    ctx.fillRect(t.x - 11, t.y + 7, 3, 3);
  } else if (t.type === 'sniper') {
    // Long boxy barrel toward the aim + square crosshair marks.
    ctx.save();
    ctx.translate(t.x, t.y);
    ctx.rotate(aim);
    ctx.fillStyle = '#4a3520';
    ctx.fillRect(0, -2, 26, 4);
    ctx.fillStyle = '#2b1d0f';
    ctx.fillRect(22, -3, 6, 6);
    ctx.restore();
    ctx.fillStyle = '#fde68a';
    ctx.fillRect(t.x - 1, t.y - 10, 2, 4);
    ctx.fillRect(t.x - 1, t.y + 6, 2, 4);
    ctx.fillRect(t.x - 10, t.y - 1, 4, 2);
    ctx.fillRect(t.x + 6, t.y - 1, 4, 2);
  } else if (t.type === 'tesla') {
    // Coil bands + flickering spark squares.
    ctx.fillStyle = cfg.color;
    ctx.fillRect(t.x - midS / 2, t.y - 3, midS, 3);
    ctx.fillRect(t.x - midS / 2, t.y + 4, midS, 3);
    ctx.fillStyle = '#fff7cc';
    ctx.fillRect(t.x - 2, t.y - 2, 4, 4);
    if (Math.sin(state.time * 9 + t.x) > 0.2) {
      ctx.fillStyle = '#fef08a';
      ctx.fillRect(t.x - 14, t.y - 14, 4, 4);
      ctx.fillRect(t.x + 10, t.y + 10, 4, 4);
    }
  }

  // Level pips (gold squares under the tower).
  ctx.fillStyle = '#f4d35e';
  for (let i = 0; i < t.level; i++) {
    ctx.fillRect(t.x - (t.level - 1) * 5 + i * 10 - 2, t.y + 24, 4, 4);
  }
  // Cooldown flash: brief white square outline right after firing.
  if (t.cd !== undefined && t.cd > 0) {
    const rate = cfg.rate * (1 + 0.1 * (t.level - 1));
    const frac = 1 - t.cd * rate;
    if (frac > 0.85) {
      ctx.strokeStyle = 'rgba(255,255,255,' + (frac - 0.85) * 4 + ')';
      ctx.lineWidth = 2;
      ctx.strokeRect(t.x - 23, t.y - 23, 46, 46);
    }
  }
}

// ------------------------------------------------------------ enemies --
// Shared blocky-voxel figure: square head, rectangular torso, blocky
// arms/legs. `u` is the unit scale (enemy r) — footprint unchanged.
// spec: {legs, torso, arms, head, eye ('normal'|'angry'|'slit'|'none'),
//        eyeColor, wide, helm ('none'|'square'|'crown'|'horns'),
//        cape, staff, cross, splitHead, club}
function blockyFigure(ctx, x, y, u, spec, swing) {
  const torsoW = (spec.wide ? 1.35 : 1.15) * u;
  const legW = 0.3 * u;
  const legH = 0.45 * u;
  const armW = 0.26 * u;
  const armH = 0.68 * u;
  const headS = 0.9 * u;

  // Cape behind the body (warlord).
  if (spec.cape) {
    ctx.fillStyle = spec.cape;
    ctx.fillRect(x - 0.85 * u, y - 0.9 * u, 1.7 * u, 2.2 * u);
  }

  // Legs (walk swing: one up, one down).
  ctx.fillStyle = spec.legs;
  ctx.fillRect(x - 0.42 * u, y + 0.72 * u + swing, legW, legH);
  ctx.fillRect(x + 0.12 * u, y + 0.72 * u - swing, legW, legH);

  // Arms (opposite swing).
  ctx.fillStyle = spec.arms;
  ctx.fillRect(x - torsoW / 2 - armW, y - 0.04 * u - swing * 0.6, armW, armH);
  ctx.fillRect(x + torsoW / 2, y - 0.04 * u + swing * 0.6, armW, armH);

  // Torso.
  ctx.fillStyle = spec.torso;
  ctx.fillRect(x - torsoW / 2, y - 0.1 * u, torsoW, 0.85 * u);
  // Belly shade line.
  ctx.fillStyle = 'rgba(0,0,0,0.18)';
  ctx.fillRect(x - torsoW / 2, y + 0.55 * u, torsoW, 0.2 * u);

  // Healer cross on the torso.
  if (spec.cross) {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(x - 0.07 * u, y + 0.05 * u, 0.14 * u, 0.5 * u);
    ctx.fillRect(x - 0.25 * u, y + 0.16 * u, 0.5 * u, 0.14 * u);
  }

  // Splitter crack down the middle.
  if (spec.splitHead) {
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.fillRect(x - 0.03 * u, y - 0.1 * u, 0.06 * u, 0.85 * u);
  }

  // Head (splitter: two side-by-side head blocks).
  if (spec.splitHead) {
    ctx.fillStyle = spec.head;
    ctx.fillRect(x - 0.5 * u, y - 1.0 * u, 0.48 * u, headS);
    ctx.fillRect(x + 0.02 * u, y - 1.0 * u, 0.48 * u, headS);
  } else {
    ctx.fillStyle = spec.head;
    ctx.fillRect(x - headS / 2, y - 1.0 * u, headS, headS);
  }

  // Square helm (armored): darker cap + eye slit.
  if (spec.helm === 'square') {
    ctx.fillStyle = '#4a5568';
    ctx.fillRect(x - headS / 2, y - 1.0 * u, headS, 0.55 * u);
    ctx.fillStyle = '#1a1a1a';
    ctx.fillRect(x - 0.3 * u, y - 0.72 * u, 0.6 * u, 0.1 * u);
  }
  // Gold square crown/helm (bosses).
  if (spec.helm === 'crown') {
    ctx.fillStyle = '#f4d35e';
    ctx.fillRect(x - headS / 2, y - 1.18 * u, headS, 0.22 * u);
    ctx.fillRect(x - headS / 2, y - 1.42 * u, 0.2 * u, 0.24 * u);
    ctx.fillRect(x - 0.1 * u, y - 1.48 * u, 0.2 * u, 0.3 * u);
    ctx.fillRect(x + headS / 2 - 0.2 * u, y - 1.42 * u, 0.2 * u, 0.24 * u);
  }
  // Horns (ogre): pale squares at the head corners.
  if (spec.helm === 'horns') {
    ctx.fillStyle = '#e2e8f0';
    ctx.fillRect(x - headS / 2 - 0.18 * u, y - 1.28 * u, 0.22 * u, 0.34 * u);
    ctx.fillRect(x + headS / 2 - 0.04 * u, y - 1.28 * u, 0.22 * u, 0.34 * u);
  }

  // Square eyes (white + dark pupil), unless slit/none.
  if (spec.eye === 'normal' || spec.eye === 'angry') {
    const eyeC = spec.eyeColor || '#ffffff';
    const pupC = spec.eye === 'angry' ? '#fde68a' : '#1a1a1a';
    const ey = y - 0.62 * u;
    const es = 0.22 * u;
    const ps = 0.11 * u;
    ctx.fillStyle = eyeC;
    ctx.fillRect(x - 0.32 * u, ey, es, es);
    ctx.fillRect(x + 0.1 * u, ey, es, es);
    ctx.fillStyle = pupC;
    ctx.fillRect(x - 0.32 * u + 0.05 * u, ey + 0.05 * u, ps, ps);
    ctx.fillRect(x + 0.1 * u + 0.05 * u, ey + 0.05 * u, ps, ps);
    if (spec.eye === 'angry') {
      // Angry brow blocks.
      ctx.fillStyle = spec.head;
      ctx.fillRect(x - 0.34 * u, ey - 0.08 * u, 0.26 * u, 0.08 * u);
      ctx.fillRect(x + 0.08 * u, ey - 0.08 * u, 0.26 * u, 0.08 * u);
    }
  }

  // Healer staff: brown block rod + green crystal top.
  if (spec.staff) {
    ctx.fillStyle = '#5b3a1e';
    ctx.fillRect(x + torsoW / 2 + 0.1 * u, y - 0.7 * u, 0.16 * u, 1.8 * u);
    ctx.fillStyle = '#4ade80';
    ctx.fillRect(x + torsoW / 2 - 0.02 * u, y - 0.95 * u, 0.4 * u, 0.4 * u);
  }
  // Ogre club: thick brown block at the side.
  if (spec.club) {
    ctx.fillStyle = '#5b3a1e';
    ctx.fillRect(x + torsoW / 2 + 0.08 * u, y + 0.1 * u, 0.3 * u, 1.1 * u);
    ctx.fillStyle = '#7c5a3a';
    ctx.fillRect(x + torsoW / 2 + 0.02 * u, y + 0.05 * u, 0.42 * u, 0.3 * u);
  }
}

const ENEMY_SPECS = {
  grunt: { legs: '#7b1f16', torso: '#c0392b', arms: '#a93226', head: '#e74c3c', eye: 'normal' },
  runner: { legs: '#b95a12', torso: '#e67e22', arms: '#ca6f1e', head: '#f39c12', eye: 'normal', lean: true },
  armored: { legs: '#4a5568', torso: '#7f8c8d', arms: '#6b7a7b', head: '#95a5a6', eye: 'none', helm: 'square', wide: true },
  healer: { legs: '#1e8449', torso: '#27ae60', arms: '#229954', head: '#58d68d', eye: 'normal', staff: true, cross: true },
  splitter: { legs: '#6c3483', torso: '#8e44ad', arms: '#7d3c98', head: '#a569bd', eye: 'normal', splitHead: true },
  mini: { legs: '#6c3483', torso: '#9b59b6', arms: '#8e44ad', head: '#af7ac5', eye: 'normal', splitHead: true },
  ogre: { legs: '#4a2c00', torso: '#6e2c00', arms: '#5d2400', head: '#8a4b08', eye: 'angry', eyeColor: '#fde68a', helm: 'horns', wide: true, club: true },
  warlord: { legs: '#0f0f1e', torso: '#1a1a2e', arms: '#141428', head: '#2e2e4a', eye: 'angry', eyeColor: '#ef4444', helm: 'crown', wide: true, cape: '#3b0764' },
};

function drawEnemy(ctx, state, e) {
  const cfg = ENEMIES[e.type] || ENEMIES.grunt;
  const spec = ENEMY_SPECS[e.type] || ENEMY_SPECS.grunt;
  const low = state.quality === 'low';
  const r = e.r || cfg.r;
  const u = r;
  const slowed = e.slowUntil && e.slowUntil > state.time;
  const swing = Math.sin(state.time * 9 + e.id * 1.7) * 0.1 * u;
  // Facing: toward the next waypoint (used for the runner lean).
  const next = PATH[Math.min(e.wp + 1, PATH.length - 1)] || KEEP;
  const ang = Math.atan2(next.y - e.y, next.x - e.x);

  if (!low) blockShadow(ctx, e.x, e.y + 1.15 * u, 1.6 * u, 0.3 * u, 0.3);

  ctx.save();
  ctx.translate(e.x, e.y);
  if (spec.lean) {
    // Runner leans forward into the run.
    const lean = Math.abs(Math.cos(ang)) > 0.5 ? (Math.cos(ang) > 0 ? 0.26 : -0.26) : 0.1;
    ctx.rotate(lean);
    ctx.scale(0.88, 1);
    // Speed lines behind.
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.fillRect(-1.9 * u, -0.4 * u, 0.5 * u, 0.08 * u);
    ctx.fillRect(-1.9 * u, 0.1 * u, 0.4 * u, 0.08 * u);
  }
  blockyFigure(ctx, 0, 0, u, spec, swing);
  ctx.restore();

  // Slow tint: blocky blue overlay.
  if (slowed) {
    ctx.fillStyle = 'rgba(129,184,232,0.4)';
    ctx.fillRect(e.x - u, e.y - 1.1 * u, 2 * u, 2.3 * u);
    ctx.strokeStyle = 'rgba(255,255,255,0.9)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(e.x - 5, e.y - u - 4);
    ctx.lineTo(e.x + 5, e.y - u - 4);
    ctx.moveTo(e.x, e.y - u - 9);
    ctx.lineTo(e.x, e.y - u + 1);
    ctx.stroke();
  }

  // HP bar.
  const pct = clamp(e.hp / e.maxHp, 0, 1);
  const bw = e.boss ? 56 : r * 2;
  const bx = e.x - bw / 2;
  const by = e.y - r - (e.boss ? 14 : 9);
  ctx.fillStyle = 'rgba(0,0,0,0.6)';
  ctx.fillRect(bx - 1, by - 1, bw + 2, 6);
  ctx.fillStyle = pct > 0.5 ? '#4ade80' : pct > 0.25 ? '#facc15' : '#ef4444';
  ctx.fillRect(bx, by, bw * pct, 4);
  if (e.boss) {
    ctx.strokeStyle = '#f4d35e';
    ctx.lineWidth = 1;
    ctx.strokeRect(bx - 1, by - 1, bw + 2, 6);
  }
}

// --------------------------------------------------------------- hero --
// Hero walk-swing state (module-level so it persists across frames).
let heroSwing = 0;
let heroPrev = null;

function drawHero(ctx, state) {
  const hero = state.hero;
  if (!hero) return;
  const cfg = HEROES[hero.id] || HEROES.aldric;
  const low = state.quality === 'low';
  const retreating = hero.retreating;
  const x = retreating ? HERO_POST.x : hero.x;
  const y = retreating ? HERO_POST.y : hero.y;
  const u = 15; // hero block scale

  // Walk swing: advance with distance moved, ease back to 0 when idle.
  if (heroPrev) {
    const moved = Math.hypot(x - heroPrev.x, y - heroPrev.y);
    if (moved > 0.2) heroSwing += moved * 0.12;
    else heroSwing *= 0.92;
  }
  heroPrev = { x, y };
  const swing = Math.sin(heroSwing) * 2.5;

  ctx.save();
  if (retreating) ctx.globalAlpha = 0.45;
  if (!low) blockShadow(ctx, x, y + 1.15 * u, 1.6 * u, 0.3 * u, 0.3);

  // Faint range ring.
  ctx.strokeStyle = 'rgba(255,255,255,0.18)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(x, y, cfg.range + (hero.level - 1) * 8, 0, Math.PI * 2);
  ctx.stroke();

  if (hero.id === 'aldric') {
    // Aldric the Knight — blue/steel blocky figure.
    blockyFigure(ctx, x, y, u, {
      legs: '#334155', torso: '#4a7fb5', arms: '#3d6a99', head: '#e8c39e', eye: 'normal',
    }, swing);
    // Steel helm: silver cap + blue plume block.
    ctx.fillStyle = '#cbd5e1';
    ctx.fillRect(x - 0.45 * u, y - 1.0 * u, 0.9 * u, 0.42 * u);
    ctx.fillStyle = '#4a7fb5';
    ctx.fillRect(x - 0.1 * u, y - 1.25 * u, 0.2 * u, 0.28 * u);
    // Boxy sword (right hand): grey blade, gold guard, brown grip.
    ctx.fillStyle = '#94a3b8';
    ctx.fillRect(x + 0.85 * u, y - 0.7 * u, 0.22 * u, 1.15 * u);
    ctx.fillStyle = '#f4d35e';
    ctx.fillRect(x + 0.72 * u, y + 0.42 * u, 0.48 * u, 0.14 * u);
    ctx.fillStyle = '#5b3a1e';
    ctx.fillRect(x + 0.88 * u, y + 0.56 * u, 0.16 * u, 0.3 * u);
    // Square shield (left arm) with lighter boss.
    ctx.fillStyle = '#6c7a8d';
    ctx.fillRect(x - 1.35 * u, y - 0.2 * u, 0.5 * u, 0.85 * u);
    ctx.fillStyle = '#94a3b8';
    ctx.fillRect(x - 1.22 * u, y + 0.05 * u, 0.24 * u, 0.24 * u);
  } else {
    // Lyra the Ranger — green blocky figure.
    blockyFigure(ctx, x, y, u, {
      legs: '#2d5016', torso: '#7fb069', arms: '#6a9e4f', head: '#e8c39e', eye: 'normal',
    }, swing);
    // Brown hair block on the head.
    ctx.fillStyle = '#6b4423';
    ctx.fillRect(x - 0.45 * u, y - 1.0 * u, 0.9 * u, 0.35 * u);
    ctx.fillRect(x - 0.45 * u, y - 1.0 * u, 0.18 * u, 0.7 * u);
    // Boxy bow (left hand): three brown blocks forming a shallow arc.
    ctx.fillStyle = '#5b3a1e';
    ctx.fillRect(x - 1.15 * u, y - 0.55 * u, 0.16 * u, 0.6 * u);
    ctx.fillRect(x - 1.15 * u, y + 0.05 * u, 0.16 * u, 0.6 * u);
    ctx.fillRect(x - 1.28 * u, y - 0.1 * u, 0.16 * u, 0.25 * u);
    ctx.fillStyle = '#e2e8f0';
    ctx.fillRect(x - 1.32 * u, y - 0.55 * u, 0.1 * u, 1.2 * u);
    // Quiver block on the back with two arrow-tip squares.
    ctx.fillStyle = '#6b4423';
    ctx.fillRect(x + 0.55 * u, y - 0.85 * u, 0.3 * u, 0.7 * u);
    ctx.fillStyle = '#e2e8f0';
    ctx.fillRect(x + 0.58 * u, y - 1.0 * u, 0.1 * u, 0.14 * u);
    ctx.fillRect(x + 0.72 * u, y - 1.0 * u, 0.1 * u, 0.14 * u);
  }

  // Level pips (gold squares).
  ctx.fillStyle = '#f4d35e';
  for (let i = 0; i < hero.level; i++) {
    ctx.fillRect(x - (hero.level - 1) * 4 + i * 8 - 2, y + 19, 4, 4);
  }
  // HP bar.
  const pct = clamp(hero.hp / hero.maxHp, 0, 1);
  ctx.fillStyle = 'rgba(0,0,0,0.6)';
  ctx.fillRect(x - 16, y - 26, 32, 5);
  ctx.fillStyle = pct > 0.5 ? '#4ade80' : pct > 0.25 ? '#facc15' : '#ef4444';
  ctx.fillRect(x - 15, y - 25, 30 * pct, 3);
  ctx.restore();

  if (retreating) {
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.font = 'bold 11px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('RETREAT ' + Math.ceil(hero.retreatT) + 's', x, y - 32);
  }
}

// -------------------------------------------------------- projectiles --
// Boxy projectiles: square arrows, square cannonballs, square frost shards.
function drawProjectiles(ctx, state) {
  for (const p of state.projectiles) {
    const color = PROJECTILE_COLORS[p.type] || '#ffffff';
    ctx.fillStyle = color;
    if (p.type === 'arrow' || p.type === 'heroArrow') {
      ctx.save();
      ctx.translate(p.x, p.y);
      const ang = p.target ? Math.atan2(p.target.y - p.y, p.target.x - p.x) : -Math.PI / 2;
      ctx.rotate(ang);
      ctx.fillRect(-6, -1.5, 9, 3);
      ctx.fillRect(3, -2.5, 4, 5);
      ctx.restore();
    } else if (p.type === 'cannon') {
      ctx.fillStyle = '#3a3a3a';
      ctx.fillRect(p.x - 4.5, p.y - 4.5, 9, 9);
      ctx.fillStyle = 'rgba(255,255,255,0.5)';
      ctx.fillRect(p.x - 4.5, p.y - 4.5, 3, 3);
    } else if (p.type === 'frost') {
      ctx.fillRect(p.x - 3.5, p.y - 3.5, 7, 7);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(p.x - 1, p.y - 1, 2, 2);
    } else {
      // Bullet / tesla spark: small square + trail block.
      ctx.fillRect(p.x - 2.5, p.y - 2.5, 5, 5);
      ctx.globalAlpha = 0.4;
      ctx.fillRect(p.x - 9, p.y - 1, 6, 2);
      ctx.globalAlpha = 1;
    }
  }
}

function drawBeams(ctx, state) {
  for (const b of state.beams) {
    const alpha = b.life > 1 ? 1 : clamp(b.life, 0, 1);
    if (alpha <= 0) continue;
    // Zigzag lightning between the two endpoints.
    const segs = 5;
    const dx = b.x2 - b.x1;
    const dy = b.y2 - b.y1;
    const len = Math.hypot(dx, dy) || 1;
    const nx = -dy / len;
    const ny = dx / len;
    const pts = [];
    for (let i = 0; i <= segs; i++) {
      const t = i / segs;
      const off = i === 0 || i === segs ? 0 : Math.sin(b.x1 * 3.1 + b.y1 * 1.7 + i * 2.3 + b.life * 40) * 8;
      pts.push([b.x1 + dx * t + nx * off, b.y1 + dy * t + ny * off]);
    }
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = '#f4d35e';
    ctx.lineWidth = 4;
    ctx.lineJoin = 'round';
    ctx.beginPath();
    pts.forEach(([px, py], i) => (i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py)));
    ctx.stroke();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.restore();
  }
}

function drawParticles(ctx, state) {
  if (state.quality === 'low') return;
  for (const p of state.particles) {
    const alpha = clamp(p.life, 0, 1);
    if (alpha <= 0) continue;
    ctx.globalAlpha = alpha;
    ctx.fillStyle = p.color;
    const r = p.r || 3;
    ctx.fillRect(p.x - r, p.y - r, r * 2, r * 2);
  }
  ctx.globalAlpha = 1;
}

function drawFloaters(ctx, state) {
  ctx.textAlign = 'center';
  ctx.font = 'bold 13px sans-serif';
  for (const f of state.floaters) {
    const alpha = clamp(f.life, 0, 1);
    if (alpha <= 0) continue;
    ctx.globalAlpha = alpha;
    ctx.fillStyle = f.color || '#f4d35e';
    ctx.fillText(f.text, f.x, f.y);
  }
  ctx.globalAlpha = 1;
}

// ------------------------------------------------------------ entry ----
export function render(ctx, state) {
  ctx.save();
  // Screen shake (boss deaths etc.).
  if (state.shake > 0.2) {
    const s = state.shake;
    ctx.translate((Math.random() - 0.5) * s, (Math.random() - 0.5) * s);
  }

  drawMap(ctx, state);

  // Towers (sorted by y so lower ones overlap naturally — all on one plane).
  for (const t of state.towers) drawTower(ctx, state, t);

  drawHero(ctx, state);

  // Enemies, sorted by y for a slight top-down overlap feel.
  const sorted = state.enemies.slice().sort((a, b) => a.y - b.y);
  for (const e of sorted) drawEnemy(ctx, state, e);

  drawProjectiles(ctx, state);
  drawBeams(ctx, state);
  drawParticles(ctx, state);
  drawFloaters(ctx, state);

  ctx.restore();
}
