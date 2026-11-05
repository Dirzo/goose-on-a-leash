"""
NOTE: superseded by the fine-resolution art (640x360 native, see art/characters/rocco_hd.py).
Kept for the 320x180 style frames until those are redrawn.

Shared character sprites for style frames and sheets. Native pixels, 1 px outline ('O').
Each sprite is a list of rows; '.' is transparent. Keys map to palette names in PALETTE.

Rocco is drawn chibi (head about 60% of his height) so his face has room: big eyes with a
shine pixel, a bandit mask, white brows and muzzle, pink cheeks, a small smile, and ears
poking through holes in his bucket hat. The Moon Koi rides in a water-filled canvas backpack with
its goofy head sticking out the top. The pack shows its state: holes drip, patches stay sewn on,
and the koi's face changes as the water runs low.
"""

PALETTE = {
    'OUT': '120e18',
    # Rocco fur
    'FUR3': 'e9e5ee', 'FUR2': 'a8a3b2', 'FUR1': '77727f', 'MASK': '2a2633', 'EAR': 'e89aa8',
    'EYEW': 'ffffff', 'PUPIL': '120e18', 'SHINE': 'ffffff', 'NOSE': '1a1620', 'CHEEK': 'f0a0aa',
    # bucket hat, vest, trousers, boots
    'HAT0': '3f4e22', 'HAT1': '627634', 'HAT2': '8aa04a', 'BAND': '6a4424',
    'VEST0': '7a5a32', 'VEST1': 'a8804a', 'VEST2': 'd0aa6c', 'STRAP': '5a3a22',
    'PANT0': '2e3a48', 'PANT1': '415468', 'BOOT': '4a2e1c',
    # canvas backpack
    'CAN0': '4e4630', 'CAN1': '74683f', 'CAN2': '9c8d58', 'CAN3': 'c2b27a', 'FLAP0': '5a3a22', 'FLAP1': '7e5432', 'FLAP2': 'a2703e',
    'BUCKLE': 'e8c060', 'STITCH': 'e8dcb0', 'PATCH0': '8a2e34', 'PATCH1': 'b8444a', 'HOLE': '0c0a10',
    'WATER0': '2a7a98', 'WATER1': '3c9ab8', 'WATER2': '62bcd6', 'BUBBLE': 'e8fbff', 'SWEAT': '9ae0ff',
    # Moon Koi
    'KOIW': 'fffaf0', 'KOIS': 'e2dccc', 'KOIG': 'f4c040', 'KOIF': 'ffc4c8', 'KOIE': '120e18',
    # rod + line
    'ROD': '8a5a2a', 'LINE': 'd8ecf4',
}

# Rocco, 3/4 view facing right. Paw holding the rod is at (21, 22).
ROCCO = [
    "...OO.........OO......",
    "..OfeO.......OfeO.....",
    "..OfeOOOOOOOOOfeO.....",
    ".OHHHHHHHHHHHHHHHO....",
    ".OHhhhhhhhhhhhhhHO....",
    ".OHhhhhhhhhhhhhhHO....",
    "OBBBBBBBBBBBBBBBBBO...",
    "OHHHHHHHHHHHHHHHHHHOOO",
    ".OOOHHHHHHHHHHHHHHHHHO",
    "...OfffffffffffffOOOO.",
    "..OffwwwwfffffwwwwfO..",
    "..OfmmmmmmfffmmmmmmmO.",
    "..OmmWWWmmmfmmmWWWmmO.",
    "..OmmWPPmmmfmmmWPPmmmO",
    "..OfmWPSmmffmmmWPSmmmO",
    "..OfmmmmmmwwwwmmmmmmwO",
    "...OfcwwwwwwwwwwwwnnnO",
    "...OfffwwwwwwwwwwwwwO.",
    "....OOfffwwwOOwwwwOO..",
    "......OOOOOOOOOOOOO...",
    ".......OvvvvvvvvO.....",
    ".....OOvVvvvvvvVvOOO..",
    "....OfOvvVvpvvpvVOffkO",
    "....OfOsvvvvvvvvvOOOO.",
    "....OkOvsvvvvvvvvO....",
    ".....OOttttttttttO....",
    "......OttttOtttttO....",
    "......OtttO.OttttO....",
    "......ObbbO.ObbbbO....",
    ".....ObbbbO.ObbbbbO...",
    ".....OOOOOO.OOOOOOO...",
]
ROCCO_KEYS = {
    'O': 'OUT', 'f': 'FUR2', 'e': 'EAR', 'H': 'HAT1', 'h': 'HAT2', 'B': 'BAND', 'w': 'FUR3', 'm': 'MASK',
    'W': 'EYEW', 'P': 'PUPIL', 'S': 'SHINE', 'c': 'CHEEK', 'n': 'NOSE',
    'v': 'VEST1', 'V': 'VEST0', 'p': 'VEST2', 's': 'STRAP', 'k': 'FUR1', 't': 'PANT1', 'b': 'BOOT',
}
ROCCO_EMIT = 'WS'          # eye whites and shine stay bright at night
ROCCO_PAW = (21, 22)

