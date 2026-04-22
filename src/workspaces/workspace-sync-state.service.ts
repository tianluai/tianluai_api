import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  WorkspaceSyncState,
  type WorkspaceSyncSource,
} from './schemas/workspace-sync-state.schema';

@Injectable()
export class WorkspaceSyncStateService {
  constructor(
    @InjectModel(WorkspaceSyncState.name)
    private readonly syncStateModel: Model<WorkspaceSyncState>,
  ) {}

  /**
   * Call when a document-index job finishes successfully (any outcome, including 0 files).
   */
  async recordSuccessfulSync(
    workspaceId: string,
    source: WorkspaceSyncSource,
  ): Promise<void> {
    if (!Types.ObjectId.isValid(workspaceId)) return;
    const workspaceObjectId = new Types.ObjectId(workspaceId);
    await this.syncStateModel.findOneAndUpdate(
      { workspaceId: workspaceObjectId, source },
      { $set: { lastSyncedAt: new Date() } },
      { upsert: true, new: true },
    );
  }

  async getLastSyncedAt(
    workspaceId: string,
    source: WorkspaceSyncSource,
  ): Promise<Date | null> {
    if (!Types.ObjectId.isValid(workspaceId)) return null;
    const document = await this.syncStateModel
      .findOne({
        workspaceId: new Types.ObjectId(workspaceId),
        source,
      })
      .lean()
      .exec();
    return document?.lastSyncedAt ?? null;
  }
}
