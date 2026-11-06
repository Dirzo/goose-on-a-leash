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


# ---------------------------------------------------------------- Driftwood Wharf
SPAL = {k: hx(v) for k, v in {
    'C0': '5a1a14', 'C1': '9a3424', 'C2': 'd0583a', 'C3': 'f09068', 'CB': 'f4d0a8',
    'G0': '6a7280', 'G1': '9aa2ae', 'G2': 'd8dee6', 'GW': 'f6f8fa', 'GK': '2a2e36', 'BK': '15111c',
    'BEAK': 'f2b830', 'BEAK2': 'c07a18', 'LEG': 'e0a040',
    'HAT0': '141a2e', 'HAT1': '242e4a', 'GOLD': 'e8b840', 'GOLD2': 'fff0a0', 'BEARD0': '7a7f88', 'BEARD1': 'aeb4bc', 'BEARD2': 'd8dde2',
    'COAT0': '3a1a20', 'COAT1': '6a2a30', 'COAT2': '9a3a3a',
    'OT0': '3a2416', 'OT1': '5e3c24', 'OT2': '8a5e38', 'OT3': 'c49a6a', 'APR': '3e6a7a', 'APR2': '5e94a4',
    'FR': 'ff3a3a', 'FR2': 'ffb0a0', 'BW': 'f8f4ec', 'GEM': 'ff3a3a', 'SEA': '8fe0d0',
}.items()}


def crab(blink=False, awake=False, pose='idle'):
    """A shore crab: wide red shell, eyes on stalks, two big claws. guard: claws up in front of the face;
    snap: claws thrust forward and open."""
    w, h = 40, 28
    L = []
    legs = Layer('legs', w, h, SPAL)
    for i, x in enumerate((9, 13, 17)):
        legs.line([(x, 18), (x - 5, 22 + i % 2), (x - 6, 26)], 'C1')
        legs.line([(w - x, 18), (w - x + 5, 22 + i % 2), (w - x + 6, 26)], 'C1')
    L.append(legs)
    body = Layer('body', w, h, SPAL)
    body.ell(20, 17, 12, 7, 'C2'); body.ell(19, 15, 9, 4, 'C3'); body.ell(20, 20, 8, 2.5, 'C1')
    for x in (13, 20, 27): body.px(x, 14, 'CB')
    L.append(body)
    eyes = Layer('eyes', w, h, SPAL)
    for ex in (16, 24):
        eyes.line([(ex, 11), (ex, 7)], 'C1')
        if blink: eyes.line([(ex - 1, 6), (ex + 1, 6)], 'C1')
        else: eyes.ell(ex, 6, 1.8, 1.8, 'BK' if awake else 'FR'); eyes.px(ex - 1, 5, 'BW' if awake else 'FR2')
    L.append(eyes)
    claws = Layer('claws', w, h, SPAL)
    if pose == 'guard':
        for cx in (12, 28):
            claws.ell(cx, 8, 5, 6, 'C2'); claws.ell(cx, 6, 3, 3, 'C3'); claws.line([(cx, 13), (cx + (4 if cx < 20 else -4), 17)], 'C1', 2)
    elif pose == 'snap':
        for cx, s in ((4, -1), (36, 1)):
            claws.poly([(cx - 4 * s, 14), (cx + 3 * s, 9), (cx + 4 * s, 13), (cx, 15), (cx + 4 * s, 18), (cx + 2 * s, 20)], 'C2')
            claws.line([(cx - 3 * s, 16), (12 if s < 0 else 28, 17)], 'C1', 2)
    else:
        for cx in (6, 34):
            claws.ell(cx, 15, 5, 4, 'C2'); claws.ell(cx - (1 if cx < 20 else -1), 13, 2.5, 2, 'C3')
            claws.line([(cx + (3 if cx < 20 else -3), 16), (12 if cx < 20 else 28, 18)], 'C1', 2)
    L.append(claws)
    return composite(L)


def gull(blink=False, awake=False, pose='idle'):
    """A herring gull: white head and chest, grey wings, yellow beak with a red spot. Poses: idle, fly
    (wings up), flap (wings down), dive (wings swept back)."""
    w, h = 44, 34
    L = []
    if pose in ('fly', 'flap', 'dive'):
        wing = Layer('wing', w, h, SPAL)
        if pose == 'fly': wing.poly([(18, 18), (4, 4), (10, 4), (24, 16)], 'G1'); wing.poly([(24, 18), (38, 2), (42, 6), (28, 18)], 'G1'); wing.poly([(4, 4), (8, 2), (10, 4)], 'GK'); wing.poly([(38, 2), (42, 2), (42, 6)], 'GK')
        elif pose == 'flap': wing.poly([(16, 18), (2, 26), (8, 28), (24, 20)], 'G1'); wing.poly([(26, 18), (40, 28), (44, 24), (30, 18)], 'G1'); wing.px(3, 27, 'GK'); wing.px(43, 25, 'GK')
        else: wing.poly([(14, 16), (2, 12), (4, 16), (20, 20)], 'G1'); wing.poly([(2, 12), (5, 11), (4, 16)], 'GK')
        L.append(wing)
    body = Layer('body', w, h, SPAL)
    by = 18 if pose != 'idle' else 21
    body.ell(20, by, 10, 6, 'GW'); body.ell(17, by - 2, 7, 3, 'G2')
    if pose == 'idle':
        body.poly([(10, by - 2), (26, by - 4), (28, by + 2), (12, by + 4)], 'G1')     # folded wing
        body.poly([(8, by), (2, by - 2), (4, by + 3)], 'GK')                            # tail
        body.line([(18, by + 5), (17, by + 11)], 'LEG'); body.line([(23, by + 5), (24, by + 11)], 'LEG')
    body.ell(30, by - 6, 6, 5, 'GW')
    body.poly([(35, by - 7), (42, by - 5), (35, by - 4)], 'BEAK'); body.px(39, by - 5, 'FR')
    L.append(body)
    eye = Layer('eye', w, h, SPAL)
    if blink: eye.line([(30, by - 7), (32, by - 7)], 'G1')
    else: eye.rect(31, by - 8, 32, by - 7, 'BK' if awake else 'FR'); eye.px(31, by - 8, 'BW' if awake else 'FR2')
    L.append(eye)
    return composite(L)


