/**
 * VS Code extension test runner.
 * Downloads VS Code, launches it with the extension, and runs tests.
 */

import * as path from 'path';
import { runTests } from '@vscode/test-electron';

async function main() {
  try {
    const extensionDevelopmentPath = path.resolve(__dirname, '../../');
    const extensionTestsPath = path.resolve(__dirname, './suite/index');
    const launchArgs = ['--disable-extensions', '--disable-gpu'];
    if (process.platform === 'darwin') {
      // Chromium's test-only mock prevents Extension Host automation from
      // reading, creating, or repairing the user's macOS Keychain.
      launchArgs.push('--use-mock-keychain');
    }

    await runTests({
      extensionDevelopmentPath,
      extensionTestsPath,
      // Pin the integration runtime so CI and local evidence do not silently
      // move when the VS Code stable channel advances.
      version: '1.130.0',
      launchArgs,
    });
  } catch (err) {
    console.error('Failed to run tests:', err);
    process.exit(1);
  }
}

main();
