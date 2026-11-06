# Balance sheet

The numbers that set how hard Goose on a Leash is, in one place, with the reasoning behind them. Values live in
`src/core/config.ts` (`C`, `DIFFICULTY`) and `src/core/sim.ts` (`mkEnemy` stats, boss HP constants, `BASEMENT_POOL`).
The unit tests run on **Classic** (the original tuning); the game starts on **Normal**.

## Difficulty multipliers

| Setting | tempo (critter thinking speed) | hurt (spill and tear chance) | boss HP | seconds between burrow spawns | fish pull |
|---|---|---|---|---|---|
| Story | 0.85 | 0.70 | 0.85 | 1.40 | 0.85 |
| Classic (tests) | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| **Normal** | **1.12** | **1.30** | **1.20** | **0.85** | **1.10** |
| Brutal | 1.28 | 1.65 | 1.45 | 0.70 | 1.25 |

Normal is meant to be hard: about a third more damage than the original tuning, with critters acting ~12% sooner.
Story is for players who want the story and the fishing; it should never feel like a separate game.

## Bimbo's water (the life bar)

| Source | Value | What it means |
|---|---|---|
| Sound pack drain | 0.002/s | about 8 minutes from full with no tears |
| Each tear | +0.006/s | 3 tears empty a full pack in about 50 s |
| Light hit | 7% spill, or a tear (25%, ×1.7 from behind, ×0.4 face-on) | turning to face critters matters |
| Heavy hit | 13% spill, or a tear (45%) | bosses and badgers |
| Refill | 0.45/s | about 2 s at any refill puddle |
| Sewing kit | 3 needles; 1 twine per patch | patches are the real currency of a long room |

## Power cast

| | Value |
|---|---|
| Meter swing | 0.7 s empty to full (then back down) |
| Perfect window | release at ≥ 86% (≥ 80% with the Spinning Reel) |
| Perfect bite | ×1.7 first-bite damage and a stun; foxes cannot dodge it |
| Weak bite | ×0.6 at the lowest power, scaling up to ×1 at the sweet spot |
| Reach | `castHeel + (castMax − castHeel) × power^0.75`, with castMax = leash × 1.7 (+0.5 with the reel) |
| Winding up | Rocco moves at 65% speed |

The perfect window is about 0.1 s per swing. That is deliberately tight on Normal: a good player lands most casts,
a new player lands a few and still progresses on plain bites.

## Bosses (HP on Classic; ×1.2 on Normal)

| Boss | HP | Normal HP | Region |
|---|---|---|---|
| Old Snapper | 24 | 29 | Reedmarsh, the Reed Gate |
| The Heron Ferryman | 40 | 48 | Reedmarsh, the Pool |
| Captain Gullbeard | 46 | 55 | Driftwood Wharf |
| The Pelican Chef | 44 | 53 | Castle, Kitchens |
| The Burrow King | 50 | 60 | Hollowbark |
| The Black Swan | 52 | 62 | Castle, Lava Keep |
| The Swan Queen | 60 | 72 | Castle, Throne Room |
| The Blood Shark | 3 landings | 3 landings | The Blood Moat (a fishing fight, scaled by fish pull) |

The Pelican Chef sits slightly below Gullbeard on purpose: the kitchen floor (grease, steam) does half the work.

## Critters (HP, radius, speed)

| Critter | HP | Speed | Notes |
|---|---|---|---|
| Frog | 3 | 78 | leap and tongue at the pack |
| Squirrel | 2 | 115 | throws acorns; parry with the oar |
| **Fox (new)** | 3 | 150 | sidesteps any non-perfect cast (2.2 s cooldown), darts 0.5 s after the crouch, steals and bolts for 4 s |
| Badger | 10 | 50 | burrows; heavy |
| Crab | 4 | 72 | claws up for 1.2 s after a snap: casts clack off |
| Gull | 2 | 150 | one dives at a time; steals |
| Eel | 3 | | lunges from tide pools |
| Turtle | 9 | 36 | flip it with a yank |
| Bellhop | 3 | 125 | |
| Mimic loaf | 2 | 90 | clings to the pack; roll to throw it off |

## Fishing glasses (new)

* A heavy hit cracks a lens 10% of the time × the difficulty's hurt (13% on Normal, 16.5% on Brutal).
* Two cracks: every 7 to 13 s Rocco's steps wander for about a second (the blood moon gets in). Three cracks: nearly twice as often.
* A sewing kit pickup mends one crack. Pickett's Lens Repair mends all of them for 2 sea glass.

The cost is a nuisance, not a death sentence: a stumble rotates his steps, it never stops him.

## The Infinite Basement (new)

* Floor *n* sends `min(16, 2 + ceil(1.2n))` critters: 4, 5, 6, 7, 8, 10 ... capped at 16 from floor 12.
* The mix unlocks by floor: frogs (1), squirrels (2), crabs (3), foxes (4), gulls (5), bellhops (6), mimics (7), badgers (8), turtles (10).
* From floor 7 every critter is hasted (×1.5 thinking speed) on top of the difficulty's tempo.
* Clearing a floor: +30% water; bread every 2nd floor, a needle every 3rd, 2 sea glass every 5th.
* No refills. A faint ends the run; the board keeps the ten deepest runs (floors, then critters beaten, then time).

Expected depth on Normal, by design: floor 4 to 6 for a new player, 8 to 10 for someone who parries and lands perfect casts,
12+ only with good pack management. These are targets, not measurements; check them against real runs (see below).

## How to check the balance with real players

The bench's **Playtest stats** button shows and copies local counts: faints and snaps per room, time per room, where
sessions ended, crafts, and the deepest Basement floor. Nothing leaves the browser. Ask testers to paste them into
their feedback; the rooms that top "most faints" and "sessions ended in" are where to look first.

Rules of thumb for changes:

1. A room where most testers faint more than three times: lower its spawns first, then its critters' tempo. Leave the hit damage alone.
2. A boss that takes over four minutes on Normal: lower its HP by 10% steps.
3. If few players reach floor 5 in the Basement, start the haste at floor 9 instead of 7.
