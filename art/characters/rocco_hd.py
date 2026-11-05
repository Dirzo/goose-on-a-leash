"""
Rocco at the fine resolution (640x360 native). Built from shapes, then pixel-cleaned:
  * silhouette outline in near-black, internal edges in a darker tone of each part ("sel-out"),
    which reads finer and softer than a black line everywhere;
  * a small backpack strapped on his back (straps across his chest), the Moon Koi peeking out;
  * animated: idle bob, koi bob and fin flap, water dripping from the leak and splashing out the top.

Run: python3 art/characters/rocco_hd.py OUT_DIR   (writes rocco-hd.gif and rocco-hd-sheet.png)
"""
import math
import os
import sys

from PIL import Image, ImageDraw

FW, FH = 76, 80          # frame size in native pixels
FRAMES = 8

def hx(s):
    s = s.lstrip('#'); return tuple(int(s[i:i + 2], 16) for i in (0, 2, 4))

C = {k: hx(v) for k, v in {
    'out': '1a1522',
    'fur1': '6f6a7a', 'fur2': '9a95a6', 'fur3': 'c4c0cc', 'furw': 'f2eff4', 'mask': '2c2836', 'mask2': '3d3848',
    'ear': 'e8a0ac', 'eyew': 'ffffff', 'pupil': '15111c', 'shine': 'ffffff', 'nose': '1d1824', 'cheek': 'f2a7b0', 'mouth': '5a3a44',
    'hat0': '45552a', 'hat1': '667a38', 'hat2': '88a04c', 'band': '6e4626',
    'vest0': '7a5a32', 'vest1': 'a37c48', 'vest2': 'c9a46a', 'shirt': 'd8d2c2',
    'pant0': '303c4c', 'pant1': '44566c', 'boot0': '3e2616', 'boot1': '5e3c22',
    'strap0': '4a2e1a', 'strap1': '6e4628', 'buckle': 'e6c060',
    'pack0': '4e4630', 'pack1': '6e6440', 'pack2': '958758', 'pack3': 'b8a874', 'flap0': '5a3a22', 'flap1': '7e5432',
    'patch0': '8a2e34', 'patch1': 'b8444a', 'stitch': 'eadfb6',
    'koiw': 'fffaf2', 'koiw2': 'e8e0d4', 'koig': 'f4c040', 'koif': 'ffbcc4', 'koie': '15111c',
    'water0': '3c9ab8', 'water1': '62bcd6', 'water2': 'b6ecfa',
    'rod': '8a5a2a', 'rod2': 'b47c40', 'line': 'd8ecf4',
}.items()}

class Layer:
    """One body part drawn on its own canvas; parts are composited in order with sel-out edges."""
    def __init__(self, name):
        self.name = name
        self.im = Image.new('RGBA', (FW, FH), (0, 0, 0, 0))
        self.d = ImageDraw.Draw(self.im)
    def ell(self, cx, cy, rx, ry, c): self.d.ellipse([cx - rx, cy - ry, cx + rx, cy + ry], fill=C[c] + (255,))
    def poly(self, pts, c): self.d.polygon(pts, fill=C[c] + (255,))
    def rect(self, x0, y0, x1, y1, c): self.d.rectangle([x0, y0, x1, y1], fill=C[c] + (255,))
    def px(self, x, y, c):
        if 0 <= x < FW and 0 <= y < FH: self.im.putpixel((x, y), C[c] + (255,))
    def line(self, pts, c, w=1): self.d.line(pts, fill=C[c] + (255,), width=w)

def darker(rgb, k=0.68):
    return tuple(int(v * k) for v in rgb)

