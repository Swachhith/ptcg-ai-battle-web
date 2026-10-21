import { attackById, card, cardName } from "../data";
import { AiAction, Area, CardRef, GameState, OptType, Option, Pokemon, SelectData } from "../types";

export const CONTEXT_PROMPT: Record<number, string> = {
  0: "Your move",
  1: "Choose your Active Pokémon",
  2: "Choose Pokémon to put on your Bench",
  3: "Choose a Pokémon to switch into the Active Spot",
  4: "Choose a Pokémon to put into the Active Spot",
  5: "Choose Pokémon to put onto the Bench",
  6: "Choose Pokémon to put into play",
  7: "Choose cards to put into your hand",
  8: "Choose cards to discard",
  9: "Choose cards to shuffle into the deck",
  10: "Choose cards to put on the bottom of the deck",
  11: "Choose cards to put into the Prizes",
  12: "Choose cards to keep where they are",
  13: "Choose a Pokémon to put damage counters on",
  14: "Place damage counters",
  15: "Choose a Pokémon to damage",
  16: "Choose a Pokémon to remove damage counters from",
  17: "Choose a Pokémon to heal",
  18: "Choose the Pokémon to evolve",
  19: "Choose the evolution",
  20: "Choose a Pokémon to devolve",
  21: "Choose a Pokémon to attach to",
  22: "Choose a card to attach",
  23: "Choose a Pokémon to move cards from",
  24: "Choose a card to look at",
  25: "Choose a target",
  26: "Choose Energy cards to discard",
  27: "Choose a Pokémon Tool to discard",
  28: "Choose an Energy card to move",
  29: "Choose cards to discard",
  30: "Choose Energy to discard",
  31: "Choose Energy to return to your hand",
  32: "Choose Energy to shuffle into the deck",
  33: "Choose Energy to move",
  34: "Choose which effect resolves first",
  35: "Choose an attack",
  36: "Choose an attack to disable",
  37: "Choose an evolution",
  38: "How many cards will you draw?",
  39: "How many damage counters?",
  40: "How many damage counters to remove?",
  41: "Do you want to go first?",
  42: "Your opponent has no Basic Pokémon — redraw?",
  43: "Activate this effect?",
  44: "Use the first effect?",
  45: "Devolve further?",
  46: "Call heads?",
  47: "Choose a Special Condition to apply",
  48: "Choose a Special Condition to recover from",
};

export const AREA_LABEL: Record<number, string> = {
  1: "Deck", 2: "Hand", 3: "Discard", 4: "Active", 5: "Bench", 6: "Prize", 7: "Stadium",
  8: "Energy", 9: "Tool", 10: "Pre-evolution", 11: "Player", 12: "Looking",
};

export const CONDITION_NAMES = ["Poisoned", "Burned", "Asleep", "Paralyzed", "Confused"];

export function cardAt(s: GameState, sel: SelectData | null, area?: number, index = 0, player = s.yourIndex): CardRef | null {
  const p = s.players[player];
  if (!p) return null;
  switch (area) {
    case Area.HAND: return p.hand?.[index] ?? null;
    case Area.ACTIVE: return p.active[0] ?? null;
    case Area.BENCH: return p.bench[index] ?? null;
    case Area.DISCARD: return p.discard[index] ?? null;
    case Area.PRIZE: return p.prize[index] ?? null;
    case Area.STADIUM: return s.stadium[0] ?? null;
    case Area.DECK: return sel?.deck?.[index] ?? null;
    case Area.LOOKING: return s.looking?.[index] ?? null;
  }
  return null;
}

export interface OptionView {
  i: number;
  opt: Option;
  label: string;
  sub?: string;
  card?: CardRef | null;     // the card the option is "about"
  target?: CardRef | null;   // in-play Pokémon it lands on
  place?: string;            // where the card is
  attackId?: number;
}

const owner = (s: GameState, p?: number) => (p == null || p === s.yourIndex ? "Your" : "AI's");

function placeLabel(s: GameState, area?: number, index?: number, player?: number) {
  if (area == null) return "";
  const who = owner(s, player);
  if (area === Area.BENCH) return `${who} Bench ${(index ?? 0) + 1}`;
  return `${who} ${AREA_LABEL[area] ?? ""}`;
}

