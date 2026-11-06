"""
Willowmere Pond, the hub room, rendered at native resolution (1 world unit = 1 pixel) from
src/data/rooms/willowmere.json, which is the single source of layout for the game and this script.

Top-down 3/4 view under the blood moon: mossy banks, an organic pond inside the pit rects,
the dock over the water, mooring posts, reeds and lily pads, burrows, the stump/log/rock, the
fence around the exit, the fishing bell, and a warm lantern pool on the dock.
The gate, tackle box, items and creatures are drawn by the game.

Run: python3 art/rooms/willowmere.py   (writes src/assets/rooms/willowmere.png)
"""
import json
import math
import os
import random
import sys

import numpy as np
from PIL import Image

HERE = os.path.dirname(__file__)
ROOT = os.path.join(HERE, '..', '..')
R = json.load(open(os.path.join(ROOT, 'src', 'data', 'rooms', 'willowmere.json')))
W, H = R['width'], R['height']
rng = random.Random(7)

def hx(s): return np.array([int(s[i:i + 2], 16) for i in (0, 2, 4)], np.float32)
P = {k: hx(v) for k, v in {
    'Q0': '15211b', 'Q1': '1d3025', 'Q2': '273f30', 'Q3': '37583f', 'Q4': '4c7454',
    'D0': '261e17', 'D1': '362b20', 'D2': '483a2a', 'MUD': '2a2219',
    'W0': '0a1b27', 'W1': '102636', 'W2': '173547', 'W3': '28566a', 'WR1': '8a1c2c', 'WR2': 'd83a4a',
    'RD0': '1d3622', 'RD1': '2c4e30', 'RD2': '3e6a40', 'CT0': '4e3018', 'CT1': '7a4a26',
    'LP0': '1f4a2a', 'LP1': '2f6a3a', 'LP2': '4a8e52', 'FLW': 'e88aa8', 'FLW2': 'fff0f4', 'FLW3': 'f4c040',
    'B0': '3a2512', 'B1': '5e3e20', 'B2': '86582f', 'B3': 'b48250', 'NAIL': '1a1218',
    'L2': 'f0a040', 'L3': 'ffd27a', 'L4': 'fff4c0', 'OUT': '1a1522',
    'TREE': '0a110f', 'TREE2': '111a17', 'TREE3': '1a2a20',
    'ST0': '3a3a46', 'ST1': '565666', 'ST2': '7a7a8c', 'BARK0': '2e1e12', 'BARK1': '4a3020', 'RING': '8a6a44',
    'BELL0': '8a6a1a', 'BELL1': 'd8a830', 'BELL2': 'ffe27a', 'HOLE': '0a0806', 'MOON': 'ff5a5a',
}.items()}

yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
img = np.zeros((H, W, 3), np.float32)

def rect_mask(r, grow=0.0):
    return (xx >= r['x'] - grow) & (xx < r['x'] + r['w'] + grow) & (yy >= r['y'] - grow) & (yy < r['y'] + r['h'] + grow)

# ---------------------------------------------------------------- ground
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from ground import paint_ground, paint_path  # noqa: E402
rng_np = np.random.default_rng(4242)
P.setdefault('Q5', P['Q4'] * 1.25)
paint_ground(img, np.ones((H, W), bool), P, rng_np, 4242, woods=False)

# organic water: union of the pit rects, edge pushed in/out a few pixels by noise, corners rounded
edge_noise = 9.0 * np.sin(xx * 0.021 + yy * 0.033) + 6.0 * np.sin(yy * 0.047 - xx * 0.029) + 2.0 * np.sin(yy * 0.17 - xx * 0.07)
def sdf_rect(r, rad=48):
    rad = min(rad, r['w'] / 2, r['h'] / 2)
    cx, cy = r['x'] + r['w'] / 2, r['y'] + r['h'] / 2
    qx = np.abs(xx - cx) - (r['w'] / 2 - rad); qy = np.abs(yy - cy) - (r['h'] / 2 - rad)
    return np.hypot(np.maximum(qx, 0), np.maximum(qy, 0)) + np.minimum(np.maximum(qx, qy), 0) - rad
