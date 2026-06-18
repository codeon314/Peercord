import React, { useState } from 'react';

export default function CreateChannelModal({ onClose, onSave, defaultType = 'text' }) {
  const [name, setName] = useState('');
  const [type, setType] = useState(defaultType);

  const handleSave = () => {
    const cleanName = name.trim().toLowerCase().replace(/[^a-z0-9-]/g, '-');
    if (cleanName) onSave(cleanName, type);
  };

  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/70" onClick={onClose}>
      <div className="bg-surface rounded-lg shadow-xl w-full max-w-sm flex flex-col border border-panel" onClick={e => e.stopPropagation()}>
        <div className="p-4 border-b border-panel flex justify-between items-center">
          <h2 className="text-lg font-bold text-text">Create Channel</h2>
          <button onClick={onClose} className="text-muted hover:text-text transition-colors">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
          </button>
        </div>
        <div className="p-4 flex flex-col gap-4">
          <div>
            <label className="block text-xs font-bold text-muted uppercase mb-2">Channel Type</label>
            <div className="flex gap-2">
              <button 
                onClick={() => setType('text')}
                className={`flex-1 py-2 rounded text-sm font-bold transition-colors ${type === 'text' ? 'bg-accent text-white' : 'bg-panel text-muted hover:text-text'}`}
              >
                Text
              </button>
              <button 
                onClick={() => setType('voice')}
                className={`flex-1 py-2 rounded text-sm font-bold transition-colors ${type === 'voice' ? 'bg-accent text-white' : 'bg-panel text-muted hover:text-text'}`}
              >
                Voice
              </button>
            </div>
          </div>
          <div>
            <label className="block text-xs font-bold text-muted uppercase mb-2">Channel Name</label>
            <div className="relative">
              <span className="absolute left-3 top-2.5 text-muted font-bold">{type === 'text' ? '#' : '🔊'}</span>
              <input 
                type="text" 
                value={name}
                onChange={(e) => setName(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-'))}
                placeholder="new-channel"
                className="w-full bg-panel text-text rounded p-2.5 pl-8 outline-none focus:ring-1 focus:ring-accent text-sm"
                autoFocus
              />
            </div>
          </div>
        </div>
        <div className="p-4 bg-base rounded-b-lg flex justify-end gap-3 border-t border-panel">
          <button onClick={onClose} className="text-text hover:underline text-sm font-medium px-4 py-2">Cancel</button>
          <button onClick={handleSave} disabled={!name.trim()} className="bg-accent hover:opacity-90 text-white px-6 py-2 rounded text-sm font-medium transition-opacity disabled:opacity-50">Create Channel</button>
        </div>
      </div>
    </div>
  );
}