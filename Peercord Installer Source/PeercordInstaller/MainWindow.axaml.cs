using Avalonia.Controls;
using Avalonia.Interactivity;
using Avalonia.Platform.Storage;
using Avalonia.Threading;
using PeercordInstaller.Installers;
using System;
using System.Collections.Generic;
using System.IO;
using System.Runtime.InteropServices;
using System.Threading.Tasks;

namespace PeercordInstaller;

public partial class MainWindow : Window
{
    private int _currentStep = 0;
    private readonly object _logLock = new object();
    private bool _lastCharWasCr = false;
    private string _currentLine = "";
    private List<string> _logLines = new List<string>();
    private string _installedExePath = "";
    private string _existingInstallPath = "";
    private bool _isBusy = false;

    Installers.Windows windowsInstaller;
    Installers.Linux linuxInstaller;

    public MainWindow()
    {
        InitializeComponent();
        Utils.Instance = new Utils(AppendLog, SetProgress);

        // Set default installation paths and OS specific UI
        if (RuntimeInformation.IsOSPlatform(OSPlatform.Windows))
        {
            InstallLocationBox.Text = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "peercord");
            MenuShortcutCheckBox.Content = "Create Start Menu Shortcut";
            _existingInstallPath = Installers.Windows.GetInstallPath();
        }
        else
        {
            InstallLocationBox.Text = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.UserProfile), ".local", "bin", "peercord");
            MenuShortcutCheckBox.Content = "Create App Menu Shortcut";
            _existingInstallPath = Installers.Linux.GetInstallPath();
        }

        // Check if already installed
        if (!string.IsNullOrEmpty(_existingInstallPath) && Directory.Exists(_existingInstallPath))
        {
            WelcomePage.IsVisible = false;
            UninstallWelcomePage.IsVisible = true;
            NextButton.Content = "Uninstall";
            _currentStep = 10;
        }
    }

    protected override void OnClosing(WindowClosingEventArgs e)
    {
        if (_isBusy)
        {
            e.Cancel = true;
        }
        base.OnClosing(e);
    }

    private async void BrowseButton_Click(object sender, RoutedEventArgs e)
    {
        var result = await StorageProvider.OpenFolderPickerAsync(new FolderPickerOpenOptions
        {
            Title = "Select Installation Folder",
            AllowMultiple = false
        });

        if (result != null && result.Count > 0)
        {
            InstallLocationBox.Text = Path.Combine(result[0].Path.LocalPath, "peercord");
        }
    }

    private async void NextButton_Click(object sender, RoutedEventArgs e)
    {
        if (_currentStep == 0)
        {
            // Welcome -> Location
            WelcomePage.IsVisible = false;
            LocationPage.IsVisible = true;
            _currentStep = 1;
        }
        else if (_currentStep == 1)
        {
            // Location -> Install
            string targetDir = InstallLocationBox.Text;
            if (string.IsNullOrWhiteSpace(targetDir)) return;

            LocationPage.IsVisible = false;
            InstallPage.IsVisible = true;
            NextButton.IsEnabled = false;
            CancelButton.IsEnabled = false;
            _currentStep = 2;
            _isBusy = true;

            await Task.Run(async () => await RunInstallationAsync(targetDir));

            // Installation finished (success). Stay on Install page to let user read logs.
            Dispatcher.UIThread.Post(() =>
            {
                _isBusy = false;
                NextButton.Content = "Next";
                NextButton.IsEnabled = true;
                CancelButton.IsEnabled = true;
                _currentStep = 3;
            });
        }
        else if (_currentStep == 3)
        {
            // Install -> Finish
            InstallPage.IsVisible = false;
            FinishPage.IsVisible = true;
            NextButton.Content = "Finish";
            _currentStep = 4;
        }
        else if (_currentStep == 4)
        {
            // Finish clicked
            string targetDir = InstallLocationBox.Text;

            if (DesktopShortcutCheckBox.IsChecked == true && !string.IsNullOrEmpty(_installedExePath))
            {
                if (RuntimeInformation.IsOSPlatform(OSPlatform.Windows))
                {
                    windowsInstaller?.CreateDesktopShortcut(targetDir, _installedExePath);
                }
                else if (RuntimeInformation.IsOSPlatform(OSPlatform.Linux))
                {
                    if (linuxInstaller != null)
                    {
                        await linuxInstaller.CreateDesktopShortcut(_installedExePath, targetDir);
                    }
                }
            }

            if (MenuShortcutCheckBox.IsChecked == true && !string.IsNullOrEmpty(_installedExePath))
            {
                if (RuntimeInformation.IsOSPlatform(OSPlatform.Windows))
                {
                    windowsInstaller?.CreateStartMenuShortcut(targetDir, _installedExePath);
                }
                else if (RuntimeInformation.IsOSPlatform(OSPlatform.Linux))
                {
                    if (linuxInstaller != null)
                    {
                        await linuxInstaller.CreateAppMenuShortcut(_installedExePath, targetDir);
                    }
                }
            }

            if (LaunchCheckBox.IsChecked == true && !string.IsNullOrEmpty(_installedExePath))
            {
                Utils.LaunchPeercord(_installedExePath);
            }
            Close();
        }
        else if (_currentStep == 5)
        {
            // Failed state, just close
            Close();
        }
        else if (_currentStep == 10)
        {
            // Uninstall Welcome -> Uninstall Progress
            UninstallWelcomePage.IsVisible = false;
            InstallPage.IsVisible = true;
            NextButton.IsEnabled = false;
            CancelButton.IsEnabled = false;
            _currentStep = 11;
            _isBusy = true;

            await Task.Run(async () => await RunUninstallAsync(_existingInstallPath));

            Dispatcher.UIThread.Post(() =>
            {
                _isBusy = false;
                NextButton.Content = "Next";
                NextButton.IsEnabled = true;
                CancelButton.IsEnabled = true;
                _currentStep = 12;
            });
        }
        else if (_currentStep == 12)
        {
            // Uninstall Progress -> Uninstall Finish
            InstallPage.IsVisible = false;
            UninstallFinishPage.IsVisible = true;
            NextButton.Content = "Finish";
            _currentStep = 13;
        }
        else if (_currentStep == 13)
        {
            // Uninstall Finish clicked
            Close();
        }
    }

    private void CancelButton_Click(object sender, RoutedEventArgs e)
    {
        Close();
    }

    public void AppendLog(string text)
    {
        lock (_logLock)
        {
            foreach (char c in text)
            {
                if (c == '\n')
                {
                    _logLines.Add(_currentLine);
                    _currentLine = "";
                    _lastCharWasCr = false;
                }
                else if (c == '\r')
                {
                    _lastCharWasCr = true;
                }
                else
                {
                    if (_lastCharWasCr)
                    {
                        _currentLine = ""; // overwrite current line
                        _lastCharWasCr = false;
                    }
                    _currentLine += c;
                }
            }

            if (_logLines.Count > 1000)
            {
                _logLines.RemoveRange(0, _logLines.Count - 1000);
            }

            string display = string.Join(Environment.NewLine, _logLines);
            if (!string.IsNullOrEmpty(_currentLine))
            {
                if (display.Length > 0) display += Environment.NewLine;
                display += _currentLine;
            }

            Dispatcher.UIThread.Post(() =>
            {
                LogText.Text = display;
                LogScrollViewer.ScrollToEnd();
            });
        }
    }

    private void SetProgress(int value, string status)
    {
        Dispatcher.UIThread.Post(() =>
        {
            InstallProgress.Value = value;
            StatusText.Text = status;
        });
    }

    private async Task RunInstallationAsync(string targetDir)
    {
        try
        {
            bool isWindows = RuntimeInformation.IsOSPlatform(OSPlatform.Windows);
            bool isLinux = RuntimeInformation.IsOSPlatform(OSPlatform.Linux);

            AppendLog($"[{DateTime.Now:yyyy-MM-dd HH:mm:ss}] [INFO] Starting installation process...\n");
            AppendLog($"[{DateTime.Now:yyyy-MM-dd HH:mm:ss}] [INFO] Target directory: {targetDir}\n");

            if (isWindows)
            {
                windowsInstaller = new Installers.Windows();
                _installedExePath = await windowsInstaller.InstallPeercordWindowsAsync(targetDir);
                Utils.Instance.SetProgress(100, "Done!");
            }
            else if (isLinux)
            {
                linuxInstaller = new Installers.Linux();
                _installedExePath = await linuxInstaller.InstallPeercordLinuxAsync(targetDir);
                Utils.Instance.SetProgress(100, "Done!");
            }
            else
            {
                AppendLog($"[{DateTime.Now:yyyy-MM-dd HH:mm:ss}] [ERROR] Unsupported Operating System.\n");
            }
        }
        catch (Exception ex)
        {
            AppendLog($"\n[{DateTime.Now:yyyy-MM-dd HH:mm:ss}] [ERROR] {ex.Message}\n");
            SetProgress(100, "Installation Failed.");
            Dispatcher.UIThread.Post(() =>
            {
                _isBusy = false;
                NextButton.Content = "Close";
                NextButton.IsEnabled = true;
                CancelButton.IsEnabled = true;
                _currentStep = 5;
            });
        }
    }

    private async Task RunUninstallAsync(string targetDir)
    {
        try
        {
            bool isWindows = RuntimeInformation.IsOSPlatform(OSPlatform.Windows);
            bool isLinux = RuntimeInformation.IsOSPlatform(OSPlatform.Linux);

            if (isWindows)
            {
                windowsInstaller = new Installers.Windows();
                await windowsInstaller.UninstallPeercordWindowsAsync(targetDir);
            }
            else if (isLinux)
            {
                linuxInstaller = new Installers.Linux();
                await linuxInstaller.UninstallPeercordLinuxAsync(targetDir);
            }
        }
        catch (Exception ex)
        {
            AppendLog($"\n[{DateTime.Now:yyyy-MM-dd HH:mm:ss}] [ERROR] {ex.Message}\n");
            SetProgress(100, "Uninstallation Failed.");
            Dispatcher.UIThread.Post(() =>
            {
                _isBusy = false;
                NextButton.Content = "Close";
                NextButton.IsEnabled = true;
                CancelButton.IsEnabled = true;
                _currentStep = 5;
            });
        }
    }
}