ds = np.stack([sdf_rect(p) for p in R['pits']])
k_ = 30.0                                                          # smooth union so the lobes blend
sd = -k_ * np.log(np.sum(np.exp(-ds / k_), axis=0)) - edge_noise * 0.6
water = sd < 0
bank = (sd >= 0) & (sd < 7)
img[bank] = P['D1']; img[bank & (sd < 3)] = P['MUD']; img[(sd >= 5) & (sd < 7)] = P['D2']
wn = np.sin(xx * 0.045 + np.sin(yy * 0.05) * 2 + yy * 0.012) * np.sin(yy * 0.21 + np.sin(xx * 0.03) * 1.5) + 0.6 * np.sin(xx * 0.013 - yy * 0.02)
img[water] = P['W1']; img[water & (wn < -0.9)] = P['W0']; img[water & (wn >= 0.7)] = P['W2']
deep = sd < -40
img[deep & (wn < 0.2)] = P['W0']
img[water & (sd > -3)] = P['W2']                                   # shallows rim
img[water & (sd > -1.2)] = P['W3']
# blood-moon reflection on the open water
mx, my = 650, 170
for rr, c in [(30, 'WR1'), (20, 'WR2')]:
    m = water & (np.hypot((xx - mx) / 1.0, (yy - my) / 0.55) < rr) & (((yy.astype(int)) % 3) != 0)
    img[m] = img[m] * 0.45 + P[c] * 0.55

# dirt trail from the start, past the tackle box, to the dock
path = np.zeros((H, W), bool)
ps, pd = R['playerStart'], R['bridges'][0]
pts = [(30, ps['y']), (ps['x'], ps['y']), (210, 300), (pd['x'] + 6, pd['y'] + pd['h'] / 2)]
pts2 = [(ps['x'], ps['y']), (110, 380), (R['bucket']['x'] + 20, R['bucket']['y'] - 10)]
for seq, rad in ((pts, 15), (pts2, 10)):
    for a, b in zip(seq, seq[1:]):
        for i in range(24):
            u = i / 23
            cx, cy = a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u
            r = rad + 2 * math.sin(cx * 0.2) + 2.2 * np.sin(xx * 0.9 + yy * 1.3 + i)
            path |= np.hypot(xx - cx, (yy - cy) * 1.3) < r
path &= ~water & ~bank
pn = np.sin(xx * 0.31 + yy * 0.17) * np.sin(yy * 0.43 - xx * 0.12)
paint_path(img, path, P, rng_np, 4249, woods=False)

land = ~water & ~bank & ~path
def scatter(n, fn, x0=24, x1=W - 24, y0=24, y1=H - 24):
    for _ in range(n):
        x, y = rng.randrange(x0, x1), rng.randrange(y0, y1)
        if land[y, x]: fn(x, y)
def blade(x, y):
    for k, (dx, dy) in enumerate([(0, 0), (-1, -1), (1, -1), (-2, -2), (2, -3), (0, -2), (0, -3)]):
        img[y + dy, x + dx] = P['Q3'] if k < 4 else P['Q4']
def flower(x, y): img[y, x] = P[rng.choice(['FLW', 'FLW2', 'FLW3'])]
scatter(250, blade); scatter(40, flower)

def px(x, y, c):
    if 0 <= x < W and 0 <= y < H: img[int(y), int(x)] = P[c]

# ---------------------------------------------------------------- reeds and lily pads
def reeds(rx, ry, n):
    for k in range(n):
        x = rx + k * 3 + rng.choice([0, 1]); hgt = rng.randrange(14, 30); lean = rng.choice([-1, 0, 1])
        for yv in range(ry - hgt, ry):
            xo = x + int(lean * (ry - yv) / 12); px(xo, yv, 'RD1'); px(xo + 1, yv, 'RD0')
        if rng.random() < 0.55:
            tx = x + int(lean * hgt / 12)
            for j in range(7):
                px(tx, ry - hgt - j, 'CT1'); px(tx + 1, ry - hgt - j, 'CT1'); px(tx + 2, ry - hgt - j, 'CT0')
