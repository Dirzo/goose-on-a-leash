"""
Hollowbark Woods: eight rooms authored in code, written to src/data/rooms/hollowbark-N.json.

Dry woods. Water is scarce (springs and rain barrels), the critters want Bimbo, and the woods themselves
snag the pack.
  1 Woodline       squirrels lob acorns from a distance; one spring
  2 Bramble Path   hedge walls with chewable bramble bushes as shortcuts; the long way goes through thorns
  3 Ravine Swing   grapple tree-branch posts on rock pillars across a ravine (back posts too)
  4 Rain Barrels   a dry glade: no spring, four barrels; the first badger
  5 Spore Ring     mushroom rings put swarms to sleep when honked; ring the bell to open the way
  6 Hollow Stump   rest stop: spring, sewing kit, the Vine Lash in a hollow stump, a feather behind a bush
  7 Badger Sett    three badgers tunnelling at Bimbo, thorns, a ravine crack, a kit before the boss
  8 The Hollow     boss: the Burrow King. Bait his charge into a tree to daze him

Run: python3 art/rooms/woods_layout.py
"""
import json
import os

from roomkit import BASE_LEASH, HONK, check_reach, foe, post, rect, room, tree

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, 'build')   # per-room layouts; merge_areas.py stitches them into areas
ROOMS = []
W = lambda **kw: dict(biome='woods', lightKind='squirrel', heavyKind='badger', **kw)
sq = lambda x, y: foe('squirrel', x, y)
bg = lambda x, y: foe('badger', x, y)

# 1 ---------------------------------------------------------------- Woodline
ROOMS.append(room(
    'hollowbark-1', 'Woodline', 1120, 640,
    [dict(id='w', side='W', at=350, to='reedmarsh-12', toDoor='e', label="The Ferryman's Pool"),
     dict(id='e', side='E', at=300, to='hollowbark-2', toDoor='w', gated=True, label='Bramble Path')],
    'w', subtitle='Hollowbark Woods · 1', **W(),
    # the way on is shut until an acorn, batted back with the Ferryman's Oar, rings the chime in the thorns
    gate=rect(1074, 254, 12, 92),
    bell={'x': 968, 'y': 486, 'r': 14, 'parryOnly': True},
    brambles=[rect(900, 440, 140, 100)],
    pits=[rect(520, 300, 80, 56, kind='water')],
    refills=[rect(500, 280, 120, 96)],
    props=[tree(260, 160), tree(380, 480), tree(560, 140), tree(700, 520), tree(820, 180), tree(200, 560), tree(1000, 120)],
    vents=[{'x': 860, 'y': 560}],
    enemies=[sq(480, 220), sq(760, 400), sq(900, 260)],
    bread=[{'x': 300, 'y': 300}], spools=[{'x': 640, 'y': 560}],
    nests=[{'x': 560, 'y': 80, 'drop': 'spool'}],
    lantern={'x': 610, 'y': 282},
    paths=[[[66, 350], [460, 330], [660, 260], [1054, 300]]],
))

# 2 ---------------------------------------------------------------- Bramble Path
hedge = lambda x, y, w, h: rect(x, y, w, h, kind='hedge')
ROOMS.append(room(
    'hollowbark-2', 'Bramble Path', 1120, 640,
    [dict(id='w', side='W', at=320, to='hollowbark-1', toDoor='e', label='Woodline'),
     dict(id='e', side='E', at=320, to='hollowbark-3', toDoor='w', label='Ravine Swing')],
    'w', subtitle='Hollowbark Woods · 2', **W(),
    pits=[rect(160, 120, 70, 50, kind='water')],
    refills=[rect(140, 100, 110, 90)],
    props=[hedge(300, 20, 40, 200), hedge(300, 290, 40, 190),
           hedge(600, 150, 40, 190), hedge(600, 400, 40, 220),
           hedge(880, 20, 40, 260), hedge(880, 350, 40, 130)],
    bushes=[{'x': 320, 'y': 255, 'r': 26}, {'x': 620, 'y': 370, 'r': 26}, {'x': 900, 'y': 315, 'r': 26}],
    brambles=[rect(300, 480, 40, 140), rect(600, 20, 40, 130), rect(880, 480, 40, 140),
              rect(420, 380, 90, 60), rect(720, 120, 80, 60)],
    enemies=[sq(460, 200), sq(760, 500), sq(1000, 180)],
    barrels=[{'x': 1000, 'y': 520}],
    nests=[{'x': 960, 'y': 90, 'drop': 'feather'}],
    bread=[{'x': 760, 'y': 280}],
    paths=[[[66, 320], [1054, 320]]],
))

