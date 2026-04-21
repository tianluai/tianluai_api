import { Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Pinecone } from '@pinecone-database/pinecone';

@Injectable()
export class PineconeService implements OnModuleInit {
  private client: Pinecone | null = null;
  private indexName: string;

  constructor(private readonly config: ConfigService) {
    this.indexName = this.config.get('PINECONE_INDEX', 'default');
  }

  get embedDimension(): number {
    return this.config.get<number>('EMBED_DIMENSION', 1024);
  }

  async onModuleInit() {
    const apiKey = this.config.get<string>('PINECONE_API_KEY');
    if (!apiKey) return;
    this.client = new Pinecone({ apiKey });
    try {
      await this.client.describeIndex(this.indexName);
    } catch (error: unknown) {
      const status =
        (error as { status?: number })?.status ??
        (error as { cause?: { status?: number } })?.cause?.status;
      const is404 =
        status === 404 || String((error as Error).message).includes('404');
      if (is404) {
        throw new Error(
          `Pinecone index "${this.indexName}" not found (404). Create it in Pinecone: https://app.pinecone.io → Create Index → name: ${this.indexName}, dimension: ${this.embedDimension}, metric: cosine. Or set PINECONE_INDEX in api/.env to an existing index name.`,
        );
      }
      throw error;
    }
  }

  private toNamespace(workspaceId: string): string {
    return `workspace-${workspaceId}`;
  }

  async query(workspaceId: string, vector: number[], topK = 5) {
    if (!this.client) return [];

    const workspaceNamespace = this.client
      .index(this.indexName)
      .namespace(this.toNamespace(workspaceId));
    const queryResult = await workspaceNamespace.query({
      vector,
      topK,
      includeMetadata: true,
    });

    return (queryResult.matches ?? []).map((match) => ({
      id: match.id,
      text: (match.metadata?.text as string) ?? '',
      metadata: match.metadata as Record<string, unknown> | undefined,
    }));
  }

  async upsert(
    workspaceId: string,
    vectors: {
      id: string;
      values: number[];
      metadata: Record<string, string | number | boolean | string[]>;
    }[],
  ) {
    if (!this.client || vectors.length === 0) return;

    const workspaceNamespace = this.client
      .index(this.indexName)
      .namespace(this.toNamespace(workspaceId));
    await workspaceNamespace.upsert({ records: vectors });
  }
}
