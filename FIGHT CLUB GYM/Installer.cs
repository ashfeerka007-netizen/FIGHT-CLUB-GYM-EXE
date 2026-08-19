using System;
using System.ComponentModel;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.IO.Compression;
using System.Reflection;
using System.Threading;
using System.Windows.Forms;
using Microsoft.Win32;

namespace FightClubGym
{
    public class InstallerForm : Form
    {
        private Panel headerPanel;
        private Label lblHeaderTitle;
        private Label lblHeaderSubtitle;
        private Panel contentPanel;
        private Panel footerPanel;
        private Button btnNext;
        private Button btnCancel;

        // Step 1 controls
        private Label lblIntro;
        private Label lblDestDir;
        private TextBox txtDestDir;
        private Button btnBrowse;
        private CheckBox chkDesktopShortcut;
        private CheckBox chkStartMenuShortcut;
        private Label lblSpaceReq;

        // Step 2 controls (Installing)
        private Label lblStatus;
        private ProgressBar progressBar;
        private Label lblPercent;

        // Step 3 controls (Complete)
        private Label lblCompleteTitle;
        private Label lblCompleteDesc;
        private CheckBox chkLaunchApp;

        private int currentStep = 1;
        private string installPath = "";
        private BackgroundWorker worker;

        [STAThread]
        public static void Main()
        {
            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);
            Application.Run(new InstallerForm());
        }

        public InstallerForm()
        {
            InitializeComponent();
        }

        private void InitializeComponent()
        {
            this.Text = "Fight Club Gym - Setup Wizard";
            this.Size = new Size(620, 460);
            this.FormBorderStyle = FormBorderStyle.FixedDialog;
            this.MaximizeBox = false;
            this.StartPosition = FormStartPosition.CenterScreen;
            this.BackColor = Color.FromArgb(245, 247, 250);
            this.Font = new Font("Segoe UI", 9F, FontStyle.Regular, GraphicsUnit.Point);

            // Icon
            try
            {
                string iconPath = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "app.ico");
                if (File.Exists(iconPath))
                {
                    this.Icon = new Icon(iconPath);
                }
            }
            catch { }

            // Header Panel
            headerPanel = new Panel();
            headerPanel.Dock = DockStyle.Top;
            headerPanel.Height = 85;
            headerPanel.BackColor = Color.FromArgb(20, 24, 30);
            headerPanel.Paint += (s, e) =>
            {
                using (Pen redLine = new Pen(Color.FromArgb(220, 38, 38), 3))
                {
                    e.Graphics.DrawLine(redLine, 0, headerPanel.Height - 2, headerPanel.Width, headerPanel.Height - 2);
                }
            };

            lblHeaderTitle = new Label();
            lblHeaderTitle.Text = "FIGHT CLUB GYM";
            lblHeaderTitle.Font = new Font("Segoe UI", 14F, FontStyle.Bold);
            lblHeaderTitle.ForeColor = Color.White;
            lblHeaderTitle.Location = new Point(25, 16);
            lblHeaderTitle.AutoSize = true;

            lblHeaderSubtitle = new Label();
            lblHeaderSubtitle.Text = "Membership & Management System Setup";
            lblHeaderSubtitle.Font = new Font("Segoe UI", 9.5F, FontStyle.Regular);
            lblHeaderSubtitle.ForeColor = Color.FromArgb(180, 190, 205);
            lblHeaderSubtitle.Location = new Point(26, 44);
            lblHeaderSubtitle.AutoSize = true;

            headerPanel.Controls.Add(lblHeaderTitle);
            headerPanel.Controls.Add(lblHeaderSubtitle);

            // Footer Panel
            footerPanel = new Panel();
            footerPanel.Dock = DockStyle.Bottom;
            footerPanel.Height = 65;
            footerPanel.BackColor = Color.FromArgb(238, 242, 246);
            footerPanel.Paint += (s, e) =>
            {
                using (Pen borderPen = new Pen(Color.FromArgb(220, 225, 230), 1))
                {
                    e.Graphics.DrawLine(borderPen, 0, 0, footerPanel.Width, 0);
                }
            };

