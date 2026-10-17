import { motion } from "framer-motion";
import { useMemo, useState } from "react";
import { Card } from "../components/Card";
import { EnergyIcon } from "../components/EnergyIcon";
import { card as getCard, deckBreakdown, deckProblems } from "../data";
import { Preset, SavedDeck } from "../types";
import { DeckList } from "./Game";
import { ArtToggle } from "../art";

export interface DeckChoice { name: string; cards: number[] }

interface Props {
  presets: Preset[];
  saved: SavedDeck[];
  onPlay: (me: DeckChoice, ai: DeckChoice | null, seat: number | null) => void;
  onBuild: (start?: DeckChoice & { id?: string }) => void;
  initialMe?: string;
}

export function Setup({ presets, saved, onPlay, onBuild, initialMe }: Props) {
  const aiDefault = presets.find((p) => p.aiDeck)!;
  const [tab, setTab] = useState<"presets" | "mine">(saved.length ? "mine" : "presets");
  const [q, setQ] = useState("");
  const [mine, setMine] = useState<string>(initialMe ?? (saved[0] ? "s:" + saved[0].id : "p:" + (presets[1]?.id ?? aiDefault.id)));
  const [aiPick, setAiPick] = useState<string>(aiDefault.id);
  const [seat, setSeat] = useState<"random" | "0" | "1">("random");
  const [preview, setPreview] = useState<DeckChoice | null>(null);

  const resolve = (key: string): DeckChoice | null => {
    if (key.startsWith("s:")) {
      const d = saved.find((s) => "s:" + s.id === key);
      return d ? { name: d.name, cards: d.cards } : null;
    }
    const p = presets.find((p) => "p:" + p.id === key);
    return p ? { name: p.name, cards: p.cards } : null;
  };
  const myDeck = resolve(mine);
  const myProblems = myDeck ? deckProblems(myDeck.cards) : ["pick a deck"];
  const aiPreset = presets.find((p) => p.id === aiPick) ?? aiDefault;

  const shown = useMemo(() => {
    const s = q.trim().toLowerCase();
    return presets.filter((p) => !s || p.name.toLowerCase().includes(s) || p.cards.some((id) => getCard(id)?.name.toLowerCase().includes(s)));
  }, [presets, q]);

  return (
    <div className="setup">
      <section className="hero">
        <div className="hero-copy">
          <div className="eyebrow">Kaggle · Pokémon TCG AI Battle</div>
          <h1>Play the agent<br />that was submitted to Kaggle.</h1>
          <p>
            Team Unown Gradiant's final submission: a 4-layer token transformer trained with self-play reinforcement learning on the official
            competition engine. It plays greedy argmax moves. Every rule is enforced by that same engine, so any move the board lets you make is legal.
          </p>
          <div className="hero-actions">
            <button className="btn primary big" disabled={!!myProblems.length} onClick={() => myDeck && onPlay(myDeck, aiPick === aiDefault.id ? null : { name: aiPreset.name, cards: aiPreset.cards }, seat === "random" ? null : +seat)}>
              Battle the AI
            </button>
            <button className="btn big" onClick={() => onBuild()}>Open deck builder</button>
          </div>
          <ArtToggle />
          {myDeck && <div className="hero-sel">Your deck: <b>{myDeck.name}</b>{myProblems.length ? <span className="warn"> · {myProblems[0]}</span> : null}</div>}
        </div>
        <div className="hero-fan">
          {[aiDefault.featured, ...aiDefault.cards.filter((c, i, a) => a.indexOf(c) === i && getCard(c)?.cardType === 0 && c !== aiDefault.featured).slice(0, 3)].map((id, i) => (
            <motion.div key={id} className="fan-card" initial={{ opacity: 0, y: 40, rotate: 0 }} animate={{ opacity: 1, y: [0, -6, 0][i % 3] * 0, rotate: (i - 1.5) * 9 }} transition={{ delay: 0.1 * i, type: "spring" }} style={{ zIndex: 4 - Math.abs(i - 1.5) }}>
              <Card id={id} size="lg" />
            </motion.div>
          ))}
        </div>
      </section>

      <section className="setup-grid">
        <div className="panel">
          <div className="panel-head">
            <h2>1 · Your deck</h2>
            <div className="tabs">
              <button className={tab === "mine" ? "on" : ""} onClick={() => setTab("mine")}>My decks ({saved.length})</button>
              <button className={tab === "presets" ? "on" : ""} onClick={() => setTab("presets")}>Presets ({presets.length})</button>
            </div>
          </div>
          {tab === "presets" && (
            <>
              <input className="search" placeholder="Search archetypes or cards…" value={q} onChange={(e) => setQ(e.target.value)} />
              <div className="deck-tiles">
                {shown.map((p) => (
                  <DeckTile key={p.id} name={p.name} cards={p.cards} featured={p.featured} types={p.types} badge={p.aiDeck ? "AI's deck" : undefined}
                    on={mine === "p:" + p.id} onClick={() => setMine("p:" + p.id)}
                    onView={() => setPreview({ name: p.name, cards: p.cards })}
                    onEdit={() => onBuild({ name: p.name + " (copy)", cards: p.cards })} />
                ))}
              </div>
            </>
          )}
          {tab === "mine" && (
            <div className="deck-tiles">
              <button className="deck-tile new" onClick={() => onBuild()}>
                <span className="plus">+</span>
                <span>Build a new deck</span>
              </button>
              {saved.map((d) => {
                const probs = deckProblems(d.cards);
                const pokes = d.cards.filter((c) => getCard(c)?.cardType === 0);
                const feat = pokes.sort((a, b) => (getCard(b)?.hp ?? 0) - (getCard(a)?.hp ?? 0))[0] ?? d.cards[0];
                const types = [...new Set(pokes.map((c) => getCard(c)!.energyType))].slice(0, 2);
                return (
                  <DeckTile key={d.id} name={d.name} cards={d.cards} featured={feat} types={types}
                    badge={probs.length ? probs[0] : undefined} warn={!!probs.length}
                    on={mine === "s:" + d.id} onClick={() => setMine("s:" + d.id)}
                    onView={() => setPreview({ name: d.name, cards: d.cards })}
                    onEdit={() => onBuild({ id: d.id, name: d.name, cards: d.cards })} editLabel="Edit" />
                );
              })}
              {!saved.length && <p className="muted pad">No saved decks yet. Build one, or start from a copy of any preset.</p>}
            </div>
          )}
        </div>

        <div className="panel side-panel">
          <h2>2 · The AI</h2>
          <div className="ai-card">
            <Card id={aiPreset.featured} size="md" />
            <div>
              <b>{aiPreset.name}</b>
              <p className="muted">
                {aiPick === aiDefault.id
                  ? "The deck the agent was submitted with. This is exactly the configuration that played on the Kaggle ladder."
                  : "The same submitted policy piloting a different deck from its training pool."}
              </p>
              <button className="btn small ghost" onClick={() => setPreview({ name: aiPreset.name, cards: aiPreset.cards })}>View list</button>
            </div>
          </div>
          <label className="field-label">AI deck</label>
          <select value={aiPick} onChange={(e) => setAiPick(e.target.value)}>
            {presets.map((p) => <option key={p.id} value={p.id}>{p.aiDeck ? "★ " : ""}{p.name}</option>)}
          </select>

          <h2>3 · Turn order</h2>
          <div className="seg">
            {([["random", "Coin toss"], ["0", "I choose"], ["1", "AI chooses"]] as const).map(([k, l]) => (
              <button key={k} className={seat === k ? "on" : ""} onClick={() => setSeat(k)}>{l}</button>
            ))}
          </div>
          <p className="muted small">The toss winner decides whether to go first. Going first means no attack and no Supporter on turn 1.</p>

          <button className="btn primary big wide" disabled={!!myProblems.length} onClick={() => myDeck && onPlay(myDeck, aiPick === aiDefault.id ? null : { name: aiPreset.name, cards: aiPreset.cards }, seat === "random" ? null : +seat)}>
            Start battle
          </button>
          {!!myProblems.length && <p className="warn small">Your deck: {myProblems.join(" · ")}</p>}
        </div>
      </section>

      {preview && (
        <div className="modal-backdrop" onClick={() => setPreview(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <h3>{preview.name}</h3>
              <button className="btn ghost small" onClick={() => setPreview(null)}>Close</button>
            </div>
            <DeckList cards={preview.cards} />
          </div>
        </div>
      )}
    </div>
  );
}

function DeckTile({ name, cards, featured, types, badge, warn, on, onClick, onView, onEdit, editLabel = "Copy & edit" }: {
  name: string; cards: number[]; featured: number; types: number[]; badge?: string; warn?: boolean; editLabel?: string;
  on: boolean; onClick: () => void; onView: () => void; onEdit: () => void;
}) {
  const b = deckBreakdown(cards);
  return (
    <div className={`deck-tile ${on ? "on" : ""}`} onClick={onClick}>
      <div className="tile-art"><Card id={featured} size="sm" /></div>
      <div className="tile-info">
        <div className="tile-name">{name}</div>
        <div className="tile-types">{types.map((t) => <EnergyIcon key={t} type={t} size="16px" />)}<span className="muted small">{b.pokemon}P · {b.trainer}T · {b.energy}E</span></div>
        {badge && <span className={`badge ${warn ? "warn" : ""}`}>{badge}</span>}
        <div className="tile-actions">
          <button className="link" onClick={(e) => { e.stopPropagation(); onView(); }}>View</button>
          <button className="link" onClick={(e) => { e.stopPropagation(); onEdit(); }}>{editLabel}</button>
        </div>
      </div>
    </div>
  );
}
