import { motion } from "framer-motion";
import { useState } from "react";
import { Card, CardBack } from "../components/Card";
import { EnergyCost } from "../components/EnergyIcon";
import { attackById, cardName } from "../data";
import { GameState, OptType, SelectData } from "../types";
import { CONTEXT_PROMPT, describeOption, OptionView } from "./options";

export function Chooser({
  st, sel, picked, setPicked, onSubmit, onHover,
}: {
  st: GameState; sel: SelectData; picked: number[]; setPicked: (p: number[]) => void;
  onSubmit: (idx: number[]) => void; onHover: (id: number | null) => void;
}) {
  const [hidden, setHidden] = useState(false);
  const views = sel.option.map((o, i) => describeOption(st, sel, o, i));
  const single = sel.maxCount === 1 && sel.minCount === 1;
  const n = picked.length;
  const ok = n >= sel.minCount && n <= sel.maxCount;
  const toggle = (i: number) => {
    if (single) return onSubmit([i]);
    if (picked.includes(i)) setPicked(picked.filter((x) => x !== i));
    else if (picked.length < sel.maxCount) setPicked([...picked, i]);
    else if (sel.maxCount === 1) setPicked([i]);
  };
  const t = sel.type;
  let title = CONTEXT_PROMPT[sel.context] ?? "Make a choice";
  if (sel.context === 41) title = "You won the coin toss — go first?";
  const effect = sel.effect ? cardName(sel.effect.id) : null;
  const range = sel.minCount === sel.maxCount ? `Choose ${sel.maxCount}` : `Choose ${sel.minCount}–${sel.maxCount}`;
  const isCards = views.some((v) => v.card !== undefined && v.opt.type !== OptType.ATTACK);
  const extra: string[] = [];
  if (sel.remainDamageCounter) extra.push(`${sel.remainDamageCounter} damage counters left`);
  if (sel.remainEnergyCost) extra.push(`${sel.remainEnergyCost} Energy still needed`);

  if (hidden) {
    return (
      <motion.button className="chooser-peek" onClick={() => setHidden(false)} initial={{ y: 40 }} animate={{ y: 0 }}>
        ▲ {title} — show choices
      </motion.button>
    );
  }

  return (
    <motion.div className="chooser-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      <motion.div className="chooser" initial={{ y: 40, scale: 0.97 }} animate={{ y: 0, scale: 1 }}>
        <div className="chooser-head">
          <div>
            <h3>{title}</h3>
            <div className="chooser-sub">
              {effect && <span className="effect-tag" onMouseEnter={() => onHover(sel.effect!.id)} onMouseLeave={() => onHover(null)}>{effect}</span>}
              {sel.contextCard && <span className="effect-tag" onMouseEnter={() => onHover(sel.contextCard!.id)} onMouseLeave={() => onHover(null)}>{cardName(sel.contextCard.id)}</span>}
              {t !== 9 && <span>{range}</span>}
              {extra.map((e) => <span key={e}>{e}</span>)}
            </div>
          </div>
          <button className="btn ghost small" onClick={() => setHidden(true)} title="Look at the board">Peek board ▼</button>
        </div>

        {t === 9 ? (
          <div className="yesno">
            {views.map((v) => (
              <button key={v.i} className={`btn big ${v.opt.type === OptType.YES ? "primary" : ""}`} onClick={() => onSubmit([v.i])}>
                {sel.context === 41 ? (v.opt.type === OptType.YES ? "Go first" : "Go second") : v.label}
              </button>
            ))}
          </div>
        ) : isCards ? (
          <div className="chooser-grid">
            {views.map((v) => <ChoiceTile key={v.i} v={v} picked={picked.indexOf(v.i)} onClick={() => toggle(v.i)} onHover={onHover} />)}
          </div>
        ) : (
          <div className="chooser-list">
            {views.map((v) => {
              const a = v.opt.type === OptType.ATTACK ? attackById(v.attackId) : undefined;
              return (
                <button key={v.i} className={`btn choice ${picked.includes(v.i) ? "on" : ""}`} onClick={() => toggle(v.i)}>
                  {a && <EnergyCost cost={a.cost} size="1.1em" />}
                  <span>{v.label}</span>
                  {a?.dmgText && <b>{a.dmgText}</b>}
                </button>
              );
            })}
          </div>
        )}

        {!single && t !== 9 && (
          <div className="chooser-foot">
            <span className="muted">{n} selected</span>
            {sel.minCount === 0 && n === 0 && <span className="muted">You may choose none</span>}
            <button className="btn primary" disabled={!ok} onClick={() => onSubmit(picked)}>
              {n === 0 && sel.minCount === 0 ? "Choose none" : "Confirm"}
            </button>
          </div>
        )}
      </motion.div>
    </motion.div>
  );
}

function ChoiceTile({ v, picked, onClick, onHover }: { v: OptionView; picked: number; onClick: () => void; onHover: (id: number | null) => void }) {
  return (
    <motion.div className={`choice-tile ${picked >= 0 ? "on" : ""}`} onClick={onClick} whileHover={{ y: -4 }}>
      {v.card && v.card.id ? <Card id={v.card.id} size="md" onHover={onHover} /> : <CardBack size="md" />}
      {picked >= 0 && <div className="pick-num">{picked + 1}</div>}
      <div className="tile-label">
        {v.place && <span>{v.place}</span>}
        {v.sub && <span>{v.sub}</span>}
      </div>
    </motion.div>
  );
}

export function ActionMenu({
  x, y, views, onPick, onClose,
}: { x: number; y: number; views: OptionView[]; onPick: (i: number) => void; onClose: () => void }) {
  const left = Math.min(x, window.innerWidth - 300);
  const h = 16 + views.length * 46;
  const top = y > window.innerHeight * 0.55 ? Math.max(8, y - h - 24) : Math.min(y, window.innerHeight - h - 8);
  return (
    <div className="menu-backdrop" onClick={onClose} onContextMenu={(e) => { e.preventDefault(); onClose(); }}>
      <motion.div
        className="action-menu"
        style={{ left, top }}
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        onClick={(e) => e.stopPropagation()}
      >
        {views.map((v) => {
          const a = v.opt.type === OptType.ATTACK ? attackById(v.attackId) : undefined;
          return (
            <button key={v.i} className={`menu-item ${a ? "attack" : ""}`} onClick={() => onPick(v.i)}>
              {a && <EnergyCost cost={a.cost} size="1.05em" />}
              <span className="mi-label">{v.label}</span>
              {a?.dmgText ? <b className="mi-dmg">{a.dmgText}</b> : v.sub ? <span className="mi-sub">{v.sub}</span> : null}
            </button>
          );
        })}
      </motion.div>
    </div>
  );
}