def gullbeard(blink=False, awake=False, pose='idle'):
    """Captain Gullbeard: a gull the size of a rowing boat in a tricorn hat (gold trim, the trance's red stone
    on it) and a red coat, with a great grey feather beard. Poses: idle, fly, flap, swoop, dazed (hat askew)."""
    w, h = 112, 92
    L = []
    flying = pose in ('fly', 'flap', 'swoop')
    if flying:
        wing = Layer('wing', w, h, SPAL)
        if pose == 'fly':
            wing.poly([(40, 46), (6, 8), (22, 10), (56, 42)], 'G1'); wing.poly([(60, 44), (100, 4), (108, 14), (70, 48)], 'G1')
            wing.poly([(6, 8), (14, 4), (22, 10)], 'GK'); wing.poly([(100, 4), (110, 4), (108, 14)], 'GK')
        elif pose == 'flap':
            wing.poly([(38, 48), (4, 70), (18, 74), (56, 54)], 'G1'); wing.poly([(64, 48), (104, 72), (110, 62), (72, 46)], 'G1')
        else:
            wing.poly([(32, 44), (2, 34), (6, 44), (46, 54)], 'G1'); wing.poly([(2, 34), (10, 32), (6, 44)], 'GK')
        L.append(wing)
    body = Layer('body', w, h, SPAL)
    by = 52 if flying else 58
    body.ell(52, by, 26, 17, 'GW'); body.ell(46, by - 6, 18, 8, 'G2')
    coat = Layer('coat', w, h, SPAL)
    coat.poly([(30, by - 6), (70, by - 10), (76, by + 8), (60, by + 18), (34, by + 14)], 'COAT1')
    coat.poly([(30, by - 6), (44, by - 8), (40, by + 14), (34, by + 14)], 'COAT2')
    for yy in (by - 2, by + 6): coat.px(56, yy, 'GOLD')
    if not flying:
        body.poly([(26, by), (10, by - 4), (14, by + 6)], 'GK')
        body.line([(46, by + 16), (44, by + 30)], 'LEG', 2); body.line([(60, by + 16), (62, by + 30)], 'LEG', 2)
        body.line([(40, by + 30), (48, by + 30)], 'LEG', 2); body.line([(58, by + 30), (66, by + 30)], 'LEG', 2)
    L.append(body); L.append(coat)
    head = Layer('head', w, h, SPAL)
    hx_, hy = (82, by - 22) if pose != 'swoop' else (90, by - 10)
    head.ell(hx_, hy, 14, 12, 'GW')
    head.poly([(hx_ + 11, hy - 2), (hx_ + 28, hy + 2), (hx_ + 24, hy + 6), (hx_ + 11, hy + 5)], 'BEAK')
    head.poly([(hx_ + 22, hy + 3), (hx_ + 28, hy + 2), (hx_ + 26, hy + 6)], 'BEAK2'); head.px(hx_ + 22, hy + 4, 'FR')
    L.append(head)
    beard = Layer('beard', w, h, SPAL)
    for i, (dx, dy, r) in enumerate([(-2, 10, 8), (4, 14, 7), (-8, 14, 6), (2, 20, 5), (-4, 22, 4), (8, 9, 5)]):
        beard.ell(hx_ + dx, hy + dy, r, r * 0.9, 'BEARD1' if i % 2 else 'BEARD0')
        beard.px(hx_ + dx - 1, hy + dy - 2, 'BEARD2')
    L.append(beard)
    hat = Layer('hat', w, h, SPAL)
    tilt = 6 if pose == 'dazed' else 0
    tx, ty = hx_ - 2, hy - 12 + tilt // 2
    hat.poly([(tx - 18, ty + 2 + tilt), (tx, ty - 12), (tx + 18, ty + 2 - tilt), (tx + 8, ty + 4), (tx - 8, ty + 4)], 'HAT1')
    hat.line([(tx - 18, ty + 2 + tilt), (tx - 8, ty + 4), (tx + 8, ty + 4), (tx + 18, ty + 2 - tilt)], 'GOLD')
    hat.ell(tx, ty - 3, 3, 3, 'SEA' if awake else 'GEM'); hat.px(tx - 1, ty - 4, 'GOLD2')
    L.append(hat)
    eye = Layer('eye', w, h, SPAL)
    ex, ey = hx_ + 4, hy - 3
    if blink or pose == 'dazed': eye.line([(ex - 2, ey), (ex + 2, ey)], 'G1')
    else:
        eye.rect(ex - 1, ey - 1, ex + 1, ey + 1, 'BK' if awake else 'FR'); eye.px(ex - 1, ey - 1, 'BW' if awake else 'FR2')
        eye.line([(ex - 4, ey - 3), (ex + 3, ey - 2)], 'G0')       # a stern brow
    L.append(eye)
    return composite(L)


GULLBEARD_ANCHOR = (52, 90)


def pickett(blink=False, pose='idle'):
    """Pickett the otter, who keeps the tackle shop: sleek brown, pale muzzle, a blue apron, a bit of sea glass
    on a cord. Pose 'wave': one paw up."""
    w, h = 34, 40
    L = []
    tail = Layer('tail', w, h, SPAL); tail.poly([(8, 30), (1, 37), (4, 38), (12, 33)], 'OT1'); L.append(tail)
    body = Layer('body', w, h, SPAL)
    body.ell(17, 27, 9, 10, 'OT2'); body.ell(17, 30, 6, 7, 'OT3')
    body.rect(11, 24, 23, 36, 'APR'); body.rect(12, 25, 22, 26, 'APR2')
    body.line([(13, 36), (12, 39)], 'OT0', 2); body.line([(21, 36), (22, 39)], 'OT0', 2)
    L.append(body)
    head = Layer('head', w, h, SPAL)
    head.ell(17, 12, 8, 7, 'OT2'); head.ell(17, 15, 5, 3.5, 'OT3')
    head.ell(10, 7, 2, 2, 'OT1'); head.ell(24, 7, 2, 2, 'OT1')
    head.ell(17, 13, 1.5, 1, 'BK')
    for s in (-1, 1): head.line([(17 + s * 3, 15), (17 + s * 8, 14)], 'OT3')
    L.append(head)
    arm = Layer('arm', w, h, SPAL)
    if pose == 'wave': arm.line([(25, 24), (29, 15)], 'OT1', 3); arm.ell(29, 14, 2, 2, 'OT2')
    else: arm.line([(25, 25), (24, 31)], 'OT1', 3)
    arm.line([(14, 20), (17, 23), (20, 20)], 'OT0'); arm.ell(17, 24, 1.5, 1.5, 'SEA')
    L.append(arm)
    eye = Layer('eye', w, h, SPAL)
    for ex in (14, 20):
        if blink: eye.line([(ex - 1, 10), (ex + 1, 10)], 'OT0')
        else: eye.rect(ex, 9, ex + 1, 10, 'BK'); eye.px(ex, 9, 'BW')
    L.append(eye)
    return composite(L)


