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

def head(L, cx, cy, honk=False, blink=False, look=1, angry=False, clamp=False, wide=False):
    L.ell(cx, cy, 5.5, 5, 'gw')
    bx = cx + 4 * look
    if wide:                                                   # the full-volume honk: beak open like a mailbox
        L.poly([(bx, cy), (bx + 7 * look, cy - 1), (bx + 6 * look, cy + 4)], 'eye')        # the dark inside of the beak
        L.poly([(bx - 1, cy - 3), (bx + 9 * look, cy - 7), (bx + 10 * look, cy - 4), (bx + 1, cy + 0)], 'beak')
        L.poly([(bx - 1, cy + 1), (bx + 8 * look, cy + 5), (bx + 8 * look, cy + 8), (bx, cy + 4)], 'beakd')
    elif clamp:                                                # biting: beak clamped shut and wider at the hinge
        L.poly([(bx - 1, cy - 3), (bx + 10 * look, cy), (bx + 9 * look, cy + 3), (bx - 1, cy + 3)], 'beak')
        L.line([(bx, cy + 1), (bx + 9 * look, cy + 1)], 'beakd')
    elif honk:
        L.poly([(bx, cy - 2), (bx + 9 * look, cy - 1), (bx + 8 * look, cy + 1), (bx, cy + 1)], 'beak')
        L.poly([(bx, cy + 2), (bx + 7 * look, cy + 4), (bx, cy + 4)], 'beakd')
    else:
        L.poly([(bx, cy - 2), (bx + 9 * look, cy), (bx + 8 * look, cy + 2), (bx, cy + 3)], 'beak')
        L.line([(bx + 1 * look, cy + 1), (bx + 7 * look, cy + 1)], 'beakd')
    L.ell(bx, cy - 1, 1.8, 2.2, 'beak2')                       # knob at the base of the beak
    ex = cx - 1 * look
    if blink:
        L.line([(ex - 1, cy - 1), (ex + 1, cy - 1)], 'eye')
    elif angry:                                                # squeezed into a furious little slit
        L.line([(ex - 1, cy - 2), (ex + 1, cy - 1)], 'eye')
    else:
        L.rect(ex, cy - 3, ex + 1, cy - 1, 'eye'); L.px(ex, cy - 3, 'shine')        # 2x3 eye with a shine
    if angry: L.line([(ex - 2 * look, cy - 6), (ex + 2 * look, cy - 3)], 'eye', 1)  # brow slammed down
    else: L.line([(ex - 1, cy - 5), (ex + 2, cy - 4)], 'eye')                       # a thin grumpy brow

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

def feet(L, fx, fy, lift, col, big=1.0):
    """A flat orange flipper, much too big, slapping down."""
    L.line([(fx, fy - 8), (fx, fy - lift)], col, 2)
    y = fy - lift
    L.poly([(fx - 5 * big, y + 1), (fx, y - 1), (fx + 6 * big, y + 1), (fx + 4 * big, y + 2), (fx - 4 * big, y + 2)], col)

def build_walk(frame, w=48, h=62):
    """The waddle: the whole goose rocks side to side, the head pumps forward and back like a pigeon's,
    and the enormous flat feet slap down one after the other. Deeply undignified."""
    ph = frame / 8 * math.tau
    step = math.sin(ph)                                         # -1 left foot down .. +1 right foot down
    rock = round(step * 1.5)                                    # body sway (px)
    hop = 1 if abs(step) < 0.4 else 0                            # mid-stride the body bobs up
    pump = round(math.cos(ph * 2) * 2.5)                        # head forward/back, twice per cycle
    L = []
    legs = Layer('legs', w, h, PAL)
    feet(legs, 19 + rock, 58, 3 if step > 0.3 else 0, 'leg', 1.2)
    feet(legs, 28 + rock, 58, 3 if step < -0.3 else 0, 'leg2', 1.2)
    L.append(legs)
    body = Layer('goose', w, h, PAL)
    by = 42 - hop
    body.ell(22 + rock, by, 15, 10, 'gw')
    tail = -2 if step > 0 else 2                                # the tail wags the opposite way
    body.poly([(9 + rock, by - 2), (2 + rock + tail, by - 11), (4 + rock + tail, by - 12), (12 + rock, by - 6)], 'gw')
    body.ell(23 + rock, by + 5, 11, 4, 'gs')
    hx_ = 33 + rock + pump
    neck(body, (31 + rock, by - 7), (hx_ - 1, 11 - hop), sway=-1.4 + pump * 0.3)
    body.ell(31 + rock, by - 5, 6, 6, 'gw')
    head(body, hx_, 9 - hop, blink=frame == 6)
    L.append(body)
    wing = Layer('wing', w, h, PAL)
    flap = 1 if frame % 4 == 1 else 0                           # little elbow-flaps for balance
    wing.ell(18 + rock, by - 2 - flap, 11, 6.5, 'gs')
    for k in range(4): wing.line([(9 + k * 4 + rock, by - 4 + k % 2 - flap), (14 + k * 4 + rock, by + 2 - flap)], 'gd')
    wing.poly([(7 + rock, by - 1 - flap * 3), (1 + rock, by - 7 - flap * 3), (9 + rock, by - 4)], 'gd')
    L.append(wing)
    return composite(L)

