import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { DriveAuthService } from '../drive/drive-auth.service';
import { OpenAIService } from '../rag/openai.service';
import { PineconeService } from '../rag/pinecone.service';
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

@Processor('document-index', {
  lockDuration: DOCUMENT_INDEX_LOCK_DURATION_MS,
  lockRenewTime: 60_000,
  stalledInterval: 120_000,
  maxStalledCount: 5,
})
export class IndexProcessor extends WorkerHost {
  private readonly logger = new Logger(IndexProcessor.name);

  constructor(
    private readonly driveAuth: DriveAuthService,
    private readonly openai: OpenAIService,
    private readonly pinecone: PineconeService,
  ) {
    super();
  }

  async process(job: Job<DocumentIndexJobData>): Promise<unknown> {
    const { clerkId, workspaceId } = job.data;
    this.logger.log(
      `Index job ${job.id}: clerkId=${clerkId}, workspace=${workspaceId}`,
    );
    const files = await this.driveAuth.listFilesInSelectedFolders(
      clerkId,
      workspaceId,
    );
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
        const text = await this.driveAuth.exportFileAsText(
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

          await this.pinecone.upsert(workspaceId, vectors);
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
      `Index job ${job.id} complete: ${totalChunks} chunks indexed across ${files.length} files`,
    );
    return { indexed: totalChunks, files: files.length };
  }
}
