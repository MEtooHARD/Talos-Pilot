/**
 * Core SKPORT / Arknights: Endfield daily sign-in automation.
 *
 * This module has no opinion about *when* it runs or how failures are
 * surfaced to the user — that's the scheduler's and notifier's job. It just
 * does the browser work and returns a plain, language-independent result:
 *
 *   { status: 'claimed' | 'already-signed-in' | 'session-expired'
 *              | 'selector-not-found' | 'no-session' | 'error',
 *     params?: object }
 *
 * No message strings here — callers turn {status, params} into display
 * text via i18n.formatResult(), so this module doesn't need to know or
 * care what language the user picked.
 */

const { chromium } = require('playwright-core');
const fs = require('fs');
const path = require('path');
const packaged = require('./packaged');

const ROOT_DIR = packaged.appRoot();
const SIGNIN_URL =
  'https://game.skport.com/endfield/sign-in?header=0&hg_media=skport&hg_link_campaign=tools';
const STATE_DIR = path.join(ROOT_DIR, 'state');
const STATE_FILE = path.join(STATE_DIR, 'storageState.json');

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// A Playwright call against a page that's ended up in some unusual state
// (e.g. sitting on a blocked/cross-origin page after an aborted login
// attempt) can, in practice, sometimes just never settle rather than
// rejecting outright — no error, no timeout of its own. Wrapping the two
// calls after "I'm logged in" is clicked (session capture, browser close)
// with this turns a silent hang into a real, catchable error instead.
function withTimeout(promise, ms, message) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error(message)), ms)),
  ]);
}

// SKPORT's daily reset is UTC+8 ("*Sign-in times are based on UTC+8" per the
// page itself), independent of wherever this machine's local clock is set.
function utc8Now() {
  return new Date(Date.now() + 8 * 60 * 60 * 1000);
}

