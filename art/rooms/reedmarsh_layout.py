"""
Reedmarsh, part one: six rooms authored in code, written to src/data/rooms/reedmarsh-N.json.
The game and the room art script both read those files.

One idea per room:
  1 Reed Gate        honk frogs into the channel; the boardwalk is the only dry way north
  2 Mooring Run      fling-yank-walk across three post islands
  3 Burrow Field     frogs keep coming from burrows; ring the bell across the moat to open the gate
  4 Snapper Shallows no bridge: latch onto Old Snapper on the far bank and let him drag you over
  5 The Braided Line a quiet shrine; the tackle chest holds a longer, stronger line
  6 Lily Crossing    posts spaced past the old line's reach; the Braided Line makes it

Reach check: Biscuit can latch anything within the leash length (230, or 270 with the Braided Line)
of where Rocco stands. `check_reach` asserts each intended jump is in range (and out of range without
the Braided Line where that is the point).

Run: python3 art/rooms/reedmarsh_layout.py
"""
import json
import math
import os

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, '..', '..', 'src', 'data', 'rooms')
WALL = 20
DOOR = 84
BASE_LEASH, BRAIDED = 230, 270


def rect(x, y, w, h, **kw):
    r = {'x': x, 'y': y, 'w': w, 'h': h}
    r.update(kw)
    return r


def border_and_doors(w, h, doors):
    """Outer walls with gaps for each door, door trigger rects, and spawn points."""
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
    r = {
        'id': id, 'name': name, 'subtitle': kw.pop('subtitle'), 'width': w, 'height': h,
        'playerStart': start, 'walls': walls, 'gate': kw.pop('gate', None),
        'pits': kw.pop('pits', []), 'bridges': kw.pop('bridges', []), 'refills': kw.pop('refills', []),
        'posts': kw.pop('posts', []), 'bell': kw.pop('bell', None), 'exit': None,
        'vents': kw.pop('vents', []), 'bucket': None, 'breadSpots': kw.pop('bread', []),
        'enemies': kw.pop('enemies', []), 'knightSpawn': None, 'lightKind': 'frog', 'heavyKind': 'snapper',
        'doors': door_defs, 'paths': kw.pop('paths', []),
    }
    r.update(kw)
    return r


def frog(x, y): return {'kind': 'frog', 'x': x, 'y': y}
def snapper(x, y): return {'kind': 'snapper', 'x': x, 'y': y}
def post(x, y): return {'x': x, 'y': y, 'r': 9}


def check_reach(name, a, b, leash, need_braided=False):
    d = math.dist(a, b)
    assert d <= leash - 8, f'{name}: {d:.0f} is out of reach of a {leash} leash'
    if need_braided:
        assert d > BASE_LEASH - 4, f'{name}: {d:.0f} is reachable without the Braided Line'
    return d


ROOMS = []

# 1 ---------------------------------------------------------------- Reed Gate
ROOMS.append(room(
    'reedmarsh-1', 'Reed Gate', 960, 640,
    [dict(id='s', side='S', at=480, to='willowmere', toDoor='north', label='Back to Willowmere'),
     dict(id='n', side='N', at=480, to='reedmarsh-2', toDoor='w', label='Mooring Run')],
    's', subtitle='Reedmarsh · 1',
    pits=[rect(20, 250, 920, 130), rect(70, 450, 250, 110)],
    bridges=[rect(450, 238, 60, 154, kind='dock')],
    refills=[rect(20, 226, 920, 26), rect(20, 378, 920, 26), rect(60, 428, 270, 24)],
    props=[rect(150, 140, 40, 28, kind='stump'), rect(780, 470, 40, 30, kind='rock'), rect(640, 130, 56, 24, kind='log')],
    vents=[{'x': 820, 'y': 160}],
    enemies=[frog(300, 180), frog(640, 200), frog(420, 480), frog(700, 520), frog(590, 440)],
    bread=[{'x': 860, 'y': 560}, {'x': 120, 'y': 110}],
    lantern={'x': 520, 'y': 236},
    paths=[[[480, 576], [480, 400]], [[480, 230], [480, 64]]],
))

