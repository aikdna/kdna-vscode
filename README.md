# KDNA Protocol Tools for VS Code

VS Code extension for creating, validating, previewing, and managing KDNA domain judgment packages. Part of the [KDNA Protocol](https://github.com/aikdna/kdna) ecosystem — the open judgment protocol for AI systems.

## What is KDNA?

KDNA is an open judgment protocol for AI systems. It turns human-governed domain judgment into portable structural assets that AI agents can load, trace, verify, and evolve.

## What this extension does

- **Validate** KDNA domain files with real-time diagnostics
- **Preview** domain structure in an interactive webview panel
- **Pack/Unpack** `.kdna` container files
- **Create** new domains from built-in templates
- **Diagnose** issues with banned term highlighting, ontology hovers, and cross-file checks

## Quick Demo

```bash
# Install the extension
code --install-extension aikdna.kdna-vscode

# Open a KDNA domain directory
# Use Cmd+Shift+P → "KDNA: Validate Domain"
# View results in the Problems panel
```

## Features

| Feature | Status | Notes |
|---------|:------:|-------|
| Validate | Beta | Real-time diagnostics as you edit KDNA JSON files |
| Preview | Beta | Webview panel showing rendered domain structure |
| Pack/Unpack | Beta | Create and extract `.kdna` container files |
| Create | Beta | Scaffold new domains from templates |
| Diagnostics | Beta | Banned term highlighting, ontology concept hovers, cross-file consistency checks |
| Studio Project | Planned | Support for `studio.project.json` and Judgment Cards |
| Multi-language | Planned | Locale-aware card editing |

## Commands

| Command | Description |
|---------|-------------|
| `KDNA: Validate Domain` | Run structure, trust, and judgment checks |
| `KDNA: Pack Domain` | Bundle domain into a `.kdna` container |
| `KDNA: Unpack .kdna` | Extract a `.kdna` container |
| `KDNA: Preview Domain` | Open interactive domain preview |
| `KDNA: Install Domain` | Install a domain from the registry |
| `KDNA: Create New Domain` | Scaffold a new domain from template |

## Supported File Types

- `KDNA_Core.json` — Domain axioms, ontology, causal structure
- `KDNA_Patterns.json` — Terminology rules, banned terms, self-checks
- `KDNA_Scenarios.json` — Scenario-triggered strategy shifts
- `KDNA_Cases.json` — Concrete judgment cases
- `KDNA_Reasoning.json` — Reasoning chains
- `KDNA_Evolution.json` — Capability stages and evolution path
- `KDNA_Cluster.json` — Domain cluster manifests
- `.kdna` — Packaged domain containers

## Requirements

- VS Code 1.85+
- [`@aikdna/kdna-cli`](https://github.com/aikdna/kdna-cli) for validate/pack operations

## Related

- [KDNA Protocol](https://github.com/aikdna/kdna) — Protocol specification
- [KDNA CLI](https://github.com/aikdna/kdna-cli) — CLI runtime
- [KDNA Studio Core](https://github.com/aikdna/kdna-studio-core) — Authoring kernel
- [aikdna.com](https://aikdna.com) — Website

## License

Apache-2.0
