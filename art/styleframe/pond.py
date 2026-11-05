"""
Act 1 style frame: Willowmere Pond under the blood moon.

Same rules as the castle frame (styleframe.py): 320x180 native, 1 px outlines, cool ambient with
banded light pools, emissive pixels ignore lighting. New here: a blood-moon key light, water with a
red moon reflection, fog over the water, and the backpack water meter on the HUD.

Run: python3 art/styleframe/pond.py out.png
"""
import math
import random
import sys

import numpy as np
from PIL import Image

W, H, SCALE = 320, 180, 4
rng = random.Random(11)

def hx(s):
    s = s.lstrip('#')
    return (int(s[0:2], 16), int(s[2:4], 16), int(s[4:6], 16))

P = {k: hx(v) for k, v in {
    'OUT': '120e18',
    # night sky + blood moon
    'K0': '0c0a18', 'K1': '160f22', 'K2': '231428', 'K3': '35182c', 'STAR': 'e8e0f0',
    'M0': '6e1420', 'M1': 'a8222f', 'M2': 'd8384a', 'M3': 'ff7a7e', 'M4': 'ffc2bc',
    'TREE': '0b1210', 'TREE2': '131c18', 'CAST': '0e0c14', 'CWIN': 'ff4a3a',
    # water
    'W0': '0b1d29', 'W1': '12293a', 'W2': '1a3a4c', 'W3': '2c5a6c', 'WR1': '8a1c2c', 'WR2': 'd83a4a',
    # shore
    'Q0': '17241d', 'Q1': '203428', 'Q2': '2b4535', 'Q3': '3d5e44', 'D0': '2a2119', 'D1': '3a2e22', 'D2': '4a3b2a',
    # reeds, lily pads, flowers
    'RD0': '1f3a24', 'RD1': '2e5232', 'CT': '6a4424', 'LP0': '24562f', 'LP1': '387a44', 'LP2': '5a9e5c', 'FLW': 'e88aa8', 'FLW2': 'fff0f4',
    # wood + lantern
    'B0': '3e2814', 'B1': '6a4424', 'B2': '966438', 'B3': 'c89058', 'L2': 'f0a040', 'L3': 'ffd27a', 'L4': 'fff4c0',
    # goose
    'GW': 'f4efe3', 'GS': 'c6bfb2', 'GD': '8e877e', 'GB': 'f08a24', 'GK': 'a84f16', 'EYE': '120e18',
    # Rocco
    'R0': '3a3640', 'R1': '6a6572', 'R2': '9c97a4', 'R3': 'cfcad4', 'RM': '1e1a24', 'WHITE': 'ffffff',
    'H0': '4a5a2a', 'H1': '6e8238', 'H2': '93a64c',        # olive bucket hat
    'V0': '7a5a32', 'V1': 'a8804a', 'V2': 'caa266',        # fishing vest
    'T0': '2e3a44', 'T1': '3e4e5c',                         # trousers
    'BT': '4a2e1c',                                         # boots
    'PK0': '5a3a22', 'PK1': '7e5432',                       # backpack leather
    'GL0': '3a8aa8', 'GL1': '6ec4da', 'KOI': 'fff6dc', 'KOI2': 'ffd070', 'KOI3': 'ff8a3a',
    'ROD': '8a5a2a', 'LINE': 'd8ecf4',
    # frogs + turtle
    'F0': '3a5e2c', 'F1': '62964a', 'F2': 'a8d070', 'FR': 'ff3a3a',
    'TS0': '2a3424', 'TS1': '3e4e30', 'TS2': '5a6e40', 'TSK': '6a7a52',
    # fireflies, fog, UI
    'FF': 'd8ff8a', 'FOG': '6a6080',
    'HEART': 'e05a47', 'HEART2': 'ff8a72', 'UI0': '0b0a10', 'UI1': '2a2838', 'WATER': '4ab0e0', 'WATER2': '9ae0ff',
}.items()}

base = np.zeros((H, W, 3), dtype=np.float32)
emissive = np.zeros((H, W), dtype=bool)
sprite = np.zeros((H, W), dtype=bool)

