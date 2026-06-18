#pragma warning disable CA1416 // Validate platform compatibility
using Microsoft.Win32;
using System;
using System.Diagnostics;
using System.IO;
using System.IO.Compression;
using System.Net.Http;
using System.Threading.Tasks;

namespace PeercordInstaller.Installers
{
    public class Windows
    {
        // TODO: Replace this with the direct link to your Peercord Windows .zip release
        private const string DOWNLOAD_URL = "https://storage.peercord.chat/Peercord%20Release/peercord-win32-x64.zip";

        public void AppendLog(string text) => Utils.Instance.AppendLog(text);

        public static string GetInstallPath()
        {
            try
            {
                using var key = Registry.CurrentUser.OpenSubKey(@"Software\Peercord");
                return key?.GetValue("InstallPath") as string;
            }
            catch
            {
                return null;
            }
        }

        public static void SetInstallPath(string path)
        {
            try
            {
                using var key = Registry.CurrentUser.CreateSubKey(@"Software\Peercord");
                key.SetValue("InstallPath", path);
            }
            catch { }
        }

        public static void RemoveInstallPath()
        {
            try
            {
                Registry.CurrentUser.DeleteSubKeyTree(@"Software\Peercord", false);
            }
            catch { }
        }

        public async Task<string> InstallPeercordWindowsAsync(string targetDir)
        {
            Utils.Instance.SetProgress(10, "Downloading Peercord...");
            string zipPath = Path.Combine(Path.GetTempPath(), "Peercord.zip");

            await DownloadFileAsync(DOWNLOAD_URL, zipPath);

            Utils.Instance.SetProgress(70, "Extracting files...");
            AppendLog($"[{DateTime.Now:yyyy-MM-dd HH:mm:ss}] [INFO] Extracting files to {targetDir}...\n");

            if (!Directory.Exists(targetDir))
            {
                Directory.CreateDirectory(targetDir);
            }

            using (ZipArchive archive = ZipFile.OpenRead(zipPath))
            {
                int totalFiles = archive.Entries.Count;
                int extracted = 0;

                foreach (ZipArchiveEntry entry in archive.Entries)
                {
                    string destinationPath = Path.GetFullPath(Path.Combine(targetDir, entry.FullName));

                    // Prevent ZipSlip vulnerability
                    if (!destinationPath.StartsWith(Path.GetFullPath(targetDir), StringComparison.Ordinal))
                        continue;

                    if (entry.FullName.EndsWith("/") || entry.FullName.EndsWith("\\"))
                    {
                        Directory.CreateDirectory(destinationPath);
                    }
                    else
                    {
                        Directory.CreateDirectory(Path.GetDirectoryName(destinationPath));
                        entry.ExtractToFile(destinationPath, true);
                    }

                    extracted++;
                    if (extracted % 50 == 0 || extracted == totalFiles)
                    {
                        int percent = 70 + (int)((extracted / (double)totalFiles) * 20); // 70 to 90
                        Utils.Instance.SetProgress(percent, "Extracting files...");
                        AppendLog($"\r[{DateTime.Now:yyyy-MM-dd HH:mm:ss}] [PROGRESS] Extracting... {extracted}/{totalFiles} files ({(extracted / (double)totalFiles):P0})");
                    }
                }
            }

            AppendLog($"\n[{DateTime.Now:yyyy-MM-dd HH:mm:ss}] [INFO] Extraction complete.\n");
            File.Delete(zipPath);

            string exePath = Path.Combine(targetDir, "Peercord.exe");

            // Save installation record
            SetInstallPath(targetDir);

            AppendLog($"[{DateTime.Now:yyyy-MM-dd HH:mm:ss}] [INFO] Peercord installed successfully.\n");
            return exePath;
        }

        public async Task UninstallPeercordWindowsAsync(string targetDir)
        {
            Utils.Instance.SetProgress(10, "Preparing uninstallation...");
            AppendLog($"[{DateTime.Now:yyyy-MM-dd HH:mm:ss}] [INFO] Starting uninstallation from {targetDir}...\n");

            Utils.Instance.SetProgress(30, "Removing shortcuts...");
            string desktopPath = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory), "Peercord.lnk");
            if (File.Exists(desktopPath))
            {
                File.Delete(desktopPath);
                AppendLog($"[{DateTime.Now:yyyy-MM-dd HH:mm:ss}] [INFO] Removed Desktop shortcut.\n");
            }

