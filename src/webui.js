/**
 * Settings UI: a tiny local webpage in the user's normal browser, used both
 * for first-time setup and any time afterward (via the tray's "Settings..."
 * item) to change the daily time window, autostart, language, or log in
 * with a different account. Runs as a short-lived local HTTP server inside
 * this same process — no separate install, no terminal involved at any
 * point.
 */
const http = require('http');
const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const core = require('./core');
const config = require('./config');
const autostart = require('./autostart');
const i18n = require('./i18n');
const { log } = require('./logger');

const ICON_PATH = path.join(__dirname, '..', 'assets', 'tray-icon.ico');
const PAGE_PATH = path.join(__dirname, 'webui-page.html');
const IDLE_TIMEOUT_MS = 15 * 60 * 1000;

function openInBrowser(url) {
  const cmd =
    process.platform === 'win32'
      ? `start "" "${url}"`
      : process.platform === 'darwin'
        ? `open "${url}"`
        : `xdg-open "${url}"`;
  exec(cmd, (err) => {
    if (err) log(`[webui] could not open browser automatically (${err.message}) — URL was ${url}`);
  });
}

function sendJson(res, status, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(status, { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) });
  res.end(body);
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk) => (data += chunk));
    req.on('end', () => {
      try {
        resolve(data ? JSON.parse(data) : {});
      } catch (err) {
        reject(err);
      }
    });
    req.on('error', reject);
  });
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
}

// The page can be *previewed* in a language different from what's saved
// (via the ?lang= the language dropdown sets) without that leaking into
// what language the tray/notifications use elsewhere in this same
// resident process — hence i18n.tFor(locale, ...) rather than
// i18n.setLocale()/t() here.
function resolveRequestLocale(url) {
  const queryLang = url.searchParams.get('lang');
  if (queryLang && i18n.availableLocales().some((l) => l.code === queryLang)) return queryLang;
  const cfg = config.load();
  if (cfg && cfg.language) return cfg.language;
  return i18n.detectSystemLocale();
}

function renderPage(locale) {
  const template = fs.readFileSync(PAGE_PATH, 'utf8');
  return template.replace(/\{\{(json\s+)?([\w.]+)\}\}/g, (_match, jsonFlag, key) => {
    if (key === 'lang') return locale;
    if (key === 'language_options') {
      return i18n
        .availableLocales()
        .map(({ code, name }) => `<option value="${code}"${code === locale ? ' selected' : ''}>${escapeHtml(name)}</option>`)
        .join('');
    }
    const value = i18n.tFor(locale, key);
    // Plain (non-json) strings render straight into HTML, where a literal
    // "\n" in a locale file would just collapse to a space — converting it
    // to a real <br> after escaping (so it's not treated as user input,
    // only ever as something *we* insert from our own locale files) is
    // what actually lets locale authors break a long hint into short lines.
    return jsonFlag ? JSON.stringify(value) : escapeHtml(value).replace(/\n/g, '<br>');
  });
}

// Now that the tray icon exists even during first-run setup (so it can
// still show something is installed), the tray's own "Settings..." item is
// clickable at the same time main.js's first-run call is still open —
// without a guard, that would spin up a second ephemeral server and a
// second browser tab pointed at the same in-progress setup. But the guard
// must never make a caller *wait* on an already-open session: that
// session's own promise only resolves on Save (or a 15-minute idle
// timeout) — a click handler that awaited it would itself look hung for
// however long that takes, exactly like the underlying stuck-setup bug it
// was meant to guard against. So a concurrent call just resolves
// immediately as a no-op instead of opening a duplicate tab.
let activeSession = null;

/**
 * Opens the settings page and resolves once the user is done with it
 * (saved settings, or the tab/server timed out from inactivity).
 *
 * `immediate: true` skips the "give the guidance a beat to be read" pause
 * before the tab opens — appropriate when the user just explicitly clicked
 * "Settings..." themselves (they're not reading anything yet, they asked
 * for this) as opposed to first-run setup, where the pause matters because
 * there's login/guidance text worth reading before the window lands.
 */
function openSettingsUI(opts = {}) {
  if (activeSession) {
    log('[webui] Settings already open in another tab — ignoring duplicate open request.');
    return Promise.resolve();
  }
  activeSession = openSettingsSession(opts).finally(() => {
    activeSession = null;
  });
  return activeSession;
}

