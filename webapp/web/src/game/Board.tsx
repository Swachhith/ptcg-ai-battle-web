import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import { Card, CardBack } from "../components/Card";
import { EnergyIcon } from "../components/EnergyIcon";
import { card as getCard, cardName } from "../data";
import { CardRef, GameState, PlayerState, Pokemon } from "../types";
import { OptionView } from "./options";

export interface Interaction {
  /** serial -> options whose subject is that card */
  sources: Map<number, OptionView[]>;
  /** serials selectable in the current chooser */
  pickable: Set<number>;
  picked: Set<number>;
  /** during drag: target serials for the dragged card */
  dropTargets: Set<number>;
  benchDrop: boolean;
  acting: Set<number>;
  onCard: (ref: CardRef, e: React.MouseEvent) => void;
  onHover: (id: number | null) => void;
  /** pointer-down on a hand card: starts a drag, or acts as a click if it never moves */
  onHandPointer: (ref: CardRef, e: React.PointerEvent) => void;
  onDrop: (targetSerial: number | "bench" | "board", fromSerial?: number) => void;
}

const spring = { type: "spring", stiffness: 380, damping: 32 } as const;

function DamagePopups({ hp }: { hp: number }) {
  const prev = useRef(hp);
  const [pops, setPops] = useState<{ id: number; v: number }[]>([]);
  useEffect(() => {
    const d = hp - prev.current;
    prev.current = hp;
    if (d !== 0) {
      const id = Date.now() + Math.random();
      setPops((p) => [...p, { id, v: d }]);
      setTimeout(() => setPops((p) => p.filter((x) => x.id !== id)), 1500);
    }
  }, [hp]);
  return (
    <AnimatePresence>
      {pops.map((p) => (
        <motion.div
          key={p.id}
          className={`dmg-pop ${p.v > 0 ? "heal" : ""}`}
          initial={{ opacity: 0, y: 10, scale: 0.6 }}
          animate={{ opacity: 1, y: -28, scale: 1.15 }}
          exit={{ opacity: 0, y: -50 }}
          transition={{ duration: 0.5 }}
        >
          {p.v > 0 ? `+${p.v}` : p.v}
        </motion.div>
      ))}
    </AnimatePresence>
  );
}

function Conditions({ p }: { p: PlayerState }) {
  const list = [
    p.poisoned && ["PSN", "poison"], p.burned && ["BRN", "burn"], p.asleep && ["SLP", "sleep"],
    p.paralyzed && ["PAR", "para"], p.confused && ["CNF", "conf"],
  ].filter(Boolean) as string[][];
  if (!list.length) return null;
  return (
    <div className="conditions">
      {list.map(([t, c]) => <span key={t} className={`cond ${c}`}>{t}</span>)}
    </div>
  );
}

