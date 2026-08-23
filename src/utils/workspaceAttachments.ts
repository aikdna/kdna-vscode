import { execFile, spawn } from 'node:child_process';
import { lstat, realpath, stat } from 'node:fs/promises';
import * as path from 'node:path';
import { promisify } from 'node:util';

import {
  WORKSPACE_CLI_RECORD_SCHEMA_VERSION,
  WORKSPACE_CLI_VERSION,
} from './workspaceCliContract';

const execFileAsync = promisify(execFile);

const MAX_OUTPUT_BYTES = 16 * 1024 * 1024;
const MAX_ATTACHMENT_STDIN_BYTES = 64 * 1024;
// Aligned with the pinned CLI's own bounds so every record the exact CLI can
// emit stays parseable while anything broader still fails closed.
const MAX_ATTACHMENTS = 1024;
const MAX_SCOPE_TERMS = 256;
const MAX_TEXT_LENGTH = 4096;
const ATTACHMENT_ID = /^att_[0-9a-f]{24}$/u;
const DIGEST = /^sha256:[0-9a-f]{64}$/u;
const UTC_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u;

export {
  WORKSPACE_CLI_VERSION,
  WORKSPACE_CLI_RECORD_SCHEMA_VERSION,
};

/**
 * Single truth for the exact CLI argument vector the "Switch Exact File…" UI
 * launches. The pinned CLI requires exactly one reviewed policy source;
 * "Switch Exact File…" asks the user only for the replacement file, so the
 * switch retains the current attachment's role/scope via --retain-scope.
 * No automatic approval flags are added: the CLI keeps its interactive
 * preview and positive confirmation.
 */
export function switchAttachmentArgs(
  attachmentId: string,
  assetPath: string,
  workspaceRoot: string,
): string[] {
  return [
    'switch',
    attachmentId,
    assetPath,
    '--cwd',
    workspaceRoot,
    '--retain-scope',
  ];
}

/**
 * Preview variant of the single switch vector: the CLI prints the exact
 * preview payload and performs no write.
 */
export function switchPreviewArgs(
  attachmentId: string,
  assetPath: string,
  workspaceRoot: string,
): string[] {
  return [...switchAttachmentArgs(attachmentId, assetPath, workspaceRoot), '--preview'];
}

/**
 * Approved-execution variant. The CLI 0.36.1 interactive confirmation cannot
 * complete inside a VS Code terminal (its synchronous stdin read fails with
 * EAGAIN on the non-blocking terminal pty — verified against the pinned CLI
 * in a real Extension Host), and its cross-invocation consent digest embeds
 * the per-invocation approved_at timestamp, so the preview/digest split can
 * never match across two runs. The UI therefore shows the CLI's real preview
 * payload and requires an explicit modal confirmation; only after that does
 * it execute this vector, which tells the CLI the user already approved the
 * scope in the Host UI (recorded approval_source: user_explicit).
 */
export function switchApprovedArgs(
  attachmentId: string,
  assetPath: string,
  workspaceRoot: string,
): string[] {
  return [
    ...switchAttachmentArgs(attachmentId, assetPath, workspaceRoot),
    '--yes',
    '--scope-user-approved',
  ];
}

export interface AttachmentProposal {
  role: string;
  applies_to: string[];
  does_not_apply_to: string[];
}

/**
 * Build the bounded, stable JSON proposal that the "Attach File…" UI passes
 * to the CLI through --attachment-stdin. The proposal never enters argv,
 * environment variables, or ordinary logs.
 */
export function attachmentProposalBytes(proposal: AttachmentProposal): Buffer {
  const body = JSON.stringify({
    role: proposal.role,
    applies_to: proposal.applies_to,
    does_not_apply_to: proposal.does_not_apply_to,
  });
  const bytes = Buffer.from(body, 'utf8');
  if (bytes.length > MAX_ATTACHMENT_STDIN_BYTES) {
    throw new WorkspaceCliError(
      'workspace_attachment_invalid',
      'The attachment scope proposal exceeds the size limit.',
    );
  }
  return bytes;
}

