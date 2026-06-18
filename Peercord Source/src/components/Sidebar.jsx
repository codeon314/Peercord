import React, { useState, useEffect } from 'react';
import logo from '../../assets/iconWhite.png';

// MOVED OUTSIDE: This prevents React from destroying and recreating the DOM node on every render,
// which was the actual cause of the severe flickering.
const NavItem = ({ id, icon, name, isImage, isServerImage, imageClass, onClick, onContextMenu, hasUnread, badgeCount, isActive }) => {
  let dynamicClasses = "";
  if (isServerImage) {
    dynamicClasses = isActive 
      ? "bg-panel rounded-[16px] ring-2 ring-white" 
      : "bg-panel rounded-[24px] hover:rounded-[16px] hover:ring-2 hover:ring-white/50";
  } else {
    dynamicClasses = isActive
      ? "bg-accent text-white rounded-[16px]"
      : "bg-panel text-text rounded-[24px] hover:rounded-[16px] hover:bg-accent hover:text-white";
  }

  return (
    <div className="relative flex justify-center w-full mb-2">
      
      {/* The Interaction Target & Visual Shape */}
      <div 
        className={`relative w-12 h-12 flex items-center justify-center font-bold transition-all duration-300 cursor-pointer group ${dynamicClasses}`}
        onClick={onClick}
        onContextMenu={onContextMenu}
      >
        {/* The Image/Icon */}
        <div className="w-full h-full pointer-events-none flex items-center justify-center" style={{ borderRadius: 'inherit', overflow: 'hidden' }}>
          {isImage ? (
            <img src={icon} alt={name} className={`${imageClass || 'w-full h-full object-cover'}`} />
          ) : (
            icon
          )}
        </div>

        {/* The Active Indicator (White Pill) */}
        <div className={`absolute -left-[12px] top-1/2 -translate-y-1/2 w-1 bg-text rounded-r-full transition-all duration-300 pointer-events-none ${
          isActive ? 'h-10' : (hasUnread ? 'h-2' : 'h-0 group-hover:h-5')
        }`}></div>

        {/* The Tooltip */}
        <div className="absolute left-[62px] top-1/2 -translate-y-1/2 flex items-center opacity-0 group-hover:opacity-100 pointer-events-none z-50 scale-95 group-hover:scale-100 transition-all origin-left duration-150">
          <div className="w-0 h-0 border-y-[6px] border-y-transparent border-r-[6px] border-r-panel -mr-[1px]"></div>
          <div className="bg-panel text-text text-[15px] font-bold py-1.5 px-3 rounded-md shadow-xl whitespace-nowrap">
            {name}
          </div>
        </div>

        {/* Red Dot Indicator (For Servers) */}
        {hasUnread && !isActive && !badgeCount && (
          <div className="absolute -top-0.5 -right-0.5 w-3.5 h-3.5 bg-red-500 rounded-full border-[3px] border-base pointer-events-none"></div>
        )}

        {/* Numbered Badge (For Whispers & Hubs) */}
        {badgeCount > 0 && (
          <div className={`absolute -bottom-1 -right-1 bg-red-500 text-white text-[10px] font-bold border-[3px] border-base pointer-events-none flex items-center justify-center shadow-sm rounded-full h-5 ${badgeCount > 9 ? 'px-1 min-w-[20px]' : 'w-5'}`}>
            {badgeCount > 99 ? '99+' : badgeCount}
          </div>
        )}
      </div>
    </div>
  );
};

export default function Sidebar({ activeView, setActiveView, servers, myKey, onOpenCreateServer, onLeaveServer, unreadCounts = {} }) {
  const[contextMenu, setContextMenu] = useState(null);

  useEffect(() => {
    const handleClick = () => setContextMenu(null);
    if (contextMenu) document.addEventListener('click', handleClick);
    return () => document.removeEventListener('click', handleClick);
  },[contextMenu]);

  const publicServers = servers.filter(s => s.isGroupChat !== true);

  // Calculate total unread DMs and Group Chats for the Whispers badge
  let dmUnreadCount = 0;
  Object.entries(unreadCounts).forEach(([key, count]) => {
    if (!key.includes('-') || key.length === 64) {
      dmUnreadCount += count;
    }
  });

  return (
    <div className="w-[72px] bg-base flex flex-col py-3 items-center shrink-0 overflow-y-auto hide-scrollbar border-r border-surface relative z-20">
      
      {contextMenu && (
        <div className="fixed inset-0 z-50" onClick={() => setContextMenu(null)} onContextMenu={(e) => { e.preventDefault(); setContextMenu(null); }}>
          <div 
            className="absolute bg-panel border border-surface shadow-xl rounded py-1.5 w-40 flex flex-col"
            style={{ top: contextMenu.y, left: contextMenu.x }}
            onClick={(e) => e.stopPropagation()}
          >
            <button 
              className="w-full text-left px-3 py-1.5 text-sm text-red-500 hover:bg-red-500 hover:text-white transition-colors"
              onClick={() => {
                onLeaveServer(contextMenu.topicHex);
                setContextMenu(null);
              }}
            >
              Leave Hub
            </button>
          </div>
        </div>
      )}

      <NavItem
        id="dms"
        name="Whispers"
        isImage={true}
        isServerImage={false}
        icon={logo}
        imageClass="w-7 h-7 object-contain"
        onClick={() => setActiveView('dms')}
        badgeCount={dmUnreadCount}
        isActive={activeView === 'dms'}
      />

      <div className="w-8 h-[2px] bg-surface rounded-full my-2 shrink-0"></div>

      {publicServers.map(server => {
        let serverUnreadCount = 0;
        Object.entries(unreadCounts).forEach(([key, count]) => {
          if (key.startsWith(server.topicHex + '-')) {
            serverUnreadCount += count;
          }
        });

        return (
          <NavItem
            key={server.topicHex}
            id={server.topicHex}
            name={server.name}
            isImage={!!server.icon}
            isServerImage={!!server.icon}
            icon={server.icon || server.name.substring(0, 2).toUpperCase()}
            onClick={() => setActiveView(server.topicHex)}
            hasUnread={serverUnreadCount > 0}
            badgeCount={serverUnreadCount}
            isActive={activeView === server.topicHex}
            onContextMenu={(e) => {
              e.preventDefault();
              if (server.owner === myKey) return; 
              setContextMenu({ x: e.pageX, y: e.pageY, topicHex: server.topicHex });
            }}
          />
        );
      })}

      {/* Create Hub Button */}
      <div className="relative flex justify-center w-full mt-2">
        <div 
          className="relative w-12 h-12 flex items-center justify-center font-bold transition-all duration-300 cursor-pointer group bg-panel text-accent rounded-[24px] hover:rounded-[16px] hover:bg-accent hover:text-white"
          onClick={onOpenCreateServer}
        >
          <div className="w-full h-full pointer-events-none flex items-center justify-center" style={{ borderRadius: 'inherit', overflow: 'hidden' }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
          </div>
          
          {/* Tooltip */}
          <div className="absolute left-[62px] top-1/2 -translate-y-1/2 flex items-center opacity-0 group-hover:opacity-100 pointer-events-none z-50 scale-95 group-hover:scale-100 transition-all origin-left duration-150">
            <div className="w-0 h-0 border-y-[6px] border-y-transparent border-r-[6px] border-r-panel -mr-[1px]"></div>
            <div className="bg-panel text-text text-[15px] font-bold py-1.5 px-3 rounded-md shadow-xl whitespace-nowrap">
              Create Hub
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}