# 3 ---------------------------------------------------------------- Ravine Swing
A, B, Cc, D, Wp = (480, 220), (660, 380), (840, 240), (1020, 310), (260, 240)
check_reach('swing: shore to A', (306, 260), A, BASE_LEASH)
check_reach('swing: A to B', (525, 250), B, BASE_LEASH)
check_reach('swing: B to C', (705, 350), Cc, BASE_LEASH)
check_reach('swing: C to far side', (885, 260), D, BASE_LEASH)
check_reach('swing back: far side to C', (986, 310), Cc, BASE_LEASH)
check_reach('swing back: C to B', (795, 240), B, BASE_LEASH)
check_reach('swing back: B to A', (615, 380), A, BASE_LEASH)
check_reach('swing back: A to the near side', (435, 220), Wp, BASE_LEASH)
ROOMS.append(room(
    'hollowbark-3', 'Ravine Swing', 1280, 640,
    [dict(id='w', side='W', at=300, to='hollowbark-2', toDoor='e', label='Bramble Path'),
     dict(id='e', side='E', at=300, to='hollowbark-4', toDoor='w', label='Rain Barrels')],
    'w', subtitle='Hollowbark Woods · 3', **W(),
    pits=[rect(300, 20, 680, 600, kind='ravine'), rect(120, 400, 70, 50, kind='water')],
    bridges=[rect(430, 170, 100, 100, kind='pillar'), rect(610, 330, 100, 100, kind='pillar'), rect(790, 190, 100, 100, kind='pillar')],
    refills=[rect(100, 380, 110, 90)],
    posts=[post(*A), post(*B), post(*Cc), post(*D), post(*Wp)],
    props=[tree(150, 150), tree(1150, 450), tree(1100, 130)],
    enemies=[sq(1150, 200), sq(1160, 560)],
    spools=[{'x': 1180, 'y': 330}], feathers=[{'x': 660, 'y': 412}],
    paths=[[[66, 300], [296, 300]], [[984, 310], [1214, 300]]],
))

# 4 ---------------------------------------------------------------- Rain Barrels
ROOMS.append(room(
    'hollowbark-4', 'Rain Barrels', 960, 640,
    [dict(id='w', side='W', at=320, to='hollowbark-3', toDoor='e', label='Ravine Swing'),
     dict(id='n', side='N', at=760, to='hollowbark-5', toDoor='w', label='Spore Ring')],
    'w', subtitle='Hollowbark Woods · 4', **W(),
    barrels=[{'x': 250, 'y': 150}, {'x': 480, 'y': 540}, {'x': 640, 'y': 160}, {'x': 870, 'y': 520}],
    props=[tree(380, 260), tree(600, 420), tree(840, 330), tree(150, 470)],
    enemies=[bg(600, 260), sq(300, 520), sq(860, 160)],
    spools=[{'x': 150, 'y': 580}],
    nests=[{'x': 840, 'y': 262, 'drop': 'kit'}],
    bread=[{'x': 480, 'y': 330}],
    paths=[[[66, 320], [500, 320], [760, 200], [760, 70]]],
))

# 5 ---------------------------------------------------------------- Spore Ring
bell5 = {'x': 980, 'y': 140, 'r': 14}
ROOMS.append(room(
    'hollowbark-5', 'Spore Ring', 1120, 640,
    [dict(id='w', side='W', at=320, to='hollowbark-4', toDoor='n', label='Rain Barrels'),
     dict(id='e', side='E', at=320, to='hollowbark-6', toDoor='w', gated=True, label='Hollow Stump')],
    'w', subtitle='Hollowbark Woods · 5', **W(),
    gate=rect(1074, 274, 12, 92),
    bell=bell5,
    pits=[rect(520, 140, 70, 50, kind='water')],
    refills=[rect(500, 120, 110, 90)],
    shrooms=[{'x': 350, 'y': 200}, {'x': 560, 'y': 460}, {'x': 790, 'y': 230}],
    props=[tree(250, 430), tree(680, 330), tree(880, 470), tree(440, 330)],
    vents=[{'x': 200, 'y': 560}, {'x': 900, 'y': 570}],
    enemies=[sq(400, 150), sq(600, 520), sq(820, 180), sq(700, 420), bg(900, 300)],
    bread=[{'x': 160, 'y': 160}], spools=[{'x': 1000, 'y': 560}],
    nests=[{'x': 680, 'y': 262, 'drop': 'feather'}],
    paths=[[[66, 320], [1054, 320]]],
))

