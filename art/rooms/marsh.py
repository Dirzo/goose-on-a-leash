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


def render(R):
    W, H = R['width'], R['height']
    woods = R.get('biome') == 'woods'
    P = dict(BASE_P)
    if woods: P.update(WOODS_P)
    rng = random.Random(hash(R['id']) & 0xffff)
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    img = np.zeros((H, W, 3), np.float32)
    seed = sum(map(ord, R['id'])) * 0.37

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

    # ---- ground: olive marsh grass with soggy patches
    g = np.sin(xx * 0.019 + yy * 0.015 + seed) + np.sin(xx * 0.011 - yy * 0.024) + 0.35 * np.sin(xx * 0.23 + yy * 0.19) * np.sin(yy * 0.31 - xx * 0.07)
    img[:] = P['Q1']; img[g < -1.35] = P['Q0']; img[g >= 0.9] = P['Q2']
    soggy = (g < -1.6)
    img[soggy] = P['MUD'] * 0.3 + P['Q0'] * 0.7
    if woods:                                             # moss patches breaking up the leaf litter
        moss = np.zeros((H, W), np.float32)
        for _ in range(int(W * H / 22000)):              # soft round moss beds
            cx, cy, r = rng.uniform(0, W), rng.uniform(0, H), rng.uniform(26, 70)
            moss = np.maximum(moss, 1 - np.hypot(xx - cx, (yy - cy) * 1.3) / r)
        dith = ((xx.astype(int) + yy.astype(int)) % 2) * 0.08
        img[moss + dith > 0.25] = P['Q3'] * 0.6 + P['Q1'] * 0.4
        img[moss + dith > 0.55] = P['Q3'] * 0.85 + P['Q1'] * 0.15
        img[moss + dith > 0.8] = P['Q4'] * 0.75 + P['Q1'] * 0.25
    if woods:                                             # fallen leaves
        for _ in range(int(W * H / 90)):
            x, y = rng.randrange(2, W - 3), rng.randrange(2, H - 3)
            c = P[rng.choice(['LF1', 'LF1', 'LF2', 'LF3'])]
            img[y, x] = c; img[y, x + 1] = c * 0.8
            if rng.random() < 0.4: img[y + 1, x] = c * 0.7

    # ---- water from the pit rects; islands carved back out. Edge noise is small so the shore matches collision.
    allpits = R.get('pits', [])
    pits = [p for p in allpits if p.get('kind', 'water') == 'water']
    ravines = [p for p in allpits if p.get('kind') == 'ravine']
    pillars = [b for b in R.get('bridges', []) if b.get('kind') == 'pillar']
    islands = [b for b in R.get('bridges', []) if b.get('kind') == 'island']
    docks = [b for b in R.get('bridges', []) if b.get('kind', 'dock') == 'dock']
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
    img[path] = P['D1']; img[path & (pn > 0.45)] = P['D2']; img[path & (pn < -0.55)] = P['D0']

    land = ~water & ~bank & ~path & ~rav
    for _ in range(int(W * H / 300)):                     # grass blades and a few flowers
        x, y = rng.randrange(4, W - 4), rng.randrange(4, H - 4)
        if land[y, x]:
            for k, (dx, dy) in enumerate([(0, 0), (-1, -1), (1, -1), (-2, -2), (2, -3), (0, -2), (0, -3)]):
                img[y + dy, x + dx] = P['Q3'] if k < 4 else (P['Q5'] if rng.random() < 0.2 else P['Q4'])
    for _ in range(int(W * H / 6000)):
        x, y = rng.randrange(4, W - 4), rng.randrange(4, H - 4)
        if land[y, x]: px(x, y, rng.choice(['FLW', 'FLW2', 'FLW3']))

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
    nb = int(bank.sum() / 260)
    for _ in range(nb):
        for _try in range(40):
            x, y = rng.randrange(24, W - 24), rng.randrange(34, H - 10)
            if bank[y, x] and not near_dock(x, y) and not near_post(x, y):
                reeds(x - 6, y + 4, rng.randrange(3, 7)); break
    for _ in range(int(water.sum() / 9000)):
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

    # ---- canopy border with gaps at the doors, trails leading out
    d_edge = np.minimum.reduce([xx, W - 1 - xx, yy, H - 1 - yy])
    wobble = 6 * np.sin(xx * 0.08 + seed) * np.sin(yy * 0.05) + 5 * np.sin((xx + yy) * 0.13) + 4
    gap = np.zeros((H, W), bool)
    for d in R.get('doors', []):
        m = 14
        if d['x'] == 0: gm = (xx < 50) & (yy > d['y'] + m) & (yy < d['y'] + d['h'] - m)
        elif d['x'] + d['w'] >= W: gm = (xx > W - 50) & (yy > d['y'] + m) & (yy < d['y'] + d['h'] - m)
        elif d['y'] == 0: gm = (yy < 50) & (xx > d['x'] + m) & (xx < d['x'] + d['w'] - m)
        else: gm = (yy > H - 50) & (xx > d['x'] + m) & (xx < d['x'] + d['w'] - m)
        gap |= gm
        trail = gm & ~(np.sin(xx * 0.7 + yy) > 0.92)
        img[trail] = P['D1']; img[trail & (pn > 0.45)] = P['D2']
    canopy = (d_edge < 18 + wobble) & ~gap
    img[canopy] = P['TREE']; img[canopy & (((xx * 7 + yy * 3) % 11) < 2)] = P['TREE2']
    img[(d_edge >= 18 + wobble) & (d_edge < 21 + wobble) & ~gap] = P['TREE3']
    for x in range(24, W - 24, 5):                               # hanging strands along the top
        if gap[30, x]: continue
        for y in range(20, 20 + rng.randrange(6, 22)):
            if y + 6 < H and not water[y, x]: px(x + (y // 7) % 2, y + 6, 'RD0')

    # ---- lighting: lantern pool, low marsh fog, blood-moon tint
    lum = np.ones((H, W), np.float32) * 0.9
    glow = np.zeros((H, W), np.float32)
    lan = R.get('lantern')
    if lan:
        dl = np.hypot(xx - lan['x'], (yy - lan['y']) * 1.25)
        for rr, k in [(170, 0.10), (110, 0.14), (64, 0.2), (32, 0.26)]:
            lum[dl < rr] += k
        glow = np.floor(np.clip(1 - dl / 170, 0, 1) * 4) / 4
    warm = np.array([1.0, 0.82, 0.55], np.float32)
    if woods:
        for (cx, cy, r) in trees:                             # canopy shade around each tree
            d = np.hypot(xx - cx, (yy - cy) * 1.1)
            lum[d < r + 70] -= 0.12; lum[d < r + 40] -= 0.08
        beams = (np.sin((xx + yy * 0.6) * 0.012 + seed) > 0.93)   # moonlight through the leaves
        lum[beams] += 0.1
    img = img * lum[..., None]
    img = img * (1 - glow[..., None] * 0.35) + img * warm * glow[..., None] * 0.35 + P['L2'] * glow[..., None] * 0.12
    fog = np.sin(xx * 0.006 + yy * 0.02 + seed) + 0.6 * np.sin(xx * 0.017 - yy * 0.011)
    fogm = np.floor(np.clip((fog - 0.6) / 1.0, 0, 1) * 3) / 3 * 0.12   # banded wisps
    img = img * (1 - fogm[..., None]) + P['FOG'] * fogm[..., None]
    img = img * np.array([1.05, 0.95, 1.0], np.float32)
    if lan:
        lantern = ["..OOOOO..", ".O43334O.", "O3344433O", "O2344432O", "O2233322O", ".O22222O.", "..OOOOO.."]
        lx, ly = lan['x'] - 4, lan['y'] - 26
        img[ly + 7:lan['y'], lan['x'] - 1:lan['x'] + 2] = P['B1']
        for j, row in enumerate(lantern):
            for i, ch in enumerate(row):
                if ch != '.': img[ly + j, lx + i] = P[{'O': 'OUT', '2': 'L2', '3': 'L3', '4': 'L4'}[ch]]
    return Image.fromarray(np.clip(img, 0, 255).astype(np.uint8))


def main(ids):
    os.makedirs(OUT, exist_ok=True)
    files = [os.path.join(ROOT, 'src', 'data', 'rooms', f'{i}.json') for i in ids] if ids else \
        sorted(glob.glob(os.path.join(ROOT, 'src', 'data', 'rooms', 'reedmarsh-*.json')) + glob.glob(os.path.join(ROOT, 'src', 'data', 'rooms', 'hollowbark-*.json')))
    for f in files:
        R = json.load(open(f))
        render(R).save(os.path.join(OUT, f"{R['id']}.png"))
        print('ok', R['id'], R['width'], R['height'])


if __name__ == '__main__':
    main(sys.argv[1:])
