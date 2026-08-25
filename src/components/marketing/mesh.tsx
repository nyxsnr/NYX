/**
 * The gradient mesh behind the cinematic sections.
 *
 * Four blurred colour fields drifting on long, mutually-prime durations so
 * the composition never visibly repeats. Positions are props rather than
 * fixed, so the hero and the closing call to action can share the mechanism
 * without sharing a composition.
 *
 * Presentational only — `aria-hidden`, no pointer events, and it degrades to
 * four static colour fields under `prefers-reduced-motion`.
 */
const PALETTES = {
  brand: [
    { color: 'rgb(20 161 129 / 0.95)', top: '-22%', left: '-12%', size: '44rem' },
    { color: 'rgb(53 196 218 / 0.72)', top: '-6%', left: '52%', size: '40rem' },
    { color: 'rgb(109 94 240 / 0.60)', top: '38%', left: '8%', size: '40rem' },
    { color: 'rgb(226 156 57 / 0.34)', top: '52%', left: '66%', size: '30rem' },
  ],
  close: [
    { color: 'rgb(20 161 129 / 0.85)', top: '-34%', left: '26%', size: '42rem' },
    { color: 'rgb(53 196 218 / 0.60)', top: '14%', left: '-14%', size: '34rem' },
    { color: 'rgb(109 94 240 / 0.55)', top: '4%', left: '70%', size: '36rem' },
    { color: 'rgb(226 156 57 / 0.26)', top: '58%', left: '44%', size: '26rem' },
  ],
} as const;

export function Mesh({ variant = 'brand' }: { variant?: keyof typeof PALETTES }) {
  return (
    <div className="mesh" aria-hidden="true">
      {PALETTES[variant].map((blob) => (
        <span
          key={blob.color + blob.left}
          className="mesh-blob"
          style={{ background: blob.color, top: blob.top, left: blob.left, width: blob.size, height: blob.size }}
        />
      ))}
    </div>
  );
}
