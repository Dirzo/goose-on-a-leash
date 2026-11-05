import Phaser from 'phaser';
import './style.css';
import { GameScene } from './scenes/GameScene';
import { mountUi } from './view/ui';
import { SCREEN_H, SCREEN_W } from './view/art';

async function boot(): Promise<void> {
  // Canvas text needs the web fonts loaded first, or Phaser bakes in the fallback face.
  try { await Promise.race([document.fonts.ready, new Promise(r => setTimeout(r, 2500))]); } catch { /* fonts are optional */ }

  const scene = new GameScene();
  scene.onReady = s => mountUi(s);

  const game = new Phaser.Game({
    type: Phaser.WEBGL,
    parent: 'stage',
    width: SCREEN_W,
    height: SCREEN_H,
    backgroundColor: '#0c0a18',
    scene: [scene],
    input: { gamepad: true },
    scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_HORIZONTALLY },
    render: { antialias: true },
  });
  game.canvas.tabIndex = 0;
  game.canvas.setAttribute('aria-label', 'Game: Rocco the raccoon and Biscuit the leashed goose at Willowmere Pond');
  // Expose for debugging and the parity harness.
  (window as unknown as { goose: unknown }).goose = { game, scene };
}

void boot();
