import { memo, useState } from "react";
import { useArt } from "../art";
import { card as getCard, stageLabel, TRAINER_COLORS, TYPE_COLORS, TYPE_NAMES } from "../data";
import { CardData } from "../types";
import { EnergyCost, EnergyIcon } from "./EnergyIcon";
import { ProcArt } from "./ProcArt";

export type CardSize = "xs" | "sm" | "md" | "lg" | "xl";

const WIDTH: Record<CardSize, number> = { xs: 62, sm: 92, md: 130, lg: 200, xl: 300 };

function Text({ s }: { s: string }) {
  // render {G}{R}… tokens as energy icons
  const parts = s.split(/(\{[GRWLPFDMNCA]\})/g);
  const map: Record<string, number> = { C: 0, G: 1, R: 2, W: 3, L: 4, P: 5, F: 6, D: 7, M: 8, N: 9, A: 10 };
  return (
    <>
      {parts.map((p, i) => {
        const m = /^\{([GRWLPFDMNCA])\}$/.exec(p);
        return m ? <EnergyIcon key={i} type={map[m[1]]} size="1.05em" /> : <span key={i}>{p}</span>;
      })}
    </>
  );
}

function PokemonFace({ c, compact }: { c: CardData; compact: boolean }) {
  const col = TYPE_COLORS[c.energyType] ?? TYPE_COLORS[0];
  return (
    <div
      className={`face pokemon ${c.ex ? "is-ex" : ""} ${c.megaEx ? "is-mega" : ""}`}
      style={{ "--t-base": col.base, "--t-light": col.light, "--t-dark": col.dark, "--t-ink": col.ink } as React.CSSProperties}
    >
      <div className="f-head">
        <span className="f-stage">{stageLabel(c)}</span>
        <span className="f-name">{c.name}</span>
        <span className="f-hp"><small>HP</small>{c.hp}</span>
        <EnergyIcon type={c.energyType} size="1.35em" />
      </div>
      <div className="f-art">
        <ProcArt id={c.id} palette={col} motif={c.megaEx ? "rays" : c.ex ? "rings" : "orbs"} glyph={c.name.replace(/^(Team Rocket's|Mega|Cynthia's|N's|Marnie's|Hop's|Ethan's|Lillie's|Arven's|Steven's|Larry's|Misty's|Iono's)\s+/, "")[0]} />
        {c.evolvesFrom && !compact && <span className="f-evo">Evolves from {c.evolvesFrom}</span>}
        {c.tera && <span className="f-badge tera">TERA</span>}
        {(c.ex || c.megaEx) && <span className={`f-badge ex ${c.megaEx ? "mega" : ""}`}>{c.megaEx ? "MEGA ex" : "ex"}</span>}
      </div>
      <div className="f-body">
        {c.skills.map((s, i) => (
          <div key={"s" + i} className="f-skill">
            <div className="f-skill-name"><span className="f-ability">Ability</span>{s.name}</div>
            {!compact && <div className="f-text"><Text s={s.text} /></div>}
          </div>
        ))}
        {c.attacks.map((a) => (
          <div key={a.id} className="f-attack">
            <div className="f-attack-row">
              <EnergyCost cost={a.cost} size="1.1em" />
              <span className="f-attack-name">{a.name}</span>
              <span className="f-attack-dmg">{a.dmgText}</span>
            </div>
            {!compact && a.text && <div className="f-text"><Text s={a.text} /></div>}
          </div>
        ))}
      </div>
      <div className="f-foot">
        <span>weak {c.weakness != null ? <EnergyIcon type={c.weakness} size="1.1em" /> : "–"}</span>
        <span>resist {c.resistance != null ? <EnergyIcon type={c.resistance} size="1.1em" /> : "–"}</span>
        <span>retreat {c.retreat ? Array.from({ length: c.retreat }, (_, i) => <EnergyIcon key={i} type={0} size="1.1em" />) : "0"}</span>
      </div>
      {!compact && <div className="f-set">{c.set} {c.num}{c.category ? ` · ${c.category}` : ""}</div>}
    </div>
  );
}

