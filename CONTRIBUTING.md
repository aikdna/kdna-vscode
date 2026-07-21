# Contributing to KDNA VS Code Extension

This repository is the KDNA VS Code extension — a tool for validating, previewing, and packaging KDNA domains directly in your editor.

For protocol-level guidance (schema, spec, judgment patterns), see the [main KDNA CONTRIBUTING.md](https://github.com/aikdna/kdna/blob/main/CONTRIBUTING.md).

## Development Setup

```bash
git clone https://github.com/aikdna/kdna-vscode.git
cd kdna-vscode
npm install
npm run compile
```

## Running Tests

```bash
npm test
```

## Extension Features

- **Validation**: Real-time `kdna validate` feedback in the editor
- **Preview**: Render judgment cards and axiom trees inline
- **Pack**: Package .kdna files from the editor sidebar
- **IntelliSense**: Schema-aware autocomplete for KDNA JSON files

## Pull Request Process

1. Open an issue describing the feature or bug fix
2. Fork the repo and create a branch
3. Ensure tests pass: `npm test`
4. Add tests for new functionality
5. Submit a PR against the `main` branch

## Code Style

- TypeScript throughout
- Follow existing patterns in `src/`
- Extension tests use the VS Code testing API

## License

- Code: Apache 2.0
- Documentation: CC BY 4.0
