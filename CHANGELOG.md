# Changelog

## 0.2.0 (2026-07-20)

- Route packaged `.kdna` inspection and loading through KDNA Core
  `inspect → planLoad → load` and consume only Runtime Capsules.
- Remove direct ZIP/payload consumption and the unused JSZip runtime
  dependency.
- Bind the unpublished extension candidate to the exact merged KDNA Core
  `0.21.0` source at `76bbc587ce05f7e575c2373832cc5c9eee9df98a`;
  the candidate tar is excluded from VSIX output.
- Surface Core's compact-projection omission status, paths, and counts in the
  editor preview instead of hiding a partial projection.
- Keep source-project diagnostics separate from packaged Runtime validation,
  escape preview rendering, and add compile, lint, and unit coverage for
  blocked LoadPlans and Capsule delivery.

This is an unpublished Development Preview candidate. No Marketplace package
or existing release is changed.

## 2026-05-30
- Updated unit tests to allow KDNA_CARD.json and reports/ entries
- Fixed CI: npm ci for dependency install

## 2026-05-25
- Initial release: KDNA domain validation, preview, and dev source workspace management
