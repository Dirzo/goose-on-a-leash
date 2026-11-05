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

from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
sys.path.insert(0, os.path.join(HERE, 'characters'))
import biscuit_hd  # noqa: E402
import critters_hd  # noqa: E402
import rocco_hd  # noqa: E402

OUT = os.path.join(HERE, '..', 'src', 'assets', 'sprites')
os.makedirs(OUT, exist_ok=True)
manifest = {}

def strip(name, frames, anchor, points=None):
    w, h = frames[0].size
    im = Image.new('RGBA', (w * len(frames), h), (0, 0, 0, 0))
    for i, f in enumerate(frames):
        im.paste(f, (i * w, 0))
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

strip('biscuit_idle', [biscuit_hd.build_idle(i) for i in range(8)], (24, 58), {'neck': [31, 26]})
strip('biscuit_fling', [biscuit_hd.build_fling(i) for i in range(8)], (22, 28), {'neck': [32, 16]})
strip('frog', [critters_hd.frog(False), critters_hd.frog(True)], (13, 15))
strip('frog_awake', [critters_hd.frog(False, awake=True), critters_hd.frog(True, awake=True)], (13, 15))
strip('snapper', [critters_hd.snapper(False, submerged=False), critters_hd.snapper(True, submerged=False)], (30, 24))

with open(os.path.join(OUT, 'sprites.json'), 'w') as f:
    json.dump(manifest, f, indent=1)
print(f'exported {len(manifest)} strips to {os.path.normpath(OUT)}')
