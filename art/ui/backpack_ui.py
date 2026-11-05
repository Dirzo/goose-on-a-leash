"""
Backpack screen art at the fine resolution (shown at 3x on the HUD):

  bimbo(mood, blink)   Bimbo the Moon Koi, 64x56: goofy, round, white, gold crest, pink fins and blush.
                       moods: 'happy' (big grin), 'worried' (wobbly mouth, sweat drop), 'gasping' (O mouth, tongue out)
  pack()               the backpack seen from the front, 132x124: canvas body, roll-top opening with water,
                       straps, front pocket, a clear vinyl window that shows the water level (drawn by the game)
  patch(i)             a sewn-on patch, 16x14, four fabric colours
  tear(i)              an open tear with a drip, 14x12, two frames

Points used by the game (pack frame pixels): WINDOW (water window rect), BIMBO_AT (where Bimbo's anchor sits),
PATCH_SLOTS (where patches and tears go, in order).

Run: python3 art/ui/backpack_ui.py OUT_DIR   (writes a preview sheet)
"""
import math
import os
import sys

from PIL import Image

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
from hdkit import Layer, composite, hx  # noqa: E402

PAL = {k: hx(v) for k, v in {
    'w': 'fffaf2', 'w2': 'ece4d6', 'w3': 'd4cabb', 'gold': 'f4c040', 'gold2': 'ffe08a', 'pink': 'ffbcc4', 'pink2': 'ff94a6',
    'eye': '15111c', 'shine': 'ffffff', 'mouth': '7a2a3a', 'tongue': 'ff7a8e', 'sweat': '9ae0ff',
    'c0': '6e5638', 'c1': '8e7248', 'c2': 'b08e5c', 'c3': 'cdb07a', 'strap': '5a3e26', 'strap2': '7a5634', 'buckle': 'c8c0b0',
    'water1': '2f7fb0', 'water2': '4ab0e0', 'water3': '9ae0ff', 'vinyl': 'cfe8f0', 'dark': '2a2219',
    'p1': 'c05a4a', 'p2': '5a8a5a', 'p3': '5a6eaa', 'p4': 'c09a3a', 'stitch': 'f6f1e6', 'rip': '1a1210',
}.items()}

W_BIMBO, H_BIMBO = 64, 56
BIMBO_ANCHOR = (32, 50)          # bottom centre: the waterline he pokes out of

PACK_W, PACK_H = 132, 124
WINDOW = (96, 52, 18, 52)        # x, y, w, h of the clear water window on the right of the pack
BIMBO_AT = (60, 34)              # pack pixel where Bimbo's anchor (waterline) sits
PATCH_SLOTS = [(30, 58), (66, 64), (44, 84), (78, 90), (26, 100), (58, 104), (40, 66), (80, 72), (20, 80), (68, 112)]


def bimbo(mood='happy', blink=False):
    w, h = W_BIMBO, H_BIMBO
    L = []
    fins = Layer('fins', w, h, PAL)
    fins.poly([(12, 30), (2, 22), (4, 36)], 'pink')                       # side fins, flapping out
    fins.poly([(52, 30), (62, 22), (60, 36)], 'pink')
    fins.poly([(26, 6), (32, 0), (38, 6)], 'pink')                         # top fin
    L.append(fins)
    body = Layer('body', w, h, PAL)
    body.ell(32, 30, 21, 20, 'w')                                          # big round head-body
    body.ell(34, 37, 15, 11, 'w2')                                         # chin shade
    body.ell(25, 12, 6, 3.5, 'gold'); body.ell(38, 11, 4, 3, 'gold')       # gold crest patches
    body.ell(24, 11, 3, 1.5, 'gold2')
    body.ell(48, 24, 3, 2.5, 'gold')                                       # a cheek spot
    L.append(body)
    face = Layer('face', w, h, PAL)
    for ex in (22, 42):                                                    # big goofy eyes
        face.ell(ex, 24, 6, 6.5, 'shine')
        if blink:
            face.line([(ex - 4, 25), (ex + 4, 25)], 'eye', 2)
        else:
            dy = 1 if mood == 'gasping' else 0
            face.ell(ex + 1, 25 + dy, 3.5, 4, 'eye')
            face.ell(ex + 2, 23 + dy, 1.3, 1.3, 'shine'); face.px(ex - 1, 27 + dy, 'shine')
    face.line([(24, 40), (19, 44), (16, 43)], 'gold', 1); face.line([(40, 40), (45, 44), (48, 43)], 'gold', 1)   # koi whiskers
    if mood == 'happy':
        face.ell(32, 38, 6, 4, 'mouth'); face.rect(26, 34, 38, 36, 'w')    # wide grin
        face.ell(32, 40, 3, 1.5, 'tongue')
        face.ell(15, 33, 3, 1.8, 'pink2'); face.ell(49, 33, 3, 1.8, 'pink2')
    elif mood == 'worried':
        face.line([(26, 39), (29, 37), (32, 39), (35, 37), (38, 39)], 'mouth', 2)   # wobbly mouth
        face.line([(17, 16), (24, 18)], 'eye', 1); face.line([(47, 16), (40, 18)], 'eye', 1)   # worried brows
        face.poly([(52, 12), (55, 18), (52, 20), (49, 18)], 'sweat')       # sweat drop
        face.ell(15, 33, 2.5, 1.5, 'pink')
    else:
        face.ell(32, 39, 4, 5, 'mouth'); face.ell(32, 42, 2.5, 2, 'tongue')   # gasping O
        face.line([(17, 17), (24, 15)], 'eye', 1); face.line([(47, 17), (40, 15)], 'eye', 1)
        face.poly([(53, 10), (56, 16), (53, 18), (50, 16)], 'sweat'); face.poly([(9, 14), (11, 18), (9, 19), (7, 18)], 'sweat')
    L.append(face)
    return composite(L)


