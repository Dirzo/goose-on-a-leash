"""
World props drawn as y-sorted sprites (so Rocco can walk behind them): Hollowbark trees.

tree(variant): a gnarled trunk rising from splayed roots into a low, dark crown with moonlit edges.
The anchor is the centre of the trunk's base, which matches the 44x44 collision square in the room data.
"""
import math
import os
import random
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
from hdkit import Layer, composite, hx  # noqa: E402

TPAL = {k: hx(v) for k, v in {
    'T0': '1e140c', 'T1': '34241a', 'T2': '4e3622', 'T3': '6a4a2c', 'T4': '8a6638', 'HOLE': '0a0806',
    'L0': '0e160e', 'L1': '16261a', 'L2': '213a24', 'L3': '2f5232', 'L4': '4a7448', 'MOON': '8aa0b0', 'MOSS': '5a7a3a',
}.items()}
TREE_W, TREE_H = 96, 140
TREE_ANCHOR = (48, 128)


def tree(variant=0):
    rng = random.Random(variant * 7 + 3)
    w, h = TREE_W, TREE_H
    L = []
    crown_b = Layer('crownb', w, h, TPAL)                       # far leaves
    for _ in range(14):
        crown_b.ell(rng.uniform(14, 82), rng.uniform(12, 46), rng.uniform(12, 20), rng.uniform(9, 14), 'L1')
    L.append(crown_b)
    trunk = Layer('trunk', w, h, TPAL)
    lean = rng.uniform(-4, 4)
    for y in range(40, 128):                                   # widening toward the roots
        u = (y - 40) / 88
        half = 11 + u * u * 9
        cx = 48 + lean * (1 - u)
        trunk.rect(cx - half, y, cx + half, y, 'T1')
        trunk.rect(cx - half, y, cx - half + 3, y, 'T0')
        trunk.rect(cx + half - 4, y, cx + half, y, 'T2')
    for x0 in (-6, 0, 6):                                      # bark grooves
        trunk.line([(48 + x0 + lean, 44), (48 + x0 * 1.4, 126)], 'T0')
    for (dx, l) in [(-1, 22), (1, 24), (-1, 14), (1, 12)]:     # splayed roots
        sx = 48 + dx * rng.uniform(8, 16)
        trunk.poly([(sx, 116), (sx + dx * l, 130), (sx + dx * (l - 6), 132), (sx - dx * 4, 122)], 'T1')
    if variant % 2 == 0:
        trunk.ell(46 + lean * 0.5, 84, 4, 6, 'HOLE'); trunk.ell(46 + lean * 0.5, 82, 3, 2, 'T0')
    trunk.ell(42, 100, 4, 3, 'MOSS'); trunk.ell(54, 112, 3, 2, 'MOSS')
    L.append(trunk)
    crown = Layer('crown', w, h, TPAL)                          # near leaves, lit by the moon on top
    for _ in range(16):
        x, y = rng.uniform(10, 86), rng.uniform(6, 44)
        r = rng.uniform(9, 16)
        crown.ell(x, y, r, r * 0.75, 'L2')
        crown.ell(x - 2, y - 3, r * 0.6, r * 0.4, 'L3')
        if y < 22: crown.ell(x - 3, y - 5, r * 0.35, r * 0.2, 'L4')
    for _ in range(10):
        crown.px(rng.uniform(16, 80), rng.uniform(4, 20), 'MOON')
    L.append(crown)
    return composite(L)


def main(out_dir):
    from PIL import Image
    os.makedirs(out_dir, exist_ok=True)
    im = Image.new('RGB', (TREE_W * 3 + 20, TREE_H + 10), hx('231e15'))
    for v in range(3):
        t = tree(v); im.paste(t, (5 + v * (TREE_W + 5), 5), t)
    im.resize((im.width * 3, im.height * 3), Image.NEAREST).save(os.path.join(out_dir, 'trees.png'))
    print('ok')


if __name__ == '__main__':
    main(sys.argv[1] if len(sys.argv) > 1 else '.')
