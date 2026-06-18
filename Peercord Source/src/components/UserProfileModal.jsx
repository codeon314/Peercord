import React from 'react';

export default function UserProfileModal({ user, onClose, onSendDM }) {
  if (!user) return null;

  return (
    <div className="absolute inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-surface rounded-xl shadow-2xl w-full max-w-sm flex flex-col overflow-hidden border border-panel" onClick={e => e.stopPropagation()}>
        
        {/* Banner */}
        <div className="h-24 bg-panel w-full relative border-b border-surface">
          <button onClick={onClose} className="absolute top-3 right-3 w-8 h-8 bg-black/50 hover:bg-black/70 text-white rounded-full flex items-center justify-center transition-colors">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
          </button>
        </div>

        {/* Profile Info */}
        <div className="px-6 pb-6 relative">
          <div className={`absolute -top-12 left-6 w-24 h-24 rounded-xl border-4 border-surface flex items-center justify-center text-white text-4xl font-bold overflow-hidden shadow-lg ${user.avatar ? 'bg-surface' : 'bg-indigo-500'}`}>
            {user.avatar ? (
              <img src={user.avatar} alt="avatar" className="w-full h-full object-cover" />
            ) : (
              user.displayName?.substring(0, 2).toUpperCase() || '?'
            )}
          </div>

          <div className="mt-14 flex flex-col">
            <h2 className="text-2xl font-bold text-text leading-tight">{user.displayName}</h2>
            <span className="text-sm text-muted font-mono">@{user.username}</span>
          </div>

          <div className="w-full h-[1px] bg-panel my-4"></div>

          <div className="flex flex-col gap-4">
            <div>
              <h3 className="text-xs font-bold text-muted uppercase mb-1">About Me</h3>
              <p className="text-sm text-text whitespace-pre-wrap break-words leading-relaxed">
                {user.bio || <span className="italic text-muted/50">This user hasn't written a bio yet.</span>}
              </p>
            </div>

            {user.connections && user.connections.length > 0 && (
              <div>
                <h3 className="text-xs font-bold text-muted uppercase mb-2">Connections</h3>
                <div className="flex flex-wrap gap-2">
                  {user.connections.map((conn, i) => (
                    <div key={i} className="bg-panel px-3 py-1.5 rounded flex items-center gap-2 border border-surface">
                      <span className="text-xs font-bold text-text">{conn.platform}:</span>
                      <span className="text-xs text-muted">{conn.username}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {onSendDM && (
            <button 
              onClick={() => { onSendDM(user); onClose(); }}
              className="w-full mt-6 bg-accent hover:opacity-90 text-white font-bold py-2.5 rounded transition-opacity flex items-center justify-center gap-2"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>
              Send Message
            </button>
          )}
        </div>

      </div>
    </div>
  );
}