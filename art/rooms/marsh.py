"""
Reedmarsh room backgrounds, rendered from each room's JSON at native resolution (1 world unit = 1 pixel).
Same look as Willowmere (art/rooms/willowmere.py), shifted toward a mistier, olive marsh.

Reads: pits (water), bridges (kind 'dock' = boardwalk planks, 'island' = grassy mound in the water),
walls (kind 'border' = dark canopy with gaps at the doors; 'stump' / 'log' / 'rock' props), posts,
bell (gallows post baked, bell drawn by the game), vents (burrows), paths (dirt trails), lantern.
The game draws gates, chests, items and creatures.

Run: python3 art/rooms/marsh.py [room-id ...]   (default: every reedmarsh-*.json)
"""
import glob
import json
import math
import os
import random
import sys

import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.join(HERE, '..', '..')
OUT = os.path.join(ROOT, 'src', 'assets', 'rooms')


sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from depth import depth_pass, wall_mask  # noqa: E402
from ground import dither_bands, fbm, paint_ground, paint_path  # noqa: E402

def hx(s): return np.array([int(s[i:i + 2], 16) for i in (0, 2, 4)], np.float32)
BASE_P = {k: hx(v) for k, v in {
    'Q0': '19221a', 'Q1': '222f22', 'Q2': '2d3d2a', 'Q3': '3e5636', 'Q4': '5a7346', 'Q5': '6e8048',
    'D0': '261e17', 'D1': '362b20', 'D2': '483a2a', 'MUD': '2a2219',
    'W0': '0b1a22', 'W1': '11252f', 'W2': '19343f', 'W3': '2c5560', 'WR1': '8a1c2c', 'WR2': 'd83a4a',
    'RD0': '1d3622', 'RD1': '2c4e30', 'RD2': '3e6a40', 'CT0': '4e3018', 'CT1': '7a4a26',
    'LP0': '1f4a2a', 'LP1': '2f6a3a', 'LP2': '4a8e52', 'FLW': 'e88aa8', 'FLW2': 'fff0f4', 'FLW3': 'f4c040',
    'B0': '3a2512', 'B1': '5e3e20', 'B2': '86582f', 'B3': 'b48250', 'NAIL': '1a1218',
    'L2': 'f0a040', 'L3': 'ffd27a', 'L4': 'fff4c0', 'OUT': '1a1522',
    'TREE': '0a100c', 'TREE2': '111912', 'TREE3': '1b281c',
    'ST0': '3a3a46', 'ST1': '565666', 'ST2': '7a7a8c', 'BARK0': '2e1e12', 'BARK1': '4a3020', 'RING': '8a6a44',
    'HOLE': '0a0806', 'FOG': '8a84a0',
}.items()}


# Hollowbark Woods: leaf litter and moss instead of marsh grass, darker canopy, rocky ravines
WOODS_P = {k: hx(v) for k, v in {
    'Q0': '1a1610', 'Q1': '231e15', 'Q2': '2d261a', 'Q3': '3a4628', 'Q4': '506038', 'Q5': '66703e',
    'LF1': '6e3e1c', 'LF2': '8e5a26', 'LF3': 'a87a34',
    'RV0': '060504', 'RV1': '0e0b08', 'RV2': '1a1510', 'ROCK0': '3a342a', 'ROCK1': '56503f', 'ROCK2': '766e58',
    'ROOT': '3e2a18', 'TR0': '22160e', 'TR1': '3a2616', 'TR2': '563a20', 'TR3': '74502c',
    'HD0': '0e180e', 'HD1': '18281a', 'HD2': '24402a', 'TH0': '2a1420', 'TH1': '442030', 'TH2': '6a3a48',
}.items()}


# Driftwood Wharf: moonlit sand and salt grass, a dark teal sea with foam on the shore, weathered planks,
# and black rock and pines round the edge instead of the forest
WHARF_P = {k: hx(v) for k, v in {
    'Q0': '2e2a26', 'Q1': '3a352e', 'Q2': '48423a', 'Q3': '4e5a44', 'Q4': '6a7a52', 'Q5': '8a8a62',
    'D0': '262420', 'D1': '403a32', 'D2': '585044', 'MUD': '2e2a26',
    'W0': '071a22', 'W1': '0c2630', 'W2': '14384a', 'W3': 'b8d8e0',
    'TREE': '0a0e12', 'TREE2': '10161c', 'TREE3': '1c2630',
    'B0': '2e2620', 'B1': '4e4236', 'B2': '6e604e', 'B3': '9a8a70',
    'CR0': '3a2a1a', 'CR1': '6a4a2a', 'CR2': '8e6a3e', 'CR3': 'b48a52',
    'RF0': '1a1e26', 'RF1': '2a303c', 'RF2': '3e4656', 'NET': '6a7a7a',
    'AW1': '3e8a8a', 'AW2': 'd8e0d8', 'IRON0': '1e2228', 'IRON1': '3e4652', 'IRON2': '6a7686', 'SHELL': 'e8dcd0',
}.items()}


# The Tide Caves: wet black rock, barnacles and kelp; the tide pools glow a little. The cove is moonlit sand.
TIDE_P = {k: hx(v) for k, v in {
    'Q0': '15181e', 'Q1': '1c2028', 'Q2': '242a34', 'Q3': '2a3a3a', 'Q4': '3a5a4a', 'Q5': '5a7a5a',
    'D0': '12141a', 'D1': '2a3038', 'D2': '3a4450', 'MUD': '1a1e24',
    'W0': '06202a', 'W1': '0a3038', 'W2': '124a50', 'W3': 'a8e8e0',
    'TREE': '05070a', 'TREE2': '0a0e14', 'TREE3': '161c26',
    'ST0': '22262e', 'ST1': '343a46', 'ST2': '4e5664', 'SHELL': 'd8d0c4', 'KELP': '2a4a2a',
}.items()}


# Castle Honkmore: torchlit flagstones, red carpets with gold trim, stone columns, brick walls
CASTLE_P = {k: hx(v) for k, v in {
    'Q0': '201c24', 'Q1': '2a2530', 'Q2': '34303c', 'Q3': '3e3a48', 'Q4': '4a4656', 'Q5': '5a5668',
    'D0': '1a1620', 'D1': '2e2a36', 'D2': '403c4a', 'MUD': '24202a',
    'W0': '0a1420', 'W1': '10202e', 'W2': '1a3444', 'W3': '8ab0c8',
    'TREE': '0c0a10', 'TREE2': '16121c', 'TREE3': '2a2432',
    'GROUT': '15121a', 'CP0': '4a1018', 'CP1': '7a1a26', 'CP2': '9a2a34', 'GOLD': 'c8982a',
    'COL0': '2e2a36', 'COL1': '4e4a5a', 'COL2': '7a7688', 'COL3': 'a8a4b8',
    'RV0': '050407', 'RV1': '0c0a10', 'RV2': '16131c', 'ROCK0': '2a2632', 'ROCK1': '3e3a48', 'ROCK2': '5a5668', 'ROOT': '2a2632',
    'ST0': '34303c', 'ST1': '4e4a5a', 'ST2': '6e6a7c', 'B0': '2a1e14', 'B1': '4a3424', 'B2': '6a4a30', 'B3': '8a6a44',
}.items()}