for _ in range(34):                       # clumps along the bank, away from the dock
    for _try in range(40):
        x, y = rng.randrange(30, W - 30), rng.randrange(40, H - 30)
        if bank[y, x] and not (pd['y'] - 30 < y < pd['y'] + pd['h'] + 30 and x < 640):
            reeds(x - 6, y + 4, rng.randrange(3, 7)); break
for _ in range(16):
    for _try in range(60):
        lx, ly = rng.randrange(450, 760), rng.randrange(60, 560)
        if water[ly, lx] and sd[ly, lx] < -14 and not (pd['y'] - 24 < ly < pd['y'] + pd['h'] + 24):
            r = rng.randrange(8, 14)
            e = ((xx - lx) / r) ** 2 + ((yy - ly) / (r * 0.6)) ** 2
            notch = (xx > lx) & (np.abs(yy - ly) < 1.2) & (xx < lx + r)
            pad = (e <= 1) & ~notch
            img[pad] = P['LP1']; img[pad & (e < 0.4)] = P['LP2']; img[pad & (e > 0.75)] = P['LP0']
            img[(e > 1) & (e <= 1.25) & ~notch] = P['OUT']
            if rng.random() < 0.35:
                for (dx, dy, c) in [(0, -3, 'FLW2'), (-2, -2, 'FLW'), (2, -2, 'FLW'), (-1, -4, 'FLW'), (1, -4, 'FLW'), (0, -2, 'FLW3')]:
                    px(lx + dx, ly + dy, c)
            break

# ---------------------------------------------------------------- dock (over the bridge rect)
for br in R['bridges']:
    x0, y0, x1, y1 = br['x'], br['y'], br['x'] + br['w'], br['y'] + br['h']
    sh = (xx >= x0 + 3) & (xx < x1 + 3) & (yy >= y1) & (yy < y1 + 7) & water
    img[sh] *= 0.55                                        # shadow on the water
    for px_ in range(x0 + 20, x1, 44):                     # pilings
        for y_ in (y0 - 3, y1 - 1):
            img[y_:y_ + 5, px_:px_ + 6] = P['B0']; img[y_, px_:px_ + 6] = P['B1']
    for x in range(x0, x1):
        plank = (x - x0) // 9
        img[y0:y1, x] = P['B2'] if plank % 2 else P['B1']
        if (x - x0) % 9 == 0: img[y0:y1, x] = P['B0']
        if (x * 7 + plank * 3) % 23 == 0: img[y0 + 6:y0 + 9, x] = P['B0']   # grain knots
    img[y0, x0:x1] = P['B3']; img[y0 + 1, x0:x1] = P['B3']; img[y1 - 1, x0:x1] = P['OUT']; img[y1 - 2, x0:x1] = P['B0']
    for x in range(x0 + 4, x1, 9):
        px(x, y0 + 4, 'NAIL'); px(x, y1 - 5, 'NAIL')

# ---------------------------------------------------------------- posts, stump, log, rock, fence
def disk(cx, cy, r, c, sy=1.0):
    m = np.hypot(xx - cx, (yy - cy) / sy) <= r; img[m] = P[c]; return m
def shadow(cx, cy, rx, ry, k=0.55):
    m = (((xx - cx) / rx) ** 2 + ((yy - cy) / ry) ** 2) <= 1; img[m] *= k
for p in R['posts']:                                       # mooring posts: thick tarred bollards
    shadow(p['x'] + 3, p['y'] + 6, p['r'] + 4, 5)
    disk(p['x'], p['y'], p['r'] + 1, 'OUT'); disk(p['x'], p['y'], p['r'], 'BARK0')
    disk(p['x'] - 1, p['y'] - 2, p['r'] - 2, 'BARK1'); disk(p['x'] - 1, p['y'] - 2, p['r'] - 5, 'RING')
    for a in range(0, 360, 30):                            # rope coils
        rx, ry = p['x'] + math.cos(math.radians(a)) * (p['r'] - 0.5), p['y'] + math.sin(math.radians(a)) * (p['r'] - 0.5)
        px(rx, ry, 'B3')

