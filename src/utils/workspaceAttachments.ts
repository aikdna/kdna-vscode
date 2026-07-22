import { execFile } from 'node:child_process';
import { lstat, realpath, stat } from 'node:fs/promises';
import * as path from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export const WORKSPACE_CLI_VERSION = '0.36.0';
const MAX_OUTPUT_BYTES = 16 * 1024 * 1024;
const MAX_ATTACHMENTS = 64;
const ATTACHMENT_ID = /^att_[0-9a-f]{24}$/u;
const DIGEST = /^sha256:[0-9a-f]{64}$/u;

export interface WorkspaceAssetReference {
  id: string;
  version: string;
  digest: string;
  snapshot: string;
}

export interface WorkspaceAttachment {
  attachment_id: string;
  asset: WorkspaceAssetReference;
  state: 'enabled' | 'disabled';
  role: string;
  scope: {
    kind: 'workspace';
    applies_to: string[];
    does_not_apply_to: string[];
  };
  resolution_policy: 'load_when_clear_ask_when_ambiguous';
  approved_at: string;
  update_policy: 'explicit_switch_only';
  history: Array<{
    asset: WorkspaceAssetReference;
    replaced_at: string;
  }>;
}

export interface WorkspaceAttachmentRecord {
  document_type: 'kdna.workspace-attachments';
  schema_version: '0.1.0';
  workspace: { root_marker: '.kdna/attachments.json' };
  attachments: WorkspaceAttachment[];
}

export class WorkspaceCliError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'WorkspaceCliError';
  }
}

function exactKeys(value: object, expected: string[]): boolean {
  const keys = Object.keys(value).sort();
  const sortedExpected = [...expected].sort();
  return keys.length === sortedExpected.length &&
    keys.every((key, index) => key === sortedExpected[index]);
}

function boundedString(value: unknown, maximum = 512): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= maximum;
}

function stringList(value: unknown): value is string[] {
  return Array.isArray(value) &&
    value.length <= 64 &&
    value.every((item) => boundedString(item, 512));
}

function validAssetReference(value: unknown): value is WorkspaceAssetReference {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const asset = value as Record<string, unknown>;
  const digest = String(asset.digest);
  return exactKeys(asset, ['id', 'version', 'digest', 'snapshot']) &&
    boundedString(asset.id) &&
    boundedString(asset.version, 128) &&
    DIGEST.test(digest) &&
    asset.snapshot === `assets/sha256-${digest.slice('sha256:'.length)}.kdna`;
}

function validHistory(value: unknown): boolean {
  return Array.isArray(value) && value.length <= 64 && value.every((entry) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return false;
    const history = entry as Record<string, unknown>;
    return exactKeys(history, ['asset', 'replaced_at']) &&
      validAssetReference(history.asset) &&
      boundedString(history.replaced_at, 128);
  });
}

function validAttachment(value: unknown): value is WorkspaceAttachment {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const item = value as Record<string, unknown>;
  if (!exactKeys(item, [
    'attachment_id',
    'asset',
    'state',
    'role',
    'scope',
    'resolution_policy',
    'approved_at',
    'update_policy',
    'history',
  ])) return false;

  const scope = item.scope;
  return ATTACHMENT_ID.test(String(item.attachment_id)) &&
    validAssetReference(item.asset) &&
    (item.state === 'enabled' || item.state === 'disabled') &&
    boundedString(item.role) &&
    !!scope && typeof scope === 'object' && !Array.isArray(scope) &&
    exactKeys(scope, ['kind', 'applies_to', 'does_not_apply_to']) &&
    (scope as Record<string, unknown>).kind === 'workspace' &&
    stringList((scope as Record<string, unknown>).applies_to) &&
    stringList((scope as Record<string, unknown>).does_not_apply_to) &&
    item.resolution_policy === 'load_when_clear_ask_when_ambiguous' &&
    boundedString(item.approved_at, 128) &&
    item.update_policy === 'explicit_switch_only' &&
    validHistory(item.history);
}

export function parseWorkspaceAttachmentRecord(stdout: string): WorkspaceAttachmentRecord | null {
  let value: unknown;
  try {
    value = JSON.parse(stdout);
  } catch {
    throw new WorkspaceCliError(
      'workspace_output_invalid',
      'The configured KDNA CLI returned invalid workspace status.',
    );
  }
  if (value === null) return null;
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new WorkspaceCliError(
      'workspace_output_invalid',
      'The configured KDNA CLI returned invalid workspace status.',
    );
  }
  const record = value as Record<string, unknown>;
  const workspace = record.workspace;
  const attachments = record.attachments;
  const valid = exactKeys(record, [
    'document_type',
    'schema_version',
    'workspace',
    'attachments',
  ]) &&
    record.document_type === 'kdna.workspace-attachments' &&
    record.schema_version === '0.1.0' &&
    !!workspace && typeof workspace === 'object' && !Array.isArray(workspace) &&
    exactKeys(workspace, ['root_marker']) &&
    (workspace as Record<string, unknown>).root_marker === '.kdna/attachments.json' &&
    Array.isArray(attachments) &&
    attachments.length <= MAX_ATTACHMENTS &&
    attachments.every(validAttachment);
  if (!valid) {
    throw new WorkspaceCliError(
      'workspace_output_invalid',
      'The configured KDNA CLI returned invalid workspace status.',
    );
  }
  return value as WorkspaceAttachmentRecord;
}

