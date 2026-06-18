import React, { useState } from 'react';
import { network, ADMIN_PUBLIC_KEY } from '../p2p/index.js';
import UserProfileModal from './UserProfileModal.jsx';

export default function OnlineUsers({ onlinePeers, knownUsers, dms, myKey, profile, activeView, servers, serverMembers, onClose, pinMembers, onNavigateToDM }) {
  const [selectedUser, setSelectedUser] = useState(null);

  const isCustomServer = activeView !== 'dms';
  const serverObj = isCustomServer ? servers.find(s => s.topicHex === activeView) : null;
  const isGroupChat = serverObj?.isGroupChat;

  const currentMembers = isCustomServer ? new Set(serverMembers[activeView] ||[]) : null;
  
  if (isCustomServer && serverObj) {
    currentMembers.add(serverObj.owner);
    currentMembers.add(myKey); 
  }

  const me = { key: myKey, displayName: profile.displayName, username: profile.username, avatar: profile.avatar, bio: profile.bio, connections: profile.connections };
  const allOnlinePeers = [me, ...onlinePeers];

  const filteredOnlinePeers = isCustomServer ? allOnlinePeers.filter(p => currentMembers.has(p.key)) : allOnlinePeers;
  const onlineKeys = new Set(filteredOnlinePeers.map(p => p.key));
  
  const offlineUsers =[];
  if (isCustomServer && currentMembers) {
    currentMembers.forEach(key => {
      if (!onlineKeys.has(key) && key !== myKey) {
        const known = knownUsers.find(u => u.key === key);
        if (known) offlineUsers.push(known);
        else offlineUsers.push({ key, displayName: 'Unknown User', username: 'unknown', avatar: null, bio: '', connections: [] });
      }
    });
  } else {
    offlineUsers.push(...knownUsers.filter(u => !onlineKeys.has(u.key) && u.key !== myKey));
  }

  const renderUser = (peer, isOnline) => {
    let isPlatformAdmin = peer.key === ADMIN_PUBLIC_KEY;
    let isServerOwner = isCustomServer && !isGroupChat && serverObj?.owner === peer.key;
    let isGroupCreator = isGroupChat && serverObj?.owner === peer.key;
    
    return (
      <div 
        key={peer.key} 
        onClick={() => setSelectedUser(peer)}
        className={`flex items-center justify-between group cursor-pointer hover:bg-panel p-2 rounded ${!isOnline ? 'opacity-60 hover:opacity-100' : ''}`}
      >
        <div className="flex items-center gap-3 overflow-hidden">
          <div className="relative shrink-0 w-8 h-8">
            <div className={`w-full h-full rounded-md flex items-center justify-center text-white text-xs font-bold overflow-hidden ${peer.avatar ? 'bg-transparent' : 'bg-indigo-500'}`}>
              {peer.avatar ? (
                <img src={peer.avatar} alt="avatar" className="w-full h-full object-cover" />
              ) : (
                peer.displayName.substring(0, 2).toUpperCase()
              )}
            </div>
            <div className={`absolute -bottom-1 -right-1 w-3.5 h-3.5 rounded-full border-[3px] border-surface ${isOnline ? 'bg-green-500' : 'bg-gray-500'}`}></div>
          </div>
          <div className="flex flex-col overflow-hidden">
            <span className="text-text text-sm truncate flex items-center gap-1">
              {peer.displayName} {peer.key === myKey && <span className="text-muted text-xs ml-1">(You)</span>}
              {isPlatformAdmin && <span title="Platform Admin" className="text-yellow-500 ml-1">👑</span>}
              {isServerOwner && <span title="Hub Owner" className="text-yellow-500 ml-1">👑</span>}
              {isGroupCreator && <span title="Group Creator" className="text-muted ml-1">👑</span>}
            </span>
            <span className="text-muted text-[10px] truncate">@{peer.username}</span>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="w-full h-full flex flex-col p-4 overflow-y-auto relative">
      <div className="flex justify-between items-center mb-4">
        <div className="text-xs font-bold text-muted uppercase">
          {isGroupChat ? 'Members' : 'Online'} — {filteredOnlinePeers.length}
        </div>
        {!pinMembers && (
          <button onClick={onClose} className="text-muted hover:text-text">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
          </button>
        )}
      </div>
      
      <div className="space-y-1 mb-6">
        {filteredOnlinePeers.map(peer => renderUser(peer, true))}
      </div>

      {offlineUsers.length > 0 && (
        <>
          <div className="text-xs font-bold text-muted uppercase mb-2">
            Offline — {offlineUsers.length}
          </div>
          <div className="space-y-1">
            {offlineUsers.map(peer => renderUser(peer, false))}
          </div>
        </>
      )}

      {selectedUser && (
        <UserProfileModal 
          user={selectedUser} 
          onClose={() => setSelectedUser(null)} 
          onSendDM={selectedUser.key !== myKey ? (u) => {
            network.openDM(u.key, { displayName: u.displayName, username: u.username, avatar: u.avatar, bio: u.bio, connections: u.connections });
            if (onNavigateToDM) onNavigateToDM(u.key);
          } : null}
        />
      )}
    </div>
  );
}