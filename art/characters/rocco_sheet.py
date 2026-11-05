"""Character sheet: Rocco with his backpack, the backpack's three states, and the Moon Koi up close.
Run: python3 art/characters/rocco_sheet.py out.png"""
import os
import sys

from PIL import Image, ImageDraw

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))
from sprites import KOI_DRY, KOI_HAPPY, KOI_KEYS, PACK_H, PACK_W, PALETTE, ROCCO, ROCCO_KEYS, draw_backpack, draw_koi  # noqa: E402

def hx(s):
    return tuple(int(s[i:i + 2], 16) for i in (0, 2, 4))

BG = hx('1b1a26')

def sprite_img(rows, keys):
    w = max(len(r) for r in rows); h = len(rows)
    im = Image.new('RGBA', (w, h), (0, 0, 0, 0))
    for j, r in enumerate(rows):
        for i, ch in enumerate(r):
            if ch != '.': im.putpixel((i, j), hx(PALETTE[keys[ch]]) + (255,))
    return im

PAD = 10
def pack_img(**kw):
    im = Image.new('RGBA', (PACK_W + PAD * 2, PACK_H + PAD * 2), (0, 0, 0, 0))
    def put(x, y, c, emit=False):
        if 0 <= x < im.width and 0 <= y < im.height: im.putpixel((x, y), hx(PALETTE[c]) + (255,))
    draw_backpack(put, PAD, PAD, **kw)
    return im

def koi_layer(**kw):
    im = Image.new('RGBA', (PACK_W + PAD * 2, PACK_H + PAD * 2), (0, 0, 0, 0))
    def put(x, y, c, emit=False):
        if 0 <= x < im.width and 0 <= y < im.height: im.putpixel((x, y), hx(PALETTE[c]) + (255,))
    draw_koi(put, PAD, PAD, kw.get('water', 1.0), kw.get('koi', 'happy'))
    return im

def rocco_with_pack(**kw):
    r = sprite_img(ROCCO, ROCCO_KEYS); p = pack_img(with_koi=False, **kw); k = koi_layer(**kw)
    im = Image.new('RGBA', (r.width + 15, r.height + 4), (0, 0, 0, 0))
    im.alpha_composite(p, (5 - PAD, 16 - PAD))     # pack tucked behind his shoulder, koi peeks beside his face
    im.alpha_composite(r, (15, 4))
    im.alpha_composite(k, (5 - PAD, 16 - PAD))     # koi peeks over his shoulder
    return im

sheet = Image.new('RGB', (1280, 720), BG)
d = ImageDraw.Draw(sheet)
def place(im, x, y, sc, label):
    big = im.resize((im.width * sc, im.height * sc), Image.NEAREST)
    sheet.paste(big, (x, y), big)
    d.text((x, y - 20), label, fill=(230, 226, 238))
    return big.width

place(rocco_with_pack(patches=[(10, 14)]), 30, 50, 9, 'Rocco with his backpack')
x = 420
for label, kw in [('Patched, full', dict(patches=[(2, 13), (10, 3)], water=1.0)),
                  ('Leaking: holes drip', dict(holes=[(11, 15), (4, 11)], water=0.6)),
                  ('Nearly dry: koi gasping', dict(holes=[(11, 15)], water=0.2, koi='dry'))]:
    x += place(pack_img(**kw), x, 50, 7, label) + 30
place(sprite_img(KOI_HAPPY, KOI_KEYS), 430, 370, 16, 'The Moon Koi, happy')
place(sprite_img(KOI_DRY, KOI_KEYS), 720, 370, 16, 'Running dry')
native = rocco_with_pack(patches=[(10, 14)])
for k, sc in enumerate((1, 2, 4)):
    n = native.resize((native.width * sc, native.height * sc), Image.NEAREST)
    sheet.paste(n, (1010 + [0, 40, 120][k], 420 + [70, 50, 0][k]), n)
d.text((1010, 400), 'In game: 1x, 2x, 4x', fill=(160, 156, 176))
sheet.save(sys.argv[1] if len(sys.argv) > 1 else 'rocco_sheet.png')
print('sheet ok')
