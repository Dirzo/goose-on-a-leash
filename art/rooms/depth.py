"""
The depth pass shared by the room painters (the Death's Door look): soft ambient occlusion pooling
around everything solid, a broad, slow rhythm of light and shadow across the ground, a darker rim
inside the water along the banks, and the room's edges falling off into dark.

Light sources are NOT baked: the game's lightmap (src/view/atmosphere.ts) adds them live.
"""
import numpy as np


def box(a, r):
    """Separable box blur of radius r (edges clamped), via cumulative sums."""
    r = int(r)
    if r < 1: return a
    def one(x, axis):
        pad = [(0, 0)] * x.ndim; pad[axis] = (r + 1, r)
        p = np.pad(x, pad, mode='edge')
        c = np.cumsum(p, axis=axis, dtype=np.float64)
        hi = np.take(c, range(2 * r + 1, c.shape[axis]), axis=axis)
        lo = np.take(c, range(0, c.shape[axis] - 2 * r - 1), axis=axis)
        return ((hi - lo) / (2 * r + 1)).astype(np.float32)
    return one(one(a, 0), 1)


def soft(a, r):
    return box(box(a, r), r)


def depth_pass(img, R, occ, water=None, seed=0.0, ao=0.5, rhythm=0.09):
    H, W = img.shape[:2]
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    occ = occ.astype(np.float32)
    # ambient occlusion: dark pools hugging walls, trees, hedges and props (tight + wide)
    near = soft(occ, 5) * 0.55 + soft(occ, 18) * 0.45
    shade = 1 - ao * np.clip(near * 1.6, 0, 1) * (1 - occ)
    # contact shadow a little south of solids (light comes from the north)
    south = np.zeros_like(occ); south[6:] = occ[:-6]
    shade *= 1 - 0.18 * soft(south, 6) * (1 - occ)
    # broad rhythm of light and shadow so the ground is never one flat value
    n = (np.sin(xx * 0.0065 + yy * 0.004 + seed) + 0.7 * np.sin(yy * 0.009 - xx * 0.003 + seed * 1.7)
         + 0.4 * np.sin(xx * 0.015 + yy * 0.012 - seed))
    shade *= 1 + rhythm * np.clip(n / 1.6, -1, 1)
    if water is not None and water.any():
        land = (~water).astype(np.float32)
        rim = soft(land, 10) * water                      # shallow, shadowed edge under the bank
        shade *= 1 - 0.32 * np.clip(rim * 2.2, 0, 1)
    # the room's edges fall away into dark
    ex = np.minimum(xx, W - 1 - xx) / 90.0; ey = np.minimum(yy, H - 1 - yy) / 90.0
    shade *= 0.72 + 0.28 * np.clip(np.minimum(ex, ey), 0, 1) ** 0.7
    return img * shade[..., None]


def wall_mask(R, H, W, kinds=None):
    occ = np.zeros((H, W), bool)
    for w in R['walls']:
        if kinds is not None and w.get('kind') not in kinds: continue
        x0, y0 = max(0, int(w['x'])), max(0, int(w['y']))
        occ[y0:int(w['y'] + w['h']), x0:int(w['x'] + w['w'])] = True
    return occ
