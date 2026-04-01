import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { google } from 'googleapis';
import type { drive_v3 } from 'googleapis';

const DRIVE_SCOPES = [
  'https://www.googleapis.com/auth/drive.readonly',
  'https://www.googleapis.com/auth/userinfo.email',
  'https://www.googleapis.com/auth/userinfo.profile',
];

const FOLDER_MIME = 'application/vnd.google-apps.folder';

@Injectable()
export class DriveAuthService {
  constructor(private readonly config: ConfigService) {}

  private readonly connections = new Map<
    string,
    {
      accessToken: string;
      refreshToken: string;
      expiresAt: Date;
      selectedFolderIds: string[];
    }
  >();

  private scopeKey(userId: string, workspaceId: string): string {
    return `${userId}::${workspaceId}`;
  }

  private getRedirectUri(): string {
    const uri = this.config.get<string>('GOOGLE_REDIRECT_URI');
    if (uri) return uri;
    const base =
      this.config.get<string>('API_PUBLIC_URL') ||
      `http://localhost:${this.config.get('PORT', 4000)}`;
    return `${base}/drive/callback`;
  }

  private createOAuth2Client() {
    const clientId = this.config.get<string>('GOOGLE_CLIENT_ID');
    const clientSecret = this.config.get<string>('GOOGLE_CLIENT_SECRET');
    if (!clientId || !clientSecret) return null;
    return new google.auth.OAuth2(
      clientId,
      clientSecret,
      this.getRedirectUri(),
    );
  }

  isConfigured(): boolean {
    return !!(
      this.config.get('GOOGLE_CLIENT_ID') &&
      this.config.get('GOOGLE_CLIENT_SECRET')
    );
  }

  getAuthUrl(
    returnUrl: string,
    userId: string,
    workspaceId: string,
  ): string | null {
    const client = this.createOAuth2Client();
    if (!client) return null;
    if (!userId || !workspaceId) return null;
    const state = Buffer.from(
      JSON.stringify({ returnUrl, userId, workspaceId }),
    ).toString('base64url');
    return client.generateAuthUrl({
      access_type: 'offline',
      prompt: 'consent',
      scope: DRIVE_SCOPES,
      state,
    });
  }

  async handleCallback(
    code: string,
    state: string,
    returnUrlFromQuery?: string,
  ): Promise<{ returnUrl: string } | { error: string }> {
    let payload: { returnUrl: string; userId: string; workspaceId: string };
    try {
      const raw: unknown = JSON.parse(
        Buffer.from(state, 'base64url').toString(),
      );
      if (raw === null || typeof raw !== 'object') {
        return { error: 'Invalid state' };
      }
      const o = raw as Record<string, unknown>;
      if (
        typeof o.userId !== 'string' ||
        typeof o.workspaceId !== 'string' ||
        (o.returnUrl !== undefined && typeof o.returnUrl !== 'string')
      ) {
        return { error: 'Invalid state' };
      }
      payload = {
        returnUrl: typeof o.returnUrl === 'string' ? o.returnUrl : '',
        userId: o.userId,
        workspaceId: o.workspaceId,
      };
    } catch {
      return { error: 'Invalid state' };
    }
    if (!payload.userId || !payload.workspaceId) {
      return { error: 'Invalid state: missing user or workspace' };
    }
    const frontendUrl =
      this.config.get<string>('FRONTEND_URL') || 'http://localhost:3000';
    const candidateReturnUrl = (
      returnUrlFromQuery ||
      payload.returnUrl ||
      ''
    ).trim();
    const safeReturnUrl = candidateReturnUrl.startsWith(frontendUrl)
      ? candidateReturnUrl
      : `${frontendUrl}/documents?connected=1`;
    const client = this.createOAuth2Client();
    if (!client) return { error: 'Google Drive not configured' };
    const { tokens } = await client.getToken(code);
    if (!tokens.refresh_token)
      return { error: 'No refresh token; try again and grant all permissions' };
    const expiry = tokens.expiry_date
      ? new Date(tokens.expiry_date)
      : new Date(Date.now() + 3600 * 1000);

    const key = this.scopeKey(payload.userId, payload.workspaceId);
    this.connections.set(key, {
      accessToken: tokens.access_token ?? '',
      refreshToken: tokens.refresh_token,
      expiresAt: expiry,
      selectedFolderIds: this.connections.get(key)?.selectedFolderIds ?? [],
    });
    return { returnUrl: safeReturnUrl };
  }

  getConnection(userId: string, workspaceId: string) {
    if (!userId || !workspaceId) return null;
    const key = this.scopeKey(userId, workspaceId);
    const conn = this.connections.get(key);
    if (!conn) return null;
    return {
      id: key,
      userId,
      workspaceId,
      accessToken: conn.accessToken,
      refreshToken: conn.refreshToken,
      expiresAt: conn.expiresAt,
      selectedFolderIds: conn.selectedFolderIds ?? [],
    };
  }

