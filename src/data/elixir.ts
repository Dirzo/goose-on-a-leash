/** The six legendary ingredients for the elixir that restores Bimbo's power, brewed before the Blood Shark. */
export interface Ingredient { id: string; name: string; color: string; where: string }

export const INGREDIENTS: readonly Ingredient[] = [
  { id: 'lilydew', name: 'Lilydew', color: '#c8f0d8', where: 'Reedmarsh' },
  { id: 'honey', name: 'Firefly Honey', color: '#f2c94c', where: 'Hollowbark Woods' },
  { id: 'sap', name: 'Heartwood Sap', color: '#d89050', where: 'Grizzlewood' },
  { id: 'salt', name: 'Sea-Glass Salt', color: '#8fe0d0', where: "Captain Gullbeard's galley, Driftwood Wharf" },
  { id: 'pearl', name: 'Moray Pearl', color: '#f0e8ff', where: 'The Tide Caves' },
  { id: 'tear', name: "The Swan Queen's Tear", color: '#a8d8ff', where: 'Castle Honkmore' },
];
export const ingredientById = (id: string) => INGREDIENTS.find(i => i.id === id);
