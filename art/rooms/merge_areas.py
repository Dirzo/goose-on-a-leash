"""
Stitch the per-room layouts (art/rooms/build/*.json, written by reedmarsh_layout.py and woods_layout.py)
into big areas, written to src/data/rooms/<area>.json.

Linked rooms are laid side by side and the wall between them is opened (fully, unless that door was
gated: then only the doorway, so the gate still guards it). Rooms joined north-to-west are stacked, the
upper room centred on the lower room's north door. Each old room becomes a named zone inside the area
(the game shows its name as you walk in). Doors leading out of the area keep their ids.

Run: python3 art/rooms/merge_areas.py
"""
import json
import os

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, 'build')
OUT = os.path.join(HERE, '..', '..', 'src', 'data', 'rooms')
WALL, DOOR = 20, 84

AREAS = [
    ('reedmarsh-1', 'The Reed Gate', 'Reedmarsh', ['reedmarsh-1', 'reedmarsh-2', 'reedmarsh-3']),
    ('reedmarsh-2', 'Snapper Shallows', 'Reedmarsh', ['reedmarsh-4', 'reedmarsh-5', 'reedmarsh-6']),
    ('reedmarsh-3', 'Leaky Boardwalk', 'Reedmarsh', ['reedmarsh-7', 'reedmarsh-8', 'reedmarsh-9']),
    ('reedmarsh-4', 'Bell Islands', 'Reedmarsh', ['reedmarsh-10', 'reedmarsh-11']),
    ('reedmarsh-5', "The Ferryman's Pool", 'Reedmarsh · the Ferryman', ['reedmarsh-12']),
    ('hollowbark-1', 'Woodline', 'Hollowbark Woods', ['hollowbark-1', 'hollowbark-2', 'hollowbark-3']),
    ('hollowbark-2', 'Rain Barrels', 'Hollowbark Woods', ['hollowbark-4', 'hollowbark-5']),
    ('hollowbark-3', 'Hollow Stump', 'Hollowbark Woods', ['hollowbark-6', 'hollowbark-7']),
    ('hollowbark-4', 'The Hollow', 'Hollowbark Woods · the Burrow King', ['hollowbark-8']),
    ('driftwood-1', 'Saltgrass Dunes', 'Driftwood Wharf', ['driftwood-1', 'driftwood-2']),
    ('driftwood-2', 'Driftwood Wharf', 'Driftwood Wharf · the harbour', ['driftwood-3']),
    ('driftwood-3', 'Net Lofts', 'Driftwood Wharf', ['driftwood-4', 'driftwood-5']),
    ('driftwood-4', 'The Rusty Gull', 'Driftwood Wharf · Captain Gullbeard', ['driftwood-6']),
    ('tide-1', 'Tidepool Steps', 'The Tide Caves', ['tide-1', 'tide-2']),
    ('tide-2', 'Moonlit Cove', 'The Tide Caves · the fishing grounds', ['tide-3']),
    ('castle-1', 'Honkmore Gate', 'Castle Honkmore', ['castle-1']),
    ('castle-2', 'The Grand Foyer', 'Castle Honkmore · the first wing', ['castle-4', 'castle-3', 'castle-2']),
]
ROOM_TO_AREA = {r: a for a, _, _, rs in AREAS for r in rs}


def side(d, R):
    if d['x'] <= 0: return 'W'
    if d['x'] + d['w'] >= R['width']: return 'E'
    if d['y'] <= 0: return 'N'
    return 'S'


def mid(d):
    return d['x'] + d['w'] / 2, d['y'] + d['h'] / 2


def shift_pt(p, ox, oy):
    q = dict(p); q['x'] = p['x'] + ox; q['y'] = p['y'] + oy; return q


