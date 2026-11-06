import type Phaser from 'phaser';
import type { InputFrame } from '../core/sim';
import type { Vec } from '../core/math';

type Verb = 'fling' | 'yank' | 'honk' | 'letGo' | 'feed' | 'cycle' | 'patch' | 'roll';
export type UiAction = 'book' | 'reset' | 'closeBook' | 'pack' | 'close' | 'patch' | 'advance';

const ARROWS = ['arrowup', 'arrowdown', 'arrowleft', 'arrowright'];
const GAME_KEYS = ['w', 'a', 's', 'd', ' ', 'e', 'q', 'f', 'r', 'b', 'c', 'p', 'i', 'tab', 'm', 'shift', 'g', ...ARROWS];
const DEADZONE = 0.22;

/**
 * Collects keyboard, mouse and gamepad input into InputFrames for the fixed-step sim.
 * Verb presses are latched until a sim step consumes them, so a press is never lost
 * on a frame where no step runs, and never applied twice when several steps run.
 *
 * Keyboard (prototype layout): WASD/arrows move, Space honk, E yank, Q let go, F bread, C swap bread, P patch pack,
 * I or Tab backpack screen, B book, R restart room.
 * Mouse: left click fling, right click yank, cursor aims.
 * Gamepad: left stick move, right stick aim, RT fling, LT or RB yank, A honk, B let go, X bread, Y swap bread,
 * LB patch pack, Start book, Back (View) backpack screen.
 */
export class Controls {
  private held = new Set<string>();
  /** Set by the scene: once Rocco has the Ferryman's Oar, right mouse / RB hold it up instead of yanking. */
  oar = false;
  /** Set by the scene while a cinematic plays: Space / Enter / click advance it, Esc skips. */
  cinema = false;
  /** Set by the scene in scripted bits (catching Biscuit): walk only, no verbs. */
  verbsOff = false;
  private rmb = false;
  private padGuard = false;
  private pending = new Set<Verb>();
  /** Pointer position in screen pixels; converted to world space each frame, since the camera scrolls. */
  private mouse: Vec = { x: 480, y: 300 };
  private aimMode: 'mouse' | 'pad' = 'mouse';
  private padAim: Vec = { x: 1, y: 0 };
  private padPrev: Record<string, boolean> = {};
  onUi: (a: UiAction) => void = () => {};
  /** While true (book open), gameplay keys are ignored. */
  paused = false;

