import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

/**
 * Persists Google OAuth tokens + folder selection per Clerk user and workspace.
 * Without this, connections live only in memory and disappear on API restart.
 */
@Schema({ collection: 'workspace_drive_connections', timestamps: true })
export class WorkspaceDriveConnection extends Document {
  @Prop({ required: true, index: true })
  clerkUserId: string;

  @Prop({
    type: Types.ObjectId,
    ref: 'Organization',
    required: true,
    index: true,
  })
  workspaceId: Types.ObjectId;

  @Prop({ required: true })
  refreshToken: string;

  @Prop({ default: '' })
  accessToken: string;

  @Prop({ required: true })
  expiresAt: Date;

  @Prop({ type: [String], default: [] })
  selectedFolderIds: string[];

  /** Last known folder labels for the documents UI when Google API is unavailable. */
  @Prop({
    type: [{ id: String, name: String }],
    default: [],
  })
  cachedFolderSummaries: { id: string; name: string }[];

  /** Sample of file names last indexed (capped); total may exceed list length. */
  @Prop({ type: [String], default: [] })
  cachedIndexedFileNames: string[];

  @Prop({ type: Number, default: 0 })
  cachedTotalIndexedFiles: number;
}

export const WorkspaceDriveConnectionSchema = SchemaFactory.createForClass(
  WorkspaceDriveConnection,
);

WorkspaceDriveConnectionSchema.index(
  { clerkUserId: 1, workspaceId: 1 },
  { unique: true },
);