def place(rooms, ids):
    """Offsets for each room, following the chain of links from the first."""
    pos = {ids[0]: (0.0, 0.0)}
    seams = []                      # (roomA, roomB, sideA, gated, doorA)
    for a, b in zip(ids, ids[1:]):
        A, B = rooms[a], rooms[b]
        dA = next(d for d in A['doors'] if d['to'] == b)
        dB = next(d for d in B['doors'] if d['id'] == dA['toDoor'])
        sa, sb = side(dA, A), side(dB, B)
        ax, ay = pos[a]
        if sa == 'E' and sb == 'W':
            pos[b] = (ax + A['width'], ay + mid(dA)[1] - mid(dB)[1])
        elif sa == 'N' and sb == 'W':
            pos[b] = (round(ax + mid(dA)[0] - B['width'] * 0.35), ay - B['height'])
        else:
            raise SystemExit(f'{a}->{b}: unsupported join {sa}->{sb}')
        seams.append((a, b, sa, bool(dA.get('gated')), dA))
    return pos, seams


def merge(area_id, name, subtitle, ids):
    rooms = {i: json.load(open(os.path.join(SRC, f'{i}.json'))) for i in ids}
    pos, seams = place(rooms, ids)
    mx = min(p[0] for p in pos.values()); my = min(p[1] for p in pos.values())
    pos = {k: (round(v[0] - mx), round(v[1] - my)) for k, v in pos.items()}
    rects = {i: (pos[i][0], pos[i][1], rooms[i]['width'], rooms[i]['height']) for i in ids}
    W = max(x + w for x, y, w, h in rects.values()); H = max(y + h for x, y, w, h in rects.values())

    # openings in each room's sides: (room, side) -> list of (a, b) intervals along that side, in area coords
    opens = {}
    def add_open(r, s, a, b): opens.setdefault((r, s), []).append((a, b))
    for a, b, sa, gated, dA in seams:
        xa, ya, wa, ha = rects[a]; xb, yb, wb, hb = rects[b]
        gated = gated or bool(rooms[a].get('boss') or rooms[b].get('boss'))   # a boss arena keeps its walls: just a doorway in
        if sa == 'E':
            lo, hi = max(ya, yb), min(ya + ha, yb + hb)
            if gated:
                c = ya + mid(dA)[1]; lo, hi = c - DOOR / 2, c + DOOR / 2
            else:
                lo, hi = lo + WALL, hi - WALL
            add_open(a, 'E', lo, hi); add_open(b, 'W', lo, hi)
        else:   # N of a joins S of b
            lo, hi = max(xa, xb), min(xa + wa, xb + wb)
            if gated:
                c = xa + mid(dA)[0]; lo, hi = c - DOOR / 2, c + DOOR / 2
            else:
                lo, hi = lo + WALL, hi - WALL
            add_open(a, 'N', lo, hi); add_open(b, 'S', lo, hi)
    internal = {(a, b) for a, b, *_ in seams} | {(b, a) for a, b, *_ in seams}

    out = {'id': area_id, 'name': name, 'subtitle': subtitle, 'width': W, 'height': H,
           'walls': [], 'pits': [], 'bridges': [], 'refills': [], 'posts': [], 'vents': [], 'breadSpots': [], 'enemies': [],
           'doors': [], 'paths': [], 'zones': [], 'lanterns': [], 'gate': None, 'bell': None, 'exit': None, 'bucket': None,
           'knightSpawn': None}
    lists = ['pits', 'bridges', 'refills', 'posts', 'vents', 'breadSpots', 'enemies', 'kits', 'spools', 'brambles',
             'bushes', 'barrels', 'shrooms', 'feathers', 'nests', 'glass', 'springs', 'firebars', 'crushers', 'carpets']
    for i in ids:
        R, (ox, oy) = rooms[i], pos[i]
        x0, y0, w, h = rects[i]
        out['zones'].append({'x': x0, 'y': y0, 'w': w, 'h': h, 'name': R['name']})
        for k in lists:
            if R.get(k): out.setdefault(k, []).extend(shift_pt(p, ox, oy) for p in R[k])
        out['walls'] += [shift_pt(wl, ox, oy) for wl in R['walls'] if wl.get('kind') != 'border']
        out['paths'] += [[[x + ox, y + oy] for x, y in pl] for pl in R.get('paths', [])]
        if R.get('lantern'): out['lanterns'].append(shift_pt(R['lantern'], ox, oy))
        out['lanterns'] += [shift_pt(l, ox, oy) for l in R.get('lanterns', [])]
        if R.get('fishing'):
            fg = R['fishing']
            out['fishing'] = {'spots': [shift_pt(p, ox, oy) for p in fg['spots']], 'water': shift_pt(fg['water'], ox, oy),
                              **({'trench': shift_pt(fg['trench'], ox, oy)} if fg.get('trench') else {})}
        if R.get('waves'): out['waves'] = R['waves']
        for k in ('gate', 'bell', 'chest', 'shrine', 'ferry', 'shop', 'pump'):
            if R.get(k):
                assert not out.get(k), f'{area_id}: two {k}s'
                out[k] = shift_pt(R[k], ox, oy)
        for k in ('biome', 'lightKind', 'heavyKind', 'weather', 'stormRefill', 'stormDrain', 'ventSpawns', 'boss', 'winText'):
            if k in R and R[k] is not None: out[k] = R[k]
        # doors that leave the area, and the border walls around this room with openings cut
        gaps = {s: list(opens.get((i, s), [])) for s in 'NSWE'}
        for d in R['doors']:
            if (i, d['to']) in internal: continue
            s = side(d, R)
            dd = shift_pt(d, ox, oy); dd['spawn'] = shift_pt(d['spawn'], ox, oy); dd['side'] = s
            dd['to'] = ROOM_TO_AREA.get(d['to'], d['to'])
            out['doors'].append(dd)
            if s in 'WE': gaps[s].append((y0 + d['y'], y0 + d['y'] + d['h']))
            else: gaps[s].append((x0 + d['x'], x0 + d['x'] + d['w']))
        def run(lo, hi, cuts, make):
            p = lo
            for a, b in sorted(cuts):
                a, b = max(a, lo), min(b, hi)
                if b <= a: continue
                if a > p: out['walls'].append(make(p, a - p))
                p = max(p, b)
            if p < hi: out['walls'].append(make(p, hi - p))
        run(x0, x0 + w, gaps['N'], lambda a, l: {'x': a, 'y': y0, 'w': l, 'h': WALL, 'kind': 'border'})
        run(x0, x0 + w, gaps['S'], lambda a, l: {'x': a, 'y': y0 + h - WALL, 'w': l, 'h': WALL, 'kind': 'border'})
        run(y0, y0 + h, gaps['W'], lambda a, l: {'x': x0, 'y': a, 'w': WALL, 'h': l, 'kind': 'border'})
        run(y0, y0 + h, gaps['E'], lambda a, l: {'x': x0 + w - WALL, 'y': a, 'w': WALL, 'h': l, 'kind': 'border'})
    # the outside of the union is solid too (dense canopy in the art)
    out['rooms'] = [{'x': x, 'y': y, 'w': w, 'h': h} for x, y, w, h in rects.values()]
    out['walls'] += outside_rects(list(rects.values()), W, H)
    first = rooms[ids[0]]
    out['playerStart'] = shift_pt(first['playerStart'], *pos[ids[0]])
    if not out['lanterns']: del out['lanterns']
    return out


