// IRONHOLD — bootstrap, resize, game loop, input wiring, headless exports.
// Only bootstraps when a real canvas exists (document.getElementById('game')).
// Importing this module from node is safe: no window/document access at top level.
import {
  createGame, update, startWave, buildTower, upgradeTower, sellTower,
  chooseHero, useHeroSkill, chooseDecree, togglePause, toggleSpeed,
  toggleMute, toggleQuality, restart, continueEndless,
} from './game.js';
import { render } from './render.js';
import { drawHUD, hudHit } from './hud.js';
import { createAudio } from './audio.js';
import { bindInput } from './input.js';
import { bindTouch } from './touch.js';
import { plotAt } from './world.js';
import { LOGICAL_W, LOGICAL_H } from './config.js';

export { createGame, update };

// Tower quick-build order for keys 1-5.
const QUICK_BUILD = ['archer', 'cannon', 'frost', 'sniper', 'tesla'];

// ------------------------------------------------------------------
// doAction dispatcher (used by the QA harness + window.__ironhold).
// `getState` is injected by init(); before bootstrap it reports not-ready.
let _getState = null;

export function doAction(name, args) {
  const state = _getState ? _getState() : null;
  if (!state) return { ok: false, error: 'ironhold not bootstrapped' };
  const a = args || {};
  switch (name) {
    case 'startWave': return { ok: startWave(state) !== false };
    case 'buildTower': return { ok: buildTower(state, a.plotId, a.type) !== false };
    case 'upgradeTower': return { ok: upgradeTower(state, a.id) !== false };
    case 'sellTower': return { ok: sellTower(state, a.id) !== false };
    case 'chooseHero': return { ok: chooseHero(state, a.id) !== false };
    case 'hero':
      if (a.id) return { ok: chooseHero(state, a.id) !== false };
      state.phase = 'hero';
      return { ok: true };
    case 'showHeroSelect': state.phase = 'hero'; return { ok: true };
    case 'useHeroSkill': return { ok: useHeroSkill(state) !== false };
    case 'chooseDecree': return { ok: chooseDecree(state, a.id) !== false };
    case 'togglePause': togglePause(state); return { ok: true };
    case 'toggleSpeed': toggleSpeed(state); return { ok: true };
    case 'toggleMute': toggleMute(state); return { ok: true };
    case 'toggleQuality': toggleQuality(state); return { ok: true };
    case 'restart': restart(state); return { ok: true };
    case 'continueEndless': return { ok: continueEndless(state) !== false };
    case 'select': state.selected = a.selected || null; return { ok: true };
    default: return { ok: false, error: 'unknown action: ' + name };
  }
}

