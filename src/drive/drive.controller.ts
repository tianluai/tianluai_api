import {
  Body,
  Controller,
  Get,
  Post,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { AuthGuard } from '../auth/auth.guard';
import { ClerkUserId } from '../auth/clerk-user.decorator';
import { PineconeService } from '../rag/pinecone.service';
import { WorkspacesService } from '../workspaces/workspaces.service';
import { WorkspaceSyncStateService } from '../workspaces/workspace-sync-state.service';
import { DriveAuthService } from './drive-auth.service';
import { DriveAuthBodyDto } from './dto/drive-auth-body.dto';
import { DriveSaveFoldersBodyDto } from './dto/drive-save-folders-body.dto';
import {
  DriveFoldersQueryDto,
  DriveWorkspaceQueryDto,
} from './dto/drive-workspace-query.dto';

@Controller('drive')
export class DriveController {
  constructor(
    private readonly driveAuth: DriveAuthService,
    private readonly workspaces: WorkspacesService,
    private readonly workspaceSyncState: WorkspaceSyncStateService,
    private readonly pinecone: PineconeService,
  ) {}

  @Get('status')
  @UseGuards(AuthGuard)
  async status(
    @ClerkUserId() clerkId: string,
    @Query() query: DriveWorkspaceQueryDto,
  ) {
    await this.workspaces.assertWorkspaceMembership(clerkId, query.workspaceId);
    await this.driveAuth.hydrateConnectionFromDatabase(
      clerkId,
      query.workspaceId,
    );
    const driveConfigured = this.driveAuth.isConfigured();
    const conn = this.driveAuth.getConnection(clerkId, query.workspaceId);
    const cached = await this.driveAuth.getCachedUiSnapshotFromDatabase(
      clerkId,
      query.workspaceId,
    );
    const driveLive =
      conn != null &&
      (await this.driveAuth.isDriveSessionValid(clerkId, query.workspaceId));

    const lastGoogleDriveSyncAt = await this.workspaceSyncState.getLastSyncedAt(
      query.workspaceId,
      'google_drive',
    );
    const indexedVectorCount = await this.pinecone.getNamespaceRecordCount(
      query.workspaceId,
    );

    const selectedFolderIds = conn?.selectedFolderIds ?? [];
    const lastSyncedIso = lastGoogleDriveSyncAt?.toISOString() ?? null;

    if (driveLive) {
      const selectedFolders = await this.driveAuth.getSelectedFolderSummaries(
        clerkId,
        query.workspaceId,
      );
      const indexedSources =
        selectedFolders.length > 0
          ? await this.driveAuth.getIndexedSourcesPreview(
              clerkId,
              query.workspaceId,
              50,
            )
          : { fileNames: [] as string[], totalFiles: 0 };

      return {
        connected: true,
        driveSessionExpired: false,
        driveConfigured,
        selectedFolderIds,
        selectedFolders,
        indexedSources,
        lastGoogleDriveSyncAt: lastSyncedIso,
        indexedVectorCount,
      };
    }

    const selectedFoldersFallback =
      cached != null && cached.cachedFolderSummaries.length > 0
        ? cached.cachedFolderSummaries
        : selectedFolderIds.map((id) => ({ id, name: '(Folder)' }));

    const indexedSourcesFallback =
      cached != null &&
      (cached.cachedTotalIndexedFiles > 0 ||
        cached.cachedIndexedFileNames.length > 0)
        ? {
            fileNames: cached.cachedIndexedFileNames,
            totalFiles: cached.cachedTotalIndexedFiles,
          }
        : null;

    const driveSessionExpired = conn != null && !driveLive;

    return {
      connected: false,
      driveSessionExpired,
      driveConfigured,
      selectedFolderIds,
      selectedFolders: selectedFoldersFallback,
      indexedSources: indexedSourcesFallback,
      lastGoogleDriveSyncAt: lastSyncedIso,
      indexedVectorCount,
    };
  }

  @Get('folders')
  @UseGuards(AuthGuard)
  async listFolders(
    @ClerkUserId() clerkId: string,
    @Query() query: DriveFoldersQueryDto,
  ) {
    await this.workspaces.assertWorkspaceMembership(clerkId, query.workspaceId);
    return this.driveAuth.listFolders(
      clerkId,
      query.workspaceId,
      query.parentId,
    );
  }

  @Post('folders')
  @UseGuards(AuthGuard)
  async saveFolders(
    @ClerkUserId() clerkId: string,
    @Body() body: DriveSaveFoldersBodyDto,
  ) {
    await this.workspaces.assertWorkspaceMembership(clerkId, body.workspaceId);
    return await this.driveAuth.saveSelectedFolders(
      clerkId,
      body.workspaceId,
      body.folderIds,
    );
  }

  @Post('auth')
  @UseGuards(AuthGuard)
  async auth(@ClerkUserId() clerkId: string, @Body() body: DriveAuthBodyDto) {
    await this.workspaces.assertWorkspaceMembership(clerkId, body.workspaceId);
    const result = this.driveAuth.getAuthUrl(
      body.returnUrl,
      clerkId,
      body.workspaceId,
    );
    if ('error' in result) {
      return { authUrl: null, error: result.error };
    }
    return { authUrl: result.authUrl };
  }

  /** Google OAuth redirect — unauthenticated (browser follows redirect from Google). */
  @Get('callback')
  async callback(
    @Query('code') code: string,
    @Query('state') state: string,
    @Query('returnUrl') returnUrl: string | undefined,
    @Res() res: Response,
  ) {
    const base = this.driveAuth.getFrontendBaseUrl();
    if (!code || !state) {
      return res.redirect(
        302,
        `${base}/documents?errorCode=oauth_missing_params`,
      );
    }
    const result = await this.driveAuth.handleCallback(code, state, returnUrl);
    if ('errorCode' in result) {
      return res.redirect(
        302,
        `${base}/documents?errorCode=${encodeURIComponent(result.errorCode)}`,
      );
    }
    return res.redirect(
      302,
      result.returnUrl || `${base}/documents?connected=1`,
    );
  }
}