def outside_rects(rects, W, H, cell=20):
    """Cover the parts of the bounding box that no room covers, as a few solid rects (row runs, merged)."""
    def inside(x, y): return any(rx <= x < rx + rw and ry <= y < ry + rh for rx, ry, rw, rh in rects)
    rows = []
    for y in range(0, H, cell):
        runs, x = [], 0
        while x < W:
            if not inside(x + cell / 2, y + cell / 2):
                x1 = x
                while x1 < W and not inside(x1 + cell / 2, y + cell / 2): x1 += cell
                runs.append((x, min(x1, W))); x = x1
            else: x += cell
        rows.append(runs)
    out, open_ = [], {}
    for j, runs in enumerate(rows + [[]]):
        nxt = {}
        for r in runs:
            if r in open_: nxt[r] = open_.pop(r)
            else: nxt[r] = j
        for (a, b), j0 in open_.items():
            out.append({'x': a, 'y': j0 * cell, 'w': b - a, 'h': min(j * cell, H) - j0 * cell, 'kind': 'void'})
        open_ = nxt
    return out


if __name__ == '__main__':
    for area_id, name, sub, ids in AREAS:
        A = merge(area_id, name, sub, ids)
        with open(os.path.join(OUT, f'{area_id}.json'), 'w') as f: json.dump(A, f, indent=1)
        print(area_id, A['width'], 'x', A['height'], len(ids), 'rooms')
