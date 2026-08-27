using System.Diagnostics;
using System.IO;
using System.Reflection;

// Compiled as a genuine GUI-subsystem (/target:winexe) binary — unlike the
// wscript.exe+.vbs trick used for dev-mode autostart, this never has a
// console to hide in the first place, and (via LauncherAssemblyInfo.cs)
// carries its own "Talos Autopilot" product name, so Task Manager's
// Startup tab shows that instead of "Microsoft® Windows Based Script
// Host" (wscript.exe's own identity, which is what a plain shortcut to it
// would otherwise display).
class Launcher
{
    static void Main()
    {
        string dir = Path.GetDirectoryName(Assembly.GetExecutingAssembly().Location);
        var psi = new ProcessStartInfo
        {
            FileName = Path.Combine(dir, "talos-autopilot-engine.exe"),
            WorkingDirectory = dir,
            UseShellExecute = false,
            CreateNoWindow = true,
        };
        Process.Start(psi);
    }
}