# ---------------------------------------------------------------- The Tide Caves: fish and eels
FPAL = {k: hx(v) for k, v in {
    'S0': '3a4a58', 'S1': '7a90a0', 'S2': 'b8d0d8', 'S3': 'eef6f8',
    'M0': '1e3a40', 'M1': '2e6a6a', 'M2': '6ab0a0', 'M3': 'c8e8d8', 'MS': '10242a',
    'B0': '3a4250', 'B1': '6a7888', 'B2': '9aa8b8', 'B3': 'd8e0e8',
    'G0': '3a2a1a', 'G1': '6a4a2e', 'G2': '8a6a4a', 'G3': 'c09a6a', 'GS': 'e0c090',
    'E0': '1e2a14', 'E1': '3a5a24', 'E2': '5a7a3a', 'E3': '8aa858', 'EY': 'f2d040',
    'FIN': 'c8a8a0', 'BK': '15111c', 'BW': 'f8f4ec', 'FR': 'ff3a3a', 'FR2': 'ffb0a0', 'MOUTH': '5a1a1a', 'TOOTH': 'f0ece0',
    'W0': '0c2630', 'W1': '9ad8e8', 'W2': 'e0f4f8',
}.items()}


def _fish(w, h, body, belly, back, tail, eye_xy, eye_r=1.5, spots=None, stripes=None, fin=None):
    L = []
    t = Layer('tail', w, h, FPAL); t.poly(tail[0], tail[1]); L.append(t)
    b = Layer('body', w, h, FPAL)
    cx, cy, rx, ry = body
    b.ell(cx, cy, rx, ry, back); b.ell(cx + 1, cy + ry * 0.35, rx * 0.92, ry * 0.6, belly)
    for (x, y, c) in (spots or []): b.px(x, y, c)
    for (pts, c) in (stripes or []): b.line(pts, c)
    if fin: b.poly(fin[0], fin[1])
    L.append(b)
    e = Layer('eye', w, h, FPAL); ex, ey = eye_xy
    e.ell(ex, ey, eye_r + 0.5, eye_r + 0.5, 'BW'); e.ell(ex, ey, eye_r * 0.7, eye_r * 0.7, 'BK'); L.append(e)
    return composite(L)


def sprat():
    w, h = 26, 12
    return _fish(w, h, (14, 6, 9, 3.5), 'S3', 'S1', ([(5, 6), (0, 1), (2, 6), (0, 11)], 'S1'), (20, 5), 1,
                 stripes=[([(8, 5), (20, 5)], 'S2')])


def mackerel():
    w, h = 40, 16
    stripes = [([(10 + i * 4, 3), (12 + i * 4, 7)], 'MS') for i in range(6)]
    return _fish(w, h, (21, 8, 14, 5), 'M3', 'M1', ([(8, 8), (0, 2), (3, 8), (0, 14)], 'M1'), (31, 7), 1.5, stripes=stripes,
                 fin=([(18, 4), (22, 0), (25, 4)], 'M0'))


def bass():
    w, h = 52, 24
    return _fish(w, h, (27, 12, 18, 8), 'B3', 'B1', ([(10, 12), (0, 3), (4, 12), (0, 21)], 'B1'), (40, 9), 2,
                 stripes=[([(12, 11), (42, 11)], 'B0')], fin=([(20, 5), (26, 0), (34, 5)], 'B0'))


def grouper():
    w, h = 70, 36
    spots = [(x, y, 'G0') for x in range(18, 56, 5) for y in range(10, 28, 5) if (x + y) % 3 == 0]
    L = _fish(w, h, (36, 18, 26, 13), 'GS', 'G2', ([(12, 18), (0, 6), (5, 18), (0, 30)], 'G1'), (54, 13), 2.5, spots=spots,
              fin=([(24, 6), (34, 0), (48, 6)], 'G1'))
    d = Image_draw(L); d.line([(58, 22), (64, 22)], fill=FPAL['G0'] + (255,), width=2)   # a big sulky mouth
    return L


def moray(pose='idle', awake=False):
    """A Moray Twin: long green eel, yellow eye (red in the trance), jaws full of teeth."""
    w, h = 92, 30
    L = []
    b = Layer('body', w, h, FPAL)
    pts = [(4 + i * 4, 18 + 5 * __import__('math').sin(i * 0.6)) for i in range(20)]
    for i, (x, y) in enumerate(pts): b.ell(x, y, 4 + min(i, 12) * 0.35, 4 + min(i, 12) * 0.35, 'E1')
    for i, (x, y) in enumerate(pts[::2]): b.px(x, y - 2, 'E3'); b.px(x + 1, y + 2, 'E0')
    b.ell(84, 14, 7, 6, 'E2')
    L.append(b)
    j = Layer('jaw', w, h, FPAL)
    if pose == 'bite':
        j.poly([(84, 12), (92, 6), (92, 10)], 'MOUTH'); j.poly([(84, 16), (92, 22), (92, 18)], 'MOUTH')
        for x in (87, 90): j.px(x, 9, 'TOOTH'); j.px(x, 19, 'TOOTH')
    else:
        j.line([(84, 16), (91, 15)], 'MOUTH')
        for x in (86, 89): j.px(x, 16, 'TOOTH')
    L.append(j)
    e = Layer('eye', w, h, FPAL); e.ell(84, 11, 1.8, 1.8, 'EY' if awake else 'FR'); e.px(84, 10, 'BK'); L.append(e)
    return composite(L)


