import React, { useState, useEffect } from 'react';
import { network, ADMIN_PUBLIC_KEY } from '../p2p/index.js';

export default function DMList({ activeChannel, setActiveChannel, myKey, profile, unreadCounts, onOpenSettings, dms, servers, onlinePeers, typingUsers, activeCall, onReturnToCall, onOpenCreateGroup, onLeaveGroup, onDeleteGroup, isNetworkOnline }) {
  const [now, setNow] = useState(Date.now());
  const [contextMenu, setContextMenu] = useState(null);
  const [dmContextMenu, setDmContextMenu] = useState(null);

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  },[]);

  useEffect(() => {
    const handleClick = () => {
      setContextMenu(null);
      setDmContextMenu(null);
    };
    if (contextMenu || dmContextMenu) document.addEventListener('click', handleClick);
    return () => document.removeEventListener('click', handleClick);
  },[contextMenu, dmContextMenu]);

  // Filter out closed or blocked DMs from the main list
  const acceptedDMs = Object.entries(dms).filter(([_, data]) => data.status === 'accepted' && data.isOpen !== false);
  const pendingIncoming = Object.entries(dms).filter(([_, data]) => data.status === 'pending_incoming');
  const groupChats = servers.filter(s => s.isGroupChat);

  const handleCloseDM = (pubKey) => {
    network.closeDM(pubKey);
    if (activeChannel === pubKey) setActiveChannel('friends');
    setDmContextMenu(null);
  };

  const handleRemoveFriend = (pubKey) => {
    if (window.confirm("Are you sure you want to remove this contact?")) {
      network.removeFriend(pubKey);
      if (activeChannel === pubKey) setActiveChannel('friends');
      setDmContextMenu(null);
    }
  };

  const handleBlockUser = (pubKey) => {
    if (window.confirm("Are you sure you want to block this user? You will no longer receive messages from them.")) {
      network.blockUser(pubKey);
      if (activeChannel === pubKey) setActiveChannel('friends');
      setDmContextMenu(null);
    }
  };

  const renderDM = (pubKey, data) => {
    const isActive = activeChannel === pubKey;
    const unread = unreadCounts[pubKey] || 0;
    const hasUnread = unread > 0 && !isActive;
    const dmProfile = data.profile || { displayName: 'Unknown', username: 'unknown' };
    
    const isOnline = onlinePeers.some(p => p.key === pubKey);
    const isTyping = typingUsers[pubKey] && 
                     typingUsers[pubKey].channel === myKey && 
                     (now - typingUsers[pubKey].timestamp < 3000) &&
                     pubKey !== activeChannel;

    return (
      <div 
        key={pubKey}
        onClick={() => setActiveChannel(pubKey)}
        onContextMenu={(e) => {
          e.preventDefault();
          setDmContextMenu({ x: e.pageX, y: e.pageY, pubKey });
        }}
        className={`px-2 py-1.5 rounded cursor-pointer flex items-center justify-between group ${
          isActive ? 'bg-panel text-text' : 'text-muted hover:bg-panel/50 hover:text-text'
        }`}
      >
        <div className="flex items-center gap-3 overflow-hidden">
          <div className="relative shrink-0 w-8 h-8">
            <div className={`w-full h-full rounded-md flex items-center justify-center text-white text-xs font-bold overflow-hidden ${dmProfile.avatar ? 'bg-transparent' : 'bg-indigo-500'}`}>
              {dmProfile.avatar ? (
                <img src={dmProfile.avatar} alt="avatar" className="w-full h-full object-cover" />
              ) : (
                dmProfile.displayName.substring(0, 2).toUpperCase()
              )}
            </div>
            <div className={`absolute -bottom-1 -right-1 w-3.5 h-3.5 rounded-full border-[3px] border-surface ${isOnline ? 'bg-green-500' : 'bg-gray-500'}`}></div>
          </div>
          <div className="flex flex-col overflow-hidden leading-tight justify-center">
            <span className={`truncate ${hasUnread && !isTyping ? 'font-bold text-text' : ''}`}>{dmProfile.displayName}</span>
            {isTyping && (
              <div className="flex gap-1 items-center mt-0.5 ml-1">
                <span className="w-1.5 h-1.5 rounded-full typing-dot" style={{ animationDelay: '0s' }}></span>
                <span className="w-1.5 h-1.5 rounded-full typing-dot" style={{ animationDelay: '0.15s' }}></span>
                <span className="w-1.5 h-1.5 rounded-full typing-dot" style={{ animationDelay: '0.3s' }}></span>
              </div>
            )}
          </div>
        </div>
        {hasUnread && !isTyping && (
          <div className="bg-red-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full shrink-0">
            {unread > 99 ? '99+' : unread}
          </div>
        )}
      </div>
    );
  };

  const renderGC = (gc) => {
    const isActive = activeChannel === gc.topicHex;
    const unread = unreadCounts[gc.topicHex] || 0;
    const hasUnread = unread > 0 && !isActive;

    return (
      <div 
        key={gc.topicHex}
        onClick={() => setActiveChannel(gc.topicHex)}
        onContextMenu={(e) => {
          e.preventDefault();
          setContextMenu({ x: e.pageX, y: e.pageY, topicHex: gc.topicHex, isOwner: gc.owner === myKey });
        }}
        className={`px-2 py-1.5 rounded cursor-pointer flex items-center justify-between group ${
          isActive ? 'bg-panel text-text' : 'text-muted hover:bg-panel/50 hover:text-text'
        }`}
      >
        <div className="flex items-center gap-3 overflow-hidden">
          <div className="relative shrink-0 w-8 h-8">
            <div className={`w-full h-full rounded-md flex items-center justify-center text-white text-xs font-bold overflow-hidden ${gc.icon ? 'bg-transparent' : 'bg-accent'}`}>
              {gc.icon ? (
                <img src={gc.icon} alt="icon" className="w-full h-full object-cover" />
              ) : (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zm0 2a9.985 9.985 0 0 0-8 4 9.985 9.985 0 0 0 8 4 9.985 9.985 0 0 0 8-4 9.985 9.985 0 0 0-8-4z"/></svg>
              )}
            </div>
          </div>
          <div className="flex flex-col overflow-hidden leading-tight justify-center">
            <span className={`truncate ${hasUnread ? 'font-bold text-text' : ''}`}>{gc.name}</span>
            <span className="text-[10px] text-muted truncate">Group Whisper</span>
          </div>
        </div>
        {hasUnread && (
          <div className="bg-red-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full shrink-0">
            {unread > 99 ? '99+' : unread}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="w-60 bg-surface flex flex-col shrink-0 relative border-r border-base">
      
      {contextMenu && (
        <div className="fixed inset-0 z-50" onClick={() => setContextMenu(null)} onContextMenu={(e) => { e.preventDefault(); setContextMenu(null); }}>
          <div 
            className="absolute bg-panel border border-surface shadow-xl rounded py-1.5 w-40 flex flex-col"
            style={{ top: contextMenu.y, left: contextMenu.x }}
            onClick={(e) => e.stopPropagation()}
          >
            {contextMenu.isOwner ? (
              <button 
                className="w-full text-left px-3 py-1.5 text-sm text-red-500 hover:bg-red-500 hover:text-white transition-colors"
                onClick={() => {
                  if (window.confirm("Are you sure you want to delete this group whisper? This will remove it for everyone and delete all message history.")) {
                    onDeleteGroup(contextMenu.topicHex);
                    setContextMenu(null);
                  }
                }}
              >
                Delete Group
              </button>
            ) : (
              <button 
                className="w-full text-left px-3 py-1.5 text-sm text-red-500 hover:bg-red-500 hover:text-white transition-colors"
                onClick={() => {
                  onLeaveGroup(contextMenu.topicHex);
                  setContextMenu(null);
                }}
              >
                Leave Group
              </button>
            )}
          </div>
        </div>
      )}

      {dmContextMenu && (
        <div className="fixed inset-0 z-50" onClick={() => setDmContextMenu(null)} onContextMenu={(e) => { e.preventDefault(); setDmContextMenu(null); }}>
          <div 
            className="absolute bg-panel border border-surface shadow-xl rounded py-1.5 w-40 flex flex-col"
            style={{ top: dmContextMenu.y, left: dmContextMenu.x }}
            onClick={(e) => e.stopPropagation()}
          >
            <button 
              className="w-full text-left px-3 py-1.5 text-sm text-text hover:bg-accent hover:text-white transition-colors"
              onClick={() => handleCloseDM(dmContextMenu.pubKey)}
            >
              Close DM
            </button>
            <button 
              className="w-full text-left px-3 py-1.5 text-sm text-red-500 hover:bg-red-500 hover:text-white transition-colors"
              onClick={() => handleRemoveFriend(dmContextMenu.pubKey)}
            >
              Remove Contact
            </button>
            <button 
              className="w-full text-left px-3 py-1.5 text-sm text-red-500 hover:bg-red-500 hover:text-white transition-colors"
              onClick={() => handleBlockUser(dmContextMenu.pubKey)}
            >
              Block User
            </button>
          </div>
        </div>
      )}

      {activeCall && (
        <div 
          onClick={onReturnToCall}
          className="bg-accent hover:opacity-90 text-white text-xs font-bold p-2 cursor-pointer flex items-center justify-center gap-2 transition-opacity shrink-0"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path></svg>
          Return to Call
        </div>
      )}

      <div className="h-14 shadow-sm flex items-center px-4 border-b border-base shrink-0">
        <button 
          onClick={() => setActiveChannel('friends')}
          className="w-full bg-panel text-muted text-sm text-left px-3 py-1.5 rounded hover:bg-panel/80 transition-colors"
        >
          Find a conversation
        </button>
      </div>
      
      <div className="flex-1 p-2 space-y-1 overflow-y-auto">
        <div 
          onClick={() => setActiveChannel('friends')}
          className={`px-2 py-2 rounded cursor-pointer flex items-center justify-between ${activeChannel === 'friends' ? 'bg-panel text-text' : 'text-muted hover:bg-panel/50 hover:text-text'}`}
        >
          <div className="flex items-center gap-3 font-medium">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zm0 2a9.985 9.985 0 0 0-8 4 9.985 9.985 0 0 0 8 4 9.985 9.985 0 0 0 8-4 9.985 9.985 0 0 0-8-4z"/></svg>
            Contacts
          </div>
          {pendingIncoming.length > 0 && (
            <div className="bg-red-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">
              {pendingIncoming.length}
            </div>
          )}
        </div>

        <div className="px-2 py-1 mt-4 text-xs font-bold text-muted uppercase flex justify-between items-center">
          <span>Whispers</span>
          <button 
            onClick={onOpenCreateGroup} 
            className="text-accent hover:text-white bg-accent/10 hover:bg-accent/20 px-2 py-0.5 rounded transition-colors flex items-center gap-1" 
            title="Create Group Whisper"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
            New
          </button>
        </div>
        
        <div className="mt-2 space-y-0.5">
          {groupChats.map(gc => renderGC(gc))}
          {acceptedDMs.map(([pubKey, data]) => renderDM(pubKey, data))}
        </div>
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
            {myKey === ADMIN_PUBLIC_KEY && <span title="Admin">👑</span>}
          </span>
          <span className="text-[10px] text-muted leading-tight truncate">@{profile.username}</span>
        </div>
      </div>
    </div>
  );
}