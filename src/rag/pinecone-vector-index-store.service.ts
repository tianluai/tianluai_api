import { Injectable } from '@nestjs/common';
import { PineconeService } from './pinecone.service';
import type {
  VectorIndexRecord,
  VectorIndexStore,
  VectorSimilarityMatch,
} from '../indexing/vector-index-store.port';

@Injectable()
export class PineconeVectorIndexStore implements VectorIndexStore {
  readonly providerId = 'pinecone';

  constructor(private readonly pinecone: PineconeService) {}

  async upsertVectors(
    workspaceId: string,
    records: VectorIndexRecord[],
  ): Promise<void> {
    await this.pinecone.upsert(workspaceId, records);
  }

  async querySimilar(
    workspaceId: string,
    vector: number[],
    topK: number,
  ): Promise<VectorSimilarityMatch[]> {
    const matches = await this.pinecone.query(workspaceId, vector, topK);
    return matches.map((match) => ({
      id: match.id,
      text: match.text,
      metadata: match.metadata,
    }));
  }
}
