# Parity with the HTML prototype

The M1 gate is "the Phaser build plays exactly like the prototype". Rules, numbers and Room 01 layout are ported 1:1, and every prototype check passes against the TypeScript core with the same thresholds. These are the only intentional differences.

## Bugs fixed (both existed in the prototype)

1. **Fast flings could tunnel out of the room.** At high fling speed the goose moved more than a wall's thickness in one frame and ended up outside. Goose and janitor movement is now sub-stepped (no step longer than 80% of the body radius), with an outer-bounds safety clamp. Found by the fuzz test.
2. **Grabbing a loose goose's leash could overstretch it.** The trailing end can sit up to 22 units past full length, so for one frame the goose was outside leash range. He is now reeled in to the limit on grab. Found by the fuzz test.
3. **Slow motion on weak machines.** Phaser smooths frame time, which under-reports it on slow frames. The fixed step now runs off the real clock, so the game runs at real speed even at 30 fps.

## Changes

- **Mop bucket moved** from (52, 52) to (56, 150) so it no longer sits under the HUD hearts.
- **Fixed 60 Hz simulation** with render interpolation, instead of a variable step. Same tuning, steadier rope.
- **Seedable random generator** inside the sim, so a run can be replayed exactly. The prototype used `Math.random`.
- **Death pause** is part of the sim (0.9 s) instead of a `setTimeout`.
- **Analog movement** from a gamepad stick; keyboard movement is unchanged.

## Added

- Gamepad support (see README).
- 25 automated tests, including determinism and a 10,000-fling fuzz test.
