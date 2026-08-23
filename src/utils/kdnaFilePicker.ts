/**
 * Pure local .kdna file selection validation.
 *
 * macOS/Electron native extension filters in `vscode.window.showOpenDialog` can
 * disable the Open button for `.kdna` files when the system has no registered
 * UTType for the extension. The picker therefore allows any file, and the Host
 * validates the selection fail-closed here before entering any CLI flow.
 */

export interface KdnaFileValidationOk {
  ok: true;
}

export interface KdnaFileValidationError {
  ok: false;
  reason: string;
}

export type KdnaFileValidation = KdnaFileValidationOk | KdnaFileValidationError;

/**
 * Validate that a local file path satisfies the formal .kdna file contract.
 *
 * Checks (case-sensitive):
 * - the path has a non-empty basename;
 * - the basename ends with the lowercase `.kdna` extension;
 * - the extension is not the entire name (rejects a file literally named `.kdna`).
 *
 * This function performs no I/O. Existence and regular-file checks happen in
 * the picker helper, after the dialog returns.
 */
export function validateLocalKdnaPath(filePath: string): KdnaFileValidation {
  const basename = filePath.split('/').pop() || '';
  if (!basename) {
    return { ok: false, reason: 'No file selected.' };
  }
  if (!basename.endsWith('.kdna')) {
    return { ok: false, reason: 'File must have the .kdna extension.' };
  }
  const nameWithoutExtension = basename.slice(0, -'.kdna'.length);
  if (!nameWithoutExtension) {
    return { ok: false, reason: 'File name cannot be only the .kdna extension.' };
  }
  return { ok: true };
}

/**
 * Validate a URI returned from the file picker.
 *
 * Rejects remote/non-file schemes before checking the .kdna extension contract.
 */
export function validateLocalKdnaUri(scheme: string, path: string): KdnaFileValidation {
  if (scheme !== 'file') {
    return { ok: false, reason: 'Only local file:// URIs are allowed.' };
  }
  return validateLocalKdnaPath(path);
}
