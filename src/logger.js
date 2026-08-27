/**
 * Shared, persistent logging. This matters more than it looks: once the
 * app is packaged and launched hidden (no console window — see
 * autostart.js), console.log/console.error go absolutely nowhere anyone
 * can see. signin.log is the one durable, user-visible record of what the
 * app has actually done — every module that can hit a real failure should
 * log through here, not just console.error.
 */
const fs = require('fs');
const path = require('path');
const packaged = require('./packaged');

const LOG_FILE = path.join(packaged.appRoot(), 'signin.log');
const MAX_LOG_BYTES = 2 * 1024 * 1024; // trim well before this becomes unwieldy to open

function log(line) {
  const stamped = `[${new Date().toISOString()}] ${line}`;
  try {
    console.log(stamped);
  } catch {
    /* no console once launched hidden — fine, the file write below is what matters */
  }
  try {
    if (fs.existsSync(LOG_FILE) && fs.statSync(LOG_FILE).size > MAX_LOG_BYTES) {
      const tail = fs.readFileSync(LOG_FILE, 'utf8').slice(-MAX_LOG_BYTES / 2);
      fs.writeFileSync(LOG_FILE, tail);
    }
    fs.appendFileSync(LOG_FILE, stamped + '\n');
  } catch {
    /* if even the log write fails, there's nothing more we can do here */
  }
  return stamped;
}

module.exports = { log, LOG_FILE };