def put(x, y, c, emit=False, spr=False):
    if 0 <= x < W and 0 <= y < H:
        base[y, x] = P[c]
        if emit: emissive[y, x] = True
        if spr: sprite[y, x] = True

def blit(rows, x0, y0, keys, flip=False, emit_keys=(), spr=True):
    for j, row in enumerate(rows):
        row = row[::-1] if flip else row
        for i, ch in enumerate(row):
            if ch in '. ':
                continue
            put(x0 + i, y0 + j, keys[ch], emit=ch in emit_keys, spr=spr)

def shadow(cx, cy, rx, ry, amt=0.55):
    for y in range(cy - ry, cy + ry + 1):
        for x in range(cx - rx, cx + rx + 1):
            if 0 <= x < W and 0 <= y < H and ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1:
                base[y, x] *= amt

# ---------------------------------------------------------------- sky
HORIZON = 58
for y in range(12, HORIZON):
    t = (y - 12) / (HORIZON - 12)
    for x in range(W):
        c = 'K0' if t < 0.3 else 'K1' if t < 0.6 else 'K2' if t < 0.85 else 'K3'
        if t >= 0.3 and t < 0.32 and (x + y) % 2: c = 'K0'     # dithered band edges
        if 0.6 <= t < 0.63 and (x + y) % 2: c = 'K1'
        if 0.85 <= t < 0.88 and (x + y) % 2: c = 'K2'
        put(x, y, c)
for _ in range(60):
    put(rng.randrange(W), rng.randrange(13, HORIZON - 12), 'STAR', emit=True)

# the blood moon (emissive), with craters
MX, MY, MR = 246, 30, 15
for y in range(MY - MR - 1, MY + MR + 2):
    for x in range(MX - MR - 1, MX + MR + 2):
        d = math.hypot(x - MX, y - MY)
        if d <= MR:
            lit = (MX - x) * 0.04 + (MY - y) * 0.05 + (1 - d / MR) * 0.9
            c = 'M4' if lit > 1.05 else 'M3' if lit > 0.65 else 'M2' if lit > 0.25 else 'M1'
            put(x, y, c, emit=True)
        elif d <= MR + 1:
            put(x, y, 'M0', emit=True)
for (cx, cy, cr) in [(241, 26, 3), (251, 35, 2), (250, 23, 1.5), (240, 36, 1.5)]:
    for y in range(int(cy - cr), int(cy + cr) + 1):
        for x in range(int(cx - cr), int(cx + cr) + 1):
            if math.hypot(x - cx, y - cy) <= cr: put(x, y, 'M1', emit=True)

# distant castle silhouette on the horizon (foreshadowing Castle Honkmore) and treeline
def tower(x0, w, top):
    for y in range(top, HORIZON + 4):
        for x in range(x0, x0 + w): put(x, y, 'CAST')
    for x in range(x0 - 1, x0 + w + 1, 2): put(x, top - 1, 'CAST'); put(x, top - 2, 'CAST')
for (x0, w, top) in [(196, 5, 40), (203, 9, 44), (214, 4, 36), (220, 8, 46)]:
    tower(x0, w, top)
for (wx, wy) in [(215, 39), (206, 48), (223, 50)]:
    put(wx, wy, 'CWIN', emit=True)
h = HORIZON - 8
for x in range(W):
    h += rng.choice([-2, -1, 0, 0, 1, 2]); h = max(HORIZON - 16, min(HORIZON - 2, h))
    if 192 <= x <= 230: continue
    for y in range(h, HORIZON + 6): put(x, y, 'TREE' if y < h + 3 or (x + y) % 5 else 'TREE2')

# ---------------------------------------------------------------- ground + pond
def shore_x(y):
    """Left edge of the pond at row y (the water fills to the right)."""
    return 150 + int(16 * math.sin(y * 0.07) + 6 * math.sin(y * 0.19))