            btnCancel = new Button();
            btnCancel.Text = "Cancel";
            btnCancel.Size = new Size(90, 32);
            btnCancel.Location = new Point(500, 16);
            btnCancel.BackColor = Color.White;
            btnCancel.FlatStyle = FlatStyle.System;
            btnCancel.Click += (s, e) => {
                if (currentStep == 2)
                {
                    MessageBox.Show("Installation is currently in progress...", "Please Wait", MessageBoxButtons.OK, MessageBoxIcon.Information);
                    return;
                }
                Application.Exit();
            };

            btnNext = new Button();
            btnNext.Text = "Install";
            btnNext.Size = new Size(100, 32);
            btnNext.Location = new Point(390, 16);
            btnNext.BackColor = Color.FromArgb(220, 38, 38);
            btnNext.ForeColor = Color.White;
            btnNext.FlatStyle = FlatStyle.System;
            btnNext.Click += BtnNext_Click;

            footerPanel.Controls.Add(btnNext);
            footerPanel.Controls.Add(btnCancel);

            // Content Panel
            contentPanel = new Panel();
            contentPanel.Dock = DockStyle.Fill;
            contentPanel.Padding = new Padding(30, 25, 30, 20);

            // Step 1: Options
            lblIntro = new Label();
            lblIntro.Text = "This setup wizard will install Fight Club Gym Management System on your computer.\r\nPlease select the destination directory and shortcuts:";
            lblIntro.Location = new Point(30, 20);
            lblIntro.Size = new Size(540, 40);

            lblDestDir = new Label();
            lblDestDir.Text = "Installation Folder:";
            lblDestDir.Font = new Font("Segoe UI", 9F, FontStyle.Bold);
            lblDestDir.Location = new Point(30, 72);
            lblDestDir.AutoSize = true;

