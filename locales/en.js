/**
 * English (canonical). Every other locale file must have exactly this key
 * structure — i18n.js falls back to this file for any key a locale is
 * missing, so partial translations degrade gracefully rather than
 * breaking.
 */
module.exports = {
  meta: { name: 'English' },

  tray: {
    menu_settings: 'Settings',
    menu_run_now: 'Claim now',
    menu_open_log: 'Open log',
    menu_quit: 'Quit',
    status_waiting: 'Status: waiting for first check',
    status_setup_incomplete: 'Setup not finished — click Settings above',
    status_label: {
      signed_in: 'Claimed today',
      'session-expired': 'Login expired — needs attention',
      'selector-not-found': 'Site changed — needs a look',
      error: 'Last attempt failed',
    },
    status_simple: 'Status: {label}',
    status_with_time: 'Status: {label} ({whenLabel})',
    status_last_checked: 'last checked {when}',
  },

  notify: {
    title: {
      'session-expired': 'Talos Autopilot — login needed',
      'selector-not-found': 'Talos Autopilot — SKPORT page changed',
      error: 'Talos Autopilot ran into a problem',
      crashed: 'Talos Autopilot stopped',
      default: 'Talos Autopilot',
    },
    hint: {
      'session-expired': 'Your saved login expired. Open the app and log in again.',
      'selector-not-found': "The site's layout changed and the tool couldn't find today's tile.",
      error: "It'll try again shortly. Open the app if this keeps happening.",
      crashed: "It won't retry on its own — you'll need to restart it yourself for auto-claim to keep working.",
    },
  },

  // Keyed by core.js's result.status — the log line AND the source used to
  // derive notification/tray text for anything not already covered above.
  result: {
    'no-session': 'No saved login found yet. Run setup and log in first via Settings.',
    'session-expired': 'Your saved SKPORT login has expired. Please log in again.',
    'already-signed-in': 'Already claimed today.',
    claimed: 'Claimed {dayLabel}.',
    'selector-not-found': "Could not find today's tile ({dayLabel}) — the page layout may have changed.",
    error: 'Error during claim attempt: {detail}',
  },

  main: {
    running:
      'Talos Autopilot is running — look for the checkmark icon in your system tray ' +
      '(you may need to click the "^" arrow to show hidden icons). Right-click it for options.',
    crashed_message: 'Talos Autopilot hit an unexpected error and had to stop.',
  },

  scheduler: {
    scheduled_for: "Scheduled today's attempt for {when}.",
  },

  webui: {
    title: 'Talos Autopilot — Settings',
    heading: 'Talos Autopilot — Settings',
    login_intro: `You haven't logged-in yet. We'll open a broswer window for you to log in to SKPORT and save your credential.`,
    login_button: 'Log in to SKPORT',
    waiting_intro: "A browser window should be open now shortly. Log in there, leave that window open, come back here and click the button below.\nNote that third-party login may be restricted, this is normal, just use your password to login.",
    login_done_button: "I'm logged in",
    logged_in_note_with_config: "You're logged in — change your settings any time below.",
    logged_in_note_no_config: "You're logged in — just set your preferences below.",
    mode_label: 'When should it try each day?',
    mode_window_option: 'At a random time in a window',
    mode_asap_option: 'As soon as my PC is on',
    mode_asap_hint: "It'll check right after this time each day, or as soon as your PC turns on if it wasn't already running then. You'll still get a notification if something goes wrong.",
    label_asap_time: "Daily update time (UTC+8, not your local time)",
    label_earliest: 'Earliest time it should try each day',
    label_latest: 'Latest time',
    window_hint: "It'll pick a random moment in that window each day — if something goes wrong, you'll get a notification while you're likely still around to notice.",
    autostart_label: 'Start automatically with Windows',
    language_label: 'Language',
    save_button: 'Save',
    relogin_button: 'Re-login',
    status_opening_browser: 'Opening a browser window...',
    status_saving_login: 'Saving your login...',
    status_invalid_range: 'Please pick a valid range (earliest time before latest time).',
    status_no_mode_selected: 'Please pick one of the two options above first.',
    status_generic_error: 'Something went wrong.',
    status_browser_closed_early: "It looks like that browser window got closed before finishing. Click \"Log in to SKPORT\" again to retry.",
    status_save_timeout: "Saving your login timed out — this usually means you weren't actually logged in yet when you clicked the button. Click \"Log in to SKPORT\" again, log in fully, then try again.",
    status_saved: '✅ Saved — you can close this tab now.',
    status_session_ended: 'This settings session has ended — reopen Settings from the tray to make further changes.',
  },
};
