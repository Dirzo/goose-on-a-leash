# Playtest bot

A bot that plays Goose on a Leash like a person: it reacts a reaction-time late, aims with a shaky hand, lets go
of the cast a little early or late, forgets to patch the pack, dawdles, panics, and only knows a boss's trick once
the game's hint has told it. Three profiles (novice, average, skilled) in `bot.ts`.

- `bot.ts`: perception, decisions, casting, parrying, fishing.
- `nav.ts`: walk grid plus grapple edges, for finding a way through each area.
- `runner.ts`: one run of one area, with the kit a player has by then; records faints, water, time, boss length.
- `matrix-<difficulty>.play.ts`: every area × skill × 3 seeds for one difficulty → `results/<difficulty>.jsonl`.
- `rerun.play.ts`: `AREAS=castle-4,castle-5` → those areas on every difficulty → `results/rerun.jsonl`.
- `dbg.play.ts`: trace one run (`AREA`, `SKILL`, `DIFF`, `SEED`, `LIMIT`, `EVERY`).

Run with `npx vitest run -c vitest.playtest.config.ts <file>`. Not part of `npm test`: a full matrix is ~45 min.
