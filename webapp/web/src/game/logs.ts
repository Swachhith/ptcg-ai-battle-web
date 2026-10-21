import { attackById, cardName } from "../data";
import { Log } from "../types";
import { AREA_LABEL } from "./options";

export interface LogLine { text: string; kind: "turn" | "attack" | "damage" | "ko" | "info" | "result" | "coin"; who: "me" | "ai" | "none" }

const COND = ["", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "Poisoned", "Burned", "Asleep", "Paralyzed", "Confused"];
const REASONS: Record<number, string> = {
  1: "all Prize cards were taken",
  2: "a player couldn't draw at the start of their turn",
  3: "a player had no Pokémon left in play",
  4: "a card effect",
};
export const reasonText = (r?: number | null) => (r ? REASONS[r] ?? "" : "");

/** Human-perspective logs into readable lines. Consecutive opponent draws are merged. */
export function formatLogs(logs: Log[], human: number): LogLine[] {
  const out: LogLine[] = [];
  const who = (p?: number) => (p === human ? "me" : p == null ? "none" : "ai") as LogLine["who"];
  const name = (p?: number) => (p === human ? "You" : "AI");
  let drawRun = { p: -1, n: 0 };
  const flush = () => {
    if (drawRun.n) out.push({ text: `${name(drawRun.p)} drew ${drawRun.n} card${drawRun.n > 1 ? "s" : ""}`, kind: "info", who: who(drawRun.p) });
    drawRun = { p: -1, n: 0 };
  };
  for (const l of logs) {
    if (l.type === 5 || (l.type === 4 && l.playerIndex !== human)) {
      if (drawRun.p !== l.playerIndex) flush();
      drawRun.p = l.playerIndex; drawRun.n++;
      continue;
    }
    if (l.type === 4) {
      if (drawRun.p !== l.playerIndex) flush();
      out.push({ text: `You drew ${cardName(l.cardId)}`, kind: "info", who: "me" });
      continue;
    }
    flush();
    const p = l.playerIndex;
    switch (l.type) {
      case 1: if (!l.hasBasicPokemon) out.push({ text: `${name(p)} had no Basic Pokémon — mulligan`, kind: "info", who: who(p) }); break;
      case 2: out.push({ text: p === human ? "Your turn" : "AI's turn", kind: "turn", who: who(p) }); break;
      case 6: {
        if (!l.cardId) break;
        const from = AREA_LABEL[l.fromArea] ?? "?";
        const to = AREA_LABEL[l.toArea] ?? "?";
        if (l.toArea === 3 && (l.fromArea === 4 || l.fromArea === 5)) out.push({ text: `${cardName(l.cardId)} was Knocked Out`, kind: "ko", who: who(p) });
        else if (l.toArea === 2 && l.fromArea === 6) out.push({ text: `${name(p)} took a Prize card`, kind: "info", who: who(p) });
        else out.push({ text: `${cardName(l.cardId)}: ${from} → ${to}`, kind: "info", who: who(p) });
        break;
      }
      case 7: {
        if (l.fromArea === 6 && l.toArea === 2) out.push({ text: `${name(p)} took a Prize card`, kind: "info", who: who(p) });
        else if (l.toArea === 2 && l.fromArea === 1) out.push({ text: `${name(p)} put a card from the deck into their hand`, kind: "info", who: who(p) });
        break;
      }
      case 8: out.push({ text: `${name(p)} switched ${cardName(l.cardIdBench)} into the Active Spot`, kind: "info", who: who(p) }); break;
      case 10: out.push({ text: `${name(p)} played ${cardName(l.cardId)}`, kind: "info", who: who(p) }); break;
      case 11: out.push({ text: `${name(p)} attached ${cardName(l.cardId)} to ${cardName(l.cardIdTarget)}`, kind: "info", who: who(p) }); break;
      case 12: out.push({ text: `${name(p)} evolved ${cardName(l.cardIdTarget)} into ${cardName(l.cardId)}`, kind: "info", who: who(p) }); break;
      case 13: out.push({ text: `${cardName(l.cardIdTarget)} devolved`, kind: "info", who: who(p) }); break;
      case 14: out.push({ text: `${cardName(l.cardId)} moved to ${cardName(l.cardIdAfter)}`, kind: "info", who: who(p) }); break;
      case 15: out.push({ text: `${cardName(l.cardId)} used ${attackById(l.attackId)?.name ?? "an attack"}`, kind: "attack", who: who(p) }); break;
      case 16: {
        const v = l.value ?? 0;
        if (v < 0) out.push({ text: `${cardName(l.cardId)} took ${-v} damage`, kind: "damage", who: who(p) });
        else if (v > 0) out.push({ text: `${cardName(l.cardId)} healed ${v}`, kind: "info", who: who(p) });
        break;
      }
      case 17: case 18: case 19: case 20: case 21:
        out.push({ text: `${cardName(l.cardId)} ${l.isRecover ? "recovered from being" : "is now"} ${COND[l.type]}`, kind: "info", who: who(p) });
        break;
      case 22: out.push({ text: `Coin flip: ${l.head ? "Heads" : "Tails"}`, kind: "coin", who: who(p) }); break;
      case 23: out.push({ text: l.result === 2 ? "The game is a draw" : `${l.result === human ? "You win" : "AI wins"} — ${reasonText(l.reason)}`, kind: "result", who: "none" }); break;
    }
  }
  flush();
  return out;
}
