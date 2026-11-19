// touch.js — IRONHOLD touch input (Worker 3)
// bindTouch(canvas, handlers) where handlers = {onClick(x, y), onKey(key)}.
//
// Coordinate convention (set by main.js): onClick receives CSS pixels
// relative to the canvas element — main.js divides by view.scale to get
// logical 1024x640 coordinates. Do NOT convert to logical here, or the
// tap would be scaled twice.
//
// A tap (touchstart -> touchend, <14 CSS px movement, <600ms) is delivered
// as one onClick — the same handler mouse clicks use, so tap and click can
// never double-fire: touchstart/touchend call preventDefault (non-passive
// listeners), which suppresses the browser's synthetic mouse/click events
// for the tap.
// Returns an unbind function that removes all listeners.

export const LOGICAL_W = 1024;
export const LOGICAL_H = 640;

const TAP_MOVE_PX = 14;   // CSS px; more movement = a drag, not a tap
const TAP_MAX_MS = 600;

export function bindTouch(canvas, handlers) {
  handlers = handlers || {};
  let startX = 0, startY = 0, startT = 0, moved = false, tracking = false;

  function onStart(e) {
    if (e.touches.length !== 1) { tracking = false; return; }
    const r = canvas.getBoundingClientRect();
    const t = e.touches[0];
    startX = t.clientX - r.left;
    startY = t.clientY - r.top;
    startT = Date.now();
    moved = false;
    tracking = true;
    // Blocks scrolling on the canvas AND the synthetic mouse events,
    // so the tap is delivered exactly once via onClick below.
    e.preventDefault();
  }

  function onMove(e) {
    if (!tracking || e.touches.length !== 1) return;
    const r = canvas.getBoundingClientRect();
    const t = e.touches[0];
    if (Math.hypot(t.clientX - r.left - startX, t.clientY - r.top - startY) > TAP_MOVE_PX) {
      moved = true;
    }
    if (moved) e.preventDefault();
  }

  function onEnd(e) {
    e.preventDefault();
    if (!tracking) return;
    tracking = false;
    if (moved) return;
    if (Date.now() - startT > TAP_MAX_MS) return;
    if (handlers.onClick) handlers.onClick(startX, startY);
  }

  function onCancel() { tracking = false; }

  const opts = {passive: false};
  canvas.addEventListener('touchstart', onStart, opts);
  canvas.addEventListener('touchmove', onMove, opts);
  canvas.addEventListener('touchend', onEnd, opts);
  canvas.addEventListener('touchcancel', onCancel, opts);

  return function unbind() {
    canvas.removeEventListener('touchstart', onStart, opts);
    canvas.removeEventListener('touchmove', onMove, opts);
    canvas.removeEventListener('touchend', onEnd, opts);
    canvas.removeEventListener('touchcancel', onCancel, opts);
  };
}
