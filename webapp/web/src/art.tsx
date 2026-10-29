import { createContext, useContext } from "react";
import { ArtMode } from "./data";

export const ArtContext = createContext<{ mode: ArtMode; setMode: (m: ArtMode) => void }>({
  mode: "official", setMode: () => {},
});
export const useArt = () => useContext(ArtContext);

export function ArtToggle() {
  const { mode, setMode } = useArt();
  return (
    <div className="art-toggle" title="Card artwork">
      <span className="muted">Cards</span>
      <button className={`chip ${mode === "official" ? "on" : ""}`} onClick={() => setMode("official")}>Official</button>
      <button className={`chip ${mode === "generated" ? "on" : ""}`} onClick={() => setMode("generated")}>Generated</button>
    </div>
  );
}