# 2 ---------------------------------------------------------------- Mooring Run
A, B, Cc, D = (420, 210), (600, 350), (790, 220), (1000, 310)
check_reach('run: shore to A', (262, 260), A, BASE_LEASH)
check_reach('run: A to B', (470, 250), B, BASE_LEASH)
check_reach('run: B to C', (650, 310), Cc, BASE_LEASH)
check_reach('run: C to far shore', (840, 240), D, BASE_LEASH)
ROOMS.append(room(
    'reedmarsh-2', 'Mooring Run', 1280, 600,
    [dict(id='w', side='W', at=300, to='reedmarsh-1', toDoor='n', label='Reed Gate'),
     dict(id='e', side='E', at=310, to='reedmarsh-3', toDoor='w', label='Burrow Field')],
    'w', subtitle='Reedmarsh · 2',
    pits=[rect(260, 20, 700, 560)],
    bridges=[rect(370, 160, 110, 100, kind='island'), rect(550, 300, 110, 100, kind='island'), rect(740, 170, 110, 100, kind='island')],
    refills=[rect(236, 20, 26, 560), rect(958, 20, 26, 560)],
    posts=[post(*A), post(*B), post(*Cc), post(*D)],
    props=[rect(1120, 120, 40, 30, kind='rock'), rect(90, 470, 56, 24, kind='log'), rect(1180, 470, 40, 28, kind='stump')],
    enemies=[frog(452, 236), frog(818, 248), frog(1110, 220), frog(1130, 420)],
    bread=[{'x': 630, 'y': 372}, {'x': 120, 'y': 120}],
    lantern={'x': 226, 'y': 250},
    paths=[[[66, 300], [236, 300]], [[984, 310], [1214, 310]]],
))

# 3 ---------------------------------------------------------------- Burrow Field
bell3 = {'x': 780, 'y': 118, 'r': 14}
check_reach('burrow: honk the bell from the moat bank', (700, 240), (bell3['x'], bell3['y']), 178 + 14 + 30)
ROOMS.append(room(
    'reedmarsh-3', 'Burrow Field', 960, 600,
    [dict(id='w', side='W', at=300, to='reedmarsh-2', toDoor='e', label='Mooring Run'),
     dict(id='e', side='E', at=300, to='reedmarsh-4', toDoor='w', gated=True, label='Snapper Shallows')],
    'w', subtitle='Reedmarsh · 3',
    gate=rect(914, 254, 12, 92),
    pits=[rect(640, 30, 290, 190)],
    bridges=[rect(720, 70, 120, 96, kind='island')],
    refills=[rect(630, 218, 300, 26), rect(616, 30, 26, 190)],
    bell=bell3,
    props=[rect(330, 250, 40, 28, kind='stump'), rect(600, 400, 56, 24, kind='log'), rect(150, 380, 40, 30, kind='rock')],
    vents=[{'x': 170, 'y': 140}, {'x': 210, 'y': 500}, {'x': 520, 'y': 520}, {'x': 470, 'y': 110}],
    enemies=[frog(360, 160), frog(420, 440), frog(700, 320)],
    bread=[{'x': 100, 'y': 540}, {'x': 560, 'y': 300}, {'x': 860, 'y': 520}],
    lantern={'x': 640, 'y': 236},
    paths=[[[66, 300], [560, 300], [894, 300]]],
))

