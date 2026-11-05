"""
Act 1 style frame at the fine resolution: Willowmere Pond under the blood moon, 640x360 native.

Animated (8 frames): Rocco's idle with the leaking backpack, Biscuit's wings beating mid-fling,
water ripples and the moon's reflection shimmering, fireflies blinking, frogs' red eyes pulsing.

Run: python3 art/styleframe/pond_hd.py OUT_DIR   (writes pond-hd.png and pond-hd.gif)
"""
import math
import os
import random
import sys

import numpy as np
from PIL import Image

HERE = os.path.dirname(__file__)
sys.path.insert(0, os.path.join(HERE, '..'))
sys.path.insert(0, os.path.join(HERE, '..', 'characters'))
from hdkit import Layer, composite, hx  # noqa: E402
import rocco_hd  # noqa: E402

W, H = 640, 360
FRAMES = 8
rng = random.Random(11)

P = {k: hx(v) for k, v in {
    'K0': '0c0a18', 'K1': '150e22', 'K2': '211328', 'K3': '33172c', 'STAR': 'e8e0f0',
    'M0': '6e1420', 'M1': 'a8222f', 'M2': 'd8384a', 'M3': 'ff7a7e', 'M4': 'ffc2bc',
    'TREE': '0a110f', 'TREE2': '111a17', 'CAST': '0e0c14', 'CWIN': 'ff4a3a',
    'W0': '0a1b27', 'W1': '102636', 'W2': '173547', 'W3': '28566a', 'WR1': '8a1c2c', 'WR2': 'd83a4a', 'WR3': 'ff8a8a',
    'Q0': '15211b', 'Q1': '1d3025', 'Q2': '273f30', 'Q3': '37583f', 'Q4': '4c7454', 'D0': '261e17', 'D1': '362b20', 'D2': '483a2a',
    'RD0': '1d3622', 'RD1': '2c4e30', 'RD2': '3e6a40', 'CT0': '4e3018', 'CT1': '7a4a26',
    'LP0': '1f4a2a', 'LP1': '2f6a3a', 'LP2': '4a8e52', 'FLW': 'e88aa8', 'FLW2': 'fff0f4', 'FLW3': 'f4c040',
    'B0': '3a2512', 'B1': '5e3e20', 'B2': '86582f', 'B3': 'b48250', 'NAIL': '1a1218',
    'L1': 'c06a20', 'L2': 'f0a040', 'L3': 'ffd27a', 'L4': 'fff4c0',
    'GW': 'f6f1e6', 'GS': 'd2cabc', 'GD': 'a49c90', 'GB': 'f08a24', 'GB2': 'ffb060', 'GK': 'a84f16', 'EYE': '15111c', 'SHINE': 'ffffff',
    'F0': '2e4c24', 'F1': '4e7a38', 'F2': '74a24e', 'F3': 'a8cc72', 'FR': 'ff3a3a', 'FR2': 'ffb0a0',
    'T0': '252e20', 'T1': '384630', 'T2': '52643e', 'T3': '6e8250', 'TSK': '5e6a4a', 'TSK2': '7e8a64',
    'FF': 'd8ff8a', 'FOG': '6a6080', 'LINE': 'd8ecf4',
    'HEART': 'e05a47', 'HEART2': 'ff8a72', 'UI0': '0b0a10', 'UI1': '2a2838', 'UI2': '3e3a52',
    'WATER': '4ab0e0', 'WATER2': '9ae0ff', 'KOIW': 'fffaf2', 'KOIG': 'f4c040', 'KOIF': 'ffbcc4', 'OUT': '1a1522',
}.items()}
PT = dict(P)                                   # tuple palette for sprite layers
P = {k: np.array(v, np.float32) for k, v in P.items()}

yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
HORIZON = 116
MX, MY, MR = 492, 58, 30

def shore_x(y):
    return 300 + 32 * np.sin(y * 0.035) + 12 * np.sin(y * 0.095)

