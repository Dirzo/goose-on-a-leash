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
  7 Leaky Boardwalk  a long zigzag boardwalk; frogs leap at Bimbo from little islands alongside
  8 Twine Thicket    a maze of reed walls; burrows keep coming; twine and a sewing kit in the nooks
  9 Snapper Run      a corridor between two waters with three Snappers: bait their charges into the water
 10 Bell Islands     the bell sits on an island out of honk range from every shore; hop out to ring it
 11 Heron's Approach a broken boardwalk: fling-yank over each gap while frogs leap from islands
 12 Ferryman's Pool  boss: the Heron Ferryman on his rock in deep water

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


POST_CLEARANCE = 130   # no critter starts this close to a grappling post (landing must be safe)


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
    grapple_snapper = kw.pop('grapple_snapper', False)
    r.update(kw)
    for e in r['enemies']:
        if e['kind'] == 'snapper' and grapple_snapper: continue   # Snapper Shallows: he IS the grapple
        for p in r['posts']:
            d = math.dist((e['x'], e['y']), (p['x'], p['y']))
            assert d >= POST_CLEARANCE, f"{id}: {e['kind']} at {e['x']},{e['y']} is {d:.0f} from a post"
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
    spools=[{'x': 860, 'y': 180}],
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
    enemies=[frog(150, 140), frog(160, 500), frog(1110, 180), frog(1130, 460)],
    bread=[{'x': 630, 'y': 372}, {'x': 120, 'y': 120}],
    kits=[{'x': 1180, 'y': 540}], spools=[{'x': 110, 'y': 400}],
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
    spools=[{'x': 300, 'y': 540}, {'x': 850, 'y': 430}],
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
    kits=[{'x': 1000, 'y': 110}], spools=[{'x': 180, 'y': 540}],
    grapple_snapper=True,
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
    kits=[{'x': 372, 'y': 300}], spools=[{'x': 690, 'y': 120}],
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
     dict(id='e', side='E', at=320, to='reedmarsh-7', toDoor='w', gated=True, label='Leaky Boardwalk')],
    'w', subtitle='Reedmarsh · 6',
    gate=rect(1234, 274, 12, 92),
    pits=[rect(240, 20, 780, 600)],
    bridges=[rect(450, 240, 100, 90, kind='island'), rect(740, 335, 100, 90, kind='island')],
    refills=[rect(216, 20, 26, 600), rect(1018, 20, 26, 600)],
    posts=[post(*PA), post(*PB), post(*PC)],
    bell=bell6,
    props=[rect(100, 120, 40, 30, kind='rock'), rect(1120, 520, 56, 24, kind='log')],
    enemies=[frog(120, 180), snapper(1170, 510), frog(1180, 140)],
    bread=[{'x': 1190, 'y': 570}, {'x': 120, 'y': 540}],
    spools=[{'x': 130, 'y': 440}],
    lantern={'x': 230, 'y': 300},
    paths=[[[66, 320], [216, 320]], [[1044, 330], [1214, 320]]],
))

# 7 ---------------------------------------------------------------- Leaky Boardwalk
ROOMS.append(room(
    'reedmarsh-7', 'Leaky Boardwalk', 1280, 640,
    [dict(id='w', side='W', at=320, to='reedmarsh-6', toDoor='e', label='Lily Crossing'),
     dict(id='e', side='E', at=215, to='reedmarsh-8', toDoor='w', label='Twine Thicket')],
    'w', subtitle='Reedmarsh · 7',
    pits=[rect(200, 20, 880, 600)],
    bridges=[rect(196, 300, 330, 30, kind='dock'), rect(496, 100, 30, 230, kind='dock'), rect(496, 100, 330, 30, kind='dock'),
             rect(796, 100, 30, 420, kind='dock'), rect(796, 490, 288, 30, kind='dock'),
             rect(600, 190, 80, 70, kind='island'), rect(330, 420, 80, 70, kind='island'), rect(900, 280, 80, 70, kind='island'),
             rect(640, 410, 70, 60, kind='island')],
    refills=[rect(176, 20, 26, 600), rect(1078, 20, 26, 600)],
    props=[rect(1160, 120, 40, 30, kind='rock'), rect(80, 520, 56, 24, kind='log')],
    enemies=[frog(640, 225), frog(370, 455), frog(940, 315), frog(675, 440)],
    bread=[{'x': 1150, 'y': 580}],
    spools=[{'x': 660, 'y': 115}, {'x': 811, 'y': 300}],
    lantern={'x': 1110, 'y': 470},
    paths=[[[66, 320], [196, 315]], [[1084, 505], [1180, 505], [1180, 215], [1214, 215]]],
))

