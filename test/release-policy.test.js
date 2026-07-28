'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { validateReleaseContext } = require('../scripts/release-policy');

const ROOT = path.resolve(__dirname, '..');
const HASH = 'a'.repeat(40);
const CHECKOUT_ACTION_SHA = '9c091bb21b7c1c1d1991bb908d89e4e9dddfe3e0';
const SETUP_NODE_ACTION_SHA = '249970729cb0ef3589644e2896645e5dc5ba9c38';
const UPLOAD_ACTION_SHA = 'ea165f8d65b6e75b540449e92b4886f43607fa02';

function releaseInput(overrides = {}) {
  const version = overrides.pkg?.version || '0.2.0';
  const tag = `kdna-vscode-v${version}`;
  return {
    pkg: { name: 'kdna-vscode', publisher: 'aikdna', version, ...overrides.pkg },
    changelog: overrides.changelog ?? `# Changelog\n\n## ${version} (2026-07-20)\n`,
    env: {
      GITHUB_EVENT_NAME: 'release',
      RELEASE_EVENT_ACTION: 'published',
      RELEASE_TAG_NAME: tag,
      RELEASE_IS_DRAFT: 'false',
      RELEASE_IS_PRERELEASE: 'false',
      GITHUB_REF: `refs/tags/${tag}`,
      GITHUB_SHA: HASH,
      ...overrides.env,
    },
    git: { status: '', head: HASH, tagCommit: HASH, ...overrides.git },
  };
}

test('release context binds publisher, version, release, exact tag, ref, commit, and changelog', () => {
  assert.deepEqual(validateReleaseContext(releaseInput()), {
    name: 'kdna-vscode',
    publisher: 'aikdna',
    version: '0.2.0',
    tag: 'kdna-vscode-v0.2.0',
    ref: 'refs/tags/kdna-vscode-v0.2.0',
    commit: HASH,
  });

  for (const candidate of [
    releaseInput({ pkg: { publisher: 'other' } }),
    releaseInput({ pkg: { version: '0.2.0-preview.1' } }),
    releaseInput({ env: { GITHUB_EVENT_NAME: 'workflow_dispatch' } }),
    releaseInput({ env: { RELEASE_TAG_NAME: 'v0.2.0' } }),
    releaseInput({ env: { RELEASE_IS_DRAFT: 'true' } }),
    releaseInput({ env: { RELEASE_IS_PRERELEASE: 'true' } }),
    releaseInput({ env: { GITHUB_REF: 'refs/heads/main' } }),
    releaseInput({ env: { GITHUB_SHA: 'b'.repeat(40) } }),
    releaseInput({ git: { status: '?? candidate.vsix' } }),
    releaseInput({ git: { tagCommit: 'b'.repeat(40) } }),
    releaseInput({ changelog: '# Changelog\n\n## 0.1.0\n' }),
  ]) {
    assert.throws(() => validateReleaseContext(candidate));
  }
});

test('current package and changelog form one exact finalizable Marketplace coordinate', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  const changelog = fs.readFileSync(path.join(ROOT, 'CHANGELOG.md'), 'utf8');
  assert.equal(validateReleaseContext(releaseInput({ pkg, changelog })).version, '0.2.0');
});

test('public release status separates the published incumbent from the source candidate', () => {
  const readme = fs.readFileSync(path.join(ROOT, 'README.md'), 'utf8');
  assert.match(readme, /historical `0\.1\.0` incumbent/);
  assert.match(readme, /`0\.2\.0` remains unpublished/);
  assert.doesNotMatch(readme, /^The extension is not published to the VS Code Marketplace/m);
});

