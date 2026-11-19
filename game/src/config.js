// config.js — IRONHOLD tuning values (per CONTRACT.md).
// Written by Worker 2 as a contract-faithful file because Worker 1 had not
// created it yet when Worker 2 started; Worker 1 may replace it provided the
// exported names/values below stay contract-compatible.
export const TILE = 64;
export const COLS = 16;
export const ROWS = 10;
export const LOGICAL_W = 1024;
export const LOGICAL_H = 640;

export const START_GOLD = 200;
export const START_LIVES = 20;
export const MAX_WAVES = 20;

export const SPAWN_INTERVAL = 0.8;
export const ENDLESS_SPAWN_INTERVAL = 0.5;
export const SELL_REFUND = 0.7;
export const UPGRADE_MULT = 1.6; // dmg x1.6/level; range +10%/level; rate +10%/level
export const HERO_LEVEL_KILLS = 10; // level up every 10 hero kills, max level 5
export const HERO_RETREAT_TIME = 10; // seconds the hero stays away at 0 HP

export const TOWERS = {
  archer: { name: 'Archer', cost: 50,  dmg: 8,  rate: 2.0,  range: 110, color: '#7fb069', desc: 'Fast, cheap shots' },
  cannon: { name: 'Cannon', cost: 120, dmg: 30, rate: 0.67, range: 100, splash: 45, color: '#e07a5f', desc: 'Splash damage' },
  frost:  { name: 'Frost',  cost: 100, dmg: 2,  rate: 1.0,  range: 100, slow: 0.4, slowDur: 1.5, color: '#81b8e8', desc: 'Slows enemies' },
  sniper: { name: 'Sniper', cost: 150, dmg: 60, rate: 0.33, range: 220, color: '#b08968', desc: 'Long range, huge damage' },
  tesla:  { name: 'Tesla',  cost: 200, dmg: 18, rate: 1.0,  range: 120, chain: 3, color: '#f4d35e', desc: 'Chain lightning x3' },
};

export const ENEMIES = {
  grunt:   { hp: 30,   speed: 40, bounty: 6,   color: '#c0392b', r: 13 },
  runner:  { hp: 20,   speed: 75, bounty: 8,   color: '#e67e22', r: 11, minWave: 3 },
  armored: { hp: 120,  speed: 28, bounty: 12,  color: '#7f8c8d', r: 15, minWave: 5 },
  healer:  { hp: 45,   speed: 35, bounty: 14,  color: '#27ae60', r: 12, minWave: 7, heal: 5 },
  splitter:{ hp: 60,   speed: 38, bounty: 10,  color: '#8e44ad', r: 13, minWave: 8 },
  mini:    { hp: 15,   speed: 55, bounty: 2,   color: '#9b59b6', r: 8 },
  ogre:    { hp: 1500, speed: 22, bounty: 200, color: '#6e2c00', r: 24, boss: true, leak: 5 },
  warlord: { hp: 5000, speed: 20, bounty: 500, color: '#1a1a2e', r: 28, boss: true, leak: 5 },
};

// Enemy HP multiplier for a wave. Keeps growing past wave 20 (endless).
export function HP_SCALE(wave) {
  return 1 + 0.12 * (wave - 1);
}

// Enemies in a wave (boss waves add escorts on top of this count via composition).
export function WAVE_COUNT(wave) {
  return 6 + wave * 2;
}

// Gold bonus on clearing a wave.
export function WAVE_BONUS(wave) {
  return 20 + wave * 5;
}

export const HEROES = {
  aldric: { name: 'Aldric', title: 'the Knight', hp: 300, dmg: 20, rate: 1.0, range: 70,  color: '#4a7fb5', skill: { name: 'Whirlwind', desc: 'Massive AoE damage around Aldric', cd: 15, aoeDmg: 80, aoeR: 90 } },
  lyra:   { name: 'Lyra',   title: 'the Ranger', hp: 180, dmg: 15, rate: 1.5, range: 150, color: '#7fb069', skill: { name: 'Arrow Volley', desc: 'Rain of arrows on the densest cluster', cd: 15, arrows: 8, arrowDmg: 30 } },
};

// Decree pool: pick 3 distinct random each intermission, choose 1, permanent.
export const DECREES = {
  dmg15:    { name: 'Sharpened Steel', desc: '+15% tower damage' },
  gold100:  { name: 'War Chest',       desc: '+100 gold now' },
  lives2:   { name: 'Reinforcements',  desc: '+2 lives' },
  bounty10: { name: 'Bounty Hunter',   desc: '+10% gold from kills' },
  build20:  { name: 'Master Builders', desc: 'Build costs -20%' },
  heroCd20: { name: 'Heroic Zeal',     desc: 'Hero skill cooldown -20%' },
  range10:  { name: 'Far Sight',       desc: '+10% tower range' },
  slow10:   { name: 'Deep Freeze',     desc: 'Frost slow +10%' },
};
