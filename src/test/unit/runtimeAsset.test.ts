import * as assert from 'node:assert';
import { describe, it } from 'node:test';

import {
  isRuntimeCapsule,
  renderRuntimeAssetPreview,
  RuntimeAssetResult,
} from '../../utils/runtimeAsset';

describe('Runtime Capsule adapter', () => {
  it('accepts only the current Runtime Capsule identity', () => {
    assert.equal(isRuntimeCapsule({ type: 'legacy.context.capsule' }), false);
    assert.equal(isRuntimeCapsule({
      type: 'kdna.runtime-capsule',
      contract_version: '0.1.0',
      context: {},
      digests: {},
    }), true);
  });

  it('renders an authorized projection and escapes judgment content', () => {
    const result: RuntimeAssetResult = {
      inspection: { title: 'Example' },
      plan: {
        asset: { title: 'Example', version: '1.0.0' },
        state: 'ready',
        required_action: 'load',
        can_load_now: true,
      },
      capsule: {
        type: 'kdna.runtime-capsule',
        contract_version: '0.1.0',
        asset: {},
        digests: {},
        access: 'public',
        profile: 'compact',
        context: {
          highest_question: '<script>alert(1)</script>',
          axioms: [{ statement: 'Prefer reversible changes.' }],
        },
        trace: {
          projection_report: {
            status: 'partial',
            omitted: [{ path: '/core/ontology', count: 2 }],
            omitted_total: 2,
          },
        },
      },
    };

    const html = renderRuntimeAssetPreview(result);
    assert.match(html, /kdna\.runtime-capsule@0\.1\.0/);
    assert.match(html, /Prefer reversible changes/);
    assert.doesNotMatch(html, /<script>alert/);
    assert.match(html, /&lt;script&gt;/);
    assert.match(html, /Projection: partial/);
    assert.match(html, /2 omitted values disclosed/);
    assert.match(html, /\/core\/ontology/);
  });

  it('renders LoadPlan denial without reading payload content', () => {
    const html = renderRuntimeAssetPreview({
      inspection: { title: 'Protected' },
      plan: {
        asset: { title: 'Protected' },
        state: 'needs_password',
        required_action: 'enter_password',
        can_load_now: false,
        issues: [{ code: 'KDNA_AUTH_PASSWORD_REQUIRED', message: 'Password required.' }],
      },
      capsule: null,
    });

    assert.match(html, /Load blocked: needs_password/);
    assert.match(html, /enter_password/);
    assert.match(html, /KDNA_AUTH_PASSWORD_REQUIRED/);
  });
});
