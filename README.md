# KDNA Core VS Code Extension

[![CI](https://github.com/aikdna/kdna-vscode/actions/workflows/ci.yml/badge.svg)](https://github.com/aikdna/kdna-vscode/actions/workflows/ci.yml) [![License](https://img.shields.io/badge/license-Apache%202.0-blue)](LICENSE)

VS Code extension for validating, previewing, and managing KDNA project views.
It is part of the KDNA toolchain for developers working with `.kdna` assets.

`.kdna` files are the canonical KDNA assets. This extension is a developer tool
for editing and diagnosing expanded project views. It is not the primary
runtime loading path; packaged `.kdna` files should still be validated and
plan-loaded through the KDNA CLI/Core toolchain.

A `.kdna` asset is created by an authoring pipeline that validates,
canonicalizes, computes digests, records metadata, and exports a packaged
runtime file.

## What is KDNA?

KDNA Core is the open `.kdna` judgment-asset file format, schemas, JS Core, and
runtime loading contract.

## What this extension does

- **Validate** KDNA project-view files with real-time diagnostics
- **Preview** project-view structure in an interactive webview panel
- **Bundle/inspect** dev-only files through the CLI
- **Create** expanded project views from built-in templates
- **Diagnose** issues with banned term highlighting, ontology hovers, and cross-file checks
- **Call** `kdna validate` and `kdna plan-load` for runtime diagnostics

## Quick Demo

```bash
# Install the extension
code --install-extension aikdna.kdna-vscode

# Open a KDNA project view
# Use Cmd+Shift+P → "KDNA: Validate Domain"
# View results in the Problems panel
```

## Features

| Feature | Status | Notes |
|---------|:------:|-------|
| Validate | Beta | Real-time diagnostics as you edit KDNA project-view files |
| Preview | Beta | Webview panel showing rendered source structure |
| Bundle/Inspect | Beta | Create dev-only bundles and inspect `.kdna` assets through the CLI |
| Create | Beta | Scaffold new project views from templates |
| Diagnostics | Beta | Banned term highlighting, ontology concept hovers, cross-file consistency checks |

## Commands

| Command | Description |
|---------|-------------|
| `KDNA: Validate Domain` | Validate the current project view |
| `KDNA: Bundle Dev Source` | Build a diagnostic `.kdna` bundle |
| `KDNA: Unpack .kdna` | Developer-only extraction for inspection/debugging |
| `KDNA: Preview Domain` | Open interactive source preview |
| `KDNA: Create Dev Source Workspace` | Scaffold a new project view from template |

## Supported File Types

- `KDNA_Core.json` — Domain axioms, ontology, causal structure
- `KDNA_Patterns.json` — Terminology rules, banned terms, self-checks
- `KDNA_Scenarios.json` — Scenario-triggered strategy shifts
- `KDNA_Cases.json` — Concrete judgment cases
- `KDNA_Reasoning.json` — Reasoning chains
- `KDNA_Evolution.json` — Capability stages and evolution path
- `KDNA_Cluster.json` — Domain cluster manifests
- `.kdna` — Canonical KDNA asset files

## Requirements

- VS Code 1.85+
- [`@aikdna/kdna-cli`](https://github.com/aikdna/kdna-cli) for validate, inspect, `plan-load`, and dev-only bundle operations

## Runtime Boundary

This extension is a project-view editor and diagnostics surface. It must not
implement license, entitlement, crypto, SecretStore, LoadPlan, or runtime
projection policy. Runtime truth comes from `aikdna/kdna`, `kdna-cli`, and
conforming Core implementations.

See [docs/ROLE.md](docs/ROLE.md).

## Related

- [KDNA Core](https://github.com/aikdna/kdna) — Official format specification
- [KDNA CLI](https://github.com/aikdna/kdna-cli) — CLI runtime
- [KDNA Studio Core](https://github.com/aikdna/kdna-studio-core) — Authoring kernel
- [aikdna.com](https://aikdna.com) — Website

## License

Apache-2.0
