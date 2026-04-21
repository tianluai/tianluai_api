import { Injectable } from '@nestjs/common';
import { DriveAuthService } from './drive-auth.service';
import type {
  WorkspaceDocumentListItem,
  WorkspaceDocumentSource,
} from '../indexing/workspace-document-source.port';

@Injectable()
export class GoogleDriveWorkspaceDocumentSource implements WorkspaceDocumentSource {
  readonly providerId = 'google_drive';

  constructor(private readonly driveAuth: DriveAuthService) {}

  async listDocuments(
    clerkId: string,
    workspaceId: string,
  ): Promise<WorkspaceDocumentListItem[]> {
    return this.driveAuth.listFilesInSelectedFolders(clerkId, workspaceId);
  }

  async exportDocumentText(
    clerkId: string,
    workspaceId: string,
    documentId: string,
    mimeType: string,
  ): Promise<string> {
    return this.driveAuth.exportFileAsText(
      clerkId,
      workspaceId,
      documentId,
      mimeType,
    );
  }
}
