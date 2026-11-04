# Goose on a Leash

A 16-bit action-adventure where your only weapon is a furious goose on a leash, and he is as dangerous to you as he is to the dungeon. A noobscrub game.

This is the **M1 Foundation** build: the HTML prototype ported to Phaser 4 and TypeScript, with the game rules in an engine-free core that is tested headless.

## Run it

```sh
npm install
npm run dev        # http://localhost:5173
npm test           # 25 Vitest tests, including a 10,000-fling fuzz test
npm run build      # typecheck + production build into dist/
npm run deploy     # build + Cloudflare Workers static assets (needs wrangler login)
```

Pinned versions: Phaser 4.2.1, TypeScript 6.0.3, Vite 8.3.4, Vitest 5.0.5. `.npmrc` sets `legacy-peer-deps` because npm 10 crashes resolving Vitest 5's optional browser peers.

## Layout

| Folder | What lives there | Rule |
| --- | --- | --- |
| `src/core/` | Simulation: `sim.ts` (goose, fury, strain, combat), `rope.ts`, `crafting.ts`, `room.ts`, `config.ts`, `math.ts` | No Phaser imports, ever. Seedable RNG, fixed 60 Hz step. |
| `src/data/` | `recipes.ts` (materials, catalysts, leashes, breads), `rooms.ts` | Designers tune numbers here. |
| `src/scenes/` | `GameScene.ts`: fixed-step loop, interpolation, pause | Thin. |
| `src/view/` | `render.ts` (Graphics gray-box), `controls.ts` (keyboard, mouse, gamepad), `ui.ts` (tuning bench, recipe book) | Reads the sim, sends it input. |
| `test/` | `tuning`, `crafting`, `fuzz` suites | Run in Node, no browser. |

The sim produces `SimEvent`s (`say`, `fx`, `won`, `reset`); the view drains them each frame. Nothing in `core/` knows how it is drawn.

## Controls

Keyboard and mouse match the prototype: WASD move, click fling, right-click or E yank, Space honk, Q let go, F bread, C switch bread, B recipe book, R reset.
Gamepad: left stick move, right stick aim, RT fling, LT/RB yank, A honk, B let go, X bread, Y switch bread, Start book, Back reset.

## Deploy

`.github/workflows/ci.yml` typechecks, tests and builds every push and PR. With repo secrets `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`, it deploys `main` to production and uploads each PR as a preview version (`pr-<number>` alias).

See `docs/PARITY.md` for every intentional difference from the HTML prototype.
