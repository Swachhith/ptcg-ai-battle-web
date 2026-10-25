import { AnimatePresence, motion } from "framer-motion";
import { useMemo, useState } from "react";
import { Card } from "../components/Card";
import { EnergyIcon } from "../components/EnergyIcon";
import { card as getCard, cardKindLabel, deckBreakdown, deckProblems, isBasicEnergy, TYPE_NAMES, validateDeck } from "../data";
import { CardData, Preset, SavedDeck } from "../types";
import { ArtToggle } from "../art";

interface Props {
  cards: CardData[];
  presets: Preset[];
  start?: { id?: string; name: string; cards: number[] };
  onSave: (d: SavedDeck) => void;
  onDelete: (id: string) => void;
  onBack: () => void;
  onPlay: (d: SavedDeck) => void;
}

const KINDS = [
  ["all", "All"], ["pokemon", "Pokémon"], ["basic", "Basic"], ["stage1", "Stage 1"], ["stage2", "Stage 2"], ["ex", "ex"],
  ["trainer", "Trainers"], ["1", "Item"], ["3", "Supporter"], ["2", "Tool"], ["4", "Stadium"], ["energy", "Energy"],
] as const;

const PAGE = 120;

function matchesKind(c: CardData, k: string) {
  switch (k) {
    case "all": return true;
    case "pokemon": return c.cardType === 0;
    case "basic": case "stage1": case "stage2": return c.cardType === 0 && c.stage === k;
    case "ex": return c.ex || c.megaEx;
    case "trainer": return c.cardType >= 1 && c.cardType <= 4;
    case "energy": return c.cardType >= 5;
    default: return c.cardType === +k;
  }
}

