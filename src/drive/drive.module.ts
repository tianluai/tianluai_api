import { Module } from '@nestjs/common';
import { WorkspacesModule } from '../workspaces/workspaces.module';
import { WORKSPACE_DOCUMENT_SOURCE } from '../indexing/indexing.tokens';
import { DriveAuthService } from './drive-auth.service';
import { DriveController } from './drive.controller';
import { GoogleDriveWorkspaceDocumentSource } from './google-drive-workspace-document-source.service';

@Module({
  imports: [WorkspacesModule],
  controllers: [DriveController],
  providers: [
    DriveAuthService,
    GoogleDriveWorkspaceDocumentSource,
    {
      provide: WORKSPACE_DOCUMENT_SOURCE,
      useExisting: GoogleDriveWorkspaceDocumentSource,
    },
  ],
  exports: [DriveAuthService, WORKSPACE_DOCUMENT_SOURCE],
})
export class DriveModule {}
