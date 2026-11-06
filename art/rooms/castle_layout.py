"""
Castle Honkmore: the gate and the first wing, the Grand Foyer (merge_areas.py stitches the wing into one area).

The castle is hard. Swan guards stand behind shields (cast from the side or behind, or yank one to spin it
round); bellhops ring for help and run; fire bars sweep the halls; stone goose statues slam down on anyone
walking under them. The Ballroom holds the Foyer's Royal Seal: the guards come in waves until the last falls.
  1 Honkmore Gate      the drawbridge over the moat, a fountain, the courtyard, the way into the Foyer
  2 Grand Foyer        checkered floor, a fire bar, shield turtles, a bellhop
  3 Hall of Portraits  slamming statues down the hall, a floor gone to the cellars (grapple across)
  4 The Ballroom       three fire bars and waves of guards; the Foyer Seal

Run: python3 art/rooms/castle_layout.py
"""
import json
import math
import os

from roomkit import BASE_LEASH, foe, post, rect, room

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, 'build')
CAST = BASE_LEASH * 1.7
ROOMS = []
K = lambda **kw: dict(biome='castle', lightKind='turtle', heavyKind='turtle', **kw)
turtle = lambda x, y: foe('turtle', x, y)
bellhop = lambda x, y: foe('bellhop', x, y)
pillar = lambda x, y, s=44: rect(x - s // 2, y - s // 2, s, s, kind='pillar')
fire = lambda x, y, n=6, speed=1.6, phase=0.0: {'x': x, 'y': y, 'n': n, 'speed': speed, 'phase': phase}
crusher = lambda x, y, s=64: {'x': x, 'y': y, 'w': s, 'h': s}


def cast(name, a, b):
    d = math.dist(a, b)
    assert d <= CAST - 8, f'{name}: {d:.0f} is beyond a {CAST:.0f} cast'


# 1 ---------------------------------------------------------------- Honkmore Gate
ROOMS.append(room(
    'castle-1', 'Honkmore Gate', 1280, 900,
    [dict(id='s', side='S', at=640, to='tide-3', toDoor='n', label='Moonlit Cove'),
     dict(id='w', side='W', at=360, to='castle-2', toDoor='e', label='The Grand Foyer'),
     dict(id='e', side='E', at=360, to='castle-5', toDoor='w', label='The Royal Kitchens'),
     dict(id='n', side='N', at=1060, to='castle-8', toDoor='s', label='The Lava Keep')],
    's', subtitle='Castle Honkmore · the gate', **K(),
    pits=[rect(20, 640, 1240, 120, kind='water')],                           # the moat
    bridges=[rect(596, 630, 88, 140, kind='dock')],                          # the drawbridge
    props=[pillar(380, 220, 56), pillar(900, 220, 56), pillar(380, 520, 56), pillar(900, 520, 56),
           rect(560, 60, 160, 70, kind='statue')],                         # the Swan Queen's statue
    refills=[rect(580, 330, 120, 90)],
    springs=[{'x': 640, 'y': 370}],                                          # the courtyard fountain
    enemies=[turtle(300, 360), turtle(1000, 360), bellhop(640, 520)],
    ferry={'x': 1060, 'y': 560, 'name': 'Honkmore Gate'},
    kits=[{'x': 1150, 'y': 160}],
    bread=[{'x': 160, 'y': 160}],
    lanterns=[{'x': 520, 'y': 600}, {'x': 760, 'y': 600}, {'x': 640, 'y': 160}],
    paths=[[[640, 834], [640, 420]], [[640, 300], [66, 360]], [[640, 300], [1214, 360]], [[640, 300], [1060, 200], [1060, 66]]],
    ventSpawns=False,
))

# 2 ---------------------------------------------------------------- Grand Foyer
ROOMS.append(room(
    'castle-2', 'Grand Foyer', 1200, 720,
    [dict(id='e', side='E', at=360, to='castle-1', toDoor='w', label='Honkmore Gate'),
     dict(id='w', side='W', at=360, to='castle-3', toDoor='e', label='Hall of Portraits')],
    'e', subtitle='Castle Honkmore · the Grand Foyer', **K(),
    props=[pillar(300, 160), pillar(300, 560), pillar(900, 160), pillar(900, 560), rect(520, 40, 160, 50, kind='statue')],
    firebars=[fire(600, 360, 7, 1.4)],
    enemies=[turtle(380, 300), turtle(860, 470), bellhop(600, 160)],
    vents=[{'x': 120, 'y': 120}, {'x': 1080, 'y': 600}],
    refills=[rect(1060, 90, 100, 80)], springs=[{'x': 1110, 'y': 120}],
    glass=[{'x': 160, 'y': 620}],
    lanterns=[{'x': 300, 'y': 360}, {'x': 900, 'y': 360}],
    carpets=[rect(80, 320, 1040, 80)],
    paths=[],
))

# 3 ---------------------------------------------------------------- Hall of Portraits
P1, P2, P3 = (430, 320), (700, 300), (980, 320)
cast('portraits: east floor to the pillar', (1000, 320), P2)
cast('portraits: pillar to the west floor', (680, 320), P1)
cast('portraits: west floor back to the pillar', (420, 320), P2)
cast('portraits: pillar back to the east floor', (720, 300), P3)
ROOMS.append(room(
    'castle-3', 'Hall of Portraits', 1400, 640,
    [dict(id='e', side='E', at=320, to='castle-2', toDoor='w', label='Grand Foyer'),
     dict(id='w', side='W', at=320, to='castle-4', toDoor='e', label='The Ballroom')],
    'e', subtitle='Castle Honkmore · the Hall of Portraits', **K(),
    pits=[rect(520, 20, 360, 600, kind='ravine')],                            # the floor fell into the cellars
    bridges=[rect(660, 250, 80, 100, kind='pillar')],
    posts=[post(*P1), post(*P2), post(*P3)],
    crushers=[crusher(1180, 200), crusher(1180, 440), crusher(1040, 120), crusher(1040, 520), crusher(300, 220), crusher(200, 420)],
    enemies=[turtle(1120, 320), bellhop(240, 160), turtle(260, 520)],
    refills=[rect(60, 520, 100, 80)], springs=[{'x': 110, 'y': 550}],
    kits=[{'x': 380, 'y': 560}],
    lanterns=[{'x': 1300, 'y': 320}, {'x': 120, 'y': 320}],
    carpets=[rect(880, 290, 500, 60), rect(20, 290, 500, 60)],
    paths=[],
))

# 4 ---------------------------------------------------------------- The Ballroom
ROOMS.append(room(
    'castle-4', 'The Ballroom', 1200, 800,
    [dict(id='e', side='E', at=400, to='castle-3', toDoor='w', label='Hall of Portraits')],
    'e', subtitle='Castle Honkmore · the Ballroom', **K(),
    props=[pillar(200, 160), pillar(200, 640), pillar(1000, 160), pillar(1000, 640)],
    firebars=[fire(420, 400, 6, 1.2), fire(780, 400, 6, -1.2, 1.57), fire(600, 220, 5, 1.8)],
    vents=[{'x': 120, 'y': 400}, {'x': 600, 'y': 90}, {'x': 600, 'y': 710}, {'x': 300, 'y': 700}],
    waves={'kinds': ['turtle', 'bellhop', 'turtle', 'turtle'], 'count': 9, 'alive': 3, 'every': 2.6, 'seal': 'foyer', 'zone': 'The Ballroom'},
    refills=[rect(1080, 640, 90, 80)], springs=[{'x': 1120, 'y': 670}],
    bread=[{'x': 1100, 'y': 160}],
    lanterns=[{'x': 600, 'y': 400}, {'x': 300, 'y': 400}, {'x': 900, 'y': 400}],
    carpets=[rect(80, 360, 1040, 80), rect(560, 80, 80, 640)],
    ventSpawns=False,
    paths=[],
))

# ================================================================ the Royal Kitchens (east wing)
mimic = lambda x, y: foe('mimic', x, y)
steam = lambda x, y, period=3.2, phase=0.0: {'x': x, 'y': y, 'period': period, 'phase': phase}
counter = lambda x, y, w, h: rect(x, y, w, h, kind='counter')

# 5 ---------------------------------------------------------------- The Scullery
ROOMS.append(room(
    'castle-5', 'The Scullery', 1200, 720,
    [dict(id='w', side='W', at=360, to='castle-1', toDoor='e', label='Honkmore Gate'),
     dict(id='e', side='E', at=360, to='castle-6', toDoor='w', label='The Great Kitchen')],
    'w', subtitle='Castle Honkmore · the Royal Kitchens', **K(),
    props=[counter(260, 120, 200, 50), counter(260, 550, 200, 50), counter(760, 120, 220, 50), counter(760, 550, 220, 50)],
    pits=[rect(560, 90, 90, 60, kind='water'), rect(560, 570, 90, 60, kind='water')],     # the big sinks
    refills=[rect(540, 70, 130, 100), rect(540, 550, 130, 100)],
    grease=[rect(300, 260, 240, 200), rect(700, 300, 280, 140)],
    enemies=[mimic(380, 380), mimic(860, 220), mimic(1000, 520), turtle(840, 380), bellhop(300, 640)],
    bread=[{'x': 160, 'y': 200}, {'x': 1060, 'y': 180}],
    lanterns=[{'x': 600, 'y': 360}],
    tiles=True, paths=[],
))

# 6 ---------------------------------------------------------------- The Great Kitchen
ROOMS.append(room(
    'castle-6', 'The Great Kitchen', 1400, 760,
    [dict(id='w', side='W', at=360, to='castle-5', toDoor='e', label='The Scullery'),
     dict(id='e', side='E', at=360, to='castle-7', toDoor='w', label='The Royal Pantry')],
    'w', subtitle='Castle Honkmore · the Royal Kitchens', **K(),
    props=[counter(220, 80, 160, 60), counter(220, 620, 160, 60), counter(1020, 80, 160, 60), counter(1020, 620, 160, 60), counter(600, 520, 200, 50)],
    steam=[steam(420, 240, 3.0, 0.0), steam(420, 480, 3.0, 1.5), steam(700, 220, 2.6, 0.8), steam(980, 240, 3.0, 2.2), steam(980, 480, 3.0, 0.7), steam(700, 420, 2.6, 2.0)],
    firebars=[fire(700, 640, 5, 1.5)],                                        # the rotisserie
    grease=[rect(520, 300, 360, 80)],
    enemies=[mimic(300, 360), mimic(1120, 360), turtle(560, 160), turtle(860, 560), bellhop(1200, 180)],
    refills=[rect(80, 640, 90, 80)], springs=[{'x': 120, 'y': 670}],
    kits=[{'x': 1300, 'y': 640}],
    bread=[{'x': 700, 'y': 120}],
    lanterns=[{'x': 300, 'y': 360}, {'x': 1100, 'y': 360}],
    tiles=True, paths=[],
))

# 7 ---------------------------------------------------------------- The Royal Pantry (boss)
ROOMS.append(room(
    'castle-7', 'The Royal Pantry', 1200, 800,
    [dict(id='w', side='W', at=400, to='castle-6', toDoor='e', label='The Great Kitchen')],
    'w', subtitle='Castle Honkmore · the Pelican Chef', **K(),
    props=[counter(140, 80, 260, 50), counter(800, 80, 260, 50), counter(140, 670, 260, 50), counter(800, 670, 260, 50)],
    steam=[steam(360, 260, 3.4, 0.0), steam(840, 260, 3.4, 1.7), steam(360, 540, 3.4, 1.1), steam(840, 540, 3.4, 2.6)],
    grease=[rect(500, 330, 200, 140)],
    enemies=[foe('pelican', 760, 400)],
    boss='pelican', ventSpawns=False,
    vents=[{'x': 600, 'y': 120}, {'x': 600, 'y': 690}],
    refills=[rect(1080, 360, 90, 80)], springs=[{'x': 1120, 'y': 390}],
    lanterns=[{'x': 600, 'y': 400}, {'x': 300, 'y': 400}, {'x': 900, 'y': 400}],
    tiles=True, paths=[],
))

# ================================================================ the Lava Keep (north wing)
lava = lambda x, y, w, h: rect(x, y, w, h, kind='lava')
ember = lambda x, y, period=2.6, phase=0.0: {'x': x, 'y': y, 'period': period, 'phase': phase}

# 8 ---------------------------------------------------------------- The Lava Bridges
B1, B2, B3, B4 = (300, 250), (560, 330), (820, 250), (1080, 330)
cast('bridges: landing to the first chain', (200, 520), B1)
for a, b in ((B1, B2), (B2, B3), (B3, B4)):
    cast('bridges: chain to chain', a, b); cast('bridges: back', b, a)
ROOMS.append(room(
    'castle-8', 'The Lava Bridges', 1300, 720,
    [dict(id='s', side='S', at=200, to='castle-1', toDoor='n', label='Honkmore Gate'),
     dict(id='e', side='E', at=330, to='castle-9', toDoor='w', label='The Forge')],
    's', subtitle='Castle Honkmore · the Lava Keep', **K(),
    pits=[lava(380, 20, 640, 680)],
    bridges=[rect(510, 280, 100, 100, kind='pillar'), rect(770, 200, 100, 100, kind='pillar')],
    posts=[post(*B1), post(*B2), post(*B3), post(*B4)],
    embers=[ember(450, 120, 2.4, 0), ember(700, 480, 2.4, 0.8), ember(950, 140, 2.4, 1.6), ember(650, 640, 3, 0.4)],
    enemies=[turtle(1180, 560), bellhop(1180, 150)],
    refills=[rect(60, 80, 100, 80)], springs=[{'x': 110, 'y': 110}],
    kits=[{'x': 140, 'y': 640}],
    lanterns=[{'x': 250, 'y': 420}, {'x': 1150, 'y': 420}],
    paths=[],
))

# 9 ---------------------------------------------------------------- The Forge
ROOMS.append(room(
    'castle-9', 'The Forge', 1300, 760,
    [dict(id='w', side='W', at=330, to='castle-8', toDoor='e', label='The Lava Bridges'),
     dict(id='e', side='E', at=380, to='castle-10', toDoor='w', label='The Keep Tower')],
    'w', subtitle='Castle Honkmore · the Lava Keep', **K(),
    pits=[lava(340, 80, 140, 220), lava(340, 460, 140, 220), lava(820, 80, 140, 220), lava(820, 460, 140, 220)],
    firebars=[fire(640, 380, 8, 1.3), fire(400, 380, 4, -2.2), fire(890, 380, 4, 2.2)],
    crushers=[crusher(600, 120), crusher(600, 580)],
    embers=[ember(410, 190, 2.8, 0.5), ember(890, 570, 2.8, 1.9)],
    enemies=[turtle(220, 200), turtle(1100, 560), bellhop(1120, 160), mimic(200, 600)],
    chest={'x': 1180, 'y': 680, 'leash': 'golden'},
    bread=[{'x': 160, 'y': 600}],
    refills=[rect(60, 640, 90, 80)], springs=[{'x': 100, 'y': 670}],
    lanterns=[{'x': 640, 'y': 250}, {'x': 640, 'y': 520}],
    paths=[],
))

# 10 --------------------------------------------------------------- The Keep Tower (boss)
ROOMS.append(room(
    'castle-10', 'The Keep Tower', 1200, 900,
    [dict(id='w', side='W', at=450, to='castle-9', toDoor='e', label='The Forge')],
    'w', subtitle='Castle Honkmore · the Black Swan', **K(),
    pits=[lava(20, 20, 1160, 110), lava(20, 770, 1160, 110), lava(1060, 20, 120, 860)],          # the tower floor, ringed by lava
    props=[pillar(300, 260), pillar(900, 260), pillar(300, 640), pillar(900, 640)],
    embers=[ember(200, 70, 2.2, 0), ember(800, 830, 2.2, 1.1), ember(1120, 450, 2.2, 0.6)],
    enemies=[foe('blackswan', 700, 450)],
    boss='blackswan', ventSpawns=False,
    refills=[rect(80, 400, 80, 90)], springs=[{'x': 120, 'y': 430}],
    lanterns=[{'x': 600, 'y': 450}, {'x': 300, 'y': 450}, {'x': 900, 'y': 450}],
    carpets=[rect(160, 420, 900, 60)],
    paths=[],
))

os.makedirs(OUT, exist_ok=True)
for r in ROOMS:
    with open(os.path.join(OUT, f"{r['id']}.json"), 'w') as f:
        json.dump(r, f, indent=1)
print('wrote', ', '.join(r['id'] for r in ROOMS))
