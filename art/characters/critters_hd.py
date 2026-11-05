"""Entranced critters at the fine resolution: frogs (pond swarmers) and Old Snapper (tutorial boss)."""
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))
from hdkit import Layer, composite, hx  # noqa: E402

PT = {k: hx(v) for k, v in {
    'F0': '2e4c24', 'F1': '4e7a38', 'F2': '74a24e', 'F3': 'a8cc72', 'FR': 'ff3a3a', 'FR2': 'ffb0a0',
    'T0': '252e20', 'T1': '384630', 'T2': '52643e', 'T3': '6e8250', 'TSK': '5e6a4a', 'TSK2': '7e8a64',
}.items()}

def frog(blink, awake=False):
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
        eyes.ell(ex, 6, 2, 2, ('F0' if awake else 'FR') if not blink else 'F1')
        if not blink: eyes.px(ex - 1, 5, 'F3' if awake else 'FR2')
    eyes.line([(10, 14), (13, 15), (16, 14)], 'F0')
    L.append(eyes)
    return composite(L)

def snapper(blink, submerged=True, awake=False):
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
    head.ell(52, 15, 2, 2, ('T0' if awake else 'FR') if not blink else 'TSK2')
    if awake and not blink: head.px(51, 14, 'TSK2')
    L.append(head)
    im = composite(L)
    if not submerged:
        return im
    # waterline: the lower third is underwater
    px = im.load()
    for y in range(22, h):
        for x in range(w):
            if px[x, y][3]: px[x, y] = (0, 0, 0, 0)
    return im



HPAL = {k: hx(v) for k, v in {
    'H0': '2e3a4c', 'H1': '4a5c74', 'H2': '7890aa', 'H3': 'b4c4d4', 'HW': 'e8eef2', 'HK': '15111c',
    'BK': 'e8b830', 'BK2': 'ffd860', 'LG': 'a89a50', 'LG2': '7a6e38', 'FR': 'ff3a3a', 'FR2': 'ffb0a0', 'WAT': '9ae0ff',
}.items()}
HERON_W, HERON_H = 72, 92
HERON_ANCHOR = (30, 88)

def heron(pose='idle', blink=False, awake=False):
    """The Heron Ferryman, Reedmarsh's boss: tall, blue-grey, black crest plume, a long yellow spear of a beak.
    Poses: idle, wind (neck coiled back), stab (neck shot forward), gust (wings thrown open). Faces right."""
    w, h = HERON_W, HERON_H
    L = []
    if pose == 'gust':
        wb = Layer('wingb', w, h, HPAL)
        wb.poly([(24, 46), (2, 18), (6, 40), (18, 56)], 'H1')
        for k in range(4): wb.line([(4 + k * 3, 22 + k * 7), (18, 50)], 'H0')
        L.append(wb)
    legs = Layer('legs', w, h, HPAL)
    legs.line([(28, 62), (26, 88)], 'LG', 2); legs.line([(34, 62), (36, 88)], 'LG2', 2)
    legs.line([(20, 88), (32, 88)], 'LG', 1); legs.line([(32, 88), (42, 88)], 'LG2', 1)
    L.append(legs)
    body = Layer('heron', w, h, HPAL)
    body.ell(30, 54, 13, 11, 'H2')                                   # body
    body.poly([(18, 54), (6, 66), (14, 64), (22, 60)], 'H1')         # tail plumes
    body.ell(32, 58, 9, 6, 'H3')                                     # breast
    # neck and head by pose
    if pose == 'wind':
        neck = [(34, 46), (40, 38), (36, 30), (28, 26), (30, 18)]; head = (34, 16); beak = [(38, 14), (60, 12), (38, 18)]
    elif pose == 'stab':
        neck = [(36, 48), (44, 44), (52, 40), (58, 36)]; head = (60, 34); beak = [(64, 32), (71, 34), (64, 37)]
    else:
        neck = [(34, 46), (38, 36), (36, 26), (36, 18)]; head = (38, 14); beak = [(42, 12), (62, 15), (42, 17)]
    pts = neck + [head]
    for (x0, y0), (x1, y1) in zip(pts, pts[1:]):                       # a solid S-curve, thinning toward the head
        n = int(max(abs(x1 - x0), abs(y1 - y0))) + 1
        for k in range(n + 1):
            u = k / n; r = 3.6 - 1.0 * (pts.index((x0, y0)) + u) / len(pts)
            body.ell(x0 + (x1 - x0) * u, y0 + (y1 - y0) * u, r, r, 'H3')
    body.ell(neck[0][0], neck[0][1], 5, 5, 'H3')
    body.ell(head[0], head[1], 6, 5, 'HW')
    body.poly([(head[0] - 2, head[1] - 4), (head[0] - 16, head[1] - 11), (head[0] - 13, head[1] - 7), (head[0] - 4, head[1] - 1)], 'HK')   # crest plume
    L.append(body)
    bk = Layer('beak', w, h, HPAL)
    bk.poly(beak, 'BK'); bk.line([beak[0], beak[1]], 'BK2')
    L.append(bk)
    eye = Layer('eye', w, h, HPAL)
    ex, ey = head[0] + 1, head[1] - 1
    if blink: eye.line([(ex - 1, ey), (ex + 1, ey)], 'HK')
    else:
        eye.rect(ex - 1, ey - 1, ex + 1, ey + 1, 'HK' if awake else 'FR')
        eye.px(ex - 1, ey - 1, 'HW' if awake else 'FR2')
    eye.line([(head[0] - 4, head[1] + 1), (head[0] + 4, head[1] + 2)], 'HK')   # black eye stripe
    L.append(eye)
    if pose == 'gust':
        wf = Layer('wingf', w, h, HPAL)
        wf.poly([(36, 46), (66, 20), (62, 42), (44, 56)], 'H2')
        for k in range(4): wf.line([(64 - k * 3, 24 + k * 6), (44, 52)], 'H1')
        L.append(wf)
    else:
        wf = Layer('wingf', w, h, HPAL)
        wf.ell(26, 52, 11, 8, 'H1')
        for k in range(3): wf.line([(18 + k * 4, 50 + k), (24 + k * 4, 58)], 'H0')
        L.append(wf)
    return composite(L)


