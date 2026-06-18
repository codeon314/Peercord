import { app, BrowserWindow, ipcMain, desktopCapturer, protocol, net, Tray, Menu } from 'electron';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import fs from 'fs';
import { spawn } from 'child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// We need to read package.json for version and upgrade link
const pkgPath = path.join(__dirname, 'package.json');
const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));

// Register custom protocol BEFORE app is ready to ensure localStorage persistence
protocol.registerSchemesAsPrivileged([
  { scheme: 'peercord', privileges: { standard: true, secure: true, supportFetchAPI: true, bypassCSP: true, corsEnabled: true, stream: true } }
]);

// Force app name and userData path BEFORE app.whenReady() 
app.name = 'Peercord';

// Prevent duplicate taskbar icons on Windows for portable/ZIP builds.
if (process.platform === 'win32') {
  app.setAppUserModelId(process.execPath);
}

const appDataPath = path.join(app.getPath('appData'), 'Peercord');
app.setPath('userData', appDataPath);

// Enforce Single Instance Lock
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
  process.exit(0);
}

// Release the Windows directory lock!
if (!fs.existsSync(appDataPath)) {
  fs.mkdirSync(appDataPath, { recursive: true });
}
try {
  process.chdir(appDataPath);
} catch (e) {
  console.error("Failed to change CWD:", e);
}

function getAppDir() {
  const execName = path.basename(process.execPath).toLowerCase();
  const isDev = execName === 'electron.exe' || execName === 'electron';
  
  if (isDev) return null;

  if (process.platform === 'linux' && process.env.APPIMAGE) return process.env.APPIMAGE;
  if (process.platform === 'darwin') return path.join(process.resourcesPath, '..', '..');
  
  return path.dirname(process.execPath);
}

let globalWin = null;
let tray = null;
let isQuitting = false;
let isWindowReady = false;
let logQueue = [];
let closeToTray = true;

app.on('before-quit', () => {
  isQuitting = true;
});

// Focus existing window if a second instance is launched
app.on('second-instance', (event, commandLine, workingDirectory) => {
  if (globalWin) {
    if (globalWin.isMinimized()) globalWin.restore();
    globalWin.show();
    globalWin.focus();
  }
});

// Custom logger to pipe Main Process logs to the React F10 Console
function logToRenderer(level, ...args) {
  const formattedArgs = args.map(a => {
    if (a instanceof Error) return `${a.name}: ${a.message}\n${a.stack}`;
    if (typeof a === 'object') {
      try { return JSON.stringify(a, Object.getOwnPropertyNames(a)); } catch(e) { return String(a); }
    }
    return String(a);
  });

  console[level](...formattedArgs);

  if (globalWin && isWindowReady && !globalWin.isDestroyed()) {
    globalWin.webContents.send('main-log', { level, args: formattedArgs });
  } else {
    logQueue.push({ level, args: formattedArgs });
  }
}

ipcMain.on('renderer-ready', () => {
  isWindowReady = true;
  logQueue.forEach(log => {
    if (globalWin && !globalWin.isDestroyed()) {
      globalWin.webContents.send('main-log', log);
    }
  });
  logQueue = [];
});

ipcMain.on('set-tray-setting', (e, val) => {
  closeToTray = val;
});

