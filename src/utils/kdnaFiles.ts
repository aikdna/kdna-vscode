/**
 * KDNA expanded project-view discovery utilities.
 */

import * as vscode from 'vscode';
import { KDNA_ALL_FILES } from '../constants';
import { validateLocalKdnaUri } from './kdnaFilePicker';

/**
 * Pick a local .kdna asset file through the native file dialog.
 *
 * The dialog does NOT set an extension filter. macOS/Electron extension filters
 * disable the Open button for unrecognized extensions such as `.kdna`; the Host
 * validates the selection after the dialog returns. This keeps the native filter
 * as a UX helper only and never as a security boundary.
 *
 * Returns null when the user cancels or when the selected path fails any of:
 * - URI scheme must be `file`;
 * - basename must end with lowercase `.kdna`;
 * - basename must not be only `.kdna`;
 * - path must exist and be a regular file (not a directory).
 */
export async function pickLocalKdnaFile(options: {
  title: string;
  defaultUri?: vscode.Uri;
}): Promise<vscode.Uri | null> {
  const uris = await vscode.window.showOpenDialog({
    canSelectFiles: true,
    canSelectFolders: false,
    canSelectMany: false,
    defaultUri: options.defaultUri,
    title: options.title,
  });
  const uri = uris?.[0];
  if (!uri) return null;

  const validation = validateLocalKdnaUri(uri.scheme, uri.path);
  if (!validation.ok) {
    await vscode.window.showErrorMessage(`KDNA: ${validation.reason}`);
    return null;
  }

  let info;
  try {
    info = await vscode.workspace.fs.stat(uri);
  } catch {
    await vscode.window.showErrorMessage(
      `KDNA: File does not exist or cannot be read: ${uri.fsPath}`,
    );
    return null;
  }
  if (info.type !== vscode.FileType.File) {
    await vscode.window.showErrorMessage(
      `KDNA: Selected path is not a regular file: ${uri.fsPath}`,
    );
    return null;
  }
  return uri;
}

/**
 * Check if a directory is an expanded KDNA project view.
 */
export async function isKdnaDomainDir(uri: vscode.Uri): Promise<boolean> {
  try {
    const entries = await vscode.workspace.fs.readDirectory(uri);
    const names = entries.map((e) => e[0]);
    return names.includes('kdna.json') && names.some((n) => n.startsWith('KDNA_') && n.endsWith('.json'));
  } catch {
    return false;
  }
}

/**
 * Find the parent expanded KDNA project view for a given file URI.
 * Walks up the directory tree looking for a directory with kdna.json.
 */
export async function findDomainDir(fileUri: vscode.Uri): Promise<vscode.Uri | null> {
  let dir = vscode.Uri.joinPath(fileUri, '..');
  for (let i = 0; i < 5; i++) {
    if (await isKdnaDomainDir(dir)) {
      return dir;
    }
    const parent = vscode.Uri.joinPath(dir, '..');
    if (parent.path === dir.path) break; // reached root
    dir = parent;
  }
  return null;
}

/**
 * Discover all expanded KDNA project views in the current VS Code workspace.
 * Scan depth is configurable via kdna.scanDepth setting (default: 3).
 */
export async function findDomainDirs(): Promise<vscode.Uri[]> {
  const workspaceFolders = vscode.workspace.workspaceFolders;
  if (!workspaceFolders) return [];

  const config = vscode.workspace.getConfiguration('kdna');
  const maxDepth = config.get<number>('scanDepth', 3);

  const results: vscode.Uri[] = [];
  for (const folder of workspaceFolders) {
    await scanDir(folder.uri, 0, maxDepth, results);
  }
  return results;
}

async function scanDir(
  uri: vscode.Uri,
  depth: number,
  maxDepth: number,
  results: vscode.Uri[],
): Promise<void> {
  if (depth > maxDepth) return;

  try {
    if (await isKdnaDomainDir(uri)) {
      results.push(uri);
      return; // Don't scan subdirectories of a domain
    }

    const entries = await vscode.workspace.fs.readDirectory(uri);
    for (const [name, type] of entries) {
      if (type === vscode.FileType.Directory && !name.startsWith('.')) {
        await scanDir(vscode.Uri.joinPath(uri, name), depth + 1, maxDepth, results);
      }
    }
  } catch {
    // Permission denied or other FS error — skip
  }
}

/**
 * Check if a file URI is a KDNA JSON file (KDNA_*.json or kdna.json).
 */
export function isKdnaFile(uri: vscode.Uri): boolean {
  const filename = uri.path.split('/').pop() || '';
  return filename.startsWith('KDNA_') && filename.endsWith('.json') || filename === 'kdna.json';
}

/**
 * Check if a file URI is a packaged .kdna asset file.
 */
export function isKdnaPackageFile(uri: vscode.Uri): boolean {
  return uri.path.endsWith('.kdna');
}

/**
 * Read and parse a JSON file using vscode.workspace.fs.
 */
export async function readJsonFile<T = any>(uri: vscode.Uri): Promise<T | null> {
  try {
    const content = await vscode.workspace.fs.readFile(uri);
    return JSON.parse(new TextDecoder().decode(content)) as T;
  } catch {
    return null;
  }
}

/**
 * Read all KDNA JSON files from an expanded project view into a data map.
 */
export async function readDomainData(
  domainDir: vscode.Uri,
): Promise<Record<string, any>> {
  const dataMap: Record<string, any> = {};

  for (const filename of KDNA_ALL_FILES) {
    const fileUri = vscode.Uri.joinPath(domainDir, filename);
    const data = await readJsonFile(fileUri);
    if (data) {
      dataMap[filename] = data;
    }
  }

  // Also read manifest
  const manifestUri = vscode.Uri.joinPath(domainDir, 'kdna.json');
  const manifest = await readJsonFile(manifestUri);
  if (manifest) {
    dataMap['kdna.json'] = manifest;
  }

  return dataMap;
}

/**
 * Get domain display info from an expanded project view.
 */
export async function getDomainInfo(domainDir: vscode.Uri): Promise<{
  name: string;
  version: string;
  status: string;
  description: string;
} | null> {
  const manifest = await readJsonFile<any>(vscode.Uri.joinPath(domainDir, 'kdna.json'));
  const core = await readJsonFile<any>(vscode.Uri.joinPath(domainDir, 'KDNA_Core.json'));

  if (!manifest && !core) return null;

  return {
    name: manifest?.name || core?.meta?.domain || 'Unknown',
    version: manifest?.version || core?.meta?.version || '?',
    status: manifest?.status || 'experimental',
    description: manifest?.description || core?.meta?.purpose || '',
  };
}
