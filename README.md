# IRONHOLD — Tower Defense

**Defend the kingdom's last bastion.** Fantasy tower defense in the browser:
the Rebel Invasion marches on the keep in 20 waves — build towers on the plots
beside the path, recruit a hero, pass Royal Decrees between waves, and hold
the line. Survive all 20 waves for victory, then keep going in Endless mode.

Vanilla JS + Canvas 2D, zero libraries, zero network, all art procedural
(blocky Minecraft × sandbox voxel style), all sound synthesized with WebAudio.
Open `game/index.html` directly, or serve the `game/` folder with any static
server.

## How to play

1. **Title screen** → press START, then **choose your hero** (Aldric or Lyra).
2. **Build phase:** click / tap a glowing plot to open the build menu, then
   pick a tower. You start with **200 gold** and **20 lives**.
3. **Start the wave** (START WAVE button or `Space`). Enemies follow the
   winding path from the west gate to the keep in the east.
4. Kill enemies for **gold bounties**. If an enemy reaches the keep you lose
   **1 life** (a boss costs **5 lives**). Clearing a wave pays a
   **bonus of 20 + wave × 5 gold** and lets you pick **1 of 3 Royal Decrees**.
5. **Win** by clearing wave 20, then choose **Continue Endless** — or stop
   there. Lose all lives and the keep falls. Best wave/score are saved
   in your browser (localStorage).

Tips:

- Towers attack automatically; frost towers slow instead of dealing damage.
- Select a built tower to see its range circle, upgrade it, or sell it
  (70% refund of everything invested).
- Your hero fights beside the keep and levels up — use the hero skill (`H`)
  when a crowd bunches up.
- Bosses come on **wave 10 (the Ogre)** and **wave 20 (the Warlord)**.
- Watch the **next-wave preview** in the top bar before you start a wave.

## Controls

| Input | Action |
|---|---|
| Click / tap a plot | Open the build menu |
| Click / tap a built tower | Upgrade / sell panel (+ range circle) |
| Click / tap a tower card | Build that tower on the selected plot |
| `1`–`5` | Quick-build Archer / Cannon / Frost / Sniper / Tesla on the selected plot |
| `Space` | Start the wave |
| `F` | Fast-forward 2× (toggle) |
| `P` or `Esc` | Pause (Esc also closes an open panel) |
| `M` | Mute / unmute |
| `Q` | Quality high / low (low skips particles and shadows) |
| `H` | Hero skill |
| Top-bar buttons | Start Wave, 1×/2×, Pause, Mute, Hi/Lo — all tappable |

On mobile (390×844 and other small screens) the build and tower panels dock
to the bottom as full-width strips; all buttons are 44px tall in logical
coordinates.

## Towers

Upgrades: **damage ×1.6 per level, range +10% per level, attack rate +10%
per level** (max level 3). Upgrade cost = `round(base cost × 0.75 × current
level)`. Sell refunds **70% of total invested**. Level 3 towers gain a
stepped square-cone roof.

| Tower | Cost | Damage | Rate | Range | Special |
|---|---|---|---|---|---|
| **Archer** | 50g | 8 | 2.0/s | 110 | Fast, cheap shots |
| **Cannon** | 120g | 30 | 0.67/s | 100 | Splash damage, radius 45 |
| **Frost** | 100g | 2 | 1.0/s | 100 | Slows enemies 40% for 1.5s |
| **Sniper** | 150g | 60 | 0.33/s | 220 | Very long range, huge damage |
| **Tesla** | 200g | 18 | 1.0/s | 120 | Chain lightning, up to 3 enemies |

Upgrade costs: Archer 38g → 75g; Cannon 90g → 180g; Frost 75g → 150g;
Sniper 113g → 225g; Tesla 150g → 300g.

## Enemies

Enemy HP scales with the wave: `×(1 + 0.12 × (wave − 1))`. A wave has
`6 + wave × 2` enemies. HP bars float over every enemy; slowed enemies get
a blue tint.

| Enemy | HP | Speed | Bounty | From wave | Notes |
|---|---|---|---|---|---|
| **Grunt** | 30 | 40 | 6g | 1 | Basic red block |
| **Runner** | 20 | 75 | 8g | 3 | Fast, leans into the run, orange |
| **Armored** | 120 | 28 | 12g | 5 | Slow, wide, square helm |
| **Healer** | 45 | 35 | 14g | 7 | Heals nearby allies 5 HP/s (60px), green with white cross |
| **Splitter** | 60 | 38 | 10g | 8 | Splits into 2 minis on death, purple split head |
| **Mini** | 15 | 55 | 2g | — | Only from Splitters |
| **Ogre** (boss, wave 10) | 1500 | 22 | 200g | 10 | Horns + club, leak costs 5 lives |
| **Warlord** (boss, wave 20) | 5000 | 20 | 500g | 20 | Crown + cape, red eyes, leak costs 5 lives |

Boss waves add escorts on top of the boss: wave 10 = Ogre + 8 escorts,
wave 20 = Warlord + 12 escorts. In Endless mode (wave 21+) enemies also
get +2% speed per wave past 20, and spawn faster (0.5s instead of 0.8s).

## Heroes

Your hero guards the keep from the hero post and auto-attacks the nearest
enemy in range. **Level up every 10 hero kills** (max level 5):
**+15% damage and +8 range per level**. If the hero's HP hits 0, they
**retreat for 10s**, then return at full HP.

| Hero | HP | Damage | Rate | Range | Skill (15s cooldown) |
|---|---|---|---|---|---|
| **Aldric the Knight** | 300 | 20 | 1.0/s | 70 | **Whirlwind** — 80 AoE damage in a 90px radius |
| **Lyra the Ranger** | 180 | 15 | 1.5/s | 150 | **Arrow Volley** — 8 arrows × 30 damage on the densest cluster |

## Royal Decrees

After every cleared wave (except wave 20, which is victory), pick **1 of 3**
randomly offered decrees. Each lasts the whole run and can't be picked twice.

| Decree | Effect |
|---|---|
| **Sharpened Steel** | +15% tower damage |
| **War Chest** | +100 gold immediately |
| **Reinforcements** | +2 lives |
| **Bounty Hunter** | +10% gold from kills |
| **Master Builders** | Build costs −20% |
| **Heroic Zeal** | Hero skill cooldown −20% |
| **Far Sight** | +10% tower range |
| **Deep Freeze** | Frost slow +10% |

## The map — Greenfield Pass

16×10 grid (1024×640 logical pixels). One serpentine path from the west gate
to the keep on the east edge, with direction arrows; **14 build plots** beside
the path; decorative trees, rocks, and houses near the keep; the hero post
stands just west of the keep at (896, 480). The whole map fits on screen —
no scrolling.

## Screenshots

- `screenshots/1-title.png` — title screen
- `screenshots/2-build.png` — build phase with the build menu open
- `screenshots/3-fight.png` — mid-wave fight
- `screenshots/4-boss.png` — boss wave (the Ogre)
- `screenshots/5-hero-closeup.png` — close-up of the hero and nearby
  blocky enemies

## Tech notes

- `game/index.html` + `game/src/*.js` (ES modules, no build step).
- `game/` is ~120 KB total. 60 fps target on desktop and mobile.
- No console errors; works from `file://` and from a static server
  (e.g. `python3 -m http.server` in the project root, then open
  `http://localhost:8000/game/`).
- Sound: WebAudio synth only (shots, explosions, frost shimmer, coin,
  wave horn, keep alarm, victory/defeat stingers). No audio files.
