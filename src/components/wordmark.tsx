import Link from 'next/link';

/**
 * The KaziOS wordmark.
 *
 * One definition, used by the marketing header, the footer and the signed-in
 * shell — previously each drew its own slightly different version of the mark.
 * The glyph is a rounded square holding a "K" over a jade gradient, which
 * survives being rendered at 28px on a phone status bar.
 */
export function Wordmark({
  href,
  size = 'base',
  accent = 'jade',
}: {
  href?: string;
  size?: 'sm' | 'base';
  accent?: 'jade' | 'ochre';
}) {
  const box = size === 'sm' ? 'h-7 w-7 text-xs' : 'h-9 w-9 text-sm';
  const text = size === 'sm' ? 'text-base' : 'text-lg';
  const gradient =
    accent === 'ochre'
      ? 'linear-gradient(135deg, var(--color-ochre-400), var(--color-ochre-600))'
      : 'linear-gradient(135deg, var(--color-jade-500), var(--color-jade-700))';

  const inner = (
    <>
      <span
        aria-hidden="true"
        className={`flex items-center justify-center rounded-xl font-extrabold text-white shadow-[var(--shadow-soft)] ${box}`}
        style={{ background: gradient }}
      >
        K
      </span>
      <span className={`font-extrabold tracking-tight ${text}`}>KaziOS</span>
    </>
  );

  if (!href) return <span className="flex items-center gap-2.5">{inner}</span>;

  return (
    <Link
      href={href}
      className="flex items-center gap-2.5 rounded-lg transition-opacity hover:opacity-85"
      aria-label="KaziOS home"
    >
      {inner}
    </Link>
  );
}