def build_bite(frame, w=64, h=50):
    """Latched on: body braced back, neck stretched flat out, beak clamped, eyes slitted, and the head
    thrashing side to side like a terrier with a sock. Wings flail for leverage."""
    shake = (0, -2, 1, -1, 2, -2, 0, 1)[frame % 8]
    flail = frame % 2 == 0
    L = []
    wb = Layer('wingb', w, h, PAL)
    wb.poly([(18, 28), (6, 10) if flail else (4, 22), (12, 12) if flail else (8, 26), (24, 26)], 'gd')
    L.append(wb)
    legs = Layer('legs', w, h, PAL)                            # feet planted, braced back
    legs.line([(16, 40), (10, 47)], 'leg', 2); legs.line([(21, 41), (17, 48)], 'leg2', 2)
    legs.poly([(5, 48), (10, 46), (14, 48), (12, 49), (6, 49)], 'leg'); legs.poly([(12, 49), (17, 47), (21, 49), (19, 50), (13, 50)], 'leg2')
    L.append(legs)
    body = Layer('goose', w, h, PAL)
    body.ell(19, 34, 13, 9, 'gw')
    body.poly([(8, 32), (1, 22), (4, 21), (11, 28)], 'gw')      # tail up, quivering
    body.ell(20, 39, 9, 3.5, 'gs')
    neck(body, (28, 30), (47, 24 + shake), r0=3.8, r1=3.0, sway=-2 + shake * 0.6, n=11)
    head(body, 50, 23 + shake, clamp=True, angry=True)
    L.append(body)
    wf = Layer('wingf', w, h, PAL)
    if flail:
        wf.poly([(16, 32), (10, 8), (19, 10), (27, 28)], 'gw')
        for k in range(3): wf.line([(12 + k * 3, 12 + k * 2), (17 + k * 3, 27)], 'gs')
    else:
        wf.poly([(16, 32), (2, 30), (8, 37), (27, 34)], 'gw')
        for k in range(3): wf.line([(5 + k * 4, 33), (17 + k * 3, 33)], 'gs')
    L.append(wf)
    return composite(L)

def build_honk(frame, w=48, h=62):
    """HONK. Neck shot straight up, beak open like a mailbox, wings thrown out, chest puffed."""
    big = frame in (1, 2)
    L = []
    legs = Layer('legs', w, h, PAL)
    feet(legs, 19, 58, 0, 'leg', 1.2); feet(legs, 28, 58, 0, 'leg2', 1.2)
    L.append(legs)
    wb = Layer('wingb', w, h, PAL)
    wb.poly([(18, 38), (2, 24 if big else 30), (6, 22 if big else 28), (24, 34)], 'gd')
    L.append(wb)
    body = Layer('goose', w, h, PAL)
    body.ell(22, 43, 15 + big, 10 + big, 'gw')
    body.poly([(9, 41), (1, 30), (4, 29), (12, 37)], 'gw')
    body.ell(23, 48, 11, 4, 'gs')
    neck(body, (30, 35), (34, 8 - big * 2), sway=0.5, n=10)
    body.ell(31, 37, 7 + big, 7 + big, 'gw')
    head(body, 35, 6 - big * 2, wide=True)
    L.append(body)
    wf = Layer('wingf', w, h, PAL)
    wf.poly([(20, 40), (40, 26 if big else 32), (44, 30 if big else 36), (28, 44)], 'gw')
    for k in range(3): wf.line([(30 + k * 4, 30 + k * 2 if big else 36 + k), (26 + k * 2, 42)], 'gs')
    L.append(wf)
    return composite(L)

def build_hiss(frame, w=62, h=62):
    """The classic goose threat display, for when he's furious: wings spread wide, neck snaking low and
    forward, beak open, hissing at everything including you."""
    wob = (0, 1, 2, 1)[frame % 4]
    L = []
    wb = Layer('wingb', w, h, PAL)
    wb.poly([(18, 38), (2, 18 + wob), (8, 16 + wob), (26, 34)], 'gd')
    for k in range(3): wb.line([(4 + k * 3, 19 + k * 3 + wob), (20, 36)], 'gd2')
    L.append(wb)
    legs = Layer('legs', w, h, PAL)
    feet(legs, 17, 58, 0, 'leg', 1.2); feet(legs, 26, 58, 0, 'leg2', 1.2)
    L.append(legs)
    body = Layer('goose', w, h, PAL)
    body.ell(21, 43, 15, 10, 'gw')
    body.poly([(8, 41), (0, 33), (3, 32), (11, 37)], 'gw')
    body.ell(22, 48, 11, 4, 'gs')
    L.append(body)
    wf = Layer('wingf', w, h, PAL)                             # near wing up and back, so the neck shows
    wf.poly([(14, 40), (20, 12 + wob), (27, 14 + wob), (25, 42)], 'gw')
    for k in range(3): wf.line([(20 + k * 2, 15 + k * 3 + wob), (19 + k, 39)], 'gs')
    L.append(wf)
    nk = Layer('neck', w, h, PAL)
    neck(nk, (31, 38), (46, 36 + wob), r0=4.2, r1=3, sway=5 - wob * 2, n=12)   # low, snaking S
    head(nk, 48, 35 + wob, wide=True, angry=True)
    L.append(nk)
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
