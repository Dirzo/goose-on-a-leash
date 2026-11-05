"""Small toolkit for fine-resolution (640x360) sprites: shape layers plus selective outlines."""
from PIL import Image, ImageDraw

def hx(s):
    s = s.lstrip('#'); return tuple(int(s[i:i + 2], 16) for i in (0, 2, 4))

OUT = hx('1a1522')

class Layer:
    """One part of a sprite drawn on its own canvas; `composite` stacks parts back to front."""
    def __init__(self, name, w, h, pal):
        self.name, self.w, self.h, self.pal = name, w, h, pal
        self.im = Image.new('RGBA', (w, h), (0, 0, 0, 0))
        self.d = ImageDraw.Draw(self.im)
    def _c(self, c): return (self.pal[c] if isinstance(c, str) else c) + (255,)
    def ell(self, cx, cy, rx, ry, c): self.d.ellipse([cx - rx, cy - ry, cx + rx, cy + ry], fill=self._c(c))
    def poly(self, pts, c): self.d.polygon(pts, fill=self._c(c))
    def rect(self, x0, y0, x1, y1, c): self.d.rectangle([x0, y0, x1, y1], fill=self._c(c))
    def line(self, pts, c, w=1): self.d.line(pts, fill=self._c(c), width=w)
    def px(self, x, y, c):
        if 0 <= x < self.w and 0 <= y < self.h: self.im.putpixel((int(x), int(y)), self._c(c))

def darker(rgb, k=0.68):
    return tuple(int(v * k) for v in rgb)

def composite(layers, no_outline=('fx',)):
    """Stack layers; internal edges get a darker tone of the front part, the silhouette gets OUT."""
    w, h = layers[0].w, layers[0].h
    out = Image.new('RGBA', (w, h), (0, 0, 0, 0))
    owner = [[-1] * w for _ in range(h)]
    dst = out.load()
    for li, L in enumerate(layers):
        src = L.im.load()
        for y in range(h):
            row = owner[y]
            for x in range(w):
                if src[x, y][3]:
                    dst[x, y] = src[x, y]; row[x] = li
    edge, sil = [], []
    for y in range(h):
        for x in range(w):
            o = owner[y][x]
            for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                nx, ny = x + dx, y + dy
                if not (0 <= nx < w and 0 <= ny < h): continue
                n = owner[ny][nx]
                if o < 0:
                    if n >= 0 and layers[n].name not in no_outline: sil.append((x, y)); break
                elif layers[o].name not in no_outline and 0 <= n < o and layers[n].name not in no_outline:
                    edge.append((x, y)); break
    for (x, y) in edge:
        r, g, b, a = dst[x, y]; dst[x, y] = darker((r, g, b)) + (a,)
    for (x, y) in sil: dst[x, y] = OUT + (255,)
    return out
