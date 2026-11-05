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

