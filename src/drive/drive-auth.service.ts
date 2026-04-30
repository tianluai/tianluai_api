import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import * as Sentry from '@sentry/node';
import { google } from 'googleapis';
import type { drive_v3 } from 'googleapis';
import { Model, Types } from 'mongoose';

import {
  extractTextFromBinaryDocument,
  isBinaryDocumentMimeType,
} from './extract-uploaded-file-text';
import { googleDriveClientErrorMessage } from './google-drive-client-error';
import { WorkspaceDriveConnection } from './schemas/workspace-drive-connection.schema';

const DRIVE_SCOPES = [
  'https://www.googleapis.com/auth/drive.readonly',
  'https://www.googleapis.com/auth/userinfo.email',
  'https://www.googleapis.com/auth/userinfo.profile',
];

const FOLDER_MIME = 'application/vnd.google-apps.folder';

/** Returned by {@link DriveAuthService.getAuthUrl} when OAuth is not configured. */
export const DRIVE_NOT_CONFIGURED_MESSAGE =
  'Google Drive is not configured. Ask your admin to set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET.';

export type DriveAuthUrlResult = { authUrl: string } | { error: string };

/** Shape encoded in the OAuth `state` query param (see `getAuthUrl`). */
type OAuthCallbackState = {
  userId: string;
  workspaceId: string;
  returnUrl?: string;
};

/** Stable codes for OAuth callback failures (use in redirect `errorCode` query param). */
export const DRIVE_OAUTH_CALLBACK_ERROR_CODES = [
  'oauth_missing_params',
  'oauth_state_invalid',
  'drive_not_configured',
  'oauth_no_refresh_token',
  'oauth_token_exchange_failed',
] as const;

export type DriveOAuthCallbackErrorCode =
  (typeof DRIVE_OAUTH_CALLBACK_ERROR_CODES)[number];

export type DriveOAuthCallbackResult =
  | { returnUrl: string }
  | { errorCode: DriveOAuthCallbackErrorCode };

type DriveRefreshCredentials = {
  accessToken: string;
  refreshToken: string;
  expiresAt: Date;
};

/** Return value of {@link DriveAuthService.getDriveForWorkspace}. */
type DriveForWorkspaceResult = {
  drive: drive_v3.Drive;
  connKey: string;
  conn: { selectedFolderIds: string[] };
  refreshCredentials?: DriveRefreshCredentials;
};

export type DriveIndexableFile = {
  id: string;
  name: string;
  mimeType: string;
};

function parseOAuthCallbackState(raw: unknown): OAuthCallbackState | null {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    return null;
  }
  const candidate = raw as Partial<OAuthCallbackState>;
  if (
    typeof candidate.userId !== 'string' ||
    typeof candidate.workspaceId !== 'string'
  ) {
    return null;
  }
  if (
    candidate.returnUrl !== undefined &&
    typeof candidate.returnUrl !== 'string'
  ) {
    return null;
  }
  return {
    userId: candidate.userId,
    workspaceId: candidate.workspaceId,
    returnUrl: candidate.returnUrl,
  };
}

/** Trim and remove a trailing slash from env base URLs (`API_PUBLIC_URL`, `FRONTEND_URL`). */
function normalizeBaseUrl(raw: string | undefined): string | undefined {
  if (raw === undefined || raw === null) return undefined;
  const trimmed = raw.trim();
  if (!trimmed) return undefined;
  return trimmed.replace(/\/+$/, '');
}

function missingPublicUrlVarsMessage(details: string): string {
  return `${details} Configure FRONTEND_URL, and either GOOGLE_REDIRECT_URI or API_PUBLIC_URL (no defaults).`;
}

@Injectable()
export class DriveAuthService {
  private readonly googleRedirectUri: string | undefined;
  private readonly apiPublicUrl: string | undefined;
  private readonly driveOAuthRedirectUri: string;
  private readonly googleClientId: string | undefined;
  private readonly googleClientSecret: string | undefined;
  private readonly frontendUrl: string;

  private readonly connections = new Map<
    string,
    {
      accessToken: string;
      refreshToken: string;
      expiresAt: Date;
      selectedFolderIds: string[];
    }
  >();

