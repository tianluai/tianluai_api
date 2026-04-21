/**
 * Nest injection tokens for pluggable indexing / RAG backends.
 *
 * Bind concrete adapters in feature modules (e.g. Drive + Pinecone today;
 * Notion + pgvector tomorrow) with `useClass` / `useExisting` / `useFactory`.
 */
export const WORKSPACE_DOCUMENT_SOURCE = Symbol('WORKSPACE_DOCUMENT_SOURCE');

export const VECTOR_INDEX_STORE = Symbol('VECTOR_INDEX_STORE');
