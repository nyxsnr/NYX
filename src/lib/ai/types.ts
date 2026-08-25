/**
 * The provider boundary.
 *
 * Everything above this line speaks in operations ("assess these capabilities");
 * everything below speaks to a specific model API. Swapping Anthropic for
 * another provider means writing one class, not touching the product code.
 */
import type { ZodTypeAny, z } from 'zod';

export interface AiMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface StructuredRequest<T extends ZodTypeAny> {
  /** Stable operation name; used for logging, limits and cache keys. */
  operation: string;
  system: string;
  messages: AiMessage[];
  schema: T;
  /** Human-readable schema description injected into the prompt. */
  schemaName: string;
  /**
   * The structured payload the operation was called with.
   *
   * The Anthropic provider ignores this (the same data is already rendered
   * into `messages`); the deterministic development provider computes its
   * response from it directly rather than trying to re-parse prose.
   */
  input?: Record<string, unknown>;
  maxTokens?: number;
  temperature?: number;
}

export interface StructuredResponse<T> {
  data: T;
  meta: {
    provider: string;
    model: string;
    latencyMs: number;
    inputTokens: number;
    outputTokens: number;
    /** How many attempts the provider needed to return schema-valid JSON. */
    attempts: number;
  };
}

export interface AiProvider {
  readonly name: string;
  readonly model: string;

  /**
   * Produce output validated against `schema`. Implementations must retry on
   * malformed JSON and must throw rather than return partial data.
   */
  complete<T extends ZodTypeAny>(request: StructuredRequest<T>): Promise<StructuredResponse<z.infer<T>>>;

  /** Free-form text, used only by the career agent's conversational replies. */
  completeText(request: Omit<StructuredRequest<ZodTypeAny>, 'schema' | 'schemaName'>): Promise<StructuredResponse<string>>;

  /** Vector embedding for semantic matching. */
  embed(texts: string[]): Promise<{ embeddings: number[][]; model: string; dimensions: number }>;

  /** True when the provider can actually reach its backend right now. */
  healthy(): Promise<boolean>;
}