# 6 ---------------------------------------------------------------- Hollow Stump
ROOMS.append(room(
    'hollowbark-6', 'Hollow Stump', 880, 560,
    [dict(id='w', side='W', at=280, to='hollowbark-5', toDoor='e', label='Spore Ring'),
     dict(id='e', side='E', at=280, to='hollowbark-7', toDoor='w', label='Badger Sett')],
    'w', subtitle='Hollowbark Woods · 6', **W(),
    pits=[rect(600, 380, 80, 60, kind='water')],
    refills=[rect(580, 360, 120, 100)],
    props=[hedge(680, 20, 24, 70), hedge(680, 150, 180, 24), tree(200, 140), tree(260, 470)],
    bushes=[{'x': 692, 'y': 118, 'r': 26}],
    chest={'x': 440, 'y': 200, 'leash': 'vine'},
    kits=[{'x': 300, 'y': 400}], feathers=[{'x': 790, 'y': 80}],
    ferry={'x': 560, 'y': 430, 'name': 'Hollow Stump Spring'},
    bread=[{'x': 150, 'y': 450}],
    lantern={'x': 480, 'y': 180},
    paths=[[[66, 280], [814, 280]]],
))

# 7 ---------------------------------------------------------------- Badger Sett
ROOMS.append(room(
    'hollowbark-7', 'Badger Sett', 1200, 680,
    [dict(id='w', side='W', at=340, to='hollowbark-6', toDoor='e', label='Hollow Stump'),
     dict(id='e', side='E', at=340, to='hollowbark-8', toDoor='w', label='The Hollow')],
    'w', subtitle='Hollowbark Woods · 7', **W(),
    pits=[rect(640, 20, 60, 240, kind='ravine'), rect(200, 150, 70, 50, kind='water')],
    refills=[rect(180, 130, 110, 90)],
    brambles=[rect(520, 300, 120, 70), rect(820, 420, 100, 80)],
    props=[tree(250, 440), tree(600, 520), tree(880, 580), tree(1050, 180)],
    vents=[{'x': 300, 'y': 580}, {'x': 820, 'y': 120}],
    enemies=[bg(420, 200), bg(720, 470), bg(960, 260)],
    barrels=[{'x': 560, 'y': 620}, {'x': 1100, 'y': 580}],
    kits=[{'x': 1120, 'y': 440}], spools=[{'x': 480, 'y': 120}],
    paths=[[[66, 340], [1134, 340]]],
))

# 8 ---------------------------------------------------------------- The Hollow (boss)
ROOMS.append(room(
    'hollowbark-8', 'The Hollow', 1120, 720,
    [dict(id='w', side='W', at=360, to='hollowbark-7', toDoor='e', label='Badger Sett'),
     dict(id='e', side='E', at=360, to='END', toDoor='', gated=True, label='Driftwood Wharf')],
    'w', subtitle='Hollowbark Woods · the Burrow King', **W(),
    gate=rect(1074, 314, 12, 92),
    props=[tree(380, 200), tree(380, 520), tree(620, 150), tree(620, 580), tree(860, 200), tree(860, 520)],
    brambles=[rect(490, 330, 60, 40), rect(700, 400, 60, 40)],
    vents=[{'x': 200, 'y': 140}, {'x': 200, 'y': 600}, {'x': 1000, 'y': 140}, {'x': 1000, 'y': 600}],
    enemies=[foe('king', 640, 360)],
    boss='king', ventSpawns=False,
    barrels=[{'x': 140, 'y': 250}, {'x': 140, 'y': 480}, {'x': 990, 'y': 250}],
    bread=[{'x': 980, 'y': 480}],
    paths=[[[66, 360], [1054, 360]]],
    winText='Hollowbark Woods cleared! The Burrow King points a huge claw toward the sea: Driftwood Wharf.',
))

os.makedirs(OUT, exist_ok=True)
for r in ROOMS:
    with open(os.path.join(OUT, f"{r['id']}.json"), 'w') as f:
        json.dump(r, f, indent=1)
print('wrote', ', '.join(r['id'] for r in ROOMS))
