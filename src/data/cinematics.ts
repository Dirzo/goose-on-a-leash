/**
 * The cinematics: a title card for each chapter, and an entrance and a wake-up for each boss.
 * Each is a list of steps the player sees in letterbox: pans, lines of dialogue, cards, shakes.
 * View-only scripts: the game is paused while one plays. Seen ones are saved.
 */

export type Speaker = 'rocco0' | 'rocco' | 'bimbo' | 'biscuit' | 'elder' | 'heron' | 'king' | 'gullbeard' | 'pickett';
/** Where to point the camera: Rocco, the boss in the room, or a world point. */
export type CamTarget = 'player' | 'boss' | { x: number; y: number };

export type Step =
  | { title: string; sub?: string; hold?: number }
  | { pan: CamTarget; dur?: number }
  | { say: string; who: Speaker }
  | { wait: number }
  | { shake: number }
  | { fadeIn: number }
  | { sound: string }
  /** A cue for whoever is staging the scene (the prologue): 'redmoon', 'pack', 'goose', 'tie'. */
  | { act: string };

/** Portrait: which sprite, zoom, and where to frame it (ax/ay: 0 = left/top edge of the sprite, 1 = right/bottom). */
export const SPEAKERS: Record<Speaker, { name: string; color: string; strip: string; frame: number; scale: number; ax: number; ay: number }> = {
  rocco0: { name: 'Rocco', color: '#e9c98a', strip: 'rocco_idle_empty', frame: 0, scale: 1.9, ax: 0.5, ay: 0.1 },
  rocco: { name: 'Rocco', color: '#e9c98a', strip: 'rocco_idle', frame: 0, scale: 1.9, ax: 0.5, ay: 0.1 },
  bimbo: { name: 'Bimbo', color: '#ffb0c8', strip: 'bimbo', frame: 0, scale: 1.7, ax: 0.5, ay: 0.5 },
  biscuit: { name: 'Biscuit', color: '#f2f2e8', strip: 'biscuit_idle', frame: 0, scale: 2.2, ax: 0.6, ay: 0 },
  elder: { name: 'Old Snapper', color: '#b8d890', strip: 'snapper', frame: 0, scale: 3.2, ax: 1, ay: 0.5 },
  heron: { name: 'The Heron', color: '#a8c8e8', strip: 'heron', frame: 0, scale: 1.8, ax: 0.6, ay: 0 },
  king: { name: 'The Burrow King', color: '#d8b890', strip: 'king', frame: 0, scale: 1.5, ax: 0.5, ay: 0.1 },
  gullbeard: { name: 'Captain Gullbeard', color: '#8fe0d0', strip: 'gullbeard', frame: 0, scale: 1.5, ax: 0.72, ay: 0.12 },
  pickett: { name: 'Pickett', color: '#c49a6a', strip: 'pickett', frame: 2, scale: 2.4, ax: 0.5, ay: 0.05 },
};

