#!/usr/bin/env node
/**
 * Entry point. First run: opens the settings UI in your browser (login,
 * schedule window, autostart) — no terminal involved. After that: starts
 * the resident tray app, which schedules and runs the daily sign-in
 * itself; the same settings UI reopens any time from the tray's
 * "Settings..." item. See README.md for what this does and doesn't touch.
 */
// pkg's Node builds have V8 Inspector support patched out entirely (this
// is true for every target — confirmed by pkg's own build log patching
// src/inspector_agent.cc regardless of Node version, not a node22-specific
// gap). playwright-core unconditionally imports `inspector` as part of its
// Page module's init (only actually used for an optional profiler path we
// never trigger, and a harmless "is a debugger attached" check) — without
// this stub, just creating a page would crash the whole packaged app. Only
// applied when actually packaged: dev mode has real inspector support, and
// this would otherwise mask genuine `node --inspect` debugging.
if (require('./src/packaged').isPackaged) {
  const Module = require('module');
  const originalLoad = Module._load;
  Module._load = function (request, ...rest) {
    if (request === 'inspector' || request === 'node:inspector') {
      return {
        url: () => undefined,
        Session: class {
          connect() {}
          post(_event, cb) {
            if (typeof cb === 'function') cb();
          }
          disconnect() {}
          on() {}
        },
      };
    }
    return originalLoad.call(this, request, ...rest);
  };
}

const config = require('./src/config');
const core = require('./src/core');
const webui = require('./src/webui');
const { startTray } = require('./src/tray');
const notify = require('./src/notify');
const i18n = require('./src/i18n');
const { log } = require('./src/logger');

// Diagnostics: once launched via the hidden autostart path there's no
// console anyone will ever see, so anything worth knowing about an
// unexpected exit needs to go through the persistent logger (and, for a
// real crash, a notification) — not just console.log/console.error.
let trayHandle = null;
for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP', 'SIGBREAK']) {
  process.on(sig, () => {
    log(`Received ${sig} — exiting.`);
    if (trayHandle) trayHandle.stop();
    process.exit(0);
  });
}
process.on('exit', (code) => {
  if (code !== 0) log(`Process exiting with code ${code}.`);
});
process.on('uncaughtException', (err) => {
  log(`Uncaught exception — the app is about to crash: ${err.stack || err}`);
  // notify.failure() spawns its toast helper asynchronously — exiting
  // immediately after calling it risks killing the process before the
  // notification actually gets sent. Wait for it (with a safety-net
  // timeout in case something's wrong with the notifier itself).
  notify.failure({ status: 'crashed', message: i18n.t('main.crashed_message') }, () => process.exit(1));
  setTimeout(() => process.exit(1), 3000);
});

function applyLocale() {
  const cfg = config.load();
  i18n.setLocale((cfg && cfg.language) || i18n.detectSystemLocale());
}

async function main() {
  applyLocale();

  // Start the tray immediately, even before first-run setup is done — the
  // icon appearing (and tray.js turning it orange via its own
  // setup-incomplete check) is itself confirmation that the app installed
  // and is running, rather than making the user wait through the whole
  // login/setup flow before seeing anything at all.
  trayHandle = startTray({ onQuit: () => process.exit(0) });
  log(i18n.t('main.running'));

  const needsSetup = !config.load() || !core.hasSavedSession();
  if (needsSetup) {
    await webui.openSettingsUI();
    applyLocale(); // setup may have chosen/changed the language
    // The tray was built with whatever locale was active before setup
    // finished, and its icon may have started in the "warning" state —
    // push both up to date now rather than waiting for the next scheduler
    // tick (up to 60s away) to notice on its own.
    trayHandle.refreshMenuLabels();
    trayHandle.refreshStatus();
  }
}

main().catch((err) => {
  log(`Fatal error during startup: ${err.stack || err}`);
  process.exitCode = 1;
});