export function DeckBuilder({ cards, presets, start, onSave, onDelete, onBack, onPlay }: Props) {
  const [deckId] = useState(start?.id ?? `d${Date.now().toString(36)}`);
  const [name, setName] = useState(start?.name ?? "My deck");
  const [deck, setDeck] = useState<number[]>(start?.cards ?? []);
  const [q, setQ] = useState("");
  const [kind, setKind] = useState("all");
  const [etype, setEtype] = useState<number | null>(null);
  const [onlyPool, setOnlyPool] = useState(false);
  const [limit, setLimit] = useState(PAGE);
  const [hover, setHover] = useState<number | null>(null);
  const [engine, setEngine] = useState<{ ok: boolean; message: string } | null>(null);
  const [checking, setChecking] = useState(false);
  const [io, setIo] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const poolCards = useMemo(() => new Set(presets.flatMap((p) => p.cards)), [presets]);

  const counts = useMemo(() => {
    const m = new Map<number, number>();
    for (const c of deck) m.set(c, (m.get(c) || 0) + 1);
    return m;
  }, [deck]);
  const nameCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const id of deck) {
      const c = getCard(id);
      if (c && !isBasicEnergy(c)) m.set(c.name, (m.get(c.name) || 0) + 1);
    }
    return m;
  }, [deck]);
  const aceInDeck = deck.some((id) => getCard(id)?.aceSpec);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    return cards.filter((c) => {
      if (!matchesKind(c, kind)) return false;
      if (etype != null && !(c.cardType === 0 || c.cardType >= 5 ? c.energyType === etype : false)) return false;
      if (onlyPool && !poolCards.has(c.id)) return false;
      if (!s) return true;
      return c.name.toLowerCase().includes(s) || c.set.toLowerCase() === s ||
        c.attacks.some((a) => a.name.toLowerCase().includes(s) || a.text.toLowerCase().includes(s)) ||
        c.skills.some((k) => k.name.toLowerCase().includes(s) || k.text.toLowerCase().includes(s));
    });
  }, [cards, q, kind, etype, onlyPool, poolCards]);

  const canAdd = (c: CardData) => {
    if (deck.length >= 60) return false;
    if (!isBasicEnergy(c) && (nameCounts.get(c.name) || 0) >= 4) return false;
    if (c.aceSpec && aceInDeck) return false;
    return true;
  };
  const add = (c: CardData) => { if (canAdd(c)) { setDeck((d) => [...d, c.id]); setEngine(null); setSaved(false); } };
  const remove = (id: number) => {
    setDeck((d) => { const i = d.lastIndexOf(id); return i < 0 ? d : [...d.slice(0, i), ...d.slice(i + 1)]; });
    setEngine(null); setSaved(false);
  };

  const problems = deckProblems(deck);
  const b = deckBreakdown(deck);
  const grouped = useMemo(() => {
    const ids = [...counts.keys()];
    const g: Record<string, number[]> = { "Pokémon": [], Trainers: [], Energy: [] };
    for (const id of ids) {
      const c = getCard(id);
      const k = c?.cardType === 0 ? "Pokémon" : (c?.cardType ?? 0) >= 5 ? "Energy" : "Trainers";
      g[k].push(id);
    }
    for (const k of Object.keys(g)) g[k].sort((a, b) => (getCard(a)?.name ?? "").localeCompare(getCard(b)?.name ?? ""));
    return g;
  }, [counts]);

  const check = async () => {
    setChecking(true);
    try { setEngine(await validateDeck(deck)); } catch { setEngine({ ok: false, message: "Couldn't reach the server." }); }
    setChecking(false);
  };
  const save = () => { onSave({ id: deckId, name: name.trim() || "Untitled deck", cards: deck, updated: Date.now() }); setSaved(true); };
  const importText = (t: string) => {
    const ids = (t.match(/\d+/g) || []).map(Number).filter((n) => getCard(n));
    setDeck(ids.slice(0, 60)); setIo(null); setEngine(null);
  };

  return (
    <div className="builder">
      <header className="builder-top">
        <button className="btn ghost small" onClick={onBack}>← Back</button>
        <input className="deck-name" value={name} onChange={(e) => { setName(e.target.value); setSaved(false); }} aria-label="Deck name" />
        <div className="grow" />
        <ArtToggle />
        <select onChange={(e) => { const p = presets.find((x) => x.id === e.target.value); if (p) { setDeck(p.cards); setName(p.name + " (copy)"); setEngine(null); } e.target.value = ""; }} defaultValue="">
          <option value="" disabled>Start from a preset…</option>
          {presets.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <button className="btn small" onClick={() => setIo(deck.join("\n"))}>Import / export</button>
        <button className="btn small ghost" onClick={() => { setDeck([]); setEngine(null); }}>Clear</button>
      </header>

      <div className="builder-body">
        <section className="browser">
          <div className="filters">
            <input className="search" placeholder="Search name, attack, ability text, or set code…" value={q} onChange={(e) => { setQ(e.target.value); setLimit(PAGE); }} />
            <div className="chips">
              {KINDS.map(([k, l]) => <button key={k} className={`chip ${kind === k ? "on" : ""}`} onClick={() => { setKind(k); setLimit(PAGE); }}>{l}</button>)}
            </div>
            <div className="chips">
              {[1, 2, 3, 4, 5, 6, 7, 8, 9, 0].map((t) => (
                <button key={t} className={`chip icon ${etype === t ? "on" : ""}`} title={TYPE_NAMES[t]} onClick={() => setEtype(etype === t ? null : t)}>
                  <EnergyIcon type={t} size="18px" />
                </button>
              ))}
              <label className="check"><input type="checkbox" checked={onlyPool} onChange={(e) => setOnlyPool(e.target.checked)} /> Only cards from the AI's training decks</label>
              <span className="muted small">{filtered.length} cards</span>
            </div>
          </div>
          <div className="browser-grid">
            {filtered.slice(0, limit).map((c) => {
              const n = counts.get(c.id) || 0;
              const ok = canAdd(c);
              return (
                <div key={c.id} className={`browse-card ${n ? "in-deck" : ""} ${ok ? "" : "maxed"}`}>
                  <Card id={c.id} size="md" onClick={() => add(c)} onHover={setHover} />
                  <div className="browse-ctrl">
                    <button onClick={() => remove(c.id)} disabled={!n} aria-label={`Remove ${c.name}`}>−</button>
                    <span>{n}</span>
                    <button onClick={() => add(c)} disabled={!ok} aria-label={`Add ${c.name}`}>+</button>
                  </div>
                </div>
              );
            })}
            {filtered.length > limit && (
              <button className="btn wide more" onClick={() => setLimit((l) => l + PAGE)}>Show more ({filtered.length - limit} left)</button>
            )}
          </div>
        </section>

        <aside className="deck-panel">
          <div className="zoom small-zoom">
            {hover ? <Card id={hover} width={236} /> : <div className="zoom-empty"><p>Hover a card to read it. Click to add.</p></div>}
          </div>
          <div className="deck-summary">
            <div className={`count-big ${deck.length === 60 ? "ok" : ""}`}>{deck.length}<small>/60</small></div>
            <div className="breakdown">
              <span><b>{b.pokemon}</b> Pokémon</span><span><b>{b.trainer}</b> Trainer</span><span><b>{b.energy}</b> Energy</span>
            </div>
          </div>
          <div className="deck-rows">
            {Object.entries(grouped).map(([g, ids]) => ids.length ? (
              <div key={g}>
                <div className="side-title">{g} · {ids.reduce((s, id) => s + (counts.get(id) || 0), 0)}</div>
                <AnimatePresence initial={false}>
                  {ids.map((id) => {
                    const c = getCard(id)!;
                    return (
                      <motion.div key={id} className="deck-row" layout initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}
                        onMouseEnter={() => setHover(id)} onMouseLeave={() => setHover(null)}>
                        <span className="row-n">{counts.get(id)}</span>
                        {c.cardType === 0 || c.cardType >= 5 ? <EnergyIcon type={c.energyType} size="16px" /> : <span className={`tdot t${c.cardType}`} />}
                        <span className="row-name">{c.name}<small> {cardKindLabel(c)} · {c.set} {c.num}</small></span>
                        <button onClick={() => remove(id)} aria-label="Remove one">−</button>
                        <button onClick={() => add(c)} disabled={!canAdd(c)} aria-label="Add one">+</button>
                      </motion.div>
                    );
                  })}
                </AnimatePresence>
              </div>
            ) : null)}
            {!deck.length && <p className="muted pad">Click cards on the left to add them, or start from a preset above.</p>}
          </div>
          <div className="deck-check">
            {problems.length ? (
              <ul className="problems">{problems.map((p) => <li key={p}>{p}</li>)}</ul>
            ) : engine ? (
              <p className={engine.ok ? "good" : "warn"}>{engine.ok ? "✓ The engine accepts this deck." : engine.message}</p>
            ) : (
              <p className="muted">Rules look fine. Confirm with the engine before playing.</p>
            )}
            <div className="row-btns">
              <button className="btn small" disabled={!!problems.length || checking} onClick={check}>{checking ? "Checking…" : "Validate"}</button>
              <button className="btn small primary" onClick={save} disabled={!deck.length}>{saved ? "Saved ✓" : "Save deck"}</button>
              {start?.id && <button className="btn small ghost danger" onClick={() => { onDelete(deckId); onBack(); }}>Delete</button>}
            </div>
            <button className="btn primary wide" disabled={!!problems.length} onClick={() => { const d = { id: deckId, name: name.trim() || "Untitled deck", cards: deck, updated: Date.now() }; onSave(d); onPlay(d); }}>
              Save & battle the AI
            </button>
          </div>
        </aside>
      </div>

      {io != null && (
        <div className="modal-backdrop" onClick={() => setIo(null)}>
          <div className="modal narrow" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head"><h3>Import / export</h3><button className="btn ghost small" onClick={() => setIo(null)}>Close</button></div>
            <p className="muted small">One engine card id per line, the same format as the repo's <code>deck.csv</code> files. Paste a list to import it.</p>
            <textarea value={io} onChange={(e) => setIo(e.target.value)} rows={14} />
            <div className="row-btns">
              <button className="btn small" onClick={() => navigator.clipboard?.writeText(deck.join("\n"))}>Copy current deck</button>
              <button className="btn small primary" onClick={() => importText(io)}>Import this list</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
