import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';

@Injectable()
export class OpenAIService {
  private readonly logger = new Logger(OpenAIService.name);
  private client: OpenAI | null = null;

  constructor(private readonly config: ConfigService) {
    const apiKey = this.config.get<string>('OPENAI_API_KEY');
    if (!apiKey) {
      this.logger.warn('OPENAI_API_KEY not set — LLM features disabled');
      return;
    }
    this.client = new OpenAI({ apiKey });
  }

  async embed(texts: string[]): Promise<number[][]> {
    if (!this.client || texts.length === 0) return [];

    const dimensions = this.config.get<number>('EMBED_DIMENSION', 1024);
    const embeddingsResponse = await this.client.embeddings.create({
      model: 'text-embedding-3-small',
      input: texts,
      dimensions,
    });
    return embeddingsResponse.data
      .sort(
        (firstEmbedding, secondEmbedding) =>
          firstEmbedding.index - secondEmbedding.index,
      )
      .map((embeddingItem) => embeddingItem.embedding);
  }

  async chatStream(
    messages: OpenAI.Chat.ChatCompletionMessageParam[],
    options: { model?: string; temperature?: number } = {},
  ) {
    if (!this.client) throw new Error('OpenAI API key not configured');

    return this.client.chat.completions.create({
      model: options.model ?? 'gpt-4o',
      messages,
      temperature: options.temperature ?? 0.3,
      stream: true,
    });
  }
}
