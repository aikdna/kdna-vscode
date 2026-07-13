# KDNA Developer Tools for VS Code — Archived

This repository is archived and is not part of the current KDNA toolchain.
The extension was never published to the VS Code Marketplace.

Its implementation predates the single current CBOR payload contract and the
Runtime Capsule boundary. In particular, historical code in this repository
contains direct ZIP/project-view operations that must not be copied into an
Agent or application runtime. Current integrations must let KDNA Core/CLI own
container parsing, LoadPlan authorization, decryption, and projection.

Do not install or build this repository as a current KDNA adapter.

## Current tools

- [`@aikdna/kdna-cli`](https://github.com/aikdna/kdna-cli) — inspect,
  validate, plan-load, load, install, and explicit Cluster operations
- [`@aikdna/kdna-studio-cli`](https://github.com/aikdna/kdna-studio-cli) —
  create and export `.kdna` assets
- [`@aikdna/kdna-core`](https://github.com/aikdna/kdna) — JavaScript runtime
- [`kdna-core-swift`](https://github.com/aikdna/kdna-core-swift) — Swift runtime

Generate and consume a current demonstration through the official toolchain:

```bash
npm install -g @aikdna/kdna-cli
kdna demo judgment ./demo-judgment
kdna pack ./demo-judgment ./demo-judgment.kdna
kdna validate ./demo-judgment.kdna --runtime
kdna plan-load ./demo-judgment.kdna --json
kdna load ./demo-judgment.kdna --profile=compact --as=json
```

The Agent-facing result is a Runtime Capsule. Do not unpack or decode the
asset payload directly.

## Historical source

The source remains available only to preserve project history. It may be useful
for studying editor UI ideas, but its KDNA runtime and authoring behavior is
superseded. No fixes, releases, Marketplace publication, or compatibility
claims are planned from this repository.

## License

Apache-2.0 — see [LICENSE](LICENSE).