def eel(pose='up', blink=False, awake=False):
    """A tide-pool eel seen from above-ish: head and neck reared out of the water. Poses: up, bite (lunging,
    jaws open), beached (lying on the rocks)."""
    import math
    w, h = 40, 44
    L = []
    if pose == 'beached':
        b = Layer('body', w, h, FPAL)
        for i in range(10): b.ell(4 + i * 3.4, 34 + 3 * math.sin(i * 0.9), 3.5, 3.5, 'E1')
        b.ell(36, 32, 5, 4, 'E2'); L.append(b)
        e = Layer('eye', w, h, FPAL); e.line([(35, 30), (37, 30)], 'BK') if blink else e.px(36, 30, 'EY' if awake else 'FR'); L.append(e)
        return composite(L)
    rip = Layer('fx', w, h, FPAL); rip.ell(20, 38, 14, 4, 'W1'); rip.ell(20, 38, 10, 2.5, 'W0'); L.append(rip)
    b = Layer('body', w, h, FPAL)
    lean = 6 if pose == 'bite' else 0
    for i in range(9): b.ell(20 + lean * i / 8, 38 - i * 3.4, 4.2 - i * 0.12, 4, 'E1')
    for i in range(0, 9, 2): b.px(19 + lean * i / 8, 37 - i * 3.4, 'E3')
    hx_, hy = 20 + lean, 8
    b.ell(hx_, hy, 6, 5, 'E2')
    L.append(b)
    j = Layer('jaw', w, h, FPAL)
    if pose == 'bite':
        j.poly([(hx_ + 3, hy), (hx_ + 12, hy - 6), (hx_ + 12, hy - 2)], 'MOUTH'); j.poly([(hx_ + 3, hy + 2), (hx_ + 12, hy + 7), (hx_ + 12, hy + 3)], 'MOUTH')
        j.px(hx_ + 8, hy - 3, 'TOOTH'); j.px(hx_ + 8, hy + 4, 'TOOTH')
    else: j.line([(hx_ + 2, hy + 2), (hx_ + 6, hy + 2)], 'MOUTH')
    L.append(j)
    e = Layer('eye', w, h, FPAL)
    if blink: e.line([(hx_ - 1, hy - 2), (hx_ + 1, hy - 2)], 'E0')
    else: e.ell(hx_, hy - 2, 1.4, 1.4, 'EY' if awake else 'FR'); e.px(hx_ - 1, hy - 3, 'BW' if awake else 'FR2')
    L.append(e)
    return composite(L)


def Image_draw(im):
    from PIL import ImageDraw
    return ImageDraw.Draw(im)


# ---- the whole fish journal: a parametric fish plus a few odd shapes
import math as _m


def _pal(*cols):
    return {f'c{i}': hx(c) for i, c in enumerate(cols)} | {'BK': hx('15111c'), 'BW': hx('f8f4ec'), 'OUT': hx('1a1522')}


def fishy(w, h, back, belly, fin, stripe=None, eye=1.5, tall=0.45, long=1.0, spots=None, bars=None, lure=False, glow=None):
    """A side-on fish facing right: body ellipse, belly, tail, dorsal fin, optional stripe/bars/spots."""
    P = _pal(back, belly, fin, stripe or back, '000000', glow or 'ffffff')
    L = []
    cx, cy, rx = w * 0.54, h * 0.5, w * 0.4 * long
    ry = h * tall
    t = Layer('tail', w, h, P)
    t.poly([(cx - rx + 2, cy), (1, cy - ry * 0.9), (cx - rx * 0.75, cy), (1, cy + ry * 0.9)], 'c2'); L.append(t)
    b = Layer('body', w, h, P)
    b.ell(cx, cy, rx, ry, 'c0'); b.ell(cx + 1, cy + ry * 0.35, rx * 0.9, ry * 0.55, 'c1')
    b.poly([(cx - rx * 0.4, cy - ry + 1), (cx - rx * 0.05, cy - ry - h * 0.18), (cx + rx * 0.3, cy - ry + 1)], 'c2')
    if stripe: b.line([(cx - rx * 0.8, cy), (cx + rx * 0.8, cy)], 'c3')
    for i in range(bars or 0): x = cx - rx * 0.6 + i * rx * 1.2 / max(1, bars - 1); b.line([(x, cy - ry * 0.8), (x + 1, cy - ry * 0.1)], 'c3')
    for (sx, sy) in (spots or []): b.px(cx + sx * rx, cy + sy * ry, 'c3')
    if lure: b.line([(cx + rx * 0.5, cy - ry), (cx + rx * 0.9, cy - ry - 6)], 'c2'); b.ell(cx + rx * 0.95, cy - ry - 7, 1.5, 1.5, 'c5')
    if glow: b.ell(cx, cy + ry * 0.2, 1, 1, 'c5'); b.ell(cx - rx * 0.4, cy + ry * 0.3, 1, 1, 'c5'); b.ell(cx + rx * 0.4, cy + ry * 0.25, 1, 1, 'c5')
    L.append(b)
    e = Layer('eye', w, h, P); ex, ey = cx + rx * 0.68, cy - ry * 0.25
    e.ell(ex, ey, eye + 0.5, eye + 0.5, 'BW'); e.ell(ex, ey, eye * 0.6, eye * 0.6, 'BK'); L.append(e)
    return composite(L)


def longfish(w, h, back, belly, fin, wavy=0.0, beak=False):
    P = _pal(back, belly, fin)
    L = []
    b = Layer('body', w, h, P)
    for i in range(int(w * 0.9)):
        x = 2 + i; y = h / 2 + wavy * _m.sin(i * 0.25); r = h * 0.28 * min(1, (i + 3) / 8)
        b.ell(x, y, 1.5, r, 'c0'); b.px(x, y + r * 0.4, 'c1')
    if beak: b.poly([(w * 0.9, h / 2 - 1), (w - 1, h / 2), (w * 0.9, h / 2 + 1)], 'c2')
    for i in range(0, int(w * 0.8), 3): b.px(4 + i, h / 2 - h * 0.28 + 1 + wavy * _m.sin((4 + i) * 0.25), 'c2')
    L.append(b)
    e = Layer('eye', w, h, P); e.ell(w * 0.88 - (3 if beak else 0), h / 2 - 1 + wavy * _m.sin(w * 0.8 * 0.25), 1.2, 1.2, 'BW'); e.px(w * 0.88 - (3 if beak else 0), h / 2 - 1, 'BK'); L.append(e)
    return composite(L)


