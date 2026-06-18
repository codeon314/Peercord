import React, { useEffect } from 'react';

export default function IncomingCallModal({ incomingCall, onAccept, onDecline }) {
  
  useEffect(() => {
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    let interval;
    
    const beep = (freq, startTime, duration) => {
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, startTime);
      
      gain.gain.setValueAtTime(0, startTime);
      gain.gain.linearRampToValueAtTime(0.1, startTime + 0.05);
      gain.gain.linearRampToValueAtTime(0, startTime + duration);
      
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start(startTime);
      osc.stop(startTime + duration);
    };

    const playRing = () => {
      if (audioCtx.state === 'suspended') audioCtx.resume();
      const now = audioCtx.currentTime;
      beep(440, now, 0.4); 
      beep(523.25, now + 0.2, 0.4); 
    };

    playRing();
    interval = setInterval(playRing, 2000);

    return () => {
      clearInterval(interval);
      audioCtx.close().catch(() => {});
    };
  },[]);

  const isGroup = incomingCall.isGroup;
  const isVideo = incomingCall.callType === 'video';
  const title = isGroup ? incomingCall.gcName : incomingCall.profile.displayName;
  const subtitle = isGroup ? `Group Whisper started by ${incomingCall.callerName}` : (isVideo ? 'INCOMING VIDEO CALL' : 'INCOMING VOICE CALL');
  const avatar = isGroup ? null : incomingCall.profile.avatar;
  const fallback = isGroup ? '👥' : (incomingCall.profile.displayName?.substring(0, 2).toUpperCase() || '?');

  return (
    <div className="absolute inset-0 z-50 bg-black/60 flex items-center justify-center backdrop-blur-sm">
      <div className="bg-surface p-8 rounded-2xl shadow-2xl flex flex-col items-center gap-6 border border-panel">
        
        <div className="flex flex-col items-center gap-2">
          <div className={`w-24 h-24 rounded-md flex items-center justify-center text-white text-3xl font-bold overflow-hidden shadow-lg ${avatar ? 'bg-transparent' : 'bg-indigo-500'}`}>
            {avatar ? (
              <img src={avatar} alt="avatar" className="w-full h-full object-cover" />
            ) : (
              fallback
            )}
          </div>
          <h2 className="text-2xl font-bold text-text mt-2">{title}</h2>
          
          <div className="text-muted text-sm uppercase tracking-widest font-bold flex items-center gap-1">
            {subtitle}
            <span className="flex gap-0.5 items-center mt-1">
              <span className="w-1 h-1 bg-muted rounded-full typing-dot" style={{ animationDelay: '0s' }}></span>
              <span className="w-1 h-1 bg-muted rounded-full typing-dot" style={{ animationDelay: '0.15s' }}></span>
              <span className="w-1 h-1 bg-muted rounded-full typing-dot" style={{ animationDelay: '0.3s' }}></span>
            </span>
          </div>
        </div>

        <div className="flex gap-6 mt-4 w-full">
          <button 
            onClick={onDecline}
            className="flex-1 bg-red-500 hover:bg-red-600 text-white font-bold py-3 px-6 rounded-lg transition-colors flex items-center justify-center gap-2"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10.68 13.31a16 16 0 0 0 3.41 2.6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7 2 2 0 0 1 1.72 2v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.42 19.42 0 0 1-3.33-2.67m-2.67-3.34a19.79 19.79 0 0 1-3.07-8.63A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91"></path><line x1="23" y1="1" x2="1" y2="23"></line></svg>
            Decline
          </button>
          <button 
            onClick={onAccept}
            className="flex-1 bg-green-500 hover:bg-green-600 text-white font-bold py-3 px-6 rounded-lg transition-colors flex items-center justify-center gap-2"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path></svg>
            Answer
          </button>
        </div>

      </div>
    </div>
  );
}