import { TYPE_COLORS, TYPE_NAMES } from "../data";

const GLYPHS: Record<number, string> = {
  0: "M12 3.2l2.6 5.6 6.1.7-4.5 4.2 1.2 6-5.4-3-5.4 3 1.2-6-4.5-4.2 6.1-.7z",
  1: "M12 3c-5.5 3.2-7.5 8-5.6 12.6C7.6 18.4 9.8 20 12 20.6c2.2-.6 4.4-2.2 5.6-5C19.5 11 17.5 6.2 12 3zm0 4v12",
  2: "M12.5 2.5c.6 3.4 4.8 5.6 4.8 10.4a5.3 5.3 0 0 1-10.6 0c0-2.8 1.6-4.3 2.3-6.3.9 1.6 1.6 2.3 2.6 2.8.4-2.4.3-4.6.9-6.9z",
  3: "M12 2.8C8 8 6 11.2 6 14.2a6 6 0 0 0 12 0c0-3-2-6.2-6-11.4z",
  4: "M13.6 2.5 5.5 13.6h5.6l-1.3 7.9 8.4-11.5h-5.7z",
  5: "M2.5 12S6.3 6 12 6s9.5 6 9.5 6-3.8 6-9.5 6-9.5-6-9.5-6zm9.5-3a3 3 0 1 0 0 6 3 3 0 0 0 0-6z",
  6: "M6.5 9.5V8a1.6 1.6 0 0 1 3.2 0v-.8a1.6 1.6 0 0 1 3.2 0V8a1.6 1.6 0 0 1 3.2 0v1.2a1.6 1.6 0 0 1 3.2 0V14c0 3.6-2.8 6.5-6.4 6.5h-.8A6.4 6.4 0 0 1 5 14.1v-2.6a1.6 1.6 0 0 1 1.5-2z",
  7: "M15.5 3a9 9 0 1 0 5.6 15.4A7.6 7.6 0 0 1 15.5 3z",
  8: "M12 2.8l7.8 4.6v9.2L12 21.2l-7.8-4.6V7.4zM12 8.6a3.4 3.4 0 1 0 0 6.8 3.4 3.4 0 0 0 0-6.8z",
  9: "M12 2.5l5.8 9.5-5.8 9.5L6.2 12zM12 7.5 9.3 12l2.7 4.5 2.7-4.5z",
  10: "M12 3.2l2.6 5.6 6.1.7-4.5 4.2 1.2 6-5.4-3-5.4 3 1.2-6-4.5-4.2 6.1-.7z",
  11: "M5 5h14l-3 14H8z",
};

export function EnergyIcon({ type, size = "1em", title }: { type: number; size?: string; title?: string }) {
  const col = TYPE_COLORS[type] ?? TYPE_COLORS[0];
  const dark = type === 7 || type === 11;
  return (
    <svg
      className="energy-icon"
      viewBox="0 0 24 24"
      width={size}
      height={size}
      role="img"
      aria-label={title ?? `${TYPE_NAMES[type] ?? "?"} Energy`}
    >
      <title>{title ?? `${TYPE_NAMES[type] ?? "?"} Energy`}</title>
      <defs>
        <radialGradient id={`eg${type}`} cx="35%" cy="30%" r="75%">
          <stop offset="0%" stopColor={col.light} />
          <stop offset="60%" stopColor={col.base} />
          <stop offset="100%" stopColor={col.dark} />
        </radialGradient>
      </defs>
      <circle cx="12" cy="12" r="11.2" fill={`url(#eg${type})`} stroke="rgba(0,0,0,.45)" strokeWidth="0.8" />
      <path
        d={GLYPHS[type] ?? GLYPHS[0]}
        transform="translate(12 12) scale(0.68) translate(-12 -12)"
        fill={dark ? "#f1f3fa" : "rgba(15,18,28,.82)"}
        fillRule="evenodd"
        stroke={type === 1 ? (dark ? "#f1f3fa" : "rgba(15,18,28,.82)") : "none"}
        strokeWidth={type === 1 ? 0.6 : 0}
      />
    </svg>
  );
}

export function EnergyCost({ cost, size }: { cost: number[]; size?: string }) {
  if (!cost.length) return <span className="cost-free">—</span>;
  return (
    <span className="energy-cost">
      {cost.map((t, i) => (
        <EnergyIcon key={i} type={t} size={size} />
      ))}
    </span>
  );
}
