import { AnimatePresence, LayoutGroup, motion } from "framer-motion";
import { useEffect, useMemo, useRef, useState } from "react";
import { Card } from "../components/Card";
import { EnergyCost } from "../components/EnergyIcon";
import { attackById, card as getCard, cardName } from "../data";
import { Area, CardRef, OptType } from "../types";
import { Hand, Interaction, OppHand, Side, Stadium } from "../game/Board";
import { ActionMenu, Chooser } from "../game/Chooser";
import { reasonText } from "../game/logs";
import { CONTEXT_PROMPT, describeOption, OptionView } from "../game/options";
import { useGame } from "../game/useGame";
import { ArtToggle } from "../art";

interface Props {
  deck: number[];
  deckName: string;
  aiDeck: number[] | null;
  aiDeckName: string;
  seat: number | null;
  onExit: () => void;
  onRematch: () => void;
}

const SPEEDS = [0.5, 1, 2, 4];

export function Game({ deck, deckName, aiDeck, aiDeckName, seat, onExit, onRematch }: Props) {
  const { view, send, setSpeed } = useGame(deck, aiDeck, seat);
  const { state: st, select: sel, humanSeat: me } = view;
  const ai = 1 - me;
  const [hover, setHover] = useState<number | null>(null);
  const [menu, setMenu] = useState<{ x: number; y: number; views: OptionView[] } | null>(null);
  const [picked, setPicked] = useState<number[]>([]);
  const [dragging, setDragging] = useState<number | null>(null);
  const [ghost, setGhost] = useState<{ id: number; x: number; y: number } | null>(null);
  const dropRef = useRef<(t: number | "bench" | "board", from?: number) => void>(() => {});
  const [pile, setPile] = useState<number | null>(null);
  const [showAiDeck, setShowAiDeck] = useState(false);
  const logRef = useRef<HTMLDivElement>(null);

  useEffect(() => { setPicked([]); setMenu(null); }, [sel]);
  useEffect(() => { logRef.current?.scrollTo({ top: 1e9, behavior: "smooth" }); }, [view.log.length]);

  const isMain = !!sel && sel.type === 0;
  const views = useMemo(() => (st && sel ? sel.option.map((o, i) => describeOption(st, sel, o, i)) : []), [st, sel]);

  const submit = (idx: number[]) => { setMenu(null); setPicked([]); send(idx); };

  const ix: Interaction = useMemo(() => {
    const sources = new Map<number, OptionView[]>();
    const pickable = new Set<number>();
    const pickedSet = new Set<number>();
    const dropTargets = new Set<number>();
    let benchDrop = false;
    if (isMain) {
      for (const v of views) {
        const t = v.opt.type;
        if (t === OptType.END || !v.card) continue;
        const k = v.card.serial;
        sources.set(k, [...(sources.get(k) ?? []), v]);
      }
      if (dragging != null) {
        for (const v of sources.get(dragging) ?? []) {
          if ((v.opt.type === OptType.ATTACH || v.opt.type === OptType.EVOLVE) && v.target) dropTargets.add(v.target.serial);
          if (v.opt.type === OptType.PLAY) benchDrop = true;
        }
      }
    } else if (sel) {
      for (const v of views) {
        const onBoard = v.opt.type === OptType.CARD && (v.opt.area === Area.ACTIVE || v.opt.area === Area.BENCH || v.opt.area === Area.HAND);
        if (onBoard && v.card) {
          pickable.add(v.card.serial);
          if (picked.includes(v.i)) pickedSet.add(v.card.serial);
        }
      }
    }
    const acting = new Set<number>();
    if (view.aiAction?.card) acting.add(view.aiAction.card.serial);
    if (view.aiAction?.target) acting.add(view.aiAction.target.serial);
    const ix: Interaction = {
      sources, pickable, picked: pickedSet, dropTargets, benchDrop, acting,
      onHover: setHover,
      onCard: (ref: CardRef, e: React.MouseEvent) => {
        if (isMain) {
          const vs = sources.get(ref.serial);
          if (vs?.length) setMenu({ x: e.clientX + 8, y: e.clientY - 10, views: vs });
        } else if (sel) {
          const v = views.find((v) => v.card?.serial === ref.serial && pickable.has(ref.serial));
          if (!v) return;
          if (sel.maxCount === 1 && sel.minCount === 1) submit([v.i]);
          else setPicked((p) => (p.includes(v.i) ? p.filter((x) => x !== v.i) : p.length < sel.maxCount ? [...p, v.i] : p));
        }
      },
      onHandPointer: (ref: CardRef, e: React.PointerEvent) => {
        if (e.button !== 0) return;
        const x0 = e.clientX, y0 = e.clientY;
        const canDrag = isMain && !!sources.get(ref.serial)?.length;
        let started = false;
        const move = (ev: PointerEvent) => {
          if (!canDrag) return;
          if (!started && Math.hypot(ev.clientX - x0, ev.clientY - y0) > 8) { started = true; setDragging(ref.serial); }
          if (started) setGhost({ id: ref.id, x: ev.clientX, y: ev.clientY });
        };
        const up = (ev: PointerEvent) => {
          window.removeEventListener("pointermove", move);
          window.removeEventListener("pointerup", up);
          setGhost(null);
          if (!started) {
            ix.onCard(ref, { clientX: ev.clientX, clientY: ev.clientY } as React.MouseEvent);
            return;
          }
          const el = document.elementFromPoint(ev.clientX, ev.clientY)?.closest("[data-drop]") as HTMLElement | null;
          const d = el?.dataset.drop ?? "board";
          dropRef.current(d === "bench" || d === "board" ? d : Number(d), ref.serial);
        };
        window.addEventListener("pointermove", move);
        window.addEventListener("pointerup", up);
      },
      onDrop: (target, from) => {
        const src = from ?? dragging;
        const vs = src != null ? sources.get(src) ?? [] : [];
        setDragging(null);
        const hit = target === "bench" || target === "board"
          ? vs.find((v) => v.opt.type === OptType.PLAY)
          : vs.find((v) => v.target?.serial === target);
        if (hit) submit([hit.i]);
      },
    };
    return ix;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [views, isMain, sel, picked, dragging, view.aiAction]);

  dropRef.current = ix.onDrop;

  if (view.phase === "connecting" || view.phase === "loading" || (!st && view.phase === "playing")) {
    return (
      <div className="loading-screen">
        <div className="shuffle">
          {[0, 1, 2].map((i) => (
            <motion.div key={i} className="shuffle-card" animate={{ x: [0, (i - 1) * 60, 0], rotate: [0, (i - 1) * 12, 0] }} transition={{ repeat: Infinity, duration: 1.2, delay: i * 0.1 }} />
          ))}
        </div>
        <p>{view.phase === "connecting" ? "Connecting to the game server…" : "Loading the AI and shuffling decks…"}</p>
        <button className="btn ghost" onClick={onExit}>Cancel</button>
      </div>
    );
  }
  if (view.phase === "error" && !st) {
    return (
      <div className="loading-screen">
        <h2>Couldn't start the game</h2>
        <p className="error-text">{view.error}</p>
        <button className="btn primary" onClick={onExit}>Back</button>
      </div>
    );
  }
  if (!st) return null;

  const turnPlayer = st.turn === 0 ? -1 : st.turn % 2 === 1 ? st.firstPlayer : 1 - st.firstPlayer;
  const myTurn = turnPlayer === me;
  const mainAttacks = isMain ? views.filter((v) => v.opt.type === OptType.ATTACK) : [];
  const mainOther = isMain ? views.filter((v) => v.opt.type === OptType.RETREAT || v.opt.type === OptType.ABILITY) : [];
  const endOpt = isMain ? views.find((v) => v.opt.type === OptType.END) : undefined;
  const hand = st.players[me].hand ?? [];
  const pileCards = pile != null ? st.players[pile].discard : [];
  const over = view.over;
  const won = over && over.result === me;
  const draw = over && over.result === 2;

  return (
    <div className={`game ${dragging != null ? "is-dragging" : ""}`}>
      <header className="topbar">
        <button className="btn ghost small" onClick={onExit}>← Leave</button>
        <div className="turn-info">
          <span className={`turn-pill ${myTurn ? "me" : turnPlayer === ai ? "ai" : ""}`}>
            {st.turn === 0 ? "Setup" : `Turn ${st.turn} · ${myTurn ? "Your turn" : "AI's turn"}`}
          </span>
          {myTurn && (
            <span className="flags">
              <span className={st.energyAttached ? "used" : ""}>Energy {st.energyAttached ? "✓" : "○"}</span>
              <span className={st.supporterPlayed ? "used" : ""}>Supporter {st.supporterPlayed ? "✓" : "○"}</span>
              <span className={st.retreated ? "used" : ""}>Retreat {st.retreated ? "✓" : "○"}</span>
            </span>
          )}
        </div>
        <ArtToggle />
        <div className="speed">
          <span className="muted">AI speed</span>
          {SPEEDS.map((s) => (
            <button key={s} className={`chip ${view.speed === s ? "on" : ""}`} onClick={() => setSpeed(s)}>{s}×</button>
          ))}
        </div>
      </header>

      <LayoutGroup>
        <main className="board" data-drop="board">
          <div className="seat-label ai-label">
            <span className="avatar ai">AI</span>
            <div><b>Unown Gradiant agent</b><small>{aiDeckName}</small></div>
          </div>
          <OppHand count={st.players[ai].handCount} />
          <Side st={st} seat={ai} owner="ai" ix={ix} onDiscard={setPile} />
          <div className="midline">
            <Stadium st={st} onHover={setHover} />
            <AnimatePresence mode="wait">
              {view.banner && (
                <motion.div
                  key={view.banner.id}
                  className={`banner ${view.banner.who} ${view.banner.big ? "big" : ""}`}
                  initial={{ opacity: 0, y: 8, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.18 }}
                >
                  {view.banner.text}
                </motion.div>
              )}
            </AnimatePresence>
            {view.waitingForAi && !over && <div className="thinking"><span /><span /><span /></div>}
          </div>
          <Side st={st} seat={me} owner="me" ix={ix} onDiscard={setPile} />
          <Hand cards={hand} ix={ix} canAct={isMain} />
          <div className="seat-label me-label">
            <span className="avatar me">You</span>
            <div><b>You</b><small>{deckName}</small></div>
          </div>

          {isMain && (
            <motion.div className="action-dock" initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }}>
              <div className="dock-title">Your move</div>
              {mainAttacks.map((v) => {
                const a = attackById(v.attackId);
                return (
                  <button key={v.i} className="btn attack-btn" onClick={() => submit([v.i])} onMouseEnter={() => setHover(st.players[me].active[0]?.id ?? null)}>
                    {a && <EnergyCost cost={a.cost} size="1.05em" />}
                    <span>{v.label}</span>
                    {a?.dmgText && <b>{a.dmgText}</b>}
                  </button>
                );
              })}
              {mainOther.map((v) => (
                <button key={v.i} className="btn" onClick={() => submit([v.i])}>{v.label}</button>
              ))}
              {endOpt && <button className="btn end-btn" onClick={() => submit([endOpt.i])}>End turn</button>}
              <div className="dock-hint">Click a glowing card for its actions, or drag cards from your hand onto Pokémon.</div>
            </motion.div>
          )}
        </main>
      </LayoutGroup>

      <aside className="sidebar">
        <div className="zoom">
          {hover ? <Card id={hover} width={262} /> : (
            <div className="zoom-empty">
              <p>Hover any card to read it.</p>
              {sel && <p className="prompt-hint">{CONTEXT_PROMPT[sel.context] ?? "Your move"}</p>}
            </div>
          )}
        </div>
        {isMain && (
          <div className="all-actions">
            <div className="side-title">All legal moves ({views.length})</div>
            <div className="all-actions-list">
              {views.map((v) => (
                <button key={v.i} className="mini-action" onClick={() => submit([v.i])}
                  onMouseEnter={() => setHover(v.card?.id || null)}>
                  {v.label}{v.sub ? <small> · {v.sub}</small> : null}
                </button>
              ))}
            </div>
          </div>
        )}
        <div className="side-title">Game log</div>
        <div className="log" ref={logRef}>
          {view.log.map((l, i) => <div key={i} className={`log-line ${l.kind} ${l.who}`}>{l.text}</div>)}
        </div>
      </aside>

      {sel && !isMain && (
        <Chooser st={st} sel={sel} picked={picked} setPicked={setPicked} onSubmit={submit} onHover={setHover} />
      )}
      {ghost && (
        <div className="drag-ghost" style={{ left: ghost.x, top: ghost.y }}>
          <Card id={ghost.id} cssWidth="var(--hand-w)" compact />
        </div>
      )}
      {menu && <ActionMenu x={menu.x} y={menu.y} views={menu.views} onPick={(i) => submit([i])} onClose={() => setMenu(null)} />}

      {pile != null && (
        <div className="modal-backdrop" onClick={() => setPile(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <h3>{pile === me ? "Your" : "AI's"} discard pile · {pileCards.length}</h3>
              <button className="btn ghost small" onClick={() => setPile(null)}>Close</button>
            </div>
            <div className="card-grid">
              {pileCards.length ? pileCards.map((c) => <Card key={c.serial} id={c.id} size="md" onHover={setHover} />) : <p className="muted">Empty.</p>}
            </div>
          </div>
        </div>
      )}

      {view.phase === "error" && (
        <div className="toast error">{view.error} <button className="btn small" onClick={onExit}>Back to menu</button></div>
      )}

      <AnimatePresence>
        {over && (
          <motion.div className="modal-backdrop over" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.6 }}>
            <motion.div className={`result-card ${won ? "win" : draw ? "draw" : "loss"}`} initial={{ scale: 0.8, y: 30 }} animate={{ scale: 1, y: 0 }} transition={{ delay: 0.7, type: "spring" }}>
              <div className="result-title">{won ? "Victory" : draw ? "Draw" : "Defeat"}</div>
              <p>{won ? "You beat the Kaggle agent!" : draw ? "Both sides ran out together." : "The agent takes this one."}{over.reason ? ` Game ended because ${reasonText(over.reason)}.` : ""}</p>
              <div className="result-stats">
                <div><b>{6 - st.players[me].prize.length}</b><span>prizes you took</span></div>
                <div><b>{6 - st.players[ai].prize.length}</b><span>prizes the AI took</span></div>
                <div><b>{Math.max(1, Math.ceil(st.turn / 2))}</b><span>rounds</span></div>
              </div>
              <div className="result-actions">
                <button className="btn primary" onClick={onRematch}>Rematch</button>
                <button className="btn" onClick={() => setShowAiDeck((s) => !s)}>{showAiDeck ? "Hide" : "Reveal"} AI's deck</button>
                <button className="btn ghost" onClick={onExit}>Change decks</button>
              </div>
              {showAiDeck && <DeckList cards={over.aiDeck} onHover={setHover} />}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export function DeckList({ cards, onHover }: { cards: number[]; onHover?: (id: number | null) => void }) {
  const counts = new Map<number, number>();
  for (const c of cards) counts.set(c, (counts.get(c) || 0) + 1);
  const ids = [...counts.keys()].sort((a, b) => {
    const ca = getCard(a), cb = getCard(b);
    const ord = (t?: number) => (t === 0 ? 0 : t === 5 || t === 6 ? 2 : 1);
    return ord(ca?.cardType) - ord(cb?.cardType) || (ca?.name ?? "").localeCompare(cb?.name ?? "");
  });
  return (
    <div className="decklist-grid">
      {ids.map((id) => (
        <div key={id} className="decklist-item" onMouseEnter={() => onHover?.(id)} onMouseLeave={() => onHover?.(null)}>
          <Card id={id} size="sm" />
          <span className="count-badge">×{counts.get(id)}</span>
          <span className="dl-name">{cardName(id)}</span>
        </div>
      ))}
    </div>
  );
}