# 4 ---------------------------------------------------------------- Snapper Shallows
check_reach('shallows: latch Snapper as he comes to the bank', (394, 330), (600, 330), BASE_LEASH)
check_reach('shallows: backup post', (394, 160), (610, 160), BASE_LEASH)
ROOMS.append(room(
    'reedmarsh-4', 'Snapper Shallows', 1120, 640,
    [dict(id='w', side='W', at=320, to='reedmarsh-3', toDoor='e', label='Burrow Field'),
     dict(id='n', side='N', at=960, to='reedmarsh-5', toDoor='w', label='The Braided Line')],
    'w', subtitle='Reedmarsh · 4',
    pits=[rect(400, 20, 180, 600)],
    refills=[rect(376, 20, 26, 600), rect(578, 20, 26, 600)],
    posts=[post(610, 160)],
    props=[rect(200, 120, 40, 30, kind='rock'), rect(240, 470, 56, 24, kind='log'), rect(860, 300, 40, 30, kind='rock'),
           rect(1000, 520, 40, 28, kind='stump')],
    enemies=[snapper(660, 330), snapper(900, 500), frog(800, 190), frog(980, 420), frog(180, 300)],
    bread=[{'x': 120, 'y': 560}, {'x': 1040, 'y': 160}],
    lantern={'x': 370, 'y': 300},
    paths=[[[66, 320], [376, 320]], [[604, 330], [960, 330], [960, 70]]],
))

# 5 ---------------------------------------------------------------- The Braided Line
ROOMS.append(room(
    'reedmarsh-5', 'The Braided Line', 800, 520,
    [dict(id='w', side='W', at=260, to='reedmarsh-4', toDoor='n', label='Snapper Shallows'),
     dict(id='e', side='E', at=260, to='reedmarsh-6', toDoor='w', label='Lily Crossing')],
    'w', subtitle='Reedmarsh · 5',
    pits=[rect(250, 110, 300, 300)],
    bridges=[rect(345, 200, 110, 120, kind='island'), rect(220, 246, 128, 28, kind='dock')],
    refills=[rect(226, 100, 26, 320), rect(548, 100, 26, 320)],
    chest={'x': 400, 'y': 262, 'leash': 'braided'},
    props=[rect(110, 80, 40, 28, kind='stump'), rect(660, 410, 40, 30, kind='rock')],
    bread=[{'x': 120, 'y': 430}],
    lantern={'x': 440, 'y': 214},
    paths=[[[66, 260], [222, 260]], [[400, 420], [400, 470], [700, 470], [734, 260]]],
))

# 6 ---------------------------------------------------------------- Lily Crossing
PA, PB, PC = (500, 285), (790, 380), (1090, 330)
check_reach('lily: shore to A', (246, 320), PA, BRAIDED, need_braided=True)   # pit edge 240 + 6
check_reach('lily: A to B', (545, 300), PB, BRAIDED, need_braided=True)
check_reach('lily: B to far shore', (835, 370), PC, BRAIDED, need_braided=True)
bell6 = {'x': 1196, 'y': 180, 'r': 14}
ROOMS.append(room(
    'reedmarsh-6', 'Lily Crossing', 1280, 640,
    [dict(id='w', side='W', at=320, to='reedmarsh-5', toDoor='e', label='The Braided Line'),
     dict(id='e', side='E', at=320, to='END', toDoor='', gated=True, label='Deeper into Reedmarsh')],
    'w', subtitle='Reedmarsh · 6',
    gate=rect(1234, 274, 12, 92),
    pits=[rect(240, 20, 780, 600)],
    bridges=[rect(450, 240, 100, 90, kind='island'), rect(740, 335, 100, 90, kind='island')],
    refills=[rect(216, 20, 26, 600), rect(1018, 20, 26, 600)],
    posts=[post(*PA), post(*PB), post(*PC)],
    bell=bell6,
    props=[rect(100, 120, 40, 30, kind='rock'), rect(1120, 520, 56, 24, kind='log')],
    enemies=[frog(520, 310), frog(815, 400), snapper(1150, 450), frog(1150, 230)],
    bread=[{'x': 1190, 'y': 570}, {'x': 120, 'y': 540}],
    lantern={'x': 230, 'y': 300},
    paths=[[[66, 320], [216, 320]], [[1044, 330], [1214, 320]]],
    winText='Reedmarsh, part one: done. The Heron Ferryman waits deeper in the marsh.',
))

os.makedirs(OUT, exist_ok=True)
for r in ROOMS:
    with open(os.path.join(OUT, f"{r['id']}.json"), 'w') as f:
        json.dump(r, f, indent=1)
print('wrote', ', '.join(r['id'] for r in ROOMS))
