const fs = require('fs');
const path = require('path');
const packaged = require('./packaged');

const CONFIG_FILE = path.join(packaged.appRoot(), 'config.json');

const DEFAULTS = {
  // 'window' = pick a random moment inside windowStart/windowEnd each day
  // (the original design — a failure/notification happens while the user
  // is plausibly still around to notice, rather than at 4am). 'asap' =
  // try as soon as the PC is on each day, right after the daily reset —
  // windowStart/windowEnd are unused in this mode.
  mode: 'window',
  // Local 24h "HH:MM" — only meaningful when mode is 'window'.
  windowStart: '09:00',
  windowEnd: '22:00',
  // UTC+8 24h "HH:MM" (the game's own reset clock, not the user's local
  // time) — only meaningful when mode is 'asap'. Default matches
  // Endfield's actual daily update time (04:00 UTC+8) plus a 1-minute
  // buffer to attempt after it, not during/before.
  asapTimeUtc8: '04:01',
  autostart: false,
  // null = not chosen yet, fall back to auto-detecting from the OS locale
  // (see i18n.js). An unrecognized code here just falls back to English —
  // no validation against the known locale list, so config.js doesn't need
  // to know anything about i18n specifically.
  language: null,
};

function isValidTime(s) {
  return typeof s === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(s);
}

function timeToMinutes(hhmm) {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

function validate(config) {
  if (config.mode === 'asap') {
    if (!isValidTime(config.asapTimeUtc8)) {
      throw new Error('asapTimeUtc8 must be "HH:MM" 24-hour UTC+8 time.');
    }
    return; // window bounds aren't used in this mode
  }
  if (!isValidTime(config.windowStart) || !isValidTime(config.windowEnd)) {
    throw new Error('windowStart/windowEnd must be "HH:MM" 24-hour local time.');
  }
  if (timeToMinutes(config.windowStart) >= timeToMinutes(config.windowEnd)) {
    throw new Error(
      'windowStart must be earlier than windowEnd (windows spanning midnight aren\'t supported yet).'
    );
  }
}

function load() {
  if (!fs.existsSync(CONFIG_FILE)) return null;
  const config = { ...DEFAULTS, ...JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8')) };
  validate(config);
  return config;
}

function save(config) {
  validate(config);
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2) + '\n');
}

module.exports = { CONFIG_FILE, DEFAULTS, load, save, isValidTime, timeToMinutes };
