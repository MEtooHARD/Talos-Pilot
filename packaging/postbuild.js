#!/usr/bin/env node
/**
 * Runs automatically after `npm run package` (npm's post<script>
 * convention). pkg's output (talos-autopilot.exe) is a console-subsystem
 * binary and isn't meant to be what end users actually click — it gets
 * renamed to talos-autopilot-engine.exe, and a tiny separate GUI-subsystem
 * launcher (compiled here from packaging/Launcher.cs) becomes the real
 * "Talos Autopilot.exe" people see: no console window ever (it's a genuine
 * WinExe, not a hidden-via-trick console app), and — because it carries
 * its own "Talos Autopilot" product name — Task Manager's Startup tab
 * shows that instead of some generic host process's identity.
 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const DIST = path.join(__dirname, '..', 'dist');
const PKG_OUTPUT = path.join(DIST, 'talos-autopilot.exe');
const ENGINE_OUTPUT = path.join(DIST, 'talos-autopilot-engine.exe');
const LAUNCHER_OUTPUT = path.join(DIST, 'Talos Autopilot.exe');
const ICON = path.join(__dirname, '..', 'assets', 'tray-icon.ico');

function findCsc() {
  const roots = [
    path.join(process.env.WINDIR || 'C:\\Windows', 'Microsoft.NET', 'Framework64'),
    path.join(process.env.WINDIR || 'C:\\Windows', 'Microsoft.NET', 'Framework'),
  ];
  for (const root of roots) {
    if (!fs.existsSync(root)) continue;
    const versions = fs.readdirSync(root).filter((v) => /^v\d/.test(v)).sort().reverse();
    for (const v of versions) {
      const candidate = path.join(root, v, 'csc.exe');
      if (fs.existsSync(candidate)) return candidate;
    }
  }
  return null;
}

if (fs.existsSync(PKG_OUTPUT)) {
  fs.renameSync(PKG_OUTPUT, ENGINE_OUTPUT);
  console.log(`Renamed pkg output to ${ENGINE_OUTPUT}`);
} else if (!fs.existsSync(ENGINE_OUTPUT)) {
  throw new Error(`Expected pkg output at ${PKG_OUTPUT} — did the pkg step actually run?`);
}

const csc = findCsc();
if (!csc) {
  throw new Error(
    'Could not find csc.exe (ships with .NET Framework on every Windows install) — cannot build the launcher stub.'
  );
}

execFileSync(csc, [
  '/nologo',
  '/target:winexe',
  `/out:${LAUNCHER_OUTPUT}`,
  `/win32icon:${ICON}`,
  path.join(__dirname, 'Launcher.cs'),
  path.join(__dirname, 'LauncherAssemblyInfo.cs'),
]);
console.log(`Compiled launcher to ${LAUNCHER_OUTPUT}`);
