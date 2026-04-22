import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

/** Extend when adding Notion, uploads, etc. */
export const WORKSPACE_SYNC_SOURCES = ['google_drive'] as const;
export type WorkspaceSyncSource = (typeof WORKSPACE_SYNC_SOURCES)[number];

@Schema({ collection: 'workspace_sync_states', timestamps: true })
export class WorkspaceSyncState extends Document {
  @Prop({ type: Types.ObjectId, ref: 'Organization', required: true })
  workspaceId: Types.ObjectId;

  @Prop({ type: String, required: true, enum: WORKSPACE_SYNC_SOURCES })
  source: WorkspaceSyncSource;

  @Prop({ type: Date, required: true })
  lastSyncedAt: Date;
}

export const WorkspaceSyncStateSchema =
  SchemaFactory.createForClass(WorkspaceSyncState);

WorkspaceSyncStateSchema.index({ workspaceId: 1, source: 1 }, { unique: true });
