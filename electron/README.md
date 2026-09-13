# Electron desktop shell

`main.cjs` starts the Chorus Express/WebSocket server in-process and opens a BrowserWindow to `http://127.0.0.1:8787`.

## Build Windows locally

```bash
npm run electron:build
# artifacts in release/Chorus-*-x64.exe and Chorus-*-x64-portable.exe
```

## GitHub Actions

The release workflow lives at `electron/ci-release-windows.yml` (kept outside `.github/workflows/` until the pushing token has the `workflow` OAuth scope).

To enable automatic Releases on `v*` tags:

```bash
gh auth refresh -h github.com -s repo,workflow
mkdir -p .github/workflows
cp electron/ci-release-windows.yml .github/workflows/release-windows.yml
git add .github/workflows/release-windows.yml
git commit -m "Add Windows release GitHub Actions workflow"
git push
```
