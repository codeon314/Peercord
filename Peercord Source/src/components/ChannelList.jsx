import React, { useState, useEffect } from 'react';
import { network, ADMIN_PUBLIC_KEY } from '../p2p/index.js';
import CreateChannelModal from './CreateChannelModal.jsx';

export default function ChannelList({ activeChannel, setActiveChannel, myKey, profile, unreadCounts, onOpenSettings, activeView, servers, onOpenInvite, onOpenServerSettings, isSyncing, onlinePeers, knownUsers, serverMembers, activeCall, onReturnToCall, vcStates, activeVc, onJoinVC, isNetworkOnline }) {
  const activeServerObj = servers.find(s => s.topicHex === activeView);
  const serverName = activeServerObj ? activeServerObj.name : 'Unknown Hub';
  
  const currentMembers = new Set(serverMembers[activeView] ||[]);
  if (activeServerObj) currentMembers.add(activeServerObj.owner);

  const onlineServerPeers = onlinePeers.filter(p => p.key !== myKey && currentMembers.has(p.key));
  const hasOnlinePeers = onlineServerPeers.length > 0;

  const [isCreateChannelOpen, setIsCreateChannelOpen] = useState(false);
  const [createChannelType, setCreateChannelType] = useState('text');

  let syncText = 'Synced';
  let syncColor = 'bg-green-500';
  if (!hasOnlinePeers) {
    syncText = 'Waiting for Peers';
    syncColor = 'bg-gray-500';
  } else if (isSyncing) {
    syncText = 'Syncing...';
    syncColor = 'bg-yellow-500 animate-pulse';
  }
  
  const textChannels = activeServerObj?.channels?.text || ['general-chat'];
  const voiceChannels = activeServerObj?.channels?.voice || ['general-voice'];

  let isServerAdmin = activeServerObj?.owner === myKey || myKey === ADMIN_PUBLIC_KEY;
  let canManageChannels = isServerAdmin;
  let canManageRoles = isServerAdmin;
  let hasReadPerm = isServerAdmin;
  let canInvite = isServerAdmin || activeServerObj?.allowAnyoneToInvite;
  
  if (!isServerAdmin && activeServerObj) {
    const userRoles = activeServerObj.memberRoles?.[myKey] || [];
    isServerAdmin = userRoles.some(rId => {
      const r = activeServerObj.roles?.find(role => role.id === rId);
      return r && r.permissions.includes('admin');
    });
    if (isServerAdmin) {
      canManageChannels = true;
      canManageRoles = true;
      hasReadPerm = true;
      canInvite = true;
    } else {
      canManageChannels = userRoles.some(rId => {
        const r = activeServerObj.roles?.find(role => role.id === rId);
        return r && r.permissions.includes('manage_channels');
      });
      canManageRoles = userRoles.some(rId => {
        const r = activeServerObj.roles?.find(role => role.id === rId);
        return r && r.permissions.includes('manage_roles');
      });
      hasReadPerm = userRoles.some(rId => {
        const r = activeServerObj.roles?.find(role => role.id === rId);
        return r && r.permissions.includes('read_messages');
      });
    }
  }
  
  const canOpenSettings = isServerAdmin || canManageChannels || canManageRoles;

  const visibleTextChannels = textChannels.filter(ch => {
    if (isServerAdmin) return true;
    if (!hasReadPerm && activeServerObj?.roles && activeServerObj.roles.length > 0) return false;
    const channelPerms = activeServerObj?.channels?.permissions?.[ch];
    if (channelPerms && channelPerms.length > 0) {
      const userRoles = activeServerObj?.memberRoles?.[myKey] || [];
      return userRoles.some(rId => channelPerms.includes(rId));
    }
    return true;
  });

  const visibleVoiceChannels = voiceChannels.filter(ch => {
    if (isServerAdmin) return true;
    if (!hasReadPerm && activeServerObj?.roles && activeServerObj.roles.length > 0) return false;
    const channelPerms = activeServerObj?.channels?.permissions?.[ch];
    if (channelPerms && channelPerms.length > 0) {
      const userRoles = activeServerObj?.memberRoles?.[myKey] || [];
      return userRoles.some(rId => channelPerms.includes(rId));
    }
    return true;
  });

  const visibleTextChannelsStr = visibleTextChannels.join(',');
  const visibleVoiceChannelsStr = visibleVoiceChannels.join(',');

  useEffect(() => {
    if (activeServerObj && !visibleTextChannels.includes(activeChannel) && !visibleVoiceChannels.includes(activeChannel)) {
      if (visibleTextChannels.length > 0) {
        setActiveChannel(visibleTextChannels[0]);
      }
    }
  }, [activeServerObj, activeChannel, visibleTextChannelsStr, visibleVoiceChannelsStr, setActiveChannel]);

  const handleCreateChannel = (name, type) => {
    const newChannels = {
      text: [...textChannels],
      voice: [...voiceChannels],
      permissions: { ...(activeServerObj.channels?.permissions || {}) },
      send_permissions: { ...(activeServerObj.channels?.send_permissions || {}) }
    };
    
    if (type === 'text' && !newChannels.text.includes(name)) newChannels.text.push(name);
    if (type === 'voice' && !newChannels.voice.includes(name)) newChannels.voice.push(name);
    
    network.updateServerSettings(activeView, activeServerObj.name, activeServerObj.icon, activeServerObj.allowAnyoneToInvite, newChannels);
    setIsCreateChannelOpen(false);
  };

  const renderChannel = (id, name) => {
    const isActive = activeChannel === id;
    const networkId = `${activeView}-${id}`;
    const unread = unreadCounts[networkId] || 0;
    const hasUnread = unread > 0 && !isActive;

    return (
      <div 
        key={id}
        onClick={() => setActiveChannel(id)}
        className={`px-2 py-1.5 rounded cursor-pointer flex items-center justify-between group ${
          isActive ? 'bg-panel text-text' : 'text-muted hover:bg-panel/50 hover:text-text'
        }`}
      >
        <div className="flex items-center gap-2">
          <span className="text-muted text-xl">#</span> 
          <span className={hasUnread ? 'font-bold text-text' : ''}>{name}</span>
        </div>
        {hasUnread && (
          <div className="bg-red-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">
            {unread > 99 ? '99+' : unread}
          </div>
        )}
      </div>
    );
  };

  const renderVoiceChannel = (id, name) => {
    const isActive = activeVc?.channelId === id && activeVc?.serverId === activeView;
    const vcPeers = vcStates[activeView]?.[id] || {};
    const peerKeys = Object.keys(vcPeers);

    return (
      <div key={id} className="flex flex-col mt-1">
        <div 
          onClick={() => onJoinVC(id)}
          className={`px-2 py-1.5 rounded cursor-pointer flex items-center gap-2 group ${
            isActive ? 'bg-panel text-text' : 'text-muted hover:bg-panel/50 hover:text-text'
          }`}
        >
          <span className="text-muted text-xl">🔊</span> 
          <span className={isActive ? 'font-bold text-text' : ''}>{name}</span>
        </div>
        
        {peerKeys.length > 0 && (
          <div className="flex flex-col gap-0.5 mt-0.5 pl-6 pr-2">
            {peerKeys.map(peerKey => {
              const state = vcPeers[peerKey];
              let peerProfile = knownUsers.find(u => u.key === peerKey);
              if (peerKey === myKey) peerProfile = profile;
              if (!peerProfile) return null;

              return (
                <div key={peerKey} className="flex items-center justify-between group hover:bg-panel/50 rounded px-2 py-1 cursor-pointer">
                  <div className="flex items-center gap-2 overflow-hidden min-w-0">
                    <div className={`w-6 h-6 rounded-full flex items-center justify-center text-white text-[10px] font-bold shrink-0 overflow-hidden ${peerProfile.avatar ? 'bg-transparent' : 'bg-indigo-500'}`}>
                      {peerProfile.avatar ? <img src={peerProfile.avatar} className="w-full h-full object-cover" /> : peerProfile.displayName.substring(0, 2).toUpperCase()}
                    </div>
                    <span className="text-sm text-muted group-hover:text-text truncate">{peerProfile.displayName}</span>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0 text-muted ml-3">
                    {state.screenshare && (
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="3" width="20" height="14" rx="2" ry="2"></rect><line x1="8" y1="21" x2="16" y2="21"></line><line x1="12" y1="17" x2="12" y2="21"></line></svg>
                    )}
                    {state.muted && (
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="1" y1="1" x2="23" y2="23"></line><path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6"></path><path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2a7 7 0 0 1-.11 1.23"></path><line x1="12" y1="19" x2="12" y2="23"></line><line x1="8" y1="23" x2="16" y2="23"></line></svg>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="w-60 bg-surface flex flex-col shrink-0 border-r border-base">
      
      {activeCall && (
        <div 
          onClick={onReturnToCall}
          className="bg-accent hover:opacity-90 text-white text-xs font-bold p-2 cursor-pointer flex items-center justify-center gap-2 transition-opacity shrink-0"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path></svg>
          Return to Call
        </div>
      )}

      <div className="h-14 shadow-sm flex flex-col justify-center px-4 border-b border-base truncate hover:bg-panel transition-colors cursor-pointer group shrink-0">
        <div className="flex items-center justify-between">
          <span className="font-bold text-text truncate">{serverName}</span>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-muted group-hover:text-text transition-colors shrink-0">
            <polyline points="6 9 12 15 18 9"></polyline>
          </svg>
        </div>
        <div className="flex items-center gap-1.5">
          <div className={`w-1.5 h-1.5 rounded-full ${syncColor}`}></div>
          <span className="text-[9px] font-bold text-muted uppercase tracking-wider">{syncText}</span>
        </div>
      </div>

      <div className="flex-1 p-2 space-y-1 overflow-y-auto">
        
        <div className="flex flex-col gap-1 mb-2 border-b border-base pb-2">
          {canInvite && (
            <button onClick={onOpenInvite} className="w-full text-left px-2 py-1.5 text-sm text-accent hover:bg-accent/10 rounded transition-colors flex items-center justify-between">
              Invite Contacts
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M15 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm-9-2V7H4v3H1v2h3v3h2v-3h3v-2H6zm9 4c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/></svg>
            </button>
          )}
          {canOpenSettings && (
            <button onClick={onOpenServerSettings} className="w-full text-left px-2 py-1.5 text-sm text-muted hover:bg-panel hover:text-text rounded transition-colors flex items-center justify-between">
              Hub Settings
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg>
            </button>
          )}
        </div>

        <div className="px-2 py-1 text-xs font-bold text-muted uppercase mt-2 flex justify-between items-center">
          <span>Text Rooms</span>
          {canManageChannels && <button onClick={() => { setCreateChannelType('text'); setIsCreateChannelOpen(true); }} className="hover:text-text" title="Create Text Channel">+</button>}
        </div>
        {visibleTextChannels.map(ch => renderChannel(ch, ch))}
        
        <div className="px-2 py-1 mt-4 text-xs font-bold text-muted uppercase flex justify-between items-center">
          <span>Voice Rooms</span>
          {canManageChannels && <button onClick={() => { setCreateChannelType('voice'); setIsCreateChannelOpen(true); }} className="hover:text-text" title="Create Voice Channel">+</button>}
        </div>
        {visibleVoiceChannels.map(ch => renderVoiceChannel(ch, ch))}
      </div>
      
      <div 
        className="h-16 bg-panel flex items-center px-3 gap-3 shrink-0 cursor-pointer hover:bg-surface transition-colors border-t border-base"
        onClick={onOpenSettings}
      >
        <div className="relative shrink-0 w-10 h-10">
          <div className={`w-full h-full rounded-md flex items-center justify-center text-white text-sm font-bold overflow-hidden ${profile.avatar ? 'bg-transparent' : 'bg-indigo-500'}`}>
            {profile.avatar ? (
              <img src={profile.avatar} alt="avatar" className="w-full h-full object-cover" />
            ) : (
              profile.displayName.substring(0, 2).toUpperCase()
            )}
          </div>
          <div className={`absolute -bottom-1 -right-1 w-3.5 h-3.5 rounded-full border-[3px] border-panel ${isNetworkOnline ? 'bg-green-500' : 'bg-red-500'}`} title={isNetworkOnline ? "Online" : "Offline"}></div>
        </div>
        <div className="flex flex-col overflow-hidden">
          <span className="text-sm font-bold text-text leading-tight truncate flex items-center gap-1">
            {profile.displayName}
            {myKey === ADMIN_PUBLIC_KEY && <span title="Platform Admin">👑</span>}
          </span>
          <span className="text-[10px] text-muted leading-tight truncate">@{profile.username}</span>
        </div>
      </div>

      {isCreateChannelOpen && (
        <CreateChannelModal 
          onClose={() => setIsCreateChannelOpen(false)} 
          onSave={handleCreateChannel} 
          defaultType={createChannelType} 
        />
      )}
    </div>
  );
}