export function PokemonSlot({
  pk, ix, active, owner, conditions,
}: { pk: Pokemon; ix: Interaction; active?: boolean; owner: "me" | "ai"; conditions?: PlayerState }) {
  const s = pk.serial;
  const hasOpts = ix.sources.has(s);
  const pickable = ix.pickable.has(s);
  const dropT = ix.dropTargets.has(s);
  const dmg = pk.maxHp - pk.hp;
  const ratio = pk.maxHp ? pk.hp / pk.maxHp : 0;
  const cls = [
    "slot", active ? "active" : "bench", owner,
    hasOpts && "has-opts", pickable && "pickable", ix.picked.has(s) && "picked",
    dropT && "drop-target", ix.acting.has(s) && "acting",
  ].filter(Boolean).join(" ");
  return (
    <motion.div
      layout
      layoutId={`c${s}`}
      className={cls}
      transition={spring}
      initial={{ opacity: 0, scale: 0.7, y: owner === "me" ? 40 : -40 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.4, rotate: owner === "me" ? -12 : 12, filter: "grayscale(1)" }}
      data-drop={s}
    >
      <div className="slot-stack">
        {pk.preEvolution.slice(0, 2).map((pe, i) => (
          <div key={pe.serial} className="pre-evo" style={{ transform: `translate(${-(i + 1) * 5}px, ${-(i + 1) * 5}px)` }} />
        ))}
        <Card
          id={pk.id}
          cssWidth={active ? "var(--active-w)" : "var(--bench-w)"}
          compact
          onClick={(e) => ix.onCard(pk, e)}
          onHover={ix.onHover}
        >
          {dmg > 0 && <div className="dmg-badge">{dmg}</div>}
          <div className="hp-bar">
            <div className={`hp-fill ${ratio < 0.34 ? "low" : ratio < 0.67 ? "mid" : ""}`} style={{ width: `${ratio * 100}%` }} />
            <span>{pk.hp}/{pk.maxHp}</span>
          </div>
        </Card>
        <DamagePopups hp={pk.hp} />
      </div>
      <div className="attached">
        {pk.energies.map((t, i) => <EnergyIcon key={i} type={t} size="var(--pip)" />)}
        {pk.tools.map((t) => (
          <span key={t.serial} className="tool-chip" onMouseEnter={() => ix.onHover(t.id)} onMouseLeave={() => ix.onHover(null)}>
            ⚙ {cardName(t.id)}
          </span>
        ))}
      </div>
      {active && conditions && <Conditions p={conditions} />}
    </motion.div>
  );
}

function Prizes({ p, label }: { p: PlayerState; label: string }) {
  return (
    <div className="prizes" title={`${label}: ${p.prize.length} Prize cards left`}>
      <div className="prize-grid">
        {Array.from({ length: 6 }, (_, i) => {
          const c = p.prize[i];
          if (i >= p.prize.length) return <div key={i} className="prize-empty" />;
          return c && c.id ? <Card key={i} id={c.id} cssWidth="var(--prize-w)" compact /> : <CardBack key={i} style={{ "--w": "var(--prize-w)" } as React.CSSProperties} />;
        })}
      </div>
      <div className="pile-label"><b>{p.prize.length}</b> prizes</div>
    </div>
  );
}

function Piles({ p, onDiscard, onHover }: { p: PlayerState; onDiscard: () => void; onHover: (id: number | null) => void }) {
  const top = p.discard[p.discard.length - 1];
  return (
    <div className="piles">
      <div className="pile deck" title={`${p.deckCount} cards in deck`}>
        <div className="deck-stack" style={{ "--depth": Math.min(8, Math.ceil(p.deckCount / 7)) } as React.CSSProperties}>
          {p.deckCount > 0 ? <CardBack style={{ "--w": "var(--pile-w)" } as React.CSSProperties} /> : <div className="pile-empty" />}
        </div>
        <div className="pile-label"><b>{p.deckCount}</b> deck</div>
      </div>
      <div className="pile discard" onClick={onDiscard} title="View discard pile">
        {top ? <Card id={top.id} cssWidth="var(--pile-w)" compact onHover={onHover} /> : <div className="pile-empty" />}
        <div className="pile-label"><b>{p.discard.length}</b> discard</div>
      </div>
    </div>
  );
}

