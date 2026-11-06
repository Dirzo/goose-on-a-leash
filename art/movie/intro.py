"""
The opening film: Willowmere Pond seen side-on, at 640 wide. The camera pans from the night sky down
past Rocco fishing off the end of the dock, through the surface to the Moon Koi circling the bait, and
on into the depths where the Blood Shark is waiting for the moon to turn.

Writes src/assets/movie/*.png:
  sky.png    640x420  night sky, stars, the big pale moon
  far.png    640x420  distant hills and treeline (transparent)
  near.png   640x420  the willow, the bank, the dock over the water (transparent)
  water.png  640x900  under the surface: murk, moon shafts, the pond bed, dock posts (transparent above y 352)
  weeds.png  640x900  foreground waterweed silhouettes (transparent), swayed in game
  m_rocco.png  4 frames of 96x96: Rocco sitting on the dock end, rod out over the water (side view, moonlit rim)
  m_koi.png    6 frames of 48x26: the Moon Koi swimming, side view
  m_shark.png  2 frames of 360x140: the Blood Shark, a vast dark shape (its eye is drawn glowing in game)
and movie.json (frame sizes, key points).

Run: python3 art/movie/intro.py
"""
import json
import math
import os
import random

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, '..', '..', 'src', 'assets', 'movie')
W, SKY_H, WATER_H, SURF = 640, 420, 900, 352
MOON = (196, 112, 44)        # x, y, r

def hx(s): s = s.lstrip('#'); return tuple(int(s[i:i + 2], 16) for i in (0, 2, 4))
P = {k: hx(v) for k, v in {
    'sky0': '07060f', 'sky1': '111532', 'sky2': '1c2a4a', 'sky3': '2c4560', 'haze': '4a6478',
    'moon0': 'd8dcd0', 'moon1': 'f4f2e6', 'moon2': 'b8bcb4', 'star': 'e8ecf4',
    'hill0': '0c1220', 'hill1': '121a2c', 'tree0': '080c14', 'tree1': '0e1624', 'rim': '8aa4c4', 'rim2': 'c8d8ec',
    'plank0': '1a1410', 'plank1': '2a2018', 'plank2': '46382a', 'post': '140f0c',
    'w0': '1e5262', 'w1': '15394a', 'w2': '0c2232', 'w3': '060e18', 'surf': '9ad0e0', 'surf2': '4a8aa0',
    'bed0': '0a0f12', 'bed1': '121a1c', 'rock0': '161e22', 'rock1': '222c30', 'weed0': '0a1a14', 'weed1': '12281c',
    'koiw': 'fffaf2', 'koiw2': 'e8e0d4', 'koig': 'f4c040', 'koif': 'ffbcc4', 'koie': '15111c', 'koir': 'e86a4a',
    'shk0': '05070a', 'shk1': '0a0e14', 'shk2': '141a22', 'scar': '2a1418',
}.items()}
rng = random.Random(11)


def grad(h, stops):
    """Vertical gradient: stops = [(y, rgb), ...]."""
    ys = np.arange(h, dtype=np.float32)
    out = np.zeros((h, 3), np.float32)
    for c in range(3):
        out[:, c] = np.interp(ys, [s[0] for s in stops], [s[1][c] for s in stops])
    return out


def rgba(a):
    return Image.fromarray(np.clip(a, 0, 255).astype(np.uint8), 'RGBA')


