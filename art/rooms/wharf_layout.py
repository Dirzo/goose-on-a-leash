"""
Driftwood Wharf: six rooms authored in code, written to art/rooms/build/driftwood-N.json
(merge_areas.py stitches them into four areas).

Salt water everywhere and none of it is any good to Bimbo: the pack refills only at rain cisterns and
the hub's freshwater pump. Gulls dive at the pack and fly off with whatever they grab (bite them or
honk to make them drop it); crabs raise their claws to block a cast, so cast between snaps.
Sea glass washes up on the beaches: Pickett the otter trades it at his tackle shop.
  1 Saltgrass Dunes  crabs on the beach, the sea along the south, cisterns, sea glass
  2 Gull Rookery     the first gulls; honk the bell on the rocks to open the way
  3 Driftwood Wharf  hub: Pickett's Tackle (the Spinning Reel), the pump, a ferry stop, a jetty;
                     a Golden Feather on a sandbar only the Spinning Reel's line reaches
  4 Net Lofts        cross open sea on mast hooks: long casts, the last one wants a perfect cast
  5 Bilge Docks      crates, channels, crabs and gulls, a kit and a ferry stop before the boss
  6 The Rusty Gull   boss: Captain Gullbeard, on the deck of his ship. Masts are his perches

Reach: a cast runs out castMul x the leash (sim castMax). Checked against the starting line.

Run: python3 art/rooms/wharf_layout.py
"""
import json
import math
import os

from roomkit import BASE_LEASH, foe, post, rect, room

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, 'build')
CAST_MUL, REEL_MUL = 1.7, 2.2          # config castReachMul, and with the Spinning Reel (+ reelReach)
CAST = BASE_LEASH * CAST_MUL           # 391: a perfect cast on the starting line
NOT_PERFECT = 50 + (CAST - 50) * 0.859 ** 0.75   # the furthest a cast goes released just under the sweet spot
REEL = BASE_LEASH * REEL_MUL           # 506
VINE_PERFECT = (BASE_LEASH + 50) * CAST_MUL     # 476: the Vine Lash, perfect cast, no reel
ROOMS = []
D = lambda **kw: dict(biome='wharf', lightKind='crab', heavyKind='crab', **kw)
crab = lambda x, y: foe('crab', x, y)
gull = lambda x, y: foe('gull', x, y)
crate = lambda x, y, w=40, h=36: rect(x, y, w, h, kind='crate')
rock = lambda x, y: rect(x - 22, y - 18, 44, 36, kind='rock')
log = lambda x, y, w=90: rect(x, y, w, 16, kind='log')


def cast(name, a, b, reach=CAST, needs_more_than=None):
    d = math.dist(a, b)
    assert d <= reach - 8, f'{name}: {d:.0f} is beyond a {reach:.0f} cast'
    if needs_more_than is not None:
        assert d > needs_more_than, f'{name}: {d:.0f} is reachable within {needs_more_than:.0f}'
    return d


# 1 ---------------------------------------------------------------- Saltgrass Dunes
ROOMS.append(room(
    'driftwood-1', 'Saltgrass Dunes', 1200, 640,
    [dict(id='w', side='W', at=320, to='hollowbark-8', toDoor='e', label='The Hollow'),
     dict(id='e', side='E', at=320, to='driftwood-2', toDoor='w', label='Gull Rookery')],
    'w', subtitle='Driftwood Wharf · 1', **D(),
    pits=[rect(20, 520, 1160, 100, kind='water')],              # the sea: salt, no good for the pack
    props=[log(300, 180), log(760, 470, 110), crate(980, 120), crate(1022, 128, 34, 30), rock(560, 140)],
    enemies=[crab(420, 260), crab(720, 400), crab(960, 240)],
    barrels=[{'x': 220, 'y': 450}, {'x': 860, 'y': 160}],
    glass=[{'x': 540, 'y': 490}, {'x': 900, 'y': 500}, {'x': 1120, 'y': 470}],
    bread=[{'x': 640, 'y': 230}],
    vents=[{'x': 640, 'y': 500}],
    lantern={'x': 610, 'y': 300},
    paths=[[[66, 320], [400, 330], [800, 300], [1134, 320]]],
))

