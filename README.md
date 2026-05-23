# KDNA for VS Code

VS Code extension for creating, validating, previewing, and packaging KDNA domain cognition files.

## Feature Status

| Feature | Status | Notes |
|---------|:------:|-------|
| Validate | ✅ Beta | Real-time diagnostics as you edit KDNA JSON files |
| Preview | ✅ Beta | Webview panel showing rendered domain structure |
| Pack/Unpack | ✅ Beta | Create and extract `.kdna` container files |
| Create | ✅ Beta | Scaffold new domains from templates |
| Diagnostics | ✅ Beta | Banned term highlighting, ontology concept hovers, cross-file consistency checks |
| Studio Project | 🔲 Planned | Support for `studio.project.json` and Judgment Cards |
| Multi-language | 🔲 Planned | Locale-aware card editing |

Requires `@aikdna/kdna-cli` for validate/pack operations.

## Install

```
code --install-extension aikdna.kdna-vscode
```

## Verify

```bash
kdna validate ./my-domain   # Validate a domain directory
kdna pack ./my-domain       # Pack into .kdna container
```

## Related

- [KDNA Studio Core](https://github.com/knowledge-dna/kdna-studio) — Authoring kernel
- [kdna-cli](https://github.com/knowledge-dna/kdna-cli) — CLI runtime
- [aikdna.com](https://aikdna.com)

## License

Apache-2.0
