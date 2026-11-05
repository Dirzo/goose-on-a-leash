"""
Style frame for Goose on a Leash: "Castle Honkmore", a fun Mario-style castle in a
Death's Door animal world, drawn as Shovel Knight-style pixel art.

Rules this frame tests (they become the art spec if approved):
  * 320x180 native resolution, whole-pixel scaling (x4 here).
  * Every sprite has a 1 px dark outline (OUT); max 4 tones per material.
  * Cool desaturated ambient (Death's Door) with warm banded light pools from torches and lava.
    Light is quantized into steps so it stays pixel art, not airbrushed.
  * Emissive pixels (flame, lava, eyes) ignore lighting.

Run: python3 art/styleframe/styleframe.py out.png
"""
import math
import random
import sys

import numpy as np
from PIL import Image

W, H, SCALE = 320, 180, 4
rng = random.Random(7)

def hx(s):
    s = s.lstrip('#')
    return (int(s[0:2], 16), int(s[2:4], 16), int(s[4:6], 16))

P = {k: hx(v) for k, v in {
    'OUT': '14101c',
    # stone walls
    'S0': '24263a', 'S1': '343850', 'S2': '474d6a', 'S3': '626b8c', 'S4': '8590ad',
    # floor flagstones
    'F0': '22242f', 'F1': '323646', 'F2': '3d4255', 'F3': '4a5066',
    # carpet + gold
    'C0': '4a1522', 'C1': '6e2131', 'C2': '96324a', 'G0': '8a6a22', 'G1': 'c9a23a', 'G2': 'f0d170',
    # lava (emissive)
    'L0': '5e140c', 'L1': 'a8321a', 'L2': 'e8661e', 'L3': 'ffb03a', 'L4': 'fff0a0',
    # brass + wood
    'B0': '5a3a16', 'B1': '9a6a24', 'B2': 'd4a240', 'B3': 'f6d886',
    # goose
    'GW': 'f4efe3', 'GS': 'c6bfb2', 'GD': '8e877e', 'GB': 'f08a24', 'GK': 'a84f16',
    # raccoon janitor
    'R0': '3a3640', 'R1': '6a6572', 'R2': '9c97a4', 'R3': 'cfcad4', 'RM': '1e1a24',
    'U0': '22355a', 'U1': '2f4f86', 'U2': '4a72b6',
    # rabbit page
    'P0': 'b3aa9c', 'P1': 'e8e2d6', 'PP': 'd98f9a', 'PR': '9e2f44', 'PR2': 'c8455c',
    # badger knight
    'A0': '3f4656', 'A1': '6b7487', 'A2': '9aa4b6', 'A3': 'cdd5e2', 'K0': '1a171f', 'KW': 'e9e6ee', 'KR': 'c23a3a',
    # banner
    'N0': '5a1626', 'N1': '8a2236', 'N2': 'b8354c',
    # misc
    'V0': '2f4a34', 'V1': '3f6a45', 'V2': '5e8f5a', 'MOTE': 'f6d886',
    'WHITE': 'ffffff', 'EYE': '14101c', 'HEART': 'e05a47', 'HEART2': 'ff8a72', 'UI0': '0b0a10', 'UI1': '2a2838',
}.items()}

# ---------------------------------------------------------------- layers
base = np.zeros((H, W, 3), dtype=np.float32)
emissive = np.zeros((H, W), dtype=bool)   # pixels that ignore lighting
sprite = np.zeros((H, W), dtype=bool)     # pixels lit more gently (characters)

def put(x, y, c, emit=False, spr=False):
    if 0 <= x < W and 0 <= y < H:
        base[y, x] = P[c] if isinstance(c, str) else c
        if emit: emissive[y, x] = True
        if spr: sprite[y, x] = True

def rect(x0, y0, w, h, c, **kw):
    for y in range(y0, y0 + h):
        for x in range(x0, x0 + w):
            put(x, y, c, **kw)

def blit(rows, x0, y0, keys, flip=False, emit_keys=(), spr=True):
    for j, row in enumerate(rows):
        row = row[::-1] if flip else row
        for i, ch in enumerate(row):
            if ch == '.' or ch == ' ':
                continue
            k = keys[ch]
            put(x0 + i, y0 + j, k, emit=ch in emit_keys, spr=spr)

