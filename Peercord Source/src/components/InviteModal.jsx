import React, { useState } from 'react';
import { network } from '../p2p/index.js';

export default function InviteModal({ onClose, serverTopicHex, dms, serverMembers, isGroupChat }) {
  const[sentInvites, setSentInvites] = useState(new Set());
  const[searchQuery, setSearchQuery] = useState('');

  const membersSet = new Set(serverMembers[serverTopicHex] ||[]);

  const friends = Object.entries(dms)
    .filter(([_, data]) => data.status === 'accepted')
    .filter(([_, data]) => 
      data.profile?.displayName?.toLowerCase().includes(searchQuery.toLowerCase())
    );

  const handleInvite = (friendKey) => {
    if (sentInvites.has(friendKey) || membersSet.has(friendKey)) return;
    
    if (isGroupChat) {
      network.sendGroupChatAdd(friendKey, serverTopicHex);
    } else {
      network.sendServerInvite(friendKey, serverTopicHex);
    }
    
    setSentInvites(prev => new Set(prev).add(friendKey));
  };

  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/70" onClick={onClose}>
      <div className="bg-surface rounded-lg shadow-xl w-full max-w-md flex flex-col border border-panel" onClick={e => e.stopPropagation()}>
        
        <div className="p-4 border-b border-panel flex flex-col gap-3">
          <div className="flex justify-between items-center">
            <h2 className="text-lg font-bold text-text">{isGroupChat ? 'Add contacts to Group Whisper' : 'Invite contacts'}</h2>
            <button onClick={onClose} className="text-muted hover:text-text transition-colors">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
            </button>
          </div>
          <div className="relative">
            <input 
              type="text" 
              placeholder="Search for contacts" 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-panel text-text rounded p-2 pl-8 outline-none focus:ring-1 focus:ring-accent text-sm"
              autoFocus
            />
            <svg className="absolute left-2.5 top-2.5 text-muted" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
          </div>
        </div>

        <div className="p-4 pt-2">
          <div className="max-h-64 overflow-y-auto space-y-2 pr-2 hide-scrollbar">
            {friends.length === 0 ? (
              <div className="text-center text-muted py-4 text-sm">
                {searchQuery ? "No contacts found matching that name." : "You don't have any contacts to invite yet. Add some from the Whispers tab!"}
              </div>
            ) : (
              friends.map(([friendKey, data]) => {
                const isSent = sentInvites.has(friendKey);
                const isMember = membersSet.has(friendKey);
                
                return (
                  <div key={friendKey} className="flex items-center justify-between group hover:bg-panel p-2 rounded transition-colors">
                    <div className="flex items-center gap-3">
                      <div className={`w-8 h-8 rounded-md flex items-center justify-center text-white text-xs font-bold overflow-hidden ${data.profile?.avatar ? 'bg-transparent' : 'bg-indigo-500'}`}>
                        {data.profile?.avatar ? <img src={data.profile?.avatar} className="w-full h-full object-cover" /> : data.profile?.displayName?.substring(0, 2).toUpperCase()}
                      </div>
                      <span className="text-text font-medium">{data.profile?.displayName}</span>
                    </div>
                    
                    <button 
                      onClick={() => handleInvite(friendKey)}
                      disabled={isSent || isMember}
                      className={`px-4 py-1.5 rounded text-sm font-medium transition-colors ${
                        isMember ? 'bg-transparent border border-surface text-muted cursor-not-allowed' :
                        isSent ? 'bg-transparent border border-green-500 text-green-500 cursor-not-allowed' : 'bg-accent hover:opacity-90 text-white'
                      }`}
                    >
                      {isMember ? 'Added' : isSent ? 'Sent' : (isGroupChat ? 'Add' : 'Invite')}
                    </button>
                  </div>
                );
              })
            )}
          </div>
        </div>

      </div>
    </div>
  );
}