"""
Shared character sprites for style frames and sheets. Native pixels, 1 px outline ('O').
Each sprite is a list of rows; '.' is transparent. Keys map to palette names in PALETTE.

Rocco is drawn chibi (head about 60% of his height) so his face has room: big eyes with a
shine pixel, a bandit mask, white brows and muzzle, pink cheeks, a small smile, and ears
poking through holes in his bucket hat. The Moon Koi lives in a glass fish jar on his back.
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
    # fish jar
    'LID0': '7a5420', 'LID1': 'c89a3c', 'LID2': 'f0d07a',
    'GLASS': 'bfe8f2', 'GLASSD': '6aa8bc', 'WATER0': '2a7a98', 'WATER1': '3c9ab8', 'WATER2': '62bcd6', 'BUBBLE': 'e8fbff',
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

# The Moon Koi: a small white fish with a gold crescent on its head, big tired eyes, pink fins.
KOI = [
    "...OOOOOO......",
    ".OOwwwwwwOO..OO",
    "OwwwlGGwwwwOOwO",
    "OwwPSwwwwwwwwO.",
    "OwwPPwwwswwwwwO",
    "OKwwwwwwsswOOwO",
    ".OOfwwwfwOO..OO",
    "...OOOOOO......",
]
KOI_KEYS = {'O': 'OUT', 'w': 'KOIW', 's': 'KOIS', 'l': 'KOIS', 'G': 'KOIG', 'P': 'KOIE', 'S': 'SHINE', 'f': 'KOIF', 'K': 'KOIF'}

JAR_W, JAR_H = 19, 20

def draw_jar(put, x0, y0, water=0.72, emit=True):
    """Glass fish jar backpack with brass lid, water filled to `water` (0-1), and the Moon Koi.
    `put(x, y, palette_key, emit=bool)` draws one pixel."""
    w, h = JAR_W, JAR_H
    # lid
    for x in range(x0 + 4, x0 + w - 4):
        put(x, y0, 'OUT'); put(x, y0 + 1, 'LID2' if x % 3 == 0 else 'LID1'); put(x, y0 + 2, 'LID0')
    put(x0 + 3, y0 + 1, 'OUT'); put(x0 + w - 4, y0 + 1, 'OUT')
    for x in range(x0 + 3, x0 + w - 3): put(x, y0 + 3, 'OUT')
    # glass body: rounded rectangle
    top, bot = y0 + 4, y0 + h - 1
    surface = top + 1 + int((bot - top - 2) * (1 - water))
    for y in range(top, bot + 1):
        inset = 2 if y in (top, bot) else 1 if y in (top + 1, bot - 1) else 0
        for x in range(x0 + inset, x0 + w - inset):
            edge = x in (x0 + inset, x0 + w - inset - 1) or y in (top, bot)
            if edge:
                put(x, y, 'OUT'); continue
            if x in (x0 + inset + 1,) or y == top + 1:
                put(x, y, 'GLASS'); continue
            if y < surface:
                put(x, y, 'GLASSD' if (x + y) % 5 == 0 else 'GLASS' if x < x0 + 5 else 'WATER2'); continue
            if y == surface:
                put(x, y, 'WATER2', emit=emit); continue
            depth = (y - surface) / max(1, bot - surface)
            put(x, y, 'WATER1' if depth < 0.55 else 'WATER0', emit=emit)
    # glass highlight streak
    for y in range(top + 3, bot - 3):
        put(x0 + 3, y, 'GLASS', emit=emit)
    put(x0 + 4, top + 3, 'GLASS', emit=emit)
    # the koi, centered in the water, and two bubbles
    kx, ky = x0 + 2, max(surface + 3, y0 + 10)
    for j, row in enumerate(KOI):
        for i, ch in enumerate(row):
            if ch == '.': continue
            put(kx + i, ky + j, KOI_KEYS[ch], emit=emit)
    for (bx, by) in [(kx + 1, ky - 2), (kx + 3, ky - 5)]:
        if by > surface:
            put(bx, by, 'BUBBLE', emit=emit)
    # shoulder straps
    for y in range(top + 2, top + 12):
        put(x0 + w - 1, y, 'STRAP')