def pack():
    w, h = PACK_W, PACK_H
    L = []
    straps = Layer('straps', w, h, PAL)                                     # shoulder straps behind, curling up
    straps.poly([(14, 40), (4, 14), (12, 10), (24, 38)], 'strap')
    straps.poly([(118, 40), (128, 14), (120, 10), (108, 38)], 'strap')
    L.append(straps)
    body = Layer('pack', w, h, PAL)
    body.rect(10, 34, 122, 120, 'c2')                                       # canvas body
    body.ell(66, 120, 56, 5, 'c1')                                          # rounded base
    body.rect(10, 34, 14, 120, 'c1'); body.rect(118, 34, 122, 120, 'c1')    # side shading
    for y in range(40, 118, 6):                                             # canvas weave
        for x in range(16 + (y // 6) % 2 * 3, 116, 6): body.px(x, y, 'c3')
    body.rect(8, 26, 124, 38, 'c1')                                         # roll-top rim
    body.ell(66, 30, 52, 9, 'c0')                                           # opening
    body.ell(66, 31, 48, 6.5, 'water1'); body.ell(64, 30, 40, 4, 'water2')  # water inside
    for x in (36, 58, 80): body.line([(x, 30), (x + 6, 30)], 'water3')
    L.append(body)
    pocket = Layer('pocket', w, h, PAL)                                      # front pocket with a flap and buckle
    pocket.rect(28, 76, 88, 112, 'c1'); pocket.rect(30, 78, 86, 110, 'c2')
    pocket.poly([(26, 74), (90, 74), (86, 88), (30, 88)], 'c0')
    pocket.rect(52, 84, 64, 94, 'buckle'); pocket.rect(55, 87, 61, 91, 'c0')
    L.append(pocket)
    win = Layer('window', w, h, PAL)                                        # clear window (water drawn in-game)
    x, y, ww, hh = WINDOW
    win.rect(x - 2, y - 2, x + ww + 1, y + hh + 1, 'strap')
    win.rect(x, y, x + ww - 1, y + hh - 1, 'vinyl')
    for k in range(1, 4): win.line([(x, y + hh * k // 4), (x + 3, y + hh * k // 4)], 'strap')   # tick marks
    L.append(win)
    return composite(L)


def patch(i):
    w, h = 16, 14
    col = ['p1', 'p2', 'p3', 'p4'][i % 4]
    L = Layer('patch', w, h, PAL)
    L.poly([(1, 2), (14, 1), (15, 12), (2, 13)], col)
    for x in range(2, 14, 3): L.px(x, 2, 'stitch'); L.px(x + 1, 12, 'stitch')
    for y in range(3, 12, 3): L.px(2, y, 'stitch'); L.px(13, y + 1, 'stitch')
    if i % 2: L.line([(5, 5), (10, 9)], 'stitch'); L.line([(10, 5), (5, 9)], 'stitch')
    return composite([L])


def tear(frame):
    w, h = 14, 12
    L = Layer('tear', w, h, PAL)
    L.poly([(1, 4), (4, 2), (7, 5), (10, 1), (13, 5), (9, 7), (6, 6), (3, 8)], 'rip')
    L.line([(2, 4), (5, 3)], 'c0'); L.line([(8, 3), (11, 2)], 'c0')
    fx = Layer('fx', w, h, PAL)
    dy = 8 if frame == 0 else 10
    fx.px(6, dy, 'water3'); fx.px(6, dy + 1, 'water2')
    return composite([L, fx])


def main(out_dir):
    os.makedirs(out_dir, exist_ok=True)
    bg = hx('1b1a26')
    p = pack()
    im = Image.new('RGB', (PACK_W + 3 * W_BIMBO + 40, PACK_H + H_BIMBO + 20), bg)
    im.paste(p, (4, 4), p)
    for i in range(3):
        sp = patch(i); im.paste(sp, (4 + PATCH_SLOTS[i][0] - 8, 4 + PATCH_SLOTS[i][1] - 7), sp)
    t = tear(0); im.paste(t, (4 + PATCH_SLOTS[3][0] - 7, 4 + PATCH_SLOTS[3][1] - 6), t)
    b = bimbo('happy'); im.paste(b, (4 + BIMBO_AT[0] - BIMBO_ANCHOR[0], 4 + BIMBO_AT[1] - BIMBO_ANCHOR[1]), b)
    for k, m in enumerate(['happy', 'worried', 'gasping']):
        b = bimbo(m); im.paste(b, (PACK_W + 20 + k * (W_BIMBO + 4), 10), b)
        b = bimbo(m, blink=True); im.paste(b, (PACK_W + 20 + k * (W_BIMBO + 4), 70), b)
    im.resize((im.width * 4, im.height * 4), Image.NEAREST).save(os.path.join(out_dir, 'backpack-ui.png'))
    print('ok')


if __name__ == '__main__':
    main(sys.argv[1] if len(sys.argv) > 1 else '.')