WPAL = {k: hx(v) for k, v in {
    'S0': '6e2e14', 'S1': 'a8502a', 'S2': 'd87a3e', 'S3': 'f0b070', 'SB': 'f4e2c4',
    'B0': '2a2830', 'B1': '4a4852', 'B2': '7a7884', 'BW': 'e8e4dc', 'BK': '15111c', 'NOSE': '2a1a1a',
    'R0': '3a2a1a', 'R1': '5e4026', 'R2': '86603a', 'GEM': 'ff3a3a', 'GEM2': 'ffb0a0', 'MOSS': '5a7a3a',
    'FR': 'ff3a3a', 'FR2': 'ffb0a0', 'AC': '8a5a2a', 'AC2': 'c08a4a', 'DIRT': '5a4630', 'DIRT2': '7a6040',
}.items()}

def squirrel(blink=False, awake=False, pose='idle'):
    """A Hollowbark squirrel: rusty, big curled tail, quick. Entranced: red eyes. Throw pose holds an acorn up."""
    w, h = 30, 30
    L = []
    tail = Layer('tail', w, h, WPAL)
    tail.ell(7, 13, 6, 9, 'S1'); tail.ell(9, 7, 5, 5, 'S2'); tail.ell(6, 15, 3, 5, 'S2')
    L.append(tail)
    body = Layer('body', w, h, WPAL)
    body.ell(16, 20, 6, 6, 'S2'); body.ell(17, 22, 3.5, 3.5, 'SB')
    body.ell(19, 12, 5, 4.5, 'S2'); body.poly([(17, 8), (18, 4), (20, 8)], 'S1'); body.poly([(21, 8), (23, 4), (23, 9)], 'S1')
    body.px(24, 13, 'NOSE')
    body.line([(14, 26), (13, 28)], 'S0'); body.line([(19, 26), (20, 28)], 'S0')
    L.append(body)
    if pose == 'throw':
        arm = Layer('arm', w, h, WPAL); arm.line([(19, 17), (22, 9)], 'S1', 2); arm.ell(23, 7, 2.5, 2.5, 'AC'); arm.px(23, 5, 'AC2'); L.append(arm)
    else:
        arm = Layer('arm', w, h, WPAL); arm.ell(20, 18, 2, 1.5, 'S1'); L.append(arm)
    eye = Layer('eye', w, h, WPAL)
    if blink: eye.line([(20, 11), (22, 11)], 'BK')
    else: eye.rect(20, 10, 21, 11, 'BK' if awake else 'FR'); eye.px(20, 10, 'BW' if awake else 'FR2')
    L.append(eye)
    return composite(L)

