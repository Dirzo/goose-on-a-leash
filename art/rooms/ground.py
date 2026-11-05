"""
Ground texture for the room painters: organic tone fields (fractal value noise, ordered-dithered into the
palette so it stays pixel art), clutter that clusters into thickets and clearings, and dirt trails with
pebbles and grass creeping over the edges.
"""
import numpy as np
from PIL import Image

BAYER4 = (np.array([[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]], np.float32) + 0.5) / 16


def fbm(H, W, scale, octaves=4, seed=0, gain=0.5):
    """Smooth fractal noise in [0, 1], features about `scale` pixels across."""
    rng = np.random.default_rng(seed)
    out = np.zeros((H, W), np.float32); amp, tot, s = 1.0, 0.0, float(scale)
    for _ in range(octaves):
        gw, gh = max(2, int(W / s) + 3), max(2, int(H / s) + 3)
        g = rng.random((gh, gw)).astype(np.float32)
        big = Image.fromarray(g, 'F').resize((int(gw * s), int(gh * s)), Image.BICUBIC)
        a = np.asarray(big, np.float32)
        ox, oy = rng.integers(0, max(1, a.shape[1] - W)), rng.integers(0, max(1, a.shape[0] - H))
        out += amp * a[oy:oy + H, ox:ox + W]; tot += amp; amp *= gain; s /= 2
    out /= tot
    lo, hi = np.percentile(out, 1), np.percentile(out, 99)
    return np.clip((out - lo) / (hi - lo + 1e-6), 0, 1)


