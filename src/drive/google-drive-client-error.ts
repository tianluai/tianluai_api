/**
 * User-facing string for googleapis Drive failures.
 * Passes through {@link Error.message} from Google’s client; only the common
 * “Drive API not enabled” case gets a fixed hint (the API message is rarely actionable).
 */
const DRIVE_API_NOT_ENABLED_HINT =
  'Google Drive API is not enabled for this project. Enable it in Google Cloud Console: APIs & Services → Enable APIs → search "Google Drive API" → Enable. If you just enabled it, wait a minute and try again.';

export function googleDriveClientErrorMessage(error: unknown): string {
  if (!(error instanceof Error)) {
    return typeof error === 'string' ? error : String(error);
  }

  const extended = error as Error & {
    code?: number;
    errors?: Array<{ reason?: string }>;
  };

  if (
    extended.code === 403 ||
    extended.errors?.[0]?.reason === 'accessNotConfigured'
  ) {
    return DRIVE_API_NOT_ENABLED_HINT;
  }

  return error.message;
}