export function describeOption(s: GameState, sel: SelectData, opt: Option, i: number): OptionView {
  const me = s.yourIndex;
  const v: OptionView = { i, opt, label: "" };
  switch (opt.type) {
    case OptType.NUMBER: v.label = String(opt.number); break;
    case OptType.YES: v.label = "Yes"; break;
    case OptType.NO: v.label = "No"; break;
    case OptType.CARD: {
      v.card = cardAt(s, sel, opt.area, opt.index, opt.playerIndex ?? me);
      v.place = placeLabel(s, opt.area, opt.index, opt.playerIndex);
      v.label = v.card && v.card.id ? cardName(v.card.id) : "Face-down card";
      break;
    }
    case OptType.TOOL_CARD:
    case OptType.ENERGY_CARD:
    case OptType.ENERGY: {
      const poke = cardAt(s, sel, opt.area, opt.index, opt.playerIndex ?? me) as Pokemon | null;
      const list = opt.type === OptType.TOOL_CARD ? poke?.tools : poke?.energyCards;
      const k = (opt.type === OptType.TOOL_CARD ? opt.toolIndex : opt.energyIndex) ?? 0;
      v.card = list?.[k] ?? null;
      v.target = poke;
      v.label = v.card ? cardName(v.card.id) : "Energy";
      v.sub = `on ${poke ? cardName(poke.id) : "?"}` + (opt.count && opt.count > 1 ? ` · ×${opt.count}` : "");
      v.place = placeLabel(s, opt.area, opt.index, opt.playerIndex);
      break;
    }
    case OptType.PLAY: {
      v.card = cardAt(s, sel, Area.HAND, opt.index, me);
      const c = card(v.card?.id);
      v.label = c?.cardType === 0 ? `Put ${c.name} on your Bench` : `Play ${c?.name ?? "card"}`;
      break;
    }
    case OptType.ATTACH:
    case OptType.EVOLVE: {
      v.card = cardAt(s, sel, opt.area ?? Area.HAND, opt.index, me);
      v.target = cardAt(s, sel, opt.inPlayArea, opt.inPlayIndex, me);
      const where = placeLabel(s, opt.inPlayArea, opt.inPlayIndex, me);
      v.label = opt.type === OptType.ATTACH
        ? `Attach ${cardName(v.card?.id)} to ${cardName(v.target?.id)}`
        : `Evolve ${cardName(v.target?.id)} into ${cardName(v.card?.id)}`;
      v.sub = where;
      break;
    }
    case OptType.ABILITY: {
      v.card = cardAt(s, sel, opt.area, opt.index, me);
      const c = card(v.card?.id);
      v.label = `Use ${c?.skills[0]?.name ?? "Ability"}`;
      v.sub = `${c?.name ?? ""} · ${placeLabel(s, opt.area, opt.index, me)}`;
      break;
    }
    case OptType.DISCARD: {
      v.card = cardAt(s, sel, opt.area, opt.index, me);
      v.label = `Discard ${cardName(v.card?.id)}`;
      v.sub = placeLabel(s, opt.area, opt.index, me);
      break;
    }
    case OptType.RETREAT: {
      v.card = s.players[me].active[0];
      v.label = `Retreat ${cardName(v.card?.id)}`;
      break;
    }
    case OptType.ATTACK: {
      const a = attackById(opt.attackId);
      v.attackId = opt.attackId;
      v.card = sel.type === 0 ? s.players[me].active[0] : null;
      v.label = a?.name ?? "Attack";
      v.sub = a?.dmgText ? `${a.dmgText} damage` : undefined;
      break;
    }
    case OptType.END: v.label = "End turn"; break;
    case OptType.SKILL: {
      v.card = opt.cardId ? { id: opt.cardId, serial: opt.serial ?? 0 } : null;
      v.label = opt.cardId ? cardName(opt.cardId) : "Special Condition check";
      break;
    }
    case OptType.SPECIAL_CONDITION:
      v.label = CONDITION_NAMES[opt.specialConditionType ?? 0] ?? "Condition";
      break;
    default: v.label = `Option ${i + 1}`;
  }
  return v;
}

export function isForced(sel: SelectData) {
  const n = sel.option.length;
  if (sel.type === 0) return false;
  return (n === 1 && sel.minCount >= 1) || (sel.minCount === n && sel.maxCount === n);
}

export function narrate(a: AiAction): { text: string; big?: boolean } {
  const n = (c?: { id: number } | null) => (c ? cardName(c.id) : "a card");
  switch (a.kind) {
    case "play": {
      const c = card(a.card?.id);
      return { text: c?.cardType === 0 ? `AI benched ${c.name}` : `AI played ${n(a.card)}` };
    }
    case "attach": return { text: `AI attached ${n(a.card)} to ${n(a.target)}` };
    case "evolve": return { text: `AI evolved ${n(a.target)} into ${n(a.card)}`, big: true };
    case "ability": return { text: `AI used ${card(a.card?.id)?.skills[0]?.name ?? "an Ability"} (${n(a.card)})` };
    case "discard": return { text: `AI discarded ${n(a.card)}` };
    case "retreat": return { text: `AI retreated ${n(a.card)}` };
    case "attack": return { text: `${n(a.card)} used ${attackById(a.attackId)?.name ?? "an attack"}!`, big: true };
    case "end": return { text: "AI ended its turn" };
    case "choose": {
      if (a.context === 41) return { text: a.yesno ? "AI chose to go first" : "AI chose to go second" };
      if (a.yesno != null) return { text: `AI chose ${a.yesno ? "yes" : "no"}` };
      if (a.number != null) return { text: `AI chose ${a.number}` };
      if (a.attackId != null) return { text: `AI chose ${attackById(a.attackId)?.name ?? "an attack"}` };
      if (a.cards && a.cards.length) return { text: `AI chose ${a.cards.map((c) => n(c)).join(", ")}` };
      if (a.context === 1) return { text: "AI placed its Active Pokémon" };
      if (a.context === 2) return { text: "AI placed its Bench" };
      return { text: a.count ? `AI chose ${a.count} card${a.count > 1 ? "s" : ""}` : "AI is thinking…" };
    }
  }
  return { text: "AI is thinking…" };
}
