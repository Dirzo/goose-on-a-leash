"""
Export the fine-resolution character art as sprite strips for the game.

Writes src/assets/sprites/<name>.png (frames side by side) and src/assets/sprites/sprites.json:
  { name: { w, h, frames, anchor: [x, y], points: {name: [x, y]} } }
`anchor` is the pixel that sits on the simulation position (the feet, or the body centre for a flying goose).
`points` are attachment points in frame pixels (rod tip, neck, koi).

Run: python3 art/export_sprites.py
"""
import json
import os
import sys

import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
sys.path.insert(0, os.path.join(HERE, 'characters'))
import biscuit_hd  # noqa: E402
import critters_hd  # noqa: E402
import rocco_hd  # noqa: E402
import props_hd  # noqa: E402
sys.path.insert(0, os.path.join(HERE, 'ui'))
import backpack_ui as bui  # noqa: E402

OUT = os.path.join(HERE, '..', 'src', 'assets', 'sprites')
os.makedirs(OUT, exist_ok=True)
manifest = {}

MOON = np.array([196, 218, 244], np.float32)
NO_RIM = {'bimbo', 'pack_ui', 'patch', 'tear'}


def rim_light(f):
    """Moonlight from the upper left: the first pixels inside the outline on the top and left edges
    pick up a cool rim, so characters read against the dark like Death's Door's figures."""
    a = np.array(f).astype(np.float32)
    A = a[..., 3] > 0
    H, W = A.shape
    def at(dy, dx):            # A shifted so out[y, x] = A[y + dy, x + dx] (False off the edge)
        o = np.zeros_like(A)
        ys, yd = (slice(0, H - dy), slice(dy, H)) if dy >= 0 else (slice(-dy, H), slice(0, H + dy))
        xs, xd = (slice(0, W - dx), slice(dx, W)) if dx >= 0 else (slice(-dx, W), slice(0, W + dx))
        o[ys, xs] = A[yd, xd]
        return o
    outline = A & ~(at(-1, 0) & at(1, 0) & at(0, -1) & at(0, 1))
    inner = A & ~outline
    rim = inner & (~at(-2, 0) | ~at(-2, -2) | ~at(0, -2))
    soft = inner & ~rim & (~at(-3, 0) | ~at(-3, -3))
    for m, k in ((rim, 0.42), (soft, 0.16)):
        a[m, :3] = a[m, :3] * (1 - k) + MOON * k
    return Image.fromarray(np.clip(a, 0, 255).astype(np.uint8), 'RGBA')


def strip(name, frames, anchor, points=None):
    w, h = frames[0].size
    im = Image.new('RGBA', (w * len(frames), h), (0, 0, 0, 0))
    for i, f in enumerate(frames):
        im.paste(f if name in NO_RIM else rim_light(f.convert('RGBA')), (i * w, 0))
    im.save(os.path.join(OUT, f'{name}.png'))
    manifest[name] = {'w': w, 'h': h, 'frames': len(frames), 'anchor': list(anchor), 'points': points or {}}

# Rocco: idle/walk x pack leaking or not x koi happy or dry. Frame origin offsets match rocco_hd.build.
R_POINTS = {'rodTip': [72, 20], 'koi': [21, 31]}
for walk in (False, True):
    for leak in (False, True):
        for dry in (False, True):
            name = f"rocco_{'walk' if walk else 'idle'}{'_leak' if leak else ''}{'_dry' if dry else ''}"
            frames = [rocco_hd.build(i, leak=leak, water_level=0.2 if dry else 0.8, walk=walk) for i in range(8)]
            strip(name, frames, (40, 69), R_POINTS)
    # before the catch (the prologue): no koi in the pack yet
    name = f"rocco_{'walk' if walk else 'idle'}_empty"
    strip(name, [rocco_hd.build(i, leak=False, water_level=0.5, walk=walk, koi_in=False) for i in range(8)], (40, 69), R_POINTS)

strip('biscuit_idle', [biscuit_hd.build_idle(i) for i in range(8)], (24, 58), {'neck': [31, 26]})
strip('biscuit_fling', [biscuit_hd.build_fling(i) for i in range(8)], (22, 28), {'neck': [32, 16]})
strip('frog', [critters_hd.frog(False), critters_hd.frog(True)], (13, 15))
strip('frog_awake', [critters_hd.frog(False, awake=True), critters_hd.frog(True, awake=True)], (13, 15))
strip('snapper', [critters_hd.snapper(False, submerged=False), critters_hd.snapper(True, submerged=False)], (30, 24))
strip('snapper_awake', [critters_hd.snapper(False, submerged=False, awake=True), critters_hd.snapper(True, submerged=False, awake=True)], (30, 24))

