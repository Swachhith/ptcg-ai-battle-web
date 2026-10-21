import { useCallback, useEffect, useRef, useState } from "react";
import { AiAction, GameState, Log, SelectData } from "../types";
import { formatLogs, LogLine } from "./logs";
import { isForced, narrate } from "./options";

export type Phase = "connecting" | "loading" | "playing" | "over" | "error";

export interface Banner { id: number; text: string; big?: boolean; who: "ai" | "me" | "sys" }

export interface GameOver { result: number; reason: number | null; humanSeat: number; aiDeck: number[] }

export interface GameView {
  phase: Phase;
  state: GameState | null;
  select: SelectData | null;
  humanSeat: number;
  log: LogLine[];
  banner: Banner | null;
  aiAction: AiAction | null;
  over: GameOver | null;
  error: string | null;
  speed: number;
  waitingForAi: boolean;
}

interface Msg { type: string; [k: string]: any }

const DELAY: Record<string, number> = {
  attack: 1500, evolve: 1000, play: 750, attach: 700, ability: 900, retreat: 800,
  discard: 650, end: 800, choose: 520,
};

export function useGame(deck: number[], aiDeck: number[] | null, seat: number | null) {
  const [view, setView] = useState<GameView>({
    phase: "connecting", state: null, select: null, humanSeat: 0, log: [], banner: null,
    aiAction: null, over: null, error: null, speed: 1, waitingForAi: false,
  });
  const ws = useRef<WebSocket | null>(null);
  const queue = useRef<Msg[]>([]);
  const busy = useRef(false);
  const speed = useRef(1);
  const human = useRef(0);
  const bannerId = useRef(0);

  const patch = useCallback((p: Partial<GameView>) => setView((v) => ({ ...v, ...p })), []);

  const send = useCallback((indices: number[]) => {
    setView((v) => ({ ...v, select: null, waitingForAi: true }));
    ws.current?.send(JSON.stringify({ type: "answer", indices }));
  }, []);

  const pump = useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    while (queue.current.length) {
      const m = queue.current.shift()!;
      if (m.type === "ai_step") {
        const a = m.action as AiAction;
        const nar = narrate(a);
        const quiet = a.kind === "choose" && !a.cards?.length && a.yesno == null && a.number == null && a.attackId == null;
        setView((v) => ({
          ...v,
          state: m.state ?? v.state,
          aiAction: a,
          waitingForAi: true,
          banner: quiet && v.banner?.who === "ai" ? v.banner : { id: ++bannerId.current, text: nar.text, big: nar.big, who: "ai" },
        }));
        const d = (DELAY[a.kind] ?? 500) * (quiet ? 0.6 : 1);
        if (speed.current < 50) await wait(d / speed.current);
      } else if (m.type === "prompt") {
        const sel = m.select as SelectData;
        const lines = formatLogs(m.logs || [], human.current);
        setView((v) => ({
          ...v, state: m.state, log: lines.length ? [...v.log, ...lines].slice(-400) : v.log,
          waitingForAi: false, aiAction: null,
        }));
        if (isForced(sel)) {
          await wait(260);
          const all = sel.option.map((_, i) => i).slice(0, Math.max(sel.minCount, 1));
          send(sel.minCount === sel.option.length ? sel.option.map((_, i) => i) : all);
        } else {
          setView((v) => ({ ...v, select: sel }));
        }
      } else if (m.type === "game_over") {
        const lines = formatLogs(m.logs || [], human.current);
        setView((v) => ({
          ...v, state: m.state ?? v.state, select: null, waitingForAi: false, phase: "over",
          log: [...v.log, ...lines],
          over: { result: m.result, reason: m.reason, humanSeat: m.humanSeat, aiDeck: m.aiDeck },
        }));
      } else if (m.type === "invalid") {
        setView((v) => ({ ...v, banner: { id: ++bannerId.current, text: m.message, who: "sys" } }));
      } else if (m.type === "started") {
        human.current = m.humanSeat;
        setView((v) => ({
          ...v, phase: "playing", humanSeat: m.humanSeat,
          banner: { id: ++bannerId.current, text: m.humanSeat === 0 ? "You won the coin toss" : "The AI won the coin toss", who: "sys" },
        }));
      } else if (m.type === "loading") {
        patch({ phase: "loading" });
      } else if (m.type === "error") {
        patch({ phase: "error", error: m.message });
      }
    }
    busy.current = false;
  }, [patch, send]);

  useEffect(() => {
    const proto = location.protocol === "https:" ? "wss" : "ws";
    const sock = new WebSocket(`${proto}://${location.host}/ws/game`);
    ws.current = sock;
    sock.onopen = () => sock.send(JSON.stringify({ deck, aiDeck, seat }));
    sock.onmessage = (e) => {
      queue.current.push(JSON.parse(e.data));
      pump();
    };
    sock.onclose = () => {
      setView((v) => (v.phase === "playing" || v.phase === "connecting" || v.phase === "loading"
        ? { ...v, phase: "error", error: v.error ?? "Connection to the game server closed." } : v));
    };
    return () => {
      try { sock.send(JSON.stringify({ type: "quit" })); } catch { /* closed */ }
      sock.close();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const setSpeed = useCallback((s: number) => { speed.current = s; patch({ speed: s }); }, [patch]);

  return { view, send, setSpeed };
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
