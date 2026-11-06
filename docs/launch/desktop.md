# Desktop build (Electron and Steamworks) outline

The game is a static web build, so the desktop version is a thin wrapper around `dist/`.

## Shape

* `desktop/` package with Electron, loading `dist/index.html` from disk (no server), `contextIsolation: true`, no node integration in the page.
* Window 1280 × 720 minimum, fullscreen toggle on F11 and in Settings, remember size and position.
* Saves: keep using `localStorage` (Electron persists it per app), plus an export to a file from the bench so Steam Cloud can sync it.
* Build with `electron-builder` for Windows (NSIS and portable), macOS (universal, notarized) and Linux (AppImage).

## Steamworks

* Use `steamworks.js` (or greenworks) in the main process only; expose a tiny API through a preload script:
  `achievements.unlock(id)`, `stats.set(name, value)`, `cloud.save(json)`.
* **Achievements:** one per boss, the Moon Elixir, all 30 fish, Basement floors 5, 10 and 20, a perfect-cast streak of 10.
* **Leaderboard:** the Basement's deepest floor (descending), using the same order as the local board.
* **Steam Cloud:** the save code (`encodeSave`) written to a single file.
* Steam Deck: the controls already support a gamepad; check text sizes at 1280 × 800 and verify "Deck Verified" items.

## Checklist before a Steam build

- [ ] App ID and depots set up; `steam_appid.txt` only in dev
- [ ] The sim emits events for achievements (boss down, fish journal complete, floor reached) and the wrapper listens
- [ ] Pause on focus loss; mute on minimize
- [ ] Controller glyphs when a pad is in use
- [ ] Crash log to a file
