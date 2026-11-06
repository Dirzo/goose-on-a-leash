"""
The Tide Caves: three rooms (merge_areas.py stitches them into two areas).

A short fight through the caves to a moonlit beach, and then fishing. Eels hide in the tide pools and
lunge at the pack when Rocco walks by; cast Biscuit at one while it's up and yank it out onto the rocks.
  1 Tidepool Steps  pools full of eels, crabs on the ledges, a dripping spring
  2 Echo Grotto     a channel the eels line both sides of; honk the bell to open the way to the beach
  3 Moonlit Cove    the fishing grounds: the Shore, the Jetty, and the Far Rock (grapple out via the buoy).
                    Sprat, mackerel, sea bass, grouper, then the Moray Twins in the trench off the Far Rock.
                    Land both twins for the Moray Pearl; the way north opens.

Run: python3 art/rooms/tide_layout.py
"""
import json
import math
import os

from roomkit import BASE_LEASH, foe, post, rect, room

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, 'build')
CAST = BASE_LEASH * 1.7
ROOMS = []
T = lambda **kw: dict(biome='tide', lightKind='crab', heavyKind='crab', **kw)
crab = lambda x, y: foe('crab', x, y)
eel = lambda x, y: foe('eel', x, y)
rock = lambda x, y, w=56, h=44: rect(x - w // 2, y - h // 2, w, h, kind='rock')
pool = lambda x, y, w=90, h=60: rect(x - w // 2, y - h // 2, w, h, kind='water')


def cast(name, a, b):
    d = math.dist(a, b)
    assert d <= CAST - 8, f'{name}: {d:.0f} is beyond a {CAST:.0f} cast'
    return d


# 1 ---------------------------------------------------------------- Tidepool Steps
ROOMS.append(room(
    'tide-1', 'Tidepool Steps', 1200, 640,
    [dict(id='w', side='W', at=380, to='driftwood-6', toDoor='e', label='The Rusty Gull'),
     dict(id='e', side='E', at=320, to='tide-2', toDoor='w', label='Echo Grotto')],
    'w', subtitle='The Tide Caves · 1', **T(),
    pits=[pool(300, 230), pool(520, 470, 110, 70), pool(760, 210), pool(980, 470, 100, 64)],
    props=[rock(200, 120, 90, 60), rock(420, 140), rock(640, 560, 80, 50), rock(860, 110, 100, 60), rock(1080, 180), rock(1120, 560, 80, 60)],
    enemies=[eel(300, 230), eel(520, 470), eel(760, 210), eel(980, 470), crab(640, 330), crab(900, 330)],
    refills=[rect(130, 470, 110, 80)],
    springs=[{'x': 185, 'y': 500}],
    glass=[{'x': 620, 'y': 160}, {'x': 1080, 'y': 380}],
    bread=[{'x': 420, 'y': 380}],
    lantern={'x': 640, 'y': 300},
    paths=[[[66, 380], [400, 340], [640, 330], [900, 330], [1134, 320]]],
))

# 2 ---------------------------------------------------------------- Echo Grotto
ROOMS.append(room(
    'tide-2', 'Echo Grotto', 1120, 640,
    [dict(id='w', side='W', at=320, to='tide-1', toDoor='e', label='Tidepool Steps'),
     dict(id='e', side='E', at=320, to='tide-3', toDoor='w', gated=True, label='Moonlit Cove')],
    'w', subtitle='The Tide Caves · 2', **T(),
    gate=rect(1074, 274, 12, 92),
    bell={'x': 940, 'y': 520, 'r': 14},
    pits=[rect(200, 220, 700, 50, kind='water'), rect(200, 380, 700, 50, kind='water')],
    props=[rock(160, 120, 100, 70), rock(500, 110, 120, 70), rock(820, 120, 100, 70), rock(300, 540, 120, 60), rock(640, 540, 100, 60)],
    enemies=[eel(320, 245), eel(560, 245), eel(800, 245), eel(440, 405), eel(700, 405), crab(980, 200)],
    kits=[{'x': 1000, 'y': 140}],
    refills=[rect(60, 480, 100, 80)],
    springs=[{'x': 110, 'y': 510}],
    glass=[{'x': 860, 'y': 470}],
    paths=[[[66, 320], [1054, 320]]],
))

# 3 ---------------------------------------------------------------- Moonlit Cove (fishing)
SHORE_POST, BUOY, FAR = (700, 420), (1060, 420), (1310, 250)
cast('shore to the buoy', (770, 420), BUOY)
cast('buoy to the Far Rock', (1080, 410), FAR)
cast('back: Far Rock to the buoy', (1290, 270), BUOY)
cast('back: buoy to the shore', (1040, 420), SHORE_POST)
ROOMS.append(room(
    'tide-3', 'Moonlit Cove', 1600, 900,
    [dict(id='w', side='W', at=320, to='tide-2', toDoor='e', label='Echo Grotto'),
     dict(id='n', side='N', at=520, to='castle-1', toDoor='s', gated=True, label='Castle Honkmore')],
    'w', subtitle='The Tide Caves · Moonlit Cove', **T(),
    gate=rect(478, 30, 84, 12),
    pits=[rect(760, 20, 820, 860, kind='water')],
    bridges=[rect(760, 600, 250, 50, kind='dock'), rect(1030, 386, 64, 64, kind='island'), rect(1240, 200, 130, 110, kind='island')],
    posts=[post(*SHORE_POST), post(*BUOY), post(*FAR)],
    props=[rock(200, 140, 110, 70), rock(140, 720, 120, 80), rock(560, 820, 140, 60), rock(380, 110, 90, 50)],
    enemies=[crab(420, 420), crab(520, 640)],
    refills=[rect(240, 230, 120, 90)],
    springs=[{'x': 300, 'y': 260}],
    fishing={'spots': [{'x': 744, 'y': 300, 'name': 'The Shore'}, {'x': 990, 'y': 625, 'name': 'The Jetty'},
                       {'x': 1286, 'y': 282, 'name': 'The Far Rock', 'deep': True}],
             'water': {'x': 760, 'y': 20, 'w': 820, 'h': 860},
             'trench': {'x': 1400, 'y': 120, 'w': 170, 'h': 360}},
    ferry={'x': 330, 'y': 560, 'name': 'Moonlit Cove'},
    kits=[{'x': 640, 'y': 160}],
    bread=[{'x': 250, 'y': 420}],
    lanterns=[{'x': 700, 'y': 520}, {'x': 450, 'y': 300}],
    ventSpawns=False,
    paths=[[[66, 320], [400, 330], [700, 420]], [[520, 70], [520, 330]], [[700, 420], [760, 625]]],
    winText='The Moray Pearl! Bimbo glows like a little moon. The way north opens: Castle Honkmore.',
))

os.makedirs(OUT, exist_ok=True)
for r in ROOMS:
    with open(os.path.join(OUT, f"{r['id']}.json"), 'w') as f:
        json.dump(r, f, indent=1)
print('wrote', ', '.join(r['id'] for r in ROOMS))
