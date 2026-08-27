const path = require('path');
const SysTray = require('systray2').default || require('systray2');
const scheduler = require('./scheduler');
const webui = require('./webui');
const config = require('./config');
const core = require('./core');
const i18n = require('./i18n');
const packaged = require('./packaged');
const { log, LOG_FILE } = require('./logger');

const ICON_PATH = path.join(__dirname, '..', 'assets', 'tray-icon.ico');
// Shown instead of the normal icon whenever needsAttention() below is true
// — setup incomplete, expired login, or a claim attempt that didn't go
// through — so there's a glanceable signal without opening the menu.
const WARNING_ICON_PATH = path.join(__dirname, '..', 'assets', 'tray-icon-warning.ico');

// core.js distinguishes 'claimed' (this run did it) from 'already-signed-in'
// (it was already done before this run checked) — useful detail for
// signin.log, but not something worth showing separately here: either way
// today is signed in, and the timestamp already says when that was last
// confirmed, so both collapse to one label.
const SIGNED_IN_STATUSES = ['claimed', 'already-signed-in'];
// Every lastStatus value that means the daily claim did NOT go through and
// won't fix itself without the user doing something (as opposed to just
// "hasn't run yet") — drives the warning icon alongside setup-incompleteness.
const ATTENTION_STATUSES = ['session-expired', 'selector-not-found', 'error', 'no-session'];

function isSetupComplete() {
  return !!config.load() && core.hasSavedSession();
}

function statusLine(state) {
  if (!isSetupComplete()) return i18n.t('tray.status_setup_incomplete');
  if (!state || !state.lastStatus) return i18n.t('tray.status_waiting');
  const when = state.lastAttemptAt ? new Date(state.lastAttemptAt).toLocaleString() : '';
  const label = SIGNED_IN_STATUSES.includes(state.lastStatus)
    ? i18n.t('tray.status_label.signed_in')
    : i18n.tMaybe(`tray.status_label.${state.lastStatus}`) || state.lastStatus;
  if (!when) return i18n.t('tray.status_simple', { label });
  return i18n.t('tray.status_with_time', { label, whenLabel: i18n.t('tray.status_last_checked', { when }) });
}

function needsAttention(state) {
  if (!isSetupComplete()) return true;
  return !!(state && ATTENTION_STATUSES.includes(state.lastStatus));
}

/**
 * Starts the tray icon and the resident scheduler together. Returns a
 * handle with stop() to shut both down cleanly.
 */