# the Heron Ferryman: idle, idle-blink, wind, stab, gust; and awake
strip('heron', [critters_hd.heron('idle'), critters_hd.heron('idle', blink=True), critters_hd.heron('wind'),
                critters_hd.heron('stab'), critters_hd.heron('gust')], critters_hd.HERON_ANCHOR, {'beakStab': [71, 34]})
strip('heron_awake', [critters_hd.heron('idle', awake=True), critters_hd.heron('idle', blink=True, awake=True)], critters_hd.HERON_ANCHOR)

# Hollowbark Woods: squirrel (idle, blink, throw), badger (idle, blink, dig), the Burrow King (idle, blink, wind, charge, dazed)
strip('squirrel', [critters_hd.squirrel(), critters_hd.squirrel(blink=True), critters_hd.squirrel(pose='throw')], (15, 27))
strip('squirrel_awake', [critters_hd.squirrel(awake=True), critters_hd.squirrel(blink=True, awake=True)], (15, 27))
strip('badger', [critters_hd.badger(), critters_hd.badger(blink=True), critters_hd.badger(pose='dig')], (28, 33))
strip('badger_awake', [critters_hd.badger(awake=True), critters_hd.badger(blink=True, awake=True)], (28, 33))
strip('king', [critters_hd.burrow_king(), critters_hd.burrow_king(blink=True), critters_hd.burrow_king(pose='wind'),
               critters_hd.burrow_king(pose='charge'), critters_hd.burrow_king(pose='dazed')], (52, 70))
strip('king_awake', [critters_hd.burrow_king(awake=True), critters_hd.burrow_king(blink=True, awake=True)], (52, 70))

# Driftwood Wharf: crab (idle, blink, guard, snap), gull (idle, blink, fly, flap, dive), Captain Gullbeard
# (idle, blink, fly, flap, swoop, dazed), Pickett the otter (idle, blink, wave)
strip('crab', [critters_hd.crab(), critters_hd.crab(blink=True), critters_hd.crab(pose='guard'), critters_hd.crab(pose='snap')], (20, 26))
strip('crab_awake', [critters_hd.crab(awake=True), critters_hd.crab(blink=True, awake=True)], (20, 26))
strip('gull', [critters_hd.gull(), critters_hd.gull(blink=True), critters_hd.gull(pose='fly'), critters_hd.gull(pose='flap'), critters_hd.gull(pose='dive')], (21, 32))
strip('gull_awake', [critters_hd.gull(awake=True), critters_hd.gull(blink=True, awake=True), critters_hd.gull(pose='fly', awake=True), critters_hd.gull(pose='flap', awake=True)], (21, 32))
strip('gullbeard', [critters_hd.gullbeard(), critters_hd.gullbeard(blink=True), critters_hd.gullbeard(pose='fly'), critters_hd.gullbeard(pose='flap'),
                    critters_hd.gullbeard(pose='swoop'), critters_hd.gullbeard(pose='dazed')], critters_hd.GULLBEARD_ANCHOR)
strip('gullbeard_awake', [critters_hd.gullbeard(awake=True), critters_hd.gullbeard(blink=True, awake=True)], critters_hd.GULLBEARD_ANCHOR)
strip('pickett', [critters_hd.pickett(), critters_hd.pickett(blink=True), critters_hd.pickett(pose='wave')], (17, 39))

strip('tree', [props_hd.tree(v) for v in range(3)], props_hd.TREE_ANCHOR)

# backpack screen: Bimbo (happy, worried, gasping x open/blink), the pack, patches, tears
strip('bimbo', [bui.bimbo(m, b) for m in ('happy', 'worried', 'gasping') for b in (False, True)], bui.BIMBO_ANCHOR)
strip('pack_ui', [bui.pack()], (0, 0), {'window': list(bui.WINDOW), 'bimbo': list(bui.BIMBO_AT),
      **{f'slot{i}': list(p) for i, p in enumerate(bui.PATCH_SLOTS)}})
strip('patch', [bui.patch(i) for i in range(4)], (8, 7))
strip('tear', [bui.tear(0), bui.tear(1)], (7, 6))

with open(os.path.join(OUT, 'sprites.json'), 'w') as f:
    json.dump(manifest, f, indent=1)
print(f'exported {len(manifest)} strips to {os.path.normpath(OUT)}')