/**
 * Single truth for the exact CLI argument vector the "Attach File…" UI
 * launches. The pinned CLI reads the reviewed policy through
 * --attachment-stdin, so role/scope never appear in argv.
 */
export function attachBaseArgs(
  assetPath: string,
  workspaceRoot: string,
): string[] {
  return [
    'attach',
    assetPath,
    '--cwd',
    workspaceRoot,
    '--attachment-stdin',
  ];
}

/**
 * Preview variant: the CLI prints the exact preview payload and performs no
 * write. The same stdin bytes must be replayed for approved execution.
 */
export function attachPreviewArgs(
  assetPath: string,
  workspaceRoot: string,
): string[] {
  return [...attachBaseArgs(assetPath, workspaceRoot), '--preview'];
}

/**
 * Approved-execution variant. Attach's consent facts do not include
 * approved_at, so the preview consent_digest can be replayed across the two
 * calls. Passing --consent-digest binds the approved execution to the exact
 * previewed attachment proposal; any asset/workspace/scope/authorization drift
 * makes the CLI fail with approval_binding_changed before writing bytes.
 */
export function attachApprovedArgs(
  assetPath: string,
  workspaceRoot: string,
  consentDigest: string,
): string[] {
  return [
    ...attachBaseArgs(assetPath, workspaceRoot),
    '--yes',
    '--consent-digest',
    consentDigest,
  ];
}

export interface WorkspaceAssetReference {
  id: string;
  version: string;
  digest: string;
  snapshot: string;
}

export interface WorkspaceScope {
  kind: 'workspace';
  application: 'task_hints' | 'all_workspace';
  matching_policy: 'open_world_ask' | 'closed_world_skip' | 'all_workspace';
  authority: 'user_approved_routing_hint';
  approval_source: 'user_explicit' | 'preview_confirmed';
  applies_to: string[];
  does_not_apply_to: string[];
}

export interface WorkspaceAttachment {
  attachment_id: string;
  asset: WorkspaceAssetReference;
  state: 'enabled' | 'disabled';
  role: string;
  scope: WorkspaceScope;
  resolution_policy: 'load_when_clear_ask_when_ambiguous';
  approved_at: string;
  update_policy: 'explicit_switch_only';
  history: Array<{
    asset: WorkspaceAssetReference;
    role: string;
    scope: WorkspaceScope;
    resolution_policy: 'load_when_clear_ask_when_ambiguous';
    approved_at: string;
    update_policy: 'explicit_switch_only';
    replaced_at: string;
  }>;
}

export interface WorkspaceAttachmentRecord {
  document_type: 'kdna.workspace-attachments';
  schema_version: typeof WORKSPACE_CLI_RECORD_SCHEMA_VERSION;
  workspace: { root_marker: '.kdna/attachments.json' };
  attachments: WorkspaceAttachment[];
}

export interface SwitchPreview {
  operation: 'switch';
  consent_digest: string;
  workspace_boundary: { kind: 'exact_workspace'; root: string };
  attachment_id: string;
  old_attachment: {
    asset: WorkspaceAssetReference;
    role: string;
    scope: WorkspaceScope;
    resolution_policy: 'load_when_clear_ask_when_ambiguous';
    approved_at: string;
    update_policy: 'explicit_switch_only';
  };
  new_attachment: {
    asset: WorkspaceAssetReference;
    state: 'enabled' | 'disabled';
    role: string;
    scope: WorkspaceScope;
    resolution_policy: 'load_when_clear_ask_when_ambiguous';
    approved_at: string;
    update_policy: 'explicit_switch_only';
  };
  authorization: {
    old: { access: string; required_before_load: boolean; load_plan_state: string };
    new: { access: string; required_before_load: boolean; load_plan_state: string };
  };
  scope_contract: {
    inherited_without_review: boolean;
    asset_declared_preload_boundary: string;
    runtime_boundary_remains_authoritative: boolean;
  };
}

