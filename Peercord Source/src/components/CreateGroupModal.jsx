import React, { useState } from 'react';

export default function CreateGroupModal({ onClose, onSave, dms }) {
  const[name, setName] = useState('');
  const [selected, setSelected] = useState(new Set());
  const[searchQuery, setSearchQuery] = useState('');

  const friends = Object.entries(dms)
    .filter(([_, data]) => data.status === 'accepted')
    .filter(([_, data]) => 
      data.profile?.displayName?.toLowerCase().includes(searchQuery.toLowerCase())
    );

  const toggleSelect = (friendKey) => {
    const next = new Set(selected);
    if (next.has(friendKey)) {
      next.delete(friendKey);
    } else {
      if (next.size < 49) next.add(friendKey); 
    }
    setSelected(next);
  };

  const handleSave = () => {
    if (selected.size === 0) return;
    let finalName = name.trim();
    if (!finalName) {
      finalName = Array.from(selected)
        .map(k => dms[k].profile?.displayName || 'Unknown')
        .slice(0, 4)
        .join(', ');
    }
    onSave(finalName, Array.from(selected));
  };

  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/70" onClick={onClose}>
      <div className="bg-surface rounded-lg shadow-xl w-full max-w-md flex flex-col border border-panel" onClick={e => e.stopPropagation()}>
        
        <div className="p-4 border-b border-panel flex flex-col gap-3">
          <div className="flex justify-between items-center">
            <h2 className="text-lg font-bold text-text">Create Group Whisper</h2>
            <button onClick={onClose} className="text-muted hover:text-text transition-colors">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
            </button>
          </div>
          
          <div>
            <label className="block text-xs font-bold text-muted uppercase mb-1">Group Name (Optional)</label>
            <input 
              type="text" 
              placeholder="e.g. The Squad" 
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full bg-panel text-text rounded p-2 outline-none focus:ring-1 focus:ring-accent text-sm mb-2"
              maxLength={32}
            />
          </div>

          <div className="relative">
            <input 
              type="text" 
              placeholder="Search for contacts" 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-panel text-text rounded p-2 pl-8 outline-none focus:ring-1 focus:ring-accent text-sm"
            />
            <svg className="absolute left-2.5 top-2.5 text-muted" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
          </div>
        </div>

        <div className="p-4 pt-2">
          <div className="max-h-64 overflow-y-auto space-y-2 pr-2 custom-scrollbar">
            {friends.length === 0 ? (
              <div className="text-center text-muted py-4 text-sm">
                {searchQuery ? "No contacts found matching that name." : "You don't have any contacts to add yet."}
              </div>
            ) : (
              friends.map(([friendKey, data]) => {
                const isSelected = selected.has(friendKey);
                
                return (
                  <div 
                    key={friendKey} 
                    onClick={() => toggleSelect(friendKey)}
                    className="flex items-center justify-between group hover:bg-panel p-2 rounded transition-colors cursor-pointer"
                  >
                    <div className="flex items-center gap-3">
                      <div className={`w-8 h-8 rounded-md flex items-center justify-center text-white text-xs font-bold overflow-hidden ${data.profile?.avatar ? 'bg-transparent' : 'bg-indigo-500'}`}>
                        {data.profile?.avatar ? <img src={data.profile?.avatar} className="w-full h-full object-cover" /> : data.profile?.displayName?.substring(0, 2).toUpperCase()}
                      </div>
                      <span className="text-text font-medium">{data.profile?.displayName}</span>
                    </div>
                    
                    <div className={`w-5 h-5 rounded border flex items-center justify-center transition-colors ${isSelected ? 'bg-accent border-accent' : 'border-muted group-hover:border-text'}`}>
                      {isSelected && <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        <div className="p-4 bg-base rounded-b-lg flex justify-between items-center border-t border-panel">
          <span className="text-xs text-muted font-medium">{selected.size}/49 Selected</span>
          <button 
            onClick={handleSave}
            disabled={selected.size === 0}
            className="bg-accent hover:opacity-90 text-white px-6 py-2 rounded text-sm font-medium transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Create Group Whisper
          </button>
        </div>

      </div>
    </div>
  );
}