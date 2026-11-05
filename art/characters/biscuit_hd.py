"""
Biscuit at the fine resolution (640x360 native), modelled on a white farm goose:
plump rounded body tipping up at the tail, tall upright neck, small round head,
big orange beak with a knob at its base, sturdy orange legs and webbed feet.

Poses: idle (standing, a little head bob and a blink) and fling (compact body, wings up,
neck reaching forward, beak open in a honk).

Run: python3 art/characters/biscuit_hd.py OUT_DIR   (writes biscuit-hd.gif and biscuit-hd-sheet.png)
"""
import math
import os
import sys

from PIL import Image

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))
from hdkit import Layer, composite, hx  # noqa: E402

PAL = {k: hx(v) for k, v in {
    'gw': 'f8f4ea', 'gs': 'dcd4c6', 'gd': 'b4ab9c', 'gd2': '948b7e',
    'beak': 'f0803a', 'beak2': 'ffac70', 'beakd': 'b85a24', 'leg': 'ee8a48', 'leg2': 'c0642c',
    'eye': '15111c', 'shine': 'ffffff', 'brow': '6e6658',
}.items()}

def neck(L, base, top, r0=4.0, r1=3.2, sway=1.2, n=9):
    for i in range(n):
        u = i / (n - 1)
        x = base[0] + (top[0] - base[0]) * u + math.sin(u * math.pi) * sway
        y = base[1] + (top[1] - base[1]) * u
        r = r0 + (r1 - r0) * u
        L.ell(x, y, r, r, 'gw')

def head(L, cx, cy, honk=False, blink=False, look=1):
    L.ell(cx, cy, 5.5, 5, 'gw')
    bx = cx + 4 * look
    if honk:
        L.poly([(bx, cy - 2), (bx + 9 * look, cy - 1), (bx + 8 * look, cy + 1), (bx, cy + 1)], 'beak')
        L.poly([(bx, cy + 2), (bx + 7 * look, cy + 4), (bx, cy + 4)], 'beakd')
    else:
        L.poly([(bx, cy - 2), (bx + 9 * look, cy), (bx + 8 * look, cy + 2), (bx, cy + 3)], 'beak')
        L.line([(bx + 1 * look, cy + 1), (bx + 7 * look, cy + 1)], 'beakd')
    L.ell(bx, cy - 1, 1.8, 2.2, 'beak2')                       # knob at the base of the beak
    ex = cx - 1 * look
    if blink:
        L.line([(ex - 1, cy - 1), (ex + 1, cy - 1)], 'eye')
    else:
        L.rect(ex, cy - 3, ex + 1, cy - 1, 'eye'); L.px(ex, cy - 3, 'shine')        # 2x3 eye with a shine
    L.line([(ex - 1, cy - 5), (ex + 2, cy - 4)], 'eye')                            # a thin grumpy brow

def build_idle(frame, w=48, h=62):
    t = frame / 8 * math.tau
    bob = 1 if math.sin(t) > 0.4 else 0
    blink = frame == 5
    L = []
    legs = Layer('legs', w, h, PAL)
    legs.line([(19, 49), (18, 57)], 'leg', 2); legs.line([(27, 49), (28, 57)], 'leg2', 2)
    legs.poly([(13, 58), (18, 56), (22, 59)], 'leg'); legs.poly([(24, 59), (28, 56), (33, 58)], 'leg2')
    L.append(legs)
    body = Layer('goose', w, h, PAL)
    body.ell(22, 42, 15, 10, 'gw')                             # plump body
    body.poly([(9, 40), (2, 32), (4, 31), (12, 36)], 'gw')     # tail tipping up
    body.ell(23, 47, 11, 4, 'gs')                              # belly shade
    neck(body, (31, 35), (32, 11 + bob), sway=-1.4)
    body.ell(31, 37, 6, 6, 'gw')                               # chest
    head(body, 33, 9 + bob, blink=blink)
    L.append(body)
    wing = Layer('wing', w, h, PAL)
    wing.ell(18, 40, 11, 6.5, 'gs')
    for k in range(4):
        wing.line([(9 + k * 4, 38 + k % 2), (14 + k * 4, 44)], 'gd')       # feather edges
    wing.poly([(7, 41), (2, 36), (9, 38)], 'gd')               # wingtip over the tail
    L.append(wing)
    return composite(L)

def build_fling(frame, w=52, h=46):
    up = frame % 4 < 2
    L = []
    wb = Layer('wingb', w, h, PAL)                             # far wing
    wb.poly([(18, 22), (8, 4) if up else (6, 18), (14, 6) if up else (10, 22), (24, 20)], 'gd')
    L.append(wb)
    legs = Layer('legs', w, h, PAL)                            # legs trailing back
    legs.line([(14, 32), (8, 36)], 'leg', 2); legs.line([(18, 33), (12, 38)], 'leg2', 2)
    legs.poly([(4, 35), (8, 34), (7, 38)], 'leg'); legs.poly([(8, 37), (12, 36), (11, 40)], 'leg2')
    L.append(legs)
    body = Layer('goose', w, h, PAL)
    body.ell(20, 27, 12, 8.5, 'gw')                            # compact, round
    body.poly([(9, 25), (3, 19), (6, 18), (12, 22)], 'gw')     # tail
    body.ell(21, 31, 9, 3.5, 'gs')
    neck(body, (28, 22), (37, 8), r0=3.8, r1=3.1, sway=1.5, n=8)
    head(body, 39, 7, honk=True)
    L.append(body)
    wf = Layer('wingf', w, h, PAL)                             # near wing, feathered
    if up:
        wf.poly([(16, 26), (12, 2), (20, 5), (27, 22)], 'gw')
        for k in range(3): wf.line([(14 + k * 3, 6 + k * 2), (18 + k * 3, 21)], 'gs')
    else:
        wf.poly([(16, 25), (4, 33), (12, 35), (27, 27)], 'gw')
        for k in range(3): wf.line([(8 + k * 4, 33), (18 + k * 3, 27)], 'gs')
    L.append(wf)
    return composite(L)

def main(out_dir):
    os.makedirs(out_dir, exist_ok=True)
    bg = hx('1b1a26')
    frames = []
    for i in range(8):
        a, b = build_idle(i), build_fling(i)
        im = Image.new('RGB', (a.width + b.width + 16, max(a.height, b.height) + 4), bg)
        im.paste(a, (4, 2), a); im.paste(b, (a.width + 12, 10), b)
        frames.append(im.resize((im.width * 6, im.height * 6), Image.NEAREST))
    frames[0].save(os.path.join(out_dir, 'biscuit-hd.gif'), save_all=True, append_images=frames[1:], duration=130, loop=0)
    frames[0].save(os.path.join(out_dir, 'biscuit-hd-sheet.png'))
    print('ok')

if __name__ == '__main__':
    main(sys.argv[1] if len(sys.argv) > 1 else '.')