function startTray({ onQuit } = {}) {
  const menuItem = (title, click) => ({ title, tooltip: '', checked: false, enabled: true, click });

  // A dedicated, non-clickable item for the live status line. Updated via
  // 'update-item' (the exact pattern the library's own README uses for
  // toggling a single item) rather than replacing the whole menu via
  // 'update-menu' — the latter looked to be what corrupted the menu into a
  // non-responsive state in testing, so it's avoided here entirely. The
  // menu's *structure* (icon/title/tooltip/items) is set once and never
  // touched again after construction.
  const statusItem = { title: statusLine(null), tooltip: '', checked: false, enabled: false };

  const settingsItem = menuItem(i18n.t('tray.menu_settings'), async () => {
    try {
      // immediate: true — the user just explicitly clicked "Settings...",
      // so there's no need for the "give the guidance a beat" pause that
      // first-run setup uses (see webui.js).
      await webui.openSettingsUI({ immediate: true });
      // The visit may have changed the language — re-apply it and push
      // updated labels to every item via 'update-item' (proven safe,
      // unlike 'update-menu' — see the note above) so a language change
      // takes effect immediately, not just after a restart.
      const cfg = config.load();
      if (cfg && cfg.language && cfg.language !== i18n.getLocale()) {
        i18n.setLocale(cfg.language);
        refreshMenuLabels();
      }
    } catch (err) {
      log(`[tray] settings UI failed: ${err.message}`);
    }
    refreshStatus();
  });
  const runNowItem = menuItem(i18n.t('tray.menu_run_now'), async () => {
    try {
      await scheduler.runNow();
    } catch (err) {
      log(`[tray] "Claim now" failed: ${err.message}`);
    }
    refreshStatus();
  });
  const openLogItem = menuItem(i18n.t('tray.menu_open_log'), () => {
    const { exec } = require('child_process');
    exec(`start "" "${LOG_FILE}"`, { shell: 'cmd.exe' });
  });
  const quitItem = menuItem(i18n.t('tray.menu_quit'), () => {
    systray.kill(false);
    if (onQuit) onQuit();
  });

  const menuItems = () => [settingsItem, SysTray.separator, statusItem, runNowItem, openLogItem, SysTray.separator, quitItem];

  const systray = new SysTray({
    menu: {
      icon: ICON_PATH,
      title: 'Talos Autopilot',
      tooltip: 'Talos Autopilot',
      items: menuItems(),
    },
    debug: false,
    // systray2's own __dirname resolves into pkg's virtual snapshot when
    // packaged, which isn't a real path its Go helper can be spawned from
    // — copyDir is the library's own documented escape hatch for exactly
    // this ("useful for packing tool like pkg"), copying the helper out to
    // a real, writable cache dir. Not needed in dev mode, where __dirname
    // is already real.
    copyDir: packaged.isPackaged,
  });

  systray.onClick((action) => {
    if (action.item.click) action.item.click();
  });

  // Tracks which icon is currently showing so refreshStatus() only sends
  // an 'update-menu' when the warning state actually flips, not on every
  // tick — 'update-menu' is the only action that can change the top-level
  // tray icon (per-item icons in this library are a different, menu-row-only
  // thing), but it's less exercised by the library's own tests than
  // 'update-item' is, so it's used sparingly and only after ready().
  let currentIconIsWarning = false;

  function refreshStatus() {
    const state = scheduler.loadState();
    statusItem.title = statusLine(state);
    systray.sendAction({ type: 'update-item', item: statusItem });

    const warning = needsAttention(state);
    if (warning !== currentIconIsWarning) {
      currentIconIsWarning = warning;
      systray.sendAction({
        type: 'update-menu',
        menu: {
          icon: warning ? WARNING_ICON_PATH : ICON_PATH,
          title: 'Talos Autopilot',
          tooltip: 'Talos Autopilot',
          items: menuItems(),
        },
      });
    }
  }

  function refreshMenuLabels() {
    settingsItem.title = i18n.t('tray.menu_settings');
    runNowItem.title = i18n.t('tray.menu_run_now');
    openLogItem.title = i18n.t('tray.menu_open_log');
    quitItem.title = i18n.t('tray.menu_quit');
    for (const item of [settingsItem, runNowItem, openLogItem, quitItem]) {
      systray.sendAction({ type: 'update-item', item });
    }
  }

  // scheduler.start() calls its first tick immediately, which can resolve
  // (and call refreshStatus -> sendAction) before the tray helper's own
  // async handshake finishes — sendAction needs the process handle ready()
  // guarantees exists. So don't start the scheduler (or touch sendAction
  // at all) until ready() has actually resolved.
  let schedulerHandle = null;

  systray
    .ready()
    .then(() => {
      // Diagnostics: the tray helper is a separate native process — if it
      // crashes, surface that clearly instead of the icon just silently
      // vanishing with no clue why.
      systray.onExit((code, signal) => {
        log(`[tray] helper process exited unexpectedly: code=${code} signal=${signal}`);
      });
      systray.onError((err) => {
        log(`[tray] helper process error: ${err.message}`);
      });
      if (systray.process && systray.process.stderr) {
        systray.process.stderr.on('data', (chunk) => {
          log(`[tray] helper stderr: ${chunk.toString()}`);
        });
      }
      log('[tray] icon ready.');
      // Reflect the real current state (e.g. setup still incomplete) right
      // away — scheduler.start()'s own first tick would get here almost
      // immediately anyway, but not calling this explicitly would mean the
      // icon briefly shows "normal" for however long that first tick takes.
      refreshStatus();
      schedulerHandle = scheduler.start(() => refreshStatus());
    })
    .catch((err) => log(`[tray] failed to start: ${err.message}`));

  return {
    stop: () => {
      if (schedulerHandle) schedulerHandle.stop();
      systray.kill(false);
    },
    // Exposed for main.js to call once first-run setup finishes: the tray
    // now starts before setup is done (so it's visible immediately), so
    // unlike before, a language chosen during that first setup needs an
    // explicit push, and the icon should flip out of "warning" right away
    // rather than waiting for the scheduler's next 60s tick.
    refreshMenuLabels,
    refreshStatus,
  };
}

module.exports = { startTray };
