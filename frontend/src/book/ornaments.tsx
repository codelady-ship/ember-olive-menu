/** Small drawn pieces: gold corners, the crest, an olive sprig, the wax seal. */

export const Arrow = ({ dir }: { dir: 1 | -1 }) => (
  <svg viewBox="0 0 16 16" aria-hidden="true">
    <path d={dir > 0 ? "M3 8h10M9 4l4 4-4 4" : "M13 8H3M7 4 3 8l4 4"} fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
)

/** A gold corner piece; rotate it for the other three corners. */
export const Corner = ({ style }: { style: React.CSSProperties }) => (
  <svg className="eo-corner" style={style} viewBox="0 0 100 100" aria-hidden="true">
    <defs>
      <linearGradient id="eo-gold" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stopColor="#f6e2a6" />
        <stop offset=".4" stopColor="#c9a24a" />
        <stop offset=".7" stopColor="#8a6424" />
        <stop offset="1" stopColor="#e2c27a" />
      </linearGradient>
    </defs>
    <path d="M0 0h100v12H12v88H0z" fill="url(#eo-gold)" />
    <path d="M18 18c18 0 30 6 38 16M18 18c0 18 6 30 16 38" fill="none" stroke="url(#eo-gold)" strokeWidth="3" strokeLinecap="round" />
    <path d="M30 30c8 2 14 7 16 14-7-2-12-7-16-14z" fill="url(#eo-gold)" />
    <circle cx="20" cy="20" r="5" fill="url(#eo-gold)" />
    <circle cx="20" cy="20" r="2" fill="#5b4214" />
  </svg>
)

/** Flame over a pair of olive branches. */
export const Crest = ({ className = "eo-crest" }: { className?: string }) => (
  <svg className={className} viewBox="0 0 120 120" aria-hidden="true">
    <g fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <circle cx="60" cy="60" r="55" strokeWidth="1.2" />
      <circle cx="60" cy="60" r="50" strokeWidth=".8" />
      <path d="M60 30c10 12 14 20 6 32 0-8-4-12-6-14-2 6-8 8-8 16 0 6 4 10 8 10-12 0-18-8-16-18 2-12 14-14 16-26z" fill="currentColor" stroke="none" />
      <path d="M28 70c10 14 22 20 32 20M92 70c-10 14-22 20-32 20" />
      {[0, 1, 2, 3].map((i) => (
        <g key={i}>
          <ellipse cx={34 + i * 6} cy={76 + i * 3.4} rx="5" ry="2.2" transform={`rotate(${35 + i * 8} ${34 + i * 6} ${76 + i * 3.4})`} fill="currentColor" stroke="none" />
          <ellipse cx={86 - i * 6} cy={76 + i * 3.4} rx="5" ry="2.2" transform={`rotate(${-35 - i * 8} ${86 - i * 6} ${76 + i * 3.4})`} fill="currentColor" stroke="none" />
        </g>
      ))}
    </g>
  </svg>
)

export const Sprig = ({ className = "eo-sprig" }: { className?: string }) => (
  <svg className={className} viewBox="0 0 120 40" aria-hidden="true">
    <path d="M4 30C30 22 70 18 116 10" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    {[14, 30, 46, 62, 78, 94].map((x, i) => (
      <g key={x} fill="currentColor">
        <ellipse cx={x} cy={i % 2 ? 19 : 31 - i * 1.6} rx="7" ry="2.4" transform={`rotate(${i % 2 ? -28 : 22} ${x} ${i % 2 ? 19 : 31 - i * 1.6})`} />
      </g>
    ))}
    <ellipse cx="66" cy="27" rx="4" ry="3" fill="#3f4a1c" />
  </svg>
)

export const Seal = ({ letters }: { letters: string }) => {
  const pts: string[] = []
  for (let i = 0; i < 28; i++) {
    const a = (i / 28) * Math.PI * 2
    const r = 46 + (i % 2 ? 3.5 : -1) + Math.sin(i * 1.7) * 1.5
    pts.push((50 + Math.cos(a) * r).toFixed(1) + " " + (50 + Math.sin(a) * r).toFixed(1))
  }
  return (
    <svg viewBox="0 0 100 100" aria-hidden="true">
      <defs>
        <radialGradient id="eo-wax" cx="38%" cy="32%" r="75%">
          <stop offset="0" stopColor="#d4472e" />
          <stop offset=".55" stopColor="#9c1f15" />
          <stop offset="1" stopColor="#5e0e09" />
        </radialGradient>
      </defs>
      <path d={"M" + pts.join("L") + "Z"} fill="url(#eo-wax)" />
      <circle cx="50" cy="50" r="31" fill="none" stroke="rgba(40,4,2,.55)" strokeWidth="3" />
      <text x="50" y="59" textAnchor="middle" fontSize="24" fontFamily="var(--f-display)" fontWeight="700" fill="rgba(60,6,3,.75)">
        {letters}
      </text>
      <text x="49" y="58" textAnchor="middle" fontSize="24" fontFamily="var(--f-display)" fontWeight="700" fill="rgba(255,190,160,.35)">
        {letters}
      </text>
    </svg>
  )
}

export const SteamSvg = () => (
  <svg className="eo-csssteam" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
    <path d="M30 95C22 80 38 70 30 55S36 30 28 15" />
    <path d="M50 98C42 82 58 72 50 56S56 32 48 12" />
    <path d="M70 95C62 80 78 70 70 55S76 30 68 18" />
  </svg>
)

export const Bubbles = () => (
  <span className="eo-cssbubbles" aria-hidden="true">
    {[12, 30, 48, 64, 80, 40, 22, 70].map((l, i) => (
      <i key={i} style={{ left: l + "%", animationDelay: -i * 0.37 + "s", animationDuration: 2 + (i % 3) * 0.6 + "s" }} />
    ))}
  </span>
)