def odd(kind):
    if kind == 'boot':
        P = _pal('4a3424', '6a4a30', '2a1a10', 'b8a080'); L = []
        b = Layer('body', 30, 30, P); b.rect(6, 4, 16, 22, 'c0'); b.rect(6, 18, 27, 26, 'c0'); b.rect(6, 25, 28, 27, 'c2'); b.rect(8, 6, 14, 8, 'c1')
        for y in range(9, 18, 3): b.line([(8, y), (14, y)], 'c3')
        L.append(b); return composite(L)
    if kind == 'bottle':
        P = _pal('3a8a5a', '9ae0b0', 'e8dcc0', '8a5a2a'); L = []
        b = Layer('body', 30, 14, P); b.ell(12, 7, 9, 5, 'c0'); b.rect(19, 5, 26, 9, 'c0'); b.rect(26, 5, 28, 9, 'c3'); b.rect(7, 5, 15, 9, 'c2'); b.px(9, 5, 'c1')
        L.append(b); return composite(L)
    if kind == 'chest':
        P = _pal('5a3a1e', '8a5a2e', 'e8b840', '2a1a10'); L = []
        b = Layer('body', 40, 30, P); b.rect(3, 10, 36, 28, 'c0'); b.rect(3, 4, 36, 12, 'c1'); b.rect(18, 10, 22, 16, 'c2')
        for x in (8, 30): b.rect(x, 4, x + 2, 28, 'c3')
        b.px(12, 2, 'c2'); b.px(26, 1, 'c2'); L.append(b); return composite(L)
    if kind == 'hermit':
        P = _pal('d8b8a0', 'b06a4a', 'e05a3a', 'f0d8c8'); L = []
        b = Layer('body', 22, 18, P); b.ell(9, 9, 8, 7, 'c0'); b.ell(8, 8, 4, 3, 'c3')
        for r in (5, 3): b.ell(9, 9, r, r * 0.8, 'c1' if r == 5 else 'c0')
        c = Layer('claw', 22, 18, P); c.ell(17, 11, 4, 3, 'c2'); c.line([(14, 14), (19, 16)], 'c2'); c.line([(15, 7), (16, 3)], 'c2'); c.px(16, 3, 'BK')
        L += [b, c]; return composite(L)
    if kind == 'cuttle':
        P = _pal('8a6a8a', 'c8a8c0', 'e0c8d8', '5a3a5a'); L = []
        b = Layer('body', 40, 20, P); b.ell(16, 10, 13, 7, 'c0'); b.ell(16, 10, 15, 8.5, 'c2'); b.ell(16, 10, 13, 7, 'c0'); b.ell(17, 12, 10, 3, 'c1')
        for i in range(5): b.line([(29, 8 + i), (38, 6 + i * 2)], 'c3')
        for x in range(6, 26, 4): b.px(x, 7 + (x % 3), 'c3')
        L.append(b); e = Layer('eye', 40, 20, P); e.ell(27, 8, 2, 1.5, 'BW'); e.line([(26, 8), (28, 8)], 'BK'); L.append(e); return composite(L)
    if kind == 'lobster':
        P = _pal('2a4a7a', '4a6aa0', '1a2a4a', 'e05a3a'); L = []
        b = Layer('body', 52, 26, P)
        for i in range(5): b.ell(8 + i * 5, 14, 3.5, 5 - i * 0.2, 'c0' if i % 2 else 'c1')
        b.poly([(2, 14), (6, 8), (6, 20)], 'c2'); b.ell(34, 13, 8, 5, 'c1')
        b.ell(47, 6, 5, 3, 'c0'); b.ell(47, 20, 5, 3, 'c0'); b.line([(40, 11), (45, 7)], 'c0', 2); b.line([(40, 15), (45, 19)], 'c0', 2)
        b.line([(41, 12), (51, 2)], 'c2'); L.append(b)
        e = Layer('eye', 52, 26, P); e.px(40, 11, 'BK'); L.append(e); return composite(L)
    if kind == 'octopus':
        P = _pal('a04a5a', 'd07a80', 'f0b0a8', '5a1a2a'); L = []
        b = Layer('body', 44, 40, P); b.ell(22, 12, 12, 10, 'c0'); b.ell(20, 10, 6, 4, 'c1')
        for i in range(6):
            a0 = 0.4 + i * 0.45
            pts = [(22 + _m.cos(a0) * 8 + k * 2.5 * _m.cos(a0), 18 + k * 3 + 2 * _m.sin(k + i)) for k in range(7)]
            for (x, y) in pts: b.ell(x, y, 2.4 - 0.2 * pts.index((x, y)), 2.4 - 0.2 * pts.index((x, y)), 'c0')
        L.append(b); e = Layer('eye', 44, 40, P); e.ell(17, 14, 2, 2, 'c2'); e.line([(16, 14), (18, 14)], 'BK'); e.ell(27, 14, 2, 2, 'c2'); e.line([(26, 14), (28, 14)], 'BK'); L.append(e)
        return composite(L)
    if kind == 'blobfish':
        P = _pal('e0a8a8', 'f0c8c8', 'c08080', '8a4a4a'); L = []
        b = Layer('body', 36, 26, P); b.ell(20, 14, 14, 10, 'c0'); b.ell(28, 16, 6, 6, 'c1'); b.ell(30, 18, 4, 3, 'c2'); b.poly([(6, 14), (1, 8), (1, 20)], 'c2')
        b.line([(24, 22), (30, 22)], 'c3'); L.append(b)
        e = Layer('eye', 36, 26, P); e.px(24, 11, 'BK'); e.px(30, 11, 'BK'); L.append(e); return composite(L)
    if kind == 'turbot':
        P = _pal('6a5a3a', '8a7a52', '4a3a22', '3a2a14'); L = []
        b = Layer('body', 48, 30, P); b.ell(24, 15, 18, 12, 'c0'); b.ell(24, 15, 21, 14, 'c2'); b.ell(24, 15, 18, 12, 'c0')
        for (x, y) in [(16, 10), (22, 18), (30, 12), (14, 19), (34, 18)]: b.ell(x, y, 2, 1.5, 'c3')
        b.poly([(4, 15), (0, 10), (0, 20)], 'c2'); L.append(b)
        e = Layer('eye', 48, 30, P); e.ell(36, 9, 1.5, 1.5, 'BW'); e.px(36, 9, 'BK'); e.ell(40, 12, 1.5, 1.5, 'BW'); e.px(40, 12, 'BK'); L.append(e); return composite(L)
    raise ValueError(kind)


