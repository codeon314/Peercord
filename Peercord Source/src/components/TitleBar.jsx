import React, { useState, useEffect } from 'react';
import logo from '../../assets/icon.png';

export default function TitleBar() {
  const[isMaximized, setIsMaximized] = useState(false);

  useEffect(() => {
    let cleanupIpc = null;

    // Reliable IPC listener for Electron (.exe build)
    if (typeof window !== 'undefined' && window.require) {
      try {
        const { ipcRenderer } = window.require('electron');
        const handleWindowState = (e, isMax) => setIsMaximized(isMax);
        ipcRenderer.on('window-state-changed', handleWindowState);
        cleanupIpc = () => ipcRenderer.removeListener('window-state-changed', handleWindowState);
      } catch (e) {}
    }

    // Multi-monitor resilient heuristic
    const handleResize = () => {
      const isMax = (window.outerHeight >= window.screen.availHeight * 0.85) || 
                    (window.outerWidth >= window.screen.availWidth * 0.85);
      
      setIsMaximized(isMax);
    };
    
    window.addEventListener('resize', handleResize);
    handleResize(); 
    
    return () => {
      window.removeEventListener('resize', handleResize);
      if (cleanupIpc) cleanupIpc();
    };
  },[]);

  const performAction = async (action) => {
    try {
      if (typeof window !== 'undefined' && window.require) {
        const { ipcRenderer } = window.require('electron');
        ipcRenderer.send('window-action', action);
      }
    } catch (e) {
      console.error("Failed to perform window action:", e);
    }
  };

  const handleMinimize = () => performAction('minimize');

  const handleMaximize = async () => {
    if (isMaximized) {
      await performAction('restore');
      setIsMaximized(false);
    } else {
      await performAction('maximize');
      setIsMaximized(true);
    }
  };

  const handleClose = () => performAction('close');

  return (
    <div 
      className="h-7 bg-base flex justify-between items-center titlebar text-muted text-xs shrink-0 border-b border-surface"
      style={{ WebkitAppRegion: 'drag' }}
    >
      <div className="pl-3 flex items-center gap-2 font-bold tracking-wide text-[11px] text-muted">
        <img src={logo} alt="Logo" className="w-4 h-4 rounded-md object-cover" />
        Peercord
        
        {window.APP_VERSION && (
          <div className="flex items-center gap-2 bg-surface px-2.5 py-0.5 rounded-full border border-panel ml-2">
            <div 
              className="w-1.5 h-1.5 rounded-full" 
              style={{ 
                backgroundColor: window.APP_VERSION_COLOR, 
                boxShadow: `0 0 6px ${window.APP_VERSION_COLOR}` 
              }}
            ></div>
            <span className="font-mono text-[10px] text-muted font-bold pt-[1px]">v{window.APP_VERSION}</span>
          </div>
        )}
      </div>
      
      <div className="flex h-full titlebar-button" style={{ WebkitAppRegion: 'no-drag' }}>
        <button 
          onClick={handleMinimize} 
          className="px-4 hover:bg-surface h-full flex items-center justify-center transition-colors"
        >
          <svg width="12" height="12" viewBox="0 0 12 12"><rect fill="currentColor" width="10" height="1" x="1" y="6"></rect></svg>
        </button>
        <button 
          onClick={handleMaximize} 
          className="px-4 hover:bg-surface h-full flex items-center justify-center transition-colors"
        >
          {isMaximized ? (
            <svg width="12" height="12" viewBox="0 0 12 12"><path fill="currentColor" d="M3 3v6h6V3H3zm1 1h4v4H4V4z"></path></svg>
          ) : (
            <svg width="12" height="12" viewBox="0 0 12 12"><path fill="currentColor" d="M2 2v8h8V2H2zm1 1h6v6H3V3z"></path></svg>
          )}
        </button>
        <button 
          onClick={handleClose} 
          className="px-4 hover:bg-red-500 hover:text-white h-full flex items-center justify-center transition-colors"
        >
          <svg width="12" height="12" viewBox="0 0 12 12"><path fill="currentColor" d="M7.06 6L10 3.06 8.94 2 6 4.94 3.06 2 2 3.06 4.94 6 2 8.94 3.06 10 6 7.06 8.94 10 10 8.94 7.06 6z"></path></svg>
        </button>
      </div>
    </div>
  );
}