def dither_quant(img, step=6):
    """Light ordered dither so gradients stay pixel-art."""
    b = (np.array([[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]]) / 16.0 - 0.5) * step
    H, Wd = img.shape[:2]
    bb = np.tile(b, (H // 4 + 1, Wd // 4 + 1))[:H, :Wd]
    img[..., :3] = np.round((img[..., :3] + bb[..., None]) / step) * step
    return img


# ------------------------------------------------------------------ sky
def sky():
    a = np.zeros((SKY_H, W, 4), np.float32)
    g = grad(SKY_H, [(0, P['sky0']), (150, P['sky1']), (290, P['sky2']), (360, P['sky3']), (420, P['haze'])])
    a[..., :3] = g[:, None, :]; a[..., 3] = 255
    yy, xx = np.mgrid[0:SKY_H, 0:W].astype(np.float32)
    mx, my, mr = MOON
    d = np.hypot(xx - mx, yy - my)
    halo = np.clip(1 - (d - mr) / 150, 0, 1) ** 2.2 * 0.45
    a[..., :3] += halo[..., None] * np.array([150, 160, 170])
    # thin cloud bands drifting across the lower sky
    for (cy, th, k) in [(250, 10, 0.18), (276, 6, 0.12), (196, 5, 0.08)]:
        band = np.exp(-((yy - cy - 6 * np.sin(xx * 0.013)) / th) ** 2) * (0.6 + 0.4 * np.sin(xx * 0.031 + cy))
        a[..., :3] = a[..., :3] * (1 - band[..., None] * k) + np.array(P['haze']) * band[..., None] * k * 1.6
    a = dither_quant(a)
    im = rgba(a); dr = ImageDraw.Draw(im)
    for _ in range(170):
        x, y = rng.randrange(W), rng.randrange(0, 300)
        if math.hypot(x - mx, y - my) < mr + 18: continue
        c = P['star'] if rng.random() < 0.3 else tuple(int(v * 0.6) for v in P['star'])
        dr.point((x, y), fill=c + (255,))
        if rng.random() < 0.06: dr.point((x + 1, y), fill=c + (160,)); dr.point((x - 1, y), fill=c + (160,)); dr.point((x, y + 1), fill=c + (160,)); dr.point((x, y - 1), fill=c + (160,))
    # the moon: pale, huge, a few soft maria
    dr.ellipse([mx - mr, my - mr, mx + mr, my + mr], fill=P['moon0'] + (255,))
    dr.ellipse([mx - mr + 3, my - mr + 2, mx + mr - 8, my + mr - 10], fill=P['moon1'] + (255,))
    for (ox, oy, r) in [(-14, -8, 10), (10, 6, 13), (-4, 18, 7), (16, -16, 6), (-22, 12, 5)]:
        dr.ellipse([mx + ox - r, my + oy - r, mx + ox + r, my + oy + r], fill=P['moon2'] + (255,))
    return im


def far():
    im = Image.new('RGBA', (W, SKY_H), (0, 0, 0, 0)); dr = ImageDraw.Draw(im)
    pts = [(0, 330)] + [(x, 318 + 10 * math.sin(x * 0.011) + 6 * math.sin(x * 0.037)) for x in range(0, W + 1, 8)] + [(W, SKY_H), (0, SKY_H)]
    dr.polygon(pts, fill=P['hill0'] + (255,))
    for x in range(0, W, 7):                                     # treeline tufts
        h = 10 + rng.random() * 16 + 6 * math.sin(x * 0.05)
        base = 330 + 6 * math.sin(x * 0.011)
        dr.ellipse([x - 6, base - h, x + 8, base + 4], fill=P['hill1'] + (255,))
    return im


def near():
    im = Image.new('RGBA', (W, SKY_H), (0, 0, 0, 0)); dr = ImageDraw.Draw(im)
    # the near bank on the right, under the dock's foot
    dr.polygon([(520, 340), (560, 330), (640, 326), (640, 356), (510, 356)], fill=P['tree0'] + (255,))
    # reeds on the bank
    for i in range(40):
        x = 506 + rng.random() * 134; h = 18 + rng.random() * 34; lean = (rng.random() - 0.5) * 8
        dr.line([(x, 352), (x + lean, 352 - h)], fill=P['tree1'] + (255,), width=2)
        if rng.random() < 0.25: dr.ellipse([x + lean - 2, 352 - h - 9, x + lean + 2, 352 - h + 1], fill=P['tree0'] + (255,))
    # Rocco's geese, asleep on the bank: heads tucked under wings
    for (gx, gy, s_) in [(566, 330, 1.0), (596, 328, 0.9), (622, 329, 1.05)]:
        dr.ellipse([gx - 11 * s_, gy - 9 * s_, gx + 11 * s_, gy + 3 * s_], fill=P['tree1'] + (255,))
        dr.ellipse([gx - 13 * s_, gy - 6 * s_, gx - 3 * s_, gy + 1 * s_], fill=P['tree1'] + (255,))
        dr.polygon([(gx + 9 * s_, gy - 5 * s_), (gx + 15 * s_, gy - 9 * s_), (gx + 12 * s_, gy - 2 * s_)], fill=P['tree1'] + (255,))
    # the willow on the left bank, fronds hanging to the water
    dr.polygon([(0, 352), (0, 300), (30, 296), (60, 330), (70, 352)], fill=P['tree0'] + (255,))
    dr.rectangle([12, 170, 34, 352], fill=P['tree0'] + (255,))
    for (cx, cy, r) in [(24, 150, 46), (60, 168, 40), (-6, 176, 36), (40, 120, 36), (86, 196, 30)]:
        dr.ellipse([cx - r, cy - r * 0.8, cx + r, cy + r * 0.8], fill=P['tree0'] + (255,))
    for i in range(60):
        x0 = rng.random() * 120 - 10; y0 = 140 + rng.random() * 70; l = 80 + rng.random() * 130
        dr.line([(x0, y0), (x0 + 6 * math.sin(i), min(350, y0 + l))], fill=P['tree1'] + (255,), width=1)
    # the dock: from the right bank out over the water, planks seen edge-on, posts into the water
    y0 = 334
    dr.rectangle([300, y0, 640, y0 + 8], fill=P['plank1'] + (255,))
    dr.rectangle([300, y0, 640, y0 + 1], fill=P['plank2'] + (255,))
    for x in range(300, 640, 14): dr.line([(x, y0 + 2), (x, y0 + 8)], fill=P['plank0'] + (255,))
    for x in (306, 380, 460, 540):
        dr.rectangle([x, y0 + 8, x + 6, SKY_H], fill=P['post'] + (255,))
    # moonlit rim along the top of the planks and the willow (moon is up and to the left)
    a = np.array(im).astype(np.float32)
    al = a[..., 3] > 0
    up = np.zeros_like(al); up[1:] = al[:-1]
    left = np.zeros_like(al); left[:, 1:] = al[:, :-1]
    rim = al & (~up | ~left)
    a[rim, :3] = a[rim, :3] * 0.4 + np.array(P['rim']) * 0.6
    return rgba(a)


def water():
    a = np.zeros((WATER_H, W, 4), np.float32)
    g = grad(WATER_H, [(SURF, P['w0']), (480, P['w1']), (640, P['w2']), (820, P['w3']), (900, P['w3'])])
    a[..., :3] = g[:, None, :]; a[SURF:, :, 3] = 255
    yy, xx = np.mgrid[0:WATER_H, 0:W].astype(np.float32)
    # moon shafts slanting down from the surface
    for (x0, w, k) in [(150, 40, 0.22), (230, 26, 0.16), (330, 18, 0.1), (110, 16, 0.12)]:
        u = (xx - (x0 + (yy - SURF) * 0.35)) / w
        shaft = np.exp(-u * u) * np.clip(1 - (yy - SURF) / 420, 0, 1) * (yy >= SURF)
        a[..., :3] += shaft[..., None] * np.array([120, 170, 180]) * k * 1.8
    # surface band
    a[SURF:SURF + 2, :, :3] = P['surf']; a[SURF + 2:SURF + 4, :, :3] = P['surf2']
    # the pond bed: rolling silt and rocks at the bottom
    bed = 830 + 18 * np.sin(xx[0] * 0.012) + 9 * np.sin(xx[0] * 0.041)
    m = yy > bed[None, :]
    a[m, :3] = np.array(P['bed0'], np.float32)
    a = dither_quant(a, 5)
    im = rgba(a); dr = ImageDraw.Draw(im)
    for _ in range(26):
        x = rng.randrange(W); y = int(830 + 18 * math.sin(x * 0.012)) - rng.randrange(4, 14); r = rng.randrange(5, 16)
        dr.ellipse([x - r, y - r * 0.6, x + r, y + r * 0.6], fill=P['rock0'] + (255,))
        dr.ellipse([x - r * 0.6, y - r * 0.6, x + r * 0.4, y - r * 0.1], fill=P['rock1'] + (255,))
    # the bank slopes down under the water on the right
    dr.polygon([(510, SURF + 4), (640, SURF + 4), (640, 700), (600, 640), (560, 520), (530, 420)], fill=P['bed1'] + (255,))
    for _ in range(18):
        x = rng.randrange(540, 640); y = rng.randrange(SURF + 20, 680)
        if x > 560 + (y - SURF) * 0.2: dr.ellipse([x - 5, y - 3, x + 5, y + 3], fill=P['rock0'] + (255,))
    # a sunken log on the bed
    dr.rounded_rectangle([60, 800, 250, 822], radius=10, fill=P['rock0'] + (255,))
    dr.ellipse([240, 798, 262, 824], fill=P['rock1'] + (255,))
    # dock posts continue down into the murk
    for x in (306, 380, 460, 540):
        for y in range(SURF, 560):
            k = 1 - (y - SURF) / 210
            dr.line([(x, y), (x + 6, y)], fill=tuple(int(c * (0.4 + 0.6 * k)) for c in P['post']) + (255,))
    # silt motes
    for _ in range(300):
        x, y = rng.randrange(W), rng.randrange(SURF + 6, 820)
        c = 60 + int(40 * (1 - (y - SURF) / 500))
        dr.point((x, y), fill=(c, c + 20, c + 24, 120))
    return im


def weeds():
    im = Image.new('RGBA', (W, WATER_H), (0, 0, 0, 0)); dr = ImageDraw.Draw(im)
    for i in range(34):
        x = rng.random() * W; base = 830 + 18 * math.sin(x * 0.012); h = 60 + rng.random() * 200
        if 260 < x < 420 and rng.random() < 0.7: h *= 0.4        # keep the middle clear for the shark
        pts = [(x + 8 * math.sin(k * 0.5 + i), base - k * h / 12) for k in range(13)]
        dr.line(pts, fill=(P['weed1'] if i % 3 else P['weed0']) + (255,), width=3 if i % 2 else 2)
        for k in range(2, 12, 2):
            px, py = pts[k]; dr.ellipse([px - 5, py - 2, px + 1, py + 2], fill=P['weed0'] + (255,))
    for i in range(14):                                           # lily stems from the surface
        x = rng.random() * 280
        dr.line([(x, SURF + 2), (x + 4 * math.sin(i), SURF + 70 + rng.random() * 60)], fill=P['weed1'] + (200,), width=1)
    return im


# ------------------------------------------------------------------ sprites
def rocco(frame):
    """Side view, sitting on the dock end facing left (out over the water), rod angled up. Moonlit from upper left."""
    im = Image.new('RGBA', (96, 96), (0, 0, 0, 0)); dr = ImageDraw.Draw(im)
    b = 1 if frame == 1 else 0
    tw = -3 if frame == 2 else 0                                   # the rod twitches on a nibble
    D, D2 = (22, 20, 34), (34, 32, 48)
    # tail curling behind him on the planks
    for i in range(6): dr.ellipse([66 + i * 3, 70 - i * 2, 74 + i * 3, 78 - i * 2], fill=(D if i % 2 else D2) + (255,))
    # backpack (empty: flap open)
    dr.rounded_rectangle([54, 44 + b, 70, 66 + b], radius=3, fill=(40, 36, 30, 255))
    dr.line([(54, 44 + b), (66, 40 + b)], fill=(58, 46, 34, 255), width=2)
    # body sitting, legs dangling over the edge
    dr.ellipse([38, 42 + b, 64, 72], fill=D + (255,))
    dr.rectangle([32, 66, 46, 74], fill=D + (255,))                 # thighs
    dr.rectangle([30, 72, 36, 90], fill=D + (255,))                 # shins over the edge
    dr.ellipse([26, 86, 38, 92], fill=(30, 22, 16, 255))            # boots
    # head with the hat, snout pointing left
    dr.ellipse([34, 22 + b, 56, 44 + b], fill=D + (255,))
    dr.polygon([(36, 32 + b), (24, 36 + b), (36, 40 + b)], fill=D + (255,))
    dr.point((25, 36 + b), fill=(10, 8, 14, 255))
    dr.polygon([(48, 22 + b), (52, 14 + b), (55, 24 + b)], fill=D + (255,))   # ear
    dr.rectangle([30, 22 + b, 60, 25 + b], fill=(28, 34, 20, 255))            # hat brim
    dr.rounded_rectangle([36, 12 + b, 54, 24 + b], radius=3, fill=(32, 40, 24, 255))
    dr.rectangle([36, 20 + b, 54, 22 + b], fill=(46, 32, 20, 255))            # band
    # eye catching the moon, goggles glint
    dr.point((38, 31 + b), fill=(240, 240, 255, 255))
    # arms and the rod, angled up and out to the left
    dr.line([(48, 52 + b), (34, 56 + b)], fill=D2 + (255,), width=4)
    tip = (4, 6 + tw)
    dr.line([(40, 60 + b), tip], fill=(70, 48, 26, 255), width=2)
    dr.line([(40, 60 + b), (30, 46 + b)], fill=(110, 76, 40, 255), width=2)
    dr.ellipse([36, 56 + b, 42, 62 + b], fill=(150, 150, 160, 255))           # reel
    a = np.array(im).astype(np.float32)
    al = a[..., 3] > 0
    up = np.zeros_like(al); up[1:] = al[:-1]
    lf = np.zeros_like(al); lf[:, 1:] = al[:, :-1]
    rim = al & (~up | ~lf)
    a[rim, :3] = a[rim, :3] * 0.3 + np.array(P['rim2']) * 0.7
    return rgba(a), tip


def koi(frame):
    im = Image.new('RGBA', (48, 26), (0, 0, 0, 0)); dr = ImageDraw.Draw(im)
    t = frame / 6 * math.tau
    sw = math.sin(t) * 3
    # tail (right), fanning
    dr.polygon([(36, 13), (46, 5 + sw), (44, 13), (46, 21 + sw)], fill=P['koif'] + (255,))
    # body facing left
    dr.ellipse([6, 6, 40, 20], fill=P['koiw'] + (255,))
    dr.ellipse([10, 13, 36, 20], fill=P['koiw2'] + (255,))
    for (x, y, r) in [(20, 9, 4), (29, 11, 3)]: dr.ellipse([x - r, y - r * 0.7, x + r, y + r * 0.7], fill=P['koir'] + (255,))
    dr.polygon([(14, 6), (22, 1), (28, 6)], fill=P['koig'] + (255,))          # gold crest fin
    dr.polygon([(18, 18), (22, 24 + sw * 0.5), (26, 18)], fill=P['koif'] + (255,))
    dr.point((11, 11), fill=P['koie'] + (255,)); dr.point((11, 10), fill=(255, 255, 255, 255))
    dr.line([(6, 14), (3, 16)], fill=P['koig'] + (255,))                      # whisker
    return im


def shark(frame):
    w, h = 360, 140
    im = Image.new('RGBA', (w, h), (0, 0, 0, 0)); dr = ImageDraw.Draw(im)
    sw = 6 if frame else -6
    body = [(10, 74), (60, 50), (150, 38), (240, 44), (300, 62), (330, 70 + sw * 0.3), (300, 84), (240, 96), (150, 100), (60, 92)]
    dr.polygon(body, fill=P['shk1'] + (255,))
    dr.polygon([(140, 40), (180, 0), (200, 42)], fill=P['shk1'] + (255,))     # dorsal fin
    dr.polygon([(300, 66), (356, 28 + sw), (340, 70), (356, 118 + sw), (300, 82)], fill=P['shk1'] + (255,))   # tail
    dr.polygon([(110, 92), (150, 132), (160, 96)], fill=P['shk0'] + (255,))   # pectoral fin
    dr.polygon([(14, 76), (60, 82), (110, 80), (60, 92)], fill=P['shk0'] + (255,))   # jaw shadow
    for x in range(30, 80, 7): dr.polygon([(x, 78), (x + 3, 84), (x + 6, 78)], fill=(70, 60, 60, 255))   # teeth, barely
    for k in range(4): dr.line([(86 + k * 8, 58), (82 + k * 8, 74)], fill=P['scar'] + (255,), width=2)   # gills, faint red
    dr.line([(150, 52), (230, 60)], fill=P['shk2'] + (255,), width=1)          # an old scar along the flank
    return im


def main():
    os.makedirs(OUT, exist_ok=True)
    sky().save(os.path.join(OUT, 'sky.png'))
    far().save(os.path.join(OUT, 'far.png'))
    near().save(os.path.join(OUT, 'near.png'))
    water().save(os.path.join(OUT, 'water.png'))
    weeds().save(os.path.join(OUT, 'weeds.png'))
    rf = [rocco(i) for i in range(4)]
    strip = Image.new('RGBA', (96 * 4, 96)); [strip.paste(f, (i * 96, 0)) for i, (f, _) in enumerate(rf)]
    strip.save(os.path.join(OUT, 'm_rocco.png'))
    ks = Image.new('RGBA', (48 * 6, 26)); [ks.paste(koi(i), (i * 48, 0)) for i in range(6)]
    ks.save(os.path.join(OUT, 'm_koi.png'))
    ss = Image.new('RGBA', (360 * 2, 140)); [ss.paste(shark(i), (i * 360, 0)) for i in range(2)]
    ss.save(os.path.join(OUT, 'm_shark.png'))
    meta = {'surface': SURF, 'dockY': 334, 'moon': MOON, 'rocco': {'w': 96, 'h': 96, 'frames': 4, 'at': [380, 252], 'rodTip': list(rf[0][1])},
            'koi': {'w': 48, 'h': 26, 'frames': 6}, 'shark': {'w': 360, 'h': 140, 'frames': 2, 'eye': [44, 62]}}
    json.dump(meta, open(os.path.join(OUT, 'movie.json'), 'w'), indent=1)
    # a contact sheet to look at
    sheet = Image.new('RGBA', (W, WATER_H), (0, 0, 0, 255))
    sheet.alpha_composite(sky(), (0, 0)); sheet.alpha_composite(far(), (0, 0)); sheet.alpha_composite(water(), (0, 0))
    sheet.alpha_composite(near(), (0, 0)); sheet.alpha_composite(rf[0][0], tuple(meta['rocco']['at']))
    sheet.alpha_composite(koi(0), (200, 460)); sheet.alpha_composite(shark(0), (180, 650)); sheet.alpha_composite(weeds(), (0, 0))
    sheet.save(os.path.join(HERE, 'contact.png'))
    print('ok')


if __name__ == '__main__':
    main()