JOURNAL_ART = {
    'sprat': lambda: sprat(), 'mackerel': lambda: mackerel(), 'bass': lambda: bass(), 'grouper': lambda: grouper(),
    'goby': lambda: fishy(22, 12, '6a5a4a', 'b8a890', '4a3a2a', spots=[(-0.3, -0.2), (0.1, 0.1), (0.4, -0.1)], tall=0.38),
    'blenny': lambda: fishy(24, 14, '7a6a3a', 'c8b878', '5a4a2a', bars=4, eye=1.8, tall=0.4),
    'sandeel': lambda: longfish(34, 8, '8aa8b0', 'e0eef0', '5a7880'),
    'hermit': lambda: odd('hermit'),
    'boot': lambda: odd('boot'),
    'goldsprat': lambda: fishy(26, 12, 'e8b840', 'fff0a0', 'c08a20', stripe='fff8d0', tall=0.36),
    'wrasse': lambda: fishy(34, 16, '3a7a5a', 'e0a060', '2a5a40', spots=[(x / 4, y / 3) for x in range(-3, 3) for y in (-1, 0)], tall=0.4),
    'pollock': lambda: fishy(40, 16, '5a6a3a', 'd0d8c0', '3a4a2a', stripe='a8b890', tall=0.34),
    'bream': lambda: fishy(36, 20, '8a98a8', 'e8eef4', '5a6878', stripe=None, tall=0.42, spots=[(0.55, -0.55)]),
    'pipefish': lambda: longfish(36, 8, '7a8a4a', 'c8d098', '4a5a2a'),
    'bottle': lambda: odd('bottle'),
    'mullet': lambda: fishy(34, 16, 'd05a4a', 'f0c0a8', 'a03a2a', stripe='f0d050', tall=0.38),
    'dory': lambda: fishy(40, 28, '8a7a5a', 'c8b890', '5a4a2a', tall=0.42, spots=[(0, 0), (0.05, 0.05), (-0.05, 0.05), (0, 0.1)]),
    'garfish': lambda: longfish(52, 10, '3a7a6a', 'c8e8d8', '2a5a4a', beak=True),
    'cuttle': lambda: odd('cuttle'),
    'lobster': lambda: odd('lobster'),
    'conger': lambda: longfish(70, 16, '3a3a42', '7a7a86', '22222a', wavy=2.5),
    'monkfish': lambda: fishy(52, 30, '6a5a4a', '9a8a6a', '4a3a2a', tall=0.42, eye=1.5, lure=True, spots=[(-0.4, -0.3), (0.0, -0.4), (0.3, -0.2)]),
    'turbot': lambda: odd('turbot'),
    'octopus': lambda: odd('octopus'),
    'chest': lambda: odd('chest'),
    'moray': lambda: moray(),
    'lantern': lambda: fishy(22, 12, '2a3a5a', '4a5a7a', '1a2a3a', glow='9affe8', tall=0.36),
    'blobfish': lambda: odd('blobfish'),
    'oarfish': lambda: longfish(90, 16, 'c8d0e0', 'f0f4f8', 'e05a4a', wavy=2),
    'moonfish': lambda: fishy(48, 36, 'c8d8e8', 'f4f8fc', '9ab0c8', tall=0.44, eye=2.2, glow='ffffff'),
}


# ---------------------------------------------------------------- Castle Honkmore
KPAL = {k: hx(v) for k, v in {
    'T0': '23301c', 'T1': '3a5228', 'T2': '5a7a3a', 'T3': '8aa858', 'TS': 'c8b888',
    'AR0': '3a3e4a', 'AR1': '6a7080', 'AR2': 'a8b0bc', 'AR3': 'e0e6ee',
    'SH0': '4a1a24', 'SH1': '8a2a3a', 'SH2': 'c04a50', 'GOLD': 'e8b840', 'GOLD2': 'fff0a0',
    'SW0': 'c8ccd8', 'SW1': 'eef0f6', 'SWB': 'f6a020', 'LV0': '5a1a20', 'LV1': '9a2a30', 'LV2': 'c84a40', 'BELL': 'f2c94c', 'BELL2': 'fff4b0',
    'BK': '15111c', 'BW': 'f8f4ec', 'FR': 'ff3a3a', 'FR2': 'ffb0a0',
}.items()}


def shield_turtle(blink=False, awake=False, pose='idle'):
    """A castle guard: a turtle in a helmet behind a tall red tower shield with the swan crest.
    Poses: idle, wind (shield hoisted), bash (lunging behind the shield), flipped (shield swung behind)."""
    w, h = 44, 44
    L = []
    lean = 4 if pose == 'bash' else 0
    body = Layer('body', w, h, KPAL)
    body.ell(18 + lean, 30, 12, 10, 'T1'); body.ell(17 + lean, 27, 9, 6, 'T2')
    for (x, y) in [(13, 26), (19, 24), (24, 28), (15, 32)]: body.ell(x + lean, y, 2.5, 2, 'T3')
    body.rect(10 + lean, 38, 14 + lean, 42, 'T0'); body.rect(20 + lean, 38, 24 + lean, 42, 'T0')
    L.append(body)
    head = Layer('head', w, h, KPAL)
    hx_, hy = 26 + lean, 14
    head.ell(hx_, hy, 6, 5, 'T2'); head.ell(hx_ + 4, hy + 1, 3, 2.5, 'TS')
    head.poly([(hx_ - 7, hy - 1), (hx_, hy - 9), (hx_ + 7, hy - 1)], 'AR1'); head.rect(hx_ - 7, hy - 2, hx_ + 7, hy, 'AR2')
    head.line([(hx_, hy - 9), (hx_ - 3, hy - 13)], 'SH2', 2)
    L.append(head)
    eye = Layer('eye', w, h, KPAL)
    if blink: eye.line([(hx_ + 1, hy), (hx_ + 3, hy)], 'T0')
    else: eye.rect(hx_ + 2, hy - 1, hx_ + 3, hy, 'BK' if awake else 'FR'); eye.px(hx_ + 2, hy - 1, 'BW' if awake else 'FR2')
    L.append(eye)
    if pose != 'flipped':
        sh = Layer('shield', w, h, KPAL)
        sy = -4 if pose == 'wind' else 0
        sx = 34 + lean
        sh.poly([(sx - 5, 12 + sy), (sx + 5, 10 + sy), (sx + 6, 34 + sy), (sx, 42 + sy), (sx - 6, 34 + sy)], 'SH1')
        sh.poly([(sx - 3, 14 + sy), (sx + 3, 13 + sy), (sx + 4, 32 + sy), (sx, 38 + sy), (sx - 4, 32 + sy)], 'SH2')
        sh.line([(sx - 5, 12 + sy), (sx + 5, 10 + sy)], 'GOLD')
        sh.ell(sx, 22 + sy, 2.5, 2, 'SW1'); sh.line([(sx, 20 + sy), (sx + 1, 16 + sy)], 'SW1'); sh.px(sx + 2, 16 + sy, 'GOLD')   # the swan crest
        L.append(sh)
    else:
        sh = Layer('shield', w, h, KPAL)
        sh.poly([(4, 14), (12, 12), (12, 34), (8, 40), (3, 34)], 'SH0'); L.insert(0, sh)
    return composite(L)


