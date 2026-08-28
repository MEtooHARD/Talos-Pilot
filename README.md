# Talos Autopilot

A small Windows tray app that claims your daily SKPORT sign-in reward for **Arknights: Endfield** automatically — so you stop losing it to forgetting, being at work, or being asleep when the day resets.  
It runs entirely on your own PC, over your own internet connection, using a browser session **you** personally log into. It is not affiliated with Hypergryph, Gryphline, or SKPORT.

## What it does — and doesn't do

- Opens a real, visible browser window for you to log in yourself, the normal way (password, or whatever SKPORT normally offers). **This app never sees, stores, or handles your password.**
  It only keeps the logged-in session that results, the same way your browser would.
- Once logged in, it runs quietly in your system tray and checks in for you either at a random time in a daily window you choose, or as soon as your PC is on after each day's reset — your choice.
- Tells you if something needs attention (login expired, the site changed, or a claim attempt failed) via a Windows notification and an orange tray icon — it never just fails silently.
- Everything it does is logged locally (right-click the tray icon → **Open log**) so you can always see exactly what it did and when.

## Download and install

1. Go to [Releases](../../releases) and download the latest `.zip`.
2. Unzip it anywhere (e.g. your Desktop, or a folder in Documents).
3. Double-click **`Talos Autopilot.exe`**.

That's it — the zip contains two files (`Talos Autopilot.exe` and `talos-autopilot-engine.exe`); keep them together in the same folder.

### About the SmartScreen warning

Windows will very likely show a blue "Windows protected your PC" screen the first time you run it.  
This happens because the app isn't digitally code-signed — code-signing certificates cost my money every year, and I ain't pay for that.  
To proceed, click **More info → Run anyway**.

### First run

The app opens a small settings page in your normal browser:

1. **Log in to SKPORT** — a real browser window opens; log in there like you normally would, then come back and click "I'm logged in."
2. Choose **when** it should try each day — a random time in a window you pick, or as soon as your PC turns on after the daily reset.
3. Optionally turn on **start automatically with Windows**, so you never have to open it again.
4. Click **Save**. Look for a ![checkmark icon](assets/tray-icon.ico) in your system tray (you may need to click the "^" arrow to show hidden icons) — that's it running.
5. Double-check: Task Manager → Startup apps → Talos Autopilot should say "Enabled." If not, right-click → Enable.

You can reopen these settings any time from the ![tray icon](assets/tray-icon.ico)'s **Settings** item — to change the schedule, turn autostart on/off, switch language, or **Re-login**.

## Please read before using this

This automates an interaction with a website.  
**Automating game/account interactions may be against SKPORT's or Endfield's Terms of Service**, even though this tool only ever does what you could do yourself by hand once a day, from your own PC and your own connection.  
Nobody involved in this project can promise it won't ever cause an issue with your account.  
Use it at your own risk. This software is provided as-is, with no warranty — see [LICENSE](LICENSE).

## Language

Available in English and Traditional Chinese (繁體中文) now — pick either any time from the language dropdown on the **Settings** page.  
Community contributions for existing languages or the others are very welcome (see `locales/en.js` for the format to copy).

## If something's wrong

- **Orange tray icon** — something needs your attention. Right-click → the status line under **Settings...** tells you what (setup incomplete, login expired, or a claim attempt failed).
- **Login expired** — reopen Settings and log in again the same way as first-run setup.
- Check the log (tray icon → **Open log**) for full detail on every attempt.

## Updating or uninstalling

There's no installer — it's just two files sitting in a folder — so both are plain file operations:

- **Updating**: quit the app first (tray icon → **Quit** — Windows won't let you overwrite a running `.exe`), then download the new zip and copy both files over the old ones in the same folder. Your settings and login carry over untouched.
- **Uninstalling**: quit the app, then either turn off **start automatically with Windows** in Settings first or just delete `%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\Talos Autopilot.lnk` yourself, then delete the folder. Also delete `%LOCALAPPDATA%\TalosAutopilot\` — the first time it ever shows you a notification, the app copies out a small helper it needs for that (`snoretoast-x64.exe`, part of the open-source `node-notifier` package) to that folder, since Windows notifications have to run as their own real program rather than living inside the app's own `.exe`. It's not malware or a separate install — just a fully offline, one-time file copy — but it's worth knowing it's there before you assume the app folder is the only thing to remove.

  Between the app folder and that one, that's the entire footprint; nothing else gets touched anywhere on your system.

## Building from source

Only needed if you want to modify the app yourself — most people should
just use the [Releases](../../releases) download above.

```
git clone git@github.com:MEtooHARD/Talos-Pilot.git
cd Talos-Pilot
npm install
node main.js
```

This drives your own installed Chrome or Edge (via `playwright-core`'s `channel` option) — no separate browser download needed. To build the standalone `.exe` distribution:

```
npm run package
```

Output lands in `dist/`. See `locales/validate.js` (`npm run check-locales`) if you're adding or editing a language file.

## License

[MIT](LICENSE) — free to use, modify, and redistribute.
