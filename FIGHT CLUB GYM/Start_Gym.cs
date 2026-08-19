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

        [STAThread]
        static void Main()
        {
            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);

            appDir = AppDomain.CurrentDomain.BaseDirectory;

            bool portActive = IsPortInUse(5000);

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
            MenuItem openItem = new MenuItem("Open Fight Club Gym", (s, e) => OpenBrowser());
            openItem.DefaultItem = true;
            MenuItem restartItem = new MenuItem("Restart Server", (s, e) => RestartServer());
            MenuItem exitItem = new MenuItem("Exit App", (s, e) => ExitApp());

            contextMenu.MenuItems.Add(openItem);
            contextMenu.MenuItems.Add(restartItem);
            contextMenu.MenuItems.Add("-");
            contextMenu.MenuItems.Add(exitItem);

            notifyIcon.ContextMenu = contextMenu;
            notifyIcon.DoubleClick += (s, e) => OpenBrowser();

            if (!portActive)
            {
                Thread.Sleep(1200);
            }

            OpenBrowser();

            notifyIcon.ShowBalloonTip(3000, "Fight Club Gym Started", "System is running at " + serverUrl, ToolTipIcon.Info);

            Application.Run();
        }

        private static bool IsPortInUse(int port)
        {
            try
            {
                using (TcpClient client = new TcpClient())
                {
                    var result = client.BeginConnect("127.0.0.1", port, null, null);
                    bool success = result.AsyncWaitHandle.WaitOne(TimeSpan.FromMilliseconds(500));
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

        private static void StartNodeServer()
        {
            string serverFile = Path.Combine(appDir, "server", "index.js");
            if (!File.Exists(serverFile))
            {
                MessageBox.Show("Could not find server/index.js in: " + appDir, "Fight Club Gym Error", MessageBoxButtons.OK, MessageBoxIcon.Error);
                return;
            }

            ProcessStartInfo psi = new ProcessStartInfo
            {
                FileName = "node.exe",
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
            catch (Exception ex)
            {
                psi.FileName = "node";
                try
                {
                    nodeProcess = Process.Start(psi);
                }
                catch
                {
                    MessageBox.Show("Node.js is not installed or not found in PATH!\nError: " + ex.Message, "Fight Club Gym Error", MessageBoxButtons.OK, MessageBoxIcon.Error);
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

        private static void RestartServer()
        {
            StopNodeServer();
            Thread.Sleep(1000);
            StartNodeServer();
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
