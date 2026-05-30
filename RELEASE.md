# Release Guide

This file documents the release flow for UART Simulator Pro. Use `CHANGELOG.md` for product-facing release notes; use this file for the operational checklist.

## Current Release

- Version: `1.6.0`
- Tag: `v1.6.0`
- Release date: `2026-05-20`
- Update manifest: `latest.json`

## Pre-Release Checklist

1. Confirm the working tree only contains changes intended for the release.
2. Update `CHANGELOG.md` under `## [Unreleased]` with the completed work.
3. Run the validation suite:

```bash
npm run lint
npm test
npm run test:coverage
npx tsc --noEmit
npm run test:rust
npm run test:rust:coverage:summary
cargo check --manifest-path src-tauri/Cargo.toml
```

Notes:
- `npm run lint` ignores generated files under `src-tauri/target/**` to avoid linting Rust/Tauri build artifacts.

4. Build the application:

```bash
npm run build
npm run tauri:build
```

5. Smoke test the generated installer or bundle before publishing.

## Version Bump

The project has a release helper:

```bash
npm run release -- 1.6
```

The argument must be the `major.minor` base version. The script increments the patch number, then updates:

- `package.json`
- `src-tauri/Cargo.toml`
- `src-tauri/tauri.conf.json`
- `README.md`
- `CHANGELOG.md`
- `scripts/.release-counter.json`

It also creates a commit, creates a matching `vX.Y.Z` tag, and pushes `main` plus the tag to `origin`.

## Tauri Updater Manifest

After the signed desktop build is available, update `latest.json`:

```json
{
  "version": "1.6.0",
  "notes": "Short release summary.",
  "pub_date": "2026-05-20T00:00:00Z",
  "platforms": {
    "windows-x86_64": {
      "signature": "PASTE_SIGNATURE_FROM_BUILD_OUTPUT_HERE",
      "url": "https://github.com/mustafasercansak/uart/releases/download/v1.6.0/UART.Simulator_1.6.0_x64-setup.exe"
    }
  }
}
```

Replace the version, date, notes, signature, and artifact URL for each release.

## GitHub Release Checklist

1. Push the release tag if it was not pushed by the helper script:

```bash
git push origin main v1.6.0
```

2. Create a GitHub Release from the tag.
3. Upload the signed installer or platform bundle.
4. Verify that the download URL in `latest.json` matches the uploaded artifact name.
5. Publish `latest.json` wherever the Tauri updater expects to read it.
6. Test update discovery from an installed previous version.

## Rollback Notes

If a release artifact is broken, do not rewrite an already published tag. Publish a new patch version instead, update `CHANGELOG.md`, regenerate the updater manifest, and attach corrected artifacts to the new GitHub Release.
