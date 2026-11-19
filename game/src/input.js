// input.js — IRONHOLD mouse + keyboard input (Worker 3)
// bindInput(canvas, handlers) where handlers = {onClick(x, y), onKey(key)}.
//
// Coordinate convention (set by main.js): onClick receives CSS pixels
// relative to the canvas element — main.js divides by view.scale to get
// logical 1024x640 coordinates. Do NOT convert to logical here, or the
// click would be scaled twice.
//
// Keys: onKey receives the raw `e.key` value, unmodified — main.js matches
// ' ' (Space), 'f'/'F', 'p'/'P', 'Escape', 'm'/'M', 'q'/'Q', 'h'/'H' and
// digits '1'..'5' (quick-build on the selected plot). Only those keys are
// forwarded; repeats are ignored; Space is preventDefaulted (page scroll).
// Returns an unbind function that removes all listeners.

export const LOGICAL_W = 1024;
export const LOGICAL_H = 640;

const HANDLED_KEYS = new Set([
  ' ', 'f', 'F', 'p', 'P', 'Escape', 'm', 'M', 'q', 'Q', 'h', 'H',
  '1', '2', '3', '4', '5',
]);

export function bindInput(canvas, handlers) {
  handlers = handlers || {};

  function onMouse(e) {
    if (!handlers.onClick) return;
    const r = canvas.getBoundingClientRect();
    handlers.onClick(e.clientX - r.left, e.clientY - r.top);
  }

  function onKeyDown(e) {
    if (!handlers.onKey) return;
    if (!HANDLED_KEYS.has(e.key)) return;
    if (e.repeat) return; // one action per press
    e.preventDefault();   // Space would scroll the page
    handlers.onKey(e.key);
  }

  canvas.addEventListener('click', onMouse);
  if (typeof window !== 'undefined') {
    window.addEventListener('keydown', onKeyDown);
  }

  return function unbind() {
    canvas.removeEventListener('click', onMouse);
    if (typeof window !== 'undefined') {
      window.removeEventListener('keydown', onKeyDown);
    }
  };
}
