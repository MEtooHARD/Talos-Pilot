/**
 * Registers/removes a plain Windows Startup-folder shortcut so the app
 * launches quietly at login — no Task Scheduler, no admin rights, no
 * execution-policy prompts. We invoke PowerShell's WScript.Shell COM
 * object via a single inline `-Command` (not a .ps1 file), which isn't
 * subject to the script-file execution policy that trips people up.
 *
 * Two cases for what the shortcut actually targets:
 * - Dev mode: node.exe is console-subsystem, so Windows always gives it a
 *   visible window regardless of how the app itself behaves. The shortcut
 *   instead targets a tiny generated .vbs launcher that runs the real
 *   command hidden (WScript.Shell.Run's windowStyle 0) — a standard,
 *   dependency-free trick using only what Windows already ships.
 * - Packaged mode: the target is packaging/Launcher.cs's compiled output,
 *   a genuine GUI-subsystem (/target:winexe) binary — it never has a
 *   console to hide in the first place, so the shortcut targets it
 *   directly, no wrapper needed. It also carries its own "Talos Autopilot"
 *   product name, so Task Manager's Startup tab shows that instead of some
 *   generic host process's identity.
 */
const path = require('path');
const fs = require('fs');
const os = require('os');
const { execFileSync } = require('child_process');
const packaged = require('./packaged');

const SHORTCUT_NAME = 'Talos Autopilot.lnk';
const LAUNCHER_NAME = 'launch-hidden.vbs';

function startupFolder() {
  return path.join(os.homedir(), 'AppData', 'Roaming', 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'Startup');
}

function shortcutPath() {
  return path.join(startupFolder(), SHORTCUT_NAME);
}

function psQuote(value) {
  // Wrap in double quotes for PowerShell, escaping any embedded ones.
  return `"${String(value).replace(/"/g, '""')}"`;
}

function vbsQuote(value) {
  // VBScript string literals use the same "" escaping convention as PowerShell.
  return `"${String(value).replace(/"/g, '""')}"`;
}

function wscriptPath() {
  return path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'wscript.exe');
}

/**
 * Writes a .vbs launcher (next to the app) that runs spec.targetPath +
 * spec.args hidden, and returns its path.
 */
function writeHiddenLauncher(spec) {
  const vbsPath = path.join(spec.cwd, LAUNCHER_NAME);
  // The program path itself needs quoting on the command line too (not
  // just the argument) — node.exe's own path has a space in it
  // ("Program Files"), and without quotes Windows tries to run "C:\Program"
  // as the executable.
  const quotedTarget = `"${spec.targetPath}"`;
  const commandLine = spec.args ? `${quotedTarget} ${spec.args}` : quotedTarget;
  const content =
    [
      'Set objShell = CreateObject("WScript.Shell")',
      `objShell.CurrentDirectory = ${vbsQuote(spec.cwd)}`,
      `objShell.Run ${vbsQuote(commandLine)}, 0, False`,
    ].join('\r\n') + '\r\n';
  fs.writeFileSync(vbsPath, content);
  return vbsPath;
}

/**
 * Creates (or overwrites) the Startup shortcut.
 * @param {{targetPath: string, args?: string, cwd: string, iconPath?: string, needsHiddenWrapper?: boolean}} spec
 */
function enable(spec) {
  let iconPath = spec.iconPath || spec.targetPath;
  // Windows Explorer reads a shortcut's IconLocation directly — it has no
  // idea pkg's virtual snapshot exists, so a snapshot path here would just
  // show a blank/default icon. Extract to a real file first when packaged.
  if (packaged.isPackaged && spec.iconPath) {
    iconPath = packaged.extractIfNeeded(spec.iconPath, path.basename(spec.iconPath));
  }

  // The packaged case's target is already a real GUI-subsystem binary
  // (packaging/Launcher.cs, compiled with /target:winexe) — it never has a
  // console to hide in the first place, so the wscript.exe+.vbs wrapper
  // below (needed for dev mode's node.exe, which is console-subsystem) is
  // skipped entirely and the shortcut targets it directly.
  let finalTarget = spec.targetPath;
  let finalArgs = spec.args;
  if (spec.needsHiddenWrapper !== false) {
    const vbsPath = writeHiddenLauncher(spec);
    finalTarget = wscriptPath();
    finalArgs = `"${vbsPath}"`;
  }

  const script = [
    '$ws = New-Object -ComObject WScript.Shell',
    `$sc = $ws.CreateShortcut(${psQuote(shortcutPath())})`,
    `$sc.TargetPath = ${psQuote(finalTarget)}`,
    // CreateShortcut() on an *existing* .lnk loads its current properties
    // first — explicitly clearing Arguments (rather than just omitting
    // this line) matters, or a stale value from a previous enable() call
    // (e.g. switching from dev mode's wscript wrapper to the packaged
    // launcher, which needs no arguments at all) would silently persist.
    `$sc.Arguments = ${psQuote(finalArgs || '')}`,
    `$sc.WorkingDirectory = ${psQuote(spec.cwd)}`,
    `$sc.IconLocation = ${psQuote(iconPath)}`,
    '$sc.Save()',
  ]
    .filter(Boolean)
    .join('; ');

  execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script]);
}

function disable() {
  const p = shortcutPath();
  if (fs.existsSync(p)) fs.unlinkSync(p);
}

function isEnabled() {
  return fs.existsSync(shortcutPath());
}

/**
 * Figures out what "relaunch this app" means from wherever we're running
 * right now — plain `node main.js` in dev, or a packaged single-file exe
 * once that exists (task #6). Centralized here so packaging later only
 * needs to update this one function.
 */
function currentLaunchSpec() {
  if (packaged.isPackaged) {
    // process.execPath here is the *engine* (talos-autopilot-engine.exe) —
    // the actual autostart target should be its sibling launcher stub
    // ("Talos Autopilot.exe", built by packaging/postbuild.js), which is
    // what should show up in Task Manager's Startup list, not the engine
    // itself. __dirname would resolve into pkg's virtual snapshot when
    // packaged, not a real directory, so the exe's own real location is
    // what matters here.
    const distDir = path.dirname(process.execPath);
    return {
      targetPath: path.join(distDir, 'Talos Autopilot.exe'),
      cwd: distDir,
      needsHiddenWrapper: false,
    };
  }
  const projectRoot = path.join(__dirname, '..');
  return {
    targetPath: process.execPath, // node.exe
    // Quoted as it should literally appear on the command line — enable()
    // handles the separate layer of escaping needed to embed this into the
    // PowerShell -Command string / .vbs launcher.
    args: `"${path.join(projectRoot, 'main.js')}"`,
    cwd: projectRoot,
  };
}

module.exports = { enable, disable, isEnabled, shortcutPath, currentLaunchSpec };
