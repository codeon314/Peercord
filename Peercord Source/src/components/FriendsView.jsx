import React, { useState } from 'react';
import { network } from '../p2p/index.js';

export default function FriendsView({ dms, onNavigateToDM }) {
  const [activeTab, setActiveTab] = useState('all');
  const [searchUsername, setSearchUsername] = useState('');
  const [searchStatus, setSearchStatus] = useState(''); 

  const allFriends = Object.entries(dms).filter(([_, data]) => data.status === 'accepted');
  const pendingIncoming = Object.entries(dms).filter(([_, data]) => data.status === 'pending_incoming');
  const pendingOutgoing = Object.entries(dms).filter(([_, data]) => data.status === 'pending_outgoing');
  const blockedUsers = Object.entries(dms).filter(([_, data]) => data.status === 'blocked');

  const handleAddFriend = async (e) => {
    e.preventDefault();
    const target = searchUsername.trim().toLowerCase();
    if (!target) return;
    if (target === network.username) {
      setSearchStatus('error');
      return;
    }

    setSearchStatus('searching');
    
    const result = await network.searchUser(target);
    
    if (result) {
      await network.sendDMRequest(result.pubKey, result.profile);
      setSearchStatus('found');
      setSearchUsername('');
    } else {
      await network.queueFriendRequest(target);
      setSearchStatus('queued');
      setSearchUsername('');
    }
  };

  const handleRemove = (pubKey) => {
    if (window.confirm("Are you sure you want to remove this contact?")) {
      network.removeFriend(pubKey);
    }
  };

  const handleBlock = (pubKey) => {
    if (window.confirm("Are you sure you want to block this user?")) {
      network.blockUser(pubKey);
    }
  };

  const handleUnblock = (pubKey) => {
    network.removeFriend(pubKey); // Removing from block list resets them
  };

  return (
    <div className="flex-1 flex flex-col bg-base min-w-0">
      <div className="h-14 shadow-sm flex items-center px-4 border-b border-surface gap-6 shrink-0 bg-panel z-10">
        <div className="flex items-center gap-2 text-text font-bold">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor" className="text-muted"><path d="M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zm0 2a9.985 9.985 0 0 0-8 4 9.985 9.985 0 0 0 8 4 9.985 9.985 0 0 0 8-4 9.985 9.985 0 0 0-8-4z"/></svg>
          Contacts
        </div>
        <div className="w-[1px] h-6 bg-surface"></div>
        <div className="flex gap-4">
          <button 
            onClick={() => setActiveTab('all')}
            className={`px-3 py-1 rounded font-medium text-sm transition-colors ${activeTab === 'all' ? 'bg-surface text-text' : 'text-muted hover:bg-surface/50 hover:text-text'}`}
          >
            All
          </button>
          <button 
            onClick={() => setActiveTab('pending')}
            className={`px-3 py-1 rounded font-medium text-sm transition-colors ${activeTab === 'pending' ? 'bg-surface text-text' : 'text-muted hover:bg-surface/50 hover:text-text'}`}
          >
            Pending {(pendingIncoming.length + pendingOutgoing.length) > 0 && <span className="bg-red-500 text-white text-xs px-1.5 rounded-full ml-1">{pendingIncoming.length + pendingOutgoing.length}</span>}
          </button>
          <button 
            onClick={() => setActiveTab('blocked')}
            className={`px-3 py-1 rounded font-medium text-sm transition-colors ${activeTab === 'blocked' ? 'bg-surface text-text' : 'text-muted hover:bg-surface/50 hover:text-text'}`}
          >
            Blocked
          </button>
          <button 
            onClick={() => setActiveTab('add')}
            className={`px-3 py-1 rounded font-medium text-sm transition-colors ${activeTab === 'add' ? 'bg-accent text-white' : 'bg-accent/20 text-accent hover:bg-accent/30'}`}
          >
            Add Contact
          </button>
        </div>
      </div>

      <div className="flex-1 p-6 overflow-y-auto custom-scrollbar">
        
        {activeTab === 'all' && (
          <div>
            <h2 className="text-xs font-bold text-muted uppercase mb-4">All Contacts — {allFriends.length}</h2>
            <div className="space-y-2">
              {allFriends.map(([pubKey, data]) => (
                <div key={pubKey} className="flex items-center justify-between p-3 hover:bg-panel rounded-lg border-t border-surface group transition-colors">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-md bg-indigo-500 flex items-center justify-center text-white font-bold overflow-hidden">
                      {data.profile?.avatar ? <img src={data.profile.avatar} className="w-full h-full object-cover"/> : data.profile?.displayName?.substring(0, 2).toUpperCase()}
                    </div>
                    <div className="flex flex-col">
                      <span className="text-text font-bold">{data.profile?.displayName}</span>
                      <span className="text-xs text-muted">@{data.profile?.username}</span>
                    </div>
                  </div>
                  <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button onClick={() => {
                      network.openDM(pubKey, data.profile);
                      onNavigateToDM(pubKey);
                    }} className="w-9 h-9 rounded-full bg-surface flex items-center justify-center text-text hover:bg-accent hover:text-white transition-colors border border-panel" title="Message">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>
                    </button>
                    <button onClick={() => handleRemove(pubKey)} className="w-9 h-9 rounded-full bg-surface flex items-center justify-center text-red-500 hover:bg-red-500 hover:text-white transition-colors border border-panel" title="Remove">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                    </button>
                    <button onClick={() => handleBlock(pubKey)} className="w-9 h-9 rounded-full bg-surface flex items-center justify-center text-red-500 hover:bg-red-500 hover:text-white transition-colors border border-panel" title="Block">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"></line></svg>
                    </button>
                  </div>
                </div>
              ))}
              {allFriends.length === 0 && (
                <div className="text-center text-muted mt-10">You don't have any contacts yet.</div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'pending' && (
          <div>
            {pendingIncoming.length > 0 && (
              <div className="mb-6">
                <h2 className="text-xs font-bold text-muted uppercase mb-4">Incoming Requests — {pendingIncoming.length}</h2>
                <div className="space-y-2">
                  {pendingIncoming.map(([pubKey, data]) => (
                    <div key={pubKey} className="flex items-center justify-between p-3 hover:bg-panel rounded-lg border-t border-surface group transition-colors">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-md bg-indigo-500 flex items-center justify-center text-white font-bold overflow-hidden">
                          {data.profile?.avatar ? <img src={data.profile.avatar} className="w-full h-full object-cover"/> : data.profile?.displayName?.substring(0, 2).toUpperCase()}
                        </div>
                        <div className="flex flex-col">
                          <span className="text-text font-bold">{data.profile?.displayName}</span>
                          <span className="text-xs text-muted">@{data.profile?.username}</span>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <button onClick={() => network.acceptDMRequest(pubKey)} className="w-9 h-9 rounded-full bg-surface flex items-center justify-center text-green-500 hover:bg-green-500 hover:text-white transition-colors border border-panel" title="Accept">
                          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
                        </button>
                        <button onClick={() => handleRemove(pubKey)} className="w-9 h-9 rounded-full bg-surface flex items-center justify-center text-red-500 hover:bg-red-500 hover:text-white transition-colors border border-panel" title="Decline">
                          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {pendingOutgoing.length > 0 && (
              <div>
                <h2 className="text-xs font-bold text-muted uppercase mb-4">Outgoing Requests — {pendingOutgoing.length}</h2>
                <div className="space-y-2">
                  {pendingOutgoing.map(([pubKey, data]) => (
                    <div key={pubKey} className="flex items-center justify-between p-3 hover:bg-panel rounded-lg border-t border-surface group transition-colors">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-md bg-surface flex items-center justify-center text-muted font-bold overflow-hidden border border-panel">
                          {data.profile?.avatar ? <img src={data.profile.avatar} className="w-full h-full object-cover"/> : data.profile?.displayName?.substring(0, 2).toUpperCase()}
                        </div>
                        <div className="flex flex-col">
                          <span className="text-text font-bold">{data.profile?.displayName}</span>
                          <span className="text-xs text-muted">@{data.profile?.username}</span>
                        </div>
                      </div>
                      <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button onClick={() => handleRemove(pubKey)} className="w-9 h-9 rounded-full bg-surface flex items-center justify-center text-red-500 hover:bg-red-500 hover:text-white transition-colors border border-panel" title="Cancel Request">
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {pendingIncoming.length === 0 && pendingOutgoing.length === 0 && (
              <div className="text-center text-muted mt-10">No pending requests.</div>
            )}
          </div>
        )}

        {activeTab === 'blocked' && (
          <div>
            <h2 className="text-xs font-bold text-muted uppercase mb-4">Blocked Users — {blockedUsers.length}</h2>
            <div className="space-y-2">
              {blockedUsers.map(([pubKey, data]) => (
                <div key={pubKey} className="flex items-center justify-between p-3 hover:bg-panel rounded-lg border-t border-surface group transition-colors">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-md bg-surface flex items-center justify-center text-muted font-bold overflow-hidden border border-panel">
                      {data.profile?.avatar ? <img src={data.profile.avatar} className="w-full h-full object-cover"/> : data.profile?.displayName?.substring(0, 2).toUpperCase()}
                    </div>
                    <div className="flex flex-col">
                      <span className="text-text font-bold">{data.profile?.displayName}</span>
                      <span className="text-xs text-muted">@{data.profile?.username}</span>
                    </div>
                  </div>
                  <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button onClick={() => handleUnblock(pubKey)} className="px-4 py-1.5 rounded bg-surface text-text hover:bg-panel transition-colors border border-panel text-sm font-medium">
                      Unblock
                    </button>
                  </div>
                </div>
              ))}
              {blockedUsers.length === 0 && (
                <div className="text-center text-muted mt-10">You haven't blocked anyone.</div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'add' && (
          <div className="max-w-2xl">
            <h2 className="text-text font-bold mb-2">ADD CONTACT</h2>
            <p className="text-sm text-muted mb-4">You can add a contact with their username. It's case sensitive!</p>
            
            <form onSubmit={handleAddFriend} className="relative flex items-center">
              <input 
                type="text" 
                value={searchUsername}
                onChange={(e) => setSearchUsername(e.target.value)}
                placeholder="You can add a contact with their username."
                className="w-full bg-panel text-text rounded-lg p-4 pr-40 outline-none focus:ring-1 focus:ring-accent border border-surface"
              />
              <button 
                type="submit"
                disabled={!searchUsername.trim() || searchStatus === 'searching'}
                className="absolute right-2 bg-accent hover:opacity-90 text-white px-4 py-2 rounded text-sm font-medium transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Send Request
              </button>
            </form>

            {searchStatus === 'searching' && <p className="text-accent text-sm mt-2">Searching network...</p>}
            {searchStatus === 'found' && <p className="text-green-500 text-sm mt-2">Success! Your contact request was sent.</p>}
            {searchStatus === 'queued' && <p className="text-yellow-500 text-sm mt-2">User is currently offline. We queued your request and will send it automatically when they come online!</p>}
            {searchStatus === 'error' && <p className="text-red-500 text-sm mt-2">You cannot send a contact request to yourself.</p>}
          </div>
        )}
      </div>
    </div>
  );
}