  constructor(private scene: Phaser.Scene, private canvas: HTMLCanvasElement) {
    window.addEventListener('keydown', this.keydown);
    window.addEventListener('keyup', this.keyup);
    window.addEventListener('blur', this.clear);
    scene.input.mouse?.disableContextMenu();
    scene.input.on('pointermove', (p: Phaser.Input.Pointer) => { this.mouse = { x: p.x, y: p.y }; this.aimMode = 'mouse'; });
    scene.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      this.canvas.focus();
      this.mouse = { x: p.x, y: p.y }; this.aimMode = 'mouse';
      if (this.paused) { if (this.cinema) this.onUi('advance'); return; }
      if (p.rightButtonDown()) { if (this.oar) this.rmb = true; else this.pending.add('yank'); } else this.pending.add('fling');
    });
    scene.input.on('pointerup', (p: Phaser.Input.Pointer) => { if ((p.event as MouseEvent | undefined)?.button === 2 || !p.rightButtonDown()) this.rmb = false; });
    scene.events.once('shutdown', () => this.destroy());
  }

  destroy(): void {
    window.removeEventListener('keydown', this.keydown);
    window.removeEventListener('keyup', this.keyup);
    window.removeEventListener('blur', this.clear);
  }

  private clear = (): void => { this.held.clear(); this.rmb = false; };

  private keydown = (e: KeyboardEvent): void => {
    const k = e.key.toLowerCase();
    const ae = document.activeElement as HTMLElement | null;
    const onSlider = ae instanceof HTMLInputElement && ae.type === 'range';
    const onButton = ae?.tagName === 'BUTTON';
    if (this.paused) {
      // a screen is open (book or backpack): the UI layer decides what each key does
      if (this.cinema && (k === ' ' || k === 'enter')) { e.preventDefault(); if (!e.repeat) this.onUi('advance'); return; }
      if (k === 'b') { e.preventDefault(); this.onUi('book'); }
      else if (k === 'escape') { e.preventDefault(); this.onUi('close'); }
      else if (k === 'i' || k === 'tab') { e.preventDefault(); this.onUi('pack'); }
      else if (k === 'p' && !e.repeat) { e.preventDefault(); this.onUi('patch'); }
      else if (k === 'r' && !e.repeat) { e.preventDefault(); this.onUi('reset'); }
      return;
    }
    if (onSlider && ARROWS.includes(k)) return;          // arrows adjust the focused slider
    if (onButton && (k === ' ' || k === 'enter')) return; // let buttons click
    if (ae instanceof HTMLInputElement && ae.type !== 'range') return; // typing in a field
    if (GAME_KEYS.includes(k)) { e.preventDefault(); if (onSlider) ae.blur(); }
    if (e.repeat) return;
    this.held.add(k);
    if (k === ' ') this.pending.add('honk');
    if (k === 'shift') this.pending.add('roll');
    if (k === 'e') this.pending.add('yank');
    if (k === 'q') this.pending.add('letGo');
    if (k === 'f') this.pending.add('feed');
    if (k === 'c') this.pending.add('cycle');
    if (k === 'p') this.pending.add('patch');
    if (k === 'b') this.onUi('book');
    if (k === 'i' || k === 'tab') this.onUi('pack');
    if (k === 'r') this.onUi('reset');
  };

  private keyup = (e: KeyboardEvent): void => { this.held.delete(e.key.toLowerCase()); };

  /** Poll the gamepad once per rendered frame. */
  pollPad(): void {
    const pads = this.scene.input.gamepad;
    const pad = pads && pads.total > 0 ? pads.pad1 : null;
    if (!pad) return;
    const rs = pad.rightStick;
    if (Math.hypot(rs.x, rs.y) > 0.5) { this.padAim = { x: rs.x, y: rs.y }; this.aimMode = 'pad'; }
    const ls = pad.leftStick;
    if (Math.hypot(ls.x, ls.y) > DEADZONE) this.aimMode = this.aimMode === 'pad' || Math.hypot(rs.x, rs.y) > 0.5 ? 'pad' : this.aimMode;
    const now: Record<string, boolean> = {
      fling: pad.R2 > 0.5, yank: pad.L2 > 0.5 || (pad.R1 > 0.5 && !this.oar), honk: pad.A, roll: pad.B, letGo: pad.isButtonDown(11), feed: pad.X, cycle: pad.Y, patch: pad.L1 > 0.5,
      book: pad.isButtonDown(9), pack: pad.isButtonDown(8),
    };
    this.padGuard = this.oar && pad.R1 > 0.5;
    for (const [k, v] of Object.entries(now)) {
      if (v && !this.padPrev[k]) {
        if (k === 'book') this.onUi('book');
        else if (k === 'pack') this.onUi('pack');
        else if (k === 'patch' && this.paused) this.onUi('patch');
        else if (!this.paused) { this.pending.add(k as Verb); if (k === 'fling') this.aimMode = 'pad'; }
      }
      this.padPrev[k] = v;
    }
  }

  private move(): Vec {
    let x = (this.held.has('d') || this.held.has('arrowright') ? 1 : 0) - (this.held.has('a') || this.held.has('arrowleft') ? 1 : 0);
    let y = (this.held.has('s') || this.held.has('arrowdown') ? 1 : 0) - (this.held.has('w') || this.held.has('arrowup') ? 1 : 0);
    const pads = this.scene.input.gamepad;
    const pad = pads && pads.total > 0 ? pads.pad1 : null;
    if (pad) {
      const ls = pad.leftStick;
      if (Math.hypot(ls.x, ls.y) > DEADZONE) { x += ls.x; y += ls.y; }
      if (pad.left) x -= 1; if (pad.right) x += 1; if (pad.up) y -= 1; if (pad.down) y += 1;
    }
    const l = Math.hypot(x, y);
    return l > 1 ? { x: x / l, y: y / l } : { x, y };
  }

  /** Where verbs aim, in world space. Pad aim projects from Rocco along the right stick. */
  aim(player: Vec): Vec {
    if (this.aimMode === 'mouse') { const w = this.scene.cameras.main.getWorldPoint(this.mouse.x, this.mouse.y); return { x: w.x, y: w.y }; }
    const l = Math.hypot(this.padAim.x, this.padAim.y) || 1;
    return { x: player.x + (this.padAim.x / l) * 220, y: player.y + (this.padAim.y / l) * 220 };
  }

  get usingPad(): boolean { return this.aimMode === 'pad'; }

  /** Build the input for one sim step. Pass consume=true for the first step of a frame. */
  frame(player: Vec, consume: boolean): InputFrame {
    const m = this.paused ? { x: 0, y: 0 } : this.move();
    const a = this.aim(player);
    const f: InputFrame = { moveX: m.x, moveY: m.y, aimX: a.x, aimY: a.y };
    if (!this.paused) f.guard = this.held.has('g') || this.rmb || this.padGuard;
    if (consume && !this.paused) {
      if (!this.verbsOff) for (const v of this.pending) f[v] = true;
      this.pending.clear();
    }
    return f;
  }

  dropPending(): void { this.pending.clear(); }
}