# The Moon Koi, head and shoulders sticking out of the backpack. Goofy: cross-eyed, pouty pink
# lips, blushing cheeks, a gold crescent on its head, and little pink fins flapping over the rim.
KOI_HAPPY = [
    ".......OOOO.......",
    "......OGGGGO......",
    "....OOwwwwwwOO....",
    "..OOwwwwwwwwwwOO..",
    ".OwwPPwwwwwwPPwwO.",
    ".OwPSPPwwwwPSPPwO.",
    ".OwPPPPwwwwPPPPwO.",
    ".OwwPPwwwwwwPPwwO.",
    "fOwccwwwwwwwwccwOf",
    "ffOwwwwwLoLwwwwOff",
    ".fOwwwwwwLwwwwwOf.",
    "..OwwwwwwwwwwwwO..",
]
# Running dry: droopy half-closed eyes, a wide gasping mouth, a sweat drop.
KOI_DRY = [
    ".......OOOO.......",
    "......OGGGGO..d...",
    "....OOwwwwwwOOdd..",
    "..OOwwwwwwwwwwOO..",
    ".OwwwwwwwwwwwwwwO.",
    ".OwOOOOwwwwOOOOwO.",
    ".OwPPPPwwwwPPPPwO.",
    ".OwwPPwwwwwwPPwwO.",
    "fOwwwwwwLLwwwwwwOf",
    "ffOwwwwLooLwwwwOff",
    ".fOwwwwLooLwwwwOf.",
    "..OwwwwwLLwwwwwO..",
]
KOI_KEYS = {'O': 'OUT', 'w': 'KOIW', 'G': 'KOIG', 'W': 'EYEW', 'P': 'KOIE', 'S': 'SHINE', 'c': 'KOIF',
            'L': 'KOIF', 'o': 'KOIE', 'f': 'KOIF', 'd': 'SWEAT'}

PACK_W, PACK_H = 16, 19
KOI_OFFSET = (-1, -11)      # koi sprite position relative to the pack's top-left

def draw_koi(put, x0, y0, water=1.0, koi='happy', emit=True):
    """The Moon Koi's head, for a pack whose top-left is (x0, y0). Drawn as its own layer so it can
    sit above Rocco and peek over his shoulder."""
    face = KOI_HAPPY if (koi == 'happy' and water > 0.3) else KOI_DRY
    kx, ky = x0 + KOI_OFFSET[0], y0 + KOI_OFFSET[1]
    for j, row in enumerate(face):
        if ky + j >= y0 + 1: break          # the rim hides the rest
        for i, ch in enumerate(row):
            if ch != '.':
                put(kx + i, ky + j, KOI_KEYS[ch], emit=emit and ch in 'wGWPScLofd')

