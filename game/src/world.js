// world.js — IRONHOLD map: path, keep, build plots, decor, hero post (per CONTRACT.md).
// Written by Worker 2 as a contract-faithful file because Worker 1 had not
// created it yet when Worker 2 started; Worker 1 may replace it provided the
// exported names/values below stay contract-compatible.
//
// Path (tile centers, px): (0,96) -> (832,96) -> (832,224) -> (192,224) ->
// (192,416) -> (832,416) -> (832,544) -> (960,544). Keep at (992,544).
// Every plot centre is >= 64px from every path segment (one full tile clear).
import { TILE, COLS, ROWS } from './config.js';

export { TILE, COLS, ROWS };

export const PATH = [
  { x: 0, y: 96 },
  { x: 832, y: 96 },
  { x: 832, y: 224 },
  { x: 192, y: 224 },
  { x: 192, y: 416 },
  { x: 832, y: 416 },
  { x: 832, y: 544 },
  { x: 960, y: 544 },
];

export const KEEP = { x: 992, y: 544 };

export const HERO_POST = { x: 896, y: 480 };

// Exactly 14 plots beside the path, never on it. x/y = tile centre in px.
export const PLOTS = [
  { id: 0,  tx: 5,  ty: 2, x: 352, y: 160 },
  { id: 1,  tx: 7,  ty: 2, x: 480, y: 160 },
  { id: 2,  tx: 9,  ty: 2, x: 608, y: 160 },
  { id: 3,  tx: 11, ty: 2, x: 736, y: 160 },
  { id: 4,  tx: 1,  ty: 4, x: 96,  y: 288 },
  { id: 5,  tx: 1,  ty: 5, x: 96,  y: 352 },
  { id: 6,  tx: 4,  ty: 5, x: 288, y: 352 },
  { id: 7,  tx: 7,  ty: 5, x: 480, y: 352 },
  { id: 8,  tx: 9,  ty: 5, x: 608, y: 352 },
  { id: 9,  tx: 11, ty: 5, x: 736, y: 352 },
  { id: 10, tx: 4,  ty: 7, x: 288, y: 480 },
  { id: 11, tx: 7,  ty: 7, x: 480, y: 480 },
  { id: 12, tx: 9,  ty: 7, x: 608, y: 480 },
  { id: 13, tx: 11, ty: 7, x: 736, y: 480 },
];

// Decorations: trees/rocks scattered off path and plots, houses near the keep.
export const DECOR = [
  { kind: 'tree',  x: 32,  y: 32 },
  { kind: 'tree',  x: 160, y: 32 },
  { kind: 'rock',  x: 416, y: 32 },
  { kind: 'rock',  x: 992, y: 32 },
  { kind: 'tree',  x: 928, y: 96 },
  { kind: 'tree',  x: 992, y: 192 },
  { kind: 'house', x: 928, y: 448 },
  { kind: 'house', x: 992, y: 448 },
  { kind: 'tree',  x: 160, y: 608 },
  { kind: 'rock',  x: 224, y: 608 },
  { kind: 'rock',  x: 544, y: 608 },
  { kind: 'tree',  x: 672, y: 608 },
  { kind: 'house', x: 928, y: 608 },
];

// Return the plot whose tile contains point (x, y), or null.
export function plotAt(x, y) {
  for (const p of PLOTS) {
    if (Math.abs(x - p.x) <= TILE / 2 && Math.abs(y - p.y) <= TILE / 2) return p;
  }
  return null;
}

// Total path length in px (used by pathPointAt).
const SEG_LEN = [];
let PATH_LEN = 0;
for (let i = 0; i < PATH.length - 1; i++) {
  const len = Math.hypot(PATH[i + 1].x - PATH[i].x, PATH[i + 1].y - PATH[i].y);
  SEG_LEN.push(len);
  PATH_LEN += len;
}

// Point `dist` px along the path from the west entrance (clamped to the keep).
export function pathPointAt(dist) {
  const d = Math.max(0, Math.min(PATH_LEN, dist));
  let acc = 0;
  for (let i = 0; i < SEG_LEN.length; i++) {
    if (d <= acc + SEG_LEN[i] || i === SEG_LEN.length - 1) {
      const t = SEG_LEN[i] === 0 ? 0 : (d - acc) / SEG_LEN[i];
      return {
        x: PATH[i].x + (PATH[i + 1].x - PATH[i].x) * t,
        y: PATH[i].y + (PATH[i + 1].y - PATH[i].y) * t,
      };
    }
    acc += SEG_LEN[i];
  }
  return { x: PATH[PATH.length - 1].x, y: PATH[PATH.length - 1].y };
}
