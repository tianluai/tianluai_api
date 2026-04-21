/**
 * Abstraction over “where embeddings are stored and queried” (Pinecone, pgvector, …).
 */
export type VectorIndexRecord = {
  id: string;
  values: number[];
  metadata: Record<string, string | number | boolean | string[]>;
};

export type VectorSimilarityMatch = {
  id: string;
  text: string;
  metadata?: Record<string, unknown>;
};

export interface VectorIndexStore {
  readonly providerId: string;

  upsertVectors(
    workspaceId: string,
    records: VectorIndexRecord[],
  ): Promise<void>;

  querySimilar(
    workspaceId: string,
    vector: number[],
    topK: number,
  ): Promise<VectorSimilarityMatch[]>;
}