# 2 ---------------------------------------------------------------- Gull Rookery
bell2 = {'x': 960, 'y': 130, 'r': 14}
ROOMS.append(room(
    'driftwood-2', 'Gull Rookery', 1120, 640,
    [dict(id='w', side='W', at=320, to='driftwood-1', toDoor='e', label='Saltgrass Dunes'),
     dict(id='e', side='E', at=320, to='driftwood-3', toDoor='w', gated=True, label='Driftwood Wharf')],
    'w', subtitle='Driftwood Wharf · 2', **D(),
    gate=rect(1074, 274, 12, 92),
    bell=bell2,
    pits=[rect(560, 500, 540, 120, kind='water')],
    props=[rock(300, 150), rock(380, 470), rock(620, 230), rock(820, 420), rock(980, 200), crate(160, 520)],
    enemies=[gull(420, 260), gull(700, 380), gull(860, 200), crab(300, 330)],
    barrels=[{'x': 200, 'y': 200}],
    kits=[{'x': 760, 'y': 140}],
    glass=[{'x': 640, 'y': 470}, {'x': 480, 'y': 560}],
    spools=[{'x': 1000, 'y': 470}],
    paths=[[[66, 320], [500, 340], [800, 300], [1054, 320]]],
))

# 3 ---------------------------------------------------------------- Driftwood Wharf (hub)
JETTY_END, SANDBAR = (660, 770), (1152, 720)
cast('sandbar needs the reel (jetty end)', JETTY_END, SANDBAR, REEL, needs_more_than=VINE_PERFECT)
cast('sandbar needs the reel (jetty side)', (660, 720), SANDBAR, REEL, needs_more_than=VINE_PERFECT)
cast('back from the sandbar', (1120, 720), (650, 770), REEL)
assert math.dist((675, 430), SANDBAR) > VINE_PERFECT, 'the sandbar is reachable from the warehouse corner'
ROOMS.append(room(
    'driftwood-3', 'Driftwood Wharf', 1280, 820,
    [dict(id='w', side='W', at=300, to='driftwood-2', toDoor='e', label='Gull Rookery'),
     dict(id='e', side='E', at=70, to='driftwood-4', toDoor='w', label='Net Lofts')],
    'w', subtitle='Driftwood Wharf · the harbour', **D(),
    pits=[rect(20, 452, 1240, 348, kind='water')],
    bridges=[rect(600, 440, 60, 340, kind='dock'), rect(1112, 690, 84, 70, kind='island')],
    refills=[rect(470, 120, 110, 90)],                            # the freshwater pump
    posts=[post(*SANDBAR), post(650, 770)],
    props=[rect(680, 120, 580, 332, kind='shed'),                 # the net warehouse
           rect(244, 160, 112, 64, kind='stall'), rect(507, 124, 36, 36, kind='stall'),   # Pickett's counter, the pump
           rect(20, 440, 580, 12, kind='rail'), rect(660, 440, 20, 12, kind='rail'),
           crate(110, 120), crate(152, 126, 30, 28), crate(400, 360)],
    shop={'x': 300, 'y': 190, 'name': "Pickett's Tackle"},
    pump={'x': 525, 'y': 150},
    ferry={'x': 560, 'y': 400, 'name': 'Driftwood Jetty'},
    kits=[{'x': 160, 'y': 390}],
    feathers=[{'x': 1140, 'y': 742}],
    glass=[{'x': 1172, 'y': 705}],
    bread=[{'x': 450, 'y': 400}],
    lanterns=[{'x': 260, 'y': 120}, {'x': 640, 'y': 300}, {'x': 640, 'y': 430}],
    ventSpawns=False,
    paths=[[[66, 300], [300, 280], [630, 320], [640, 70], [1214, 70]], [[300, 280], [300, 230]]],
))

# 4 ---------------------------------------------------------------- Net Lofts
WPOST, P1, P2, EPOST = (230, 360), (560, 300), (830, 420), (1232, 380)
cast('pier to the first hook', (290, 360), P1)
cast('hook to hook', (590, 320), P2)
cast('the long one: a perfect cast', (860, 410), EPOST, needs_more_than=NOT_PERFECT)
cast('back: shore to the second hook', (1112, 380), P2)
cast('back: second hook to first', (800, 410), P1)
cast('back: first hook to the pier', (530, 320), WPOST)
ROOMS.append(room(
    'driftwood-4', 'Net Lofts', 1400, 720,
    [dict(id='w', side='W', at=360, to='driftwood-3', toDoor='e', label='Driftwood Wharf'),
     dict(id='e', side='E', at=360, to='driftwood-5', toDoor='w', label='Bilge Docks')],
    'w', subtitle='Driftwood Wharf · 4', **D(),
    pits=[rect(300, 20, 800, 680, kind='water')],
    bridges=[rect(520, 262, 80, 76, kind='island'), rect(790, 382, 80, 76, kind='island')],
    posts=[post(*WPOST), post(*P1), post(*P2), post(*EPOST)],
    props=[crate(60, 120), crate(100, 560), crate(1200, 150), crate(1240, 560), rect(150, 200, 120, 14, kind='rail'), rect(150, 520, 120, 14, kind='rail')],
    enemies=[gull(700, 160), gull(1000, 560)],
    barrels=[{'x': 160, 'y': 440}, {'x': 1300, 'y': 240}],
    glass=[{'x': 560, 'y': 290}, {'x': 1180, 'y': 470}],
    paths=[[[66, 360], [300, 360]], [[1100, 380], [1334, 360]]],
))