# 8 ---------------------------------------------------------------- Twine Thicket
ROOMS.append(room(
    'reedmarsh-8', 'Twine Thicket', 960, 640,
    [dict(id='w', side='W', at=320, to='reedmarsh-7', toDoor='e', label='Leaky Boardwalk'),
     dict(id='n', side='N', at=800, to='reedmarsh-9', toDoor='w', label='Snapper Run')],
    'w', subtitle='Reedmarsh · 8',
    pits=[rect(440, 450, 110, 110), rect(40, 470, 100, 100)],
    refills=[rect(420, 430, 150, 22), rect(30, 450, 120, 22)],
    props=[rect(180, 20, 40, 380, kind='reeds'), rect(380, 240, 40, 380, kind='reeds'), rect(580, 20, 40, 420, kind='reeds'),
           rect(740, 200, 200, 40, kind='reeds'), rect(250, 120, 40, 28, kind='stump')],
    vents=[{'x': 300, 'y': 120}, {'x': 500, 'y': 580}, {'x': 860, 'y': 520}],
    enemies=[frog(300, 500), frog(480, 150), frog(700, 400), frog(860, 320)],
    bread=[{'x': 690, 'y': 560}],
    kits=[{'x': 900, 'y': 580}], spools=[{'x': 100, 'y': 80}, {'x': 300, 'y': 590}, {'x': 680, 'y': 100}],
    lantern={'x': 700, 'y': 300},
    paths=[[[66, 320], [140, 320], [140, 430], [300, 430], [300, 180], [500, 180], [500, 400], [700, 470], [700, 120], [800, 70]]],
))

# 9 ---------------------------------------------------------------- Snapper Run
check_reach('snapper run: escape post', (425, 190), (425, 80), BASE_LEASH)
ROOMS.append(room(
    'reedmarsh-9', 'Snapper Run', 1280, 560,
    [dict(id='w', side='W', at=280, to='reedmarsh-8', toDoor='n', label='Twine Thicket'),
     dict(id='e', side='E', at=280, to='reedmarsh-10', toDoor='w', label='Bell Islands')],
    'w', subtitle='Reedmarsh · 9',
    pits=[rect(20, 20, 1240, 150), rect(20, 390, 1240, 150)],
    bridges=[rect(380, 40, 90, 80, kind='island'), rect(820, 40, 90, 80, kind='island')],
    refills=[rect(20, 168, 1240, 22), rect(20, 370, 1240, 22)],
    posts=[post(425, 80), post(865, 80)],
    props=[rect(300, 220, 40, 30, kind='rock'), rect(700, 300, 40, 28, kind='stump'), rect(1000, 200, 56, 24, kind='log')],
    enemies=[snapper(520, 280), snapper(900, 330), snapper(1100, 230)],
    bread=[{'x': 760, 'y': 360}],
    kits=[{'x': 640, 'y': 200}], spools=[{'x': 180, 'y': 350}],
    lantern={'x': 640, 'y': 190},
    paths=[[[66, 280], [1214, 280]]],
))

# 10 --------------------------------------------------------------- Bell Islands
bell10 = {'x': 670, 'y': 320, 'r': 14}
HONK = 178 + 14 + 30
check_reach('bell islands: honk from island 1', (505, 265), (bell10['x'], bell10['y']), HONK)
for shore in [(670, 54), (670, 586), (294, 320), (906, 320)]:
    assert math.dist(shore, (bell10['x'], bell10['y'])) > HONK, f'bell reachable from shore {shore}'
check_reach('bell islands: shore to island 1', (294, 300), (465, 255), BASE_LEASH)
check_reach('bell islands: island 1 to island 2', (505, 270), (715, 350), BRAIDED)
check_reach('bell islands: island 2 to far shore', (735, 340), (950, 330), BASE_LEASH)
check_reach('bell islands: back to the near shore', (425, 250), (250, 300), BASE_LEASH)
ROOMS.append(room(
    'reedmarsh-10', 'Bell Islands', 1120, 640,
    [dict(id='w', side='W', at=320, to='reedmarsh-9', toDoor='e', label='Snapper Run'),
     dict(id='e', side='E', at=320, to='reedmarsh-11', toDoor='w', gated=True, label="Heron's Approach")],
    'w', subtitle='Reedmarsh · 10',
    gate=rect(1074, 274, 12, 92),
    pits=[rect(300, 60, 600, 520)],
    bridges=[rect(420, 210, 90, 90, kind='island'), rect(620, 290, 120, 100, kind='island')],
    refills=[rect(276, 60, 26, 520), rect(898, 60, 26, 520)],
    posts=[post(465, 255), post(250, 300), post(715, 350), post(950, 330)],
    bell=bell10,
    props=[rect(120, 220, 40, 30, kind='rock'), rect(980, 560, 56, 24, kind='log')],
    enemies=[frog(150, 150), frog(150, 500), frog(1000, 180), frog(1010, 470)],
    bread=[{'x': 1000, 'y': 330}],
    spools=[{'x': 120, 'y': 330}],
    lantern={'x': 260, 'y': 250},
    paths=[[[66, 320], [276, 310]], [[924, 330], [1054, 320]]],
))

