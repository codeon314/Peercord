import React, { useState, useRef } from 'react';

export default function CreateServerModal({ onClose, onSave }) {
  const [serverName, setServerName] = useState('');
  const [serverIcon, setServerIcon] = useState(null);
  const[allowAnyone, setAllowAnyone] = useState(true);
  const fileInputRef = useRef(null);

  const handleImageUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const MAX_SIZE = 128;
        let width = img.width;
        let height = img.height;
        
        if (width > height) {
          if (width > MAX_SIZE) { height *= MAX_SIZE / width; width = MAX_SIZE; }
        } else {
          if (height > MAX_SIZE) { width *= MAX_SIZE / height; height = MAX_SIZE; }
        }
        
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);
        
        const dataUrl = canvas.toDataURL(file.type === 'image/png' ? 'image/png' : 'image/jpeg', 0.8);
        setServerIcon(dataUrl);
      };
      img.src = event.target.result;
    };
    reader.readAsDataURL(file);
  };

  const handleCreate = () => {
    if (serverName.trim() === '') return;
    onSave(serverName.trim(), serverIcon, allowAnyone);
  };

  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/70" onClick={onClose}>
      <div className="bg-surface rounded-lg shadow-xl w-full max-w-md flex flex-col p-6 gap-4 border border-panel" onClick={e => e.stopPropagation()}>
        <h2 className="text-2xl font-bold text-center text-text">Create Your Hub</h2>
        <p className="text-sm text-center text-muted">
          Give your new hub a personality with a name and an icon.
        </p>
        
        <div className="flex flex-col items-center gap-4 mt-4">
          <div 
            className={`w-24 h-24 rounded-md flex items-center justify-center text-white text-3xl font-bold cursor-pointer relative group overflow-hidden shrink-0 border-2 border-dashed border-muted hover:border-text ${serverIcon ? 'bg-transparent border-solid' : 'bg-panel'}`}
            onClick={() => fileInputRef.current?.click()}
          >
            {serverIcon ? (
              <img src={serverIcon} alt="hub icon" className="w-full h-full object-cover" />
            ) : (
              <div className="text-center text-xs text-muted flex flex-col items-center gap-1">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm5 11h-4v4h-2v-4H7v-2h4V7h2v4h4v2z"/></svg>
                Upload
              </div>
            )}
            <input type="file" ref={fileInputRef} onChange={handleImageUpload} accept="image/png, image/jpeg" className="hidden" />
          </div>

          <div className="w-full">
            <label className="block text-xs font-bold text-muted uppercase mb-2 text-left">Hub Name</label>
            <input 
              type="text" 
              value={serverName}
              onChange={(e) => setServerName(e.target.value)}
              className="w-full bg-panel text-text rounded p-3 outline-none focus:ring-2 focus:ring-accent mb-4"
              placeholder="e.g. My Cool Club"
              maxLength={32}
              autoFocus
            />

            <label className="block text-xs font-bold text-muted uppercase mb-2 text-left">Invite Permissions</label>
            <div className="flex items-center gap-3 bg-panel p-3 rounded">
              <input 
                type="checkbox" 
                checked={allowAnyone} 
                onChange={(e) => setAllowAnyone(e.target.checked)}
                className="w-5 h-5 accent-accent cursor-pointer"
              />
              <span className="text-sm text-text">Anyone can invite people to this hub</span>
            </div>
            <p className="text-[10px] text-muted mt-1">If unchecked, only you (the Admin) can send invites.</p>
          </div>
        </div>
        
        <div className="bg-base flex justify-between items-center p-4 rounded-b-lg -m-6 mt-6 border-t border-panel">
          <button onClick={onClose} className="text-text hover:underline text-sm font-medium px-4 py-2">
            Back
          </button>
          <button onClick={handleCreate} disabled={!serverName.trim()} className="bg-accent hover:opacity-90 text-white px-6 py-2.5 rounded text-sm font-medium transition-opacity disabled:opacity-50 disabled:cursor-not-allowed">
            Create
          </button>
        </div>
      </div>
    </div>
  );
}