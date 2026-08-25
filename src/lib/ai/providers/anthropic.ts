/**
 * Anthropic Claude provider.
 *
 * Structured output uses tool calling rather than "please reply with JSON":
 * the schema is enforced by the API, which removes an entire class of parse
 * failures. A malformed or schema-violating response is retried once with the
 * validation error fed back, then fails loudly.
 */
import 'server-only';
import Anthropic from '@anthropic-ai/sdk';
import { zodToJsonSchema } from 'zod-to-json-schema';
import type { ZodTypeAny, z } from 'zod';
import type { AiProvider, StructuredRequest, StructuredResponse } from '../types';
import { getEnv } from '@/lib/config/env';
import { providerError } from '@/lib/http/errors';
import { hashingEmbed, EMBEDDING_DIMENSIONS } from '../embeddings';

const MAX_ATTEMPTS = 2;

export class AnthropicProvider implements AiProvider {
  readonly name = 'anthropic';
  readonly model: string;
  private readonly client: Anthropic;
  private readonly defaultMaxTokens: number;

  constructor() {
    const env = getEnv();
    if (!env.ANTHROPIC_API_KEY) {
      throw new Error('ANTHROPIC_API_KEY is required when AI_PROVIDER=anthropic.');
    }
    this.client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY, maxRetries: 2 });
    this.model = env.AI_MODEL;
    this.defaultMaxTokens = env.AI_MAX_TOKENS;
  }

  async complete<T extends ZodTypeAny>(
    request: StructuredRequest<T>,
  ): Promise<StructuredResponse<z.infer<T>>> {
    const started = Date.now();
    const jsonSchema = zodToJsonSchema(request.schema, { target: 'openApi3', $refStrategy: 'none' });

    const messages: Anthropic.MessageParam[] = request.messages.map((m) => ({
      role: m.role,
      content: m.content,
    }));

    let inputTokens = 0;
    let outputTokens = 0;
    let lastError = '';

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
      let response: Anthropic.Message;
      try {
        response = await this.client.messages.create({
          model: this.model,
          max_tokens: request.maxTokens ?? this.defaultMaxTokens,
          temperature: request.temperature ?? 0.2,
          system: request.system,
          messages,
          tools: [
            {
              name: 'submit_result',
              description: `Return the ${request.schemaName} result. This is the only way to answer.`,
              input_schema: jsonSchema as Anthropic.Tool.InputSchema,
            },
          ],
          // Force the tool so the model cannot answer in prose.
          tool_choice: { type: 'tool', name: 'submit_result' },
        });
      } catch (err) {
        throw providerError(`Anthropic request failed for ${request.operation}.`, err);
      }

      inputTokens += response.usage.input_tokens;
      outputTokens += response.usage.output_tokens;

      const toolUse = response.content.find(
        (block): block is Anthropic.ToolUseBlock => block.type === 'tool_use',
      );

      if (!toolUse) {
        lastError = 'Model did not call submit_result.';
      } else {
        const parsed = request.schema.safeParse(toolUse.input);
        if (parsed.success) {
          return {
            data: parsed.data as z.infer<T>,
            meta: {
              provider: this.name,
              model: this.model,
              latencyMs: Date.now() - started,
              inputTokens,
              outputTokens,
              attempts: attempt,
            },
          };
        }
        lastError = parsed.error.issues
          .map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`)
          .join('; ');
      }

      // Feed the failure back so the retry is informed rather than hopeful.
      if (attempt < MAX_ATTEMPTS) {
        messages.push(
          { role: 'assistant', content: 'I attempted to submit a result.' },
          {
            role: 'user',
            content: `That result did not satisfy the schema: ${lastError}\n\nCall submit_result again with a corrected result. Do not explain; just call the tool.`,
          },
        );
      }
    }

    throw providerError(
      `Anthropic returned schema-invalid output for ${request.operation} after ${MAX_ATTEMPTS} attempts: ${lastError}`,
    );
  }

  async completeText(
    request: Omit<StructuredRequest<ZodTypeAny>, 'schema' | 'schemaName'>,
  ): Promise<StructuredResponse<string>> {
    const started = Date.now();
    try {
      const response = await this.client.messages.create({
        model: this.model,
        max_tokens: request.maxTokens ?? this.defaultMaxTokens,
        temperature: request.temperature ?? 0.4,
        system: request.system,
        messages: request.messages.map((m) => ({ role: m.role, content: m.content })),
      });

      const text = response.content
        .filter((b): b is Anthropic.TextBlock => b.type === 'text')
        .map((b) => b.text)
        .join('\n')
        .trim();

      return {
        data: text,
        meta: {
          provider: this.name,
          model: this.model,
          latencyMs: Date.now() - started,
          inputTokens: response.usage.input_tokens,
          outputTokens: response.usage.output_tokens,
          attempts: 1,
        },
      };
    } catch (err) {
      throw providerError(`Anthropic request failed for ${request.operation}.`, err);
    }
  }

  /**
   * Anthropic does not serve an embeddings endpoint. Rather than pretend
   * otherwise, this delegates to the deterministic local embedder, which is
   * good enough for the lexical half of matching. Plug in a real embedding
   * service (e.g. Voyage) in src/lib/ai/embeddings.ts when semantic recall
   * becomes the bottleneck — see docs/AI.md.
   */
  async embed(texts: string[]) {
    return {
      embeddings: texts.map(hashingEmbed),
      model: 'kazios-hashing-v1',
      dimensions: EMBEDDING_DIMENSIONS,
    };
  }

  async healthy(): Promise<boolean> {
    try {
      await this.client.messages.create({
        model: this.model,
        max_tokens: 8,
        messages: [{ role: 'user', content: 'ping' }],
      });
      return true;
    } catch {
      return false;
    }
  }
}
