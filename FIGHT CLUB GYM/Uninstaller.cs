using System;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Windows.Forms;
using Microsoft.Win32;

namespace FightClubGym
{
    static class Uninstaller
    {
        [STAThread]
        static void Main()
        {
            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);

            string appDir = AppDomain.CurrentDomain.BaseDirectory.TrimEnd(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar);

            DialogResult confirm = MessageBox.Show(
                "Are you sure you want to uninstall Fight Club Gym Management System?",
                "Fight Club Gym - Uninstall",
                MessageBoxButtons.YesNo,
                MessageBoxIcon.Question
            );

            if (confirm != DialogResult.Yes)
            {
                return;
            }

            DialogResult keepDb = MessageBox.Show(
                "Do you want to preserve your database and member records (db/fight_club.db)?\n\n- Click 'Yes' to keep your database safe.\n- Click 'No' to completely remove all data.",
                "Preserve Database?",
                MessageBoxButtons.YesNo,
                MessageBoxIcon.Question
            );

            // 1. Close any running instances of Fight Club Gym or node in appDir
            KillAppProcesses(appDir);

            // 2. Remove Shortcuts
            RemoveShortcuts();

            // 3. Remove Registry Entry
            RemoveRegistryEntry();

            // 4. Clean up files via self-deleting script
            CleanupFiles(appDir, keepDb == DialogResult.Yes);

            MessageBox.Show(
                "Fight Club Gym Management System has been successfully uninstalled.",
                "Uninstall Complete",
                MessageBoxButtons.OK,
                MessageBoxIcon.Information
            );
        }

        private static void KillAppProcesses(string appDir)
        {
            try
            {
                Process[] processes = Process.GetProcesses();
                foreach (Process p in processes)
                {
                    try
                    {
                        if (p.ProcessName.Equals("Fight_Club_Gym", StringComparison.OrdinalIgnoreCase))
                        {
                            p.Kill();
                            p.WaitForExit(1500);
                        }
                    }
                    catch { }
                }
            }
            catch { }
        }

        private static void RemoveShortcuts()
        {
            try
            {
                string desktop = Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory);
                string desktopLnk = Path.Combine(desktop, "Fight Club Gym.lnk");
                if (File.Exists(desktopLnk))
                {
                    File.Delete(desktopLnk);
                }

                string startMenu = Path.Combine(
                    Environment.GetFolderPath(Environment.SpecialFolder.StartMenu),
                    "Programs"
                );
                string startMenuLnk = Path.Combine(startMenu, "Fight Club Gym.lnk");
                if (File.Exists(startMenuLnk))
                {
                    File.Delete(startMenuLnk);
                }

                string startMenuFolder = Path.Combine(startMenu, "Fight Club Gym");
                if (Directory.Exists(startMenuFolder))
                {
                    Directory.Delete(startMenuFolder, true);
                }
            }
            catch { }
        }

        private static void RemoveRegistryEntry()
        {
            try
            {
                using (RegistryKey key = Registry.CurrentUser.OpenSubKey(@"Software\Microsoft\Windows\CurrentVersion\Uninstall", true))
                {
                    if (key != null)
                    {
                        key.DeleteSubKeyTree("FightClubGym", false);
                    }
                }
            }
            catch { }
        }

        private static void CleanupFiles(string appDir, bool preserveDb)
        {
            try
            {
                string tempScript = Path.Combine(Path.GetTempPath(), "cleanup_fightclubgym.bat");

                string backupCommands = "";
                if (preserveDb)
                {
                    string backupDir = Path.Combine(
                        Environment.GetFolderPath(Environment.SpecialFolder.MyDocuments),
                        "Fight Club Gym Backup"
                    );
                    backupCommands = string.Format(
                        "if not exist \"{0}\" mkdir \"{0}\"\r\nif exist \"{1}\\db\\fight_club.db\" copy /Y \"{1}\\db\\fight_club.db\" \"{0}\"\r\n",
                        backupDir, appDir
                    );
                }

                string batchContent = "@echo off\r\n" +
                    "timeout /t 2 /nobreak >nul\r\n" +
                    backupCommands +
                    string.Format("rd /s /q \"{0}\"\r\n", appDir) +
                    "del \"%~f0\"\r\n";

                File.WriteAllText(tempScript, batchContent);

                ProcessStartInfo psi = new ProcessStartInfo
                {
                    FileName = "cmd.exe",
                    Arguments = "/c \"" + tempScript + "\"",
                    CreateNoWindow = true,
                    WindowStyle = ProcessWindowStyle.Hidden,
                    UseShellExecute = false
                };
                Process.Start(psi);
            }
            catch { }
        }
    }
}
