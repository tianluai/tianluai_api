import { Body, Controller, Get, Post, Query, Req, Res } from '@nestjs/common';
import type { Response } from 'express';
import type { Request } from 'express';
import { DriveAuthService } from './drive-auth.service';

@Controller('drive')
export class DriveController {
  constructor(private readonly driveAuth: DriveAuthService) {}

  private getUserId(req: Request, explicit?: string): string {
    const headerUserId = req.headers['x-user-id'];
    if (typeof explicit === 'string' && explicit.trim()) return explicit.trim();
    if (typeof headerUserId === 'string' && headerUserId.trim())
      return headerUserId.trim();
    return '';
  }

  private getWorkspaceId(req: Request, explicit?: string): string {
    const headerWs = req.headers['x-workspace-id'];
    if (typeof explicit === 'string' && explicit.trim()) return explicit.trim();
    if (typeof headerWs === 'string' && headerWs.trim()) return headerWs.trim();
    return '';
  }

  @Get('status')
  status(
    @Req() req: Request,
    @Query('userId') userId?: string,
    @Query('workspaceId') workspaceId?: string,
  ) {
    const resolvedUserId = this.getUserId(req, userId);
    const resolvedWorkspaceId = this.getWorkspaceId(req, workspaceId);
    const driveConfigured = this.driveAuth.isConfigured();
    const conn =
      resolvedUserId && resolvedWorkspaceId
        ? this.driveAuth.getConnection(resolvedUserId, resolvedWorkspaceId)
        : null;
    return {
      connected: !!conn,
      driveConfigured,
      selectedFolderIds: conn?.selectedFolderIds ?? [],
    };
  }

  @Get('folders')
  async listFolders(
    @Req() req: Request,
    @Query('userId') userId: string,
    @Query('workspaceId') workspaceId: string,
    @Query('parentId') parentId?: string,
  ) {
    const resolvedUserId = this.getUserId(req, userId);
    const resolvedWorkspaceId = this.getWorkspaceId(req, workspaceId);
    return this.driveAuth.listFolders(
      resolvedUserId,
      resolvedWorkspaceId,
      parentId ?? 'root',
    );
  }

  @Post('folders')
  saveFolders(
    @Req() req: Request,
    @Body()
    body: { userId?: string; workspaceId?: string; folderIds: string[] },
  ) {
    const resolvedUserId = this.getUserId(req, body?.userId);
    const resolvedWorkspaceId = this.getWorkspaceId(req, body?.workspaceId);
    const folderIds = Array.isArray(body?.folderIds)
      ? body.folderIds.filter((id): id is string => typeof id === 'string')
      : [];
    return this.driveAuth.saveSelectedFolders(
      resolvedUserId,
      resolvedWorkspaceId,
      folderIds,
    );
  }

  @Post('auth')
  auth(
    @Req() req: Request,
    @Body() body: { userId?: string; workspaceId?: string; returnUrl?: string },
  ) {
    const resolvedUserId = this.getUserId(req, body?.userId);
    const resolvedWorkspaceId = this.getWorkspaceId(req, body?.workspaceId);
    const returnUrl = body.returnUrl || '';
    if (!resolvedUserId || !resolvedWorkspaceId) {
      return { authUrl: null, error: 'userId and workspaceId are required.' };
    }
    const authUrl = this.driveAuth.getAuthUrl(
      returnUrl,
      resolvedUserId,
      resolvedWorkspaceId,
    );
    if (!authUrl)
      return {
        authUrl: null,
        error:
          'Google Drive is not configured. Ask your admin to set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET.',
      };
    return { authUrl };
  }

  @Get('callback')
  async callback(
    @Query('code') code: string,
    @Query('state') state: string,
    @Query('returnUrl') returnUrl: string | undefined,
    @Res() res: Response,
  ) {
    if (!code || !state)
      return res.redirect(302, '/documents?error=missing_params');
    const result = await this.driveAuth.handleCallback(code, state, returnUrl);
    if ('error' in result)
      return res.redirect(
        302,
        `/documents?error=${encodeURIComponent(result.error)}`,
      );
    return res.redirect(302, result.returnUrl || '/documents?connected=1');
  }
}
