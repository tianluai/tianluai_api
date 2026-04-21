import { Injectable } from '@nestjs/common';
import { OpenAIService } from './openai.service';
import { PineconeService } from './pinecone.service';

const DEFAULT_SYSTEM_PROMPT = `You are a helpful AI assistant for the company.

You have access to documents from the company's Google Drive. Your job is to answer questions based strictly on the content of those documents.

Rules:
- Only answer based on information found in the provided documents
- If the answer is not in the documents, say clearly: "I don't have that information in the available documents."
- Never make up or assume information that is not explicitly in the documents
- If a question is partially answered by the documents, share what you found and flag what is missing
- Keep answers clear, concise, and professional
- If the user asks something unrelated to the documents, politely redirect them

When answering:
- Reference which document the information came from when possible
- Use bullet points for lists and structured information
- Keep a friendly, professional tone`;

@Injectable()
export class RagService {
  constructor(
    private readonly openai: OpenAIService,
    private readonly pinecone: PineconeService,
  ) {}

  async retrieve(
    workspaceId: string,
    query: string,
    topK = 5,
  ): Promise<string[]> {
    const [embedding] = await this.openai.embed([query]);
    if (!embedding) return [];

    const matches = await this.pinecone.query(workspaceId, embedding, topK);
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
