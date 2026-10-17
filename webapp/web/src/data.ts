import { CardData, Preset, SavedDeck } from "./types";

export const TYPE_NAMES = [
  "Colorless", "Grass", "Fire", "Water", "Lightning", "Psychic", "Fighting",
  "Darkness", "Metal", "Dragon", "Rainbow", "Team Rocket",
];

export const TYPE_COLORS: Record<number, { base: string; light: string; dark: string; ink: string }> = {
  0: { base: "#c9ccd6", light: "#eef0f5", dark: "#7d8293", ink: "#20232c" },
  1: { base: "#58b947", light: "#b4e8a2", dark: "#256b2b", ink: "#0e2a10" },
  2: { base: "#ef5d38", light: "#ffb79a", dark: "#8f2412", ink: "#2e0b04" },
  3: { base: "#3597e6", light: "#a8d7ff", dark: "#164f8f", ink: "#06203d" },
  4: { base: "#f4c726", light: "#fff0a3", dark: "#9c7408", ink: "#2e2302" },
  5: { base: "#ad58db", light: "#e3b9fb", dark: "#5a2186", ink: "#200a33" },
  6: { base: "#c56e35", light: "#f2c19c", dark: "#6e3412", ink: "#2b1406" },
  7: { base: "#4a5876", light: "#9daccc", dark: "#1d2438", ink: "#e8ecf6" },
  8: { base: "#97a3b0", light: "#dde4ec", dark: "#4f5966", ink: "#1a1f26" },
  9: { base: "#c4a136", light: "#efdc94", dark: "#6b5512", ink: "#261d04" },
  10: { base: "#e0699f", light: "#ffc3dc", dark: "#7c2550", ink: "#2b0a1a" },
  11: { base: "#7c4fa0", light: "#c9a8e6", dark: "#33194a", ink: "#f1e8fb" },
};

export const TRAINER_COLORS: Record<number, { base: string; light: string; dark: string; label: string }> = {
  1: { base: "#4f7dff", light: "#bccbff", dark: "#1d3a9a", label: "Item" },
  2: { base: "#9b6bff", light: "#d8c6ff", dark: "#4a2a9e", label: "Pokémon Tool" },
  3: { base: "#ff8a3d", light: "#ffd1b0", dark: "#a1430c", label: "Supporter" },
  4: { base: "#28b989", light: "#a8eed6", dark: "#0d6247", label: "Stadium" },
};

let cardMap: Map<number, CardData> = new Map();
let cardList: CardData[] = [];

export async function loadCards(): Promise<CardData[]> {
  if (cardList.length) return cardList;
  const r = await fetch("/api/cards", { cache: "no-store" });
  cardList = await r.json();
  cardMap = new Map(cardList.map((c) => [c.id, c]));
  return cardList;
}

export const card = (id: number | undefined | null): CardData | undefined =>
  id ? cardMap.get(id) : undefined;

const SYM: Record<string, string> = { G: "Grass", R: "Fire", W: "Water", L: "Lightning", P: "Psychic", F: "Fighting", D: "Darkness", M: "Metal", N: "Dragon", C: "Colorless" };
/** Card name with {X} energy tokens spelled out, for plain-text places (logs, menus). */
export const cardName = (id: number | undefined | null) =>
  (card(id)?.name ?? "a card").replace(/\{([A-Z])\}/g, (_, k) => SYM[k] ?? k);

export function attackById(id: number | undefined) {
  if (id == null) return undefined;
  for (const c of cardList) for (const a of c.attacks) if (a.id === id) return a;
  return undefined;
}

export async function loadPresets(): Promise<Preset[]> {
  const r = await fetch("/api/presets");
  return r.json();
}

export async function validateDeck(cards: number[]): Promise<{ ok: boolean; message: string }> {
  const r = await fetch("/api/validate", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ cards }),
  });
  return r.json();
}

const DECKS_KEY = "ptcg.decks.v1";

export function loadSavedDecks(): SavedDeck[] {
  try {
    return JSON.parse(localStorage.getItem(DECKS_KEY) || "[]");
  } catch {
    return [];
  }
}

export function saveDecks(decks: SavedDeck[]) {
  try {
    localStorage.setItem(DECKS_KEY, JSON.stringify(decks));
  } catch {
    /* storage unavailable */
  }
}

export function isBasicEnergy(c?: CardData) {
  return c?.cardType === 5;
}

/** Client-side rule check. The engine (POST /api/validate) has the final word. */
export function deckProblems(cards: number[]): string[] {
  const out: string[] = [];
  if (cards.length !== 60) out.push(`${cards.length}/60 cards`);
  const byName = new Map<string, number>();
  let ace = 0;
  let basics = 0;
  for (const id of cards) {
    const c = card(id);
    if (!c) continue;
    if (!isBasicEnergy(c)) byName.set(c.name, (byName.get(c.name) || 0) + 1);
    if (c.aceSpec) ace++;
    if (c.cardType === 0 && c.stage === "basic") basics++;
  }
  for (const [n, k] of byName) if (k > 4) out.push(`${k}× ${n} (max 4 per name)`);
  if (ace > 1) out.push(`${ace} ACE SPEC cards (max 1)`);
  if (cards.length && basics === 0) out.push("needs at least one Basic Pokémon");
  return out;
}

export function deckBreakdown(cards: number[]) {
  let p = 0, t = 0, e = 0;
  for (const id of cards) {
    const ct = card(id)?.cardType;
    if (ct === 0) p++;
    else if (ct === 5 || ct === 6) e++;
    else t++;
  }
  return { pokemon: p, trainer: t, energy: e };
}

export function stageLabel(c: CardData) {
  if (c.megaEx) return "MEGA";
  if (c.stage === "stage2") return "STAGE 2";
  if (c.stage === "stage1") return "STAGE 1";
  return "BASIC";
}

export function cardKindLabel(c: CardData) {
  if (c.cardType === 0) return "Pokémon";
  if (c.cardType === 5) return "Basic Energy";
  if (c.cardType === 6) return "Special Energy";
  return TRAINER_COLORS[c.cardType]?.label ?? "Trainer";
}

const ART_KEY = "ptcg.art.v1";
export type ArtMode = "official" | "generated";
export function loadArtMode(): ArtMode {
  try { return localStorage.getItem(ART_KEY) === "generated" ? "generated" : "official"; } catch { return "official"; }
}
export function saveArtMode(m: ArtMode) {
  try { localStorage.setItem(ART_KEY, m); } catch { /* storage unavailable */ }
}
export const hasOfficialArt = () => cardList.some((c) => c.img);