export interface AttachPreview {
  operation: 'attach';
  consent_digest: string;
  workspace_boundary: { kind: 'exact_workspace'; root: string };
  attachment: {
    asset: WorkspaceAssetReference;
    state: 'enabled' | 'disabled';
    role: string;
    scope: WorkspaceScope;
    resolution_policy: 'load_when_clear_ask_when_ambiguous';
    update_policy: 'explicit_switch_only';
  };
  authorization: {
    access: string;
    required_before_load: boolean;
    load_plan_state: string;
  };
  scope_contract: {
    authority: 'user_approved_routing_hint';
    asset_declared_preload_boundary: string;
    runtime_boundary_remains_authoritative: boolean;
  };
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

function boundedText(value: unknown, maximum = MAX_TEXT_LENGTH): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= maximum &&
    value.trim().length > 0;
}

function scopeTerms(value: unknown): value is string[] {
  if (!Array.isArray(value) || value.length > MAX_SCOPE_TERMS) return false;
  if (!value.every((item) => boundedText(item))) return false;
  const normalized = value.map((item) =>
    String(item).normalize('NFKC').trim().replace(/\s+/gu, ' ').toLocaleLowerCase('und'));
  return new Set(normalized).size === normalized.length;
}

function validAssetReference(value: unknown): value is WorkspaceAssetReference {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const asset = value as Record<string, unknown>;
  const digest = String(asset.digest);
  return exactKeys(asset, ['id', 'version', 'digest', 'snapshot']) &&
    boundedText(asset.id) &&
    boundedText(asset.version) &&
    DIGEST.test(digest) &&
    asset.snapshot === `assets/sha256-${digest.slice('sha256:'.length)}.kdna`;
}

function validScope(value: unknown): value is WorkspaceScope {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const scope = value as Record<string, unknown>;
  if (!exactKeys(scope, [
    'kind',
    'application',
    'matching_policy',
    'authority',
    'approval_source',
    'applies_to',
    'does_not_apply_to',
  ])) return false;
  if (scope.kind !== 'workspace') return false;
  if (scope.authority !== 'user_approved_routing_hint') return false;
  if (!['user_explicit', 'preview_confirmed'].includes(String(scope.approval_source))) {
    return false;
  }
  if (!['task_hints', 'all_workspace'].includes(String(scope.application))) return false;
  if (!['open_world_ask', 'closed_world_skip', 'all_workspace'].includes(
    String(scope.matching_policy),
  )) return false;
  if (!scopeTerms(scope.applies_to) || !scopeTerms(scope.does_not_apply_to)) return false;
  const application = scope.application;
  const matchingPolicy = scope.matching_policy;
  const appliesTo = scope.applies_to as string[];
  if (application === 'task_hints' &&
    (appliesTo.length === 0 || matchingPolicy === 'all_workspace')) return false;
  if (application === 'all_workspace' &&
    (appliesTo.length !== 0 || matchingPolicy !== 'all_workspace')) return false;
  return true;
}

/**
 * Attach preview/approved results must carry approval_source=preview_confirmed,
 * because the consent-digest path does not set user_explicit.
 */
function validAttachScope(value: unknown): value is WorkspaceScope {
  if (!validScope(value)) return false;
  return (value as WorkspaceScope).approval_source === 'preview_confirmed';
}

function validTimestamp(value: unknown): boolean {
  return typeof value === 'string' && UTC_TIMESTAMP.test(value) &&
    !Number.isNaN(Date.parse(value));
}