def badger(blink=False, awake=False, pose='idle'):
    """A badger: low and broad, striped face, digging claws. Dig pose: nose down, dirt flying."""
    w, h = 60, 38
    L = []
    body = Layer('body', w, h, WPAL)
    dy = 3 if pose == 'dig' else 0
    body.ell(26, 24, 20, 11, 'B1'); body.ell(25, 20, 16, 6, 'B2')
    for x in (12, 20, 34, 40): body.rect(x, 30, x + 4, 34, 'B0')
    body.ell(46, 22 + dy, 10, 8, 'BW')                                # white face
    body.poly([(38, 17 + dy), (52, 20 + dy), (54, 22 + dy), (38, 23 + dy)], 'BK')    # the dark stripe through the eye
    body.ell(55, 25 + dy, 2.5, 2, 'NOSE')
    body.ell(40, 14 + dy, 3, 2.5, 'BW')                               # ear
    L.append(body)
    eye = Layer('eye', w, h, WPAL)
    if blink: eye.line([(45, 20 + dy), (47, 20 + dy)], 'B2')
    else: eye.rect(45, 19 + dy, 46, 20 + dy, 'B2' if awake else 'FR'); eye.px(45, 19 + dy, 'BW' if awake else 'FR2')
    L.append(eye)
    if pose == 'dig':
        fx = Layer('fx', w, h, WPAL)
        for (x, y) in [(8, 22), (4, 16), (10, 12), (2, 26), (14, 8)]: fx.ell(x, y, 2, 1.5, 'DIRT2')
        L.append(fx)
    return composite(L)

def burrow_king(blink=False, awake=False, pose='idle'):
    """The Burrow King: a huge badger wearing a crown of twisted roots set with a red stone (the trance).
    Poses: idle, wind (hunched, claws raised), charge (low and long), dazed (crown askew, stars drawn in-game)."""
    w, h = 112, 76
    L = []
    low = pose == 'charge'
    body = Layer('body', w, h, WPAL)
    by = 46 if not low else 50
    body.ell(50, by, 38, 20 if not low else 16, 'B1'); body.ell(48, by - 8, 30, 10, 'B2')
    for x in (20, 34, 62, 74): body.rect(x, by + 14, x + 8, by + 22, 'B0')
    hx_, hy = (88, 38) if not low else (94, 44)
    if pose == 'wind': hy -= 6
    body.ell(hx_, hy, 18, 15, 'BW')
    body.poly([(hx_ - 16, hy - 7), (hx_ + 12, hy - 3), (hx_ + 15, hy + 1), (hx_ - 16, hy + 3)], 'BK')   # the dark stripe through the eye
    body.ell(hx_ + 17, hy + 4, 4, 3, 'NOSE')
    if pose == 'wind':
        body.poly([(70, 30), (64, 14), (72, 22)], 'B0'); body.poly([(76, 30), (74, 12), (80, 22)], 'B0')   # claws up
    L.append(body)
    crown = Layer('crown', w, h, WPAL)
    cx, cy = hx_ - 6, hy - 16
    tilt = 4 if pose == 'dazed' else 0
    for i, dx in enumerate((-10, -4, 2, 8)):
        crown.poly([(cx + dx, cy + 4 + tilt * (i - 1) // 2), (cx + dx + 2, cy - 8 - (i % 2) * 4 + tilt * (i - 1) // 2), (cx + dx + 4, cy + 4 + tilt * (i - 1) // 2)], 'R1')
    crown.rect(cx - 11, cy + 2 + tilt // 2, cx + 13, cy + 6 + tilt // 2, 'R0')
    crown.ell(cx + 1, cy + 3 + tilt // 2, 3, 2.5, 'MOSS' if awake else 'GEM'); crown.px(cx, cy + 2, 'GEM2' if not awake else 'MOSS')
    L.append(crown)
    eye = Layer('eye', w, h, WPAL)
    ex, ey = hx_ + 2, hy - 2
    if blink or pose == 'dazed': eye.line([(ex - 2, ey), (ex + 2, ey)], 'B2')
    else: eye.rect(ex - 1, ey - 1, ex + 1, ey + 1, 'B2' if awake else 'FR'); eye.px(ex - 1, ey - 1, 'BW' if awake else 'FR2')
    L.append(eye)
    return composite(L)
