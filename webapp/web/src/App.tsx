import { useEffect, useState } from "react";
import { ArtMode, loadArtMode, loadCards, loadPresets, loadSavedDecks, saveArtMode, saveDecks } from "./data";
import { ArtContext } from "./art";
import { CardData, Preset, SavedDeck } from "./types";
import { DeckBuilder } from "./screens/DeckBuilder";
import { Game } from "./screens/Game";
import { DeckChoice, Setup } from "./screens/Setup";

type Screen =
  | { k: "setup"; me?: string }
  | { k: "builder"; start?: DeckChoice & { id?: string } }
  | { k: "game"; me: DeckChoice; ai: DeckChoice | null; seat: number | null; n: number };

export default function App() {
  const [cards, setCards] = useState<CardData[] | null>(null);
  const [presets, setPresets] = useState<Preset[]>([]);
  const [saved, setSaved] = useState<SavedDeck[]>(loadSavedDecks);
  const [screen, setScreen] = useState<Screen>({ k: "setup" });
  const [err, setErr] = useState<string | null>(null);
  const [art, setArt] = useState<ArtMode>(loadArtMode);
  const artCtx = { mode: art, setMode: (m: ArtMode) => { setArt(m); saveArtMode(m); } };

  useEffect(() => {
    Promise.all([loadCards(), loadPresets()])
      .then(([c, p]) => { setCards(c); setPresets(p); })
      .catch(() => setErr("Couldn't reach the game server. Is it running (start.bat)?"));
  }, []);

  const upsert = (d: SavedDeck) => {
    setSaved((s) => {
      const next = [d, ...s.filter((x) => x.id !== d.id)];
      saveDecks(next);
      return next;
    });
  };
  const del = (id: string) => setSaved((s) => { const next = s.filter((x) => x.id !== id); saveDecks(next); return next; });

  if (err) return <div className="loading-screen"><h2>Server offline</h2><p className="error-text">{err}</p></div>;
  if (!cards) return <div className="loading-screen"><p>Loading card database…</p></div>;

  const aiPreset = presets.find((p) => p.aiDeck);

  return <ArtContext.Provider value={artCtx}>{body()}</ArtContext.Provider>;

  function body() {
  switch (screen.k) {
    case "setup":
      return (
        <Setup
          presets={presets} saved={saved} initialMe={screen.me}
          onPlay={(me, ai, seat) => setScreen({ k: "game", me, ai, seat, n: Date.now() })}
          onBuild={(start) => setScreen({ k: "builder", start })}
        />
      );
    case "builder":
      return (
        <DeckBuilder
          key={screen.start?.id ?? "new"}
          cards={cards!} presets={presets} start={screen.start}
          onSave={upsert} onDelete={del}
          onBack={() => setScreen({ k: "setup" })}
          onPlay={(d) => setScreen({ k: "game", me: { name: d.name, cards: d.cards }, ai: null, seat: null, n: Date.now() })}
        />
      );
    case "game":
      return (
        <Game
          key={screen.n}
          deck={screen.me.cards} deckName={screen.me.name}
          aiDeck={screen.ai?.cards ?? null} aiDeckName={screen.ai?.name ?? aiPreset?.name ?? "Tournament deck"}
          seat={screen.seat}
          onExit={() => setScreen({ k: "setup" })}
          onRematch={() => setScreen({ ...screen, n: Date.now() })}
        />
      );
  }
}
}
