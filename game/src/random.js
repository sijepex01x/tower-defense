// Seeded RNG (mulberry32) — deterministic, no Math.random in game logic.
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// rand(rng, a, b): uniform float in [a, b). With one arg, [0, a). With none, [0, 1).
export function rand(rng, a, b) {
  if (a === undefined) return rng();
  if (b === undefined) return rng() * a;
  return a + rng() * (b - a);
}

// pick(rng, arr): uniform random element.
export function pick(rng, arr) {
  return arr[Math.floor(rng() * arr.length)];
}
