import React, { useEffect, useRef, useState } from 'react';

export default function ConsoleOverlay({ logs, onClose }) {
  const endRef = useRef(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  const handleCopy = () => {
    const text = logs.map(l => `[${l.time}] ${l.msg}`).join('\n');
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="absolute inset-0 z-[9999] bg-black/90 flex flex-col font-mono text-xs text-gray-300 backdrop-blur-sm">
      <div className="flex justify-between items-center bg-gray-900 p-3 border-b border-gray-700 shrink-0 shadow-lg">
        <span className="font-bold text-white text-sm flex items-center gap-2">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="4 17 10 11 4 5"></polyline><line x1="12" y1="19" x2="20" y2="19"></line></svg>
          Developer Console (Press F10 to toggle)
        </span>
        <div className="flex items-center gap-3">
          <button 
            onClick={handleCopy} 
            className="text-indigo-400 hover:text-indigo-300 hover:bg-indigo-400/10 px-3 py-1 rounded font-bold transition-colors flex items-center gap-2"
          >
            {copied ? (
              <>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
                Copied!
              </>
            ) : (
              <>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
                Copy Logs
              </>
            )}
          </button>
          <button onClick={onClose} className="text-red-400 hover:text-red-300 hover:bg-red-400/10 px-3 py-1 rounded font-bold transition-colors">
            Close
          </button>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto p-4 space-y-1 custom-scrollbar">
        {logs.length === 0 && (
          <div className="text-gray-500 italic">No logs captured yet...</div>
        )}
        {logs.map((log, i) => (
          <div key={i} className={`border-b border-gray-800/50 pb-1.5 pt-0.5 ${log.type === 'error' ? 'text-red-400 bg-red-500/5 px-2 rounded' : log.type === 'warn' ? 'text-yellow-400' : log.type === 'info' ? 'text-blue-400' : 'text-gray-300'}`}>
            <span className="text-gray-500 mr-3 select-none">[{log.time}]</span>
            <span className="whitespace-pre-wrap break-words">{log.msg}</span>
          </div>
        ))}
        <div ref={endRef} />
      </div>
    </div>
  );
}