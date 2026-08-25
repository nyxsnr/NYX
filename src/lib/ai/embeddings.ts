/**
 * Deterministic local embeddings.
 *
 * This is a hashed bag-of-n-grams projected into a fixed-width vector — the
 * classic "hashing trick". It captures lexical overlap (shared terms, shared
 * word stems) which is genuinely useful for candidate/opportunity recall, and
 * it is free, offline and reproducible.
 *
 * It is NOT a learned semantic embedding: it will not know that "bookkeeping"
 * and "accounts reconciliation" are related unless the words overlap. Semantic
 * recall is the job of a real embedding service; this module is the seam where
 * one gets plugged in. See docs/AI.md.
 *
 * The explainable feature-based matcher in src/lib/matching is the primary
 * ranking signal either way — embeddings only widen the candidate pool.
 */
import { createHash } from 'node:crypto';

export const EMBEDDING_DIMENSIONS = 1536;
export const EMBEDDING_MODEL = 'kazios-hashing-v1';

/** Words that carry no matching signal and would dominate short documents. */
const STOP_WORDS = new Set([
  'the', 'and', 'for', 'with', 'this', 'that', 'from', 'have', 'has', 'was', 'were',
  'are', 'you', 'your', 'our', 'their', 'they', 'will', 'can', 'all', 'any', 'but',
  'not', 'who', 'how', 'its', 'his', 'her', 'out', 'about', 'into', 'over', 'than',
  'then', 'them', 'these', 'those', 'been', 'being', 'when', 'where', 'which',
]);

export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s+#.-]/g, ' ')
    .split(/\s+/)
    .map((t) => t.replace(/^[.-]+|[.-]+$/g, ''))
    .filter((t) => t.length >= 2 && t.length <= 32 && !STOP_WORDS.has(t));
}

/** Stable 32-bit hash of a feature string. */
function hashFeature(feature: string): number {
  const digest = createHash('sha1').update(feature).digest();
  return digest.readUInt32BE(0);
}

/**
 * Project text into a unit-length vector.
 *
 * Unigrams and adjacent bigrams are hashed into buckets with a signed
 * contribution (the sign comes from a second hash bit), which keeps collisions
 * from systematically inflating similarity. Term frequency is dampened with
 * sqrt so one repeated word cannot dominate.
 */
export function hashingEmbed(text: string, dimensions = EMBEDDING_DIMENSIONS): number[] {
  const vector = new Array<number>(dimensions).fill(0);
  const tokens = tokenize(text);
  if (tokens.length === 0) return vector;

  const counts = new Map<string, number>();
  const bump = (feature: string, weight: number) => {
    counts.set(feature, (counts.get(feature) ?? 0) + weight);
  };

  for (let i = 0; i < tokens.length; i += 1) {
    bump(tokens[i] as string, 1);
    if (i + 1 < tokens.length) bump(`${tokens[i]}_${tokens[i + 1]}`, 0.5);
  }

  for (const [feature, count] of counts) {
    const h = hashFeature(feature);
    const bucket = h % dimensions;
    const sign = (h >>> 31) & 1 ? -1 : 1;
    (vector[bucket] as number) += sign * Math.sqrt(count);
  }

  const norm = Math.sqrt(vector.reduce((acc, v) => acc + v * v, 0));
  if (norm === 0) return vector;
  return vector.map((v) => v / norm);
}

/** Cosine similarity of two equal-length vectors, in [-1, 1]. */
export function cosineSimilarity(a: readonly number[], b: readonly number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i += 1) {
    const av = a[i] as number;
    const bv = b[i] as number;
    dot += av * bv;
    na += av * av;
    nb += bv * bv;
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

/** Content hash, so an unchanged document is never re-embedded. */
export function contentHash(text: string): string {
  return createHash('sha256').update(text).digest('hex');
}

/**
 * Build the text that represents a worker for matching purposes.
 * Deliberately excludes name, age, location and any protected characteristic.
 */
export function workerEmbeddingText(input: {
  headline?: string | null;
  summary?: string | null;
  skills: string[];
  interests?: string[];
  experienceTitles?: string[];
}): string {
  return [
    input.headline ?? '',
    input.summary ?? '',
    input.skills.join(' '),
    (input.interests ?? []).join(' '),
    (input.experienceTitles ?? []).join(' '),
  ]
    .filter(Boolean)
    .join('\n');
}

/** Matching text for a job or task posting. */
export function opportunityEmbeddingText(input: {
  title: string;
  description: string;
  category?: string;
  skills: string[];
  expectedOutput?: string | null;
}): string {
  return [
    input.title,
    input.category ?? '',
    input.description,
    input.expectedOutput ?? '',
    input.skills.join(' '),
  ]
    .filter(Boolean)
    .join('\n');
}