for y in range(HORIZON + 2, H):
    sx = shore_x(y) if y > 66 else 96
    for x in range(W):
        if x >= sx:
            n = math.sin(x * 0.21 + y * 0.9) + math.sin(x * 0.05 - y * 0.31)
            c = 'W0' if n < -0.9 else 'W1' if n < 0.6 else 'W2'
            if (y + x // 7) % 9 == 0 and n > 0.2: c = 'W3'          # ripple glints
            # blood-moon reflection: a broken red column under the moon
            fade = max(0.0, 1 - (y - HORIZON) / 140)
            if abs(x - MX) < 4 + 10 * fade and (y * 3 + x) % 7 < 2 and n > -0.2 and rng.random() < 0.35 + 0.6 * fade:
                c = 'WR2' if abs(x - MX) < 5 else 'WR1'
                put(x, y, c, emit=True); continue
            put(x, y, c)
        elif x >= sx - 3:
            put(x, y, 'D2' if x == sx - 1 else 'D1')                 # muddy bank
        else:
            n = math.sin(x * 0.11 + y * 0.07) + math.sin(x * 0.043 - y * 0.12) + 0.5 * math.sin((x - y) * 0.3)
            c = 'Q0' if n < -1.1 else 'Q1' if n < 0.5 else 'Q2'
            put(x, y, c)
    # far bank under the treeline
for y in range(HORIZON + 2, 68):
    for x in range(96, W):
        put(x, y, 'W1' if (x + y) % 4 else 'W0')
        if abs(x - MX) < 10 and (y + x) % 5 < 2: put(x, y, 'WR1', emit=True)
# grass tufts
for _ in range(70):
    gx, gy = rng.randrange(0, 140), rng.randrange(HORIZON + 8, H)
    if gx < shore_x(gy) - 6:
        put(gx, gy, 'Q3'); put(gx - 1, gy - 1, 'Q3'); put(gx + 1, gy - 1, 'Q3'); put(gx, gy - 2, 'Q2'); put(gx, gy + 1, 'Q0')
# dirt path to the dock
for y in range(110, 140):
    for x in range(20 + (y - 110) // 3, 70 + (y - 110) // 2):
        if rng.random() < 0.9: put(x, y, rng.choice(['D0', 'D1', 'D1']))

# the wooden dock, out over the water
for y in range(112, 124):
    for x in range(100, 206):
        plank = (x - 100) // 7
        c = 'B1' if plank % 2 else 'B2'
        if (x - 100) % 7 == 0: c = 'B0'
        if y == 112: c = 'B3'
        if y == 123: c = 'OUT'
        put(x, y, c)
for px in (112, 150, 188, 203):
    for y in range(124, 132):
        put(px, y, 'B0'); put(px + 1, y, 'B1'); put(px + 2, y, 'OUT')
shadow(150, 128, 52, 3, 0.6)
# lantern on the end post (emissive)
for y in range(96, 112): put(202, y, 'B0'); put(203, y, 'B1')
lantern = [".OOO.", "O434O", "O323O", "O222O", ".OOO."]
blit(lantern, 199, 91, {'O': 'OUT', '2': 'L2', '3': 'L3', '4': 'L4'}, emit_keys='234', spr=False)

# lily pads (some with flowers) and reeds/cattails along the bank
def lily(cx, cy, r=5, flower=False):
    for y in range(cy - r // 2 - 1, cy + r // 2 + 2):
        for x in range(cx - r - 1, cx + r + 2):
            d = ((x - cx) / r) ** 2 + ((y - cy) / (r * 0.5)) ** 2
            notch = x > cx and abs(y - cy) <= 0 and x < cx + r
            if d <= 1 and not notch: put(x, y, 'LP1' if d < 0.55 else 'LP0')
            elif d <= 1.35 and not notch: put(x, y, 'OUT')
    put(cx - 2, cy - 1, 'LP2'); put(cx - 1, cy - 1, 'LP2')
    if flower:
        for (dx, dy, c) in [(0, -2, 'FLW2'), (-1, -1, 'FLW'), (1, -1, 'FLW'), (0, -1, 'FLW2'), (-1, -2, 'FLW'), (1, -2, 'FLW')]:
            put(cx + dx + 2, cy + dy, c)
for (lx, ly, f) in [(176, 78, False), (220, 150, True), (262, 96, False), (196, 166, False), (290, 140, True), (232, 78, False)]:
    lily(lx, ly, 6, f)

def reeds(x0, y0, n):
    for k in range(n):
        x = x0 + k * 2 + rng.choice([0, 1])
        hgt = rng.randrange(10, 20)
        for y in range(y0 - hgt, y0):
            put(x, y, 'RD1'); put(x + 1, y, 'RD0')
        put(x - 1, y0 - hgt // 2, 'RD1'); put(x - 2, y0 - hgt // 2 - 1, 'RD1')
        if rng.random() < 0.5:
            for y in range(y0 - hgt - 4, y0 - hgt): put(x, y, 'CT'); put(x + 1, y, 'CT')
            put(x, y0 - hgt - 5, 'OUT')
for (rx, ry, n) in [(132, 104, 4), (140, 150, 5), (158, 72, 3), (128, 176, 6), (98, 76, 4)]:
    reeds(rx, ry, n)

# Old Snapper, the tutorial boss, half-submerged with red eyes
SNAP = [
    "....OOOOOOOO......",
    "...OsSsSsSsSO.....",
    "..OsSSsSSsSSsO....",
    ".OsSSSSSSSSSSsOOO.",
    "OsSsSSsSSsSSSOkkkO",
    "OWWWWWWWWWWWWOkRkO",
    ".OWWWWWWWWWWWWOkkO",
]
blit(SNAP, 268, 118, {'O': 'OUT', 's': 'TS1', 'S': 'TS2', 'W': 'W3', 'k': 'TSK', 'R': 'FR'}, emit_keys='R')

# ---------------------------------------------------------------- characters
GOOSE_FLY = [
    "................OOOO....",
    "...............OWWWWO...",
    "..OO..........OWWWWWWO..",
    ".OWWO.........OWOEWWOOOO",
    ".OWWWO........OWWWWWBBBO",
    "..OWWWO.......OWWWWOKKO.",
    "..OWWWWO.......OWWWOOO..",
    "...OWWWWO......OWWO.....",
    "...OWWSWWO.....OWWO.....",
    "....OWWSWWOOOOOOWWO.....",
    "...OWWWWSWWWWWWWWWO.....",
    "..OWWWWWWWWWWWWWWWSO....",
    ".OWWWSWWWWWWWWWWWSSO....",
    "OWWWSSWWWWWWWWWWSSO.....",
    "OWSSSWWWWWWWWWWSSDO.....",
    ".OSSDSSSSSSSSSSSDO......",
    "..OODSSSSSSSSSDDO.......",
    "....OOOOKKOOKKOO........",
    "........KK..KK..........",
]
GK = {'O': 'OUT', 'W': 'GW', 'S': 'GS', 'D': 'GD', 'B': 'GB', 'K': 'GK', 'E': 'EYE'}

ROCCO = [
    "......OOOOOOOO......",
    ".....OhhhhhhhhO.....",
    "...OOHhhhhhhhhHOO...",
    "..OHHHHHHHHHHHHHHO..",
    "...OOgggggggggggOO..",
    "..OgggggggggggggO...",
    ".OmmmmmmmmmmmmmmO...",
    ".OmwwmmmgmmwwmmhO...",
    ".OghhhhhhhhhhhhhnO..",
    "..OghhhhhhhhhhhhO...",
    "...OOgggggggggOO....",
    "....OvvvvvvvvvvO....",
    "...OgOVvpvvpvVOggkO.",
    "...OgOvvvvvvvvOOOO..",
    "...OkOVvvvvvvVO.....",
    "....OOttttttttO.....",
    "....OtttttttttO.....",
    "....OtttOOttttO.....",
    "....OtttO.OtttO.....",
    "....ObbbO.ObbbO.....",
    "...ObbbbO.ObbbbO....",
    "...OOOOOO.OOOOOO....",
]
RK = {'O': 'OUT', 'h': 'H1', 'H': 'H0', 'g': 'R2', 'm': 'RM', 'w': 'WHITE', 'n': 'RM', 'k': 'R0',
      'v': 'V1', 'V': 'V0', 'p': 'V2', 't': 'T1', 'b': 'BT'}
# fix the muzzle row (h means hat elsewhere): draw rows 8-9 with fur-light instead
ROCCO_MUZZLE = {8: ".OgrrrrrrrrrrrrrnO..", 9: "..OgrrrrrrrrrrrrO..."}

FROG = [
    "..OOO..OOO..",
    ".OgRgOOgRgO.",
    ".OggggggggO.",
    "OgllllllllgO",
    "OglOOOOOOlgO",
    ".OgllllllgO.",
    "OggOggggOggO",
    "OOO.OOOO.OOO",
]
FK = {'O': 'OUT', 'g': 'F1', 'l': 'F2', 'R': 'FR'}

RX, RY = 74, 92             # Rocco, at the foot of the dock
GX, GY = 120, 54            # Biscuit mid-fling over the water
frogs = [(168, 140), (172, 70), (226, 142), (40, 150)]

shadow(RX + 10, RY + 21, 11, 3, 0.5)
shadow(GX + 12, GY + 34, 10, 2, 0.65)
for (fx, fy) in frogs: shadow(fx + 6, fy + 8, 6, 2, 0.55)

# striped tail and the koi backpack behind Rocco
for i in range(7):
    ty = RY + 18 - i; tx = RX + 2 - i // 2
    for k in range(5): put(tx - k, ty, 'RM' if (i // 2) % 2 else 'R2', spr=True)
    put(tx - 5, ty, 'OUT', spr=True)
for y in range(RY + 8, RY + 20):
    for x in range(RX - 4, RX + 5):
        edge = x in (RX - 4, RX + 4) or y in (RY + 8, RY + 19)
        if edge: put(x, y, 'OUT', spr=True)
        elif x == RX - 3 or y == RY + 9: put(x, y, 'PK1', spr=True)
        else:
            # glass window with water and the glowing Moon Koi
            put(x, y, 'GL0' if (x + y) % 3 else 'GL1', spr=True)
for (dx, dy, c) in [(-1, 13, 'KOI'), (0, 13, 'KOI'), (1, 13, 'KOI2'), (2, 14, 'KOI3'), (-2, 14, 'KOI2'), (0, 14, 'KOI'), (1, 12, 'KOI')]:
    put(RX + dx, RY + dy, c, emit=True, spr=True)
put(RX - 2, RY + 7, 'PK0', spr=True); put(RX + 2, RY + 7, 'PK0', spr=True)

rows = [ROCCO_MUZZLE.get(i, r) for i, r in enumerate(ROCCO)]
RK2 = dict(RK, r='R3')
blit(rows, RX, RY, RK2, emit_keys='w')
blit(GOOSE_FLY, GX, GY, GK, emit_keys='E')
for (fx, fy) in frogs:
    blit(FROG, fx, fy, FK, emit_keys='R', flip=fx > 150)

# fishing rod from Rocco's paw, then the fishing line to Biscuit's neck
paw = (RX + 18, RY + 12); tip = (RX + 34, RY - 14)
for i in range(31):
    t = i / 30
    x = round(paw[0] + (tip[0] - paw[0]) * t); y = round(paw[1] + (tip[1] - paw[1]) * t)
    put(x, y, 'ROD', spr=True); put(x + 1, y, 'OUT', spr=True)
neck = (GX + 16, GY + 8)
for i in range(61):
    t = i / 60
    x = tip[0] + (neck[0] - tip[0]) * t
    y = tip[1] + (neck[1] - tip[1]) * t + math.sin(math.pi * t) * 7
    put(round(x), round(y), 'LINE', emit=True, spr=True)

# fireflies
fireflies = [(rng.randrange(10, 150), rng.randrange(62, 175)) for _ in range(16)] + [(rng.randrange(150, 310), rng.randrange(62, 120)) for _ in range(6)]
for (fx, fy) in fireflies: put(fx, fy, 'FF', emit=True)

# ---------------------------------------------------------------- lighting
ambient = np.array([0.52, 0.50, 0.68], dtype=np.float32)       # cool night, a little purple
light = np.tile(ambient, (H, W, 1))
yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)

def add_light(cx, cy, radius, color, power, bands=7):
    d = np.sqrt((xx - cx) ** 2 + ((yy - cy) * 1.25) ** 2) / radius
    f = np.clip(1 - d, 0, 1) ** 1.6 * power
    f = np.floor(f * bands) / bands
    light[..., 0] += f * color[0]; light[..., 1] += f * color[1]; light[..., 2] += f * color[2]

add_light(MX, MY, 280, (0.95, 0.18, 0.24), 0.7)               # blood-moon key light
add_light(201, 100, 66, (1.0, 0.66, 0.32), 1.25)                 # dock lantern
add_light(RX, RY + 13, 22, (0.7, 0.9, 1.0), 0.8)               # the koi's glow
for (fx, fy) in fireflies: add_light(fx, fy, 7, (0.8, 1.0, 0.5), 0.6, bands=3)

lit = base * np.clip(light, 0, 1.6)
spr_lit = base * np.clip(light * 0.55 + 0.55, 0, 1.45)
lit[sprite] = spr_lit[sprite]
lit[emissive] = base[emissive]

# fog hanging over the water and the far bank
fog = np.array(P['FOG'], dtype=np.float32)
for y in range(HORIZON + 2, 100):
    a = 0.22 * (1 - abs(y - 72) / 28) if abs(y - 72) < 28 else 0
    a = math.floor(a * 6) / 6
    if a <= 0: continue
    x0 = shore_x(y) if y > 66 else 96
    for x in range(x0, W):
        if sprite[y, x] or emissive[y, x]: continue
        lit[y, x] = lit[y, x] * (1 - a) + fog * a

v = 1 - 0.38 * np.clip(((xx - W / 2) / (W / 2)) ** 2 + ((yy - H / 2) / (H / 2)) ** 2 - 0.35, 0, 1)
lit *= v[..., None]
img = np.clip(lit, 0, 255).astype(np.uint8)

# ---------------------------------------------------------------- HUD
def ui(x, y, c): img[y, x] = P[c]
for y in range(0, 12):
    for x in range(W): img[y, x] = P['UI0'] if y < 11 else P['UI1']
HEART = [".OO.OO.", "O22O22O", "O22222O", ".O222O.", "..O2O..", "...O..."]
for i in range(5):
    for j, row in enumerate(HEART):
        for k, ch in enumerate(row):
            if ch == '.': continue
            c = 'OUT' if ch == 'O' else ('HEART' if i < 5 else 'UI1')
            if ch == '2' and j == 1 and k in (1, 4): c = 'HEART2'
            ui(6 + i * 9 + k, 3 + j, c)
# backpack water: koi icon + droplet segments (the new meter)
for j, row in enumerate(["..KK.", ".KKKO", "KKKK.", ".KKKO", "..KK."]):
    for k, ch in enumerate(row):
        if ch != '.': ui(56 + k, 3 + j, 'KOI2' if ch == 'K' else 'KOI3')
for s in range(8):
    for (dx, dy) in [(1, 0), (0, 1), (1, 1), (2, 1), (0, 2), (1, 2), (2, 2), (1, 3)]:
        ui(64 + s * 5 + dx, 3 + dy, 'WATER' if s < 6 else 'UI1')
    if s < 6: ui(64 + s * 5, 4, 'WATER2')
# fury: goose head + segments
for j, row in enumerate(["..WW.", ".WWWB", "..WW.", ".WWW.", "WWWW."]):
    for k, ch in enumerate(row):
        if ch != '.': ui(130 + k, 3 + j, 'GW' if ch == 'W' else 'GB')
for s in range(12):
    for y in range(4, 8):
        for x in range(138 + s * 6, 142 + s * 6):
            ui(x, y, ('M2' if s < 3 else 'UI1') if y > 4 else ('M3' if s < 3 else 'UI1'))
# strain: fishing-line icon + segments (fishing line strains fast)
for k in range(10): ui(222 + k, 5 + (1 if k % 4 in (1, 2) else 0), 'LINE')
for s in range(8):
    for x in range(234 + s * 5, 237 + s * 5):
        for y in (5, 6): ui(x, y, 'LINE' if s < 4 else 'UI1')

Image.fromarray(img).resize((W * SCALE, H * SCALE), Image.NEAREST).save(sys.argv[1] if len(sys.argv) > 1 else 'pond.png')
print('ok')