def dither_bands(t, n):
    """Quantise a 0..1 field into n bands with a 4x4 ordered dither at each boundary."""
    H, W = t.shape
    b = np.tile(BAYER4, (H // 4 + 1, W // 4 + 1))[:H, :W]
    return np.clip(np.floor(t * n + (b - 0.5) * 0.9), 0, n - 1).astype(np.int32)


def paint_ground(img, land, P, rng, seed, woods=False):
    H, W = land.shape
    tone = fbm(H, W, 150, 4, seed) * 0.72 + fbm(H, W, 14, 2, seed + 9) * 0.28   # broad shapes plus grain
    wet = fbm(H, W, 260, 3, seed + 1)
    if woods:
        cols = [P['Q0'], P['Q1'], P['Q2'], P['Q2'] * 0.85 + P['LF1'] * 0.15]
    else:
        cols = [P['Q0'], P['Q1'], P['Q2'], P['Q3'] * 0.75 + P['Q2'] * 0.25]
    idx = dither_bands(tone * 0.85 + wet * 0.15, len(cols))
    base = np.stack(cols)[idx]
    if woods:   # mossy hollows where it is wet
        mt = np.clip((wet - 0.66) / 0.3, 0, 1) * (0.75 + 0.25 * tone)
        moss = dither_bands(mt, 4)
        mc = np.stack([np.zeros(3), P['Q3'] * 0.45 + P['Q1'] * 0.55, P['Q3'] * 0.7 + P['Q1'] * 0.3, P['Q4'] * 0.6 + P['Q3'] * 0.4])
        base = np.where(moss[..., None] > 0, mc[moss], base)
    else:       # drier, browner rises
        dry = (wet < 0.28) & (tone > 0.55)
        base[dry] = base[dry] * 0.7 + P['D1'] * 0.3
    img[land] = base[land]
    clutter(img, land, P, rng, seed, woods, tone, wet)
    decor(img, land, P, rng, woods)


def clutter(img, land, P, rng, seed, woods, tone, wet):
    H, W = land.shape
    dens = fbm(H, W, 90, 3, seed + 2) ** 2.2          # thickets and clearings
    def put(x, y, c):
        if 0 <= x < W and 0 <= y < H and land[y, x]: img[y, x] = c
    n = int(W * H / (180 if not woods else 120))
    xs, ys = rng.integers(3, W - 3, n), rng.integers(4, H - 3, n)
    roll = rng.random(n)
    for x, y, r in zip(xs, ys, roll):
        if not land[y, x] or r > dens[y, x] * 1.6: continue
        k = rng.random()
        if woods:
            if k < 0.45:                                   # fallen leaf
                c = P[['LF1', 'LF1', 'LF2', 'LF3'][rng.integers(4)]]
                put(x, y, c); put(x + 1, y, c * 0.8); put(x, y + 1, c * 0.6)
            elif k < 0.7:                                  # fern frond
                ln = rng.integers(4, 8); d = rng.choice([-1, 1])
                for i in range(ln):
                    put(x + i * d, y - i // 2, P['Q4']); put(x + i * d, y - i // 2 - 1, P['Q3'])
                    if i % 2: put(x + i * d, y - i // 2 + 1, P['Q3'] * 0.8)
            elif k < 0.85:                                 # twig
                ln = rng.integers(4, 9)
                for i in range(ln): put(x + i, y + (i // 3) * rng.choice([0, 1]), P['TR1'])
            else:                                          # pebble
                pebble(put, x, y, P['ROCK1'], P['ROCK2'], P['ROCK0'])
        else:
            if k < 0.62:                                   # grass tuft: 3-5 blades, lit tips
                h = 3 + int(rng.integers(0, 4) * (0.5 + tone[y, x]))
                for b in range(rng.integers(3, 6)):
                    bx = x + b - 2; lean = rng.choice([-1, 0, 1])
                    for j in range(h - abs(b - 2)):
                        put(bx + (lean if j > 1 else 0), y - j, P['Q3'] if j < 2 else P['Q4'])
                    put(bx + lean, y - (h - abs(b - 2)), P['Q5'])
            elif k < 0.75:                                 # clover clump
                for dx, dy in ((0, 0), (1, 0), (0, 1), (-1, 0), (0, -1)): put(x + dx, y + dy, P['Q3'])
                put(x, y, P['Q4'])
            elif k < 0.85 and wet[y, x] < 0.5:             # pebble
                pebble(put, x, y, P['ST1'], P['ST2'], P['ST0'])
            elif k < 0.93:                                 # reed stubble
                for j in range(rng.integers(3, 6)): put(x, y - j, P['RD1'])
            else:                                          # a cluster of tiny flowers
                c = P[['FLW', 'FLW2', 'FLW3'][rng.integers(3)]]
                for _ in range(rng.integers(2, 5)):
                    put(x + rng.integers(-3, 4), y + rng.integers(-2, 3), c)


def decor(img, land, P, rng, woods):
    """Larger, legible features every so often: rock clusters, fern clumps, root tangles, mushrooms."""
    H, W = land.shape
    def put(x, y, c):
        x, y = int(x), int(y)
        if 0 <= x < W and 0 <= y < H and land[y, x]: img[y, x] = c
    def blob(cx, cy, rx, ry, c):
        for yy in range(int(cy - ry), int(cy + ry) + 1):
            for xx in range(int(cx - rx), int(cx + rx) + 1):
                if ((xx - cx) / rx) ** 2 + ((yy - cy) / ry) ** 2 <= 1: put(xx, yy, c)
    stone = ('ROCK0', 'ROCK1', 'ROCK2') if woods else ('ST0', 'ST1', 'ST2')
    for _ in range(int(W * H / 3800)):
        x, y = rng.integers(10, W - 10), rng.integers(12, H - 6)
        if not land[y, x]: continue
        k = rng.random()
        if k < 0.3:                                          # a few stones half sunk in the ground
            for _ in range(rng.integers(2, 5)):
                sx, sy, r = x + rng.integers(-11, 12), y + rng.integers(-6, 7), rng.integers(3, 8)
                blob(sx + 1, sy + 1, r + 0.5, r * 0.7 + 0.5, img[sy, sx] * 0.55 if 0 <= sy < H and 0 <= sx < W else P['Q0'])
                blob(sx, sy, r, r * 0.7, P[stone[1]]); blob(sx - r * 0.3, sy - r * 0.3, r * 0.5, r * 0.3, P[stone[2]])
                put(sx + r - 1, sy + 1, P[stone[0]])
        elif k < 0.6:                                        # fern / reed clump: fronds radiating out
            for f in range(rng.integers(5, 9)):
                a = -np.pi / 2 + (f / 7 - 0.5) * 2.6 + rng.normal() * 0.15
                ln = rng.integers(6, 12)
                for i in range(ln):
                    px_, py_ = x + np.cos(a) * i, y + np.sin(a) * i * 0.8 + (i * i) * 0.02
                    put(px_, py_, P['Q5'] if i > ln * 0.7 else P['Q4']); put(px_ + 1, py_, P['Q3'])
                    if i % 2 and i > 2:
                        put(px_ + np.cos(a + 1.4) * 2, py_ + np.sin(a + 1.4) * 2, P['Q4']); put(px_ + np.cos(a - 1.4) * 2, py_ + np.sin(a - 1.4) * 2, P['Q3'])
        elif k < 0.8 and woods:                              # roots snaking across the litter
            a = rng.random() * np.pi * 2
            for i in range(rng.integers(14, 28)):
                put(x, y, P['TR1']); put(x, y + 1, P['TR0']); put(x - 1, y, P['TR2'] if i % 5 == 0 else P['TR1'])
                a += rng.normal() * 0.35; x = x + np.cos(a) * 1.2; y = y + np.sin(a) * 0.9
        elif k < 0.86 and woods:                             # a drift of fallen leaves
            for _ in range(rng.integers(25, 60)):
                lx, ly = x + rng.normal() * 9, y + rng.normal() * 5
                c = P[['LF1', 'LF2', 'LF3', 'LF2'][rng.integers(4)]]
                put(lx, ly, c); put(lx + 1, ly, c * 0.8); put(lx, ly + 1, c * 0.6)
        elif k < 0.93:                                       # mushrooms
            for _ in range(rng.integers(2, 5)):
                mx, my = x + rng.integers(-6, 7), y + rng.integers(-4, 5)
                put(mx, my, P['FLW2'] * 0.8); put(mx, my - 1, P['FLW2'] * 0.8)
                cap = P['LF2'] if woods else P['CT1']
                put(mx - 1, my - 2, cap); put(mx, my - 2, cap); put(mx + 1, my - 2, cap * 0.8); put(mx, my - 3, cap * 1.2)
        else:                                                # a patch of flowers
            c = P[['FLW', 'FLW2', 'FLW3'][rng.integers(3)]]
            for _ in range(rng.integers(5, 10)):
                fx, fy = x + rng.integers(-8, 9), y + rng.integers(-5, 6)
                put(fx, fy + 1, P['Q3']); put(fx, fy, c)


def pebble(put, x, y, mid, hi, lo):
    put(x, y, mid); put(x + 1, y, mid); put(x, y - 1, hi); put(x + 1, y + 1, lo); put(x + 2, y, lo)


def paint_path(img, path, P, rng, seed, woods=False):
    H, W = path.shape
    t = fbm(H, W, 40, 3, seed + 5)
    cols = [P['D0'], P['D1'], P['D2'], P['D2'] * 0.8 + (P['ROCK1'] if woods else P['ST1']) * 0.2]
    idx = dither_bands(t, 4)
    img[path] = np.stack(cols)[idx][path]
    ys, xs = np.nonzero(path)
    if len(xs):
        for i in rng.choice(len(xs), size=max(1, len(xs) // 140), replace=False):
            x, y = xs[i], ys[i]
            def put(px_, py_, c):
                if 0 <= px_ < W and 0 <= py_ < H and path[py_, px_]: img[py_, px_] = c
            pebble(put, x, y, P['ROCK1'] if woods else P['ST1'], P['ROCK2'] if woods else P['ST2'], P['D0'])
    # grass creeping over the trail's edges
    edge = path & ~(np.roll(path, 2, 0) & np.roll(path, -2, 0) & np.roll(path, 2, 1) & np.roll(path, -2, 1))
    ys, xs = np.nonzero(edge)
    for i in rng.choice(len(xs), size=len(xs) // 5, replace=False) if len(xs) else []:
        x, y = xs[i], ys[i]
        c = P['Q3'] if not woods else P['LF1']
        img[y, x] = c
        if y > 0 and rng.random() < 0.5: img[y - 1, x] = P['Q4'] if not woods else P['LF2']
