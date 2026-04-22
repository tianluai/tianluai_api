import mammoth from 'mammoth';
import pdfParse from 'pdf-parse';

/**
 * MIME types for files stored on Drive as binary blobs (not Google Docs).
 * These must not be read as UTF-8 strings — that produces garbage embeddings.
 */
export function isBinaryDocumentMimeType(mimeType: string): boolean {
  return (
    mimeType === 'application/pdf' ||
    mimeType ===
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
    mimeType === 'application/msword'
  );
}

/**
 * Extract plain text from uploaded Word / PDF bytes downloaded from Google Drive.
 */
export async function extractTextFromBinaryDocument(
  buffer: Buffer,
  mimeType: string,
): Promise<string> {
  if (
    mimeType ===
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
    mimeType === 'application/msword'
  ) {
    try {
      const result = await mammoth.extractRawText({ buffer });
      return result.value ?? '';
    } catch {
      return '';
    }
  }
  if (mimeType === 'application/pdf') {
    try {
      const data = await pdfParse(buffer);
      return typeof data.text === 'string' ? data.text : '';
    } catch {
      return '';
    }
  }
  return '';
}
