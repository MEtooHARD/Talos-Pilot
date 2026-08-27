#!/usr/bin/env node
/**
 * Manual CLI entry point for the SKPORT / Arknights: Endfield sign-in
 * automation. This is the thin, scriptable wrapper around src/core.js —
 * useful for testing by hand. The resident tray app (main.js) is what
 * actually runs this day to day; see README.md.
 *
 * Modes:
 *   node signin.js --login   Opens a real, visible browser window so you can
 *                            log in to SKPORT yourself. Once you can see
 *                            your daily sign-in calendar, come back to the
 *                            terminal and press Enter. Session gets saved
 *                            to state/storageState.json.
 *
 *   node signin.js           Reuses the saved session to load the real
 *                            sign-in page headlessly and claim today's
 *                            check-in if it hasn't been claimed yet.
 *
 * state/storageState.json holds your live login session. Treat it like a
 * password: never share it, never commit it to git, never paste it
 * anywhere (including to an AI assistant).
 */

const core = require('./src/core');
const config = require('./src/config');
const i18n = require('./src/i18n');
const { log } = require('./src/logger');

const cfg = config.load();
i18n.setLocale((cfg && cfg.language) || i18n.detectSystemLocale());

function waitForEnter() {
  return new Promise((resolve) => {
    process.stdin.resume();
    process.stdin.once('data', () => resolve());
  });
}

async function runLogin() {
  await core.login({
    onReady: () => {
      console.log(
        '\nA browser window has opened. Log in to SKPORT yourself, the normal way.\n' +
          'Once you can see your daily sign-in calendar, come back here and press Enter.\n'
      );
    },
    waitForContinue: waitForEnter,
  });
  log(`Login session saved to ${core.STATE_FILE}`);
}

async function runSignIn() {
  const result = await core.attemptSignIn();
  log(i18n.formatResult(result));
  if (['error', 'selector-not-found', 'no-session'].includes(result.status)) {
    process.exitCode = 1;
  }
}

(async () => {
  if (process.argv.includes('--login')) {
    await runLogin();
  } else {
    await runSignIn();
  }
  process.exit(process.exitCode || 0);
})();