# 11 --------------------------------------------------------------- Heron's Approach
check_reach('approach: gap 1', (414, 305), (600, 305), BASE_LEASH)
check_reach('approach: gap 2', (754, 305), (940, 305), BASE_LEASH)
ROOMS.append(room(
    'reedmarsh-11', "Heron's Approach", 1280, 640,
    [dict(id='w', side='W', at=305, to='reedmarsh-10', toDoor='e', label='Bell Islands'),
     dict(id='e', side='E', at=305, to='reedmarsh-12', toDoor='w', label="The Ferryman's Pool")],
    'w', subtitle='Reedmarsh · 11',
    pits=[rect(200, 20, 880, 600)],
    bridges=[rect(196, 290, 224, 30, kind='dock'), rect(560, 290, 200, 30, kind='dock'), rect(900, 290, 184, 30, kind='dock'),
             rect(440, 150, 80, 70, kind='island'), rect(800, 410, 80, 70, kind='island'), rect(640, 430, 80, 70, kind='island')],
    refills=[rect(176, 20, 26, 600), rect(1078, 20, 26, 600)],
    posts=[post(600, 305), post(940, 305)],
    props=[rect(1160, 520, 40, 30, kind='rock'), rect(80, 140, 40, 28, kind='stump')],
    enemies=[frog(480, 185), frog(840, 445), frog(680, 465)],
    bread=[{'x': 1200, 'y': 560}],
    kits=[{'x': 1150, 'y': 200}], spools=[{'x': 1150, 'y': 420}, {'x': 1210, 'y': 300}],
    lantern={'x': 1120, 'y': 280},
    paths=[[[66, 305], [196, 305]], [[1084, 305], [1214, 305]]],
))

# 12 --------------------------------------------------------------- The Ferryman's Pool (boss)
check_reach('pool: fling at the Heron from the west bank', (374, 350), (605 - 35, 360), BRAIDED)
for pt in [(340, 350), (870, 350), (605, 80), (605, 620)]:
    check_reach(f'pool: island to shore post {pt}', (605, 350), pt, BRAIDED + 20)
ROOMS.append(room(
    'reedmarsh-12', "The Ferryman's Pool", 1120, 700,
    [dict(id='w', side='W', at=350, to='reedmarsh-11', toDoor='e', label="Heron's Approach"),
     dict(id='e', side='E', at=350, to='END', toDoor='', gated=True, label='Hollowbark Woods')],
    'w', subtitle='Reedmarsh · the Ferryman',
    gate=rect(1074, 304, 12, 92),
    pits=[rect(380, 120, 450, 460)],
    bridges=[rect(560, 310, 90, 80, kind='island')],
    refills=[rect(356, 96, 498, 26), rect(356, 578, 498, 26), rect(356, 96, 26, 508), rect(828, 96, 26, 508)],
    posts=[post(340, 350), post(870, 350), post(605, 80), post(605, 620)],
    props=[rect(150, 200, 40, 30, kind='rock'), rect(950, 470, 56, 24, kind='log')],
    vents=[{'x': 200, 'y': 150}, {'x': 200, 'y': 560}, {'x': 960, 'y': 150}, {'x': 960, 'y': 560}],
    enemies=[{'kind': 'heron', 'x': 605, 'y': 360}],
    boss='heron', ventSpawns=False,
    bread=[{'x': 960, 'y': 350}, {'x': 140, 'y': 480}],
    kits=[{'x': 140, 'y': 620}], spools=[{'x': 980, 'y': 80}, {'x': 140, 'y': 80}],
    lantern={'x': 330, 'y': 300},
    paths=[[[66, 350], [356, 350]], [[854, 350], [1054, 350]]],
    winText='Reedmarsh cleared! The Heron Ferryman will carry you on to Hollowbark Woods.',
))

os.makedirs(OUT, exist_ok=True)
for r in ROOMS:
    with open(os.path.join(OUT, f"{r['id']}.json"), 'w') as f:
        json.dump(r, f, indent=1)
print('wrote', ', '.join(r['id'] for r in ROOMS))
