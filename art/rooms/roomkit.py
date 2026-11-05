"""Shared helpers for the room layout scripts: rects, border walls with door gaps, reach and clearance checks."""
import math

WALL = 20
DOOR = 84
BASE_LEASH, BRAIDED, VINE = 230, 270, 300
HONK = 178 + 14 + 30          # honk reach at Goose Power 2 plus the bell's slack
POST_CLEARANCE = 130


def rect(x, y, w, h, **kw):
    r = {'x': x, 'y': y, 'w': w, 'h': h}
    r.update(kw)
    return r


def tree(x, y, s=44):
    """A tree trunk (solid), centred on x, y."""
    return rect(x - s // 2, y - s // 2, s, s, kind='tree')


def post(x, y): return {'x': x, 'y': y, 'r': 9}
def foe(kind, x, y): return {'kind': kind, 'x': x, 'y': y}


def border_and_doors(w, h, doors):
    gaps = {'N': [], 'S': [], 'W': [], 'E': []}
    out = []
    for d in doors:
        side, at = d['side'], d['at']
        gaps[side].append((at - DOOR / 2, at + DOOR / 2))
        if side == 'W': trig, spawn = rect(0, at - DOOR / 2, 26, DOOR), {'x': 66, 'y': at}
        elif side == 'E': trig, spawn = rect(w - 26, at - DOOR / 2, 26, DOOR), {'x': w - 66, 'y': at}
        elif side == 'N': trig, spawn = rect(at - DOOR / 2, 0, DOOR, 26), {'x': at, 'y': 70}
        else: trig, spawn = rect(at - DOOR / 2, h - 26, DOOR, 26), {'x': at, 'y': h - 70}
        door = {'id': d['id'], **trig, 'to': d['to'], 'toDoor': d['toDoor'], 'spawn': spawn}
        if d.get('gated'): door['gated'] = True
        if d.get('label'): door['label'] = d['label']
        out.append(door)
    walls = []
    def run(side, length, make):
        pos = 0
        for a, b in sorted(gaps[side]):
            if a > pos: walls.append(make(pos, a - pos))
            pos = b
        if pos < length: walls.append(make(pos, length - pos))
    run('N', w, lambda a, l: rect(a, 0, l, WALL, kind='border'))
    run('S', w, lambda a, l: rect(a, h - WALL, l, WALL, kind='border'))
    run('W', h, lambda a, l: rect(0, a, WALL, l, kind='border'))
    run('E', h, lambda a, l: rect(w - WALL, a, WALL, l, kind='border'))
    return walls, out


def room(id, name, w, h, doors, start_door, **kw):
    walls, door_defs = border_and_doors(w, h, doors)
    walls += kw.pop('props', [])
    start = next(d for d in door_defs if d['id'] == start_door)['spawn']
    grapple_heavy = kw.pop('grapple_heavy', False)
    r = {
        'id': id, 'name': name, 'subtitle': kw.pop('subtitle'), 'width': w, 'height': h,
        'playerStart': start, 'walls': walls, 'gate': kw.pop('gate', None),
        'pits': kw.pop('pits', []), 'bridges': kw.pop('bridges', []), 'refills': kw.pop('refills', []),
        'posts': kw.pop('posts', []), 'bell': kw.pop('bell', None), 'exit': None,
        'vents': kw.pop('vents', []), 'bucket': None, 'breadSpots': kw.pop('bread', []),
        'enemies': kw.pop('enemies', []), 'knightSpawn': None,
        'doors': door_defs, 'paths': kw.pop('paths', []),
    }
    r.update(kw)
    for e in r['enemies']:
        if grapple_heavy and e['kind'] in ('snapper', 'badger'): continue
        for p in r['posts']:
            d = math.dist((e['x'], e['y']), (p['x'], p['y']))
            assert d >= POST_CLEARANCE, f"{id}: {e['kind']} at {e['x']},{e['y']} is {d:.0f} from a post"
    return r


def check_reach(name, a, b, leash, longer_than=None):
    d = math.dist(a, b)
    assert d <= leash - 8, f'{name}: {d:.0f} is out of reach of a {leash} leash'
    if longer_than is not None:
        assert d > longer_than - 4, f'{name}: {d:.0f} is reachable with a {longer_than} leash'
    return d