  constructor(
    config: ConfigService,
    @InjectModel(WorkspaceDriveConnection.name)
    private readonly driveConnectionModel: Model<WorkspaceDriveConnection>,
  ) {
    this.googleRedirectUri = normalizeBaseUrl(
      config.get<string>('GOOGLE_REDIRECT_URI'),
    );
    this.apiPublicUrl = normalizeBaseUrl(config.get<string>('API_PUBLIC_URL'));
    this.googleClientId = config.get<string>('GOOGLE_CLIENT_ID');
    this.googleClientSecret = config.get<string>('GOOGLE_CLIENT_SECRET');

    const frontendBase = normalizeBaseUrl(config.get<string>('FRONTEND_URL'));
    if (!frontendBase) {
      throw new Error(
        missingPublicUrlVarsMessage('FRONTEND_URL is missing or empty.'),
      );
    }
    this.frontendUrl = frontendBase;

    if (this.googleRedirectUri) {
      this.driveOAuthRedirectUri = this.googleRedirectUri;
    } else if (this.apiPublicUrl) {
      this.driveOAuthRedirectUri = `${this.apiPublicUrl}/drive/callback`;
    } else {
      throw new Error(
        'Drive OAuth redirect is not configured: GOOGLE_REDIRECT_URI and API_PUBLIC_URL are both missing or empty. Set GOOGLE_REDIRECT_URI (exact callback URL) or API_PUBLIC_URL (base URL for /drive/callback).',
      );
    }
  }

  private scopeKey(userId: string, workspaceId: string): string {
    return `${userId}::${workspaceId}`;
  }

  private getRedirectUri(): string {
    return this.driveOAuthRedirectUri;
  }

  private createOAuth2Client() {
    const clientId = this.googleClientId;
    const clientSecret = this.googleClientSecret;
    if (!clientId || !clientSecret) return null;
    return new google.auth.OAuth2(
      clientId,
      clientSecret,
      this.getRedirectUri(),
    );
  }

  isConfigured(): boolean {
    return !!(this.googleClientId && this.googleClientSecret);
  }

  /** Base URL for building post-OAuth redirects (e.g. `/documents?errorCode=…`). */
  getFrontendBaseUrl(): string {
    return this.frontendUrl.replace(/\/$/, '');
  }

  /**
   * Builds the Google OAuth URL or an error message (e.g. Drive not configured).
   * Callers must pass the authenticated user id (e.g. Clerk `sub`).
   */
  getAuthUrl(
    returnUrl: string,
    userId: string,
    workspaceId: string,
  ): DriveAuthUrlResult {
    const client = this.createOAuth2Client();
    if (!client) {
      return { error: DRIVE_NOT_CONFIGURED_MESSAGE };
    }
    if (!userId?.trim() || !workspaceId?.trim()) {
      return { error: 'userId and workspaceId are required.' };
    }
    const state = Buffer.from(
      JSON.stringify({ returnUrl, userId, workspaceId }),
    ).toString('base64url');
    const authUrl = client.generateAuthUrl({
      access_type: 'offline',
      prompt: 'consent',
      scope: DRIVE_SCOPES,
      state,
    });
    return { authUrl };
  }