            string defaultFolder = Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
                "Programs",
                "Fight Club Gym"
            );

            txtDestDir = new TextBox();
            txtDestDir.Text = defaultFolder;
            txtDestDir.Location = new Point(30, 95);
            txtDestDir.Size = new Size(430, 25);

            btnBrowse = new Button();
            btnBrowse.Text = "Browse...";
            btnBrowse.Size = new Size(85, 26);
            btnBrowse.Location = new Point(470, 94);
            btnBrowse.FlatStyle = FlatStyle.System;
            btnBrowse.Click += (s, e) =>
            {
                using (FolderBrowserDialog fbd = new FolderBrowserDialog())
                {
                    fbd.Description = "Select Installation Folder for Fight Club Gym";
                    fbd.SelectedPath = txtDestDir.Text;
                    if (fbd.ShowDialog() == DialogResult.OK)
                    {
                        txtDestDir.Text = Path.Combine(fbd.SelectedPath, "Fight Club Gym");
                    }
                }
            };

            chkDesktopShortcut = new CheckBox();
            chkDesktopShortcut.Text = "Create a Desktop shortcut";
            chkDesktopShortcut.Checked = true;
            chkDesktopShortcut.Location = new Point(30, 140);
            chkDesktopShortcut.AutoSize = true;

            chkStartMenuShortcut = new CheckBox();
            chkStartMenuShortcut.Text = "Create a Start Menu shortcut";
            chkStartMenuShortcut.Checked = true;
            chkStartMenuShortcut.Location = new Point(30, 170);
            chkStartMenuShortcut.AutoSize = true;

            lblSpaceReq = new Label();
            lblSpaceReq.Text = "Space required: ~150 MB";
            lblSpaceReq.ForeColor = Color.FromArgb(100, 110, 120);
            lblSpaceReq.Location = new Point(30, 215);
            lblSpaceReq.AutoSize = true;

            contentPanel.Controls.Add(lblIntro);
            contentPanel.Controls.Add(lblDestDir);
            contentPanel.Controls.Add(txtDestDir);
            contentPanel.Controls.Add(btnBrowse);
            contentPanel.Controls.Add(chkDesktopShortcut);
            contentPanel.Controls.Add(chkStartMenuShortcut);
            contentPanel.Controls.Add(lblSpaceReq);

            // Step 2: Progress Controls (hidden initially)
            lblStatus = new Label();
            lblStatus.Text = "Preparing installation...";
            lblStatus.Location = new Point(30, 50);
            lblStatus.Size = new Size(530, 25);
            lblStatus.Visible = false;

            progressBar = new ProgressBar();
            progressBar.Location = new Point(30, 85);
            progressBar.Size = new Size(530, 24);
            progressBar.Style = ProgressBarStyle.Continuous;
            progressBar.Visible = false;

            lblPercent = new Label();
            lblPercent.Text = "0%";
            lblPercent.Location = new Point(30, 118);
            lblPercent.AutoSize = true;
            lblPercent.ForeColor = Color.FromArgb(80, 90, 100);
            lblPercent.Visible = false;

            contentPanel.Controls.Add(lblStatus);
            contentPanel.Controls.Add(progressBar);
            contentPanel.Controls.Add(lblPercent);

            // Step 3: Complete Controls (hidden initially)
            lblCompleteTitle = new Label();
            lblCompleteTitle.Text = "✓ Installation Completed!";
            lblCompleteTitle.Font = new Font("Segoe UI", 13F, FontStyle.Bold);
            lblCompleteTitle.ForeColor = Color.FromArgb(22, 101, 52);
            lblCompleteTitle.Location = new Point(30, 35);
            lblCompleteTitle.AutoSize = true;
            lblCompleteTitle.Visible = false;

            lblCompleteDesc = new Label();
            lblCompleteDesc.Text = "Fight Club Gym Management System has been successfully installed on your computer.\r\nYou can launch it anytime from your Desktop or Start Menu.";
            lblCompleteDesc.Location = new Point(30, 75);
            lblCompleteDesc.Size = new Size(530, 45);
            lblCompleteDesc.Visible = false;

            chkLaunchApp = new CheckBox();
            chkLaunchApp.Text = "Launch Fight Club Gym Management System now";
            chkLaunchApp.Font = new Font("Segoe UI", 9.5F, FontStyle.Bold);
            chkLaunchApp.Checked = true;
            chkLaunchApp.Location = new Point(30, 140);
            chkLaunchApp.AutoSize = true;
            chkLaunchApp.Visible = false;

            contentPanel.Controls.Add(lblCompleteTitle);
            contentPanel.Controls.Add(lblCompleteDesc);
            contentPanel.Controls.Add(chkLaunchApp);

            // BackgroundWorker
            worker = new BackgroundWorker();
            worker.WorkerReportsProgress = true;
            worker.DoWork += Worker_DoWork;
            worker.ProgressChanged += Worker_ProgressChanged;
            worker.RunWorkerCompleted += Worker_RunWorkerCompleted;

            this.Controls.Add(contentPanel);
            this.Controls.Add(footerPanel);
            this.Controls.Add(headerPanel);
        }

        private void BtnNext_Click(object sender, EventArgs e)
        {
            if (currentStep == 1)
            {
                installPath = txtDestDir.Text.Trim();
                if (string.IsNullOrEmpty(installPath))
                {
                    MessageBox.Show("Please specify a valid installation directory.", "Invalid Path", MessageBoxButtons.OK, MessageBoxIcon.Warning);
                    return;
                }

                currentStep = 2;
                ShowStep2();
                worker.RunWorkerAsync();
            }
            else if (currentStep == 3)
            {
                if (chkLaunchApp.Checked)
                {
                    string exePath = Path.Combine(installPath, "Fight_Club_Gym.exe");
                    if (File.Exists(exePath))
                    {
                        ProcessStartInfo psi = new ProcessStartInfo
                        {
                            FileName = exePath,
                            WorkingDirectory = installPath,
                            UseShellExecute = true
                        };
                        Process.Start(psi);
                    }
                }
                Application.Exit();
            }
        }

        private void ShowStep2()
        {
            lblIntro.Visible = false;
            lblDestDir.Visible = false;
            txtDestDir.Visible = false;
            btnBrowse.Visible = false;
            chkDesktopShortcut.Visible = false;
            chkStartMenuShortcut.Visible = false;
            lblSpaceReq.Visible = false;

            lblStatus.Visible = true;
            progressBar.Visible = true;
            lblPercent.Visible = true;

            btnNext.Enabled = false;
            btnCancel.Enabled = false;
        }

        private void ShowStep3()
        {
            lblStatus.Visible = false;
            progressBar.Visible = false;
            lblPercent.Visible = false;

            lblCompleteTitle.Visible = true;
            lblCompleteDesc.Visible = true;
            chkLaunchApp.Visible = true;

            btnNext.Text = "Finish";
            btnNext.Enabled = true;
            btnCancel.Visible = false;
            currentStep = 3;
        }

        private void Worker_DoWork(object sender, DoWorkEventArgs e)
        {
            try
            {
                worker.ReportProgress(5, "Creating installation directory...");
                if (!Directory.Exists(installPath))
                {
                    Directory.CreateDirectory(installPath);
                }

                worker.ReportProgress(15, "Extracting bundled application payload...");

                Assembly assembly = Assembly.GetExecutingAssembly();
                string[] resourceNames = assembly.GetManifestResourceNames();
                string zipResource = null;
                foreach (string name in resourceNames)
                {
                    if (name.EndsWith(".zip", StringComparison.OrdinalIgnoreCase) || name.IndexOf("payload", StringComparison.OrdinalIgnoreCase) >= 0)
                    {
                        zipResource = name;
                        break;
                    }
                }

                if (zipResource == null)
                {
                    throw new Exception("Embedded installation payload was not found in installer binary.");
                }

                using (Stream stream = assembly.GetManifestResourceStream(zipResource))
                using (ZipArchive archive = new ZipArchive(stream, ZipArchiveMode.Read))
                {
                    int totalEntries = archive.Entries.Count;
                    int count = 0;

                    foreach (ZipArchiveEntry entry in archive.Entries)
                    {
                        count++;
                        int progress = 20 + (int)(((double)count / totalEntries) * 60);

                        string destinationPath = Path.GetFullPath(Path.Combine(installPath, entry.FullName));
                        if (!destinationPath.StartsWith(Path.GetFullPath(installPath), StringComparison.OrdinalIgnoreCase))
                        {
                            continue;
                        }

                        if (string.IsNullOrEmpty(entry.Name))
                        {
                            Directory.CreateDirectory(destinationPath);
                        }
                        else
                        {
                            string dir = Path.GetDirectoryName(destinationPath);
                            if (!Directory.Exists(dir))
                            {
                                Directory.CreateDirectory(dir);
                            }
                            entry.ExtractToFile(destinationPath, true);
                        }

                        if (count % 10 == 0 || count == totalEntries)
                        {
                            worker.ReportProgress(progress, string.Format("Extracting: {0}", entry.Name));
                        }
                    }
                }

                worker.ReportProgress(85, "Configuring shortcuts...");
                string targetExe = Path.Combine(installPath, "Fight_Club_Gym.exe");
                string iconFile = Path.Combine(installPath, "app.ico");

                if (chkDesktopShortcut.Checked)
                {
                    string desktopPath = Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory);
                    string desktopLnk = Path.Combine(desktopPath, "Fight Club Gym.lnk");
                    CreateShortcut(desktopLnk, targetExe, iconFile, installPath, "Fight Club Gym Management System");
                }

                if (chkStartMenuShortcut.Checked)
                {
                    string startMenu = Path.Combine(
                        Environment.GetFolderPath(Environment.SpecialFolder.StartMenu),
                        "Programs"
                    );
                    string startMenuLnk = Path.Combine(startMenu, "Fight Club Gym.lnk");
                    CreateShortcut(startMenuLnk, targetExe, iconFile, installPath, "Fight Club Gym Management System");
                }

                worker.ReportProgress(95, "Registering in Windows Installed Apps...");
                RegisterUninstall(installPath, iconFile);

                worker.ReportProgress(100, "Installation complete!");
                Thread.Sleep(500);
            }
            catch (Exception ex)
            {
                e.Result = ex;
            }
        }

        private void Worker_ProgressChanged(object sender, ProgressChangedEventArgs e)
        {
            progressBar.Value = Math.Min(100, Math.Max(0, e.ProgressPercentage));
            lblPercent.Text = string.Format("{0}%", progressBar.Value);
            if (e.UserState != null)
            {
                lblStatus.Text = e.UserState.ToString();
            }
        }

        private void Worker_RunWorkerCompleted(object sender, RunWorkerCompletedEventArgs e)
        {
            Exception ex = e.Result as Exception;
            if (ex != null)
            {
                MessageBox.Show("Installation encountered an error:\n\n" + ex.Message, "Installation Failed", MessageBoxButtons.OK, MessageBoxIcon.Error);
                btnNext.Enabled = true;
                btnNext.Text = "Retry";
                btnCancel.Enabled = true;
                currentStep = 1;
                return;
            }

            ShowStep3();
        }

        private static void CreateShortcut(string shortcutPath, string targetPath, string iconPath, string workingDir, string description)
        {
            try
            {
                string vbsScript = Path.Combine(Path.GetTempPath(), Guid.NewGuid().ToString("N") + ".vbs");
                string vbsContent = string.Format(
                    "Set WshShell = CreateObject(\"WScript.Shell\")\r\n" +
                    "Set Shortcut = WshShell.CreateShortcut(\"{0}\")\r\n" +
                    "Shortcut.TargetPath = \"{1}\"\r\n" +
                    "Shortcut.WorkingDirectory = \"{2}\"\r\n" +
                    "Shortcut.Description = \"{3}\"\r\n" +
                    "{4}" +
                    "Shortcut.Save\r\n",
                    shortcutPath.Replace("\\", "\\\\"),
                    targetPath.Replace("\\", "\\\\"),
                    workingDir.Replace("\\", "\\\\"),
                    description,
                    File.Exists(iconPath) ? string.Format("Shortcut.IconLocation = \"{0},0\"\r\n", iconPath.Replace("\\", "\\\\")) : ""
                );

                File.WriteAllText(vbsScript, vbsContent);

                ProcessStartInfo psi = new ProcessStartInfo
                {
                    FileName = "cscript.exe",
                    Arguments = "//Nologo \"" + vbsScript + "\"",
                    CreateNoWindow = true,
                    WindowStyle = ProcessWindowStyle.Hidden,
                    UseShellExecute = false
                };
                Process proc = Process.Start(psi);
                if (proc != null)
                {
                    proc.WaitForExit(3000);
                }

                if (File.Exists(vbsScript))
                {
                    File.Delete(vbsScript);
                }
            }
            catch { }
        }

        private static void RegisterUninstall(string appDir, string iconFile)
        {
            try
            {
                string keyPath = @"Software\Microsoft\Windows\CurrentVersion\Uninstall\FightClubGym";
                using (RegistryKey key = Registry.CurrentUser.CreateSubKey(keyPath))
                {
                    if (key != null)
                    {
                        key.SetValue("DisplayName", "Fight Club Gym Management System");
                        key.SetValue("DisplayVersion", "1.0.0");
                        key.SetValue("Publisher", "Fight Club Gym");
                        key.SetValue("InstallLocation", appDir);
                        key.SetValue("DisplayIcon", iconFile);
                        key.SetValue("UninstallString", "\"" + Path.Combine(appDir, "Uninstall.exe") + "\"");
                        key.SetValue("NoModify", 1, RegistryValueKind.DWord);
                        key.SetValue("NoRepair", 1, RegistryValueKind.DWord);
                    }
                }
            }
            catch { }
        }
    }
}