// ------------------------------------------------------------------
// Bootstrap. Returns the live handles (also exposed on window.__ironhold).
export function init(canvas) {
  const ctx = canvas.getContext('2d');
  const state = createGame();
  const audio = createAudio();
  const view = { scale: 1, dpr: 1 };

  function resize() {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const scale = Math.min(vw / LOGICAL_W, vh / LOGICAL_H);
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    view.scale = scale;
    view.dpr = dpr;
    canvas.style.width = Math.floor(LOGICAL_W * scale) + 'px';
    canvas.style.height = Math.floor(LOGICAL_H * scale) + 'px';
    canvas.width = Math.round(LOGICAL_W * scale * dpr);
    canvas.height = Math.round(LOGICAL_H * scale * dpr);
  }
  resize();
  window.addEventListener('resize', resize);
  window.addEventListener('orientationchange', resize);

  // --- click routing: HUD first, then world selection ----------------
  // NOTE (coord convention for input.js/touch.js): handlers receive CSS
  // pixels relative to the canvas element; main.js divides by view.scale
  // to get logical 1024x640 coordinates.
  function toLogical(x, y) {
    return { x: x / view.scale, y: y / view.scale };
  }

  function routeHit(hit) {
    if (!hit || !hit.action) {
      state.selected = null;
      return;
    }
    switch (hit.action) {
      case 'startWave': startWave(state); audio.horn(); break;
      case 'speed': toggleSpeed(state); audio.click(); break;
      case 'pause': togglePause(state); audio.click(); break;
      case 'mute': toggleMute(state); audio.setMuted(state.muted); audio.click(); break;
      case 'quality': toggleQuality(state); audio.click(); break;
      case 'build': buildTower(state, hit.plotId, hit.type); audio.click(); break;
      case 'upgrade': upgradeTower(state, hit.id); audio.click(); break;
      case 'sell': sellTower(state, hit.id); audio.click(); break;
      case 'decree': chooseDecree(state, hit.id); audio.click(); break;
      case 'hero':
        // hudHit 'hero' with an id = pick that hero; without an id (title
        // screen START button) = open the hero-select screen. No game.js
        // function owns the title->hero transition, so main.js sets it.
        if (hit.id) chooseHero(state, hit.id);
        else state.phase = 'hero';
        audio.click();
        break;
      case 'skill': useHeroSkill(state); break;
      case 'plot': state.selected = { kind: 'plot', id: hit.id }; audio.click(); break;
      case 'tower': state.selected = { kind: 'tower', id: hit.id }; audio.click(); break;
      case 'close': state.selected = null; audio.click(); break;
      case 'restart': restart(state); audio.click(); break;
      case 'title': restart(state); audio.click(); break;
      case 'continueEndless': continueEndless(state); audio.horn(); break;
      default: break;
    }
  }

  function onClick(cx, cy) {
    audio.unlock();
    const p = toLogical(cx, cy);
    const hit = hudHit(state, p.x, p.y);
    if (hit) {
      routeHit(hit);
      return;
    }
    // No HUD hit: world click — plot select / tower select / deselect.
    // [QA FIX 2026-11-19: this fallback used to run in EVERY phase, so a
    // click on a plot position during the decree screen silently set
    // state.selected, and the build menu then popped open unprompted as
    // soon as the player picked a decree. World selection only applies
    // in build/wave phases; other phases ignore stray world clicks.]
    if (state.phase !== 'build' && state.phase !== 'wave') return;
    const plot = plotAt(p.x, p.y);
    if (plot) {
      state.selected = { kind: 'plot', id: plot.id };
      audio.click();
      return;
    }
    let hitTower = null;
    for (const t of state.towers) {
      if (Math.hypot(t.x - p.x, t.y - p.y) <= 26) { hitTower = t; break; }
    }
    if (hitTower) {
      state.selected = { kind: 'tower', id: hitTower.id };
      audio.click();
      return;
    }
    state.selected = null;
  }

  function onKey(key) {
    if (key === ' ') {
      if (state.phase === 'build') { startWave(state); audio.horn(); }
      return;
    }
    if (key === 'f' || key === 'F') { toggleSpeed(state); return; }
    if (key === 'p' || key === 'P') { togglePause(state); return; }
    if (key === 'm' || key === 'M') {
      toggleMute(state);
      audio.setMuted(state.muted);
      return;
    }
    if (key === 'q' || key === 'Q') { toggleQuality(state); return; }
    if (key === 'h' || key === 'H') { useHeroSkill(state); return; }
    if (key === 'Escape') {
      if (state.selected) state.selected = null;
      else togglePause(state);
      return;
    }
    const n = parseInt(key, 10);
    if (n >= 1 && n <= 5 && state.selected && state.selected.kind === 'plot') {
      buildTower(state, state.selected.id, QUICK_BUILD[n - 1]);
    }
  }

  bindInput(canvas, { onClick, onKey });
  bindTouch(canvas, { onClick, onKey });

  // --- main loop ------------------------------------------------------
  let last = performance.now();
  let prevLives = state.lives;
  let prevKills = state.kills;
  let prevPhase = state.phase;
  let lastCoinAt = 0;

  function frame(now) {
    // dt clamp: never simulate more than 0.1s in one frame.
    const rawDt = Math.min(Math.max((now - last) / 1000, 0), 0.1);
    last = now;

    if (!state.paused) {
      // update() applies state.speed internally — pass the raw dt.
      update(state, rawDt);
    }

    // Lightweight audio cues driven by state changes (game.js owns logic).
    if (state.phase !== prevPhase) {
      if (state.phase === 'wave') audio.horn();
      if (state.phase === 'victory') audio.victory();
      if (state.phase === 'gameover') audio.defeat();
      prevPhase = state.phase;
    }
    if (state.lives < prevLives) audio.alarm();
    prevLives = state.lives;
    if (state.kills > prevKills && now - lastCoinAt > 120) {
      audio.coin();
      lastCoinAt = now;
    }
    prevKills = state.kills;

    // Render in logical coordinates.
    ctx.setTransform(view.scale * view.dpr, 0, 0, view.scale * view.dpr, 0, 0);
    ctx.clearRect(0, 0, LOGICAL_W, LOGICAL_H);
    render(ctx, state);
    drawHUD(ctx, state);

    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  const handles = {
    state, view, audio,
    startWave: () => startWave(state),
    buildTower: (plotId, type) => buildTower(state, plotId, type),
    upgradeTower: (id) => upgradeTower(state, id),
    sellTower: (id) => sellTower(state, id),
    chooseHero: (id) => chooseHero(state, id),
    showHeroSelect: () => { state.phase = 'hero'; },
    useHeroSkill: () => useHeroSkill(state),
    chooseDecree: (id) => chooseDecree(state, id),
    togglePause: () => togglePause(state),
    toggleSpeed: () => toggleSpeed(state),
    toggleMute: () => { toggleMute(state); audio.setMuted(state.muted); },
    toggleQuality: () => toggleQuality(state),
    restart: () => restart(state),
    continueEndless: () => continueEndless(state),
    doAction,
  };
  _getState = () => state;
  if (typeof window !== 'undefined') {
    window.__ironhold = handles;
  }
  return handles;
}

// Bootstrap only when a real canvas exists in the document.
if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  const canvas = document.getElementById('game');
  if (canvas) init(canvas);
}