function validHistory(value: unknown): boolean {
  if (!Array.isArray(value) || value.length > MAX_ATTACHMENTS) return false;
  return value.every((entry) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return false;
    const history = entry as Record<string, unknown>;
    return exactKeys(history, [
      'asset',
      'role',
      'scope',
      'resolution_policy',
      'approved_at',
      'update_policy',
      'replaced_at',
    ]) &&
      validAssetReference(history.asset) &&
      boundedText(history.role) &&
      validScope(history.scope) &&
      history.resolution_policy === 'load_when_clear_ask_when_ambiguous' &&
      validTimestamp(history.approved_at) &&
      history.update_policy === 'explicit_switch_only' &&
      validTimestamp(history.replaced_at);
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

  return ATTACHMENT_ID.test(String(item.attachment_id)) &&
    validAssetReference(item.asset) &&
    (item.state === 'enabled' || item.state === 'disabled') &&
    boundedText(item.role) &&
    validScope(item.scope) &&
    item.resolution_policy === 'load_when_clear_ask_when_ambiguous' &&
    validTimestamp(item.approved_at) &&
    item.update_policy === 'explicit_switch_only' &&
    validHistory(item.history);
}

/** Attach-specific attachment result with approval_source=preview_confirmed. */
function validAttachAttachment(value: unknown): value is WorkspaceAttachment {
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

  return ATTACHMENT_ID.test(String(item.attachment_id)) &&
    validAssetReference(item.asset) &&
    (item.state === 'enabled' || item.state === 'disabled') &&
    boundedText(item.role) &&
    validAttachScope(item.scope) &&
    item.resolution_policy === 'load_when_clear_ask_when_ambiguous' &&
    validTimestamp(item.approved_at) &&
    item.update_policy === 'explicit_switch_only' &&
    Array.isArray(item.history) &&
    (item.history as unknown[]).length === 0;
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
    record.schema_version === WORKSPACE_CLI_RECORD_SCHEMA_VERSION &&
    !!workspace && typeof workspace === 'object' && !Array.isArray(workspace) &&
    exactKeys(workspace, ['root_marker']) &&
    (workspace as Record<string, unknown>).root_marker === '.kdna/attachments.json' &&
    Array.isArray(attachments) &&
    attachments.length <= MAX_ATTACHMENTS &&
    attachments.every(validAttachment) &&
    new Set(attachments.map((attachment) => attachment.attachment_id)).size === attachments.length;
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

function validAuthorizationFacts(value: unknown): boolean {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const facts = value as Record<string, unknown>;
  return exactKeys(facts, ['access', 'required_before_load', 'load_plan_state']) &&
    boundedText(facts.access) &&
    typeof facts.required_before_load === 'boolean' &&
    boundedText(facts.load_plan_state);
}

function validAttachPreviewEnvelope(value: unknown): value is AttachPreview {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const envelope = value as Record<string, unknown>;
  if (!exactKeys(envelope, ['operation', 'mode', 'workspace_root', 'confirmation_required', 'preview'])) {
    return false;
  }
  if (envelope.operation !== 'attach' || envelope.mode !== 'preview' ||
    envelope.confirmation_required !== true || !boundedText(envelope.workspace_root)) {
    return false;
  }
  const preview = envelope.preview;
  if (!preview || typeof preview !== 'object' || Array.isArray(preview)) return false;
  const facts = preview as Record<string, unknown>;
  if (!exactKeys(facts, [
    'operation',
    'consent_digest',
    'workspace_boundary',
    'attachment',
    'authorization',
    'scope_contract',
  ])) return false;
  if (facts.operation !== 'attach' ||
    typeof facts.consent_digest !== 'string' ||
    !/^sha256:[0-9a-f]{64}$/u.test(facts.consent_digest)) return false;
  const boundary = facts.workspace_boundary;
  if (!boundary || typeof boundary !== 'object' || Array.isArray(boundary) ||
    !exactKeys(boundary, ['kind', 'root']) ||
    (boundary as Record<string, unknown>).kind !== 'exact_workspace' ||
    !boundedText((boundary as Record<string, unknown>).root)) return false;
  const attachment = facts.attachment;
  if (!attachment || typeof attachment !== 'object' || Array.isArray(attachment)) return false;
  const entry = attachment as Record<string, unknown>;
  if (!exactKeys(entry, [
    'asset',
    'state',
    'role',
    'scope',
    'resolution_policy',
    'update_policy',
  ]) ||
    !validAssetReference(entry.asset) ||
    !boundedText(entry.role) ||
    !validAttachScope(entry.scope) ||
    entry.resolution_policy !== 'load_when_clear_ask_when_ambiguous' ||
    entry.update_policy !== 'explicit_switch_only' ||
    (entry.state !== 'enabled' && entry.state !== 'disabled')) return false;
  const authorization = facts.authorization;
  if (!authorization || typeof authorization !== 'object' || Array.isArray(authorization) ||
    !exactKeys(authorization, ['access', 'required_before_load', 'load_plan_state']) ||
    !validAuthorizationFacts(authorization)) return false;
  const contract = facts.scope_contract;
  if (!contract || typeof contract !== 'object' || Array.isArray(contract) ||
    !exactKeys(contract, [
      'authority',
      'asset_declared_preload_boundary',
      'runtime_boundary_remains_authoritative',
    ]) ||
    (contract as Record<string, unknown>).authority !== 'user_approved_routing_hint' ||
    !boundedText((contract as Record<string, unknown>).asset_declared_preload_boundary) ||
    (contract as Record<string, unknown>).runtime_boundary_remains_authoritative !== true) {
    return false;
  }
  return true;
}

export function parseAttachPreview(stdout: string): AttachPreview {
  const value = safeJson(stdout);
  if (!validAttachPreviewEnvelope(value)) {
    throw new WorkspaceCliError(
      'workspace_output_invalid',
      'The configured KDNA CLI returned an invalid attach preview.',
    );
  }
  return (value as unknown as { preview: AttachPreview }).preview;
}

function validAttachResult(value: unknown): value is { attachment: WorkspaceAttachment } {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const result = value as Record<string, unknown>;
  if (!exactKeys(result, ['operation', 'workspace_root', 'attachment'])) return false;
  if (result.operation !== 'attach' || !boundedText(result.workspace_root)) return false;
  return validAttachAttachment(result.attachment);
}

export function parseAttachResult(stdout: string): WorkspaceAttachment {
  const value = safeJson(stdout);
  if (!validAttachResult(value)) {
    throw new WorkspaceCliError(
      'workspace_output_invalid',
      'The configured KDNA CLI returned an invalid attach result.',
    );
  }
  return (value as { attachment: WorkspaceAttachment }).attachment;
}

/**
 * Defense-in-depth equality used after approved attach execution to compare
 * the CLI mutation output with the on-disk status record.
 */
export function attachmentRecordsEqual(a: WorkspaceAttachment, b: WorkspaceAttachment): boolean {
  return a.attachment_id === b.attachment_id &&
    a.asset.id === b.asset.id &&
    a.asset.version === b.asset.version &&
    a.asset.digest === b.asset.digest &&
    a.asset.snapshot === b.asset.snapshot &&
    a.state === b.state &&
    a.role === b.role &&
    a.scope.kind === b.scope.kind &&
    a.scope.application === b.scope.application &&
    a.scope.matching_policy === b.scope.matching_policy &&
    a.scope.authority === b.scope.authority &&
    a.scope.approval_source === b.scope.approval_source &&
    JSON.stringify([...a.scope.applies_to].sort()) ===
      JSON.stringify([...b.scope.applies_to].sort()) &&
    JSON.stringify([...a.scope.does_not_apply_to].sort()) ===
      JSON.stringify([...b.scope.does_not_apply_to].sort()) &&
    a.resolution_policy === b.resolution_policy &&
    a.approved_at === b.approved_at &&
    a.update_policy === b.update_policy &&
    JSON.stringify(a.history) === JSON.stringify(b.history);
}

function validSwitchPreviewEnvelope(value: unknown): value is SwitchPreview {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const envelope = value as Record<string, unknown>;
  if (!exactKeys(envelope, ['operation', 'mode', 'workspace_root', 'confirmation_required', 'preview'])) {
    return false;
  }
  if (envelope.operation !== 'switch' || envelope.mode !== 'preview' ||
    envelope.confirmation_required !== true || !boundedText(envelope.workspace_root)) {
    return false;
  }
  const preview = envelope.preview;
  if (!preview || typeof preview !== 'object' || Array.isArray(preview)) return false;
  const facts = preview as Record<string, unknown>;
  if (!exactKeys(facts, [
    'operation',
    'consent_digest',
    'workspace_boundary',
    'attachment_id',
    'old_attachment',
    'new_attachment',
    'authorization',
    'scope_contract',
  ])) return false;
  if (facts.operation !== 'switch' ||
    typeof facts.consent_digest !== 'string' ||
    !/^sha256:[0-9a-f]{64}$/u.test(facts.consent_digest) ||
    !ATTACHMENT_ID.test(String(facts.attachment_id))) return false;
  const boundary = facts.workspace_boundary;
  if (!boundary || typeof boundary !== 'object' || Array.isArray(boundary) ||
    !exactKeys(boundary, ['kind', 'root']) ||
    (boundary as Record<string, unknown>).kind !== 'exact_workspace' ||
    !boundedText((boundary as Record<string, unknown>).root)) return false;
  for (const attachmentKey of ['old_attachment', 'new_attachment']) {
    const attachment = facts[attachmentKey];
    if (!attachment || typeof attachment !== 'object' || Array.isArray(attachment)) return false;
    const entry = attachment as Record<string, unknown>;
    const expectedKeys = attachmentKey === 'new_attachment'
      ? ['asset', 'state', 'role', 'scope', 'resolution_policy', 'approved_at', 'update_policy']
      : ['asset', 'role', 'scope', 'resolution_policy', 'approved_at', 'update_policy'];
    if (!exactKeys(entry, expectedKeys) ||
      !validAssetReference(entry.asset) ||
      !boundedText(entry.role) ||
      !validScope(entry.scope) ||
      entry.resolution_policy !== 'load_when_clear_ask_when_ambiguous' ||
      !validTimestamp(entry.approved_at) ||
      entry.update_policy !== 'explicit_switch_only' ||
      (attachmentKey === 'new_attachment' &&
        entry.state !== 'enabled' && entry.state !== 'disabled')) return false;
  }
  const authorization = facts.authorization;
  if (!authorization || typeof authorization !== 'object' || Array.isArray(authorization) ||
    !exactKeys(authorization, ['old', 'new']) ||
    !validAuthorizationFacts((authorization as Record<string, unknown>).old) ||
    !validAuthorizationFacts((authorization as Record<string, unknown>).new)) return false;
  const contract = facts.scope_contract;
  if (!contract || typeof contract !== 'object' || Array.isArray(contract) ||
    !exactKeys(contract, [
      'inherited_without_review',
      'asset_declared_preload_boundary',
      'runtime_boundary_remains_authoritative',
    ]) ||
    (contract as Record<string, unknown>).inherited_without_review !== false ||
    !boundedText((contract as Record<string, unknown>).asset_declared_preload_boundary) ||
    (contract as Record<string, unknown>).runtime_boundary_remains_authoritative !== true) {
    return false;
  }
  return true;
}

export function parseSwitchPreview(stdout: string): SwitchPreview {
  const value = safeJson(stdout);
  if (!validSwitchPreviewEnvelope(value)) {
    throw new WorkspaceCliError(
      'workspace_output_invalid',
      'The configured KDNA CLI returned an invalid switch preview.',
    );
  }
  return (value as unknown as { preview: SwitchPreview }).preview;
}

export class WorkspaceCliClient {
  private resolvedPath: string | null = null;

  constructor(private readonly configuredPath: string) {}

  async executable(): Promise<string> {
    if (this.resolvedPath) return this.resolvedPath;
    if (!path.isAbsolute(this.configuredPath)) {
      throw new WorkspaceCliError(
        'workspace_cli_not_configured',
        `Configure an absolute path to the exact KDNA CLI ${WORKSPACE_CLI_VERSION} src/cli.js entry.`,
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

  async switchPreview(
    workspaceRoot: string,
    attachmentId: string,
    assetPath: string,
  ): Promise<SwitchPreview> {
    this.assertAttachmentId(attachmentId);
    const safeRoot = await this.requiredWorkspaceRoot(workspaceRoot);
    const stdout = await this.run(
      switchPreviewArgs(attachmentId, assetPath, safeRoot),
      safeRoot,
    );
    return parseSwitchPreview(stdout);
  }

  async switchApproved(
    workspaceRoot: string,
    attachmentId: string,
    assetPath: string,
  ): Promise<unknown> {
    this.assertAttachmentId(attachmentId);
    const safeRoot = await this.requiredWorkspaceRoot(workspaceRoot);
    return safeJson(await this.run(
      switchApprovedArgs(attachmentId, assetPath, safeRoot),
      safeRoot,
    ));
  }

  async attachPreview(
    workspaceRoot: string,
    assetPath: string,
    proposal: AttachmentProposal,
  ): Promise<AttachPreview> {
    const safeRoot = await this.safeWorkspaceDirectory(workspaceRoot);
    const stdin = attachmentProposalBytes(proposal);
    const stdout = await this.runWithStdin(
      attachPreviewArgs(assetPath, safeRoot),
      safeRoot,
      stdin,
    );
    return parseAttachPreview(stdout);
  }

  async attachApproved(
    workspaceRoot: string,
    assetPath: string,
    proposal: AttachmentProposal,
    consentDigest: string,
  ): Promise<WorkspaceAttachment> {
    const safeRoot = await this.safeWorkspaceDirectory(workspaceRoot);
    const stdin = attachmentProposalBytes(proposal);
    const stdout = await this.runWithStdin(
      attachApprovedArgs(assetPath, safeRoot, consentDigest),
      safeRoot,
      stdin,
    );
    return parseAttachResult(stdout);
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
    const safeRoot = await this.safeWorkspaceDirectory(workspaceRoot);
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

  private async safeWorkspaceDirectory(workspaceRoot: string): Promise<string> {
    try {
      const safeRoot = await realpath(workspaceRoot);
      if (!(await stat(safeRoot)).isDirectory()) throw new Error('not a directory');
      return safeRoot;
    } catch {
      throw new WorkspaceCliError(
        'workspace_unavailable',
        'The selected VS Code workspace is unavailable.',
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

  private async runWithStdin(
    args: string[],
    cwd: string,
    stdin: Buffer,
  ): Promise<string> {
    const executable = await this.executable();
    return new Promise((resolve, reject) => {
      const child = spawn(process.execPath, [executable, ...args], {
        cwd,
        env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
        windowsHide: true,
        shell: false,
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      let stdout = Buffer.alloc(0);
      let stderr = Buffer.alloc(0);
      let killed = false;
      const timeout = setTimeout(() => {
        killed = true;
        child.kill();
        reject(new WorkspaceCliError(
          'workspace_cli_rejected',
          'The configured KDNA CLI timed out while reading the attachment proposal.',
        ));
      }, 30_000);

      child.stdout.on('data', (chunk: Buffer) => {
        stdout = Buffer.concat([stdout, chunk]);
        if (stdout.length > MAX_OUTPUT_BYTES) {
          killed = true;
          child.kill();
          clearTimeout(timeout);
          reject(new WorkspaceCliError(
            'workspace_cli_rejected',
            'The configured KDNA CLI returned too much output.',
          ));
        }
      });
      child.stderr.on('data', (chunk: Buffer) => {
        stderr = Buffer.concat([stderr, chunk]);
        if (stderr.length > MAX_OUTPUT_BYTES) {
          killed = true;
          child.kill();
          clearTimeout(timeout);
          reject(new WorkspaceCliError(
            'workspace_cli_rejected',
            'The configured KDNA CLI returned too much error output.',
          ));
        }
      });

      child.on('error', () => {
        clearTimeout(timeout);
        reject(new WorkspaceCliError(
          'workspace_cli_rejected',
          'The configured KDNA CLI could not start the workspace request.',
        ));
      });

      child.on('close', (code) => {
        clearTimeout(timeout);
        if (killed) return;
        if (code !== 0) {
          reject(new WorkspaceCliError(
            'workspace_cli_rejected',
            'The configured KDNA CLI could not complete the workspace request.',
          ));
          return;
        }
        resolve(stdout.toString('utf8'));
      });

      child.stdin.write(stdin, (error) => {
        if (error) {
          killed = true;
          child.kill();
          clearTimeout(timeout);
          reject(new WorkspaceCliError(
            'workspace_cli_rejected',
            'The attachment proposal could not be sent to the CLI.',
          ));
        } else {
          child.stdin.end();
        }
      });
    });
  }
}
