# How to release

## Prerequisites

- `package.json` has `"repository": "github:CarbonSiliconAI/aios"` so electron-updater finds releases.
- **No secret needed**: the workflow uses GitHub’s built-in `GITHUB_TOKEN` with `contents: write` to publish releases.
- Tag push triggers the workflow.

## Stable release

```bash
git tag v1.2.3
git push --tags
```

CI builds macOS and Windows installers and publishes them to GitHub Releases as the **latest** release (non-prerelease). Users on the **Stable** channel receive this update.

## Beta release

```bash
git tag v1.2.3-beta.1
git push --tags
```

CI builds macOS and Windows installers, publishes to GitHub Releases, and marks the release as **prerelease**. Users on the **Beta** channel receive this update.

## Local build (no publish)

```bash
npm install
npm run build:server
npm run dist        # current platform, no upload
npm run dist:mac    # macOS only
npm run dist:win    # Windows only
```

## Channels

- **Stable**: `autoUpdater` uses `channel: 'latest'`; only non-prerelease GitHub releases.
- **Beta**: `autoUpdater` uses `channel: 'beta'` and `allowPrerelease: true`; only prerelease GitHub releases.

Users switch channel in **Settings → Updates** (Stable / Beta). The choice is stored in `userData/settings.json`.