def composite(layers, outline_skip=()):
    """Stack layers; darken a part's pixels where it meets a part behind it (internal edge);
    then draw the outer silhouette outline."""
    out = Image.new('RGBA', (FW, FH), (0, 0, 0, 0))
    owner = [[-1] * FW for _ in range(FH)]
    for li, L in enumerate(layers):
        src = L.im.load(); dst = out.load()
        for y in range(FH):
            for x in range(FW):
                if src[x, y][3]:
                    dst[x, y] = src[x, y]; owner[y][x] = li
    dst = out.load()
    # internal edges: a pixel whose neighbour belongs to a part further back gets a darker tone
    edge = []
    for y in range(FH):
        for x in range(FW):
            o = owner[y][x]
            if o < 0 or layers[o].name in outline_skip: continue
            for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                nx, ny = x + dx, y + dy
                if 0 <= nx < FW and 0 <= ny < FH and 0 <= owner[ny][nx] < o and layers[owner[ny][nx]].name not in ('fx',):
                    edge.append((x, y)); break
    for (x, y) in edge:
        r, g, b, a = dst[x, y]; dst[x, y] = darker((r, g, b)) + (a,)
    # outer silhouette
    sil = []
    for y in range(FH):
        for x in range(FW):
            if owner[y][x] >= 0: continue
            for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                nx, ny = x + dx, y + dy
                if 0 <= nx < FW and 0 <= ny < FH and owner[ny][nx] >= 0 and layers[owner[ny][nx]].name not in outline_skip:
                    sil.append((x, y)); break
    for (x, y) in sil: dst[x, y] = C['out'] + (255,)
    return out