function TrainerFace({ c, compact }: { c: CardData; compact: boolean }) {
  const col = TRAINER_COLORS[c.cardType] ?? TRAINER_COLORS[1];
  return (
    <div
      className="face trainer"
      style={{ "--t-base": col.base, "--t-light": col.light, "--t-dark": col.dark } as React.CSSProperties}
    >
      <div className="f-head">
        <span className="f-kind">TRAINER · {col.label}</span>
        {c.aceSpec && <span className="f-ace">ACE SPEC</span>}
      </div>
      <div className="f-tname">{c.name}</div>
      <div className="f-art">
        <ProcArt id={c.id} palette={col} motif={c.cardType === 4 ? "grid" : c.cardType === 3 ? "rays" : "rings"} />
      </div>
      <div className="f-body">
        {!compact && c.skills.map((s, i) => <div key={i} className="f-text"><Text s={s.text} /></div>)}
      </div>
      {!compact && <div className="f-set">{c.set} {c.num}</div>}
    </div>
  );
}

function EnergyFace({ c, compact }: { c: CardData; compact: boolean }) {
  const col = TYPE_COLORS[c.energyType] ?? TYPE_COLORS[0];
  const special = c.cardType === 6;
  return (
    <div
      className={`face energy ${special ? "special" : ""}`}
      style={{ "--t-base": col.base, "--t-light": col.light, "--t-dark": col.dark } as React.CSSProperties}
    >
      <div className="f-head">
        <span className="f-kind">{special ? "SPECIAL ENERGY" : "ENERGY"}</span>
        {c.aceSpec && <span className="f-ace">ACE SPEC</span>}
      </div>
      <div className="f-energy-orb">
        <EnergyIcon type={special ? (c.energyType || 0) : c.energyType} size="100%" />
      </div>
      <div className="f-tname">{special ? c.name : `${TYPE_NAMES[c.energyType]} Energy`}</div>
      {!compact && special && <div className="f-body"><div className="f-text"><Text s={c.skills.map((s) => s.text).join(" ")} /></div></div>}
    </div>
  );
}

export const CardBack = memo(function CardBack({ size = "sm", style }: { size?: CardSize; style?: React.CSSProperties }) {
  return (
    <div className="card back" style={{ "--w": `${WIDTH[size]}px`, ...style } as React.CSSProperties}>
      <div className="back-inner">
        <div className="back-ring" />
        <div className="back-core" />
      </div>
    </div>
  );
});

export interface CardProps {
  id: number;
  size?: CardSize;
  width?: number;
  /** CSS length for --w (e.g. "var(--bench-w)"); pass compact explicitly with it */
  cssWidth?: string;
  compact?: boolean;
  className?: string;
  onClick?: (e: React.MouseEvent) => void;
  onHover?: (id: number | null) => void;
  style?: React.CSSProperties;
  children?: React.ReactNode;
}

export const Card = memo(function Card({ id, size = "md", width, cssWidth, compact: compactProp, className = "", onClick, onHover, style, children }: CardProps) {
  const c = getCard(id);
  const w = width ?? WIDTH[size];
  const wcss = cssWidth ?? `${w}px`;
  if (!c) return <CardBack size={size} style={{ "--w": wcss, ...style } as React.CSSProperties} />;
  const compact = compactProp ?? w < 170;
  const { mode } = useArt();
  const [broken, setBroken] = useState(false);
  const official = mode === "official" && c.img && !broken;
  return (
    <div
      className={`card ${official ? "official" : ""} ${compact ? "compact" : ""} ${!cssWidth && w < 80 ? "tiny" : ""} ${className}`}
      style={{ "--w": wcss, ...style } as React.CSSProperties}
      onClick={onClick}
      onMouseEnter={onHover ? () => onHover(id) : undefined}
      onMouseLeave={onHover ? () => onHover(null) : undefined}
    >
      {official ? (
        <img className="face-img" src={`/cardimg/${c.id}.webp`} alt={c.name} loading="lazy" decoding="async" draggable={false} onError={() => setBroken(true)} />
      ) : c.cardType === 0 ? <PokemonFace c={c} compact={compact} /> : c.cardType >= 5 ? <EnergyFace c={c} compact={compact} /> : <TrainerFace c={c} compact={compact} />}
      {children}
    </div>
  );
});