def bellhop(blink=False, awake=False, pose='idle'):
    """A bellhop: a slim white swan in a red livery jacket and pillbox hat, a brass handbell.
    Poses: idle, ring (bell raised, swinging), run (leaning forward)."""
    w, h = 32, 46
    L = []
    lean = 3 if pose == 'run' else 0
    b = Layer('body', w, h, KPAL)
    b.line([(12, 38), (11, 44)], 'SWB', 2); b.line([(18, 38), (19, 44)], 'SWB', 2)
    b.ell(15 + lean, 31, 8, 8, 'SW1')
    b.poly([(8 + lean, 26), (22 + lean, 26), (21 + lean, 36), (9 + lean, 36)], 'LV1'); b.rect(14 + lean, 26, 16 + lean, 36, 'LV2')
    for y in (28, 31, 34): b.px(15 + lean, y, 'GOLD')
    L.append(b)
    n = Layer('neck', w, h, KPAL)
    for i in range(8): n.ell(16 + lean + i * 0.5 * (1 + lean / 3), 25 - i * 2, 2.5, 2.5, 'SW1')
    hx_, hy = 20 + lean * 2, 9
    n.ell(hx_, hy, 4.5, 4, 'SW1'); n.poly([(hx_ + 3, hy), (hx_ + 9, hy + 2), (hx_ + 3, hy + 3)], 'SWB')
    n.rect(hx_ - 4, hy - 8, hx_ + 2, hy - 4, 'LV1'); n.line([(hx_ - 4, hy - 4), (hx_ + 2, hy - 4)], 'GOLD')
    L.append(n)
    e = Layer('eye', w, h, KPAL)
    if blink: e.line([(hx_, hy - 1), (hx_ + 2, hy - 1)], 'SW0')
    else: e.px(hx_ + 1, hy - 1, 'BK' if awake else 'FR')
    L.append(e)
    bell = Layer('bell', w, h, KPAL)
    if pose == 'ring':
        bell.line([(10, 28), (4, 14)], 'SW1', 2); bell.poly([(0, 14), (8, 14), (6, 6), (2, 6)], 'BELL'); bell.px(3, 8, 'BELL2'); bell.ell(4, 15, 1.5, 1, 'GOLD')
    else:
        bell.line([(9, 30), (6, 34)], 'SW1', 2); bell.poly([(3, 40), (9, 40), (8, 34), (4, 34)], 'BELL')
    L.append(bell)
    return composite(L)


def pelican_chef(blink=False, awake=False, pose='idle'):
    """The Pelican Chef: a big white pelican in a tall toque and a stained apron, with a great orange pouch.
    Poses: idle, wind (a pot raised), scoop (pouch gaping, lunging), gulp (pouch bulging with a goose),
    stir (wooden spoon in both wings), dazed (toque askew)."""
    w, h = 108, 100
    P = dict(KPAL)
    P.update({k: hx(v) for k, v in {'PW0': 'c8ccd4', 'PW1': 'eef0f6', 'PB0': 'c8781a', 'PB1': 'f2a030', 'PB2': 'ffc860',
                                      'TQ0': 'd8d8e0', 'TQ1': 'ffffff', 'AP0': 'b8b0a0', 'AP1': 'e8e0d0', 'STAIN': 'a85a3a',
                                      'POT0': '8a4a2a', 'POT1': 'c8784a', 'POT2': 'f0a878', 'GO': 'f4f1e8', 'GOB': 'f08a24'}.items()})
    L = []
    lean = 8 if pose == 'scoop' else 0
    body = Layer('body', w, h, P)
    body.line([(36, 84), (34, 98)], 'PB0', 3); body.line([(52, 84), (54, 98)], 'PB0', 3)
    body.ell(44, 68, 24, 20, 'PW1'); body.ell(38, 64, 14, 10, 'PW0')
    body.poly([(22, 64), (8, 58), (12, 72)], 'PW0')                                # tail
    L.append(body)
    apron = Layer('apron', w, h, P)
    apron.poly([(34, 56), (60, 56), (64, 86), (32, 86)], 'AP1'); apron.line([(34, 56), (60, 56)], 'AP0')
    for (x, y) in [(42, 70), (54, 76), (46, 80)]: apron.ell(x, y, 2.5, 1.5, 'STAIN')
    L.append(apron)
    neck = Layer('neck', w, h, P)
    nx, ny = 58 + lean, 26
    for i in range(10): neck.ell(52 + lean * i / 10 + i * 0.6, 54 - i * 3, 5, 5, 'PW1')
    neck.ell(nx, ny, 9, 8, 'PW1')
    L.append(neck)
    bill = Layer('bill', w, h, P)
    bx = nx + 6
    if pose == 'scoop':
        bill.poly([(bx, ny - 4), (bx + 34, ny - 8), (bx + 34, ny - 4), (bx + 2, ny)], 'PB1')
        bill.poly([(bx, ny + 2), (bx + 32, ny + 18), (bx + 24, ny + 30), (bx + 4, ny + 14)], 'PB0'); bill.poly([(bx + 4, ny + 4), (bx + 28, ny + 18), (bx + 22, ny + 26), (bx + 6, ny + 12)], 'STAIN')
    elif pose == 'gulp':
        bill.poly([(bx, ny - 3), (bx + 30, ny), (bx + 30, ny + 3), (bx, ny + 3)], 'PB1')
        bill.ell(bx + 16, ny + 18, 16, 14, 'PB1'); bill.ell(bx + 14, ny + 15, 10, 8, 'PB2')
        bill.ell(bx + 18, ny + 14, 6, 5, 'GO'); bill.ell(bx + 17, ny + 13, 1, 1, 'BK'); bill.poly([(bx + 22, ny + 13), (bx + 26, ny + 14), (bx + 22, ny + 16)], 'GOB')   # Biscuit's beak poking out
    else:
        bill.poly([(bx, ny - 3), (bx + 30, ny), (bx + 30, ny + 3), (bx, ny + 3)], 'PB1')
        bill.poly([(bx, ny + 3), (bx + 30, ny + 3), (bx + 18, ny + 12), (bx + 2, ny + 9)], 'PB0')
    L.append(bill)
    hat = Layer('hat', w, h, P)
    tilt = 6 if pose == 'dazed' else 0
    hat.rect(nx - 9 + tilt, ny - 12, nx + 7 + tilt, ny - 6, 'TQ0')
    for (dx, dy, r) in [(-6, -20, 6), (0, -24, 7), (6, -19, 6), (0, -16, 6)]: hat.ell(nx + dx + tilt, ny + dy, r, r * 0.9, 'TQ1')
    L.append(hat)
    eye = Layer('eye', w, h, P)
    ex, ey = nx + 2, ny - 3
    if blink or pose == 'dazed': eye.line([(ex - 2, ey), (ex + 2, ey)], 'PW0')
    else: eye.rect(ex - 1, ey - 1, ex + 1, ey + 1, 'BK' if awake else 'FR'); eye.px(ex - 1, ey - 1, 'BW' if awake else 'FR2')
    L.append(eye)
    if pose == 'wind':
        pot = Layer('pot', w, h, P); pot.ell(30, 30, 10, 8, 'POT1'); pot.rect(20, 26, 40, 30, 'POT0'); pot.ell(28, 28, 4, 2, 'POT2'); pot.line([(26, 42), (32, 34)], 'PW1', 3); L.append(pot)
    if pose == 'stir':
        sp = Layer('spoon', w, h, P); sp.line([(30, 74), (60, 20)], 'POT0', 3); sp.ell(30, 76, 4, 3, 'POT1'); L.append(sp)
    return composite(L)


