// Shapes mirror cg/api.py from the competition SDK.

export interface CardRef { id: number; serial: number; playerIndex?: number }

export interface Pokemon extends CardRef {
  hp: number; maxHp: number; appearThisTurn: boolean;
  energies: number[]; energyCards: CardRef[]; tools: CardRef[]; preEvolution: CardRef[];
}

export interface PlayerState {
  active: (Pokemon | null)[]; bench: Pokemon[]; benchMax: number; deckCount: number;
  discard: CardRef[]; prize: (CardRef | null)[]; handCount: number; hand: CardRef[] | null;
  poisoned: boolean; burned: boolean; asleep: boolean; paralyzed: boolean; confused: boolean;
}

export interface GameState {
  turn: number; turnActionCount: number; yourIndex: number; firstPlayer: number;
  supporterPlayed: boolean; stadiumPlayed: boolean; energyAttached: boolean; retreated: boolean;
  result: number; stadium: CardRef[]; looking: (CardRef | null)[] | null; players: PlayerState[];
}

export interface Option {
  type: number; number?: number; area?: number; index?: number; playerIndex?: number;
  toolIndex?: number; energyIndex?: number; count?: number; inPlayArea?: number;
  inPlayIndex?: number; attackId?: number; cardId?: number; serial?: number;
  specialConditionType?: number;
}

export interface SelectData {
  type: number; context: number; minCount: number; maxCount: number;
  remainDamageCounter: number; remainEnergyCost: number; option: Option[];
  deck: CardRef[] | null; contextCard: CardRef | null; effect: CardRef | null;
}

export interface Log { type: number; [k: string]: any }

export interface Attack {
  id: number; name: string; text: string; damage: number; dmgText: string; cost: number[];
}

export interface CardData {
  id: number; name: string; cardType: number; energyType: number; hp: number;
  stage: "basic" | "stage1" | "stage2" | null; ex: boolean; megaEx: boolean; tera: boolean;
  aceSpec: boolean; evolvesFrom: string | null; weakness: number | null; resistance: number | null;
  retreat: number; skills: { name: string; text: string }[]; attacks: Attack[];
  set: string; num: string; category: string; img?: boolean;
}

export interface Preset {
  id: string; name: string; archetype: string; cards: number[]; featured: number;
  types: number[]; aiDeck: boolean;
}

export interface SavedDeck { id: string; name: string; cards: number[]; updated: number }

export interface AiAction {
  kind: string; selectType: number; context: number; card?: CardRef | null;
  target?: CardRef | null; attackId?: number; cards?: CardRef[]; count?: number;
  yesno?: boolean; number?: number; thinkMs?: number;
}

export const Area = {
  DECK: 1, HAND: 2, DISCARD: 3, ACTIVE: 4, BENCH: 5, PRIZE: 6, STADIUM: 7,
  ENERGY: 8, TOOL: 9, PRE_EVOLUTION: 10, PLAYER: 11, LOOKING: 12,
} as const;

export const OptType = {
  NUMBER: 0, YES: 1, NO: 2, CARD: 3, TOOL_CARD: 4, ENERGY_CARD: 5, ENERGY: 6,
  PLAY: 7, ATTACH: 8, EVOLVE: 9, ABILITY: 10, DISCARD: 11, RETREAT: 12,
  ATTACK: 13, END: 14, SKILL: 15, SPECIAL_CONDITION: 16,
} as const;

export const CardType = {
  POKEMON: 0, ITEM: 1, TOOL: 2, SUPPORTER: 3, STADIUM: 4, BASIC_ENERGY: 5, SPECIAL_ENERGY: 6,
} as const;