walls = R['walls']
props = [w for w in walls if w['x'] > 0 and w['y'] > 0 and w['x'] + w['w'] < W and w['y'] + w['h'] < H]
stump, log, rock, fence = props   # border walls touch the room edge
# stump
cx, cy = stump['x'] + stump['w'] / 2, stump['y'] + stump['h'] / 2
shadow(cx + 4, cy + 10, 24, 8)
img[int(cy):int(cy) + 14, stump['x'] + 2:stump['x'] + stump['w'] - 2] = P['BARK0']
for x in range(stump['x'] + 4, stump['x'] + stump['w'] - 4, 5): img[int(cy):int(cy) + 14, x] = P['BARK1']
disk(cx, cy, 20, 'OUT', 0.6); disk(cx, cy, 19, 'BARK1', 0.6); disk(cx, cy, 16, 'RING', 0.6)
for rr in (12, 8, 4):
    m = (np.abs(np.hypot(xx - cx, (yy - cy) / 0.6) - rr) < 0.6); img[m] = P['BARK1']
# log (horizontal)
lx0, ly0, lx1, ly1 = log['x'], log['y'], log['x'] + log['w'], log['y'] + log['h']
shadow((lx0 + lx1) / 2 + 4, ly1 + 2, log['w'] / 2 + 6, 6)
img[ly0:ly1, lx0:lx1] = P['BARK1']; img[ly0:ly0 + 4, lx0:lx1] = P['RING'] * 0.6 + P['BARK1'] * 0.4
for x in range(lx0, lx1, 7): img[ly0 + 6:ly1 - 3, x] = P['BARK0']
img[ly0, lx0:lx1] = P['OUT']; img[ly1 - 1, lx0:lx1] = P['OUT']
disk(lx1, (ly0 + ly1) / 2, log['h'] / 2, 'OUT', 1); disk(lx1, (ly0 + ly1) / 2, log['h'] / 2 - 1, 'RING', 1)
disk(lx1, (ly0 + ly1) / 2, log['h'] / 4, 'BARK1', 1)
for k in range(5): px(lx0 + 10 + k * 9, ly0 - 1, 'Q4')                # moss
# rock
rcx, rcy = rock['x'] + rock['w'] / 2, rock['y'] + rock['h'] / 2
shadow(rcx + 4, rcy + 10, 26, 8)
m = disk(rcx, rcy, 23, 'OUT', 0.75); disk(rcx, rcy, 22, 'ST0', 0.75); disk(rcx - 3, rcy - 3, 16, 'ST1', 0.75)
disk(rcx - 7, rcy - 7, 6, 'ST2', 0.75)
for k in range(6): px(rcx - 10 + k * 4, rcy + 12, 'Q3')
# fence around the exit corner: vertical wall + rails above the gate line
fx0, fy0, fy1 = fence['x'], fence['y'], fence['y'] + fence['h']
for y in range(fy0 + 2, fy1, 14):
    img[y:y + 10, fx0 + 2:fx0 + 10] = P['B1']; img[y, fx0 + 2:fx0 + 10] = P['B3']; img[y + 9, fx0 + 2:fx0 + 10] = P['OUT']
img[fy0:fy1, fx0 + 5:fx0 + 7] = P['B0']
g_ = R['gate']
for x in (g_['x'], g_['x'] + g_['w'] - 8):                 # gate posts (the gate itself is dynamic)
    img[g_['y'] - 6:g_['y'] + g_['h'] + 2, x:x + 8] = P['B1']; img[g_['y'] - 6, x:x + 8] = P['B3']
    img[g_['y'] + g_['h'] + 1, x:x + 8] = P['OUT']