def black_swan(blink=False, awake=False, pose='idle'):
    """The Black Swan, the Queen's champion: a black swan in dark plate with a red plume and a long lance.
    Poses: idle, wind (lance lowered), charge (low, lance forward), stuck (lance jammed, rearing), stagger."""
    w, h = 112, 92
    P = dict(KPAL)
    P.update({k: hx(v) for k, v in {'BS0': '0e0c14', 'BS1': '22202c', 'BS2': '3a3846', 'PL0': '2a2e3a', 'PL1': '4a5262', 'PL2': '7a8494', 'PL3': 'b8c0cc',
                                      'PLM': 'c83a3a', 'PLM2': 'ff6a5a', 'LN0': '5a3a1a', 'LN1': '8a6a3a', 'TIP': 'd8dce4', 'BK2': 'f6a020'}.items()})
    L = []
    low = pose == 'charge'
    body = Layer('body', w, h, P)
    by = 62 if not low else 66
    body.line([(40, by + 14), (38, h - 2)], 'BK2', 3); body.line([(54, by + 14), (56, h - 2)], 'BK2', 3)
    body.ell(46, by, 24, 16, 'BS1'); body.ell(40, by - 4, 16, 8, 'BS2')
    body.poly([(24, by), (8, by - 8), (12, by + 6)], 'BS1')
    L.append(body)
    armor = Layer('armor', w, h, P)
    armor.poly([(30, by - 10), (64, by - 14), (70, by + 6), (56, by + 16), (32, by + 12)], 'PL1')
    armor.poly([(34, by - 8), (60, by - 12), (62, by - 4), (36, by - 2)], 'PL2')
    for x in (40, 50, 60): armor.line([(x, by - 10), (x + 2, by + 12)], 'PL0')
    L.append(armor)
    neck = Layer('neck', w, h, P)
    nx, ny = (72, 22) if not low else (86, 44)
    for i in range(12):
        t = i / 11
        neck.ell(58 + (nx - 58) * t, by - 10 + (ny - by + 10) * t, 5, 5, 'BS1')
    neck.ell(nx, ny, 8, 7, 'BS1')
    neck.poly([(nx + 6, ny), (nx + 16, ny + 3), (nx + 6, ny + 5)], 'PLM')
    L.append(neck)
    helm = Layer('helm', w, h, P)
    helm.ell(nx, ny - 2, 8, 6, 'PL1'); helm.rect(nx - 8, ny - 2, nx + 8, ny, 'PL2'); helm.line([(nx + 2, ny + 1), (nx + 7, ny + 1)], 'BS0')
    tilt = 4 if pose in ('stuck', 'stagger') else 0
    for i in range(5): helm.ell(nx - 6 - i * 2.5 + tilt, ny - 8 - i * 1.5 + abs(i - 2), 2.5, 2, 'PLM' if i % 2 else 'PLM2')   # the plume
    L.append(helm)
    eye = Layer('eye', w, h, P)
    if blink or pose == 'stagger': eye.line([(nx + 1, ny - 1), (nx + 4, ny - 1)], 'PL0')
    else: eye.rect(nx + 2, ny - 2, nx + 3, ny - 1, 'BK2' if awake else 'FR'); eye.px(nx + 2, ny - 2, 'BW' if awake else 'FR2')
    L.append(eye)
    lance = Layer('lance', w, h, P)
    if pose in ('wind', 'charge'):
        y0 = by - 2 if pose == 'charge' else by - 8
        lance.line([(30, y0 + 4), (w - 2, y0)], 'LN1', 3); lance.poly([(w - 14, y0 - 3), (w - 1, y0), (w - 14, y0 + 3)], 'TIP')
        lance.poly([(40, y0 - 6), (48, y0), (40, y0 + 8)], 'PL2')
    elif pose == 'stuck':
        lance.line([(40, by - 4), (w - 6, by + 18)], 'LN1', 3); lance.poly([(w - 12, by + 12), (w - 2, by + 20), (w - 14, by + 20)], 'TIP')
    else:
        lance.line([(36, by + 10), (44, 6)], 'LN1', 3); lance.poly([(41, 10), (44, 0), (47, 10)], 'TIP')
        lance.poly([(30, by), (38, by - 6), (38, by + 8)], 'PL2')
    L.append(lance)
    return composite(L)