function openSettingsSession({ immediate = false } = {}) {
  return new Promise((resolveUI) => {
    let pendingLoginContinue = null;
    let loginPromise = null;
    let finished = false;

    const server = http.createServer(async (req, res) => {
      try {
        const url = new URL(req.url, 'http://127.0.0.1');

        if (req.method === 'GET' && url.pathname === '/') {
          const locale = resolveRequestLocale(url);
          res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
          res.end(renderPage(locale));
          return;
        }

        if (req.method === 'GET' && url.pathname === '/api/state') {
          sendJson(res, 200, { loggedIn: core.hasSavedSession(), config: config.load() });
          return;
        }

        if (req.method === 'POST' && url.pathname === '/api/login/start') {
          // Kicked off but not awaited here — the request returns
          // immediately so the page can show "click when you're logged
          // in"; /api/login/finish is what actually unblocks it below.
          loginPromise = core.login({
            onReady: () => {},
            waitForContinue: () => new Promise((resolve) => { pendingLoginContinue = resolve; }),
          });
          loginPromise.catch(() => {}); // avoid an unhandled-rejection warning before /finish awaits it
          sendJson(res, 200, { status: 'started' });
          return;
        }

        if (req.method === 'POST' && url.pathname === '/api/login/finish') {
          if (pendingLoginContinue) {
            pendingLoginContinue();
            pendingLoginContinue = null;
          }
          try {
            await loginPromise;
            sendJson(res, 200, { status: 'ok' });
          } catch (err) {
            // Playwright's own message for this ("Target page, context or
            // browser has been closed") when the user closes the login
            // window before clicking "I'm logged in" — session capture
            // needs that browser context still alive, so this is the one
            // failure mode worth a specific, friendly message instead of
            // the raw error. core.js's own timeout guard (for the rarer
            // case where saving hangs instead of erroring outright, e.g.
            // clicking "I'm logged in" without ever actually logging in)
            // gets the same treatment.
            const message = /has been closed/i.test(err.message)
              ? i18n.t('webui.status_browser_closed_early')
              : err.message === 'Saving the login session timed out.'
                ? i18n.t('webui.status_save_timeout')
                : err.message;
            sendJson(res, 500, { status: 'error', message });
          }
          return;
        }

        if (req.method === 'POST' && url.pathname === '/api/config') {
          const body = await readJsonBody(req);
          config.save({
            mode: body.mode === 'asap' ? 'asap' : 'window',
            windowStart: body.windowStart,
            windowEnd: body.windowEnd,
            asapTimeUtc8: body.asapTimeUtc8,
            autostart: !!body.autostart,
            language: body.language || null,
          });
          if (body.autostart) {
            autostart.enable({ ...autostart.currentLaunchSpec(), iconPath: ICON_PATH });
          } else {
            autostart.disable();
          }
          sendJson(res, 200, { status: 'ok' });
          return;
        }

        if (req.method === 'POST' && url.pathname === '/api/done') {
          sendJson(res, 200, { status: 'ok' });
          finish();
          return;
        }

        res.writeHead(404);
        res.end();
      } catch (err) {
        log(`[webui] request error on ${req.method} ${req.url}: ${err.message}`);
        sendJson(res, 500, { status: 'error', message: err.message });
      }
    });

    function finish() {
      if (finished) return;
      finished = true;
      clearTimeout(idleTimeout);
      // Small delay so the response above actually flushes before the
      // server (and its listener) goes away.
      setTimeout(() => {
        server.close();
        resolveUI();
      }, 300);
    }

    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      const url = `http://127.0.0.1:${port}/`;
      if (immediate) {
        openInBrowser(url);
      } else {
        // A brief pause so the browser popping up doesn't feel instantaneous
        // right after double-clicking the launcher — a beat of "something
        // is about to happen" before the login/guidance text actually
        // needs reading.
        setTimeout(() => openInBrowser(url), 1500);
      }
    });

    // Don't let an abandoned tab keep a server (and a possibly-open login
    // browser) around forever.
    const idleTimeout = setTimeout(finish, IDLE_TIMEOUT_MS);
  });
}

module.exports = { openSettingsUI };