async function boot() {
  if (process.platform === 'win32') {
    const cmd = process.argv[1];
    if (cmd === '--squirrel-install' || cmd === '--squirrel-updated' || cmd === '--squirrel-uninstall' || cmd === '--squirrel-obsolete') {
      app.quit();
      return;
    }
  }

  app.disableHardwareAcceleration();

  await app.whenReady();

  const appPath = app.getAppPath();

  protocol.handle('peercord', (request) => {
    if (request.url.startsWith('peercord://local/')) {
      let filePath = decodeURIComponent(request.url.replace('peercord://local/', ''));
      if (process.platform === 'win32' && filePath.startsWith('/')) {
        filePath = filePath.substring(1); 
      }
      return net.fetch(pathToFileURL(filePath).href);
    }

    let url = request.url.replace('peercord://app/', '');
    url = url.split('?')[0].split('#')[0];
    url = decodeURIComponent(url);
    
    if (url.startsWith('/')) url = url.substring(1);
    
    let filePath = path.join(appPath, url);
    
    if (!fs.existsSync(filePath)) {
      const distPath = path.join(appPath, 'dist', url);
      if (fs.existsSync(distPath)) filePath = distPath;
    }
    
    return net.fetch(pathToFileURL(filePath).href);
  });

  const iconFile = process.platform === 'win32' ? 'icon.ico' : 'icon.png';
  const iconPath = path.join(appPath, 'assets', iconFile);

  const win = new BrowserWindow({
    width: 1100,
    height: 750,
    title: "Peercord",
    icon: iconPath,
    frame: false, 
    resizable: true,
    maximizable: true,
    thickFrame: true,
    backgroundColor: '#313338',
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });

  globalWin = win;
  
  win.loadURL('peercord://app/dist/index.html');

  function updateTrayVisibility() {
    if (win.isVisible()) {
      if (tray) {
        tray.destroy();
        tray = null;
      }
    } else {
      if (!tray) {
        tray = new Tray(iconPath);
        const contextMenu = Menu.buildFromTemplate([
          { label: 'Show Peercord', click: () => { win.show(); win.focus(); } },
          { type: 'separator' },
          { label: 'Quit Peercord', click: () => { isQuitting = true; app.quit(); } }
        ]);
        tray.setToolTip('Peercord');
        tray.setContextMenu(contextMenu);
        tray.on('click', () => {
          win.show();
          win.focus();
        });
      }
    }
  }

  win.on('show', updateTrayVisibility);
  win.on('hide', updateTrayVisibility);

  win.on('close', (event) => {
    if (!isQuitting) {
      if (closeToTray) {
        event.preventDefault();
        win.hide();
      } else {
        isQuitting = true;
        app.quit();
      }
    }
  });

  win.webContents.on('before-input-event', (event, input) => {
    if (input.key === 'F12') {
      win.webContents.toggleDevTools();
      event.preventDefault();
    }
  });

  ipcMain.on('window-action', (event, action) => {
    if (action === 'minimize') win.minimize();
    if (action === 'maximize') win.isMaximized() ? win.restore() : win.maximize();
    if (action === 'close') win.close(); 
  });

  win.on('maximize', () => win.webContents.send('window-state-changed', true));
  win.on('unmaximize', () => win.webContents.send('window-state-changed', false));

  ipcMain.handle('get-desktop-sources', async () => {
    const sources = await desktopCapturer.getSources({ 
      types:['window', 'screen'], 
      thumbnailSize: { width: 320, height: 180 } 
    });
    
    return sources.map(s => ({
      id: s.id,
      name: s.name,
      thumbnailDataURL: s.thumbnail.toDataURL()
    }));
  });

  // PEAR OTA UPDATER LOGIC
  let pear = null;
  try {
    const { default: PearRuntime } = await import('pear-runtime');
    
    const resolvedAppDir = getAppDir();
    logToRenderer('info', '[Pear] Resolved App Directory for Updater:', resolvedAppDir);

    pear = new PearRuntime({
      ...pkg, 
      dir: path.join(app.getPath('userData'), 'pear-data'),
      app: resolvedAppDir
    });

    pear.on('error', (err) => logToRenderer('error', '[Pear Error]', err));
  } catch (e) {
    logToRenderer('error', '[Pear] Failed to initialize PearRuntime:', e.message, e.stack);
  }

  if (pear && pear.updater) {
    logToRenderer('info', '[Pear] Updater initialized. Current version:', pkg.version);
    
    pear.updater.on('updating', () => {
      logToRenderer('info', '[Pear] updating event fired. Downloading update...');
      if (win && !win.isDestroyed()) win.webContents.send('pear-updating');
    });
    
    pear.updater.on('updated', () => {
      logToRenderer('info', '[Pear] updated event fired. Update downloaded and ready.');
      if (win && !win.isDestroyed()) win.webContents.send('pear-updated');
    });

    pear.updater.on('error', (err) => {
      logToRenderer('error', '[Pear] Updater Error:', err);
      if (win && !win.isDestroyed()) {
        win.webContents.send('pear-error', err instanceof Error ? err.message : String(err));
      }
    });
  } else {
    logToRenderer('warn', '[Pear] Updater not available on pear object');
  }

  ipcMain.on('normal-restart', () => {
    isQuitting = true;
    app.relaunch();
    app.quit();
  });

  ipcMain.on('apply-update', async () => {
    logToRenderer('info', '[Pear] apply-update requested by renderer');
    try {
      const baseDir = getAppDir();
      if (!baseDir) throw new Error("Cannot apply update in dev mode");

      const nextDir = path.join(appDataPath, 'pear-data', 'pear-runtime', 'next');
      if (!fs.existsSync(nextDir)) throw new Error("Update cache directory not found");

      const versions = fs.readdirSync(nextDir).filter(v => fs.statSync(path.join(nextDir, v)).isDirectory());
      if (versions.length === 0) throw new Error("No downloaded updates found");

      versions.sort((a, b) => parseFloat(b) - parseFloat(a));
      const latestVersion = versions[0];

      const archDir = `${process.platform}-${process.arch}`;
      const updateAppPath = path.join(nextDir, latestVersion, 'by-arch', archDir, 'app', 'peercord');

      if (!fs.existsSync(updateAppPath)) throw new Error(`Update files not found at ${updateAppPath}`);

      if (process.platform === 'win32') {
        logToRenderer('info', '[Pear] Windows detected. Using detached script to bypass OS file locks...');

        const batPath = path.join(app.getPath('temp'), `peercord-update-${Date.now()}.bat`);
        const vbsPath = path.join(app.getPath('temp'), `peercord-update-${Date.now()}.vbs`);
        
        const batContent = `
@echo off
:wait
tasklist /FI "PID eq ${process.pid}" /NH | findstr /C:"${process.pid}" > nul
if %ERRORLEVEL% == 0 (
    timeout /t 1 /nobreak > nul
    goto wait
)

xcopy /E /Y /I /H /C "${updateAppPath}\\*" "${baseDir}\\"

start "" "${process.execPath}"
del "%~1"
del "%~f0"
        `;
        
        const vbsContent = `
Dim WshShell
Set WshShell = CreateObject("WScript.Shell")
WshShell.Run "cmd.exe /c """"" & WScript.Arguments(0) & """ """ & WScript.Arguments(1) & """""", 0, False
        `;
        
        fs.writeFileSync(batPath, batContent);
        fs.writeFileSync(vbsPath, vbsContent);
        
        const child = spawn('wscript.exe', [vbsPath, batPath, vbsPath], {
          detached: true,
          stdio: 'ignore',
          windowsHide: true
        });
        child.unref();
        
        logToRenderer('info', '[Pear] Detached script spawned. Quitting app to allow swap...');
        isQuitting = true;
        app.quit();
      } else {
        logToRenderer('info', '[Pear] macOS/Linux detected. Using detached bash script for reliable directory swap...');
        
        const shPath = path.join(app.getPath('temp'), `peercord-update-${Date.now()}.sh`);
        
        const shContent = `#!/bin/bash
# Wait for the Electron process to exit
while kill -0 ${process.pid} 2>/dev/null; do
  sleep 0.5
done

# Copy the new app directory contents into place, overwriting existing files
cp -rf "${updateAppPath}/." "${baseDir}/"

# Ensure the new binary is executable
chmod -R 755 "${baseDir}"

# Launch the new app
"${process.execPath}" &

# Delete this script
rm "$0"
`;
        fs.writeFileSync(shPath, shContent);
        fs.chmodSync(shPath, '755');
        
        const child = spawn(shPath, [], {
          detached: true,
          stdio: 'ignore'
        });
        child.unref();
        
        logToRenderer('info', '[Pear] Detached script spawned. Quitting app to allow swap...');
        isQuitting = true;
        app.quit();
      }
    } catch (err) {
      logToRenderer('error', '[Pear] Failed to apply update:', err);
      if (globalWin && !globalWin.isDestroyed()) {
        globalWin.webContents.send('pear-error', err instanceof Error ? err.message : String(err));
      }
    }
  });
}

boot().catch(console.error);