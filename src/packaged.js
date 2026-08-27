/**
 * Shared helpers for running from a pkg-packaged executable rather than
 * plain `node main.js`. Packaged assets live in pkg's virtual snapshot
 * filesystem (readable via fs, but not a real path — see
 * https://yao-pkg.github.io/pkg/guide/snapshot-fs), which is a problem
 * specifically for anything spawned as a subprocess (systray2's tray
 * helper, node-notifier's toast helper): a subprocess needs a real file on
 * disk. This module extracts such files to a real, always-writable
 * per-user location on first use.
 */
const fs = require('fs');
const path = require('path');

const isPackaged = !!process.pkg;

/**
 * Where persistent, writable app data (config.json, signin.log, state/)
 * lives. __dirname resolves into pkg's read-only virtual snapshot when
 * packaged — writes there fail silently-ish (ENOENT/EROFS depending on the
 * call) — so packaged mode uses the exe's own real directory instead,
 * keeping everything visible in one self-contained folder (matching dev
 * mode's convention of "it's all in the project folder", just anchored to
 * the exe's folder instead of the source folder).
 */
function appRoot() {
  return isPackaged ? path.dirname(process.execPath) : path.join(__dirname, '..');
}

function extractedAssetsDir() {
  const base = process.env.LOCALAPPDATA || require('os').tmpdir();
  return path.join(base, 'TalosAutopilot', 'extracted');
}

/** Copies snapshotPath (inside the packaged exe) out to a real path, once — reused on subsequent calls/launches. */
function extractIfNeeded(snapshotPath, fileName) {
  const realPath = path.join(extractedAssetsDir(), fileName);
  fs.mkdirSync(path.dirname(realPath), { recursive: true });
  if (!fs.existsSync(realPath)) {
    fs.copyFileSync(snapshotPath, realPath);
  }
  return realPath;
}

module.exports = { isPackaged, appRoot, extractedAssetsDir, extractIfNeeded };
