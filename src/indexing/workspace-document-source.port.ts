/**
 * Abstraction over “where workspace documents live” (Google Drive, Notion, S3, …).
 * Implementations are workspace-scoped; caller passes `clerkId` + `workspaceId`.
 */
export type WorkspaceDocumentListItem = {
  id: string;
  name: string;
  mimeType: string;
};

export interface WorkspaceDocumentSource {
  /** Stable id for logs and future factory wiring (`google_drive`, `notion`, …). */
  readonly providerId: string;

  listDocuments(
    clerkId: string,
    workspaceId: string,
  ): Promise<WorkspaceDocumentListItem[]>;

  exportDocumentText(
    clerkId: string,
    workspaceId: string,
    documentId: string,
    mimeType: string,
  ): Promise<string>;
}
