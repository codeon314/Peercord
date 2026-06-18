using System;
using System.Diagnostics;
using System.IO;
using System.IO.Compression;
using System.Net.Http;
using System.Security.Cryptography;
using System.Threading.Tasks;

namespace PeercordInstaller.Installers
{
    public class Linux
    {
        // TODO: Replace this with the direct link to your Peercord Linux .zip release
        private const string DOWNLOAD_URL = "https://storage.peercord.chat/Peercord%20Release/peercord-linux-x64.zip";

        public void AppendLog(string text) => Utils.Instance.AppendLog(text);

        public static string GetInstallPath()
        {
            try
            {
                string path = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "peercord", "install_path.txt");
                if (File.Exists(path))
                {
                    return File.ReadAllText(path).Trim();
                }
            }
            catch { }
            return null;
        }

        public static void SetInstallPath(string targetDir)
        {
            try
            {
                string dirPath = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "peercord");
                Directory.CreateDirectory(dirPath);
                File.WriteAllText(Path.Combine(dirPath, "install_path.txt"), targetDir);
            }
            catch { }
        }

        public static void RemoveInstallPath()
        {
            try
            {
                string path = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "peercord", "install_path.txt");
                if (File.Exists(path))
                {
                    File.Delete(path);
                }
            }
            catch { }
        }

        public async Task<string> InstallPeercordLinuxAsync(string targetDir)
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

            // Extract zip, handling Windows-style backslashes in zip entries on Linux
            using (ZipArchive archive = ZipFile.OpenRead(zipPath))
            {
                int totalFiles = archive.Entries.Count;
                int extracted = 0;

                foreach (ZipArchiveEntry entry in archive.Entries)
                {
                    // Replace backslashes with forward slashes for Linux compatibility
                    string fixedName = entry.FullName.Replace('\\', '/');
                    string destinationPath = Path.GetFullPath(Path.Combine(targetDir, fixedName));

                    // Prevent ZipSlip vulnerability
                    if (!destinationPath.StartsWith(Path.GetFullPath(targetDir), StringComparison.Ordinal))
                        continue;

                    if (fixedName.EndsWith("/"))
                    {
                        // It's a directory
                        Directory.CreateDirectory(destinationPath);
                    }
                    else
                    {
                        // It's a file, ensure its parent directory exists
                        Directory.CreateDirectory(Path.GetDirectoryName(destinationPath));
                        entry.ExtractToFile(destinationPath, true);
                    }

                    extracted++;
                    if (extracted % 50 == 0 || extracted == totalFiles)
                    {
                        int percent = 70 + (int)((extracted / (double)totalFiles) * 10); // 70 to 80
                        Utils.Instance.SetProgress(percent, "Extracting files...");
                        AppendLog($"\r[{DateTime.Now:yyyy-MM-dd HH:mm:ss}] [PROGRESS] Extracting... {extracted}/{totalFiles} files ({(extracted / (double)totalFiles):P0})");
                    }
                }
            }

            AppendLog($"\n[{DateTime.Now:yyyy-MM-dd HH:mm:ss}] [INFO] Extraction complete.\n");
            File.Delete(zipPath);

            // The executable is typically named after the package name in lowercase
            string exePath = Path.Combine(targetDir, "peercord");

            // Fallback in case it was capitalized by the build process
            if (!File.Exists(exePath) && File.Exists(Path.Combine(targetDir, "Peercord")))
            {
                exePath = Path.Combine(targetDir, "Peercord");
            }

            Utils.Instance.SetProgress(80, "Configuring permissions...");
            AppendLog($"[{DateTime.Now:yyyy-MM-dd HH:mm:ss}] [INFO] Configuring execute permissions...\n");

            // Recursively add execute permissions to the directory so internal Electron binaries (like chrome-sandbox) work
            await Utils.RunCommandAsync("chmod", $"-R +x \"{targetDir}\"");

            // Save installation record
            SetInstallPath(targetDir);

            AppendLog($"[{DateTime.Now:yyyy-MM-dd HH:mm:ss}] [INFO] Peercord installed successfully.\n");
            return exePath;
        }

        public async Task UninstallPeercordLinuxAsync(string targetDir)
        {
            Utils.Instance.SetProgress(10, "Preparing uninstallation...");
            AppendLog($"[{DateTime.Now:yyyy-MM-dd HH:mm:ss}] [INFO] Starting uninstallation from {targetDir}...\n");

            Utils.Instance.SetProgress(30, "Removing shortcuts...");

            string desktopPath = Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory);
            if (string.IsNullOrEmpty(desktopPath) || !Directory.Exists(desktopPath))
            {
                desktopPath = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.UserProfile), "Desktop");
            }
            string desktopShortcut = Path.Combine(desktopPath, "peercord.desktop");
            if (File.Exists(desktopShortcut))
            {
                File.Delete(desktopShortcut);
                AppendLog($"[{DateTime.Now:yyyy-MM-dd HH:mm:ss}] [INFO] Removed Desktop shortcut.\n");
            }

            string appMenuPath = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.UserProfile), ".local", "share", "applications", "peercord.desktop");
            if (File.Exists(appMenuPath))
            {
                File.Delete(appMenuPath);
                AppendLog($"[{DateTime.Now:yyyy-MM-dd HH:mm:ss}] [INFO] Removed App Menu shortcut.\n");
            }

            Utils.Instance.SetProgress(50, "Removing files...");
            if (Directory.Exists(targetDir))
            {
                Directory.Delete(targetDir, true);
                AppendLog($"[{DateTime.Now:yyyy-MM-dd HH:mm:ss}] [INFO] Removed installation directory.\n");
            }

            Utils.Instance.SetProgress(90, "Cleaning up system records...");
            RemoveInstallPath();
            AppendLog($"[{DateTime.Now:yyyy-MM-dd HH:mm:ss}] [INFO] Removed installation records.\n");

            AppendLog($"[{DateTime.Now:yyyy-MM-dd HH:mm:ss}] [INFO] Uninstallation complete.\n");
            Utils.Instance.SetProgress(100, "Done!");
        }

        public async Task CreateAppMenuShortcut(string targetExe, string targetDir)
        {
            AppendLog($"[{DateTime.Now:yyyy-MM-dd HH:mm:ss}] [INFO] Creating App Menu shortcut...\n");
            string applicationsPath = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.UserProfile), ".local", "share", "applications");
            Directory.CreateDirectory(applicationsPath);

            string iconPath = Path.Combine(targetDir, "resources", "app", "assets", "icon.png");

            string desktopEntry = $@"[Desktop Entry]