def build(frame, leak=True, water_level=0.8):
    t = frame / FRAMES * math.tau
    bob = 1 if math.sin(t) > 0.3 else 0                  # 1 px idle bob
    kb = 1 if math.sin(t + 1.6) > 0 else 0               # koi bobs a little behind him
    flap = frame % 2
    ox, oy = 8, 2 + bob                                  # character origin inside the frame
    L = []

    # --- tail (behind everything), striped and curling up
    tail = Layer('tail')
    for i in range(7):
        a = 0.5 + i * 0.26
        cx = ox + 14 - math.cos(a) * (6 + i * 1.6); cy = oy + 58 - math.sin(a) * (4 + i * 1.8)
        tail.ell(cx, cy, 3.6, 3.2, 'mask' if (i // 2) % 2 else 'fur2')
    L.append(tail)

    # --- backpack on his back: small, mostly hidden behind the body; only its edge and top show
    pack = Layer('pack')
    px0, py0 = ox + 10, oy + 36
    pw, ph = 13, 17
    pack.poly([(px0 + 2, py0), (px0 + pw - 2, py0), (px0 + pw, py0 + 2), (px0 + pw, py0 + ph - 2), (px0 + pw - 2, py0 + ph),
               (px0 + 2, py0 + ph), (px0, py0 + ph - 2), (px0, py0 + 2)], 'pack1')
    pack.rect(px0 + 1, py0 + 2, px0 + 3, py0 + ph - 2, 'pack3')            # lit side
    pack.rect(px0 + 4, py0 + 2, px0 + 7, py0 + ph - 2, 'pack2')
    pack.rect(px0 + 1, py0 + 1, px0 + pw - 1, py0 + 2, 'pack3')            # rolled rim
    pack.poly([(px0 + 1, py0 + 3), (px0 + 9, py0 + 3), (px0 + 9, py0 + 8), (px0 + 5, py0 + 10), (px0 + 1, py0 + 8)], 'flap1')
    pack.rect(px0 + 1, py0 + 3, px0 + 2, py0 + 8, 'flap0')
    for y in range(py0 + 4, py0 + 8, 2): pack.px(px0 + 2, y, 'stitch')
    pack.rect(px0 + 4, py0 + 8, px0 + 5, py0 + 10, 'buckle')
    pack.rect(px0 + 2, py0 + 11, px0 + 6, py0 + 14, 'patch1')               # sewn patch
    for (x, y) in [(px0 + 2, py0 + 11), (px0 + 6, py0 + 11), (px0 + 2, py0 + 14), (px0 + 6, py0 + 14)]: pack.px(x, y, 'stitch')
    hole = (px0 + 2, py0 + ph - 1)
    pack.px(*hole, 'out'); pack.px(hole[0] + 1, hole[1], 'out')
    L.append(pack)

    # --- Moon Koi peeking out of the pack's top, behind his left shoulder
    koi = Layer('koi')
    kx, ky = px0 + 3, py0 - 5 + kb
    koi.ell(kx, ky, 5.5, 5, 'koiw')
    koi.ell(kx + 1, ky + 2, 4, 2.5, 'koiw2')                                # belly shade
    koi.ell(kx, ky - 5, 2, 1.2, 'koig')                                    # gold crest
    for ex in (kx - 3, kx + 1):                                            # glossy eyes
        koi.rect(ex, ky - 2, ex + 1, ky + 0, 'koie'); koi.px(ex, ky - 2, 'shine')
    koi.px(kx - 4, ky + 1, 'koif'); koi.px(kx + 3, ky + 1, 'koif')          # blush
    koi.px(kx - 1, ky + 2, 'koif'); koi.px(kx, ky + 2, 'mouth')             # pouty lips
    fy = ky + (0 if flap else 2)
    koi.poly([(kx - 5, ky + 2), (kx - 9, fy - 1), (kx - 8, fy + 2)], 'koif')     # flapping fins
    koi.poly([(kx + 5, ky + 2), (kx + 8, fy - 2), (kx + 8, fy + 1)], 'koif')
    L.append(koi)

    # --- back arm and legs
    barm = Layer('backarm')
    barm.ell(ox + 22, oy + 47, 3, 6, 'fur1')
    L.append(barm)
    legs = Layer('legs')
    legs.rect(ox + 23, oy + 55, ox + 30, oy + 62, 'pant1'); legs.rect(ox + 33, oy + 55, ox + 40, oy + 62, 'pant0')
    legs.ell(ox + 26, oy + 65, 5, 3, 'boot1'); legs.ell(ox + 38, oy + 65, 5, 3, 'boot0')
    L.append(legs)

    # --- torso: shirt + fishing vest with pockets
    body = Layer('body')
    body.poly([(ox + 23, oy + 40), (ox + 41, oy + 40), (ox + 44, oy + 47), (ox + 43, oy + 56), (ox + 22, oy + 56), (ox + 20, oy + 47)], 'vest1')
    body.poly([(ox + 30, oy + 40), (ox + 35, oy + 40), (ox + 34, oy + 56), (ox + 31, oy + 56)], 'shirt')
    body.rect(ox + 23, oy + 47, ox + 28, oy + 51, 'vest2'); body.rect(ox + 37, oy + 47, ox + 42, oy + 51, 'vest0')
    body.line([(ox + 23, oy + 47), (ox + 28, oy + 47)], 'vest0'); body.line([(ox + 37, oy + 47), (ox + 42, oy + 47)], 'vest0')
    L.append(body)

    # --- shoulder straps: one over each shoulder, buckled at the chest
    strap = Layer('strap')
    strap.line([(ox + 24, oy + 40), (ox + 28, oy + 55)], 'strap1', 2)
    strap.line([(ox + 39, oy + 40), (ox + 37, oy + 55)], 'strap0', 2)
    strap.line([(ox + 28, oy + 49), (ox + 37, oy + 49)], 'strap0', 1)      # chest strap
    strap.rect(ox + 31, oy + 48, ox + 33, oy + 50, 'buckle')
    L.append(strap)

    # --- head: chibi, 3/4 view facing right
    head = Layer('head')
    head.ell(ox + 33, oy + 26, 17, 14, 'fur2')
    head.ell(ox + 35, oy + 30, 14, 9, 'fur3')
    # bandit mask with a lighter bridge, white brows above
    head.ell(ox + 25, oy + 25, 8, 5, 'mask'); head.ell(ox + 42, oy + 25, 8, 5, 'mask')
    head.rect(ox + 25, oy + 22, ox + 42, oy + 28, 'mask')
    head.rect(ox + 32, oy + 22, ox + 35, oy + 25, 'mask2')
    head.ell(ox + 25, oy + 19, 5, 1.5, 'furw'); head.ell(ox + 42, oy + 19, 5, 1.5, 'furw')
    # muzzle, nose, cheeks, smile
    head.ell(ox + 38, oy + 33, 9, 5, 'furw')
    head.ell(ox + 46, oy + 30, 2.5, 2, 'nose')
    head.ell(ox + 22, oy + 32, 2.5, 1.5, 'cheek'); head.ell(ox + 47, oy + 34, 2, 1.5, 'cheek')
    head.line([(ox + 38, oy + 35), (ox + 40, oy + 36), (ox + 42, oy + 35)], 'mouth')
    # big eyes with shines
    for ex in (ox + 25, ox + 41):
        head.ell(ex, oy + 25, 4, 4, 'eyew')
        head.ell(ex + 1, oy + 26, 2.5, 3, 'pupil')
        head.px(ex, oy + 24, 'shine'); head.px(ex + 2, oy + 28, 'shine')
    L.append(head)

    # --- ears through holes in the bucket hat, then the hat
    hat = Layer('hat')
    for exx in (ox + 21, ox + 44):
        hat.poly([(exx - 4, oy + 10), (exx, oy + 2), (exx + 4, oy + 10)], 'fur2')
        hat.poly([(exx - 2, oy + 9), (exx, oy + 5), (exx + 2, oy + 9)], 'ear')
    hat.poly([(ox + 19, oy + 16), (ox + 21, oy + 8), (ox + 45, oy + 8), (ox + 48, oy + 16)], 'hat1')
    hat.rect(ox + 21, oy + 8, ox + 27, oy + 15, 'hat2')
    hat.rect(ox + 19, oy + 13, ox + 48, oy + 15, 'band')
    hat.ell(ox + 35, oy + 17, 23, 3.5, 'hat0')                               # brim, wider toward the front
    hat.ell(ox + 33, oy + 16, 20, 2.5, 'hat1')
    L.append(hat)

    # --- front arm holding the rod
    farm = Layer('frontarm')
    farm.ell(ox + 45, oy + 46, 3.5, 5, 'fur2')
    farm.ell(ox + 49, oy + 48, 3, 3, 'fur1')                                 # paw
    L.append(farm)
    rod = Layer('rod')
    rod.line([(ox + 48, oy + 52), (ox + 64, oy + 18)], 'rod', 2)
    rod.line([(ox + 49, oy + 51), (ox + 64, oy + 19)], 'rod2', 1)
    rod.ell(ox + 48, oy + 50, 2, 2, 'strap0')                                # reel
    L.append(rod)

    # --- water effects (no outline): drips from the leak, splashes from the top
    fx = Layer('fx')
    if leak:
        for k in range(3):
            phase = (frame + k * 3) % FRAMES
            dy = phase * 2 + (phase * phase) // 4                          # accelerating fall
            y = hole[1] + 1 + dy
            if y < oy + 70:
                fx.px(hole[0], y, 'water1'); fx.px(hole[0], y + 1, 'water0')
            else:
                # splash on the ground
                fx.px(hole[0] - 1, oy + 68, 'water1'); fx.px(hole[0] + 1, oy + 68, 'water1'); fx.px(hole[0], oy + 69, 'water0')
        fx.ell(hole[0], oy + 69, 3, 1, 'water0')                             # little puddle
    if water_level > 0.6 and bob == 0 and frame % 4 == 0:
        for (dx, dy) in [(-7, -3), (6, -6), (-6, -6), (-9, -1)]:
            fx.px(kx + dx, ky + dy, 'water2')
    elif water_level > 0.6 and frame % 4 == 1:
        for (dx, dy) in [(-8, -6), (5, -9), (-7, -9), (-10, -4)]:
            fx.px(kx + dx, ky + dy, 'water1')
    L.append(fx)
    return composite(L, outline_skip=('fx',))

def main(out_dir):
    os.makedirs(out_dir, exist_ok=True)
    frames = [build(i) for i in range(FRAMES)]
    bg = hx('1b1a26')
    big = []
    for f in frames:
        im = Image.new('RGB', (FW, FH), bg); im.paste(f, (0, 0), f)
        big.append(im.resize((FW * 6, FH * 6), Image.NEAREST))
    big[0].save(os.path.join(out_dir, 'rocco-hd.gif'), save_all=True, append_images=big[1:], duration=120, loop=0)
    # sheet: all 8 frames at 3x, plus 1x and 2x in-game reads
    sheet = Image.new('RGB', (FW * 3 * 4 + 50, FH * 3 * 2 + FH * 2 + 60), bg)
    for i, f in enumerate(frames):
        im = f.resize((FW * 3, FH * 3), Image.NEAREST)
        sheet.paste(im, (10 + (i % 4) * (FW * 3 + 10), 10 + (i // 4) * (FH * 3 + 10)), im)
    for k, sc in enumerate((1, 2)):
        im = frames[0].resize((FW * sc, FH * sc), Image.NEAREST)
        sheet.paste(im, (10 + k * (FW + 20), FH * 6 + 40), im)
    sheet.save(os.path.join(out_dir, 'rocco-hd-sheet.png'))
    print('ok')

if __name__ == '__main__':
    main(sys.argv[1] if len(sys.argv) > 1 else '.')
