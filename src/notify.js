const path = require('path');
const os = require('os');
const notifier = require('node-notifier');
const i18n = require('./i18n');
const packaged = require('./packaged');

// node-notifier's Windows toaster resolves its bundled snoretoast.exe via
// its own __dirname, which resolves into pkg's virtual snapshot (not a
// real path) when packaged — a subprocess can't be spawned from that. Its
// `customPath` option is the documented escape hatch; only needed at all
// when actually packaged, since dev mode's __dirname is already real.
function windowsNotifierCustomPath() {
  if (!packaged.isPackaged || process.platform !== 'win32') return undefined;
  const fileName = `snoretoast-x${os.arch() === 'x64' ? '64' : '86'}.exe`;
  const snapshotPath = path.join(
    __dirname,
    '..',
    'node_modules',
    'node-notifier',
    'vendor',
    'snoreToast',
    fileName
  );
  return packaged.extractIfNeeded(snapshotPath, fileName);
}

/**
 * result is either a real core.js result ({status, params}) — in which
 * case the body text comes from i18n.formatResult() — or a synthetic one
 * with an explicit pre-localized `message` (used for main.js's 'crashed'
 * status, which core.js never actually produces).
 */
function send(result, callback) {
  const body = result.message || i18n.formatResult(result);
  const hint = i18n.tMaybe(`notify.hint.${result.status}`);
  const title = i18n.tMaybe(`notify.title.${result.status}`) || i18n.t('notify.title.default');
  const customPath = windowsNotifierCustomPath();
  notifier.notify(
    {
      title,
      message: hint ? `${body}\n${hint}` : body,
      sound: true,
      wait: false,
      ...(customPath ? { customPath } : {}),
    },
    callback
  );
}

module.exports = {
  // Every notification this app ever sends — a claim attempt's result
  // (success, already-claimed, or failure alike, whether triggered
  // automatically or by a manual "Claim now" click) or an app crash — goes
  // through this one function. Which attempts actually get notified is
  // scheduler.js's call, not this module's.
  send,
};
