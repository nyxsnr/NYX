/**
 * File storage.
 *
 * Uploads are validated before a byte is written: the declared MIME type must
 * be allowed for the purpose, the magic-number prefix must match, and the size
 * must be within the per-purpose limit. Filenames from users are never used as
 * storage keys — keys are generated — which removes path traversal entirely.
 */
import 'server-only';
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { getEnv } from '@/lib/config/env';
import { AppError } from '@/lib/http/errors';

export type FilePurpose = 'cv' | 'portfolio' | 'task_brief' | 'submission' | 'verification' | 'avatar';

export interface StoredFile {
  storageKey: string;
  provider: string;
  size: number;
  contentType: string;
  checksum: string;
}

export interface StorageProvider {
  readonly name: string;
  put(key: string, data: Buffer, contentType: string): Promise<void>;
  get(key: string): Promise<Buffer>;
  delete(key: string): Promise<void>;
  /** Time-limited read URL, where the backend supports one. */
  signedUrl(key: string, expiresInSeconds: number): Promise<string | null>;
}

const MB = 1024 * 1024;

const DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

/** Per-purpose limits, chosen for phones on metered mobile data. */
const LIMITS: Record<FilePurpose, { maxBytes: number; types: string[] }> = {
  cv: { maxBytes: 5 * MB, types: ['application/pdf', 'application/msword', DOCX, 'text/plain'] },
  portfolio: { maxBytes: 10 * MB, types: ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'] },
  task_brief: { maxBytes: 15 * MB, types: ['application/pdf', 'text/csv', 'application/vnd.ms-excel', XLSX, 'image/jpeg', 'image/png', 'text/plain'] },
  submission: { maxBytes: 25 * MB, types: ['application/pdf', 'text/csv', 'application/vnd.ms-excel', XLSX, DOCX, 'image/jpeg', 'image/png', 'image/webp', 'text/plain'] },
  verification: { maxBytes: 8 * MB, types: ['application/pdf', 'image/jpeg', 'image/png'] },
  avatar: { maxBytes: 2 * MB, types: ['image/jpeg', 'image/png', 'image/webp'] },
};

/**
 * Magic-number prefixes.
 *
 * A declared Content-Type is attacker-controlled. Checking the real bytes is
 * what stops an HTML file labelled `image/png` from being stored and later
 * served back as a stored-XSS payload.
 */
const MAGIC: Array<{ type: string; prefixes: number[][] }> = [
  { type: 'application/pdf', prefixes: [[0x25, 0x50, 0x44, 0x46]] },
  { type: 'image/jpeg', prefixes: [[0xff, 0xd8, 0xff]] },
  { type: 'image/png', prefixes: [[0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]] },
  { type: 'image/webp', prefixes: [[0x52, 0x49, 0x46, 0x46]] },
  // .docx / .xlsx are ZIP containers; legacy Office files are OLE compound files.
  { type: DOCX, prefixes: [[0x50, 0x4b, 0x03, 0x04]] },
  { type: XLSX, prefixes: [[0x50, 0x4b, 0x03, 0x04]] },
  { type: 'application/msword', prefixes: [[0xd0, 0xcf, 0x11, 0xe0]] },
  { type: 'application/vnd.ms-excel', prefixes: [[0xd0, 0xcf, 0x11, 0xe0]] },
];

function magicMatches(buffer: Buffer, contentType: string): boolean {
  // Plain text and CSV have no signature. They are safe because they are only
  // ever served with a non-executable type and an attachment disposition.
  if (contentType === 'text/plain' || contentType === 'text/csv') return true;

  const entry = MAGIC.find((m) => m.type === contentType);
  if (!entry) return false;
  return entry.prefixes.some((prefix) => prefix.every((byte, i) => buffer[i] === byte));
}

const DANGEROUS_EXTENSION = /\.(php|phtml|exe|sh|bat|cmd|js|mjs|html?|svg|jar|com|scr)(\.|$)/i;

export function validateUpload(
  buffer: Buffer,
  contentType: string,
  purpose: FilePurpose,
  fileName: string,
): void {
  const limit = LIMITS[purpose];

  if (buffer.length === 0) throw new AppError('BAD_REQUEST', 'The file is empty.');
  if (buffer.length > limit.maxBytes) {
    throw new AppError(
      'PAYLOAD_TOO_LARGE',
      `Files for this purpose must be under ${Math.round(limit.maxBytes / MB)} MB.`,
    );
  }
  if (!limit.types.includes(contentType)) {
    throw new AppError(
      'UNSUPPORTED_MEDIA_TYPE',
      `That file type is not accepted here. Allowed: ${limit.types.map((t) => t.split('/').pop()).join(', ')}.`,
    );
  }
  if (!magicMatches(buffer, contentType)) {
    throw new AppError('BAD_REQUEST', 'The file contents do not match its type. Re-save the file and try again.');
  }
  // Double extensions are a classic way to smuggle an executable past a filter.
  if (DANGEROUS_EXTENSION.test(fileName)) {
    throw new AppError('BAD_REQUEST', 'That file type is not accepted.');
  }
}

const EXTENSION_BY_TYPE: Record<string, string> = {
  'application/pdf': 'pdf',
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'text/plain': 'txt',
  'text/csv': 'csv',
  [DOCX]: 'docx',
  [XLSX]: 'xlsx',
  'application/msword': 'doc',
  'application/vnd.ms-excel': 'xls',
};

/** Keys are generated, never derived from user input. */
export function buildStorageKey(purpose: FilePurpose, ownerId: string, contentType: string): string {
  return `${purpose}/${ownerId}/${randomUUID()}.${EXTENSION_BY_TYPE[contentType] ?? 'bin'}`;
}

/** Local disk storage. Development only — serverless filesystems are ephemeral. */
class LocalStorageProvider implements StorageProvider {
  readonly name = 'local';
  private readonly root: string;

  constructor() {
    // `turbopackIgnore` keeps the bundler from tracing the entire project into
    // the server output just because this path is computed at runtime. Local
    // storage is a development-only provider; Supabase Storage is used in
    // production, where the filesystem is ephemeral anyway.
    this.root = path.resolve(/* turbopackIgnore: true */ process.cwd(), getEnv().STORAGE_LOCAL_DIR);
  }

  private resolve(key: string): string {
    const full = path.resolve(this.root, key);
    // Defence in depth: keys are generated, but never trust that alone.
    if (full !== this.root && !full.startsWith(this.root + path.sep)) {
      throw new AppError('BAD_REQUEST', 'Invalid storage key.');
    }
    return full;
  }

  async put(key: string, data: Buffer): Promise<void> {
    const full = this.resolve(key);
    await mkdir(path.dirname(full), { recursive: true });
    await writeFile(full, data);
  }

  async get(key: string): Promise<Buffer> {
    return readFile(this.resolve(key));
  }

  async delete(key: string): Promise<void> {
    try {
      await unlink(this.resolve(key));
    } catch {
      // Already gone counts as deleted.
    }
  }

  async signedUrl(): Promise<string | null> {
    // Local files stream through an authenticated route instead.
    return null;
  }
}

/**
 * Supabase Storage.
 *
 * Uses the service-role key, which is exactly why this module is server-only:
 * that key bypasses row-level security and must never reach a browser bundle.
 */
class SupabaseStorageProvider implements StorageProvider {
  readonly name = 'supabase';
  private readonly url: string;
  private readonly key: string;
  private readonly bucket: string;

  constructor() {
    const env = getEnv();
    this.url = (env.SUPABASE_URL ?? '').replace(/\/$/, '');
    this.key = env.SUPABASE_SERVICE_ROLE_KEY ?? '';
    this.bucket = env.SUPABASE_STORAGE_BUCKET;
  }

  private headers(extra: Record<string, string> = {}): Record<string, string> {
    return { Authorization: `Bearer ${this.key}`, apikey: this.key, ...extra };
  }

  async put(key: string, data: Buffer, contentType: string): Promise<void> {
    const response = await fetch(`${this.url}/storage/v1/object/${this.bucket}/${key}`, {
      method: 'POST',
      headers: this.headers({ 'Content-Type': contentType, 'x-upsert': 'true' }),
      body: new Uint8Array(data),
    });
    if (!response.ok) throw new AppError('PROVIDER_ERROR', `Upload failed (HTTP ${response.status}).`);
  }

  async get(key: string): Promise<Buffer> {
    const response = await fetch(`${this.url}/storage/v1/object/${this.bucket}/${key}`, {
      headers: this.headers(),
    });
    if (!response.ok) throw new AppError('NOT_FOUND', 'File not found.');
    return Buffer.from(await response.arrayBuffer());
  }

  async delete(key: string): Promise<void> {
    await fetch(`${this.url}/storage/v1/object/${this.bucket}/${key}`, {
      method: 'DELETE',
      headers: this.headers(),
    });
  }

  async signedUrl(key: string, expiresInSeconds: number): Promise<string | null> {
    const response = await fetch(`${this.url}/storage/v1/object/sign/${this.bucket}/${key}`, {
      method: 'POST',
      headers: this.headers({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ expiresIn: expiresInSeconds }),
    });
    if (!response.ok) return null;
    const body = (await response.json()) as { signedURL?: string };
    return body.signedURL ? `${this.url}/storage/v1${body.signedURL}` : null;
  }
}

let providerInstance: StorageProvider | null = null;

export function getStorage(): StorageProvider {
  if (providerInstance) return providerInstance;
  providerInstance =
    getEnv().STORAGE_PROVIDER === 'supabase' ? new SupabaseStorageProvider() : new LocalStorageProvider();
  return providerInstance;
}

/** Test seam. */
export function setStorage(provider: StorageProvider | null): void {
  providerInstance = provider;
}

/** Validate, store, and return metadata for a `files` row. */
export async function storeFile(input: {
  buffer: Buffer;
  contentType: string;
  fileName: string;
  purpose: FilePurpose;
  ownerId: string;
}): Promise<StoredFile> {
  validateUpload(input.buffer, input.contentType, input.purpose, input.fileName);

  const storage = getStorage();
  const key = buildStorageKey(input.purpose, input.ownerId, input.contentType);
  await storage.put(key, input.buffer, input.contentType);

  return {
    storageKey: key,
    provider: storage.name,
    size: input.buffer.length,
    contentType: input.contentType,
    checksum: createHash('sha256').update(input.buffer).digest('hex'),
  };
}

/** Strip directory components and control characters from a display filename. */
export function sanitizeFileName(name: string): string {
  const cleaned = name
    .replace(/[/\\]/g, '_')
    .split('')
    .filter((ch) => {
      const code = ch.charCodeAt(0);
      return code > 31 && code !== 127;
    })
    .join('')
    .trim()
    .slice(0, 180);
  return cleaned || 'file';
}
