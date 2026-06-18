import React, { useState } from 'react';
import { network } from '../p2p/index.js';

export default function ServerInviteCard({ invite, joinedServers }) {
  const { serverName, serverIcon, serverTopicHex, inviterName, serverOwner, allowAnyoneToInvite, isGroupChat, channels } = invite;
  const[isJoined, setIsJoined] = useState(joinedServers.some(s => s.topicHex === serverTopicHex));

  const handleJoin = () => {
    if (isJoined) return;
    network.joinServer(serverTopicHex, serverName, serverIcon, serverOwner, allowAnyoneToInvite, isGroupChat, channels); 
    setIsJoined(true);
  };

  return (
    <div className="bg-surface rounded-lg p-4 max-w-sm w-full my-2 shadow-lg border border-panel">
      <div className="text-xs font-bold text-muted uppercase mb-2">
        You've been invited to join a {isGroupChat ? 'Group Whisper' : 'Hub'}
      </div>
      <div className="flex items-center gap-4">
        <div className={`w-12 h-12 rounded-md flex items-center justify-center text-white text-lg font-bold shrink-0 overflow-hidden ${serverIcon ? 'bg-transparent' : 'bg-indigo-500'}`}>
          {serverIcon ? (
            <img src={serverIcon} alt="icon" className="w-full h-full object-cover" />
          ) : (
            serverName.substring(0, 2).toUpperCase()
          )}
        </div>
        <div className="flex-1 flex flex-col overflow-hidden">
          <span className="font-bold text-text truncate">{serverName}</span>
          <span className="text-xs text-muted truncate">Invited by {inviterName}</span>
        </div>
        <button 
          onClick={handleJoin}
          disabled={isJoined}
          className={`px-4 py-2 rounded text-sm font-medium transition-colors shrink-0 ${isJoined ? 'bg-green-600 text-white cursor-not-allowed' : 'bg-accent hover:opacity-90 text-white'}`}
        >
          {isJoined ? 'Joined' : 'Join'}
        </button>
      </div>
    </div>
  );
}