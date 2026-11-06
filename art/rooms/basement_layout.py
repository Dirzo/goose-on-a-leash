"""
The Infinite Basement: an endless cellar under Willowmere's old mill. No way down, only the stairs up.
Floor after floor of entranced critters crawl out of the drains; the mix gets nastier the deeper you go.
Pillars to duck behind, two iron rings to yank yourself between, and no water but what the drains give
back when a floor is cleared.

Run: python3 art/rooms/basement_layout.py
"""
import json
import os

from roomkit import post, rect, room

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, 'build')
pillar = lambda x, y, s=50: rect(x - s // 2, y - s // 2, s, s, kind='pillar')

R = room(
    'basement', 'The Infinite Basement', 1120, 760,
    [dict(id='up', side='W', at=400, to='UP', toDoor='up', label='Up the stairs')],
    'up', subtitle='Under the old mill · endless', biome='castle', lightKind='frog', heavyKind='badger',
    endless=True, ventSpawns=False,
    props=[pillar(300, 250), pillar(820, 250), pillar(300, 540), pillar(820, 540), rect(520, 360, 80, 50, kind='statue')],
    posts=[post(200, 220), post(960, 400)],
    vents=[{'x': 110, 'y': 130}, {'x': 1010, 'y': 130}, {'x': 110, 'y': 660}, {'x': 1010, 'y': 660}, {'x': 560, 'y': 690}],
    lanterns=[{'x': 300, 'y': 400}, {'x': 820, 'y': 400}, {'x': 560, 'y': 160}],
    paths=[],
)

os.makedirs(OUT, exist_ok=True)
with open(os.path.join(OUT, 'basement.json'), 'w') as f:
    json.dump(R, f, indent=1)
print('wrote basement')
