/**
 * Load `.env.local` and `.env` for code that runs outside Next.js.
 *
 * Next.js reads these files itself for `next dev` and `next build`, but
 * `tsx scripts/*.ts` and Vitest do not — without this the README's quick start
 * fails at `npm run db:migrate` with "DATABASE_URL is not set", immediately
 * after telling you to put DATABASE_URL in `.env.local`.
 *
 * Precedence matches Next.js: a variable already present in the real
 * environment always wins, then `.env.local`, then `.env`. That keeps
 * `DATABASE_URL=... npm run db:migrate` pointing where the caller said.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';

/** Files in precedence order; the first to define a key wins. */
const ENV_FILES = ['.env.local', '.env'];

export interface LoadEnvOptions {
  /** Directory holding the env files. Defaults to the process working directory. */
  cwd?: string;
  /**
   * Import only these variables. The test harness uses this to pick up
   * TEST_DATABASE_URL without also inheriting the *development* DATABASE_URL,
   * which would point the suites at the developer's own data.
   */
  only?: readonly string[];
}

/**
 * Parse a dotenv file.
 *
 * Deliberately small: `KEY=value`, an optional `export` prefix, `#` comments,
 * and single- or double-quoted values (escape sequences are expanded only
 * inside double quotes, as in every other dotenv implementation).
 */
export function parseEnv(contents: string): Record<string, string> {
  const out: Record<string, string> = {};

  for (const rawLine of contents.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;

    const match = /^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line);
    if (!match?.[1]) continue;

    const key = match[1];
    let value = (match[2] ?? '').trim();

    if (value.length >= 2 && value.startsWith('"') && value.endsWith('"')) {
      value = value.slice(1, -1).replace(/\\n/g, '\n').replace(/\\r/g, '\r').replace(/\\"/g, '"');
    } else if (value.length >= 2 && value.startsWith("'") && value.endsWith("'")) {
      value = value.slice(1, -1);
    } else {
      // An unquoted value runs up to an inline `#`, so trailing comments work.
      value = (value.split(/\s+#/)[0] ?? '').trim();
    }

    out[key] = value;
  }

  return out;
}

/**
 * Populate `process.env` from the dotenv files without overwriting anything the
 * caller already set. A missing file is not an error — a deployment that
 * supplies real environment variables has no `.env.local` at all.
 *
 * Returns the names of the files that were read.
 */
export function loadEnv(options: LoadEnvOptions = {}): string[] {
  const cwd = options.cwd ?? process.cwd();
  const only = options.only ? new Set(options.only) : null;
  const loaded: string[] = [];

  for (const file of ENV_FILES) {
    let contents: string;
    try {
      contents = readFileSync(path.join(cwd, file), 'utf8');
    } catch {
      continue;
    }

    for (const [key, value] of Object.entries(parseEnv(contents))) {
      if (only && !only.has(key)) continue;
      if (process.env[key] === undefined) process.env[key] = value;
    }
    loaded.push(file);
  }

  return loaded;
}
