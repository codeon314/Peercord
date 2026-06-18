import React, { useState, useEffect } from 'react';

export default function ScreenShareModal({ onClose, onStart }) {
  const[resolution, setResolution] = useState('1080');
  const [fps, setFps] = useState('60');
  
  const[activeTab, setActiveTab] = useState('screens');
  const[sources, setSources] = useState({ screens:[], windows: [] });
  const [selectedSource, setSelectedSource] = useState(null);
  const[useNativePicker, setUseNativePicker] = useState(false);

  const resolutions =[
    { value: '1080', label: '1080p', width: 1920, height: 1080 },
    { value: '720', label: '720p', width: 1280, height: 720 },
    { value: '480', label: '480p', width: 854, height: 480 },
    { value: '360', label: '360p', width: 640, height: 360 },
    { value: '240', label: '240p', width: 426, height: 240 },
    { value: '144', label: '144p', width: 256, height: 144 }
  ];

  const framerates =[
    { value: '60', label: '60 FPS (Smoothest)' },
    { value: '30', label: '30 FPS (Standard)' },
    { value: '15', label: '15 FPS (Low Bandwidth)' }
  ];

  useEffect(() => {
    const fetchSources = async () => {
      try {
        if (typeof window !== 'undefined' && window.require) {
          const { ipcRenderer } = window.require('electron');
          const allSources = await ipcRenderer.invoke('get-desktop-sources');
          
          const formattedSources = allSources.map(s => ({
            id: s.id,
            name: s.name,
            thumbnail: { toDataURL: () => s.thumbnailDataURL }
          }));

          const screens = formattedSources.filter(s => s.id.startsWith('screen'));
          const windows = formattedSources.filter(s => s.id.startsWith('window'));
          
          setSources({ screens, windows });
          if (screens.length > 0) setSelectedSource(screens[0].id);
          return;
        }
      } catch (e) {
        console.warn("desktopSources not available, falling back to native picker", e);
      }
      setUseNativePicker(true);
    };
    
    fetchSources();
  },[]);

  const handleStart = () => {
    const selectedRes = resolutions.find(r => r.value === resolution);
    const sourceId = useNativePicker ? 'native' : selectedSource;
    if (!sourceId) return;
    onStart(sourceId, selectedRes, parseInt(fps));
  };

  return (
    <div className="absolute inset-0 z-50 bg-black/70 flex items-center justify-center backdrop-blur-sm">
      <div className="bg-base rounded-lg shadow-2xl w-full max-w-4xl flex flex-col overflow-hidden border border-surface max-h-[90vh]">
        
        <div className="p-6 border-b border-surface shrink-0">
          <h2 className="text-xl font-bold text-text mb-2">Screen Share Settings</h2>
          <p className="text-sm text-muted">
            Configure your stream quality and select what you want to share.
          </p>
        </div>

        <div className="flex flex-col md:flex-row flex-1 overflow-hidden min-h-[400px]">
          
          {/* Left Side: Source Selection */}
          <div className="flex-1 flex flex-col border-r border-surface bg-panel overflow-hidden">
            {!useNativePicker ? (
              <>
                <div className="flex border-b border-surface shrink-0">
                  <button 
                    onClick={() => { setActiveTab('screens'); setSelectedSource(sources.screens[0]?.id); }}
                    className={`flex-1 py-3 text-sm font-bold transition-colors ${activeTab === 'screens' ? 'text-text border-b-2 border-accent' : 'text-muted hover:text-text hover:bg-surface/50'}`}
                  >
                    Entire Screen
                  </button>
                  <button 
                    onClick={() => { setActiveTab('windows'); setSelectedSource(sources.windows[0]?.id); }}
                    className={`flex-1 py-3 text-sm font-bold transition-colors ${activeTab === 'windows' ? 'text-text border-b-2 border-accent' : 'text-muted hover:text-text hover:bg-surface/50'}`}
                  >
                    Specific Window
                  </button>
                </div>
                
                <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
                  <div className="grid grid-cols-2 gap-4">
                    {sources[activeTab].map(source => (
                      <div 
                        key={source.id} 
                        onClick={() => setSelectedSource(source.id)}
                        className={`flex flex-col gap-2 p-2 rounded cursor-pointer border-2 transition-colors ${selectedSource === source.id ? 'border-accent bg-accent/10' : 'border-transparent hover:bg-surface'}`}
                      >
                        <img src={source.thumbnail.toDataURL()} alt={source.name} className="w-full aspect-video object-cover rounded bg-black" />
                        <span className="text-xs text-text truncate text-center font-medium">{source.name}</span>
                      </div>
                    ))}
                    {sources[activeTab].length === 0 && (
                      <div className="col-span-2 text-center text-muted py-8 text-sm">
                        No {activeTab} found.
                      </div>
                    )}
                  </div>
                </div>
              </>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center p-8 text-center gap-4">
                <div className="w-16 h-16 rounded-full bg-accent/20 flex items-center justify-center text-accent">
                  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="3" width="20" height="14" rx="2" ry="2"></rect><line x1="8" y1="21" x2="16" y2="21"></line><line x1="12" y1="17" x2="12" y2="21"></line></svg>
                </div>
                <h3 className="text-text font-bold">Native Picker Required</h3>
                <p className="text-sm text-muted">
                  Your environment requires using the system's native screen picker. Click "Start Sharing" to open it.
                </p>
              </div>
            )}
          </div>

          {/* Right Side: Quality Settings */}
          <div className="w-72 p-6 flex flex-col gap-6 bg-base shrink-0 overflow-y-auto">
            
            <div className="bg-accent/10 border border-accent/30 rounded p-4 flex gap-3 items-start">
              <svg className="text-accent shrink-0 mt-0.5" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>
              <p className="text-xs text-text leading-relaxed opacity-90">
                If your connection is slow, the system will automatically downgrade resolution to maintain framerate.
              </p>
            </div>

            <div>
              <label className="block text-xs font-bold text-muted uppercase mb-2">Resolution</label>
              <select 
                value={resolution} 
                onChange={(e) => setResolution(e.target.value)}
                className="w-full bg-panel text-text rounded p-2.5 outline-none focus:ring-1 focus:ring-accent appearance-none cursor-pointer border border-surface text-sm font-medium"
              >
                {resolutions.map(res => (
                  <option key={res.value} value={res.value}>{res.label}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-muted uppercase mb-2">Frame Rate</label>
              <select 
                value={fps} 
                onChange={(e) => setFps(e.target.value)}
                className="w-full bg-panel text-text rounded p-2.5 outline-none focus:ring-1 focus:ring-accent appearance-none cursor-pointer border border-surface text-sm font-medium"
              >
                {framerates.map(f => (
                  <option key={f.value} value={f.value}>{f.label}</option>
                ))}
              </select>
            </div>

          </div>

        </div>

        <div className="p-4 bg-base flex justify-end gap-3 border-t border-surface shrink-0">
          <button onClick={onClose} className="text-text hover:underline text-sm font-medium px-4 py-2">
            Cancel
          </button>
          <button 
            onClick={handleStart} 
            disabled={!useNativePicker && !selectedSource}
            className="bg-accent hover:opacity-90 text-white px-6 py-2 rounded text-sm font-medium transition-opacity flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="3" width="20" height="14" rx="2" ry="2"></rect><line x1="8" y1="21" x2="16" y2="21"></line><line x1="12" y1="17" x2="12" y2="21"></line></svg>
            Start Sharing
          </button>
        </div>

      </div>
    </div>
  );
}