# exit: a reed-lined trail leading off the top edge
d0 = R['doors'][0]; ex = {'x': d0['x'], 'y': 24, 'w': d0['w'], 'h': 84}   # the trail north to Reedmarsh
trail = rect_mask({'x': ex['x'] + 18, 'y': 0, 'w': ex['w'] - 36, 'h': ex['h'] + 4}) & ~(np.sin(xx * 0.7 + yy) > 0.92)
img[trail] = P['D1']; img[trail & (pn > 0.45)] = P['D2']
for k in range(6):
    reeds(ex['x'] + 4, 30 + k * 13, 2); reeds(ex['x'] + ex['w'] - 12, 34 + k * 13, 2)

# burrows at the vents
for v in R['vents']:
    shadow(v['x'], v['y'] + 3, 16, 9, 0.7)
    disk(v['x'], v['y'] - 2, 14, 'D1', 0.55); disk(v['x'], v['y'] - 3, 12, 'D2', 0.5)
    disk(v['x'], v['y'], 9, 'HOLE', 0.6)
    for k in range(5): px(v['x'] - 10 + k * 5, v['y'] - 9 + (k % 2), 'D0')

# fishing bell on a gallows post
b = R['bell']
img[b['y'] - 30:b['y'] + 18, b['x'] + 16:b['x'] + 20] = P['B1']; img[b['y'] - 30:b['y'] + 18, b['x'] + 20] = P['OUT']
img[b['y'] - 30:b['y'] - 26, b['x'] - 2:b['x'] + 20] = P['B1']; img[b['y'] - 31, b['x'] - 2:b['x'] + 20] = P['B3']
shadow(b['x'] + 10, b['y'] + 18, 18, 5)

# ---------------------------------------------------------------- border: dark willow canopy
d_edge = np.minimum.reduce([xx, W - 1 - xx, yy, H - 1 - yy])
wobble = 6 * np.sin(xx * 0.08) * np.sin(yy * 0.05) + 5 * np.sin((xx + yy) * 0.13) + 4
ex_gap = (xx > ex['x'] + 16) & (xx < ex['x'] + ex['w'] - 16) & (yy < 40)
canopy = (d_edge < 18 + wobble) & ~ex_gap
img[canopy] = P['TREE']; img[canopy & (((xx * 7 + yy * 3) % 11) < 2)] = P['TREE2']
rim = (d_edge >= 18 + wobble) & (d_edge < 21 + wobble) & ~ex_gap
img[rim] = P['TREE3']
# hanging willow strands along the top canopy
for x in range(24, W - 24, 5):
    if ex['x'] + 10 < x < ex['x'] + ex['w'] - 10: continue
    L = rng.randrange(6, 22)
    for y in range(20, 20 + L):
        if not water[y, x]: px(x + (y // 7) % 2, y + 6, 'RD0')

# ---------------------------------------------------------------- lighting: moonlit wash, lantern pool, vignette
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from depth import depth_pass, wall_mask  # noqa: E402
lan = R['lantern']
occ = wall_mask(R, H, W) | canopy
img = depth_pass(img, R, occ, water=water, seed=1.3)
red = np.array([1.06, 0.94, 1.0], np.float32)                   # the blood moon's tint
img = img * red
# lantern on the dock end
lantern = ["..OOOOO..", ".O43334O.", "O3344433O", "O2344432O", "O2233322O", ".O22222O.", "..OOOOO.."]
lx, ly = lan['x'] - 4, lan['y'] - 26
img[ly + 7:lan['y'], lan['x'] - 1:lan['x'] + 2] = P['B1']
for j, row in enumerate(lantern):
    for i, ch in enumerate(row):
        if ch != '.': img[ly + j, lx + i] = P[{'O': 'OUT', '2': 'L2', '3': 'L3', '4': 'L4'}[ch]]

out = os.path.join(ROOT, 'src', 'assets', 'rooms')
os.makedirs(out, exist_ok=True)
Image.fromarray(np.clip(img, 0, 255).astype(np.uint8)).quantize(colors=256, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE).save(os.path.join(out, 'willowmere.png'), optimize=True)
print('ok', W, H)
