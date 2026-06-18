using System;
using System.Diagnostics;
using System.IO;
using System.Runtime.InteropServices;
using System.Text.RegularExpressions;
using System.Threading.Tasks;

namespace PeercordInstaller.Installers
{
    public class Utils
    {
        public static Utils Instance = null;

        private Action<string> appendLogFunc;
        private Action<int, string> setProgressFunc;
        public void AppendLog(string text) => appendLogFunc.Invoke(text);
        public void SetProgress(int value, string status) => setProgressFunc.Invoke(value, status);

        public Utils(Action<string> logDel, Action<int, string> setProgDel)
        {
            appendLogFunc = logDel;
            setProgressFunc = setProgDel;
        }

        public static async Task ReadStreamAsync(StreamReader reader)
        {
            char[] buffer = new char[1024];
            int bytesRead;
            while ((bytesRead = await reader.ReadAsync(buffer, 0, buffer.Length)) > 0)
            {
                string text = new string(buffer, 0, bytesRead);
                text = Regex.Replace(text, @"\x1B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])", "");
                Utils.Instance.AppendLog(text);
            }
        }

        public static async Task RunCommandAsync(string fileName, string arguments, string? inputText = null, int timeoutMs = -1)
        {
            Utils.Instance.AppendLog($"[{DateTime.Now:yyyy-MM-dd HH:mm:ss}] [EXEC] {fileName} {arguments}\n");

            var startInfo = new ProcessStartInfo
            {
                FileName = fileName,
                Arguments = arguments,
                RedirectStandardOutput = true,
                RedirectStandardError = true,
                RedirectStandardInput = inputText != null,
                UseShellExecute = false,
                CreateNoWindow = true
            };

            using var process = new Process { StartInfo = startInfo };
            process.Start();

            var outTask = ReadStreamAsync(process.StandardOutput);
            var errTask = ReadStreamAsync(process.StandardError);

            if (inputText != null)
            {
                try
                {
                    await process.StandardInput.WriteLineAsync(inputText);
                    await process.StandardInput.FlushAsync();
                    process.StandardInput.Close();
                }
                catch { }
            }

            if (timeoutMs > 0)
            {
                using var cts = new System.Threading.CancellationTokenSource(timeoutMs);
                try
                {
                    await process.WaitForExitAsync(cts.Token);
                }
                catch (TaskCanceledException)
                {
                    Utils.Instance.AppendLog($"\n[{DateTime.Now:yyyy-MM-dd HH:mm:ss}] [ERROR] Command reached timeout. Terminating background process to continue...\n");
                    try { process.Kill(true); } catch { }
                }
            }
            else
            {
                await process.WaitForExitAsync();
            }

            await Task.WhenAll(outTask, errTask);

            int exitCode = -1;
            try { exitCode = process.ExitCode; } catch { }

            Utils.Instance.AppendLog($"[{DateTime.Now:yyyy-MM-dd HH:mm:ss}] [EXEC] Command finished with exit code {exitCode}\n");
        }

        public static void LaunchPeercord(string targetExe)
        {
            try
            {
                if (File.Exists(targetExe))
                {
                    Process.Start(new ProcessStartInfo
                    {
                        FileName = targetExe,
                        UseShellExecute = true
                    });
                }
                else
                {
                    Console.WriteLine("Could not find installed Peercord executable to launch.");
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Failed to launch Peercord: {ex.Message}");
            }
        }
    }
}