function safeJson(stdout: string): unknown {
  try {
    return JSON.parse(stdout);
  } catch {
    throw new WorkspaceCliError(
      'workspace_output_invalid',
      'The configured KDNA CLI returned invalid command output.',
    );
  }
}

export class WorkspaceCliClient {
  private resolvedPath: string | null = null;

  constructor(private readonly configuredPath: string) {}

  async executable(): Promise<string> {
    if (this.resolvedPath) return this.resolvedPath;
    if (!path.isAbsolute(this.configuredPath)) {
      throw new WorkspaceCliError(
        'workspace_cli_not_configured',
        'Configure an absolute path to the exact KDNA CLI 0.36.0 src/cli.js entry.',
      );
    }
    let candidate: string;
    try {
      candidate = await realpath(this.configuredPath);
      if (!(await stat(candidate)).isFile()) throw new Error('not a regular file');
    } catch {
      throw new WorkspaceCliError(
        'workspace_cli_unavailable',
        'The configured KDNA CLI entry is unavailable.',
      );
    }
    const version = (await this.execute(candidate, ['--version'], process.cwd())).trim();
    if (version !== WORKSPACE_CLI_VERSION) {
      throw new WorkspaceCliError(
        'workspace_cli_incompatible',
        `Workspace controls require KDNA CLI ${WORKSPACE_CLI_VERSION}.`,
      );
    }
    this.resolvedPath = candidate;
    return candidate;
  }

  async status(workspaceRoot: string): Promise<WorkspaceAttachmentRecord | null> {
    const safeRoot = await this.workspaceRoot(workspaceRoot, false);
    if (!safeRoot) return null;
    const stdout = await this.run(['attachments', '--cwd', safeRoot], safeRoot);
    return parseWorkspaceAttachmentRecord(stdout);
  }

  async setState(
    workspaceRoot: string,
    attachmentId: string,
    state: 'enabled' | 'disabled',
  ): Promise<unknown> {
    this.assertAttachmentId(attachmentId);
    const safeRoot = await this.requiredWorkspaceRoot(workspaceRoot);
    const operation = state === 'enabled' ? 'enable' : 'disable';
    return safeJson(await this.run([operation, attachmentId, '--cwd', safeRoot], safeRoot));
  }

  async rollback(workspaceRoot: string, attachmentId: string): Promise<unknown> {
    this.assertAttachmentId(attachmentId);
    const safeRoot = await this.requiredWorkspaceRoot(workspaceRoot);
    return safeJson(await this.run(['rollback', attachmentId, '--cwd', safeRoot], safeRoot));
  }

  async remove(workspaceRoot: string, attachmentId: string): Promise<unknown> {
    this.assertAttachmentId(attachmentId);
    const safeRoot = await this.requiredWorkspaceRoot(workspaceRoot);
    return safeJson(await this.run(['remove', attachmentId, '--cwd', safeRoot], safeRoot));
  }

  private async requiredWorkspaceRoot(workspaceRoot: string): Promise<string> {
    const safeRoot = await this.workspaceRoot(workspaceRoot, true);
    if (!safeRoot) {
      throw new WorkspaceCliError(
        'workspace_record_unavailable',
        'This exact VS Code workspace has no approved KDNA attachment record.',
      );
    }
    return safeRoot;
  }

  private async workspaceRoot(
    workspaceRoot: string,
    requireRecord: boolean,
  ): Promise<string | null> {
    let safeRoot: string;
    try {
      safeRoot = await realpath(workspaceRoot);
      if (!(await stat(safeRoot)).isDirectory()) throw new Error('not a directory');
    } catch {
      throw new WorkspaceCliError(
        'workspace_unavailable',
        'The selected VS Code workspace is unavailable.',
      );
    }
    const recordPath = path.join(safeRoot, '.kdna', 'attachments.json');
    try {
      const recordInfo = await lstat(recordPath);
      if (!recordInfo.isFile() || recordInfo.isSymbolicLink()) throw new Error('unsafe record');
      if (await realpath(recordPath) !== recordPath) throw new Error('unsafe record');
      return safeRoot;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT' && !requireRecord) return null;
      throw new WorkspaceCliError(
        'workspace_record_unavailable',
        'This exact VS Code workspace has no safe KDNA attachment record.',
      );
    }
  }

  private assertAttachmentId(attachmentId: string): void {
    if (!ATTACHMENT_ID.test(attachmentId)) {
      throw new WorkspaceCliError(
        'workspace_attachment_invalid',
        'The selected workspace attachment identity is invalid.',
      );
    }
  }

  private async run(args: string[], cwd: string): Promise<string> {
    return this.execute(await this.executable(), args, cwd);
  }

  private async execute(executable: string, args: string[], cwd: string): Promise<string> {
    try {
      const { stdout } = await execFileAsync(process.execPath, [executable, ...args], {
        cwd,
        env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
        encoding: 'utf8',
        timeout: 30_000,
        maxBuffer: MAX_OUTPUT_BYTES,
        windowsHide: true,
        shell: false,
      });
      return stdout;
    } catch {
      throw new WorkspaceCliError(
        'workspace_cli_rejected',
        'The configured KDNA CLI could not complete the workspace request.',
      );
    }
  }
}