# 5 ---------------------------------------------------------------- Bilge Docks
ROOMS.append(room(
    'driftwood-5', 'Bilge Docks', 1200, 680,
    [dict(id='w', side='W', at=360, to='driftwood-4', toDoor='e', label='Net Lofts'),
     dict(id='e', side='E', at=360, to='driftwood-6', toDoor='w', label='The Rusty Gull')],
    'w', subtitle='Driftwood Wharf · 5', **D(),
    pits=[rect(420, 20, 90, 280, kind='water'), rect(420, 440, 90, 220, kind='water'), rect(780, 120, 80, 540, kind='water')],
    bridges=[rect(420, 300, 90, 140, kind='dock'), rect(780, 40, 80, 80, kind='dock')],
    props=[crate(200, 140), crate(244, 140), crate(200, 182), crate(600, 220), crate(640, 220, 36, 36),
           crate(620, 480), crate(960, 200), crate(1000, 240, 36, 34), crate(980, 500), log(240, 560, 100)],
    enemies=[crab(300, 300), crab(660, 380), crab(1000, 380), gull(600, 120), gull(1050, 560)],
    vents=[{'x': 320, 'y': 610}, {'x': 1100, 'y': 120}],
    barrels=[{'x': 120, 'y': 560}, {'x': 700, 'y': 600}],
    kits=[{'x': 1100, 'y': 470}],
    ferry={'x': 120, 'y': 200, 'name': 'Bilge Docks'},
    glass=[{'x': 560, 'y': 600}, {'x': 900, 'y': 640}],
    spools=[{'x': 700, 'y': 100}],
    paths=[[[66, 360], [420, 370], [640, 330], [790, 80], [940, 300], [1134, 360]]],
))

# 6 ---------------------------------------------------------------- The Rusty Gull (boss)
ROOMS.append(room(
    'driftwood-6', 'The Rusty Gull', 1280, 760,
    [dict(id='w', side='W', at=380, to='driftwood-5', toDoor='e', label='Bilge Docks'),
     dict(id='e', side='E', at=380, to='tide-1', toDoor='w', gated=True, label='The Tide Caves')],
    'w', subtitle='Driftwood Wharf · Captain Gullbeard', **D(),
    gate=rect(1234, 334, 12, 92),
    pits=[rect(20, 20, 1240, 720, kind='water')],
    bridges=[rect(160, 140, 960, 480, kind='deck'), rect(20, 345, 150, 70, kind='dock'), rect(1110, 345, 150, 70, kind='dock')],
    posts=[post(420, 250), post(640, 520), post(860, 250)],
    props=[crate(200, 160), crate(1060, 560, 40, 40), rect(160, 140, 960, 10, kind='rail'), rect(160, 610, 960, 10, kind='rail')],
    enemies=[foe('gullbeard', 640, 360)],
    boss='gullbeard', ventSpawns=False,
    barrels=[{'x': 230, 'y': 560}, {'x': 1060, 'y': 200}],
    bread=[{'x': 1000, 'y': 560}],
    lanterns=[{'x': 300, 'y': 380}, {'x': 980, 'y': 380}],
    paths=[],
    winText='Captain Gullbeard is himself again. He points his wing out to sea: the Tide Caves.',
))

os.makedirs(OUT, exist_ok=True)
for r in ROOMS:
    with open(os.path.join(OUT, f"{r['id']}.json"), 'w') as f:
        json.dump(r, f, indent=1)
print('wrote', ', '.join(r['id'] for r in ROOMS), f'(cast {CAST:.0f}, just under perfect {NOT_PERFECT:.0f}, reel {REEL:.0f})')