# ---------------------------------------------------------------- static background
def background():
    base = np.zeros((H, W, 3), np.float32)
    emit = np.zeros((H, W), bool)
    def fill(mask, c): base[mask] = P[c]
    # sky: banded gradient with dithered seams
    t = (yy - 22) / (HORIZON - 22)
    dith = ((xx + yy) % 2) * 0.03
    for lo, c in [(-9, 'K0'), (0.30, 'K1'), (0.58, 'K2'), (0.84, 'K3')]:
        fill((yy < HORIZON) & (t + dith >= lo), c)
    for _ in range(140):
        sx, sy = rng.randrange(W), rng.randrange(24, HORIZON - 30)
        base[sy, sx] = P['STAR']; emit[sy, sx] = True
        if rng.random() < 0.12:
            for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                base[sy + dy, sx + dx] = P['K2'] * 0.5 + P['STAR'] * 0.5; emit[sy + dy, sx + dx] = True
    # blood moon with soft banded halo
    d = np.hypot(xx - MX, yy - MY)
    for r, a in [(MR + 26, 0.10), (MR + 16, 0.16), (MR + 8, 0.24)]:
        m = (d < r) & (yy < HORIZON)
        base[m] = base[m] * (1 - a) + np.array(P['M1']) * a
    lit = (MX - xx) * 0.02 + (MY - yy) * 0.025 + (1 - d / MR) * 0.9
    disc = d <= MR
    for lo, c in [(-9, 'M1'), (0.25, 'M2'), (0.62, 'M3'), (1.0, 'M4')]:
        m = disc & (lit >= lo); base[m] = P[c]
    rim = (d > MR - 1) & (d <= MR); base[rim] = P['M0']
    emit[d <= MR + 26] = True
    for (cx, cy, cr) in [(482, 50, 6), (500, 68, 4), (499, 44, 3), (480, 70, 3), (508, 56, 2.5)]:
        m = np.hypot(xx - cx, yy - cy) <= cr; base[m] = P['M1']
        m2 = (np.hypot(xx - cx - 1, yy - cy - 1) <= cr) & ~m & (np.hypot(xx - cx, yy - cy) <= cr + 1); base[m2] = P['M2']
    # distant castle on the horizon
    for (x0, w, top) in [(388, 10, 78), (402, 18, 88), (424, 8, 70), (436, 16, 92), (456, 6, 84)]:
        base[top:HORIZON + 6, x0:x0 + w] = P['CAST']
        for x in range(x0 - 2, x0 + w + 2, 4):
            base[top - 4:top, x:x + 2] = P['CAST']
    for (wx, wy) in [(427, 78), (409, 96), (442, 100), (391, 88)]:
        base[wy:wy + 3, wx:wx + 2] = P['CWIN']; emit[wy:wy + 3, wx:wx + 2] = True
    # treeline of rounded pines
    hgt = np.full(W, HORIZON - 14.0)
    for x in range(W):
        if 380 <= x <= 466: hgt[x] = HORIZON + 4; continue
        tree = (x // 9) % 4
        hgt[x] = HORIZON - 12 - 14 * abs(math.sin(x * 0.35 + tree)) - (6 if tree == 1 else 0)
    trees = (yy >= hgt[None, :]) & (yy < HORIZON + 8)
    base[trees] = P['TREE']; base[trees & (((xx * 7 + yy * 3) % 11) < 2)] = P['TREE2']
    # pond and shore
    sx = shore_x(yy)
    water = (yy >= HORIZON) & ((xx >= sx) | (yy < 136))
    n = np.sin(xx * 0.11 + yy * 0.45) + np.sin(xx * 0.025 - yy * 0.16)
    base[water & (n < -0.9)] = P['W0']; base[water & (n >= -0.9)] = P['W1']; base[water & (n >= 0.6)] = P['W2']
    bank = (yy >= 136) & (xx < sx) & (xx >= sx - 6)
    base[bank] = P['D1']; base[bank & (xx >= sx - 2)] = P['D2']
    land = (yy >= 136) & (xx < sx - 6)
    g = np.sin(xx * 0.055 + yy * 0.035) + np.sin(xx * 0.021 - yy * 0.06) + 0.5 * np.sin((xx - yy) * 0.15)
    base[land & (g < -1.1)] = P['Q0']; base[land & (g >= -1.1)] = P['Q1']; base[land & (g >= 0.5)] = P['Q2']
    # a worn dirt trail curving from the bottom-left up to the dock, with ragged grassy edges
    path = np.zeros((H, W), bool)
    for i in range(60):
        u = i / 59
        cx = 30 + 170 * u + 26 * math.sin(u * 3.2); cy = 352 - 118 * u
        r = 13 - 4 * u + 2 * math.sin(i * 1.7)
        ragged = r + 2.2 * np.sin(xx * 0.9 + yy * 1.3 + i)
        path |= np.hypot(xx - cx, (yy - cy) * 1.4) < ragged
    path &= land
    pn = np.sin(xx * 0.31 + yy * 0.17) * np.sin(yy * 0.43 - xx * 0.12)
    base[path] = P['D1']; base[path & (pn > 0.45)] = P['D2']; base[path & (pn < -0.55)] = P['D0']
    for _ in range(40):                                     # pebbles
        px_, py_ = rng.randrange(20, 240), rng.randrange(230, H)
        if path[py_, px_]: base[py_, px_] = P['D2']; base[py_, px_ + 1] = P['D0']
    for _ in range(220):                                    # grass blades
        gx, gy = rng.randrange(0, 290), rng.randrange(140, H)
        if gx < shore_x(gy) - 10:
            for k, (dx, dy) in enumerate([(0, 0), (-1, -1), (1, -1), (-2, -2), (2, -3), (0, -2), (0, -3)]):
                base[gy + dy, gx + dx] = P['Q3'] if k < 4 else P['Q4']
    for _ in range(26):                                     # tiny wildflowers
        gx, gy = rng.randrange(0, 260), rng.randrange(150, H)
        if gx < shore_x(gy) - 12:
            base[gy, gx] = P[rng.choice(['FLW', 'FLW2', 'FLW3'])]

    # dock: planks with nails, posts, shadow
    y0, y1, x0, x1 = 222, 246, 196, 414
    for x in range(x0, x1):
        plank = (x - x0) // 12
        col = 'B2' if plank % 2 else 'B1'
        base[y0:y1, x] = P[col]
        if (x - x0) % 12 == 0: base[y0:y1, x] = P['B0']
    base[y0, x0:x1] = P['B3']; base[y0 + 1, x0:x1] = P['B3']; base[y1 - 1, x0:x1] = P['OUT']
    for x in range(x0 + 6, x1, 12):
        base[y0 + 4, x] = P['NAIL']; base[y1 - 5, x] = P['NAIL']
    shadow = (np.hypot((xx - 305) / 110, (yy - 256) / 6) < 1)
    base[shadow] *= 0.6
    for px in (222, 300, 376, 406):
        base[y1:y1 + 16, px:px + 4] = P['B0']; base[y1:y1 + 16, px + 4] = P['OUT']
    # lantern post + lantern (emissive)
    base[186:222, 404:408] = P['B1']; base[186:222, 408] = P['OUT']
    lantern = ["..OOOOO..", ".O43334O.", "O3344433O", "O2344432O", "O2233322O", ".O22222O.", "..OOOOO.."]
    for j, row in enumerate(lantern):
        for i, ch in enumerate(row):
            if ch == '.': continue
            c = {'O': 'OUT', '2': 'L2', '3': 'L3', '4': 'L4'}[ch]
            base[176 + j, 401 + i] = P[c]; emit[176 + j, 401 + i] = ch != 'O'
    # lily pads with flowers
    for (lx, ly, r, f) in [(352, 156, 12, False), (440, 300, 13, True), (524, 192, 11, False), (392, 332, 12, False),
                           (580, 280, 12, True), (464, 156, 10, False), (604, 340, 9, False)]:
        e = ((xx - lx) / r) ** 2 + ((yy - ly) / (r * 0.5)) ** 2
        notch = (xx > lx) & (np.abs(yy - ly) < 1.2) & (xx < lx + r)
        pad = (e <= 1) & ~notch
        base[pad] = P['LP1']; base[pad & (e < 0.4)] = P['LP2']; base[pad & (e > 0.75)] = P['LP0']
        base[(e > 1) & (e <= 1.28) & ~notch] = P['OUT']
        if f:
            for (dx, dy, c) in [(4, -5, 'FLW2'), (2, -4, 'FLW'), (6, -4, 'FLW'), (3, -6, 'FLW'), (5, -6, 'FLW'), (4, -4, 'FLW3'), (1, -3, 'FLW'), (7, -3, 'FLW')]:
                base[ly + dy, lx + dx] = P[c]
    # reeds and cattails along the bank
    for (rx, ry, n_) in [(262, 208, 6), (280, 300, 7), (316, 146, 5), (256, 352, 8), (196, 152, 5), (306, 236, 4)]:
        for k in range(n_):
            x = rx + k * 3 + rng.choice([0, 1]); hgt_ = rng.randrange(20, 38)
            lean = rng.choice([-1, 0, 1])
            for yv in range(ry - hgt_, ry):
                xo = x + int(lean * (ry - yv) / 14)
                base[yv, xo] = P['RD1']; base[yv, xo + 1] = P['RD0']
            if rng.random() < 0.6:
                tx_ = x + int(lean * hgt_ / 14)
                base[ry - hgt_ - 8:ry - hgt_, tx_:tx_ + 3] = P['CT1']; base[ry - hgt_ - 8:ry - hgt_, tx_ + 2] = P['CT0']
                base[ry - hgt_ - 10:ry - hgt_ - 8, tx_ + 1] = P['RD1']
            if rng.random() < 0.5:                          # a leaf blade
                for k2 in range(8): base[ry - hgt_ // 2 - k2 // 2, x - k2] = P['RD2']
    return base, emit, water, sx

# ---------------------------------------------------------------- creatures
def biscuit(frame):
    """Biscuit mid-fling: wings beating, neck stretched, beak open in a honk. 56x46."""
    w, h = 56, 46
    up = frame % 4 < 2
    L = []
    wing_b = Layer('wingb', w, h, PT)                     # far wing
    tip = (8, 2) if up else (4, 16)
    wing_b.poly([(20, 22), tip, (12, 6 if up else 18), (26, 18)], 'GD')
    L.append(wing_b)
    body = Layer('body', w, h, PT)
    body.ell(24, 28, 16, 10, 'GW')
    body.ell(22, 32, 13, 6, 'GS')                         # belly shade
    body.poly([(8, 26), (2, 22), (6, 30)], 'GW')          # tail tuft
    body.poly([(36, 24), (42, 14), (45, 16), (40, 28)], 'GW')   # neck base
    L.append(body)
    legs = Layer('legs', w, h, PT)
    legs.poly([(20, 37), (18, 42), (23, 41)], 'GB'); legs.poly([(27, 37), (26, 43), (31, 41)], 'GB')
    L.append(legs)
    neck = Layer('neck', w, h, PT)
    for i in range(6):
        neck.ell(41 + i * 0.6, 18 - i * 2.2, 3.4, 3.4, 'GW')
    L.append(neck)
    head = Layer('head', w, h, PT)
    head.ell(44, 7, 6, 5, 'GW')
    head.poly([(48, 5), (55, 5), (55, 7), (49, 8)], 'GB')        # upper beak
    head.poly([(48, 9), (54, 10), (49, 11)], 'GK')               # lower beak, open: HONK
    head.poly([(48, 5), (55, 5), (54, 6), (49, 6)], 'GB2')
    head.rect(45, 5, 46, 7, 'EYE'); head.px(45, 5, 'SHINE')
    head.line([(42, 3), (47, 4)], 'EYE')                          # angry brow
    L.append(head)
    wing_f = Layer('wingf', w, h, PT)                      # near wing, feathered
    if up:
        wing_f.poly([(18, 26), (14, 0), (22, 4), (30, 22)], 'GW')
        for k in range(3): wing_f.line([(16 + k * 3, 4 + k * 2), (20 + k * 3, 20)], 'GS')
    else:
        wing_f.poly([(18, 24), (6, 34), (14, 36), (30, 26)], 'GW')
        for k in range(3): wing_f.line([(10 + k * 4, 33), (20 + k * 3, 26)], 'GS')
    L.append(wing_f)
    return composite(L)

def frog(blink):
    w, h = 26, 20
    L = []
    legs = Layer('legs', w, h, PT)
    legs.ell(5, 15, 5, 3, 'F1'); legs.ell(20, 15, 5, 3, 'F1')
    L.append(legs)
    body = Layer('body', w, h, PT)
    body.ell(13, 12, 9, 6, 'F2'); body.ell(13, 14, 6, 3.5, 'F3')
    L.append(body)
    eyes = Layer('eyes', w, h, PT)
    for ex in (8, 18):
        eyes.ell(ex, 6, 3.5, 3.5, 'F2')
        eyes.ell(ex, 6, 2, 2, 'FR' if not blink else 'F1')
        if not blink: eyes.px(ex - 1, 5, 'FR2')
    eyes.line([(10, 14), (13, 15), (16, 14)], 'F0')
    L.append(eyes)
    return composite(L)

def snapper(blink):
    """Old Snapper, the tutorial boss, half-submerged: mossy shell, hooked beak, red eye."""
    w, h = 64, 30
    L = []
    shell = Layer('shell', w, h, PT)
    shell.ell(26, 20, 24, 14, 'T1')
    for (cx, cy) in [(14, 14), (26, 11), (38, 14), (20, 21), (32, 21)]:
        shell.ell(cx, cy, 6, 4, 'T2'); shell.ell(cx - 1, cy - 1, 3, 2, 'T3')
    for x in range(6, 46, 5): shell.px(x, 8 + (x % 3), 'TSK2')            # moss specks
    L.append(shell)
    head = Layer('head', w, h, PT)
    head.ell(52, 18, 9, 7, 'TSK')
    head.poly([(58, 18), (63, 21), (57, 23)], 'T0')                       # hooked beak
    head.ell(52, 15, 2, 2, 'FR' if not blink else 'TSK2')
    L.append(head)
    im = composite(L)
    # waterline: the lower third is underwater
    px = im.load()
    for y in range(22, h):
        for x in range(w):
            if px[x, y][3]: px[x, y] = (0, 0, 0, 0)
    return im

# ---------------------------------------------------------------- frame
BG, BG_EMIT, WATER_MASK, SHORE = background()
RX, RY = 150, 152                    # Rocco's frame origin (76x80 sprite)
GX, GY = 234, 96                     # Biscuit
FROGS = [(336, 268), (346, 132), (452, 276), (70, 300)]
SNAP = (518, 222)
FIREFLIES = [(rng.randrange(20, 300), rng.randrange(126, 350), rng.random() * 6) for _ in range(28)] + \
            [(rng.randrange(300, 630), rng.randrange(120, 230), rng.random() * 6) for _ in range(10)]

def paste(base, sprite_mask, im, x0, y0, emit=None, emit_test=None):
    a = np.asarray(im).astype(np.float32)
    h, w = a.shape[:2]
    region = base[y0:y0 + h, x0:x0 + w]
    m = a[..., 3] > 0
    region[m] = a[..., :3][m]
    sprite_mask[y0:y0 + h, x0:x0 + w] |= m
    if emit is not None and emit_test is not None:
        em = m & emit_test(a)
        emit[y0:y0 + h, x0:x0 + w] |= em

def render(frame):
    base = BG.copy(); emit = BG_EMIT.copy(); spr = np.zeros((H, W), bool)
    t = frame / FRAMES
    # water ripples and the moon's reflection, moving each frame
    ph = t * math.tau
    rip = WATER_MASK & ((np.sin(xx * 0.09 + yy * 1.3 + ph * 2) + np.sin(xx * 0.31 - ph)) > 1.55) & (((yy.astype(int)) % 3) == 0)
    base[rip] = P['W3']
    fade = np.clip(1 - (yy - HORIZON) / 230, 0, 1)
    refl = WATER_MASK & (np.abs(xx - MX - 2 * np.sin(yy * 0.2 + ph)) < 6 + 20 * fade) & \
           ((np.sin(yy * 1.7 + ph * 3 + xx * 0.3) > 0.55) | (np.abs(xx - MX) < 3 + 4 * fade) & (((yy.astype(int)) % 4) < 2)) & \
           (np.sin(xx * 0.9 + yy * 2.1 + ph) > -0.2 - 0.6 * fade)
    base[refl] = P['WR1']; base[refl & (np.abs(xx - MX) < 8 * fade + 2)] = P['WR2']
    base[refl & (np.abs(xx - MX) < 3 * fade + 1) & (yy < HORIZON + 40)] = P['WR3']
    emit[refl] = True
    # shadows
    for (cx, cy, rx, ry, a) in [(RX + 38, RY + 70, 26, 5, 0.5), (GX + 26, GY + 92, 18, 3, 0.65), (SNAP[0] + 30, SNAP[1] + 22, 30, 4, 0.6)] + \
                              [(fx + 13, fy + 17, 11, 3, 0.55) for (fx, fy) in FROGS]:
        m = ((xx - cx) / rx) ** 2 + ((yy - cy) / ry) ** 2 <= 1
        base[m] *= a
    # creatures
    blink = frame == 5
    red_eye = lambda a: (a[..., 0] > 240) & (a[..., 1] < 90)
    for i, (fx, fy) in enumerate(FROGS):
        im = frog(blink and i % 2 == 0)
        if fx > 320: im = im.transpose(Image.FLIP_LEFT_RIGHT)
        paste(base, spr, im, fx, fy + (1 if (frame + i) % 4 < 2 else 0), emit, red_eye)
    paste(base, spr, snapper(blink), *SNAP, emit, red_eye)
    paste(base, spr, rocco_hd.build(frame), RX, RY, emit, lambda a: (a[..., 2] > 200) & (a[..., 0] < 200))   # water drops glow
    gim = biscuit(frame)
    gy = GY + (0 if frame % 4 < 2 else 2)
    paste(base, spr, gim, GX, gy)
    # fishing line: rod tip to Biscuit's neck, with a little sag
    bob = 1 if math.sin(frame / FRAMES * math.tau) > 0.3 else 0
    tip = (RX + 8 + 64, RY + 2 + bob + 18); neck = (GX + 41, gy + 16)
    for i in range(121):
        u = i / 120
        x = tip[0] + (neck[0] - tip[0]) * u; y = tip[1] + (neck[1] - tip[1]) * u + math.sin(math.pi * u) * 10
        xi, yi = int(round(x)), int(round(y))
        base[yi, xi] = P['LINE']; emit[yi, xi] = True; spr[yi, xi] = True
    # fireflies blinking
    for (fx, fy, p) in FIREFLIES:
        on = math.sin(p + t * math.tau * 2) > -0.2
        if on:
            base[fy, fx] = P['FF']; emit[fy, fx] = True
    # ---------------------------------------------------------- lighting
    light = np.tile(np.array([0.50, 0.48, 0.66], np.float32), (H, W, 1))
    def add_light(cx, cy, radius, color, power, bands=8):
        d = np.sqrt((xx - cx) ** 2 + ((yy - cy) * 1.25) ** 2) / radius
        f = np.floor(np.clip(1 - d, 0, 1) ** 1.6 * power * bands) / bands
        light[..., 0] += f * color[0]; light[..., 1] += f * color[1]; light[..., 2] += f * color[2]
    add_light(MX, MY, 560, (0.95, 0.18, 0.24), 0.7)
    flick = 1 + 0.06 * math.sin(t * math.tau * 3)
    add_light(405, 184, 130 * flick, (1.0, 0.66, 0.32), 1.25)
    add_light(RX + 24, RY + 30, 44, (0.8, 0.92, 1.0), 0.7)                    # the koi's moon glow
    for (fx, fy, p) in FIREFLIES:
        if math.sin(p + t * math.tau * 2) > -0.2: add_light(fx, fy, 14, (0.8, 1.0, 0.5), 0.55, bands=3)
    lit = base * np.clip(light, 0, 1.6)
    soft = base * np.clip(light * 0.55 + 0.55, 0, 1.45)
    lit[spr] = soft[spr]
    lit[emit] = base[emit]
    # fog over the water
    fog = np.array(P['FOG'], np.float32)
    a = np.where((yy > HORIZON) & (yy < 200) & (xx >= SHORE - 20), 0.22 * np.clip(1 - np.abs(yy - 144) / 56, 0, 1), 0)
    a = np.floor(a * 6) / 6
    a[spr | emit] = 0
    lit = lit * (1 - a[..., None]) + fog * a[..., None]
    v = 1 - 0.38 * np.clip(((xx - W / 2) / (W / 2)) ** 2 + ((yy - H / 2) / (H / 2)) ** 2 - 0.35, 0, 1)
    img = np.clip(lit * v[..., None], 0, 255).astype(np.uint8)
    hud(img, frame)
    return Image.fromarray(img)

def hud(img, frame):
    img[0:22] = P['UI0']; img[21] = P['UI1']
    heart = ["..OO...OO..", ".O22O.O22O.", "O2322O2222O", "O222222222O", ".O2222222O.", "..O22222O..", "...O222O...", "....O2O....", ".....O....."]
    for i in range(5):
        for j, row in enumerate(heart):
            for k, ch in enumerate(row):
                if ch == '.': continue
                img[6 + j, 10 + i * 15 + k] = P['OUT'] if ch == 'O' else P['HEART2'] if ch == '3' else P['HEART']
    # backpack water: koi icon + droplets, one draining
    koi = ["...OOO...", ".OOwwwOO.", "OwEwwEwwO", "OwwwpwwwO", ".OOwwwOO.", "...OOO..."]
    for j, row in enumerate(koi):
        for k, ch in enumerate(row):
            if ch == '.': continue
            img[7 + j, 96 + k] = P[{'O': 'OUT', 'w': 'KOIW', 'E': 'EYE', 'p': 'KOIF'}[ch]]
    drop = ["..O..", ".OwO.", "OwwWO", "OwwwO", ".OOO."]
    for s_ in range(8):
        for j, row in enumerate(drop):
            for k, ch in enumerate(row):
                if ch == '.': continue
                full = s_ < 6 or (s_ == 6 and frame < 4)
                c = 'OUT' if ch == 'O' else (('WATER2' if ch == 'W' else 'WATER') if full else 'UI2')
                img[8 + j, 110 + s_ * 8 + k] = P[c]
    # fury and strain meters
    for s_ in range(12):
        c = 'HEART' if s_ < 3 else 'UI1'
        img[8:14, 260 + s_ * 9:266 + s_ * 9] = P[c]
    for k in range(18): img[11 + (1 if k % 6 in (2, 3) else 0), 400 + k] = P['LINE']
    for s_ in range(8):
        img[10:13, 422 + s_ * 8:428 + s_ * 8] = P['LINE'] if s_ < 4 else P['UI1']

def main(out_dir):
    os.makedirs(out_dir, exist_ok=True)
    frames = [render(i) for i in range(FRAMES)]
    frames[0].resize((W * 2, H * 2), Image.NEAREST).save(os.path.join(out_dir, 'pond-hd.png'))
    big = [f.resize((W * 2, H * 2), Image.NEAREST) for f in frames]
    big[0].save(os.path.join(out_dir, 'pond-hd.gif'), save_all=True, append_images=big[1:], duration=130, loop=0, optimize=True)
    print('ok')

if __name__ == '__main__':
    main(sys.argv[1] if len(sys.argv) > 1 else '.')
