"""Character sheet: Rocco with his fish-jar backpack, and a close-up of the Moon Koi.
Run: python3 art/characters/rocco_sheet.py out.png"""
import os
import sys

from PIL import Image, ImageDraw

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))
from sprites import JAR_H, JAR_W, PALETTE, ROCCO, ROCCO_KEYS, draw_jar, KOI, KOI_KEYS  # noqa: E402

def hx(s):
    return tuple(int(s[i:i + 2], 16) for i in (0, 2, 4))

BG = hx('1b1a26')

def canvas(w, h):
    return Image.new('RGB', (w, h), BG)

def sprite_img(rows, keys):
    w = max(len(r) for r in rows); h = len(rows)
    im = Image.new('RGBA', (w, h), (0, 0, 0, 0))
    for j, r in enumerate(rows):
        for i, ch in enumerate(r):
            if ch != '.': im.putpixel((i, j), hx(PALETTE[keys[ch]]) + (255,))
    return im

def jar_img(water=0.8):
    im = Image.new('RGBA', (JAR_W, JAR_H), (0, 0, 0, 0))
    def put(x, y, c, emit=False):
        if 0 <= x < JAR_W and 0 <= y < JAR_H: im.putpixel((x, y), hx(PALETTE[c]) + (255,))
    draw_jar(put, 0, 0, water)
    return im

def rocco_with_jar():
    r = sprite_img(ROCCO, ROCCO_KEYS); j = jar_img()
    im = Image.new('RGBA', (r.width + 14, max(r.height, JAR_H + 8)), (0, 0, 0, 0))
    im.alpha_composite(j, (0, 8))          # jar sits behind his left shoulder
    im.alpha_composite(r, (14, 0))
    return im

S = 10
sheet = canvas(1280, 560)
d = ImageDraw.Draw(sheet)
parts = [('Rocco, 3/4 view', rocco_with_jar(), 10), ('Fish-jar backpack', jar_img(), 10), ('The Moon Koi', sprite_img(KOI, KOI_KEYS), 14)]
x = 40
for label, im, sc in parts:
    big = im.resize((im.width * sc, im.height * sc), Image.NEAREST)
    sheet.paste(big, (x, 70), big)
    d.text((x, 30), f'{label}  ({im.width}x{im.height} px)', fill=(230, 226, 238))
    x += big.width + 60
# native-size row so the in-game read is visible too
native = rocco_with_jar()
for k, sc in enumerate((1, 2, 4)):
    n = native.resize((native.width * sc, native.height * sc), Image.NEAREST)
    sheet.paste(n, (40 + k * 140, 430), n)
d.text((40, 405), 'In game: 1x, 2x, 4x', fill=(160, 156, 176))
sheet.save(sys.argv[1] if len(sys.argv) > 1 else 'rocco_sheet.png')
print('ok')
