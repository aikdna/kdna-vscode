# Legacy Source Tree Import

Status: Implementation Note
Normative: No

Legacy KDNA source trees contain top-level files such as `KDNA_Core.json` and
`KDNA_Patterns.json`. They are useful for editing and migration, but they are not
canonical runtime distribution assets.

Canonical runtime assets are exported by KDNA Studio or a Studio-compatible
compiler and use the runtime container shape defined by `aikdna/kdna`:

- `mimetype`
- `kdna.json`
- `payload.kdnab`
- `checksums.json`
- optional `signature.kdsig`

`kdna-vscode` may help users migrate or diagnose legacy source trees. It must
not silently install them as runtime assets.