export function Side({
  st, seat, owner, ix, onDiscard,
}: { st: GameState; seat: number; owner: "me" | "ai"; ix: Interaction; onDiscard: (seat: number) => void }) {
  const p = st.players[seat];
  const act = p.active[0];
  const benchCls = `bench-row ${ix.benchDrop && owner === "me" ? "drop-zone" : ""}`;
  const bench = (
    <div className={benchCls} data-drop={owner === "me" ? "bench" : undefined}>
      <AnimatePresence mode="popLayout">
        {p.bench.map((b) => <PokemonSlot key={b.serial} pk={b} ix={ix} owner={owner} />)}
      </AnimatePresence>
      {Array.from({ length: Math.max(0, p.benchMax - p.bench.length) }, (_, i) => (
        <div key={"e" + i} className="slot-empty" />
      ))}
    </div>
  );
  const active = (
    <div className="active-row">
      <AnimatePresence mode="popLayout">
        {act ? (
          <PokemonSlot key={act.serial} pk={act} ix={ix} active owner={owner} conditions={p} />
        ) : p.active.length ? (
          <motion.div key="facedown" className="slot active"><CardBack style={{ "--w": "var(--active-w)" } as React.CSSProperties} /></motion.div>
        ) : (
          <div key="none" className="slot-empty active" />
        )}
      </AnimatePresence>
    </div>
  );
  return (
    <div className={`side ${owner}`}>
      <Prizes p={p} label={owner === "me" ? "You" : "AI"} />
      <div className="field">
        {owner === "ai" ? <>{bench}{active}</> : <>{active}{bench}</>}
      </div>
      <Piles p={p} onDiscard={() => onDiscard(seat)} onHover={ix.onHover} />
    </div>
  );
}

export function Hand({ cards, ix, canAct }: { cards: CardRef[]; ix: Interaction; canAct: boolean }) {
  const n = cards.length;
  return (
    <div className="hand" style={{ "--n": n } as React.CSSProperties}>
      <AnimatePresence mode="popLayout">
        {cards.map((c, i) => {
          const opts = ix.sources.get(c.serial);
          const playable = canAct && !!opts?.length;
          const rot = n > 1 ? (i - (n - 1) / 2) * Math.min(4, 26 / n) : 0;
          const lift = Math.abs(i - (n - 1) / 2) * Math.min(5, 30 / n);
          return (
            <motion.div
              key={c.serial}
              layoutId={c.id ? `c${c.serial}` : undefined}
              className={`hand-card ${playable ? "playable" : ""} ${ix.pickable.has(c.serial) ? "pickable" : ""} ${ix.picked.has(c.serial) ? "picked" : ""}`}
              initial={{ opacity: 0, y: 80 }}
              animate={{ opacity: 1, y: lift, rotate: rot }}
              exit={{ opacity: 0, y: -60, scale: 0.8 }}
              transition={spring}
              style={{ zIndex: i }}
            >
              <div className={playable ? "grab" : ""} onPointerDown={(e) => ix.onHandPointer(c, e)}>
                {c.id ? (
                  <Card id={c.id} cssWidth="var(--hand-w)" compact onHover={ix.onHover} />
                ) : (
                  <CardBack style={{ "--w": "var(--hand-w)" } as React.CSSProperties} />
                )}
              </div>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}

export function OppHand({ count }: { count: number }) {
  return (
    <div className="opp-hand" title={`AI has ${count} cards in hand`}>
      {Array.from({ length: count }, (_, i) => (
        <motion.div key={i} layout className="opp-hand-card" initial={{ opacity: 0, y: -30 }} animate={{ opacity: 1, y: 0 }}
          style={{ rotate: (i - (count - 1) / 2) * -3 }}>
          <CardBack style={{ "--w": "var(--opp-hand-w)" } as React.CSSProperties} />
        </motion.div>
      ))}
      <span className="opp-hand-count">{count}</span>
    </div>
  );
}

export function Stadium({ st, onHover }: { st: GameState; onHover: (id: number | null) => void }) {
  const s = st.stadium[0];
  return (
    <div className="stadium-slot">
      <AnimatePresence>
        {s ? (
          <motion.div key={s.serial} layoutId={`c${s.serial}`} initial={{ opacity: 0, scale: 0.6 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}>
            <Card id={s.id} cssWidth="var(--bench-w)" compact onHover={onHover} />
          </motion.div>
        ) : (
          <div className="stadium-empty">Stadium</div>
        )}
      </AnimatePresence>
    </div>
  );
}

export const isPokemonCard = (id: number) => getCard(id)?.cardType === 0;