  async handleCallback(
    code: string,
    state: string,
    returnUrlFromQuery?: string,
  ): Promise<DriveOAuthCallbackResult> {
    let payload: { returnUrl: string; userId: string; workspaceId: string };
    try {
      const parsedStateRaw: unknown = JSON.parse(
        Buffer.from(state, 'base64url').toString(),
      );
      const parsed = parseOAuthCallbackState(parsedStateRaw);
      if (parsed === null) {
        Sentry.captureMessage(
          'Drive OAuth callback: state payload failed validation',
          {
            level: 'warning',
            tags: { feature: 'drive', operation: 'handle_callback' },
            extra: { stateParamLength: state.length },
          },
        );
        return { errorCode: 'oauth_state_invalid' };
      }
      payload = {
        returnUrl: parsed.returnUrl ?? '',
        userId: parsed.userId,
        workspaceId: parsed.workspaceId,
      };
    } catch (cause: unknown) {
      Sentry.captureException(cause, {
        tags: { feature: 'drive', operation: 'handle_callback' },
        extra: { step: 'decode_or_parse_oauth_state' },
      });
      return { errorCode: 'oauth_state_invalid' };
    }
    if (!payload.userId || !payload.workspaceId) {
      return { errorCode: 'oauth_state_invalid' };
    }
    const candidateReturnUrl = (
      returnUrlFromQuery ||
      payload.returnUrl ||
      ''
    ).trim();
    const safeReturnUrl = candidateReturnUrl.startsWith(this.frontendUrl)
      ? candidateReturnUrl
      : `${this.frontendUrl}/documents?connected=1`;
    const client = this.createOAuth2Client();
    if (!client) return { errorCode: 'drive_not_configured' };
    try {
      const { tokens } = await client.getToken(code);
      if (!tokens.refresh_token) return { errorCode: 'oauth_no_refresh_token' };
      const expiry = tokens.expiry_date
        ? new Date(tokens.expiry_date)
        : new Date(Date.now() + 3600 * 1000);

      const connectionKey = this.scopeKey(payload.userId, payload.workspaceId);
      const existingFromDb = Types.ObjectId.isValid(payload.workspaceId)
        ? await this.driveConnectionModel
            .findOne({
              clerkUserId: payload.userId,
              workspaceId: new Types.ObjectId(payload.workspaceId),
            })
            .lean()
            .exec()
        : null;
      const selectedFolderIds =
        this.connections.get(connectionKey)?.selectedFolderIds ??
        existingFromDb?.selectedFolderIds ??
        [];
      this.connections.set(connectionKey, {
        accessToken: tokens.access_token ?? '',
        refreshToken: tokens.refresh_token,
        expiresAt: expiry,
        selectedFolderIds,
      });
      await this.persistConnectionToDb(payload.userId, payload.workspaceId);
      return { returnUrl: safeReturnUrl };
    } catch (cause: unknown) {
      Sentry.captureException(cause, {
        tags: { feature: 'drive', operation: 'handle_callback' },
        extra: { step: 'oauth_token_exchange' },
      });
      return { errorCode: 'oauth_token_exchange_failed' };
    }
  }

  getConnection(userId: string, workspaceId: string) {
    if (!userId || !workspaceId) return null;
    const connectionKey = this.scopeKey(userId, workspaceId);
    const conn = this.connections.get(connectionKey);
    if (!conn) return null;
    return {
      id: connectionKey,
      userId,
      workspaceId,
      accessToken: conn.accessToken,
      refreshToken: conn.refreshToken,
      expiresAt: conn.expiresAt,
      selectedFolderIds: conn.selectedFolderIds ?? [],
    };
  }

  private async persistConnectionToDb(
    userId: string,
    workspaceId: string,
  ): Promise<void> {
    if (!Types.ObjectId.isValid(workspaceId)) return;
    const key = this.scopeKey(userId, workspaceId);
    const conn = this.connections.get(key);
    if (!conn) return;
    try {
      await this.driveConnectionModel.findOneAndUpdate(
        { clerkUserId: userId, workspaceId: new Types.ObjectId(workspaceId) },
        {
          $set: {
            clerkUserId: userId,
            workspaceId: new Types.ObjectId(workspaceId),
            refreshToken: conn.refreshToken,
            accessToken: conn.accessToken,
            expiresAt: conn.expiresAt,
            selectedFolderIds: conn.selectedFolderIds ?? [],
          },
        },
        { upsert: true, new: true },
      );
    } catch (cause: unknown) {
      Sentry.captureException(cause, {
        tags: { feature: 'drive', operation: 'persist_connection' },
        extra: { workspaceId },
      });
    }
  }

