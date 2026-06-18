using Avalonia;
using System;
using System.Diagnostics;
using System.Runtime.InteropServices;

namespace PeercordInstaller
{
    internal class Program
    {
        [DllImport("shell32.dll", SetLastError = true)]
        private static extern int SetCurrentProcessExplicitAppUserModelID([MarshalAs(UnmanagedType.LPWStr)] string appId);

        // Initialization code. Don't use any Avalonia, third-party APIs or any
        // SynchronizationContext-reliant code before AppMain is called: things aren't initialized
        // yet and stuff might break.
        [STAThread]
        public static void Main(string[] args)
        {
            //string appID = AppIdHelper.GetCurrentAppId();
            //Debugger.Break();
            if (RuntimeInformation.IsOSPlatform(OSPlatform.Windows))
            {
                SetCurrentProcessExplicitAppUserModelID("com.peercord.app");
            }
            
            BuildAvaloniaApp().StartWithClassicDesktopLifetime(args);
        }

        // Avalonia configuration, don't remove; also used by visual designer.
        public static AppBuilder BuildAvaloniaApp()
            => AppBuilder.Configure<App>()
                .UsePlatformDetect()
                .WithInterFont()
                .LogToTrace();
    }
}
