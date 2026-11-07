/**
 * Biscuit's hat collection. Beat something that wears a hat and Biscuit snatches it (always from a boss,
 * now and then from the rest) and wears the newest one. Pure vanity, and the point.
 */
import type { EnemyKind } from './rooms';

export interface HatDef { id: string; name: string; from: EnemyKind; line: string }

export const HATS: HatDef[] = [
  { id: 'lilypad', name: 'Lily-Pad Beret', from: 'frog', line: 'Biscuit is wearing a lily pad now. Nobody asked him to.' },
  { id: 'acorn', name: 'Acorn Cap', from: 'squirrel', line: 'Biscuit pinches the squirrel\'s acorn cap. It fits him perfectly, which is worrying.' },
  { id: 'foxhat', name: 'Bushy Tail Hat', from: 'fox', line: 'Biscuit swipes the fox\'s spare tail and wears it as a hat. The fox is too embarrassed to come back for it.' },
  { id: 'lamp', name: 'Miner\'s Lamp', from: 'badger', line: 'Biscuit takes the badger\'s miner\'s lamp. Now he can glare at things in the dark.' },
  { id: 'bucket', name: 'Barnacle Bucket', from: 'crab', line: 'Biscuit puts the crab\'s bucket on his head and walks into a post.' },
  { id: 'sailor', name: 'Sailor\'s Cap', from: 'gull', line: 'Biscuit steals the gull\'s sailor cap. He salutes no one.' },
  { id: 'pillbox', name: 'Bellhop\'s Pillbox', from: 'bellhop', line: 'Biscuit snatches the bellhop\'s pillbox cap. He expects a tip.' },
  { id: 'helm', name: 'Turtle-Shell Helm', from: 'turtle', line: 'Biscuit wears the turtle\'s shield as a helmet. He is now unbearable.' },
  { id: 'crust', name: 'Bread-Crust Bonnet', from: 'mimic', line: 'Biscuit wears the mimic loaf\'s crust. Then he eats some of it.' },
  { id: 'shellcap', name: 'Mossy Shell Cap', from: 'elder', line: 'Biscuit takes a mossy chip of Old Snapper\'s shell and balances it on his head. Snapper lets him.' },
  { id: 'straw', name: 'Ferryman\'s Straw Hat', from: 'heron', line: 'Biscuit steals the Ferryman\'s straw hat. The Heron sighs a very long sigh.' },
  { id: 'kingcrown', name: 'Burrow King\'s Crown', from: 'king', line: 'Biscuit takes the Burrow King\'s crown. It falls over his eyes. He refuses to take it off.' },
  { id: 'tricorn', name: 'Gullbeard\'s Tricorn', from: 'gullbeard', line: 'Biscuit claims Gullbeard\'s tricorn. "Arr," he does not say, but you can tell he means it.' },
  { id: 'toque', name: 'Chef\'s Toque', from: 'pelican', line: 'Biscuit steals the Pelican Chef\'s toque. It is taller than he is.' },
  { id: 'plume', name: 'Black Plume', from: 'blackswan', line: 'Biscuit plucks the plume off the Black Swan\'s helm and wears it. Dramatic.' },
  { id: 'tiara', name: 'The Swan Queen\'s Tiara', from: 'queen', line: 'Biscuit takes the Swan Queen\'s tiara. She lets him. Long live King Biscuit.' },
];
export const HAT_BY_ID: Record<string, HatDef> = Object.fromEntries(HATS.map(h => [h.id, h]));
