/**
 * Single source of truth for the workspace-attachment CLI contract.
 *
 * The extension fails closed against any CLI version other than the exact
 * published version below, and parses only the exact record schema the pinned
 * CLI emits. Do not duplicate these values in README, package.json,
 * CHANGELOG, or test fixtures — scripts/check-workspace-cli-contract.mjs
 * verifies every public surface against this file.
 */
export const WORKSPACE_CLI_VERSION = '0.36.1';
export const WORKSPACE_CLI_RECORD_SCHEMA_VERSION = '0.3.0';