  /**
   * Loads OAuth tokens from MongoDB into memory after API restart.
   */
  async hydrateConnectionFromDatabase(
    userId: string,
    workspaceId: string,
  ): Promise<void> {
    if (!userId || !workspaceId) return;
    const key = this.scopeKey(userId, workspaceId);
    if (this.connections.has(key)) return;
    if (!Types.ObjectId.isValid(workspaceId)) return;
    const doc = await this.driveConnectionModel
      .findOne({
        clerkUserId: userId,
        workspaceId: new Types.ObjectId(workspaceId),
      })
      .lean()
      .exec();
    if (!doc) return;
    this.connections.set(key, {
      accessToken: doc.accessToken,
      refreshToken: doc.refreshToken,
      expiresAt: doc.expiresAt,
      selectedFolderIds: doc.selectedFolderIds ?? [],
    });
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
      try {
        const { credentials } = await client.refreshAccessToken();
        return { client, credentials };
      } catch (cause: unknown) {
        Sentry.captureException(cause, {
          tags: { feature: 'drive', operation: 'refresh_access_token' },
        });
        return null;
      }
    }
    return { client, credentials: null };
  }

  /**
   * Returns true when tokens load and Google Drive API can be used (refresh succeeded if needed).
   */
  async isDriveSessionValid(
    userId: string,
    workspaceId: string,
  ): Promise<boolean> {
    return (await this.getDriveForWorkspace(userId, workspaceId)) !== null;
  }

  async getCachedUiSnapshotFromDatabase(
    clerkUserId: string,
    workspaceId: string,
  ): Promise<{
    cachedFolderSummaries: { id: string; name: string }[];
    cachedIndexedFileNames: string[];
    cachedTotalIndexedFiles: number;
  } | null> {
    if (!Types.ObjectId.isValid(workspaceId)) return null;
    const doc = (await this.driveConnectionModel
      .findOne({
        clerkUserId,
        workspaceId: new Types.ObjectId(workspaceId),
      })
      .select(
        'cachedFolderSummaries cachedIndexedFileNames cachedTotalIndexedFiles',
      )
      .lean()
      .exec()) as {
      cachedFolderSummaries?: { id: string; name: string }[];
      cachedIndexedFileNames?: string[];
      cachedTotalIndexedFiles?: number;
    } | null;
    if (!doc) return null;
    return {
      cachedFolderSummaries: Array.isArray(doc.cachedFolderSummaries)
        ? doc.cachedFolderSummaries
        : [],
      cachedIndexedFileNames: Array.isArray(doc.cachedIndexedFileNames)
        ? doc.cachedIndexedFileNames
        : [],
      cachedTotalIndexedFiles:
        typeof doc.cachedTotalIndexedFiles === 'number'
          ? doc.cachedTotalIndexedFiles
          : 0,
    };
  }

  async persistUiSnapshot(
    clerkUserId: string,
    workspaceId: string,
    payload: {
      cachedFolderSummaries: { id: string; name: string }[];
      cachedIndexedFileNames: string[];
      cachedTotalIndexedFiles: number;
    },
  ): Promise<void> {
    if (!Types.ObjectId.isValid(workspaceId)) return;
    try {
      await this.driveConnectionModel.updateOne(
        { clerkUserId, workspaceId: new Types.ObjectId(workspaceId) },
        { $set: payload },
      );
    } catch (cause: unknown) {
      Sentry.captureException(cause, {
        tags: { feature: 'drive', operation: 'persist_ui_snapshot' },
        extra: { workspaceId },
      });
    }
  }

  /**
   * Called after an index job so the documents UI can show folder/file names even when
   * the Google session later expires.
   */
  async persistSnapshotAfterIndexJob(
    clerkId: string,
    workspaceId: string,
    indexedFiles: { name: string }[],
  ): Promise<void> {
    if (!(await this.isDriveSessionValid(clerkId, workspaceId))) return;
    const folderSummaries = await this.getSelectedFolderSummaries(
      clerkId,
      workspaceId,
    );
    await this.persistUiSnapshot(clerkId, workspaceId, {
      cachedFolderSummaries: folderSummaries,
      cachedIndexedFileNames: indexedFiles.map((f) => f.name).slice(0, 50),
      cachedTotalIndexedFiles: indexedFiles.length,
    });
  }

  async getDriveForWorkspace(
    userId: string,
    workspaceId: string,
  ): Promise<DriveForWorkspaceResult | null> {
    await this.hydrateConnectionFromDatabase(userId, workspaceId);
    const conn = this.getConnection(userId, workspaceId);
    if (!conn) return null;
    const authClientResult = await this.getOAuth2ClientForConnection(conn);
    if (!authClientResult) return null;
    const drive = google.drive({
      version: 'v3',
      auth: authClientResult.client,
    });
    const connKey = this.scopeKey(userId, workspaceId);
    const driveForWorkspace: DriveForWorkspaceResult = {
      drive,
      connKey,
      conn: { selectedFolderIds: conn.selectedFolderIds ?? [] },
    };
    if (authClientResult.credentials) {
      driveForWorkspace.refreshCredentials = {
        accessToken: authClientResult.credentials.access_token!,
        refreshToken:
          authClientResult.credentials.refresh_token ?? conn.refreshToken,
        expiresAt: authClientResult.credentials.expiry_date
          ? new Date(authClientResult.credentials.expiry_date)
          : new Date(Date.now() + 3600 * 1000),
      };
    }
    return driveForWorkspace;
  }

  private async persistRefreshCredentialsIfPresent(
    driveForWorkspace: DriveForWorkspaceResult,
  ): Promise<void> {
    if (!driveForWorkspace.refreshCredentials) return;
    const existing = this.connections.get(driveForWorkspace.connKey);
    if (!existing) return;
    this.connections.set(driveForWorkspace.connKey, {
      ...existing,
      accessToken: driveForWorkspace.refreshCredentials.accessToken,
      refreshToken: driveForWorkspace.refreshCredentials.refreshToken,
      expiresAt: driveForWorkspace.refreshCredentials.expiresAt,
    });
    const sep = driveForWorkspace.connKey.lastIndexOf('::');
    if (sep <= 0) return;
    const userId = driveForWorkspace.connKey.slice(0, sep);
    const workspaceId = driveForWorkspace.connKey.slice(sep + 2);
    if (userId && workspaceId) {
      await this.persistConnectionToDb(userId, workspaceId);
    }
  }

  async listFolders(
    userId: string,
    workspaceId: string,
    parentId: string,
  ): Promise<{ folders: { id: string; name: string }[]; error?: string }> {
    const driveForWorkspace = await this.getDriveForWorkspace(
      userId,
      workspaceId,
    );
    if (!driveForWorkspace) {
      return { folders: [], error: 'Google Drive not connected.' };
    }
    const filesListQuery =
      parentId === 'root' || !parentId
        ? `mimeType = '${FOLDER_MIME}' and 'root' in parents and trashed = false`
        : `mimeType = '${FOLDER_MIME}' and '${parentId}' in parents and trashed = false`;
    try {
      const filesListResponse = await driveForWorkspace.drive.files.list({
        q: filesListQuery,
        pageSize: 100,
        fields: 'files(id, name)',
        orderBy: 'name',
      });
      await this.persistRefreshCredentialsIfPresent(driveForWorkspace);
      const folders = (filesListResponse.data.files ?? []).map((file) => ({
        id: file.id!,
        name: file.name ?? '(Unnamed)',
      }));
      return { folders };
    } catch (error: unknown) {
      return { folders: [], error: googleDriveClientErrorMessage(error) };
    }
  }

  async listFilesInSelectedFolders(
    userId: string,
    workspaceId: string,
  ): Promise<DriveIndexableFile[]> {
    const driveForWorkspace = await this.getDriveForWorkspace(
      userId,
      workspaceId,
    );
    if (!driveForWorkspace) return [];
    const selectedFolderIds = driveForWorkspace.conn.selectedFolderIds ?? [];
    if (selectedFolderIds.length === 0) return [];

    const indexedFilesById = new Map<string, DriveIndexableFile>();
    for (const selectedFolderId of selectedFolderIds) {
      const filesListResponse = await driveForWorkspace.drive.files.list({
        q: `'${selectedFolderId}' in parents and trashed = false and mimeType != '${FOLDER_MIME}'`,
        pageSize: 1000,
        fields: 'files(id, name, mimeType)',
      });
      const filesInFolder = (filesListResponse.data.files ?? []).map(
        (file) => ({
          id: file.id ?? '',
          name: file.name ?? '(Unnamed)',
          mimeType: file.mimeType ?? 'application/octet-stream',
        }),
      );
      for (const file of filesInFolder) {
        if (!file.id) continue;
        indexedFilesById.set(file.id, file);
      }
    }

    await this.persistRefreshCredentialsIfPresent(driveForWorkspace);
    return Array.from(indexedFilesById.values());
  }

  async exportFileAsText(
    userId: string,
    workspaceId: string,
    fileId: string,
    mimeType: string,
  ): Promise<string> {
    const driveForWorkspace = await this.getDriveForWorkspace(
      userId,
      workspaceId,
    );
    if (!driveForWorkspace) return '';

    const isGoogleNativeFile = mimeType.startsWith(
      'application/vnd.google-apps.',
    );

    try {
      const driveFilesResource = driveForWorkspace.drive.files;

      if (isGoogleNativeFile) {
        const response = await driveFilesResource.export(
          { fileId, mimeType: 'text/plain' },
          { responseType: 'text' },
        );
        await this.persistRefreshCredentialsIfPresent(driveForWorkspace);
        return typeof response.data === 'string' ? response.data : '';
      }

      if (isBinaryDocumentMimeType(mimeType)) {
        const response = await driveFilesResource.get(
          { fileId, alt: 'media' },
          { responseType: 'arraybuffer' },
        );
        await this.persistRefreshCredentialsIfPresent(driveForWorkspace);
        const raw = response.data as ArrayBuffer | Buffer | Uint8Array | null;
        if (raw == null) return '';
        const buffer = Buffer.isBuffer(raw)
          ? raw
          : raw instanceof ArrayBuffer
            ? Buffer.from(raw)
            : Buffer.from(raw);
        return await extractTextFromBinaryDocument(buffer, mimeType);
      }

      const response = await driveFilesResource.get(
        { fileId, alt: 'media' },
        { responseType: 'text' },
      );
      await this.persistRefreshCredentialsIfPresent(driveForWorkspace);
      return typeof response.data === 'string' ? response.data : '';
    } catch (error: unknown) {
      Sentry.captureException(error, {
        tags: { feature: 'drive', operation: 'export_file_as_text' },
        extra: { fileId, mimeType, workspaceId },
      });
      return '';
    }
  }

  /**
   * Resolves display names for the user’s selected folder ids (for status / UI).
   */
  async getSelectedFolderSummaries(
    userId: string,
    workspaceId: string,
  ): Promise<{ id: string; name: string }[]> {
    const driveForWorkspace = await this.getDriveForWorkspace(
      userId,
      workspaceId,
    );
    if (!driveForWorkspace) return [];
    const ids = driveForWorkspace.conn.selectedFolderIds ?? [];
    if (ids.length === 0) return [];

    const summaries = await Promise.all(
      ids.map(async (folderId) => {
        try {
          const fileResponse = await driveForWorkspace.drive.files.get({
            fileId: folderId,
            fields: 'id, name',
          });
          return {
            id: fileResponse.data.id ?? folderId,
            name: fileResponse.data.name ?? '(Folder)',
          };
        } catch {
          return { id: folderId, name: '(Unavailable)' };
        }
      }),
    );
    await this.persistRefreshCredentialsIfPresent(driveForWorkspace);
    return summaries;
  }

  /**
   * Sample of indexable file names under selected folders (for UX; capped).
   */
  async getIndexedSourcesPreview(
    userId: string,
    workspaceId: string,
    maxNames: number,
  ): Promise<{ fileNames: string[]; totalFiles: number }> {
    const files = await this.listFilesInSelectedFolders(userId, workspaceId);
    const totalFiles = files.length;
    const fileNames = files.slice(0, maxNames).map((file) => file.name);
    return { fileNames, totalFiles };
  }

  async saveSelectedFolders(
    userId: string,
    workspaceId: string,
    folderIds: string[],
  ): Promise<{ ok: boolean; error?: string }> {
    if (folderIds.length > 3) {
      return { ok: false, error: 'You may select at most 3 folders.' };
    }
    await this.hydrateConnectionFromDatabase(userId, workspaceId);
    const connection = this.getConnection(userId, workspaceId);
    if (!connection) return { ok: false, error: 'Google Drive not connected.' };
    const connectionKey = this.scopeKey(userId, workspaceId);
    const existing = this.connections.get(connectionKey);
    if (!existing) return { ok: false, error: 'Google Drive not connected.' };
    this.connections.set(connectionKey, {
      ...existing,
      selectedFolderIds: folderIds,
    });
    await this.persistConnectionToDb(userId, workspaceId);
    if (await this.isDriveSessionValid(userId, workspaceId)) {
      const folders = await this.getSelectedFolderSummaries(
        userId,
        workspaceId,
      );
      const preview = await this.getIndexedSourcesPreview(
        userId,
        workspaceId,
        50,
      );
      await this.persistUiSnapshot(userId, workspaceId, {
        cachedFolderSummaries: folders,
        cachedIndexedFileNames: preview.fileNames,
        cachedTotalIndexedFiles: preview.totalFiles,
      });
    }
    return { ok: true };
  }
}
