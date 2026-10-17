import { memo } from "react";
import { TYPE_COLORS } from "../data";

function rng(seed: number) {
  let a = seed * 2654435761 >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Generated artwork: a unique, seeded composition per card id in its type palette. */
export const ProcArt = memo(function ProcArt({
  id, palette, motif = "orbs", glyph,
}: {
  id: number;
  palette: { base: string; light: string; dark: string };
  motif?: "orbs" | "rays" | "grid" | "rings";
  glyph?: string;
}) {
  const r = rng(id + 17);
  const gid = `pa${id}${motif}`;
  const orbs = Array.from({ length: 5 + Math.floor(r() * 4) }, () => ({
    x: r() * 100, y: r() * 62, rad: 6 + r() * 22, o: 0.18 + r() * 0.35, light: r() > 0.45,
  }));
  const angle = Math.floor(r() * 360);
  const cx = 30 + r() * 40;
  const cy = 18 + r() * 26;
  return (
    <svg className="proc-art" viewBox="0 0 100 62" preserveAspectRatio="xMidYMid slice" aria-hidden>
      <defs>
        <linearGradient id={`${gid}bg`} gradientTransform={`rotate(${angle} .5 .5)`}>
          <stop offset="0" stopColor={palette.dark} />
          <stop offset="0.55" stopColor={palette.base} />
          <stop offset="1" stopColor={palette.light} />
        </linearGradient>
        <radialGradient id={`${gid}glow`} cx={cx / 100} cy={cy / 62} r="0.55">
          <stop offset="0" stopColor="#fff" stopOpacity="0.75" />
          <stop offset="0.35" stopColor={palette.light} stopOpacity="0.35" />
          <stop offset="1" stopColor={palette.light} stopOpacity="0" />
        </radialGradient>
      </defs>
      <rect width="100" height="62" fill={`url(#${gid}bg)`} />
      {motif === "rays" &&
        Array.from({ length: 14 }, (_, i) => (
          <path
            key={i}
            d={`M${cx} ${cy} L${cx + 120 * Math.cos((i / 14) * 6.283 + angle)} ${cy + 120 * Math.sin((i / 14) * 6.283 + angle)} L${cx + 120 * Math.cos(((i + 0.45) / 14) * 6.283 + angle)} ${cy + 120 * Math.sin(((i + 0.45) / 14) * 6.283 + angle)}Z`}
            fill="#fff"
            opacity={0.08}
          />
        ))}
      {motif === "grid" &&
        Array.from({ length: 12 }, (_, i) => (
          <line key={i} x1={i * 9} y1="0" x2={i * 9 - 30} y2="62" stroke="#fff" strokeOpacity="0.12" strokeWidth="2.5" />
        ))}
      {motif === "rings" &&
        Array.from({ length: 6 }, (_, i) => (
          <circle key={i} cx={cx} cy={cy} r={6 + i * 9} fill="none" stroke="#fff" strokeOpacity={0.22 - i * 0.03} strokeWidth="1.4" />
        ))}
      {orbs.map((o, i) => (
        <circle key={i} cx={o.x} cy={o.y} r={o.rad} fill={o.light ? palette.light : palette.dark} opacity={o.o} />
      ))}
      <circle cx={cx} cy={cy} r="30" fill={`url(#${gid}glow)`} />
      {glyph && (
        <text x="50" y="40" textAnchor="middle" fontSize="30" fontWeight="700" fill="#fff" opacity="0.22" fontFamily="Chakra Petch, sans-serif">
          {glyph}
        </text>
      )}
    </svg>
  );
});