def shadow(cx, cy, rx, ry, amt=0.55):
    for y in range(cy - ry, cy + ry + 1):
        for x in range(cx - rx, cx + rx + 1):
            if 0 <= x < W and 0 <= y < H and ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1:
                base[y, x] *= amt

# ---------------------------------------------------------------- room
WALL_BOTTOM = 52       # wall face from y=12 (below HUD) to here; floor below
LAVA_X0, LAVA_X1 = 150, 186

# floor flagstones (16x16, slight per-stone tone variation, mortar)
for ty in range(WALL_BOTTOM, H, 16):
    for tx in range(-8 if (ty // 16) % 2 else 0, W, 16):
        tone = rng.choice(['F1', 'F1', 'F2', 'F2', 'F3'])
        for y in range(ty, min(H, ty + 16)):
            for x in range(tx, tx + 16):
                if not (0 <= x < W): continue
                edge = y == ty or x == tx
                c = 'F0' if edge else tone
                if not edge and y == ty + 1: c = 'F3' if tone != 'F3' else 'F2'   # top bevel
                if not edge and rng.random() < 0.025: c = 'F0'                    # chips
                put(x, y, c)

# red carpet runner with gold trim, from the left door toward the lava
for y in range(WALL_BOTTOM, H):
    for x in range(52, 92):
        if x in (52, 91): c = 'G0'
        elif x in (53, 90): c = 'G1'
        else:
            c = 'C1'
            if (x - 54) % 12 in (0, 1) and (y // 6) % 2 == 0: c = 'C2'   # woven pattern
            if x in (54, 89): c = 'C0'
        put(x, y, c)

# wall face: brick courses, a lighter cap, dark skirting where it meets the floor
for y in range(12, WALL_BOTTOM):
    course = (y - 12) // 6
    for x in range(W):
        off = 0 if course % 2 == 0 else 6
        mortar = (y - 12) % 6 == 0 or (x + off) % 12 == 0
        c = 'S0' if mortar else rng.choice(['S1', 'S1', 'S2'])
        if (y - 12) % 6 == 1 and not mortar: c = 'S2'
        put(x, y, c)
for x in range(W):
    put(x, 12, 'S3'); put(x, 13, 'S4' if x % 24 < 12 else 'S3')
    put(x, WALL_BOTTOM - 2, 'S0'); put(x, WALL_BOTTOM - 1, 'OUT')
    put(x, WALL_BOTTOM, 'F0')

# doorway on the left wall (where the carpet starts)
for y in range(20, WALL_BOTTOM):
    for x in range(58, 86):
        r = (x - 72) ** 2 / 14 ** 2 + max(0, 30 - y) ** 2 / 10 ** 2
        if r <= 1: put(x, y, 'UI0')
for x in range(56, 88):
    for y in range(18, WALL_BOTTOM):
        r = (x - 72) ** 2 / 16 ** 2 + max(0, 30 - y) ** 2 / 12 ** 2
        if 1 < r <= 1.35: put(x, y, 'S3' if (x + y) % 3 else 'S4')

# lava moat (emissive), with a crusted stone lip
t = 0.0
for y in range(WALL_BOTTOM + 2, H):
    for x in range(LAVA_X0, LAVA_X1):
        n = math.sin(x * 0.45 + y * 0.18) + math.sin(y * 0.33 - x * 0.12) * 0.8 + math.sin((x + y) * 0.9) * 0.3
        c = 'L1' if n < -0.6 else 'L2' if n < 0.7 else 'L3' if n < 1.5 else 'L4'
        put(x, y, c, emit=True)
    for x in (LAVA_X0 - 2, LAVA_X0 - 1, LAVA_X1, LAVA_X1 + 1):
        put(x, y, 'OUT' if x in (LAVA_X0 - 1, LAVA_X1) else 'S3')
for x in range(LAVA_X0 - 2, LAVA_X1 + 2):
    put(x, WALL_BOTTOM + 1, 'S4'); put(x, WALL_BOTTOM + 2, 'OUT')
# lava drips out of a grate in the wall above the moat
for y in range(30, WALL_BOTTOM + 2):
    for x in range(162, 174):
        if y < 38:
            if (x - 162) % 3 == 0 or y in (30, 37): put(x, y, 'OUT')
            else: put(x, y, 'L2' if y > 33 else 'L1', emit=True)
        elif 165 <= x <= 170:
            put(x, y, 'L3' if (x + y) % 5 else 'L4', emit=True)
# bubbles
for (bx, by) in [(158, 92), (176, 130), (163, 160), (171, 108)]:
    for (dx, dy) in [(0, -1), (-1, 0), (1, 0), (0, 1)]:
        put(bx + dx, by + dy, 'L4', emit=True)
    put(bx, by, 'L3', emit=True)

# banners with a goose emblem
BANNER = [
    "OOOOOOOOOOOO",
    "OB2222222B2O".replace('2', 'n').replace('B', 'g'),
]
def banner(x0, y0):
    for x in range(x0 - 1, x0 + 13): put(x, y0, 'B1'); put(x, y0 - 1, 'B0')
    for j in range(24):
        w = 12 if j < 20 else 12 - (j - 19) * 2
        for i in range(12):
            if not ((12 - w) // 2 <= i < 12 - (12 - w) // 2): continue
            edge = i == (12 - w) // 2 or i == 11 - (12 - w) // 2 or j == 23
            c = 'OUT' if edge else ('G1' if i in ((12 - w) // 2 + 1, 10 - (12 - w) // 2) else ('N1' if i % 4 else 'N2'))
            put(x0 + i, y0 + 1 + j, c)
    # goose head emblem
    emb = ["..WW..", ".WWWK.", ".WWW..", "..WW..", ".WWWW.", "WWWWW."]
    blit(emb, x0 + 3, y0 + 8, {'W': 'GW', 'K': 'GB'}, spr=False)
banner(24, 16); banner(214, 16); banner(278, 16)

# torches: brass sconce + flame (emissive)
def torch(x, y):
    for (dx, dy, c) in [(0, 0, 'B0'), (1, 0, 'B1'), (2, 0, 'B1'), (3, 0, 'B0'), (1, 1, 'B2'), (2, 1, 'B1'), (1, 2, 'B1'), (2, 2, 'B0'), (1, 3, 'OUT'), (2, 3, 'OUT')]:
        put(x + dx, y + dy, c)
    flame = ["..4..", ".434.", ".333.", "32223", ".222.", "..1.."]
    blit(flame, x - 1, y - 7, {'1': 'L1', '2': 'L2', '3': 'L3', '4': 'L4'}, emit_keys='1234', spr=False)
torch(108, 28); torch(144, 28); torch(234, 28); torch(266, 28)

# bell on a bracket above the right wall
bell = [
    "....OOOO....",
    "...OB2B2O...",
    "..OB3222BO..",
    "..OB2222BO..",
    ".OB222222BO.",
    ".OB222222BO.",
    "OB22222222BO",
    "OOOOOOOOOOOO",
    ".....OO.....",
]
for x in range(244, 262): put(x, 24, 'B0')
blit(bell, 247, 25, {'O': 'OUT', 'B': 'B1', '2': 'B2', '3': 'B3'}, spr=False)

# grapple post across the lava: a brass ring on a short stone pillar
for y in range(96, 108):
    for x in range(198, 206):
        put(x, y, 'OUT' if x in (198, 205) or y == 107 else ('S3' if x < 202 else 'S2'))
ring = ["..OOOO..", ".O2332O.", "O2O..O2O", "O3O..O3O", "O2O..O2O", ".O2222O.", "..OOOO.."]
blit(ring, 198, 89, {'O': 'OUT', '2': 'B2', '3': 'B3'}, spr=False)

# ---------------------------------------------------------------- depth props
# stone pillars on the back wall, with a 3/4 cap and a floor shadow (Death's Door depth cue)
def pillar(x0, top=14, bottom=WALL_BOTTOM + 6, w=14):
    for y in range(top, bottom):
        for x in range(x0, x0 + w):
            edge = x in (x0, x0 + w - 1)
            c = 'OUT' if edge else ('S4' if x == x0 + 2 else 'S3' if x < x0 + w // 2 else 'S2')
            if (y - top) % 10 == 0 and not edge: c = 'S1'
            put(x, y, c)
    for x in range(x0 - 2, x0 + w + 2):
        put(x, top - 1, 'OUT'); put(x, top, 'S4'); put(x, top + 1, 'S3')
        put(x, bottom, 'OUT'); put(x, bottom - 1, 'S1')
    shadow(x0 + w // 2 + 6, bottom + 4, w // 2 + 4, 3, 0.55)
for px in (4, 122, 196, 300):
    pillar(px)

# ivy creeping down the wall
for (vx, vy, ln) in [(42, 14, 22), (98, 14, 16), (230, 14, 24), (294, 14, 12)]:
    x = vx
    for y in range(vy, vy + ln):
        x += rng.choice([-1, 0, 0, 1])
        put(x, y, 'V0'); put(x + 1, y, 'V1')
        if rng.random() < 0.35: put(x - 1, y, 'V2'); put(x + 2, y + 1, 'V1')

# fire bar: a chain of fireballs spinning from a stone hub (castle hazard)
HUB = (258, 74)
for y in range(HUB[1] - 4, HUB[1] + 5):
    for x in range(HUB[0] - 4, HUB[0] + 5):
        d = (x - HUB[0]) ** 2 + (y - HUB[1]) ** 2
        if d <= 16: put(x, y, 'OUT' if d > 9 else ('S4' if x < HUB[0] else 'S3'))
ang = -0.55
for k in range(1, 6):
    fx, fy = HUB[0] + math.cos(ang) * k * 8, HUB[1] + math.sin(ang) * k * 8
    for y in range(int(fy) - 3, int(fy) + 4):
        for x in range(int(fx) - 3, int(fx) + 4):
            d = (x - fx) ** 2 + (y - fy) ** 2
            if d <= 10: put(x, y, 'L4' if d < 2.5 else 'L3' if d < 5 else 'L2', emit=True)

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

RACCOON = [
    "...OO.OOOOOOO.OO....",
    "..OgdOccccccCOdgO...",
    "....OccccccccCO.....",
    "...OCCCCCCCCCCCOOO..",
    "..OOgggggggggggO....",
    "..OgggggggggggggO...",
    ".OmmmmmmmmmmmmmmO...",
    ".OmwwmmmgmmwwmmhO...",
    ".OghhhhhhhhhhhhhnO..",
    "..OghhhhhhhhhhhhO...",
    "...OOgggggggggOO....",
    "....OuuuuuuuuuuO....",
    "...OgOvuGuuGuvOggkO.",
    "...OgOuuuuuuuuOOOO..",
    "...OkOvuuuuuuvO.....",
    "....OOuuuuuuuuO.....",
    "....OvvuuuuuvvO.....",
    "....OuuuOOuuuuO.....",
    "....OuuuO.OuuuO.....",
    "....OdddO.OdddO.....",
    "...OkkkkO.OkkkkO....",
    "...OOOOOO.OOOOOO....",
]
RK = {'O': 'OUT', 'c': 'U1', 'C': 'U0', 'g': 'R2', 'h': 'R3', 'd': 'R1', 'm': 'RM', 'w': 'WHITE', 'n': 'RM',
      'u': 'U1', 'v': 'U2', 'G': 'G1', 'k': 'R0'}

RABBIT = [
    "...OO....OO...",
    "..OPPO..OPPO..",
    "..OPwO..OPwO..",
    "..OPwO..OPwO..",
    "...OwO..OwO...",
    "...OwwOOwwO...",
    "..OwwwwwwwwO..",
    ".OwwEwwwwEwwO.",
    ".OwwwwPPwwwwO.",
    ".OwwwwwwwwwwO.",
    "..OOwwwwwwOO..",
    ".ORRRRRRRRRRO.",
    "OwRrRRGGRRrRwO",
    "OwRRRRGGRRRRwO",
    ".ORRRRRRRRRRO.",
    "..OwwO..OwwO..",
    "..OOOO..OOOO..",
]
BK = {'O': 'OUT', 'P': 'PP', 'w': 'P1', 'E': 'EYE', 'R': 'PR', 'r': 'PR2', 'G': 'G1'}

BADGER = [
    ".........OOO..........",
    "........OrrrO.........",
    "........OrrO..........",
    "......OOOOOOOOO.......",
    ".....OaAAAAAAAaO......",
    "....OaAAAAAAAAAaO.....",
    "....OaAAAAAAAAAaO.....",
    "....OasssssssssaO.....",
    "....OaAAAAAAAAAaO.....",
    "....OKKwKKKKKwKKO.....",
    ".....OKwwKKKwwKO......",
    "......OOOOOOOOO.......",
    "...OOaaaaaaaaaaaOO....",
    "..OaOAAAAAAAAAAAOaO...",
    ".OaaOAAAArrrAAAAOaaO..",
    ".OaaOAAAAArAAAAAOaaO..",
    ".OddOAAAAAAAAAAAOddO..",
    "..OOOaaaaaaaaaaaOOO...",
    "....OaAAAAAAAAAaO.....",
    "....OdddO...OdddO.....",
    "....OdddO...OdddO.....",
    "...OOOOOO...OOOOOO....",
]
KK = {'O': 'OUT', 'r': 'KR', 'a': 'A1', 'A': 'A2', 's': 'K0', 'K': 'K0', 'w': 'KW', 'd': 'A0'}

RX, RY = 62, 96            # raccoon
GX, GY = 104, 66           # goose, mid-fling
cast = [('raccoon', RX, RY, 20, 22, 0), ('goose', GX, GY, 24, 19, 12),
        ('rabbit', 112, 128, 14, 17, 0), ('rabbit', 22, 146, 14, 17, 0),
        ('badger', 222, 100, 22, 22, 0), ('rabbit', 272, 138, 14, 17, 0)]
for name, x, y, w, h, lift in cast:
    shadow(x + w // 2, y + h + lift - 1, w // 2 + 1, 2 if lift else 3, 0.62 if lift else 0.5)

# raccoon's big striped tail, behind him
for i in range(7):
    ty = RY + 18 - i
    tx = RX + 2 - i // 2
    for k in range(5):
        c = 'RM' if (i // 2) % 2 else 'R2'
        put(tx - k, ty, c, spr=True)
    put(tx - 5, ty, 'OUT', spr=True); put(tx + 1, ty, 'OUT', spr=True)
for k in range(6): put(RX + 2 - 3 - k, RY + 11, 'OUT', spr=True)

blit(RACCOON, RX, RY, RK, emit_keys='w')
blit(GOOSE_FLY, GX, GY, GK, emit_keys='E')
blit(RABBIT, 112, 128, BK, flip=True)
blit(RABBIT, 22, 146, BK)
blit(BADGER, 222, 100, KK, flip=True)
blit(RABBIT, 272, 138, BK, flip=True)

# the leash: a sagging rope from the raccoon's paw to the goose's neck, outlined
hand = (RX + 18, RY + 12); neck = (GX + 16, GY + 8)
for i in range(61):
    t = i / 60
    x = hand[0] + (neck[0] - hand[0]) * t
    y = hand[1] + (neck[1] - hand[1]) * t + math.sin(math.pi * t) * 12
    put(round(x), round(y) + 1, 'OUT', spr=True)
for i in range(61):
    t = i / 60
    x = hand[0] + (neck[0] - hand[0]) * t
    y = hand[1] + (neck[1] - hand[1]) * t + math.sin(math.pi * t) * 12
    put(round(x), round(y), 'B2' if i % 6 else 'B3', spr=True)

# HONK: speed lines from the goose's open beak toward the rabbit it is about to hit
for (dx, dy) in [(0, 0), (3, 2), (6, 4), (2, 6), (5, 8)]:
    put(GX + 25 + dx, GY + 6 + dy, 'WHITE', emit=True)

# foreground silhouettes: pillar bases at the bottom corners (Death's Door framing)
for y in range(150, H):
    for x in range(0, 14 + (y - 150) // 3):
        put(x, y, 'UI0')
    for x in range(W - 18 - (y - 150) // 4, W):
        put(x, y, 'UI0')

# dust motes in the torch light
for _ in range(26):
    mx, my = rng.randrange(90, 300), rng.randrange(22, 90)
    put(mx, my, 'MOTE', emit=True)

# ---------------------------------------------------------------- lighting
ambient = np.array([0.56, 0.60, 0.76], dtype=np.float32)       # cool Death's Door ambient
light = np.tile(ambient, (H, W, 1))
yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)

def add_light(cx, cy, radius, color, power):
    d = np.sqrt((xx - cx) ** 2 + ((yy - cy) * 1.25) ** 2) / radius
    f = np.clip(1 - d, 0, 1) ** 1.6 * power
    f = np.floor(f * 7) / 7                                     # banded falloff: pixel-art light pools
    light[..., 0] += f * color[0]; light[..., 1] += f * color[1]; light[..., 2] += f * color[2]

warm = (1.0, 0.62, 0.30); lava = (1.0, 0.42, 0.16)
for tx in (110, 146, 236, 268):  # torches
    add_light(tx, 32, 70, warm, 1.15)
for ly in range(60, H + 20, 24):
    add_light((LAVA_X0 + LAVA_X1) / 2, ly, 58, lava, 1.0)
add_light(72, 36, 46, (0.55, 0.65, 1.0), 0.45)                  # cool spill from the doorway
add_light(HUB[0], HUB[1], 46, lava, 0.7)                           # fire bar glow

lit = base * np.clip(light, 0, 1.6)
# characters get a softer version of the lighting so they always read
spr_lit = base * np.clip(light * 0.55 + 0.55, 0, 1.45)
lit[sprite] = spr_lit[sprite]
lit[emissive] = base[emissive]

# vignette
v = 1 - 0.35 * np.clip(((xx - W / 2) / (W / 2)) ** 2 + ((yy - H / 2) / (H / 2)) ** 2 - 0.35, 0, 1)
lit *= v[..., None]
img = np.clip(lit, 0, 255).astype(np.uint8)

# ---------------------------------------------------------------- HUD (unlit, Shovel Knight-style bar)
def ui(x, y, c): img[y, x] = P[c]
for y in range(0, 12):
    for x in range(W):
        img[y, x] = P['UI0'] if y < 11 else P['UI1']
HEART = [".OO.OO.", "O22O22O", "O22222O", ".O222O.", "..O2O..", "...O..."]
for i in range(5):
    for j, row in enumerate(HEART):
        for k, ch in enumerate(row):
            if ch == '.': continue
            c = 'OUT' if ch == 'O' else ('HEART' if i < 4 else 'UI1')
            if ch == '2' and j == 1 and k in (1, 4) and i < 4: c = 'HEART2'
            ui(6 + i * 9 + k, 3 + j, c)
# fury meter: goose-head icon + segmented bar
for j, row in enumerate(["..WW.", ".WWWB", "..WW.", ".WWW.", "WWWW."]):
    for k, ch in enumerate(row):
        if ch != '.': ui(130 + k, 3 + j, 'GW' if ch == 'W' else 'GB')
for s in range(12):
    for y in range(4, 8):
        for x in range(138 + s * 6, 142 + s * 6):
            ui(x, y, ('L2' if s < 5 else 'L1' if s < 7 else 'UI1') if y > 4 else ('L3' if s < 5 else 'UI1'))
# strain rope icon
for k in range(10):
    ui(222 + k, 5 + (1 if k % 4 in (1, 2) else 0), 'B2')
for s in range(8):
    for x in range(234 + s * 5, 237 + s * 5):
        for y in (5, 6):
            ui(x, y, 'B2' if s < 2 else 'UI1')

Image.fromarray(img).resize((W * SCALE, H * SCALE), Image.NEAREST).save(sys.argv[1] if len(sys.argv) > 1 else 'styleframe.png')
print('ok')