test('Marketplace workflow is release-only, pinned, and publishes only the retained VSIX', () => {
  const workflow = fs.readFileSync(path.join(ROOT, '.github/workflows/publish.yml'), 'utf8');
  assert.doesNotMatch(workflow, /workflow_dispatch|\n\s+push:/);
  assert.match(workflow, /release:\n\s+types: \[published\]/);
  assert.match(workflow, /github\.workflow.*github\.event\.release\.tag_name/);
  assert.match(workflow, /release:check/);
  assert.match(workflow, new RegExp(`actions/checkout@${CHECKOUT_ACTION_SHA}`));
  assert.match(workflow, new RegExp(`actions/setup-node@${SETUP_NODE_ACTION_SHA}`));
  assert.match(workflow, new RegExp(`actions/upload-artifact@${UPLOAD_ACTION_SHA}`));
  assert.match(workflow, /vsce package --out "\$KDNA_VSIX"/);
  assert.match(workflow, /vsce publish --packagePath "\$KDNA_VSIX"/);
  assert.match(workflow, /VSCE_PAT: \$\{\{ secrets\.VSCE_PAT \}\}/);
  assert.doesNotMatch(workflow, /(?:-p|--pat)\s+\$\{\{ secrets\./);
});

// Hostile CI gate tests — validate false-green regression detection
function validateCiWorkflow(content) {
  const failures = [];
  if (!content.includes('Build') || !content.includes('npm run build'))
    failures.push('Build step missing');
  if (!content.includes('Integration tests') || !content.includes('test:integration'))
    failures.push('Integration step missing');
  const buildIdx = content.indexOf('Build');
  const integIdx = content.indexOf('Integration tests');
  if (buildIdx < 0 || integIdx < 0 || buildIdx >= integIdx)
    failures.push('Build must precede Integration');
  if (content.includes('|| echo') || content.includes('|| true'))
    failures.push('|| echo/true bypass detected');
  if (content.includes('continue-on-error: true'))
    failures.push('continue-on-error bypass detected');
  return failures;
}

const currentCi = fs.readFileSync(path.join(ROOT, '.github/workflows/ci.yml'), 'utf8');
test('current CI passes false-green gate', () => {
  assert.deepEqual(validateCiWorkflow(currentCi), []);
});

test('integration runner disables GPU so macOS exits after the test host succeeds', () => {
  const runner = fs.readFileSync(path.join(ROOT, 'src/test/runTest.ts'), 'utf8');
  assert.match(
    runner,
    /launchArgs:\s*\['--disable-extensions',\s*'--disable-gpu'\]/,
  );
});

test('hostile: CI without Build step fails gate', () => {
  const ci = currentCi.replace(/- name: Build[\s\S]*?npm run build\n/, '');
  assert.ok(validateCiWorkflow(ci).some(x => x.includes('Build step missing')));
});

test('hostile: CI with Integration before Build fails gate', () => {
  const lines = currentCi.split('\n');
  const buildIdx = lines.findIndex(l => l.includes('name: Build'));
  const integIdx = lines.findIndex(l => l.includes('Integration tests'));
  if (buildIdx >= 0 && integIdx >= 0) {
    // Move Integration section before Build
    const integSection = '      - name: Dummy Integration tests\n        run: xvfb-run -a npm run test:integration\n';
    const withoutBuild = currentCi.replace(/- name: Build[\s\S]*?npm run build\n/, '');
    const ci = withoutBuild.replace(
      '- name: Integration tests (headless VS Code)\n        run: xvfb-run -a npm run test:integration\n',
      integSection + '- name: Build\n        run: npm run build\n');
    assert.ok(validateCiWorkflow(ci).some(x => x.includes('Build must precede')));
  }
});

test('hostile: CI with Integration || echo fails gate', () => {
  const ci = currentCi.replace(
    'xvfb-run -a npm run test:integration',
    'xvfb-run -a npm run test:integration || echo "failed"');
  assert.ok(validateCiWorkflow(ci).some(x => x.includes('|| echo')));
});

test('hostile: CI with Integration continue-on-error fails gate', () => {
  const ci = currentCi.replace(
    'xvfb-run -a npm run test:integration\n',
    'xvfb-run -a npm run test:integration\n        continue-on-error: true\n');
  assert.ok(validateCiWorkflow(ci).some(x => x.includes('continue-on-error')));
});