// e.g. "2026-08-26" — a stable key for "which UTC+8 day is it right now".
function utc8DateString() {
  const d = utc8Now();
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// Every label the site's own language switcher can show (confirmed live from
// its dropdown). attemptSignIn() below text-matches English strings like
// "Day N" and "Log in" — those only appear when the site is actually
// displaying English, which depends on the visiting browser/account's saved
// preference, not anything we control. Forcing English here first is what
// keeps those matches working regardless of what a real user last picked
// (e.g. the site shows "第27天" instead of "Day 27" in Chinese).
const SITE_LANGUAGE_NAMES = [
  '简体中文', '繁體中文', 'Deutsch', 'English', 'Español', 'Français',
  'Indonesia', 'Italiano', '日本語', '한국어', 'Português', 'Русский',
  'ภาษาไทย', 'Tiếng Việt',
];

async function ensureEnglishUI(page) {
  try {
    const switcher = page
      .getByText(new RegExp(`^(${SITE_LANGUAGE_NAMES.join('|')})$`))
      .first();
    const current = await switcher.textContent({ timeout: 3000 }).catch(() => null);
    if (!current || current.trim() === 'English') return;
    await switcher.click();
    await page.getByText('English', { exact: true }).click({ timeout: 3000 });
    await sleep(500);
  } catch {
    // Best-effort — if the switcher isn't where we expect, fall through and
    // let the (English-only) text matches below fail with their normal,
    // already-handled 'selector-not-found' outcome rather than throwing.
  }
}

// Prefer the user's real, already-installed browser — no bundled Chromium
// download, and it looks like a normal browsing session rather than a
// fingerprint-able automation-only binary. Try Chrome first (most common
// among PC gamers), then Edge (ships on every Windows PC, so it's always a
// working fallback).
async function launchRealBrowser(opts) {
  for (const channel of ['chrome', 'msedge']) {
    try {
      return await chromium.launch({ ...opts, channel });
    } catch {
      /* try the next channel */
    }
  }
  throw new Error(
    'Could not find an installed Chrome or Edge to drive. Please install one of those browsers.'
  );
}

/**
 * Opens a real, visible browser window so the user can log in to SKPORT
 * themselves (password / QR / whatever they normally use — this code never
 * sees or handles credentials). Resolves once the session is saved.
 *
 * `onReady` is called with a short instruction string once the browser is
 * open, before waiting for `waitForContinue` to resolve (the caller decides
 * how the user signals "I'm logged in now" — a console Enter-press today,
 * potentially a button in a future GUI).
 */
async function login({ onReady, waitForContinue }) {
  fs.mkdirSync(STATE_DIR, { recursive: true });
  // A brief pause before the window actually appears — the Settings page
  // already switched to "opening a browser window..." the moment this
  // started, so this gives that a beat to actually be read before the
  // popup lands, rather than both happening in the same instant.
  await sleep(2000);
  const browser = await launchRealBrowser({ headless: false });
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(SIGNIN_URL);
  // Windows' focus-stealing prevention means a newly launched window from
  // a background process (that's us — there's no foreground window of our
  // own to inherit permission from) often just flashes in the taskbar
  // instead of actually coming to front, which is confusing right when
  // the Settings page is telling the user to go look for it. bringToFront
  // asks the browser to activate its own window, which Windows generally
  // allows since Chrome/Edge is doing it to itself.
  await page.bringToFront().catch(() => {});

  if (onReady) onReady();
  await waitForContinue();

  try {
    await withTimeout(context.storageState({ path: STATE_FILE }), 15000, 'Saving the login session timed out.');
  } finally {
    // Always try to close the browser, even if saving the session above
    // failed or timed out — an orphaned automation-controlled browser
    // window left running is its own kind of stuck state, and this is the
    // one place left that can prevent it. Its own failure is swallowed on
    // purpose so it never masks whatever storageState() threw above.
    await withTimeout(browser.close(), 10000, 'Closing the browser timed out.').catch(() => {});
  }
}

function hasSavedSession() {
  return fs.existsSync(STATE_FILE);
}

/**
 * Runs one sign-in attempt headlessly using the saved session. Never
 * throws for expected outcomes (already signed in, expired session,
 * selector miss) — those come back as a status instead, so callers can
 * decide how to surface them (log line, tray tooltip, toast notification)
 * without needing to know this module's internals.
 */
async function attemptSignIn() {
  if (!hasSavedSession()) {
    return { status: 'no-session' };
  }

  const browser = await launchRealBrowser({ headless: true });
  const context = await browser.newContext({ storageState: STATE_FILE });
  const page = await context.newPage();

  // Read the real GET /attendance response instead of guessing from the DOM.
  let attendanceInfo = null;
  page.on('response', async (res) => {
    if (
      res.request().method() === 'GET' &&
      res.url().endsWith('/web/v1/game/endfield/attendance')
    ) {
      try {
        const json = await res.json();
        attendanceInfo = json && json.data ? json.data : null;
      } catch {
        /* ignore parse errors on unrelated/empty responses */
      }
    }
  });

  try {
    await page.goto(SIGNIN_URL, { waitUntil: 'networkidle', timeout: 30000 });

    // Give the account SDK a moment to resolve login state and fire its
    // status calls.
    await sleep(2000 + Math.random() * 3000);

    await ensureEnglishUI(page);

    const loginPrompt = page.getByText(/log ?in/i).first();
    if (await loginPrompt.isVisible().catch(() => false)) {
      return { status: 'session-expired' };
    }

    if (attendanceInfo && attendanceInfo.hasToday) {
      return { status: 'already-signed-in' };
    }

    // Small human-ish pause before interacting with the page.
    await sleep(1000 + Math.random() * 2000);

    // The calendar only renders a trailing window of already-claimed days
    // by default — confirmed live that e.g. "Day 1" doesn't exist in the
    // DOM at all until this is expanded, not just hidden via CSS. For an
    // account with little/no history this month, today's own tile can fall
    // outside that default window entirely. ensureEnglishUI() already ran
    // above, so this is always in English by the time we get here.
    const expandRewards = page.getByText('Show All Rewards', { exact: false }).first();
    if (await expandRewards.isVisible().catch(() => false)) {
      await expandRewards.click();
      await sleep(500);
    }

    // The page has no real ARIA roles at all (confirmed live: it's a React
    // app with plain divs and delegated click handlers, not semantic
    // buttons/links) — target today's reward tile by its visible "Day N"
    // label instead, using the UTC+8 day-of-month (the site's own reset
    // clock — see the "*Sign-in times are based on UTC+8" note on the page).
    const todayLabel = `Day ${utc8Now().getUTCDate()}`;
    const todayTile = page.getByText(new RegExp(`^${todayLabel}$`)).first();

    if (await todayTile.count()) {
      await todayTile.click();
      await sleep(2000);
      return { status: 'claimed', params: { dayLabel: todayLabel } };
    }

    return { status: 'selector-not-found', params: { dayLabel: todayLabel } };
  } catch (err) {
    return { status: 'error', params: { detail: err.message } };
  } finally {
    await browser.close();
  }
}

module.exports = {
  SIGNIN_URL,
  STATE_FILE,
  hasSavedSession,
  login,
  attemptSignIn,
  utc8Now,
  utc8DateString,
};
