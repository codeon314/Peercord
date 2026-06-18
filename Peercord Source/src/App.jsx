import React, { useEffect, useState, useRef } from 'react';
import SetupScreen from './components/SetupScreen.jsx';
import MainApp from './components/MainApp.jsx';
import TitleBar from './components/TitleBar.jsx';
import ConsoleOverlay from './components/ConsoleOverlay.jsx';
import { network, initP2P } from './p2p/index.js';

export default function App() {
  const[profile, setProfile] = useState(null);
  const[isLoaded, setIsLoaded] = useState(false);
  const[showConsole, setShowConsole] = useState(false);
  const [logs, setLogs] = useState([]);

  // Auto-Updater States
  const[updateState, setUpdateState] = useState(null); // 'downloading', 'available', 'countdown', 'gossip_available', 'gossip_countdown'
  const[flyoutDismissed, setFlyoutDismissed] = useState(false);
  const[countdown, setCountdown] = useState(5);
  const[busyReasons, setBusyReasons] = useState([]);
  const countdownRef = useRef(null);
  
  // Sync Event State
  const [syncEvent, setSyncEvent] = useState(null);

  const triggerRestart = () => {
    if (typeof window !== 'undefined' && window.require) {
      const { ipcRenderer } = window.require('electron');
      ipcRenderer.send('apply-update');
    } else {
      window.location.reload();
    }
  };

  useEffect(() => {
    if (updateState === 'countdown' || updateState === 'gossip_countdown') {
      countdownRef.current = setInterval(() => {
        setCountdown(prev => {
          if (prev <= 1) {
            clearInterval(countdownRef.current);
            if (updateState === 'gossip_countdown') {
              if (typeof window !== 'undefined' && window.require) {
                window.require('electron').ipcRenderer.send('normal-restart');
              } else {
                window.location.reload();
              }
            } else {
              triggerRestart();
            }
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }
    return () => clearInterval(countdownRef.current);
  }, [updateState]);

  useEffect(() => {
    // Load Custom Theme
    const savedTheme = JSON.parse(localStorage.getItem('peercord_theme'));
    if (savedTheme) {
      Object.entries(savedTheme).forEach(([key, val]) => {
        document.documentElement.style.setProperty(`--color-${key}`, val);
      });
    }

    const origLog = console.log;
    const origWarn = console.warn;
    const origError = console.error;
    const origInfo = console.info;

    const safeStringify = (obj) => {
      if (typeof obj === 'string') return obj;
      if (obj instanceof Error) return obj.stack || obj.message || String(obj);
      try {
        return JSON.stringify(obj, null, 2);
      } catch (e) {
        return String(obj);
      }
    };

    const addLog = (type, args) => {
      const msg = args.map(safeStringify).join(' ');
      setLogs(prev => {
        const newLogs =[...prev, { type, msg, time: new Date().toLocaleTimeString() }];
        return newLogs.slice(-200); 
      });
    };

    console.log = (...args) => { addLog('log', args); origLog(...args); };
    console.warn = (...args) => { addLog('warn', args); origWarn(...args); };
    console.error = (...args) => { addLog('error', args); origError(...args); };
    console.info = (...args) => { addLog('info', args); origInfo(...args); };

    console.log("🚀 Peercord UI successfully booted! F10 Console is active.");

    // Setup IPC Listeners for Pear Auto-Updater & Main Process Logs
    let cleanupIpc = null;
    if (typeof window !== 'undefined' && window.require) {
      const { ipcRenderer } = window.require('electron');

      const handleMainLog = (e, { level, args }) => {
        addLog(level, ['[MAIN]', ...args]);
      };

      const handleUpdating = () => {
        console.log("🚀 [Pear Updater] Downloading update...");
        setUpdateState('downloading');
        setFlyoutDismissed(false);
      };

      const handleUpdated = () => {
        console.log("🚀 [Pear Updater] New version downloaded!");
        addLog('info', ["🚀 [Pear Updater] New version downloaded!"]);
        
        const autoRestart = localStorage.getItem('pear_auto_restart') !== 'false';
        const reasons = network.getBusyReasons();
        const isBusy = reasons.length > 0;

        setFlyoutDismissed(false);

        if (autoRestart && !isBusy) {
          setUpdateState('countdown');
          setCountdown(5);
        } else {
          setUpdateState('available');
          setBusyReasons(reasons);
        }
      };

      const handlePearError = (e, errMsg) => {
        console.error("🚀 [Pear Updater] Failed:", errMsg);
        setUpdateState(null);
        setFlyoutDismissed(true);
      };

      ipcRenderer.on('main-log', handleMainLog);
      ipcRenderer.on('pear-updating', handleUpdating);
      ipcRenderer.on('pear-updated', handleUpdated);
      ipcRenderer.on('pear-error', handlePearError);

      // FIX: Tell the main process we are ready to receive the queued logs!
      ipcRenderer.send('renderer-ready');

      cleanupIpc = () => {
        ipcRenderer.removeListener('main-log', handleMainLog);
        ipcRenderer.removeListener('pear-updating', handleUpdating);
        ipcRenderer.removeListener('pear-updated', handleUpdated);
        ipcRenderer.removeListener('pear-error', handlePearError);
      };
    }

    initP2P().then(async () => {
      network.onSyncEvent = (event) => {
        setSyncEvent(event);
        if (event === 'completed' || event === 'error') {
          setTimeout(() => setSyncEvent(null), 5000);
        }
      };

      const storedIdentity = localStorage.getItem('pear_discord_identity');
      if (storedIdentity) {
        try {
          setProfile(JSON.parse(storedIdentity));
        } catch (err) {
          console.error("Failed to parse identity:", err);
        }
      }
      setIsLoaded(true);

      const splashTimer = setTimeout(() => {
        const splashEl = document.getElementById('splash');
        if (splashEl) {
          splashEl.classList.add('fade-out');
          setTimeout(() => { splashEl.remove(); }, 300);
        }
      }, 2000);
    }).catch(err => {
      alert("CRITICAL ERROR: Failed to load P2P modules.\n\n" + err.message + "\n\nPress F12 for DevTools.");
      console.error(err);
    });

    const handleBeforeUnload = () => { network.sendOffline(); };
    window.addEventListener('beforeunload', handleBeforeUnload);

    const handleKeyDown = (e) => {
      if (e.key === 'F10') setShowConsole(prev => !prev);
      if (e.key === 'F12') {
        if (typeof Pear !== 'undefined' && Pear.Window && Pear.Window.self) {
          if (typeof Pear.Window.self.inspect === 'function') Pear.Window.self.inspect();
          else if (typeof Pear.Window.self.openDevTools === 'function') Pear.Window.self.openDevTools();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      console.log = origLog;
      console.warn = origWarn;
      console.error = origError;
      console.info = origInfo;
      window.removeEventListener('beforeunload', handleBeforeUnload);
      window.removeEventListener('keydown', handleKeyDown);
      if (cleanupIpc) cleanupIpc();
    };
  },[]);

  const handleLogout = () => {
    localStorage.removeItem('pear_discord_identity');
    network.sendOffline();
    setTimeout(async () => { await network.close(); }, 100);
    setProfile(null);
  };

  if (!isLoaded) return null;

  return (
    <div className="flex flex-col h-screen w-full bg-base overflow-hidden relative">
      <TitleBar />
      <div className="flex-1 relative overflow-hidden flex">
        {profile ? (
          <MainApp 
            profile={profile} 
            setProfile={setProfile} 
            onLogout={handleLogout} 
            updateState={updateState}
            triggerRestart={triggerRestart}
            onSystemUpdate={(version, payload) => {
              const seenKey = `seen_update_${version}`;
              if (!sessionStorage.getItem(seenKey)) {
                sessionStorage.setItem(seenKey, 'true');
                
                console.info(`🚀 [P2P] Verified Admin Update Broadcast: v${version}`);
                
                const autoRestart = localStorage.getItem('pear_auto_restart') !== 'false';
                const reasons = network.getBusyReasons();
                const isBusy = reasons.length > 0;

                setUpdateState(prev => {
                  if (prev === 'downloading' || prev === 'available' || prev === 'countdown') return prev;
                  
                  if (autoRestart && !isBusy) {
                    setCountdown(5);
                    return 'gossip_countdown';
                  } else {
                    setBusyReasons(reasons);
                    return 'gossip_available';
                  }
                });
                
                setFlyoutDismissed(false);
                
                // Gossip to all connected peers to ensure network-wide delivery instantly
                network.sendEphemeral(payload);
              }
            }}
          />
        ) : (
          <SetupScreen setProfile={setProfile} />
        )}
      </div>
      {showConsole && <ConsoleOverlay logs={logs} onClose={() => setShowConsole(false)} />}

      {/* Sync Event Toast */}
      {syncEvent && (
        <div className="absolute top-6 left-1/2 -translate-x-1/2 bg-surface border border-accent shadow-2xl rounded-lg p-4 z-[9999] flex items-center gap-3">
          {syncEvent === 'started' && <span className="animate-spin w-5 h-5 border-2 border-accent border-t-transparent rounded-full"></span>}
          {syncEvent === 'completed' && <span className="text-green-500 text-xl">✓</span>}
          {syncEvent === 'error' && <span className="text-red-500 text-xl">✗</span>}
          <div className="flex flex-col">
            <span className="text-sm font-bold text-text">Account Sync</span>
            <span className="text-xs text-muted">
              {syncEvent === 'started' ? 'Another device is syncing your account...' : 
               syncEvent === 'completed' ? 'Sync completed successfully!' : 'Sync failed.'}
            </span>
          </div>
        </div>
      )}

      {/* Update Notification Flyout */}
      {updateState && !flyoutDismissed && (
        <div className="absolute bottom-6 right-6 bg-surface border border-panel shadow-2xl rounded-lg p-4 w-80 z-[9999] flex flex-col gap-3">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-accent flex items-center justify-center text-white shrink-0">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 2v6h-6"></path><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"></path><path d="M3 2v6h6"></path><path d="M21 12a9 9 0 1 0-9 9 9.75 9.75 0 0 0 6.74-2.74L21 16"></path></svg>
              </div>
              <div>
                <h3 className="text-text font-bold text-sm">
                  {updateState === 'downloading' ? 'Downloading Update...' : 
                   (updateState === 'gossip_available' || updateState === 'gossip_countdown') ? 'Update Broadcasted' : 'Update Available'}
                </h3>
                <p className="text-muted text-[11px] leading-tight mt-0.5">
                  {updateState === 'downloading' ? 'A new version is being downloaded.' : 
                   (updateState === 'gossip_available' || updateState === 'gossip_countdown') ? 'A new version has been announced on the network.' : 'A new version of Peercord is ready.'}
                </p>
              </div>
            </div>
            <button onClick={() => setFlyoutDismissed(true)} className="text-muted hover:text-text transition-colors">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
            </button>
          </div>
          
          {updateState === 'downloading' ? (
            <div className="flex flex-col gap-1 mt-1">
              <div className="w-full bg-base rounded-full h-1.5 overflow-hidden relative">
                <div className="bg-accent h-1.5 rounded-full absolute top-0 left-0 w-1/2 animate-indeterminate"></div>
              </div>
              <div className="flex justify-between text-[10px] text-muted mt-1">
                <span>Downloading update...</span>
              </div>
            </div>
          ) : updateState === 'countdown' ? (
            <div className="flex items-center justify-between mt-1">
              <span className="text-xs text-muted font-medium">Restarting in {countdown}s...</span>
              <div className="flex gap-2">
                <button onClick={() => { setUpdateState('available'); clearInterval(countdownRef.current); setFlyoutDismissed(true); }} className="px-3 py-1.5 text-xs font-medium text-muted hover:text-text hover:underline">Cancel</button>
                <button onClick={triggerRestart} className="px-3 py-1.5 text-xs font-medium bg-accent text-white rounded transition-colors opacity-90 hover:opacity-100">Restart Now</button>
              </div>
            </div>
          ) : updateState === 'gossip_available' || updateState === 'gossip_countdown' ? (
            <div className="flex flex-col gap-2 mt-1">
              {busyReasons.length > 0 && (localStorage.getItem('pear_auto_restart') !== 'false') && (
                <div className="bg-yellow-500/10 border border-yellow-500/30 rounded p-2 mb-1">
                  <span className="text-[10px] text-yellow-500 font-bold uppercase block mb-1">Auto-Restart Paused:</span>
                  <ul className="text-[10px] text-yellow-400/80 list-disc pl-4">
                    {busyReasons.map((r, i) => <li key={i}>{r}</li>)}
                  </ul>
                </div>
              )}
              <span className="text-sm text-green-500 font-bold">New Update Broadcasted!</span>
              <span className="text-xs text-muted">
                {updateState === 'gossip_countdown' 
                  ? `Restarting in ${countdown}s to connect to the new seeder...` 
                  : 'Restart the app to connect to the new seeder and begin downloading.'}
              </span>
              <div className="flex justify-end gap-2 mt-2">
                {updateState === 'gossip_countdown' ? (
                  <>
                    <button onClick={() => { setUpdateState('gossip_available'); clearInterval(countdownRef.current); setFlyoutDismissed(true); }} className="px-3 py-1.5 text-xs font-medium text-muted hover:text-text hover:underline">Cancel</button>
                    <button onClick={() => {
                      if (typeof window !== 'undefined' && window.require) {
                        window.require('electron').ipcRenderer.send('normal-restart');
                      } else {
                        window.location.reload();
                      }
                    }} className="px-3 py-1.5 text-xs font-medium bg-accent text-white rounded transition-colors opacity-90 hover:opacity-100">Restart Now</button>
                  </>
                ) : (
                  <>
                    <button onClick={() => setFlyoutDismissed(true)} className="px-3 py-1.5 text-xs font-medium text-muted hover:text-text hover:underline">Later</button>
                    <button onClick={() => {
                      if (typeof window !== 'undefined' && window.require) {
                        window.require('electron').ipcRenderer.send('normal-restart');
                      } else {
                        window.location.reload();
                      }
                    }} className="px-3 py-1.5 text-xs font-medium bg-accent text-white rounded transition-colors opacity-90 hover:opacity-100">Restart & Download</button>
                  </>
                )}
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-2 mt-1">
              {busyReasons.length > 0 && (localStorage.getItem('pear_auto_restart') !== 'false') && (
                <div className="bg-yellow-500/10 border border-yellow-500/30 rounded p-2 mb-1">
                  <span className="text-[10px] text-yellow-500 font-bold uppercase block mb-1">Auto-Restart Paused:</span>
                  <ul className="text-[10px] text-yellow-400/80 list-disc pl-4">
                    {busyReasons.map((r, i) => <li key={i}>{r}</li>)}
                  </ul>
                </div>
              )}
              <div className="flex justify-end gap-2">
                <button onClick={() => setFlyoutDismissed(true)} className="px-3 py-1.5 text-xs font-medium text-muted hover:text-text hover:underline">Later</button>
                <button onClick={triggerRestart} className="px-3 py-1.5 text-xs font-medium bg-accent text-white rounded transition-colors opacity-90 hover:opacity-100">Restart Now</button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}