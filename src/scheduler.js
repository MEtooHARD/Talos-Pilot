/**
 * Resident scheduler: picks one random moment inside the user's chosen
 * daily time window, waits for it, and runs the actual sign-in attempt at
 * that time. Runs as a periodic tick rather than one long setTimeout so it
 * stays correct across sleep/hibernate (which can silently skew timers).
 */

const fs = require('fs');
const path = require('path');
const core = require('./core');
const config = require('./config');
const notify = require('./notify');
const { log } = require('./logger');
const i18n = require('./i18n');
const packaged = require('./packaged');

const STATE_FILE = path.join(packaged.appRoot(), 'state', 'scheduler-state.json');
const CHECK_INTERVAL_MS = 60 * 1000;
const RETRY_DELAY_MS = 45 * 60 * 1000;

function loadState() {
  try {
    return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
  } catch {
    return null;
  }
}

function saveState(state) {
  fs.mkdirSync(path.dirname(STATE_FILE), { recursive: true });
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2) + '\n');
}

// Shared by both modes: if the target moment has already passed (the
// window/reset already happened today, or the app just started up late),
// don't wait a whole extra day — attempt soon instead, with a small random
// delay so it isn't suspiciously instantaneous.
function soonIfPast(target, now) {
  if (target.getTime() <= now.getTime()) {
    return new Date(now.getTime() + (2 + Math.random() * 8) * 60 * 1000);
  }
  return target;
}

// "Today" here means the current UTC+8 calendar day (core.utc8DateString()'s
// day), converted back to a real absolute instant — comparable directly
// against Date.now() regardless of this machine's own timezone.
function asapResetTimeToday(asapTimeUtc8) {
  const [hour, minute] = asapTimeUtc8.split(':').map(Number);
  const d = core.utc8Now();
  const resetUtcMs = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), hour, minute, 0, 0) - 8 * 60 * 60 * 1000;
  return new Date(resetUtcMs);
}

function pickTargetTime(cfg) {
  const now = new Date();
  if (cfg.mode === 'asap') {
    return soonIfPast(asapResetTimeToday(cfg.asapTimeUtc8), now);
  }
  const start = config.timeToMinutes(cfg.windowStart);
  const end = config.timeToMinutes(cfg.windowEnd);
  const pickMinutes = start + Math.floor(Math.random() * (end - start + 1));
  const seconds = Math.floor(Math.random() * 60);
  const target = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
    Math.floor(pickMinutes / 60),
    pickMinutes % 60,
    seconds,
    0
  );
  return soonIfPast(target, now);
}

function freshStateForToday(today, cfg) {
  return {
    utc8Date: today,
    scheduledAt: pickTargetTime(cfg).toISOString(),
    attempted: false,
    notifiedForDate: false,
    lastStatus: null,
    lastMessage: null,
    lastAttemptAt: null,
  };
}

/**
 * `alwaysNotify` is for a manually-triggered "Claim now": both it and the
 * background scheduler notify for every outcome alike (an actual claim
 * succeeding or failing, or a real problem like an expired session) — with
 * one quiet exception. core.js can determine "already claimed" purely by
 * checking (the attendance API response, or the tile's own img count) —
 * without ever clicking anything — and when the regular background check
 * turns up that result, nothing was actually attempted, so there's nothing
 * new to report; the tray's own status line already reflects it. A manual
 * click is exempt from that quiet case: it always gets its own answer,
 * since the user is asking, right now, what just happened — "you're
 * already signed in" is still a real reply to that, even though nothing
 * needed doing.
 */
async function runAttempt(state, { alwaysNotify = false } = {}) {
  const result = await core.attemptSignIn();
  log(i18n.formatResult(result));
  state.lastStatus = result.status;
  state.lastMessage = i18n.formatResult(result);
  state.lastAttemptAt = new Date().toISOString();

  const succeeded = result.status === 'claimed' || result.status === 'already-signed-in';
  if (succeeded) {
    state.attempted = true;
  } else {
    // Don't give up on the whole day over one failure — retry later.
    state.scheduledAt = new Date(Date.now() + RETRY_DELAY_MS).toISOString();
  }

  const staysQuiet = result.status === 'already-signed-in' && !alwaysNotify;
  if (!staysQuiet && (alwaysNotify || !state.notifiedForDate)) {
    notify.send(result);
    if (!succeeded) state.notifiedForDate = true;
  }

  saveState(state);
  return state;
}

/**
 * Runs one scheduler tick: rolls state over to a fresh day if needed, and
 * fires the real attempt if the scheduled time has arrived. Safe to call
 * repeatedly (e.g. every minute) or on demand.
 */
async function tick() {
  const cfg = config.load();
  // Setup not finished yet is an expected, common state now that the tray
  // (and this ticking scheduler alongside it) starts immediately rather
  // than waiting for setup to complete — nothing to schedule yet, but it's
  // not an error worth logging every minute until it is.
  if (!cfg) return null;

  let state = loadState();
  const today = core.utc8DateString();
  if (!state || state.utc8Date !== today) {
    state = freshStateForToday(today, cfg);
    saveState(state);
    log(`Scheduled today's attempt for ${new Date(state.scheduledAt).toLocaleString()}.`);
  }

  if (!state.attempted && Date.now() >= new Date(state.scheduledAt).getTime()) {
    state = await runAttempt(state);
  }

  return state;
}

/** Forces an attempt right now, bypassing the scheduled time (for a "Run now" menu action). */
async function runNow() {
  const cfg = config.load();
  if (!cfg) {
    // Setup isn't finished — report the same "no-session" shape
    // attemptSignIn() itself would, without persisting state or firing a
    // failure notification for what isn't really a failure yet.
    return { lastStatus: 'no-session', lastMessage: i18n.formatResult({ status: 'no-session' }), lastAttemptAt: new Date().toISOString() };
  }
  let state = loadState();
  const today = core.utc8DateString();
  if (!state || state.utc8Date !== today) {
    state = freshStateForToday(today, cfg);
  }
  return runAttempt(state, { alwaysNotify: true });
}

/** Starts the periodic check loop. Returns a handle with stop(). */
function start(onTick) {
  const run = () =>
    tick()
      .then(onTick)
      .catch((err) => log(`[scheduler] tick error: ${err.message}`));
  run();
  const handle = setInterval(run, CHECK_INTERVAL_MS);
  return { stop: () => clearInterval(handle) };
}

module.exports = { start, tick, runNow, loadState, STATE_FILE };
