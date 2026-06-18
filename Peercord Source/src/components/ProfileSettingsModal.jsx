import React, { useState, useRef, useEffect } from 'react';
import { network, ADMIN_PUBLIC_KEY } from '../p2p/index.js';

function StorageSettings({ dms, servers, knownUsers }) {
  const[stats, setStats] = useState(null);

  const fetchStats = () => {
    network.getStorageStats()
      .then(setStats)
      .catch(err => {
        console.error("Failed to load storage stats:", err);
        setStats({ total: 0, dms: {}, servers: {}, files:[] });
      });
  };

  useEffect(() => {
    fetchStats();
  },[]);

  const handlePrune = async (msgId) => {
    try {
      await network.pruneFile(msgId);
    } catch (err) {
      console.error("Failed to prune file:", err);
    } finally {
      fetchStats();
    }
  };

  if (!stats) return <div className="text-text">Loading storage stats...</div>;

  const formatBytes = (bytes) => {
    if (!+bytes) return '0 Bytes';
    const k = 1024;
    const sizes =['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
  };

  return (
    <div className="max-w-3xl">
      <h2 className="text-xl font-bold text-text mb-6">Storage Management</h2>
      
      <div className="bg-surface rounded-lg p-6 mb-6">
        <h3 className="text-muted uppercase text-xs font-bold mb-2">Total Space Used by Media</h3>
        <div className="text-3xl font-bold text-text mb-6">{formatBytes(stats.total)}</div>

        <div className="grid grid-cols-2 gap-6">
          <div>
            <h4 className="text-muted uppercase text-xs font-bold mb-3">Whispers</h4>
            <div className="space-y-2 max-h-48 overflow-y-auto custom-scrollbar pr-2">
              {Object.entries(stats.dms).map(([key, size]) => {
                const name = dms[key]?.profile?.displayName || knownUsers.find(u => u.key === key)?.displayName || 'Unknown';
                return (
                  <div key={key} className="flex justify-between items-center bg-panel p-2 rounded">
                    <span className="text-sm text-text truncate pr-2">{name}</span>
                    <span className="text-sm font-mono text-muted shrink-0">{formatBytes(size)}</span>
                  </div>
                );
              })}
              {Object.keys(stats.dms).length === 0 && <div className="text-sm text-muted">No media in Whispers</div>}
            </div>
          </div>

          <div>
            <h4 className="text-muted uppercase text-xs font-bold mb-3">Hubs</h4>
            <div className="space-y-2 max-h-48 overflow-y-auto custom-scrollbar pr-2">
              {Object.entries(stats.servers).map(([topicHex, data]) => {
                return (
                  <div key={topicHex} className="flex flex-col bg-panel p-2 rounded gap-1">
                    <div className="flex justify-between items-center">
                      <span className="text-sm font-bold text-text truncate pr-2">{data.name}</span>
                      <span className="text-sm font-mono text-muted shrink-0">{formatBytes(data.total)}</span>
                    </div>
                    {Object.entries(data.channels).map(([ch, size]) => (
                      <div key={ch} className="flex justify-between items-center pl-2 border-l-2 border-surface">
                        <span className="text-xs text-muted truncate pr-2">#{ch}</span>
                        <span className="text-xs font-mono text-muted shrink-0">{formatBytes(size)}</span>
                      </div>
                    ))}
                  </div>
                );
              })}
              {Object.keys(stats.servers).length === 0 && <div className="text-sm text-muted">No media in Hubs</div>}
            </div>
          </div>
        </div>
      </div>

      <div className="bg-surface rounded-lg p-6">
        <h3 className="text-muted uppercase text-xs font-bold mb-4">Large Files</h3>
        <div className="space-y-2 max-h-64 overflow-y-auto custom-scrollbar pr-2">
          {stats.files.slice(0, 50).map(file => {
            let originText = 'Unknown Origin';
            if (file.target) {
              const name = dms[file.target]?.profile?.displayName || knownUsers.find(u => u.key === file.target)?.displayName || 'Unknown User';
              originText = `Whisper: ${name}`;
            } else if (file.channel) {
              const channelName = file.channel.substring(65);
              if (file.isGroupChat) originText = `Group: ${file.serverName}`;
              else originText = `${file.serverName} ${channelName ? '#' + channelName : ''}`;
            }

            return (
              <div key={file.id} className="flex justify-between items-center bg-panel p-3 rounded group">
                <div className="flex flex-col overflow-hidden pr-4">
                  <span className="text-sm text-text font-medium truncate">{file.name}</span>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-base text-muted truncate max-w-[200px]" title={originText}>
                      {originText}
                    </span>
                    <span className="text-xs text-muted">{new Date(file.timestamp).toLocaleString()}</span>
                  </div>
                </div>
                <div className="flex items-center gap-4 shrink-0">
                  <span className="text-sm font-mono text-muted">{formatBytes(file.size)}</span>
                  <button 
                    onClick={() => handlePrune(file.id)}
                    className="bg-red-500/10 text-red-500 hover:bg-red-500 hover:text-white px-3 py-1.5 rounded text-xs font-bold transition-colors opacity-0 group-hover:opacity-100"
                  >
                    Delete Local Data
                  </button>
                </div>
              </div>
            );
          })}
          {stats.files.length === 0 && <div className="text-sm text-muted text-center py-4">No large files found.</div>}
        </div>
      </div>
    </div>
  );
}

export default function ProfileSettingsModal({ profile, myKey, onClose, onSave, onLogout, dms, servers, knownUsers, updateState, triggerRestart }) {
  const[activeTab, setActiveTab] = useState('account');
  const[tempName, setTempName] = useState(profile.displayName);
  const[tempAvatar, setTempAvatar] = useState(profile.avatar);
  const[tempBio, setTempBio] = useState(profile.bio || '');
  const[showSeed, setShowSeed] = useState(false);
  const fileInputRef = useRef(null);

  const isLegacyAccount = !profile.username || profile.username === 'unknown';
  const[tempUsername, setTempUsername] = useState(isLegacyAccount ? '' : profile.username);

  const[audioInputs, setAudioInputs] = useState([]);
  const[audioOutputs, setAudioOutputs] = useState([]);
  const[videoInputs, setVideoInputs] = useState([]);
  const[selectedInput, setSelectedInput] = useState(localStorage.getItem('pear_audio_input') || 'default');
  const [selectedOutput, setSelectedOutput] = useState(localStorage.getItem('pear_audio_output') || 'default');
  const [selectedVideoInput, setSelectedVideoInput] = useState(localStorage.getItem('pear_video_input') || 'default');

  const [autoRestart, setAutoRestart] = useState(localStorage.getItem('pear_auto_restart') !== 'false');
  const [liveDecryption, setLiveDecryption] = useState(localStorage.getItem('pear_live_decryption') === 'true');
  const [ircMode, setIrcMode] = useState(localStorage.getItem('pear_irc_mode') === 'true');
  const [noiseSuppression, setNoiseSuppression] = useState(localStorage.getItem('pear_noise_suppression') !== 'false');
  const [closeToTray, setCloseToTray] = useState(localStorage.getItem('pear_close_to_tray') !== 'false');
  const [pinMembers, setPinMembers] = useState(localStorage.getItem('pear_pin_members') === 'true');

  const [notifyDMs, setNotifyDMs] = useState(localStorage.getItem('pear_notify_dms') !== 'false');
  const [notifyHubs, setNotifyHubs] = useState(localStorage.getItem('pear_notify_hubs') !== 'false');
  const [notifyMentions, setNotifyMentions] = useState(localStorage.getItem('pear_notify_mentions') !== 'false');
  const [notifyCalls, setNotifyCalls] = useState(localStorage.getItem('pear_notify_calls') !== 'false');

  const defaultTheme = {
    base: '#000000',
    surface: '#0a0a0a',
    panel: '#121212',
    accent: '#5865F2',
    text: '#f3f4f6',
    muted: '#9ca3af'
  };
  const [theme, setTheme] = useState(() => JSON.parse(localStorage.getItem('peercord_theme')) || defaultTheme);

  useEffect(() => {
    if (activeTab === 'voice') {
      navigator.mediaDevices.enumerateDevices().then(devices => {
        setAudioInputs(devices.filter(d => d.kind === 'audioinput'));
        setAudioOutputs(devices.filter(d => d.kind === 'audiooutput'));
        setVideoInputs(devices.filter(d => d.kind === 'videoinput'));
      }).catch(err => console.error("Failed to enumerate devices:", err));
    }
  },[activeTab]);

  const handleInputSelect = (id) => {
    setSelectedInput(id);
    localStorage.setItem('pear_audio_input', id);
  };

  const handleOutputSelect = (id) => {
    setSelectedOutput(id);
    localStorage.setItem('pear_audio_output', id);
  };

  const handleVideoInputSelect = (id) => {
    setSelectedVideoInput(id);
    localStorage.setItem('pear_video_input', id);
  };

  const handleThemeChange = (key, val) => {
    const newTheme = { ...theme, [key]: val };
    setTheme(newTheme);
    document.documentElement.style.setProperty(`--color-${key}`, val);
    localStorage.setItem('peercord_theme', JSON.stringify(newTheme));
  };

  const resetTheme = () => {
    setTheme(defaultTheme);
    Object.entries(defaultTheme).forEach(([key, val]) => {
      document.documentElement.style.setProperty(`--color-${key}`, val);
    });
    localStorage.setItem('peercord_theme', JSON.stringify(defaultTheme));
  };

  const handleImageUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const MAX_SIZE = 128; 
        let width = img.width;
        let height = img.height;
        
        if (width > height) {
          if (width > MAX_SIZE) {
            height *= MAX_SIZE / width;
            width = MAX_SIZE;
          }
        } else {
          if (height > MAX_SIZE) {
            width *= MAX_SIZE / height;
            height = MAX_SIZE;
          }
        }
        
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);
        
        const mimeType = file.type === 'image/png' ? 'image/png' : 'image/jpeg';
        const dataUrl = canvas.toDataURL(mimeType, 0.8);
        
        setTempAvatar(dataUrl);
      };
      img.src = event.target.result;
    };
    reader.readAsDataURL(file);
  };

  const handleSave = () => {
    if (tempName.trim() === '') return;
    
    let finalUsername = profile.username;
    if (isLegacyAccount) {
      finalUsername = tempUsername.trim().toLowerCase().replace(/[^a-z0-9_.]/g, '');
      if (!finalUsername) return alert("Invalid username. Use only letters, numbers, underscores, and periods.");
    }

    onSave(tempName.trim(), tempAvatar, finalUsername, tempBio.trim(), profile.connections || []);
  };

  const copySeed = () => {
    if (profile.seedHex) navigator.clipboard.writeText(profile.seedHex);
  };

  const handleExportAccount = async () => {
    try {
      const data = await network.exportAccount();
      const blob = new Blob([data], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `peercord-backup-${profile.username}-${Date.now()}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      alert("Failed to export account backup.");
      console.error(err);
    }
  };

  const handleWipeData = async () => {
    if (window.confirm("WARNING: Are you absolutely sure you want to wipe all data? \n\nThis will permanently delete your identity, messages, contacts, and hubs you've joined or created. The app will close immediately after. This cannot be undone!")) {
      await network.wipeAllData();
    }
  };

  const handleTrayToggle = (e) => {
    const val = e.target.checked;
    setCloseToTray(val);
    localStorage.setItem('pear_close_to_tray', val);
    if (typeof window !== 'undefined' && window.require) {
      window.require('electron').ipcRenderer.send('set-tray-setting', val);
    }
  };

  return (
    <div className="absolute inset-0 z-50 flex bg-base">
      {/* Sidebar */}
      <div className="w-60 bg-surface flex flex-col py-14 px-4 items-end shrink-0 border-r border-panel">
        <div className="w-48 flex flex-col gap-1">
          <div className="text-xs font-bold text-muted uppercase px-2 mb-1">User Settings</div>
          <button 
            onClick={() => setActiveTab('account')}
            className={`text-left px-3 py-1.5 rounded text-sm font-medium ${activeTab === 'account' ? 'bg-panel text-text' : 'text-muted hover:bg-panel/50 hover:text-text'}`}
          >
            My Account
          </button>
          <button 
            onClick={() => setActiveTab('appearance')}
            className={`text-left px-3 py-1.5 rounded text-sm font-medium ${activeTab === 'appearance' ? 'bg-panel text-text' : 'text-muted hover:bg-panel/50 hover:text-text'}`}
          >
            Appearance
          </button>
          <button 
            onClick={() => setActiveTab('chat')}
            className={`text-left px-3 py-1.5 rounded text-sm font-medium ${activeTab === 'chat' ? 'bg-panel text-text' : 'text-muted hover:bg-panel/50 hover:text-text'}`}
          >
            Chat Settings
          </button>
          <button 
            onClick={() => setActiveTab('notifications')}
            className={`text-left px-3 py-1.5 rounded text-sm font-medium ${activeTab === 'notifications' ? 'bg-panel text-text' : 'text-muted hover:bg-panel/50 hover:text-text'}`}
          >
            Notifications
          </button>
          <button 
            onClick={() => setActiveTab('voice')}
            className={`text-left px-3 py-1.5 rounded text-sm font-medium ${activeTab === 'voice' ? 'bg-panel text-text' : 'text-muted hover:bg-panel/50 hover:text-text'}`}
          >
            Voice & Video
          </button>
          <button 
            onClick={() => setActiveTab('storage')}
            className={`text-left px-3 py-1.5 rounded text-sm font-medium ${activeTab === 'storage' ? 'bg-panel text-text' : 'text-muted hover:bg-panel/50 hover:text-text'}`}
          >
            Storage Management
          </button>
          <button 
            onClick={() => setActiveTab('network')}
            className={`text-left px-3 py-1.5 rounded text-sm font-medium ${activeTab === 'network' ? 'bg-panel text-text' : 'text-muted hover:bg-panel/50 hover:text-text'}`}
          >
            Network & Diagnostics
          </button>
          <button 
            onClick={() => setActiveTab('settings')}
            className={`text-left px-3 py-1.5 rounded text-sm font-medium ${activeTab === 'settings' ? 'bg-panel text-text' : 'text-muted hover:bg-panel/50 hover:text-text'}`}
          >
            App Settings
          </button>
          
          <div className="w-full h-[1px] bg-panel my-2"></div>
          
          <button 
            onClick={onLogout}
            className="text-left px-3 py-1.5 rounded text-sm font-medium text-red-400 hover:bg-red-500/10 hover:text-red-300"
          >
            Log Out
          </button>
        </div>
      </div>

      {/* Content Area */}
      <div className="flex-1 bg-base py-14 px-10 relative overflow-y-auto">
        <button 
          onClick={onClose}
          className="absolute top-10 right-10 w-8 h-8 flex items-center justify-center rounded-full border-2 border-muted text-muted hover:bg-surface hover:text-text transition-colors"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
        </button>

        {activeTab === 'account' && (
          <div className="max-w-2xl">
            <h2 className="text-xl font-bold text-text mb-6">My Account</h2>
            
            <div className="bg-surface rounded-lg p-4 mb-6">
              <div className="flex items-start gap-6">
                <div 
                  className={`w-24 h-24 rounded-md flex items-center justify-center text-white text-3xl font-bold cursor-pointer relative group overflow-hidden shrink-0 ${tempAvatar ? 'bg-transparent' : 'bg-indigo-500'}`}
                  onClick={() => fileInputRef.current?.click()}
                >
                  {tempAvatar ? (
                    <img src={tempAvatar} alt="avatar" className="w-full h-full object-cover" />
                  ) : (
                    tempName.substring(0, 2).toUpperCase()
                  )}
                  <div className="absolute inset-0 bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                    <span className="text-[10px] uppercase tracking-wider text-white">Change</span>
                  </div>
                  <input 
                    type="file" 
                    ref={fileInputRef} 
                    onChange={handleImageUpload} 
                    accept="image/png, image/jpeg" 
                    className="hidden" 
                  />
                </div>
                
                <div className="flex-1">
                  <label className="block text-xs font-bold text-muted uppercase mb-2">Display Name</label>
                  <input 
                    type="text" 
                    value={tempName}
                    onChange={(e) => setTempName(e.target.value)}
                    className="w-full bg-panel text-text rounded p-2 outline-none focus:ring-1 focus:ring-accent mb-4"
                    maxLength={24}
                  />

                  <label className="block text-xs font-bold text-muted uppercase mb-2">Username</label>
                  {isLegacyAccount ? (
                    <input 
                      type="text" 
                      value={tempUsername}
                      onChange={(e) => setTempUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_.]/g, ''))}
                      className="w-full bg-panel text-text rounded p-2 outline-none focus:ring-1 focus:ring-accent text-sm font-mono mb-4"
                      placeholder="Set your username..."
                      maxLength={24}
                    />
                  ) : (
                    <input 
                      type="text" 
                      value={'@' + profile.username}
                      readOnly
                      className="w-full bg-panel text-muted rounded p-2 outline-none text-sm font-mono cursor-not-allowed mb-4"
                    />
                  )}

                  <label className="block text-xs font-bold text-muted uppercase mb-2">About Me (Bio)</label>
                  <textarea 
                    value={tempBio}
                    onChange={(e) => setTempBio(e.target.value)}
                    className="w-full bg-panel text-text rounded p-2 outline-none focus:ring-1 focus:ring-accent text-sm resize-none h-24 custom-scrollbar"
                    placeholder="Tell people a little about yourself..."
                    maxLength={190}
                  />
                </div>
              </div>
            </div>

            <div className="bg-surface rounded-lg p-6 mb-6 border border-yellow-900/50">
              <h3 className="text-yellow-500 font-bold mb-2 uppercase text-xs">Account Backup & Recovery</h3>
              <p className="text-muted text-sm mb-4">
                You can export your entire account (including all chat history, hubs, and settings) to a single file, or copy your raw seed key.
              </p>
              <div className="flex gap-2 mb-4">
                <input 
                  type={showSeed ? "text" : "password"} 
                  value={profile.seedHex}
                  readOnly
                  className="w-full bg-panel text-text rounded p-2 outline-none text-sm font-mono"
                />
                <button onClick={() => setShowSeed(!showSeed)} className="bg-panel hover:bg-base text-text px-4 rounded text-sm font-medium transition-colors border border-surface">
                  {showSeed ? 'Hide' : 'Reveal'}
                </button>
                <button onClick={copySeed} className="bg-accent hover:opacity-90 text-white px-4 rounded text-sm font-medium transition-opacity">
                  Copy
                </button>
              </div>
              <button onClick={handleExportAccount} className="w-full bg-panel hover:bg-base text-text font-bold py-2.5 rounded transition-colors border border-surface flex items-center justify-center gap-2">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
                Export Full Account Backup (.json)
              </button>
            </div>

            <div className="flex justify-end gap-3">
              <button onClick={onClose} className="text-text hover:underline text-sm font-medium px-4 py-2">
                Cancel
              </button>
              <button onClick={handleSave} className="bg-accent hover:opacity-90 text-white px-6 py-2 rounded text-sm font-medium transition-opacity">
                Save Changes
              </button>
            </div>
          </div>
        )}

        {activeTab === 'appearance' && (
          <div className="max-w-2xl">
            <h2 className="text-xl font-bold text-text mb-6">Appearance</h2>
            
            <div className="bg-surface rounded-lg p-6 mb-6">
              <h3 className="text-muted uppercase text-xs font-bold mb-4">Layout</h3>
              <div className="flex items-center gap-3">
                <input 
                  type="checkbox" 
                  checked={pinMembers} 
                  onChange={(e) => {
                    setPinMembers(e.target.checked);
                    localStorage.setItem('pear_pin_members', e.target.checked);
                    window.dispatchEvent(new Event('storage'));
                  }}
                  className="w-5 h-5 accent-accent cursor-pointer"
                />
                <span className="text-sm text-text">Pin Online Users List</span>
              </div>
              <p className="text-[10px] text-muted mt-1 ml-8">
                Keeps the members list permanently open on the right side of Hubs and Group Whispers.
              </p>
            </div>

            <div className="bg-surface rounded-lg p-6 mb-6">
              <h3 className="text-muted uppercase text-xs font-bold mb-4">Theme Colors</h3>
              <div className="grid grid-cols-2 gap-4">
                {Object.entries(theme).map(([key, val]) => (
                  <div key={key} className="flex items-center justify-between bg-panel p-3 rounded">
                    <span className="text-sm text-text capitalize">{key}</span>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-mono text-muted">{val}</span>
                      <input 
                        type="color" 
                        value={val} 
                        onChange={(e) => handleThemeChange(key, e.target.value)}
                        className="w-8 h-8 rounded cursor-pointer bg-transparent border-none p-0"
                      />
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-6 flex justify-end">
                <button onClick={resetTheme} className="text-sm text-red-400 hover:underline">Reset to Default Theme</button>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'chat' && (
          <div className="max-w-2xl">
            <h2 className="text-xl font-bold text-text mb-6">Chat Settings</h2>

            <div className="bg-surface rounded-lg p-6 mb-6">
              <h3 className="text-muted uppercase text-xs font-bold mb-4">Chat Appearance</h3>
              <div className="flex items-center gap-3">
                <input 
                  type="checkbox" 
                  checked={ircMode} 
                  onChange={(e) => {
                    setIrcMode(e.target.checked);
                    localStorage.setItem('pear_irc_mode', e.target.checked);
                    window.dispatchEvent(new Event('storage')); 
                  }}
                  className="w-5 h-5 accent-accent cursor-pointer"
                />
                <span className="text-sm text-text">IRC Mode (Condensed chat)</span>
              </div>
              <p className="text-[10px] text-muted mt-1 ml-8">
                Condenses chat to just lines with name, time, and message. Removes profile pictures.
              </p>
            </div>

            <div className="bg-surface rounded-lg p-6 mb-6">
              <h3 className="text-muted uppercase text-xs font-bold mb-4">Direct Messages</h3>
              <div className="flex items-center gap-3">
                <input 
                  type="checkbox" 
                  checked={liveDecryption} 
                  onChange={(e) => {
                    setLiveDecryption(e.target.checked);
                    localStorage.setItem('pear_live_decryption', e.target.checked);
                    window.dispatchEvent(new Event('storage'));
                  }}
                  className="w-5 h-5 accent-accent cursor-pointer"
                />
                <span className="text-sm text-text">Enable Live Decryption Animation</span>
              </div>
              <p className="text-[10px] text-muted mt-1 ml-8">
                Visually animates the decryption of incoming end-to-end encrypted messages in real-time.
              </p>
            </div>
          </div>
        )}

        {activeTab === 'notifications' && (
          <div className="max-w-2xl">
            <h2 className="text-xl font-bold text-text mb-6">Notifications</h2>

            <div className="bg-surface rounded-lg p-6 mb-6">
              <h3 className="text-muted uppercase text-xs font-bold mb-4">Desktop Notifications</h3>
              
              <div className="space-y-4">
                <div>
                  <div className="flex items-center gap-3">
                    <input 
                      type="checkbox" 
                      checked={notifyDMs} 
                      onChange={(e) => {
                        setNotifyDMs(e.target.checked);
                        localStorage.setItem('pear_notify_dms', e.target.checked);
                      }}
                      className="w-5 h-5 accent-accent cursor-pointer"
                    />
                    <span className="text-sm text-text">Direct Messages & Group Whispers</span>
                  </div>
                  <p className="text-[10px] text-muted mt-1 ml-8">Get notified when someone sends you a direct message.</p>
                </div>

                <div>
                  <div className="flex items-center gap-3">
                    <input 
                      type="checkbox" 
                      checked={notifyMentions} 
                      onChange={(e) => {
                        setNotifyMentions(e.target.checked);
                        localStorage.setItem('pear_notify_mentions', e.target.checked);
                      }}
                      className="w-5 h-5 accent-accent cursor-pointer"
                    />
                    <span className="text-sm text-text">Mentions</span>
                  </div>
                  <p className="text-[10px] text-muted mt-1 ml-8">Get notified when someone mentions you or @everyone in a Hub.</p>
                </div>

                <div>
                  <div className="flex items-center gap-3">
                    <input 
                      type="checkbox" 
                      checked={notifyHubs} 
                      onChange={(e) => {
                        setNotifyHubs(e.target.checked);
                        localStorage.setItem('pear_notify_hubs', e.target.checked);
                      }}
                      className="w-5 h-5 accent-accent cursor-pointer"
                    />
                    <span className="text-sm text-text">All Hub Messages</span>
                  </div>
                  <p className="text-[10px] text-muted mt-1 ml-8">Get notified for every single message sent in any Hub you are a part of.</p>
                </div>

                <div>
                  <div className="flex items-center gap-3">
                    <input 
                      type="checkbox" 
                      checked={notifyCalls} 
                      onChange={(e) => {
                        setNotifyCalls(e.target.checked);
                        localStorage.setItem('pear_notify_calls', e.target.checked);
                      }}
                      className="w-5 h-5 accent-accent cursor-pointer"
                    />
                    <span className="text-sm text-text">Incoming Calls</span>
                  </div>
                  <p className="text-[10px] text-muted mt-1 ml-8">Play a ringtone and show a popup when someone calls you.</p>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'voice' && (
          <div className="max-w-2xl">
            <h2 className="text-xl font-bold text-text mb-6">Voice & Video Settings</h2>
            
            <div className="bg-surface rounded-lg p-6 mb-6">
              <div className="mb-6">
                <label className="block text-xs font-bold text-muted uppercase mb-2">Input Device (Microphone)</label>
                <select 
                  value={selectedInput} 
                  onChange={(e) => handleInputSelect(e.target.value)}
                  className="w-full bg-panel text-text rounded p-3 outline-none focus:ring-1 focus:ring-accent appearance-none cursor-pointer"
                >
                  {audioInputs.length === 0 && <option value="default">Default Microphone</option>}
                  {audioInputs.map(device => (
                    <option key={device.deviceId} value={device.deviceId}>
                      {device.label || `Microphone ${device.deviceId.substring(0, 5)}...`}
                    </option>
                  ))}
                </select>
              </div>

              <div className="mb-6">
                <label className="block text-xs font-bold text-muted uppercase mb-2">Output Device (Speakers)</label>
                <select 
                  value={selectedOutput} 
                  onChange={(e) => handleOutputSelect(e.target.value)}
                  className="w-full bg-panel text-text rounded p-3 outline-none focus:ring-1 focus:ring-accent appearance-none cursor-pointer"
                >
                  {audioOutputs.length === 0 && <option value="default">Default Speakers</option>}
                  {audioOutputs.map(device => (
                    <option key={device.deviceId} value={device.deviceId}>
                      {device.label || `Speaker ${device.deviceId.substring(0, 5)}...`}
                    </option>
                  ))}
                </select>
              </div>

              <div className="mb-6">
                <label className="block text-xs font-bold text-muted uppercase mb-2">Camera (Webcam)</label>
                <select 
                  value={selectedVideoInput} 
                  onChange={(e) => handleVideoInputSelect(e.target.value)}
                  className="w-full bg-panel text-text rounded p-3 outline-none focus:ring-1 focus:ring-accent appearance-none cursor-pointer"
                >
                  {videoInputs.length === 0 && <option value="default">Default Camera</option>}
                  {videoInputs.map(device => (
                    <option key={device.deviceId} value={device.deviceId}>
                      {device.label || `Camera ${device.deviceId.substring(0, 5)}...`}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-muted uppercase mb-2">Audio Processing</label>
                <div className="flex items-center gap-3 bg-panel p-3 rounded">
                  <input 
                    type="checkbox" 
                    checked={noiseSuppression} 
                    onChange={(e) => {
                      setNoiseSuppression(e.target.checked);
                      localStorage.setItem('pear_noise_suppression', e.target.checked);
                    }}
                    className="w-5 h-5 accent-accent cursor-pointer"
                  />
                  <span className="text-sm text-text">Enable Noise Suppression (Crisp/NoiseTorch equivalent)</span>
                </div>
                <p className="text-[10px] text-muted mt-1 ml-8">
                  Uses advanced WebRTC audio processing to filter out background noise, keyboard clicks, and echo.
                </p>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'storage' && (
          <StorageSettings dms={dms} servers={servers} knownUsers={knownUsers} />
        )}

        {activeTab === 'network' && (
          <div className="max-w-2xl">
            <h2 className="text-xl font-bold text-text mb-6">Network & Diagnostics</h2>
            
            <div className="bg-surface rounded-lg p-6 mb-6">
              <h3 className="text-muted uppercase text-xs font-bold mb-4">Connection Status</h3>
              <div className="grid grid-cols-2 gap-4 mb-4">
                <div className="bg-panel p-4 rounded border border-surface">
                  <div className="text-xs text-muted uppercase font-bold mb-1">DHT Status</div>
                  <div className="text-lg font-bold text-green-500">
                    {network.swarm?.dht?.ephemeral !== false ? 'Client Mode (Safe)' : 'Routing Mode (Warning)'}
                  </div>
                </div>
                <div className="bg-panel p-4 rounded border border-surface">
                  <div className="text-xs text-muted uppercase font-bold mb-1">Active Peers</div>
                  <div className="text-lg font-bold text-text">{network.peers.size}</div>
                </div>
                <div className="bg-panel p-4 rounded border border-surface">
                  <div className="text-xs text-muted uppercase font-bold mb-1">Joined Topics</div>
                  <div className="text-lg font-bold text-text">{network.joinedTopics.size}</div>
                </div>
                <div className="bg-panel p-4 rounded border border-surface">
                  <div className="text-xs text-muted uppercase font-bold mb-1">Pending Connections</div>
                  <div className="text-lg font-bold text-text">{network.swarm?.connecting || 0}</div>
                </div>
              </div>
              
              <div className="bg-panel p-4 rounded border border-surface">
                <h4 className="text-sm font-bold text-text mb-2">NAT / Router Health</h4>
                <p className="text-xs text-muted mb-4">
                  If your router's NAT table is exhausted, you will see 0 peers and fail to connect to other services (like VNC). 
                  Client Mode prevents Peercord from routing background traffic for the network, which protects your router.
                </p>
                <p className="text-xs text-yellow-500 font-bold mb-4">
                  Note: If you still cannot connect to anyone, your router's NAT table may currently be full from a previous session. Please restart your router to clear it.
                </p>
                <button 
                  onClick={() => {
                    if (network.swarm) {
                      console.info("--- NETWORK DIAGNOSTICS ---");
                      console.info("Peers:", network.peers.size);
                      console.info("Topics:", network.joinedTopics.size);
                      console.info("Connecting:", network.swarm.connecting);
                      console.info("DHT Ephemeral:", network.swarm.dht?.ephemeral);
                      console.info("---------------------------");
                      alert("Diagnostics logged to F10 Console.");
                    }
                  }}
                  className="bg-accent hover:opacity-90 text-white px-4 py-2 rounded text-sm font-medium transition-opacity"
                >
                  Run Diagnostics (Check F10 Console)
                </button>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'settings' && (
          <div className="max-w-2xl">
            <h2 className="text-xl font-bold text-text mb-6">App Settings</h2>

            <div className="bg-surface rounded-lg p-6 mb-6">
              <h3 className="text-muted uppercase text-xs font-bold mb-4">Window Behavior</h3>
              <div className="flex items-center gap-3">
                <input 
                  type="checkbox" 
                  checked={closeToTray} 
                  onChange={handleTrayToggle}
                  className="w-5 h-5 accent-accent cursor-pointer"
                />
                <span className="text-sm text-text">Close button hides to System Tray</span>
              </div>
              <p className="text-[10px] text-muted mt-1 ml-8">
                If disabled, clicking the X will completely quit the application.
              </p>
            </div>

            <div className="bg-surface rounded-lg p-6 mb-6">
              <h3 className="text-muted uppercase text-xs font-bold mb-4">Update Status</h3>
              {updateState === 'downloading' ? (
                <div className="flex flex-col gap-2">
                  <span className="text-sm text-text">Downloading new version...</span>
                  <div className="w-full bg-base rounded-full h-2 overflow-hidden my-1 relative">
                    <div className="bg-accent h-2 rounded-full absolute top-0 left-0 w-1/2 animate-indeterminate"></div>
                  </div>
                  <span className="text-xs text-muted">Please wait...</span>
                </div>
              ) : updateState === 'available' || updateState === 'countdown' ? (
                <div className="flex flex-col gap-3">
                  <span className="text-sm text-green-500 font-bold">Update Ready to Install</span>
                  <button onClick={triggerRestart} className="bg-accent hover:opacity-90 text-white px-4 py-2 rounded text-sm font-medium transition-opacity w-fit">
                    Restart to Update
                  </button>
                </div>
              ) : updateState === 'gossip_available' || updateState === 'gossip_countdown' ? (
                <div className="flex flex-col gap-3">
                  <span className="text-sm text-green-500 font-bold">New Update Broadcasted!</span>
                  <span className="text-xs text-muted">Restart the app to connect to the new seeder and begin downloading.</span>
                  <button onClick={() => {
                    if (typeof window !== 'undefined' && window.require) {
                      window.require('electron').ipcRenderer.send('normal-restart');
                    } else {
                      window.location.reload();
                    }
                  }} className="bg-accent hover:opacity-90 text-white px-4 py-2 rounded text-sm font-medium transition-opacity w-fit">
                    Restart & Download
                  </button>
                </div>
              ) : (
                <span className="text-sm text-muted">App is up to date.</span>
              )}
            </div>

            <div className="bg-surface rounded-lg p-6 mb-6">
              <h3 className="text-muted uppercase text-xs font-bold mb-4">Updates</h3>
              <div className="flex items-center gap-3">
                <input 
                  type="checkbox" 
                  checked={autoRestart} 
                  onChange={(e) => {
                    setAutoRestart(e.target.checked);
                    localStorage.setItem('pear_auto_restart', e.target.checked);
                  }}
                  className="w-5 h-5 accent-accent cursor-pointer"
                />
                <span className="text-sm text-text">Automatically restart to apply updates</span>
              </div>
              <p className="text-[10px] text-muted mt-1 ml-8">
                If disabled, you will be prompted to restart manually. (Auto-restart is always paused during calls or file transfers).
              </p>
            </div>

            <div className="bg-surface rounded-lg p-6 mb-6 border border-red-900/50">
              <h3 className="text-red-500 font-bold mb-2 uppercase text-xs">Danger Zone</h3>
              <p className="text-muted text-sm mb-4">
                This will permanently delete all your local data, including your cryptographic identity, messages, contacts, and hubs you've joined or created. This action cannot be undone and you will lose access to everything.
              </p>
              <button 
                onClick={handleWipeData}
                className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded text-sm font-medium transition-colors"
              >
                Wipe All App Data
              </button>
            </div>

          </div>
        )}
      </div>
    </div>
  );
}