Name=Peercord
Exec=""{targetExe}""
Icon={iconPath}
Type=Application
Terminal=false
Categories=Network;
";
            string shortcutName = "peercord.desktop";
            string appMenuPath = Path.Combine(applicationsPath, shortcutName);

            await File.WriteAllTextAsync(appMenuPath, desktopEntry);
            await Utils.RunCommandAsync("chmod", $"+x \"{appMenuPath}\"");
            AppendLog($"[{DateTime.Now:yyyy-MM-dd HH:mm:ss}] [INFO] App Menu shortcut created.\n");
        }

        public async Task CreateDesktopShortcut(string targetExe, string targetDir)
        {
            AppendLog($"[{DateTime.Now:yyyy-MM-dd HH:mm:ss}] [INFO] Creating Desktop shortcut...\n");
            string iconPath = Path.Combine(targetDir, "resources", "app", "assets", "icon.png");

            string desktopEntry = $@"[Desktop Entry]
Name=Peercord
Exec=""{targetExe}""
Icon={iconPath}
Type=Application
Terminal=false
Categories=Network;
";
            string shortcutName = "peercord.desktop";
            string desktopPath = Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory);

            if (string.IsNullOrEmpty(desktopPath) || !Directory.Exists(desktopPath))
            {
                desktopPath = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.UserProfile), "Desktop");
            }

            if (Directory.Exists(desktopPath))
            {
                string desktopShortcutPath = Path.Combine(desktopPath, shortcutName);
                await File.WriteAllTextAsync(desktopShortcutPath, desktopEntry);

                // Make it executable
                await Utils.RunCommandAsync("chmod", $"+x \"{desktopShortcutPath}\"");

                // Mark it as trusted for environments like GNOME
                await Utils.RunCommandAsync("gio", $"set \"{desktopShortcutPath}\" metadata::trusted true");

                // Mark it as trusted for XFCE (Kali Linux default)
                try
                {
                    byte[] fileBytes = await File.ReadAllBytesAsync(desktopShortcutPath);
                    using (SHA256 sha256 = SHA256.Create())
                    {
                        byte[] hashBytes = sha256.ComputeHash(fileBytes);
                        string hashString = BitConverter.ToString(hashBytes).Replace("-", "").ToLowerInvariant();
                        await Utils.RunCommandAsync("gio", $"set -t string \"{desktopShortcutPath}\" metadata::xfce-exe-checksum \"{hashString}\"");
                    }
                }
                catch (Exception ex)
                {
                    AppendLog($"[{DateTime.Now:yyyy-MM-dd HH:mm:ss}] [ERROR] Failed to set XFCE trust metadata: {ex.Message}\n");
                }

                AppendLog($"[{DateTime.Now:yyyy-MM-dd HH:mm:ss}] [INFO] Desktop shortcut created and marked as trusted.\n");
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