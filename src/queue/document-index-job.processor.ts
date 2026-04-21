import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject, Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import {
  VECTOR_INDEX_STORE,
  WORKSPACE_DOCUMENT_SOURCE,
} from '../indexing/indexing.tokens';
import type { VectorIndexStore } from '../indexing/vector-index-store.port';
import type { WorkspaceDocumentSource } from '../indexing/workspace-document-source.port';
import { OpenAIService } from '../rag/openai.service';
import type { DocumentIndexJobData } from './queue.types';

const CHUNK_SIZE = 800;
const CHUNK_OVERLAP = 100;
const EMBED_BATCH = 20;

const DOCUMENT_INDEX_LOCK_DURATION_MS = 60 * 60 * 1000;
function yieldEventLoop(): Promise<void> {
  return new Promise<void>((resolve) => {
    setImmediate(resolve);
  });
}

async function extendDocumentIndexLock(
  job: Job<DocumentIndexJobData>,
): Promise<void> {
  const lockToken = job.token;
  if (!lockToken) return;
  await job.extendLock(lockToken, DOCUMENT_INDEX_LOCK_DURATION_MS);
}

function stripInvalidUnicodeSurrogates(inputText: string): string {
  return inputText.replace(
    /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g,
    '',
  );
}

function chunkText(
  text: string,
  chunkSize = CHUNK_SIZE,
  overlap = CHUNK_OVERLAP,
): string[] {
  const cleaned = stripInvalidUnicodeSurrogates(
    text.replace(/\r\n/g, '\n'),
  ).trim();
  if (!cleaned) return [];
  if (cleaned.length <= chunkSize) return [cleaned];
  const chunks: string[] = [];
  let start = 0;
  while (start < cleaned.length) {
    chunks.push(cleaned.slice(start, start + chunkSize));
    start += chunkSize - overlap;
  }
  return chunks;
}

/**
 * BullMQ worker for the `document-index` queue: lists documents from a
 * {@link WorkspaceDocumentSource}, chunks text, embeds with OpenAI, and upserts
 * vectors into a {@link VectorIndexStore} for RAG. Source and store are bound via
 * Nest tokens so implementations can change (e.g. Notion + pgvector).
 */
@Processor('document-index', {
  lockDuration: DOCUMENT_INDEX_LOCK_DURATION_MS,
  lockRenewTime: 60_000,
  stalledInterval: 120_000,
  maxStalledCount: 5,
})
export class DocumentIndexJobProcessor extends WorkerHost {
  private readonly logger = new Logger(DocumentIndexJobProcessor.name);

  constructor(
    @Inject(WORKSPACE_DOCUMENT_SOURCE)
    private readonly documentSource: WorkspaceDocumentSource,
    private readonly openai: OpenAIService,
    @Inject(VECTOR_INDEX_STORE)
    private readonly vectorIndex: VectorIndexStore,
  ) {
    super();
  }

  async process(job: Job<DocumentIndexJobData>): Promise<unknown> {
    const { clerkId, workspaceId } = job.data;
    this.logger.log(
      `Document index job ${job.id}: clerkId=${clerkId}, workspace=${workspaceId}, documentSource=${this.documentSource.providerId}, vectorIndex=${this.vectorIndex.providerId}`,
    );
    const files = await this.documentSource.listDocuments(clerkId, workspaceId);
    this.logger.log(`Found ${files.length} files to index`);

    if (files.length === 0) {
      this.logger.warn(
        'No files found in selected folders. User may not have selected folders or folders are empty.',
      );
      return { indexed: 0, files: 0 };
    }

    let totalChunks = 0;

    const supportedTypes = [
      'application/vnd.google-apps.document',
      'application/vnd.google-apps.spreadsheet',
      'application/vnd.google-apps.presentation',
      'application/pdf',
      'text/plain',
      'text/csv',
      'text/markdown',
      'application/json',
    ];
    for (let fileIndex = 0; fileIndex < files.length; fileIndex += 1) {
      const file = files[fileIndex];
      try {
        await extendDocumentIndexLock(job);
        await yieldEventLoop();

        const supported = supportedTypes.some(
          (supportedMimeType) =>
            file.mimeType === supportedMimeType ||
            file.mimeType.startsWith('text/'),
        );
        this.logger.log(
          `Processing file: ${file.name} (${file.mimeType})${supported ? '' : ' [unsupported type]'}`,
        );
        const text = await this.documentSource.exportDocumentText(
          clerkId,
          workspaceId,
          file.id,
          file.mimeType,
        );
        if (!text.trim()) {
          this.logger.log(
            `  Skipped (no text extracted${supported ? ' - file may be empty or export failed' : ' - type not supported'})`,
          );
          continue;
        }

        const chunks = chunkText(text);
        this.logger.log(`  ${chunks.length} chunks`);

        for (
          let batchStartIndex = 0;
          batchStartIndex < chunks.length;
          batchStartIndex += EMBED_BATCH
        ) {
          const batch = chunks.slice(
            batchStartIndex,
            batchStartIndex + EMBED_BATCH,
          );
          const embeddings = await this.openai.embed(batch);
          if (embeddings.length === 0) continue;

          const vectors = embeddings.map((values, embeddingOffset) => ({
            id: `${file.id}__chunk_${batchStartIndex + embeddingOffset}`,
            values,
            metadata: {
              text: stripInvalidUnicodeSurrogates(batch[embeddingOffset] ?? ''),
              fileName: file.name,
              fileId: file.id,
              chunkIndex: batchStartIndex + embeddingOffset,
            },
          }));

          await this.vectorIndex.upsertVectors(workspaceId, vectors);
          totalChunks += vectors.length;
          await job.updateProgress({
            filesTotal: files.length,
            fileIndex,
            fileName: file.name,
            chunksIndexed: totalChunks,
          });
          await extendDocumentIndexLock(job);
          await yieldEventLoop();
        }
      } catch (error: unknown) {
        this.logger.error(
          `Failed to index file ${file.name} (${file.id}): ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }

    this.logger.log(
      `Document index job ${job.id} complete: ${totalChunks} chunks indexed across ${files.length} files`,
    );
    return { indexed: totalChunks, files: files.length };
  }
}
