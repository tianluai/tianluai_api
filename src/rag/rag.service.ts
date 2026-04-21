import { Inject, Injectable } from '@nestjs/common';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { VECTOR_INDEX_STORE } from '../indexing/indexing.tokens';
import type { VectorIndexStore } from '../indexing/vector-index-store.port';
import { OpenAIService } from './openai.service';

/**
 * Nest copies `src/rag/prompts/*.md` to `dist/rag/prompts/`, while compiled JS lives under
 * `dist/src/rag/`. Try `./prompts` first (source / co-located build), then `dist/rag/prompts`.
 */
function loadDefaultSystemPrompt(): string {
  const nextToModule = join(__dirname, 'prompts', 'default-system-prompt.md');
  const nestCliAssetPath = join(
    __dirname,
    '..',
    '..',
    'rag',
    'prompts',
    'default-system-prompt.md',
  );
  const path = existsSync(nextToModule) ? nextToModule : nestCliAssetPath;
  if (!existsSync(path)) {
    throw new Error(
      `RAG default system prompt not found. Tried:\n- ${nextToModule}\n- ${nestCliAssetPath}`,
    );
  }
  return readFileSync(path, 'utf8').trim();
}

const DEFAULT_SYSTEM_PROMPT = loadDefaultSystemPrompt();

@Injectable()
export class RagService {
  constructor(
    private readonly openai: OpenAIService,
    @Inject(VECTOR_INDEX_STORE)
    private readonly vectorIndex: VectorIndexStore,
  ) {}

  async retrieve(
    workspaceId: string,
    query: string,
    topK = 5,
  ): Promise<string[]> {
    const [embedding] = await this.openai.embed([query]);
    if (!embedding) return [];

    const matches = await this.vectorIndex.querySimilar(
      workspaceId,
      embedding,
      topK,
    );
    return matches.map((match) => match.text).filter(Boolean);
  }

  private buildContext(chunks: string[]): string {
    if (chunks.length === 0) {
      return 'No relevant documents were found for this query.';
    }
    return (
      'Relevant document excerpts:\n\n' +
      chunks
        .map(
          (documentChunk, chunkIndex) =>
            `[${chunkIndex + 1}]\n${documentChunk}`,
        )
        .join('\n\n')
    );
  }

  /** Async generator (`async *`) streams answer chunks via `yield` for SSE-style consumption. */
  async *streamChat(
    workspaceId: string,
    userMessage: string,
    history: { role: 'user' | 'assistant'; content: string }[],
    options: {
      model?: string;
      temperature?: number;
      systemPrompt?: string | null;
    } = {},
  ): AsyncGenerator<string> {
    const chunks = await this.retrieve(workspaceId, userMessage);
    const context = this.buildContext(chunks);
    const systemPrompt = options.systemPrompt ?? DEFAULT_SYSTEM_PROMPT;

    const messages: {
      role: 'user' | 'assistant' | 'system';
      content: string;
    }[] = [
      { role: 'system', content: `${systemPrompt}\n\n${context}` },
      ...history,
      { role: 'user', content: userMessage },
    ];

    const stream = await this.openai.chatStream(messages, {
      model: options.model ?? 'gpt-4o',
      temperature: options.temperature ?? 0.3,
    });

    for await (const chunk of stream) {
      const delta = chunk.choices?.[0]?.delta?.content;
      if (delta) yield delta;
    }
  }
}