            string startMenuPath = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.StartMenu), "Programs", "Peercord.lnk");
            if (File.Exists(startMenuPath))
            {
                File.Delete(startMenuPath);
                AppendLog($"[{DateTime.Now:yyyy-MM-dd HH:mm:ss}] [INFO] Removed Start Menu shortcut.\n");
            }

            Utils.Instance.SetProgress(50, "Removing files...");
            if (Directory.Exists(targetDir))
            {
                Directory.Delete(targetDir, true);
                AppendLog($"[{DateTime.Now:yyyy-MM-dd HH:mm:ss}] [INFO] Removed installation directory.\n");
            }

            Utils.Instance.SetProgress(90, "Cleaning up registry...");
            RemoveInstallPath();
            AppendLog($"[{DateTime.Now:yyyy-MM-dd HH:mm:ss}] [INFO] Removed registry records.\n");

            AppendLog($"[{DateTime.Now:yyyy-MM-dd HH:mm:ss}] [INFO] Uninstallation complete.\n");
            Utils.Instance.SetProgress(100, "Done!");
        }

        public void CreateStartMenuShortcut(string targetDir, string exePath)
        {
            try
            {
                AppendLog($"[{DateTime.Now:yyyy-MM-dd HH:mm:ss}] [INFO] Creating Start Menu shortcut...\n");
                IShellLinkW link = (IShellLinkW)new ShellLink();
                link.SetPath(exePath);
                link.SetWorkingDirectory(targetDir);
                link.SetDescription("Peercord P2P Client");

                IPersistFile file = (IPersistFile)link;

                string startMenuPath = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.StartMenu), "Programs");
                Directory.CreateDirectory(startMenuPath);
                string startMenuShortcutPath = Path.Combine(startMenuPath, "Peercord.lnk");
                file.Save(startMenuShortcutPath, false);

                AppendLog($"[{DateTime.Now:yyyy-MM-dd HH:mm:ss}] [INFO] Start Menu shortcut created.\n");
            }
            catch (Exception ex)
            {
                AppendLog($"[{DateTime.Now:yyyy-MM-dd HH:mm:ss}] [ERROR] Failed to create Start Menu shortcut: {ex.Message}\n");
            }
        }

        public void CreateDesktopShortcut(string targetDir, string exePath)
        {
            try
            {
                AppendLog($"[{DateTime.Now:yyyy-MM-dd HH:mm:ss}] [INFO] Creating Desktop shortcut...\n");
                string desktopPath = Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory);
                string desktopShortcutPath = Path.Combine(desktopPath, "Peercord.lnk");

                IShellLinkW link = (IShellLinkW)new ShellLink();
                link.SetPath(exePath);
                link.SetWorkingDirectory(targetDir);
                link.SetDescription("Peercord P2P Client");

                IPersistFile file = (IPersistFile)link;
                file.Save(desktopShortcutPath, false);

                AppendLog($"[{DateTime.Now:yyyy-MM-dd HH:mm:ss}] [INFO] Desktop shortcut created.\n");
            }
            catch (Exception ex)
            {
                AppendLog($"[{DateTime.Now:yyyy-MM-dd HH:mm:ss}] [ERROR] Failed to create Desktop shortcut: {ex.Message}\n");
            }
        }

        private async Task DownloadFileAsync(string url, string destination)
        {
            AppendLog($"[{DateTime.Now:yyyy-MM-dd HH:mm:ss}] [INFO] Downloading Peercord from {url}...\n");
            using var client = new HttpClient();
            using var response = await client.GetAsync(url, HttpCompletionOption.ResponseHeadersRead);
            response.EnsureSuccessStatusCode();

            long? totalBytes = response.Content.Headers.ContentLength;
            using var contentStream = await response.Content.ReadAsStreamAsync();
            using var fileStream = new FileStream(destination, FileMode.Create, FileAccess.Write, FileShare.None, 8192, true);

            var buffer = new byte[8192];
            long totalRead = 0;
            int bytesRead;
            var stopwatch = Stopwatch.StartNew();
            long lastReportTime = 0;

            while ((bytesRead = await contentStream.ReadAsync(buffer, 0, buffer.Length)) > 0)
            {
                await fileStream.WriteAsync(buffer, 0, bytesRead);
                totalRead += bytesRead;

                if (stopwatch.ElapsedMilliseconds - lastReportTime > 500 || totalRead == totalBytes)
                {
                    lastReportTime = stopwatch.ElapsedMilliseconds;
                    double speedMb = (totalRead / 1024.0 / 1024.0) / (stopwatch.ElapsedMilliseconds / 1000.0);

                    if (totalBytes.HasValue)
                    {
                        double percentage = (double)totalRead / totalBytes.Value * 100;
                        AppendLog($"\r[{DateTime.Now:yyyy-MM-dd HH:mm:ss}] [PROGRESS] Downloading... {percentage:F1}% ({speedMb:F2} MB/s)");
                    }
                    else
                    {
                        AppendLog($"\r[{DateTime.Now:yyyy-MM-dd HH:mm:ss}] [PROGRESS] Downloading... {totalRead / 1024.0 / 1024.0:F2} MB ({speedMb:F2} MB/s)");
                    }
                }
            }
            AppendLog($"\n[{DateTime.Now:yyyy-MM-dd HH:mm:ss}] [INFO] Download complete.\n");
        }
    }
}