def render(R):
    W, H = R['width'], R['height']
    woods = R.get('biome') == 'woods'
    wharf = R.get('biome') == 'wharf'
    P = dict(BASE_P)
    if woods: P.update(WOODS_P)
    castle = R.get('biome') == 'castle'
    if castle: P.update(CASTLE_P)
    tide = R.get('biome') == 'tide'
    cove = tide and bool(R.get('fishing'))
    if wharf or cove: P.update(WHARF_P)
    if tide and not cove: P.update(TIDE_P)
    if tide: P['W0'], P['W1'], P['W2'] = TIDE_P['W0'], TIDE_P['W1'], TIDE_P['W2']
    wharf = wharf or cove
    rng = random.Random(sum(ord(c) * (i + 1) for i, c in enumerate(R['id'])))
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    img = np.zeros((H, W, 3), np.float32)
    seed = sum(map(ord, R['id'])) * 0.37
    rng_np = np.random.default_rng(sum(ord(c) * (i + 7) for i, c in enumerate(R['id'])))

    def px(x, y, c):
        if 0 <= x < W and 0 <= y < H: img[int(y), int(x)] = P[c]
    def disk(cx, cy, r, c, sy=1.0):
        m = np.hypot(xx - cx, (yy - cy) / sy) <= r; img[m] = P[c]; return m
    def shadow(cx, cy, rx, ry, k=0.55):
        m = (((xx - cx) / rx) ** 2 + ((yy - cy) / ry) ** 2) <= 1; img[m] *= k
    def sdf_rect(r, rad):
        rad = min(rad, r['w'] / 2, r['h'] / 2)
        cx, cy = r['x'] + r['w'] / 2, r['y'] + r['h'] / 2
        qx = np.abs(xx - cx) - (r['w'] / 2 - rad); qy = np.abs(yy - cy) - (r['h'] / 2 - rad)
        return np.hypot(np.maximum(qx, 0), np.maximum(qy, 0)) + np.minimum(np.maximum(qx, qy), 0) - rad

    # ---- ground: organic tone fields, thickets and clearings of clutter (water and trails paint over it)
    paint_ground(img, np.ones((H, W), bool), P, rng_np, int(seed * 1000) % 100000, woods)

    if castle and R.get('tiles'):                          # kitchen tiles: a small checker, cream and slate, worn
        cx_ = (xx // 16).astype(int); cy_ = (yy // 16).astype(int)
        chk = (cx_ + cy_) % 2 == 0
        wear = fbm(H, W, 60, 2, int(seed * 77) % 9999)
        tile = np.where(chk[..., None], hx('6a6458'), hx('2e2c36'))
        img[:] = tile * (0.75 + 0.35 * wear[..., None])
        img[(xx.astype(int) % 16 == 0) | (yy.astype(int) % 16 == 0)] = hx('1a1820')
    elif castle:                                             # flagstones: a big grid, each stone its own shade, dark grout
        sx_ = (xx // 32).astype(int); sy_ = (yy // 24).astype(int)
        shade = ((sx_ * 7919 + sy_ * 104729) % 7) / 6.0
        stone = np.stack([P['Q1'], P['Q2'], P['Q3']])[(shade * 2.99).astype(int)]
        img[:] = img * 0.35 + stone * 0.65
        img[(xx.astype(int) % 32 == 0) | (yy.astype(int) % 24 == 0)] = P['GROUT']
        img[((xx.astype(int) % 32 == 1) | (yy.astype(int) % 24 == 1))] *= 1.15
        for cp in R.get('carpets', []):
            x0, y0, x1, y1 = int(cp['x']), int(cp['y']), int(cp['x'] + cp['w']), int(cp['y'] + cp['h'])
            img[y0:y1, x0:x1] = P['CP1']
            img[y0 + 5:y1 - 5, x0 + 5:x1 - 5] = P['CP2']
            for k in (0, 1): img[y0 + 3 + k:y0 + 4 + k, x0:x1] = P['GOLD']; img[y1 - 4 - k:y1 - 3 - k, x0:x1] = P['GOLD']
            if cp['h'] > cp['w']:
                for k in (0, 1): img[y0:y1, x0 + 3 + k] = P['GOLD']; img[y0:y1, x1 - 4 - k] = P['GOLD']
            for x in range(x0 + 12, x1 - 8, 24):                 # a woven diamond pattern
                for y in range(y0 + 10, y1 - 8, 20): px(x, y, 'GOLD'); px(x - 1, y + 1, 'CP0'); px(x + 1, y + 1, 'CP0')

    # ---- water from the pit rects; islands carved back out. Edge noise is small so the shore matches collision.
    allpits = R.get('pits', [])
    pits = [p for p in allpits if p.get('kind', 'water') == 'water']
    ravines = [p for p in allpits if p.get('kind') == 'ravine']
    pillars = [b for b in R.get('bridges', []) if b.get('kind') == 'pillar']
    islands = [b for b in R.get('bridges', []) if b.get('kind') == 'island']
    docks = [b for b in R.get('bridges', []) if b.get('kind', 'dock') == 'dock']
    decks = [b for b in R.get('bridges', []) if b.get('kind') == 'deck']
    noise = 4.0 * np.sin(xx * 0.05 + yy * 0.033 + seed) + 2.5 * np.sin(yy * 0.071 - xx * 0.043) + 1.2 * np.sin(yy * 0.19 - xx * 0.13)
    if pits:
        ds = np.stack([sdf_rect(p, 24) for p in pits])
        k_ = 18.0
        sd = -k_ * np.log(np.sum(np.exp(-np.clip(ds, -400, 400) / k_), axis=0)) - noise * 0.5
    else:
        sd = np.full((H, W), 999.0, np.float32)
    for isl in islands:
        si = sdf_rect(isl, 18) - noise * 0.4
        sd = np.maximum(sd, -si)
    water = sd < 0
    bank = (sd >= 0) & (sd < 6)
    img[bank] = P['D1']; img[bank & (sd < 2.5)] = P['MUD']; img[(sd >= 4.5) & (sd < 6)] = P['D2']
    wn = np.sin(xx * 0.045 + np.sin(yy * 0.05) * 2 + yy * 0.012 + seed) * np.sin(yy * 0.21 + np.sin(xx * 0.03) * 1.5) + 0.6 * np.sin(xx * 0.013 - yy * 0.02)
    img[water] = P['W1']; img[water & (wn < -0.9)] = P['W0']; img[water & (wn >= 0.7)] = P['W2']
    img[water & (sd < -40) & (wn < 0.2)] = P['W0']
    img[water & (sd > -3)] = P['W2']
    img[water & (sd > -1.2)] = P['W3']
    if water.any():                                       # a blood-moon reflection in the widest water
        cand = np.argwhere(water & (sd < sd.min() * 0.6))
        if len(cand):
            my, mx = cand[rng.randrange(len(cand))]
            for rr, c in [(26, 'WR1'), (17, 'WR2')]:
                m = water & (np.hypot(xx - mx, (yy - my) / 0.55) < rr) & ((yy.astype(int) % 3) != 0)
                img[m] = img[m] * 0.45 + P[c] * 0.55

    # ---- ravines: a dark drop with a rocky lip and roots hanging in; rock pillars stand out of them
    if ravines:
        ds2 = np.stack([sdf_rect(p, 14) for p in ravines])
        sdr = ds2.min(axis=0) - noise * 0.35
        for pl in pillars:
            sdr = np.maximum(sdr, -(sdf_rect(pl, 12) - noise * 0.3))
        rav = sdr < 0
        depth = np.clip(-sdr / 60, 0, 1)
        img[rav] = P['RV2']; img[rav & (depth > 0.3)] = P['RV1']; img[rav & (depth > 0.7)] = P['RV0']
        lip = (sdr >= 0) & (sdr < 5)
        img[lip] = P['ROCK1']; img[lip & (sdr < 2)] = P['ROCK0']; img[(sdr >= 3.5) & (sdr < 5)] = P['ROCK2']
        ys, xs = np.nonzero(lip); grad_y, grad_x = np.gradient(sdr)
        for _ in range(int(lip.sum() / 40)):                # roots dangling over the edge
            i = rng.randrange(len(xs)); x0, y0 = int(xs[i]), int(ys[i])
            gx, gy = grad_x[y0, x0], grad_y[y0, x0]
            n = math.hypot(gx, gy) or 1; dx, dy = -gx / n, -gy / n
            for k in range(rng.randrange(6, 18)):
                px(x0 + dx * k + math.sin(k * 0.7) * 1.2, y0 + dy * k, 'ROOT')
        for pl in pillars:                                   # pillar tops: weathered rock with a moss cap
            sp = sdf_rect(pl, 12) - noise * 0.3
            top = sp < 0
            img[top] = P['ROCK1']
            for _ in range(int(pl['w'] * pl['h'] / 60)):     # pebbly texture
                x, y = rng.uniform(pl['x'], pl['x'] + pl['w']), rng.uniform(pl['y'], pl['y'] + pl['h'])
                m = top & (np.hypot(xx - x, (yy - y) * 1.3) < rng.uniform(2, 5)); img[m] = P[rng.choice(['ROCK0', 'ROCK2'])]
            mx, my = pl['x'] + pl['w'] * rng.uniform(0.3, 0.7), pl['y'] + pl['h'] * rng.uniform(0.2, 0.5)
            img[top & (np.hypot(xx - mx, (yy - my) * 1.2) < pl['w'] * 0.32)] = P['Q4'] * 0.8 + P['ROCK1'] * 0.2
            img[top & (sp > -3)] = P['ROCK0']
            img[(sp >= 0) & (sp < 10) & rav] = P['RV1'] * 0.5 + P['ROCK0'] * 0.5   # the pillar's side falling away
        water &= ~rav; bank &= ~rav
    else:
        rav = np.zeros((H, W), bool)

    # ---- dirt trails
    path = np.zeros((H, W), bool)
    for seq in R.get('paths', []):
        for a, b in zip(seq, seq[1:]):
            n = max(2, int(math.dist(a, b) / 6))
            for i in range(n + 1):
                u = i / n
                cx, cy = a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u
                r = 13 + 2 * math.sin(cx * 0.2 + cy * 0.1)
                path |= np.hypot(xx - cx, yy - cy) < r + 2 * np.sin(xx * 0.9 + yy * 1.3 + i)
    path &= ~water & ~bank & ~rav
    pn = np.sin(xx * 0.31 + yy * 0.17) * np.sin(yy * 0.43 - xx * 0.12)
    paint_path(img, path, P, rng_np, int(seed * 1000) % 100000 + 7, woods)

    land = ~water & ~bank & ~path & ~rav

    # ---- reeds on the banks, lily pads in open water
    def reeds(rx, ry, n):
        for k in range(n):
            x = rx + k * 3 + rng.choice([0, 1]); hgt = rng.randrange(14, 32); lean = rng.choice([-1, 0, 1])
            for yv in range(ry - hgt, ry):
                xo = x + int(lean * (ry - yv) / 12); px(xo, yv, 'RD1'); px(xo + 1, yv, 'RD0')
            if rng.random() < 0.55:
                tx = x + int(lean * hgt / 12)
                for j in range(7):
                    px(tx, ry - hgt - j, 'CT1'); px(tx + 1, ry - hgt - j, 'CT1'); px(tx + 2, ry - hgt - j, 'CT0')
    def near_dock(x, y, m=26):
        return any(d['x'] - m < x < d['x'] + d['w'] + m and d['y'] - m < y < d['y'] + d['h'] + m for d in docks)
    def near_post(x, y, m=30):
        return any(math.hypot(p['x'] - x, p['y'] - y) < m for p in R.get('posts', []))
    nb = 0 if wharf or tide or castle else int(bank.sum() / 260)
    if wharf:                                              # shells and pebbles on the tide line, foam lace in the shallows
        for _ in range(int(bank.sum() / 90)):
            x, y = rng.randrange(4, W - 4), rng.randrange(4, H - 4)
            if bank[y, x]: px(x, y, rng.choice(['SHELL', 'D2', 'D0'])); px(x + 1, y, 'D0')
        lace = water & (sd > -9) & (sd < -5) & (np.sin(xx * 0.35 + yy * 0.2 + seed) > 0.55)
        img[lace] = img[lace] * 0.5 + P['W3'] * 0.5
    for _ in range(nb):
        for _try in range(40):
            x, y = rng.randrange(24, W - 24), rng.randrange(34, H - 10)
            if bank[y, x] and not near_dock(x, y) and not near_post(x, y):
                reeds(x - 6, y + 4, rng.randrange(3, 7)); break
    for _ in range(0 if wharf or tide or castle else int(water.sum() / 9000)):
        for _try in range(60):
            lx, ly = rng.randrange(20, W - 20), rng.randrange(20, H - 20)
            if water[ly, lx] and sd[ly, lx] < -14 and not near_dock(lx, ly, 20) and not near_post(lx, ly, 26):
                r = rng.randrange(7, 13)
                e = ((xx - lx) / r) ** 2 + ((yy - ly) / (r * 0.6)) ** 2
                notch = (xx > lx) & (np.abs(yy - ly) < 1.2) & (xx < lx + r)
                pad = (e <= 1) & ~notch
                img[pad] = P['LP1']; img[pad & (e < 0.4)] = P['LP2']; img[pad & (e > 0.75)] = P['LP0']
                img[(e > 1) & (e <= 1.25) & ~notch] = P['OUT']
                if rng.random() < 0.3:
                    for (dx, dy, c) in [(0, -3, 'FLW2'), (-2, -2, 'FLW'), (2, -2, 'FLW'), (-1, -4, 'FLW'), (1, -4, 'FLW'), (0, -2, 'FLW3')]:
                        px(lx + dx, ly + dy, c)
                break

    # ---- boardwalks: planks run across the walking direction
    for br in docks:
        x0, y0, x1, y1 = br['x'], br['y'], br['x'] + br['w'], br['y'] + br['h']
        vertical = br['h'] > br['w']
        sh = (xx >= x0 + 3) & (xx < x1 + 4) & (yy >= y0 + 3) & (yy < y1 + 6) & water
        img[sh] *= 0.55
        if vertical:
            for y in range(y0, y1):
                plank = (y - y0) // 8
                img[y, x0:x1] = P['B2'] if plank % 2 else P['B1']
                if (y - y0) % 8 == 0: img[y, x0:x1] = P['B0']
            img[y0:y1, x0] = P['B3']; img[y0:y1, x0 + 1] = P['B3']; img[y0:y1, x1 - 1] = P['OUT']; img[y0:y1, x1 - 2] = P['B0']
            for y in range(y0 + 4, y1, 8): px(x0 + 4, y, 'NAIL'); px(x1 - 5, y, 'NAIL')
            for y_ in range(y0 + 14, y1, 40):
                for x_ in (x0 - 3, x1 - 2): img[y_:y_ + 6, x_:x_ + 5] = P['B0']
        else:
            for x in range(x0, x1):
                plank = (x - x0) // 9
                img[y0:y1, x] = P['B2'] if plank % 2 else P['B1']
                if (x - x0) % 9 == 0: img[y0:y1, x] = P['B0']
            img[y0, x0:x1] = P['B3']; img[y0 + 1, x0:x1] = P['B3']; img[y1 - 1, x0:x1] = P['OUT']; img[y1 - 2, x0:x1] = P['B0']
            for x in range(x0 + 4, x1, 9): px(x, y0 + 4, 'NAIL'); px(x, y1 - 5, 'NAIL')
            for x_ in range(x0 + 20, x1, 44):
                for y_ in (y0 - 3, y1 - 1): img[y_:y_ + 5, x_:x_ + 6] = P['B0']

    # ---- a ship's deck: planks running bow to stern, a hull rim, hatches, coiled rope, and the masts' rigging
    for dk in decks:
        x0, y0, x1, y1 = int(dk['x']), int(dk['y']), int(dk['x'] + dk['w']), int(dk['y'] + dk['h'])
        hull = (xx >= x0 - 10) & (xx < x1 + 10) & (yy >= y0 - 10) & (yy < y1 + 14)
        img[hull & water] = P['CR0'] * 0.8                                          # the hull below the rail
        img[(xx >= x0 - 6) & (xx < x1 + 6) & (yy >= y1 + 6) & (yy < y1 + 14)] = P['CR0'] * 0.6
        for y in range(y0, y1):
            row = (y - y0) // 7
            img[y, x0:x1] = P['B2'] if row % 2 else P['B1']
            if (y - y0) % 7 == 0: img[y, x0:x1] = P['B0']
            off = (row * 53) % 140
            for x in range(x0 + off, x1, 140): img[y, x] = P['B0']               # butt joints, staggered
        img[y0:y0 + 4, x0 - 8:x1 + 8] = P['CR1']; img[y0, x0 - 8:x1 + 8] = P['CR3']   # gunwales
        img[y1 - 4:y1, x0 - 8:x1 + 8] = P['CR1']; img[y1 - 1, x0 - 8:x1 + 8] = P['OUT']
        img[y0:y1, x0 - 8:x0] = P['CR1']; img[y0:y1, x1:x1 + 8] = P['CR1']
        for hx_, hy_ in [(x0 + dk['w'] * 0.5, y0 + dk['h'] * 0.3), (x0 + dk['w'] * 0.22, y0 + dk['h'] * 0.62)]:   # hatches
            hx_, hy_ = int(hx_), int(hy_)
            img[hy_ - 16:hy_ + 16, hx_ - 26:hx_ + 26] = P['CR0']
            for x in range(hx_ - 24, hx_ + 24, 6): img[hy_ - 14:hy_ + 14, x:x + 4] = P['B0']
            img[hy_ - 16, hx_ - 26:hx_ + 26] = P['CR2']
        for (cx_, cy_) in [(x0 + 70, y1 - 60), (x1 - 160, y0 + 60)]:              # coils of rope
            for r_ in (12, 8, 4): img[np.abs(np.hypot(xx - cx_, (yy - cy_) * 1.2) - r_) < 1.3] = P['NET']
        for p in R.get('posts', []):                                              # rigging: lines from each mast to the rails
            for (tx_, ty_) in [(p['x'] - 90, y0), (p['x'] + 90, y0), (p['x'] - 90, y1 - 2), (p['x'] + 90, y1 - 2)]:
                n = int(math.dist((p['x'], p['y']), (tx_, ty_)))
                for k in range(0, n, 2): px(p['x'] + (tx_ - p['x']) * k / n, p['y'] + (ty_ - p['y']) * k / n, 'B0')
            shadow(p['x'] + 40, p['y'] + 30, 70, 6, 0.75)                         # the yard's shadow

    # ---- posts
    for p in R.get('posts', []):
        shadow(p['x'] + 3, p['y'] + 6, p['r'] + 4, 5)
        disk(p['x'], p['y'], p['r'] + 1, 'OUT'); disk(p['x'], p['y'], p['r'], 'BARK0')
        disk(p['x'] - 1, p['y'] - 2, p['r'] - 2, 'BARK1'); disk(p['x'] - 1, p['y'] - 2, p['r'] - 5, 'RING')
        for a in range(0, 360, 30):
            px(p['x'] + math.cos(math.radians(a)) * (p['r'] - 0.5), p['y'] + math.sin(math.radians(a)) * (p['r'] - 0.5), 'B3')

    # ---- props
    trees = []
    # thorn brambles (static hazards): a tangle of dark vines with pale thorns
    for b in R.get('brambles', []):
        x0, y0, x1, y1 = b['x'], b['y'], b['x'] + b['w'], b['y'] + b['h']
        img[int(y0):int(y1), int(x0):int(x1)] = img[int(y0):int(y1), int(x0):int(x1)] * 0.6 + P['TH0'] * 0.2
        for _ in range(int(b['w'] * b['h'] / 18)):
            x, y = rng.uniform(x0, x1), rng.uniform(y0, y1)
            a = rng.uniform(0, math.tau)
            for k in range(rng.randrange(6, 14)):
                xx_, yy_ = x + math.cos(a) * k, y + math.sin(a) * k * 0.7
                if x0 <= xx_ < x1 and y0 <= yy_ < y1: px(xx_, yy_, rng.choice(['TH0', 'TH1']))
                a += rng.uniform(-0.5, 0.5)
            px(x, y - 1, 'TH2'); px(x + 1, y - 2, 'TH2')
        for _ in range(int(b['w'] * b['h'] / 60)):               # pale thorns
            px(rng.uniform(x0, x1), rng.uniform(y0, y1), 'TH2')
    for w in R['walls']:
        kind = w.get('kind')
        if kind == 'tree':
            cx, cy, r = w['x'] + w['w'] / 2, w['y'] + w['h'] / 2, w['w'] / 2
            trees.append((cx, cy, r))
            shadow(cx + 6, cy + 10, r + 18, r * 0.6 + 8, 0.6)
            for a in range(0, 360, 40):                       # roots
                ang = math.radians(a + rng.uniform(-12, 12))
                for k in range(int(r), int(r + 16 + rng.uniform(0, 8))):
                    px(cx + math.cos(ang) * k, cy + math.sin(ang) * k * 0.8, 'TR1'); px(cx + math.cos(ang) * k + 1, cy + math.sin(ang) * k * 0.8, 'TR0')
            disk(cx, cy + 4, r * 0.9, 'TR0', 0.5)               # the trunk itself is a y-sorted sprite in the game
            continue
        if kind == 'hedge':
            x0, y0, x1, y1 = w['x'], w['y'], w['x'] + w['w'], w['y'] + w['h']
            shadow((x0 + x1) / 2 + 5, y1 + 4, w['w'] / 2 + 8, 8, 0.6)
            img[y0:y1, x0:x1] = P['HD0']
            for _ in range(int(w['w'] * w['h'] / 40)):        # leaf clumps
                x, y = rng.uniform(x0 + 3, x1 - 3), rng.uniform(y0 + 3, y1 - 3)
                r = rng.uniform(4, 9)
                m = (np.hypot(xx - x, (yy - y) * 1.2) < r) & (xx >= x0) & (xx < x1) & (yy >= y0) & (yy < y1)
                img[m] = P['HD1']
                m2 = (np.hypot(xx - x + 1.5, (yy - y + 2) * 1.2) < r * 0.55) & m
                img[m2] = P['HD2']
            img[y0, x0:x1] = P['HD2']; img[y1 - 1, x0:x1] = P['OUT']
            continue
        if kind == 'counter':
            x0, y0, x1, y1 = int(w['x']), int(w['y']), int(w['x'] + w['w']), int(w['y'] + w['h'])
            shadow((x0 + x1) / 2 + 6, y1 + 4, w['w'] / 2 + 8, 8, 0.5)
            img[y0:y1, x0:x1] = P['B1']; img[y0:y0 + 10, x0:x1] = P['B3']; img[y0 + 10:y0 + 12, x0:x1] = P['B0']
            for x in range(x0 + 4, x1 - 4, 8): img[y0 + 12:y1, x] = P['B0']
            for k, xx_ in enumerate(range(x0 + 16, x1 - 12, 34)):                 # pots and jars on the counter
                c_ = ['COL2', 'B2', 'CP1'][k % 3]
                disk(xx_, y0 + 4, 6, 'OUT'); disk(xx_, y0 + 4, 5, c_); px(xx_ - 2, y0 + 2, 'COL3')
            img[y0, x0:x1] = P['OUT']; img[y1 - 1, x0:x1] = P['OUT']; img[y0:y1, x0] = P['OUT']; img[y0:y1, x1 - 1] = P['OUT']
            continue
        if kind == 'pillar':
            cx, cy, r = w['x'] + w['w'] / 2, w['y'] + w['h'] / 2, w['w'] / 2
            shadow(cx + 8, cy + 10, r + 10, r * 0.6 + 6, 0.5)
            disk(cx, cy, r + 1, 'OUT'); disk(cx, cy, r, 'COL1'); disk(cx - 2, cy - 2, r - 3, 'COL2'); disk(cx - r * 0.35, cy - r * 0.35, r * 0.3, 'COL3')
            for a in range(0, 360, 30):
                ax_, ay_ = cx + math.cos(math.radians(a)) * (r - 1), cy + math.sin(math.radians(a)) * (r - 1); px(ax_, ay_, 'COL0')
            continue
        if kind == 'statue':
            x0, y0, x1, y1 = int(w['x']), int(w['y']), int(w['x'] + w['w']), int(w['y'] + w['h'])
            shadow((x0 + x1) / 2 + 6, y1 + 4, w['w'] / 2 + 8, 10, 0.5)
            img[y0 + 10:y1, x0:x1] = P['COL1']; img[y0 + 10, x0:x1] = P['COL3']; img[y1 - 1, x0:x1] = P['OUT']
            cx = (x0 + x1) // 2
            disk(cx, y0 + 26, 14, 'COL2', 0.7); disk(cx + 2, y0 + 24, 9, 'COL3', 0.7)               # the swan's body
            for k in range(14): disk(cx + 10 + k * 0.4, y0 + 20 - k * 1.3, 3, 'COL3')            # her neck
            disk(cx + 16, y0 + 2, 4, 'COL3'); img[y0 + 1:y0 + 4, cx + 19:cx + 25] = P['GOLD']          # head and crown-gold beak
            continue
        if kind == 'crate':
            x0, y0, x1, y1 = int(w['x']), int(w['y']), int(w['x'] + w['w']), int(w['y'] + w['h'])
            shadow((x0 + x1) / 2 + 5, y1 + 3, w['w'] / 2 + 6, 6, 0.55)
            img[y0:y1, x0:x1] = P['CR1']
            img[y0:y0 + 6, x0:x1] = P['CR2']; img[y0, x0:x1] = P['CR3']            # the lid catching the moon
            for y in range(y0 + 10, y1 - 2, 8): img[y, x0:x1] = P['CR0']
            img[y0:y1, x0 + 2:x0 + 4] = P['CR0']; img[y0:y1, x1 - 4:x1 - 2] = P['CR0']
            for k in range(min(x1 - x0, y1 - y0) - 8):                               # diagonal brace
                px(x0 + 4 + k, y0 + 6 + k * (y1 - y0 - 8) / max(1, x1 - x0 - 8), 'CR0')
            img[y0:y1, x0] = P['OUT']; img[y0:y1, x1 - 1] = P['OUT']; img[y1 - 1, x0:x1] = P['OUT']
            continue
        if kind == 'rail':
            x0, y0, x1, y1 = int(w['x']), int(w['y']), int(w['x'] + w['w']), int(w['y'] + w['h'])
            horiz = (x1 - x0) >= (y1 - y0)
            if horiz:
                for x in range(x0 + 4, x1, 26):
                    img[y0 - 8:y1, x:x + 4] = P['B1']; img[y0 - 8, x:x + 4] = P['B3']; img[y0 - 8:y1, x + 4] = P['OUT']
                img[y0 - 6:y0 - 4, x0:x1] = P['B2']; img[y0 - 4, x0:x1] = P['OUT']
                img[y0 + 2, x0:x1] = P['NET']
            else:
                for y in range(y0 + 4, y1, 26):
                    img[y:y + 4, x0:x1] = P['B1']; img[y, x0:x1] = P['B3']
                img[y0:y1, x0 + 2:x0 + 4] = P['B2']
            continue
        if kind == 'shed':
            x0, y0, x1, y1 = int(w['x']), int(w['y']), int(w['x'] + w['w']), int(w['y'] + w['h'])
            shadow((x0 + x1) / 2 + 10, y1 + 6, w['w'] / 2 + 10, 14, 0.5)
            img[y0:y1, x0:x1] = P['RF1']
            for y in range(y0, y1, 6): img[y, x0:x1] = P['RF0']                        # roof planks
            mid = (y0 + y1) // 2
            img[mid - 2:mid + 2, x0:x1] = P['RF2']                                     # ridge
            img[y0:mid, x0:x1] = img[y0:mid, x0:x1] * 1.12
            for _ in range(int(w['w'] * w['h'] / 14000)):                              # nets drying on the roof
                cx_, cy_ = rng.uniform(x0 + 20, x1 - 20), rng.uniform(y0 + 14, y1 - 14)
                m = (np.abs(xx - cx_) < 30) & (np.abs(yy - cy_) < 16) & ((((xx + yy).astype(int)) % 5 == 0) | (((xx - yy).astype(int)) % 5 == 0))
                img[m] = P['NET']
            img[y0, x0:x1] = P['OUT']; img[y1 - 1, x0:x1] = P['OUT']; img[y0:y1, x0] = P['OUT']; img[y0:y1, x1 - 1] = P['OUT']
            img[y1 - 10:y1, x0:x1] = P['RF0']                                          # the eave's shadow
            continue
        if kind == 'stump':
            cx, cy = w['x'] + w['w'] / 2, w['y'] + w['h'] / 2
            shadow(cx + 4, cy + 10, 24, 8)
            img[int(cy):int(cy) + 14, w['x'] + 2:w['x'] + w['w'] - 2] = P['BARK0']
            for x in range(w['x'] + 4, w['x'] + w['w'] - 4, 5): img[int(cy):int(cy) + 14, x] = P['BARK1']
            disk(cx, cy, 20, 'OUT', 0.6); disk(cx, cy, 19, 'BARK1', 0.6); disk(cx, cy, 16, 'RING', 0.6)
            for rr in (12, 8, 4):
                img[np.abs(np.hypot(xx - cx, (yy - cy) / 0.6) - rr) < 0.6] = P['BARK1']
        elif kind == 'log':
            lx0, ly0, lx1, ly1 = w['x'], w['y'], w['x'] + w['w'], w['y'] + w['h']
            shadow((lx0 + lx1) / 2 + 4, ly1 + 2, w['w'] / 2 + 6, 6)
            img[ly0:ly1, lx0:lx1] = P['BARK1']; img[ly0:ly0 + 4, lx0:lx1] = P['RING'] * 0.6 + P['BARK1'] * 0.4
            for x in range(lx0, lx1, 7): img[ly0 + 6:ly1 - 3, x] = P['BARK0']
            img[ly0, lx0:lx1] = P['OUT']; img[ly1 - 1, lx0:lx1] = P['OUT']
            disk(lx1, (ly0 + ly1) / 2, w['h'] / 2, 'OUT'); disk(lx1, (ly0 + ly1) / 2, w['h'] / 2 - 1, 'RING')
            disk(lx1, (ly0 + ly1) / 2, w['h'] / 4, 'BARK1')
            for k in range(5): px(lx0 + 10 + k * 9, ly0 - 1, 'Q4')
        elif kind == 'reeds':
            # a dense wall of reeds and cattails: dark mud base, stems packed in rows
            x0, y0, x1, y1 = w['x'], w['y'], w['x'] + w['w'], w['y'] + w['h']
            base = (xx >= x0 - 2) & (xx < x1 + 2) & (yy >= y0 - 2) & (yy < y1 + 2)
            img[base] = P['MUD'] * 0.5 + P['RD0'] * 0.5
            shadow((x0 + x1) / 2 + 4, y1 + 2, w['w'] / 2 + 6, 6, 0.6)
            for ry in range(int(y0) + 14, int(y1) + 6, 9):
                for rx in range(int(x0) - 2, int(x1) - 2, 7):
                    reeds(rx + rng.randrange(0, 3), ry, 2)
        elif kind == 'rock':
            rcx, rcy = w['x'] + w['w'] / 2, w['y'] + w['h'] / 2
            shadow(rcx + 4, rcy + 10, 26, 8)
            disk(rcx, rcy, 23, 'OUT', 0.75); disk(rcx, rcy, 22, 'ST0', 0.75); disk(rcx - 3, rcy - 3, 16, 'ST1', 0.75)
            disk(rcx - 7, rcy - 7, 6, 'ST2', 0.75)
            for k in range(6): px(rcx - 10 + k * 4, rcy + 12, 'Q3')

    # ---- the trench: deep water, darker and still
    fg = R.get('fishing')
    if fg and fg.get('trench'):
        t = fg['trench']
        d_ = sdf_rect(t, 30) - noise * 1.2
        deep_ = water & (d_ < 0)
        img[deep_] = img[deep_] * 0.55
        img[water & (np.abs(d_) < 1.2) & ((xx.astype(int) + yy.astype(int)) % 3 == 0)] = P['W2']
    # ---- cave pools glow faintly; barnacles and kelp on the rock
    if tide and not cove:
        pools_ = water & (sd > -18)
        img[pools_] = img[pools_] * 0.8 + P['W2'] * 0.2
        for _ in range(int(W * H / 900)):
            x, y = rng.randrange(4, W - 4), rng.randrange(4, H - 4)
            if land[y, x] and rng.random() < 0.6: px(x, y, 'SHELL'); px(x + 1, y, 'ST1')
        for _ in range(int(bank.sum() / 120)):
            x, y = rng.randrange(4, W - 4), rng.randrange(4, H - 4)
            if bank[y, x]:
                for k in range(rng.randrange(3, 8)): px(x + math.sin(k * 0.8) * 1.5, y - k, 'KELP')
    for sp_ in R.get('springs', []):                    # freshwater dripping from the rock into a basin
        x, y = int(sp_['x']), int(sp_['y'])
        shadow(x + 3, y + 12, 30, 9, 0.55)
        disk(x, y + 2, 22, 'ST0', 0.5); disk(x, y + 1, 19, 'ST1', 0.5); disk(x, y + 2, 15, 'W2', 0.45); disk(x - 3, y, 6, 'W3', 0.4)
        img[y - 34:y - 8, x - 9:x + 9] = P['ST0'] if tide and not cove else P['B1']
        img[y - 34:y - 30, x - 11:x + 11] = P['ST1'] if tide and not cove else P['B2']
        for k in range(0, 22, 3): px(x, y - 8 + k * 0.4, 'W3')

    # ---- Pickett's stall: a counter under a striped awning (Pickett himself is a sprite)
    sp = R.get('shop')
    if sp:
        sx, sy = int(sp['x']), int(sp['y'])
        shadow(sx + 4, sy + 14, 60, 12, 0.55)
        img[sy - 30:sy - 2, sx - 52:sx + 52] = P['B1']                       # the back wall of the stall
        for x in range(sx - 52, sx + 52, 9): img[sy - 30:sy - 2, x] = P['B0']
        for i, x in enumerate(range(sx - 60, sx + 60, 10)):                  # awning
            img[sy - 52:sy - 34, x:x + 10] = P['AW1'] if i % 2 else P['AW2']
            for k in range(4): px(x + 5, sy - 34 + k, 'AW1' if i % 2 else 'AW2')
        img[sy - 53, sx - 60:sx + 60] = P['OUT']; img[sy - 34, sx - 60:sx + 60] = P['OUT']
        for x in (sx - 58, sx + 55): img[sy - 34:sy + 14, x:x + 3] = P['B0']
        img[sy + 14:sy + 26, sx - 56:sx + 56] = P['B2']; img[sy + 14, sx - 56:sx + 56] = P['B3']   # the counter in front
        img[sy + 25, sx - 56:sx + 56] = P['OUT']
        for k, (dx, c) in enumerate([(-40, 'AW1'), (-28, 'SHELL'), (30, 'IRON2'), (42, 'AW2')]): img[sy + 8:sy + 14, sx + dx:sx + dx + 6] = P[c]   # wares
        for x in range(sx - 50, sx + 50, 7):                                   # sea glass in a jar
            if rng.random() < 0.3: px(x, sy + 12, 'AW1')
    pm = R.get('pump')
    if pm:
        x, y = int(pm['x']), int(pm['y'])
        shadow(x + 4, y + 14, 26, 8, 0.55)
        img[y + 2:y + 14, x - 20:x + 20] = P['B1']; img[y + 2, x - 20:x + 20] = P['B3']; img[y + 4:y + 12, x - 18:x + 18] = P['W2']   # trough
        img[y - 30:y + 4, x - 4:x + 4] = P['IRON1']; img[y - 30:y + 4, x - 4] = P['IRON2']; img[y - 32:y - 28, x - 6:x + 6] = P['IRON0']
        img[y - 22:y - 18, x + 4:x + 12] = P['IRON1']                         # spout
        for k in range(14): px(x - 4 - k, y - 28 - k * 0.5, 'IRON2')          # handle
        img[y - 18:y + 4, x + 10] = P['W3']

    # ---- gate posts (the gate itself is drawn by the game)
    gt = R.get('gate')
    if gt:
        if gt['h'] > gt['w']:
            for y in (gt['y'] - 8, gt['y'] + gt['h']):
                img[y:y + 8, gt['x'] - 3:gt['x'] + gt['w'] + 3] = P['B1']; img[y, gt['x'] - 3:gt['x'] + gt['w'] + 3] = P['B3']
        else:
            for x in (gt['x'], gt['x'] + gt['w'] - 8):
                img[gt['y'] - 6:gt['y'] + gt['h'] + 2, x:x + 8] = P['B1']; img[gt['y'] - 6, x:x + 8] = P['B3']

    # ---- burrows
    for v in R.get('vents', []):
        shadow(v['x'], v['y'] + 3, 16, 9, 0.7)
        disk(v['x'], v['y'] - 2, 14, 'D1', 0.55); disk(v['x'], v['y'] - 3, 12, 'D2', 0.5)
        disk(v['x'], v['y'], 9, 'HOLE', 0.6)
        for k in range(5): px(v['x'] - 10 + k * 5, v['y'] - 9 + (k % 2), 'D0')

    # ---- bell gallows
    b = R.get('bell')
    if b:
        img[b['y'] - 30:b['y'] + 18, b['x'] + 16:b['x'] + 20] = P['B1']; img[b['y'] - 30:b['y'] + 18, b['x'] + 20] = P['OUT']
        img[b['y'] - 30:b['y'] - 26, b['x'] - 2:b['x'] + 20] = P['B1']; img[b['y'] - 31, b['x'] - 2:b['x'] + 20] = P['B3']
        shadow(b['x'] + 10, b['y'] + 18, 18, 5)

    # ---- chest plinth (the chest is drawn by the game)
    c = R.get('chest')
    if c:
        shadow(c['x'], c['y'] + 10, 22, 7, 0.6)
        disk(c['x'], c['y'] + 6, 20, 'ST0', 0.45); disk(c['x'] - 2, c['y'] + 4, 16, 'ST1', 0.45)

    # ---- canopy border with gaps at the doors, trails leading out. In an area stitched from rooms, the
    # canopy hugs every closed wall and the outside of the room union, not just the image edge.
    from scipy.ndimage import distance_transform_edt
    solid = np.zeros((H, W), bool)
    solid[0, :] = solid[-1, :] = True; solid[:, 0] = solid[:, -1] = True
    for w in R['walls']:
        if w.get('kind') in ('border', 'void'):
            x0, y0 = max(0, int(w['x'])), max(0, int(w['y']))
            solid[y0:int(w['y'] + w['h']), x0:int(w['x'] + w['w'])] = True
    d_edge = distance_transform_edt(~solid).astype(np.float32)
    deep = distance_transform_edt(solid).astype(np.float32)       # how far inside the solid mass
    wobble = 6 * np.sin(xx * 0.08 + seed) * np.sin(yy * 0.05) + 5 * np.sin((xx + yy) * 0.13) + 4
    gap = np.zeros((H, W), bool)
    for d in R.get('doors', []):
        m = 14
        s_ = d.get('side') or ('W' if d['x'] == 0 else 'E' if d['x'] + d['w'] >= W else 'N' if d['y'] == 0 else 'S')
        if s_ == 'W': gm = (xx >= d['x'] - 30) & (xx < d['x'] + 50) & (yy > d['y'] + m) & (yy < d['y'] + d['h'] - m)
        elif s_ == 'E': gm = (xx <= d['x'] + d['w'] + 30) & (xx > d['x'] + d['w'] - 50) & (yy > d['y'] + m) & (yy < d['y'] + d['h'] - m)
        elif s_ == 'N': gm = (yy >= d['y'] - 30) & (yy < d['y'] + 50) & (xx > d['x'] + m) & (xx < d['x'] + d['w'] - m)
        else: gm = (yy <= d['y'] + d['h'] + 30) & (yy > d['y'] + d['h'] - 50) & (xx > d['x'] + m) & (xx < d['x'] + d['w'] - m)
        gap |= gm
        trail = gm & ~(np.sin(xx * 0.7 + yy) > 0.92)
        img[trail] = P['D1']; img[trail & (pn > 0.45)] = P['D2']
    band = np.where(solid, 0, d_edge)
    canopy = (solid & ~gap) | ((band < wobble - 1) & ~gap)
    # walls inside an area (between two of its parts) get a thick hedge so they read as walls
    inner_w = np.zeros((H, W), bool)
    for w in R['walls']:
        if w.get('kind') != 'border': continue
        if w['x'] <= 0 or w['y'] <= 0 or w['x'] + w['w'] >= W or w['y'] + w['h'] >= H: continue
        x0, y0 = max(0, int(w['x'])), max(0, int(w['y']))
        inner_w[y0:int(w['y'] + w['h']), x0:int(w['x'] + w['w'])] = True
    if inner_w.any():
        d_in = distance_transform_edt(~inner_w).astype(np.float32)
        canopy |= (d_in < 9 + wobble * 0.6) & ~gap
    img[canopy] = P['TREE']; img[canopy & (((xx * 7 + yy * 3) % 11) < 2)] = P['TREE2']
    img[(band >= wobble - 1) & (band < wobble + 2) & ~gap & ~solid] = P['TREE3']
    # the forest mass seen from above: crowns of leaves, moonlit on their tops, darker the deeper in
    crown = fbm(H, W, 26, 3, int(seed * 100) + 3)
    cb = dither_bands(crown, 4)
    cc = np.stack([P['TREE'] * 0.8, P['TREE'], P['TREE2'], P['TREE3']])
    inner = canopy & (deep > 3)
    img[inner] = cc[cb][inner]
    if castle:                                             # the castle walls: courses of dark brick, lit along the top
        br = ((yy.astype(int) // 8) % 2 * 12 + xx.astype(int)) % 24 == 0
        bricks = inner & ~br & (yy.astype(int) % 8 != 0)
        img[inner] = P['TREE2']; img[bricks] = P['TREE3'] * 0.9
        img[inner & ((yy.astype(int) % 8 == 1))] = P['TREE3'] * 1.2
    lit = inner & (np.roll(crown, 3, 0) < crown - 0.06) & (crown > 0.6)   # crown tops catching the moon
    img[lit] = img[lit] * 0.6 + (P['TREE3'] * 1.6) * 0.4
    far = canopy & (deep > 30)
    img[far] = img[far] * np.clip(1 - (deep[far] - 30) / 140, 0.45, 1)[..., None]
    for x in range(24, W - 24, 5 if not (wharf or tide or castle) else 10**6):        # hanging strands along the top
        if gap[30, x] or not canopy[18, x]: continue
        for y in range(20, 20 + rng.randrange(6, 22)):
            if y + 6 < H and not water[y, x]: px(x + (y // 7) % 2, y + 6, 'RD0')

    lans = R.get('lanterns') or ([R['lantern']] if R.get('lantern') else [])
    # ---- depth: occlusion around solids, light-and-shadow rhythm, shadowed banks (lights are live in-game)
    occ = wall_mask(R, H, W, kinds={'border', 'void', 'hedge'})
    occ |= canopy
    img = depth_pass(img, R, occ, water=water, seed=seed)
    if woods:
        lum = np.ones((H, W), np.float32)
        for (cx, cy, r) in trees:                             # canopy shade around each tree
            d = np.hypot(xx - cx, (yy - cy) * 1.1)
            lum *= 1 - 0.22 * np.clip(1 - (d - r) / 90, 0, 1)
        beams = np.clip((np.sin((xx + yy * 0.6) * 0.012 + seed) - 0.88) / 0.12, 0, 1)   # moonlight through the leaves
        lum += 0.12 * beams
        img = img * lum[..., None]
    img = img * np.array([1.05, 0.95, 1.0], np.float32)
    for lan in lans:
        lantern = ["..OOOOO..", ".O43334O.", "O3344433O", "O2344432O", "O2233322O", ".O22222O.", "..OOOOO.."]
        lx, ly = lan['x'] - 4, lan['y'] - 26
        img[ly + 7:lan['y'], lan['x'] - 1:lan['x'] + 2] = P['B1']
        for j, row in enumerate(lantern):
            for i, ch in enumerate(row):
                if ch != '.': img[ly + j, lx + i] = P[{'O': 'OUT', '2': 'L2', '3': 'L3', '4': 'L4'}[ch]]
    return Image.fromarray(np.clip(img, 0, 255).astype(np.uint8))


def save_room(im, path):
    """Rooms ship inside a single-file build: a 256-colour palette (no dither) keeps them small."""
    im.convert('RGB').quantize(colors=256, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE).save(path, optimize=True)


def main(ids):
    os.makedirs(OUT, exist_ok=True)
    files = [os.path.join(ROOT, 'src', 'data', 'rooms', f'{i}.json') for i in ids] if ids else \
        sorted(glob.glob(os.path.join(ROOT, 'src', 'data', 'rooms', 'reedmarsh-*.json')) + glob.glob(os.path.join(ROOT, 'src', 'data', 'rooms', 'hollowbark-*.json'))
               + glob.glob(os.path.join(ROOT, 'src', 'data', 'rooms', 'driftwood-*.json')) + glob.glob(os.path.join(ROOT, 'src', 'data', 'rooms', 'tide-*.json')) + glob.glob(os.path.join(ROOT, 'src', 'data', 'rooms', 'castle-*.json')))
    for f in files:
        R = json.load(open(f))
        save_room(render(R), os.path.join(OUT, f"{R['id']}.png"))
        print('ok', R['id'], R['width'], R['height'])


if __name__ == '__main__':
    main(sys.argv[1:])
