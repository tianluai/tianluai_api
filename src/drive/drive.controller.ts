import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Post,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { AuthGuard } from '../auth/auth.guard';
import { ClerkUserId } from '../auth/clerk-user.decorator';
import { WorkspacesService } from '../workspaces/workspaces.service';
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
  ) {}

  /** Ensures the authenticated user is an active member of the workspace (organization). */
  private async ensureWorkspaceAccess(
    clerkId: string,
    workspaceId: string,
  ): Promise<void> {
    const workspace = await this.workspaces.getWorkspace(clerkId, workspaceId);
    if (!workspace) {
      throw new ForbiddenException('You do not have access to this workspace.');
    }
  }

  @Get('status')
  @UseGuards(AuthGuard)
  async status(
    @ClerkUserId() clerkId: string,
    @Query() query: DriveWorkspaceQueryDto,
  ) {
    await this.ensureWorkspaceAccess(clerkId, query.workspaceId);
    const driveConfigured = this.driveAuth.isConfigured();
    const conn = this.driveAuth.getConnection(clerkId, query.workspaceId);
    return {
      connected: !!conn,
      driveConfigured,
      selectedFolderIds: conn?.selectedFolderIds ?? [],
    };
  }

  @Get('folders')
  @UseGuards(AuthGuard)
  async listFolders(
    @ClerkUserId() clerkId: string,
    @Query() query: DriveFoldersQueryDto,
  ) {
    await this.ensureWorkspaceAccess(clerkId, query.workspaceId);
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
    await this.ensureWorkspaceAccess(clerkId, body.workspaceId);
    return this.driveAuth.saveSelectedFolders(
      clerkId,
      body.workspaceId,
      body.folderIds,
    );
  }

  @Post('auth')
  @UseGuards(AuthGuard)
  async auth(@ClerkUserId() clerkId: string, @Body() body: DriveAuthBodyDto) {
    await this.ensureWorkspaceAccess(clerkId, body.workspaceId);
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