export const CINEMATICS: Record<string, Step[]> = {
  // ---- the prologue (playable fishing in between: see src/view/prologue.ts)
  'pro-open': [
    { fadeIn: 2 },
    { title: 'Prologue · One More Cast', sub: 'Willowmere Pond, a quiet night', hold: 3 },
    { pan: 'player', dur: 0.6 },
    { say: "Something big's been circling down there all night. One more cast.", who: 'rocco0' },
  ],
  'pro-catch': [
    { act: 'redmoon' },
    { say: "Whoa. WHOA. That's no carp.", who: 'rocco0' },
    { say: 'Put. Me. DOWN. I am a Moon Koi, and this is MY pond.', who: 'bimbo' },
    { say: "A talking fish. Grandpa said there'd be nights like this.", who: 'rocco0' },
    { say: "Look up, raccoon. The moon. It turned the moment you pulled me out.", who: 'bimbo' },
    { say: 'Everything that looks at a blood moon goes... hungry. And I am the tastiest thing in Willowmere.', who: 'bimbo' },
    { pan: { x: 240, y: 170 }, dur: 1.2 },
    { sound: 'ribbit' },
    { say: "Wait. YOU aren't hungry. Why aren't you hungry?", who: 'bimbo' },
    { pan: 'player', dur: 0.8 },
    { say: 'Polarized fishing glasses. I never fish without them.', who: 'rocco0' },
    { say: 'Somewhere wet. NOW.', who: 'bimbo' },
    { act: 'pack' }, { sound: 'splash' },
    { say: "In the backpack you go. It sloshes a bit. Don't mind the holes.", who: 'rocco' },
    { sound: 'honk' }, { act: 'goose' },
    { wait: 0.6 },
    { say: 'HONK!!', who: 'biscuit' },
    { say: "Biscuit! Easy, boy. It's only the moon...", who: 'rocco' },
    { say: "It's looking at me. Why is it LOOKING at me?!", who: 'bimbo' },
    { act: 'bolt' }, { sound: 'honk' },
    { say: 'Biscuit, no! Come back here!', who: 'rocco' },
  ],
  'pro-tie': [
    { say: 'Gotcha. Easy... easy, you grumpy bird.', who: 'rocco' },
    { act: 'tie' }, { sound: 'patch' },
    { say: "There. Tied to my fishing line. You bite anything that moves, and tonight that's exactly what we need.", who: 'rocco' },
    { say: 'HONK!!', who: 'biscuit' },
    { say: "Same as casting a line: hold to wind up, let go at the top. Get it right and he hits like a freight train.", who: 'rocco' },
    { say: "I'm going to die in a backpack.", who: 'bimbo' },
  ],
  ch1: [
    { title: 'Chapter One · The Blood Moon', sub: 'Willowmere Pond', hold: 3 },
    { say: 'Fine. FINE. North, to the marsh. And keep me WET.', who: 'bimbo' },
  ],
  ch2: [
    { fadeIn: 0.8 },
    { title: 'Chapter Two · Reedmarsh', sub: 'Where the Ferryman waits', hold: 2.6 },
    { say: 'A swamp. Wet. Smelly. I approve of exactly one of those.', who: 'bimbo' },
    { say: 'Keep your fins crossed. Something big lives in these reeds.', who: 'rocco' },
  ],
  'elder-in': [
    { pan: 'boss', dur: 1.2 },
    { sound: 'hiss' }, { shake: 0.4 },
    { say: 'Hhhhsss... a FISH. In a BAG.', who: 'elder' },
    { say: "It's a BACKPACK!", who: 'bimbo' },
    { say: 'Biscuit. Get ready.', who: 'rocco' },
    { say: 'HONK!', who: 'biscuit' },
    { pan: 'player', dur: 0.8 },
  ],
  'elder-out': [
    { wait: 0.8 },
    { pan: 'boss', dur: 0.9 },
    { say: '...Ugh. My head. That red moon got right into it.', who: 'elder' },
    { say: "Mind the Ferryman's pool, raccoon. He's taken worse than I was.", who: 'elder' },
    { pan: 'player', dur: 0.7 },
  ],
  'heron-in': [
    { pan: 'boss', dur: 1.4 },
    { sound: 'kraa' },
    { say: "None cross the Ferryman's pool. Not under this moon.", who: 'heron' },
    { say: "He's looking at me like I'm SUSHI.", who: 'bimbo' },
    { say: 'Stay in the bag, Bimbo.', who: 'rocco' },
    { pan: 'player', dur: 0.8 },
  ],
  'heron-out': [
    { wait: 0.8 },
    { pan: 'boss', dur: 1 },
    { say: '...The red is gone. I am the Ferryman again.', who: 'heron' },
    { say: 'You carry the Moon Koi. Then take my oar.', who: 'heron' },
    { sound: 'chest' },
    { title: "The Ferryman's Oar", sub: 'Hold G or right mouse to guard Bimbo. Raise it just as a blow lands to send it back.', hold: 3.4 },
    { say: 'Honk at any ferry post, and I will come.', who: 'heron' },
    { pan: 'player', dur: 0.7 },
  ],
  ch3: [
    { fadeIn: 0.8 },
    { title: 'Chapter Three · Hollowbark Woods', sub: 'Dry ground. Hungry trees.', hold: 2.6 },
    { say: 'Trees. No water. Who planned this route?', who: 'bimbo' },
    { say: "There'll be springs, and rain barrels. We'll manage.", who: 'rocco' },
  ],
  'king-in': [
    { pan: 'boss', dur: 1.2 },
    { sound: 'growl' }, { shake: 0.7 },
    { say: 'WHO DIGS IN MY HOLLOW?', who: 'king' },
    { say: "Nobody's digging! We're just passing thr—", who: 'rocco' },
    { shake: 0.4 },
    { say: 'THEN BE BURIED.', who: 'king' },
    { pan: 'player', dur: 0.8 },
  ],
  'king-out': [
    { wait: 0.8 },
    { pan: 'boss', dur: 1 },
    { say: '...What was I digging for? Hm.', who: 'king' },
    { say: 'The sea is east, little raccoon. Mind the fish.', who: 'king' },
    { say: 'Finally. Someone who gets it.', who: 'bimbo' },
    { pan: 'player', dur: 0.7 },
  ],
  ch4: [
    { fadeIn: 0.8 },
    { title: 'Chapter Four · Driftwood Wharf', sub: 'Salt in the air. Thieves in the sky.', hold: 2.6 },
    { say: 'SALT water. All of it. Do you know what salt does to a koi?', who: 'bimbo' },
    { say: "Rain barrels, then. And keep a grip on the bread. Gulls'll have it out of your paws.", who: 'rocco' },
    { say: 'HONK.', who: 'biscuit' },
  ],
  'wharf-hub': [
    { pan: { x: 300, y: 200 }, dur: 1 },
    { say: "Customers! At this hour! Pickett's Tackle: rods, reels, rope, and the only freshwater pump on the wharf.", who: 'pickett' },
    { say: 'Fresh water? Where. WHERE.', who: 'bimbo' },
    { say: 'Pump by the stall, help yourself. Shopping takes sea glass, mind. Shiny bits off the beach. The gulls hoard it too.', who: 'pickett' },
    { say: "And if you've the glass for it, there's a Spinning Reel in the back. Casts a goose clean across the harbour.", who: 'pickett' },
    { pan: 'player', dur: 0.8 },
  ],
  'gullbeard-in': [
    { pan: 'boss', dur: 1.2 },
    { sound: 'kraa' }, { shake: 0.4 },
    { say: 'ARRR. A FISH! Aboard MY ship! Belay that raccoon!', who: 'gullbeard' },
    { say: "I'm a KOI. I'm not even a SEA fish!", who: 'bimbo' },
    { say: "Biscuit. When he dives, have the line ready. Hook a mast, and he'll fly right into it.", who: 'rocco' },
    { say: 'HONK!', who: 'biscuit' },
    { pan: 'player', dur: 0.8 },
  ],
  'gullbeard-out': [
    { wait: 0.8 },
    { pan: 'boss', dur: 1 },
    { say: "...Arr. Me head's like a barnacle. That red moon got right into it, it did.", who: 'gullbeard' },
    { say: 'Ye be wantin\' the elixir, then. Here: Sea-Glass Salt, from me own galley. Ground from the shiniest glass on the coast.', who: 'gullbeard' },
    { sound: 'chest' },
    { title: 'Sea-Glass Salt', sub: 'A legendary ingredient. Bimbo glows a little brighter.', hold: 3 },
    { say: 'The Tide Caves be east. Mind the deep there. Something BIG swims under the blood moon.', who: 'gullbeard' },
    { say: "...He means the shark. Doesn't he.", who: 'bimbo' },
    { pan: 'player', dur: 0.7 },
    { title: 'End of Act One', sub: 'Next: The Tide Caves', hold: 3.2 },
  ],
  ch5: [
    { fadeIn: 0.8 },
    { title: 'Act Two · Chapter Five · The Tide Caves', sub: 'Down to the sea', hold: 2.8 },
    { say: 'Caves. Wet caves. Finally, someone gets me.', who: 'bimbo' },
    { say: 'Something in those pools is watching the pack. Stay close to the middle, Biscuit.', who: 'rocco' },
  ],
  cove: [
    { pan: { x: 1100, y: 400 }, dur: 1.4 },
    { say: '...Oh. Oh, look at that water. Bimbo, look at all those SHADOWS.', who: 'rocco' },
    { say: "We're here for the Moray Pearl. Not for a fishing holiday.", who: 'bimbo' },
    { say: "The twins are in the trench off the Far Rock, but they won't come up for just anybody. Little fish first. Then bigger. Then BIGGER.", who: 'rocco' },
    { say: "...It's a fishing holiday.", who: 'bimbo' },
    { say: 'HONK.', who: 'biscuit' },
    { pan: 'player', dur: 0.9 },
    { title: 'Moonlit Cove', sub: 'Stand on a fishing spot · hold to cast · let go when it runs · [J] Fish Journal', hold: 3.4 },
  ],
  'moray-out': [
    { wait: 0.6 },
    { say: '...Sister? Why are we on a beach?', who: 'bimbo' },
    { say: "That's the twins talking. The red's gone out of them. And they coughed up... the Moray Pearl!", who: 'rocco' },
    { sound: 'chest' },
    { title: 'The Moray Pearl', sub: 'A legendary ingredient. Bimbo shines like a little moon.', hold: 3 },
    { pan: { x: 1480, y: 300 }, dur: 1.2 },
    { shake: 0.8 }, { sound: 'growl' },
    { say: "Something just moved in the trench. Something HUGE. Rocco... did that shadow just SMILE?", who: 'bimbo' },
    { say: "Reel in, everybody. We're going north. Now.", who: 'rocco' },
    { pan: 'player', dur: 0.8 },
    { say: "(The fish will still be here. Rocco can always come back and fish.)", who: 'rocco' },
  ],
};