  private async getOAuth2ClientForConnection(conn: {
    accessToken: string;
    refreshToken: string;
    expiresAt: Date;
  }) {
    const client = this.createOAuth2Client();
    if (!client) return null;
    client.setCredentials({
      access_token: conn.accessToken,
      refresh_token: conn.refreshToken,
      expiry_date: conn.expiresAt.getTime(),
    });
    if (conn.expiresAt.getTime() <= Date.now() + 5 * 60 * 1000) {
      const { credentials } = await client.refreshAccessToken();
      return { client, credentials };
    }
    return { client, credentials: null };
  }

  async getDriveForWorkspace(
    userId: string,
    workspaceId: string,
  ): Promise<{
    drive: drive_v3.Drive;
    connKey: string;
    conn: { selectedFolderIds: string[] };
    refreshCredentials?: {
      accessToken: string;
      refreshToken: string;
      expiresAt: Date;
    };
  } | null> {
    const conn = this.getConnection(userId, workspaceId);
    if (!conn) return null;
    const result = await this.getOAuth2ClientForConnection(conn);
    if (!result) return null;
    const drive = google.drive({ version: 'v3', auth: result.client });
    const connKey = this.scopeKey(userId, workspaceId);
    const out: {
      drive: drive_v3.Drive;
      connKey: string;
      conn: { selectedFolderIds: string[] };
      refreshCredentials?: {
        accessToken: string;
        refreshToken: string;
        expiresAt: Date;
      };
    } = {
      drive,
      connKey,
      conn: { selectedFolderIds: conn.selectedFolderIds ?? [] },
    };
    if (result.credentials) {
      out.refreshCredentials = {
        accessToken: result.credentials.access_token!,
        refreshToken: result.credentials.refresh_token ?? conn.refreshToken,
        expiresAt: result.credentials.expiry_date
          ? new Date(result.credentials.expiry_date)
          : new Date(Date.now() + 3600 * 1000),
      };
    }
    return out;
  }

  async listFolders(
    userId: string,
    workspaceId: string,
    parentId: string,
  ): Promise<{ folders: { id: string; name: string }[]; error?: string }> {
    const g = await this.getDriveForWorkspace(userId, workspaceId);
    if (!g) return { folders: [], error: 'Google Drive not connected.' };
    const q =
      parentId === 'root' || !parentId
        ? `mimeType = '${FOLDER_MIME}' and 'root' in parents and trashed = false`
        : `mimeType = '${FOLDER_MIME}' and '${parentId}' in parents and trashed = false`;
    try {
      const res = await g.drive.files.list({
        q,
        pageSize: 100,
        fields: 'files(id, name)',
        orderBy: 'name',
      });
      if (g.refreshCredentials) {
        const existing = this.connections.get(g.connKey);
        if (existing) {
          this.connections.set(g.connKey, {
            ...existing,
            accessToken: g.refreshCredentials.accessToken,
            refreshToken: g.refreshCredentials.refreshToken,
            expiresAt: g.refreshCredentials.expiresAt,
          });
        }
      }
      const folders = (res.data.files ?? []).map((f) => ({
        id: f.id!,
        name: f.name ?? '(Unnamed)',
      }));
      return { folders };
    } catch (err: unknown) {
      const code = (err as { code?: number })?.code;
      const reason = (err as { errors?: Array<{ reason?: string }> })
        ?.errors?.[0]?.reason;
      if (code === 403 || reason === 'accessNotConfigured') {
        return {
          folders: [],
          error:
            'Google Drive API is not enabled for this project. Enable it in Google Cloud Console: APIs & Services → Enable APIs → search "Google Drive API" → Enable. If you just enabled it, wait a minute and try again.',
        };
      }
      const message = (err as { message?: string })?.message;
      return {
        folders: [],
        error: message
          ? String(message)
          : 'Failed to list folders from Google Drive.',
      };
    }
  }

  saveSelectedFolders(
    userId: string,
    workspaceId: string,
    folderIds: string[],
  ): { ok: boolean; error?: string } {
    if (folderIds.length > 3) {
      return { ok: false, error: 'You may select at most 3 folders.' };
    }
    const conn = this.getConnection(userId, workspaceId);
    if (!conn) return { ok: false, error: 'Google Drive not connected.' };
    const key = this.scopeKey(userId, workspaceId);
    const existing = this.connections.get(key);
    if (!existing) return { ok: false, error: 'Google Drive not connected.' };
    this.connections.set(key, { ...existing, selectedFolderIds: folderIds });
    return { ok: true };
  }
}
