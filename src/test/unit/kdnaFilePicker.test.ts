import * as assert from 'node:assert';
import { describe, it } from 'node:test';

import {
  validateLocalKdnaPath,
  validateLocalKdnaUri,
} from '../../utils/kdnaFilePicker';

describe('validateLocalKdnaPath', () => {
  it('accepts a lowercase .kdna file with a base name', () => {
    const result = validateLocalKdnaPath('/workspace/public-safe-content-review.kdna');
    assert.equal(result.ok, true);
  });

  it('rejects a file with no extension', () => {
    const result = validateLocalKdnaPath('/workspace/public-safe-content-review');
    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.match(result.reason, /\.kdna/);
  });

  it('rejects a file with a wrong extension', () => {
    const result = validateLocalKdnaPath('/workspace/review.txt');
    assert.equal(result.ok, false);
  });

  it('rejects a file literally named .kdna', () => {
    const result = validateLocalKdnaPath('/workspace/.kdna');
    assert.equal(result.ok, false);
  });

  it('rejects an uppercase KDNA extension (case-sensitive contract)', () => {
    const result = validateLocalKdnaPath('/workspace/review.KDNA');
    assert.equal(result.ok, false);
  });

  it('rejects mixed-case extensions', () => {
    assert.equal(validateLocalKdnaPath('/workspace/review.Kdna').ok, false);
    assert.equal(validateLocalKdnaPath('/workspace/review.kDnA').ok, false);
  });

  it('accepts names with multiple dots ending in .kdna', () => {
    const result = validateLocalKdnaPath('/workspace/review.v1.2.kdna');
    assert.equal(result.ok, true);
  });
});

describe('validateLocalKdnaUri', () => {
  it('accepts a file:// URI to a .kdna file', () => {
    const result = validateLocalKdnaUri(
      'file',
      '/workspace/public-safe-content-review.kdna',
    );
    assert.equal(result.ok, true);
  });

  it('rejects a remote https:// URI', () => {
    const result = validateLocalKdnaUri(
      'https',
      '/workspace/public-safe-content-review.kdna',
    );
    assert.equal(result.ok, false);
  });

  it('rejects a vscode-remote:// URI', () => {
    const result = validateLocalKdnaUri(
      'vscode-remote',
      '/workspace/public-safe-content-review.kdna',
    );
    assert.equal(result.ok, false);
  });

  it('rejects an untitled:// URI even if the path ends in .kdna', () => {
    const result = validateLocalKdnaUri(
      'untitled',
      '/workspace/public-safe-content-review.kdna',
    );
    assert.equal(result.ok, false);
  });
});
