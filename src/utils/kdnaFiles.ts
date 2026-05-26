/**
 * KDNA file discovery and domain detection utilities.
 */

import * as vscode from 'vscode';
import { KDNA_REQUIRED_FILES, KDNA_ALL_FILES } from '../constants';

/**
 * Check if a directory is a KDNA domain (contains kdna.json + at least one KDNA_*.json).
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
 * Find the parent KDNA domain directory for a given file URI.
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
 * Discover all KDNA domain directories in the workspace.
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
 * Check if a file URI is a .kdna dev package file.
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
 * Read all KDNA JSON files from a domain directory into a data map.
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
 * Get domain display info from a domain directory.
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
