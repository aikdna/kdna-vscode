# KDNA Protocol Tools for VS Code

[![CI](https://github.com/aikdna/kdna-vscode/actions/workflows/ci.yml/badge.svg)](https://github.com/aikdna/kdna-vscode/actions/workflows/ci.yml) [![License](https://img.shields.io/badge/license-Apache%202.0-blue)](LICENSE)

VS Code extension for validating, previewing, and managing KDNA developer source workspaces. Part of the [KDNA Protocol](https://github.com/aikdna/kdna) ecosystem — the open judgment protocol for AI systems.

`.kdna` files are the canonical KDNA assets. This extension is a developer tool
for editing and diagnosing non-canonical dev source workspaces. It is not a
canonical authoring authority. Trusted `.kdna` assets must be exported by KDNA
Studio or a Studio-compatible compiler with authoring provenance and Human Lock
evidence.

A `.kdna` asset is not created by writing JSON files. It is compiled by a
Studio-compatible authoring pipeline that performs human confirmation,
validation, canonicalization, identity generation, digest computation, signing,
optional encryption, and provenance recording.

## What is KDNA?

KDNA is an open judgment protocol for AI systems. It turns human-governed domain judgment into portable structural assets that AI agents can load, trace, verify, and evolve.

## What this extension does

- **Validate** KDNA dev source files with real-time diagnostics
- **Preview** dev source structure in an interactive webview panel
- **Bundle/inspect** dev-only `.kdna` files through the CLI
- **Create** non-canonical dev source workspaces from built-in templates
- **Diagnose** issues with banned term highlighting, ontology hovers, and cross-file checks

## Quick Demo

```bash
# Install the extension
code --install-extension aikdna.kdna-vscode

# Open a KDNA dev source workspace
# Use Cmd+Shift+P → "KDNA: Validate Domain"
# View results in the Problems panel
```

## Features

| Feature | Status | Notes |
|---------|:------:|-------|
| Validate | Beta | Real-time diagnostics as you edit KDNA source JSON files |
| Preview | Beta | Webview panel showing rendered source structure |
| Bundle/Inspect | Beta | Create dev-only bundles and inspect `.kdna` assets through the CLI |
| Create | Beta | Scaffold new dev source workspaces from templates |
| Diagnostics | Beta | Banned term highlighting, ontology concept hovers, cross-file consistency checks |
| Studio Project | Planned | Support for `studio.project.json` and Judgment Cards |
| Multi-language | Planned | Locale-aware card editing |

## Commands

| Command | Description |
|---------|-------------|
| `KDNA: Validate Domain` | Validate the current dev source workspace |
| `KDNA: Bundle Dev Source` | Build a dev-only non-trusted `.kdna` bundle |
| `KDNA: Unpack .kdna` | Developer-only extraction for inspection/debugging |
| `KDNA: Preview Domain` | Open interactive source preview |
| `KDNA: Install Domain` | Install a `.kdna` asset from the registry |
| `KDNA: Create Dev Source Workspace` | Scaffold a new dev source workspace from template |

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
- [`@aikdna/kdna-cli`](https://github.com/aikdna/kdna-cli) for validate, inspect, and dev-only bundle operations

## Related

- [KDNA Protocol](https://github.com/aikdna/kdna) — Protocol specification
- [KDNA CLI](https://github.com/aikdna/kdna-cli) — CLI runtime
- [KDNA Studio Core](https://github.com/aikdna/kdna-studio-core) — Authoring kernel
- [aikdna.com](https://aikdna.com) — Website

## License

Apache-2.0