def draw_backpack(put, x0, y0, holes=(), patches=(), water=1.0, koi='happy', emit=True, with_koi=True):
    """Canvas fisherman's backpack, water-filled, with the Moon Koi sticking out the top.
    holes/patches: (x, y) positions relative to the pack. water: 0-1 (drives splash and the koi's face).
    `put(x, y, palette_key, emit=bool)` draws one pixel."""
    w, h = PACK_W, PACK_H
    # the koi goes first; the pack's rolled rim covers its lower body
    if with_koi:
        draw_koi(put, x0, y0, water, koi, emit)
    # body: rounded canvas rectangle, lit from the left
    for y in range(y0 + 1, y0 + h):
        inset = 1 if y in (y0 + 1, y0 + h - 1) else 0
        for x in range(x0 + inset, x0 + w - inset):
            edge = x in (x0 + inset, x0 + w - inset - 1) or y == y0 + h - 1
            if edge: put(x, y, 'OUT'); continue
            rel = (x - x0) / w
            c = 'CAN3' if rel < 0.18 else 'CAN2' if rel < 0.55 else 'CAN1' if rel < 0.85 else 'CAN0'
            if (x + y * 3) % 11 == 0: c = 'CAN1'          # canvas weave
            put(x, y, c)
    # rolled rim with water lapping at the koi
    for x in range(x0, x0 + w):
        put(x, y0, 'OUT'); put(x, y0 + 1, 'CAN3' if x % 2 else 'CAN2'); put(x, y0 + 2, 'OUT' if x in (x0, x0 + w - 1) else 'CAN0')
    if water > 0.15:
        for x in range(x0 + 2, x0 + w - 2, 3):
            put(x, y0 - 1, 'WATER2', emit=emit)
        if water > 0.6:
            for (dx, dy) in [(-1, -3), (w, -2), (-2, -1), (w + 1, -4)]:
                put(x0 + dx, y0 + dy, 'WATER2', emit=emit)   # splashes
    # leather flap with stitching and a brass buckle
    for y in range(y0 + 3, y0 + 10):
        for x in range(x0 + 2, x0 + w - 2):
            edge = x in (x0 + 2, x0 + w - 3) or y == y0 + 9
            put(x, y, 'OUT' if edge else ('FLAP2' if x < x0 + 5 else 'FLAP1' if x < x0 + w - 5 else 'FLAP0'))
        if y < y0 + 8:
            put(x0 + 3, y, 'STITCH' if y % 2 else 'FLAP2'); put(x0 + w - 4, y, 'STITCH' if y % 2 else 'FLAP0')
    for (dx, dy, c) in [(6, 8, 'BUCKLE'), (7, 8, 'BUCKLE'), (8, 8, 'BUCKLE'), (9, 8, 'BUCKLE'), (6, 9, 'OUT'), (9, 9, 'OUT'),
                        (7, 10, 'FLAP1'), (8, 10, 'FLAP1'), (7, 11, 'FLAP0'), (8, 11, 'FLAP0')]:
        put(x0 + dx, y0 + dy, c)
    # front pocket
    for x in range(x0 + 3, x0 + w - 3):
        put(x, y0 + 13, 'OUT'); put(x, y0 + 14, 'STITCH' if x % 2 else 'CAN2')
    for y in range(y0 + 13, y0 + h - 1):
        put(x0 + 3, y, 'OUT'); put(x0 + w - 4, y, 'OUT')
    # sewn patches: a red square with stitched corners
    for (px, py) in patches:
        for y in range(py, py + 4):
            for x in range(px, px + 4):
                corner = (x in (px, px + 3)) and (y in (py, py + 3))
                put(x0 + x, y0 + y, 'STITCH' if corner else ('PATCH1' if (x + y) % 2 else 'PATCH0'))
    # holes, dripping
    for (hx_, hy) in holes:
        put(x0 + hx_, y0 + hy, 'HOLE'); put(x0 + hx_ + 1, y0 + hy, 'HOLE'); put(x0 + hx_, y0 + hy + 1, 'HOLE')
        for k, dy in enumerate((3, 5, 8)):
            put(x0 + hx_, y0 + hy + dy, 'WATER2' if k < 2 else 'WATER1', emit=emit)
