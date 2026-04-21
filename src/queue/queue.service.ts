import { InjectQueue } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import type { JobState, Queue } from 'bullmq';
import type { DocumentIndexJobData } from './queue.types';

/** BullMQ only — no workspace/drive/rag coupling (avoids import cycles). */
@Injectable()
export class QueueService {
  constructor(
    @InjectQueue('document-index')
    private readonly documentIndexQueue: Queue<DocumentIndexJobData>,
  ) {}

  async enqueueDocumentIndexJob(jobData: DocumentIndexJobData) {
    return this.documentIndexQueue.add('index-workspace-documents', jobData, {
      removeOnComplete: 100,
      removeOnFail: 200,
    });
  }

  async getDocumentIndexJob(jobId: string) {
    const queuedJob = await this.documentIndexQueue.getJob(jobId);
    if (!queuedJob) return null;

    const jobState = await queuedJob.getState();
    return {
      id: String(queuedJob.id),
      state: jobState,
      progress: Number(queuedJob.progress ?? 0),
      data: queuedJob.data,
      returnValue: queuedJob.returnvalue as unknown,
      failedReason: queuedJob.failedReason ?? null,
    };
  }

  async getDocumentIndexJobState(
    jobId: string,
  ): Promise<JobState | 'unknown' | null> {
    const queuedJob = await this.documentIndexQueue.getJob(jobId);
    if (!queuedJob) return null;
    return queuedJob.getState();
  }
}
