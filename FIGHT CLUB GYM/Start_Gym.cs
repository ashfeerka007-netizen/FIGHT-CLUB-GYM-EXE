using System;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Net.Sockets;
using System.Threading;
using System.Windows.Forms;

namespace FightClubGym
{
    static class Program
    {
        private static Process nodeProcess = null;
        private static NotifyIcon notifyIcon;
        private static string appDir;
        private static string serverUrl = "http://localhost:5000";
        private static int serverPort = 5000;

        [STAThread]
        static void Main()
        {
            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);

            appDir = AppDomain.CurrentDomain.BaseDirectory.TrimEnd(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar);

            bool portActive = IsPortInUse(serverPort);

            if (!portActive)
            {
                StartNodeServer();
            }

            // Create Tray Icon
            notifyIcon = new NotifyIcon();
            
            string iconPath = Path.Combine(appDir, "app.ico");
            if (File.Exists(iconPath))
            {
                try
                {
                    notifyIcon.Icon = new Icon(iconPath);
                }
                catch
                {
                    notifyIcon.Icon = SystemIcons.Application;
                }
            }
            else
            {
                notifyIcon.Icon = SystemIcons.Application;
            }

            notifyIcon.Text = "Fight Club Gym Management System";
            notifyIcon.Visible = true;

            // Context Menu
            ContextMenu contextMenu = new ContextMenu();
            MenuItem openItem = new MenuItem("⚡ Open Fight Club Gym", (s, e) => OpenBrowser());
            openItem.DefaultItem = true;
            Font boldFont = new Font(openItem.Text, 9.0f, FontStyle.Bold);

            MenuItem restartItem = new MenuItem("🔄 Restart Server", (s, e) => RestartServer());
            MenuItem appFolderItem = new MenuItem("📁 Open App Folder", (s, e) => OpenDirectory(appDir));
            MenuItem dbFolderItem = new MenuItem("💾 Open Database Folder", (s, e) => OpenDirectory(Path.Combine(appDir, "db")));
            MenuItem exitItem = new MenuItem("❌ Exit Application", (s, e) => ExitApp());

            contextMenu.MenuItems.Add(openItem);
            contextMenu.MenuItems.Add(restartItem);
            contextMenu.MenuItems.Add("-");
            contextMenu.MenuItems.Add(appFolderItem);
            contextMenu.MenuItems.Add(dbFolderItem);
            contextMenu.MenuItems.Add("-");
            contextMenu.MenuItems.Add(exitItem);

            notifyIcon.ContextMenu = contextMenu;
            notifyIcon.DoubleClick += (s, e) => OpenBrowser();

            if (!portActive)
            {
                WaitForServerReady(serverPort, 10000);
            }

            OpenBrowser();

            notifyIcon.ShowBalloonTip(3000, "Fight Club Gym Started", "System is running at " + serverUrl, ToolTipIcon.Info);

            Application.ApplicationExit += (s, e) => StopNodeServer();
            AppDomain.CurrentDomain.ProcessExit += (s, e) => StopNodeServer();

            Application.Run();
        }

        private static bool IsPortInUse(int port)
        {
            try
            {
                using (TcpClient client = new TcpClient())
                {
                    var result = client.BeginConnect("127.0.0.1", port, null, null);
                    bool success = result.AsyncWaitHandle.WaitOne(TimeSpan.FromMilliseconds(400));
                    if (success)
                    {
                        client.EndConnect(result);
                        return true;
                    }
                }
            }
            catch { }
            return false;
        }

        private static void WaitForServerReady(int port, int timeoutMs)
        {
            int elapsed = 0;
            int interval = 200;
            while (elapsed < timeoutMs)
            {
                if (IsPortInUse(port))
                {
                    return;
                }
                Thread.Sleep(interval);
                elapsed += interval;
            }
        }

        private static void StartNodeServer()
        {
            string serverFile = Path.Combine(appDir, "server", "index.js");
            if (!File.Exists(serverFile))
            {
                MessageBox.Show("Could not find server/index.js in:\n" + appDir, "Fight Club Gym Error", MessageBoxButtons.OK, MessageBoxIcon.Error);
                return;
            }

            // Determine node executable: local bundled first, then bin\node.exe, then system PATH
            string nodeExe = "node.exe";
            string localNode = Path.Combine(appDir, "node.exe");
            string binNode = Path.Combine(appDir, "bin", "node.exe");

            if (File.Exists(localNode))
            {
                nodeExe = localNode;
            }
            else if (File.Exists(binNode))
            {
                nodeExe = binNode;
            }

            ProcessStartInfo psi = new ProcessStartInfo
            {
                FileName = nodeExe,
                Arguments = "\"" + serverFile + "\"",
                WorkingDirectory = appDir,
                UseShellExecute = false,
                CreateNoWindow = true,
                WindowStyle = ProcessWindowStyle.Hidden
            };

            try
            {
                nodeProcess = Process.Start(psi);
            }
            catch (Exception)
            {
                // Fallback to system node
                try
                {
                    psi.FileName = "node";
                    nodeProcess = Process.Start(psi);
                }
                catch (Exception sysEx)
                {
                    MessageBox.Show("Failed to launch Node.js server!\n\nTried:\n" + nodeExe + "\n\nError: " + sysEx.Message, "Fight Club Gym Error", MessageBoxButtons.OK, MessageBoxIcon.Error);
                }
            }
        }

        private static void OpenBrowser()
        {
            try
            {
                Process.Start(new ProcessStartInfo
                {
                    FileName = serverUrl,
                    UseShellExecute = true
                });
            }
            catch (Exception ex)
            {
                MessageBox.Show("Could not open browser: " + ex.Message, "Error", MessageBoxButtons.OK, MessageBoxIcon.Error);
            }
        }

        private static void OpenDirectory(string path)
        {
            try
            {
                if (!Directory.Exists(path))
                {
                    Directory.CreateDirectory(path);
                }
                Process.Start(new ProcessStartInfo
                {
                    FileName = "explorer.exe",
                    Arguments = "\"" + path + "\"",
                    UseShellExecute = true
                });
            }
            catch (Exception ex)
            {
                MessageBox.Show("Could not open directory: " + ex.Message, "Error", MessageBoxButtons.OK, MessageBoxIcon.Error);
            }
        }

        private static void RestartServer()
        {
            StopNodeServer();
            Thread.Sleep(800);
            StartNodeServer();
            WaitForServerReady(serverPort, 5000);
            notifyIcon.ShowBalloonTip(2000, "Fight Club Gym", "Server restarted successfully.", ToolTipIcon.Info);
        }

        private static void StopNodeServer()
        {
            if (nodeProcess != null && !nodeProcess.HasExited)
            {
                try
                {
                    nodeProcess.Kill();
                    nodeProcess.WaitForExit(2000);
                }
                catch { }
                nodeProcess = null;
            }
        }

        private static void ExitApp()
        {
            StopNodeServer();
            if (notifyIcon != null)
            {
                notifyIcon.Visible = false;
                notifyIcon.Dispose();
            }
            Application.ExitThread();
            Environment.Exit(0);
        }
    }
}
