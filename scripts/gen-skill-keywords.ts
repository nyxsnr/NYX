/**
 * Regenerate src/lib/ai/skill-keywords.ts from the live skills table.
 *
 * The database is the source of truth for the taxonomy; this file exists only
 * so keyword matching can run without a query. Run after changing the
 * reference-data migration:
 *
 *   npm run gen:skills
 */
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import postgres from 'postgres';
import { loadEnv } from './lib/load-env';

loadEnv();

interface SkillRow {
  slug: string;
  name: string;
  category: string;
  aliases: string[];
}

const quote = (v: string) => `'${v.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not set.');

  const sql = postgres(url, { max: 1, ssl: process.env.DATABASE_SSL === 'require' ? 'require' : false });
  try {
    const rows = await sql<SkillRow[]>`
      SELECT slug, name, category, aliases FROM skills WHERE is_active ORDER BY category, slug
    `;

    const entries = rows.map((r) => {
      const keywords = [r.name.toLowerCase(), ...r.aliases.map((a) => a.toLowerCase())].filter(
        (v, i, all) => all.indexOf(v) === i,
      );
      return `  { slug: ${quote(r.slug)}, name: ${quote(r.name)}, category: ${quote(r.category)}, keywords: [${keywords.map(quote).join(', ')}] },`;
    });

    const header = `/**
 * Keyword index over the skill taxonomy.
 *
 * Generated from db/migrations/0010_reference_data.sql — the database remains
 * the source of truth. This module exists so that keyword matching (CV
 * extraction, capability inference, job-description drafting) can run
 * synchronously without a database round-trip per call.
 *
 * Regenerate with: npm run gen:skills
 */

export interface SkillKeywordEntry {
  slug: string;
  name: string;
  category: string;
  /** Name plus every alias, lowercased, used for substring matching. */
  keywords: string[];
}

export const SKILL_KEYWORDS: readonly SkillKeywordEntry[] = [
`;

    const footer = `] as const;

/** Fast slug -> entry lookup. */
export const SKILL_BY_SLUG: ReadonlyMap<string, SkillKeywordEntry> = new Map(
  SKILL_KEYWORDS.map((s) => [s.slug, s]),
);

/** All distinct categories in taxonomy order. */
export const SKILL_CATEGORIES: readonly string[] = [
  ...new Set(SKILL_KEYWORDS.map((s) => s.category)),
];

/** Resolve free text to a taxonomy slug, or null when nothing matches. */
export function resolveSkillSlug(text: string): string | null {
  const needle = text.trim().toLowerCase();
  if (!needle) return null;
  const exact = SKILL_KEYWORDS.find((s) => s.keywords.includes(needle));
  if (exact) return exact.slug;
  const partial = SKILL_KEYWORDS.find((s) =>
    s.keywords.some((k) => k.length >= 4 && (needle.includes(k) || k.includes(needle))),
  );
  return partial?.slug ?? null;
}
`;

    const target = path.join(process.cwd(), 'src', 'lib', 'ai', 'skill-keywords.ts');
    await writeFile(target, header + entries.join('\n') + '\n' + footer, 'utf8');
    console.log(`Wrote ${rows.length} skills to src/lib/ai/skill-keywords.ts`);
  } finally {
    await sql.end({ timeout: 5 });
  }
}

main().catch((err: unknown) => {
  console.error('Generation failed:', err instanceof Error ? err.message : err);
  process.exit(1);
});
