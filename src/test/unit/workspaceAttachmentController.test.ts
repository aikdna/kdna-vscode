import * as assert from 'node:assert';
import { describe, it } from 'node:test';

import { attachmentRecordsEqual } from '../../utils/workspaceAttachments';
import { WorkspaceAttachment } from '../../utils/workspaceAttachments';

function baseAttachment(): WorkspaceAttachment {
  return {
    attachment_id: 'att_0123456789abcdef01234567',
    asset: {
      id: 'kdna:test:review',
      version: '1.0.0',
      digest: `sha256:${'a'.repeat(64)}`,
      snapshot: `assets/sha256-${'a'.repeat(64)}.kdna`,
    },
    state: 'enabled',
    role: 'deployment-review',
    scope: {
      kind: 'workspace',
      application: 'task_hints',
      matching_policy: 'open_world_ask',
      authority: 'user_approved_routing_hint',
      approval_source: 'preview_confirmed',
      applies_to: ['deployment'],
      does_not_apply_to: ['poem'],
    },
    resolution_policy: 'load_when_clear_ask_when_ambiguous',
    approved_at: '2026-07-22T00:00:00.000Z',
    update_policy: 'explicit_switch_only',
    history: [],
  };
}

describe('WorkspaceAttachmentController.attachmentRecordsEqual', () => {
  it('returns true for identical attachments', () => {
    const a = baseAttachment();
    const b = baseAttachment();
    assert.equal(attachmentRecordsEqual(a, b), true);
  });

  it('returns false when approved_at is tampered', () => {
    const a = baseAttachment();
    const b = baseAttachment();
    b.approved_at = '2026-07-23T00:00:00.000Z';
    assert.equal(attachmentRecordsEqual(a, b), false);
  });

  it('returns false when history is non-empty', () => {
    const a = baseAttachment();
    const b = baseAttachment();
    b.history = [{
      asset: a.asset,
      role: 'old-role',
      scope: a.scope,
      resolution_policy: 'load_when_clear_ask_when_ambiguous',
      approved_at: '2026-07-21T00:00:00.000Z',
      update_policy: 'explicit_switch_only',
      replaced_at: '2026-07-22T00:00:00.000Z',
    }];
    assert.equal(attachmentRecordsEqual(a, b), false);
  });

  it('returns false when asset snapshot differs', () => {
    const a = baseAttachment();
    const b = baseAttachment();
    b.asset.snapshot = `assets/sha256-${'b'.repeat(64)}.kdna`;
    assert.equal(attachmentRecordsEqual(a, b), false);
  });

  it('returns false when scope approval_source differs', () => {
    const a = baseAttachment();
    const b = baseAttachment();
    b.scope.approval_source = 'user_explicit';
    assert.equal(attachmentRecordsEqual(a, b), false);
  });
});
