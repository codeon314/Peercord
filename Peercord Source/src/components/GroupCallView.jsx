import React, { useEffect, useRef, useState } from 'react';
import { network } from '../p2p/index.js';
import ScreenShareModal from './ScreenShareModal.jsx';

const playSound = (type) => {
  try {
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const now = audioCtx.currentTime;
    
    const beep = (freq, startTime, duration, vol = 0.1, oscType = 'sine') => {
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = oscType;
      osc.frequency.setValueAtTime(freq, startTime);
      gain.gain.setValueAtTime(0, startTime);
      gain.gain.linearRampToValueAtTime(vol, startTime + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start(startTime);
      osc.stop(startTime + duration);
    };

    switch (type) {
      case 'join':
        beep(440, now, 0.15);
        beep(554.37, now + 0.15, 0.15);
        beep(659.25, now + 0.3, 0.3);
        break;
      case 'leave':
        beep(659.25, now, 0.15);
        beep(554.37, now + 0.15, 0.15);
        beep(440, now + 0.3, 0.3);
        break;
      case 'mute':
      case 'deafen':
        beep(440, now, 0.1, 0.05, 'triangle');
        beep(349.23, now + 0.1, 0.1, 0.05, 'triangle');
        break;
      case 'unmute':
      case 'undeafen':
        beep(349.23, now, 0.1, 0.05, 'triangle');
        beep(440, now + 0.1, 0.1, 0.05, 'triangle');
        break;
      case 'start_video':
      case 'start_screen':
        beep(523.25, now, 0.1, 0.05, 'square');
        beep(659.25, now + 0.1, 0.2, 0.05, 'square');
        break;
      case 'stop_video':
      case 'stop_screen':
        beep(659.25, now, 0.1, 0.05, 'square');
        beep(523.25, now + 0.1, 0.2, 0.05, 'square');
        break;
    }
    setTimeout(() => audioCtx.close(), 1000);
  } catch (e) {}
};

const VideoPlayer = ({ stream, muted, deafened, isAudioOnly }) => {
  const ref = useRef();
  useEffect(() => {
    if (ref.current && stream) {
      ref.current.srcObject = stream;
      const outputId = localStorage.getItem('pear_audio_output');
      if (outputId && outputId !== 'default' && ref.current.setSinkId) {
        ref.current.setSinkId(outputId).catch(console.error);
      }
    }
  }, [stream]);
  
  if (isAudioOnly) {
    return <audio ref={ref} autoPlay muted={muted || deafened} className="hidden" />;
  }
  return <video ref={ref} autoPlay playsInline muted={muted || deafened} className="w-full h-full object-cover" />;
};

export default function GroupCallView({ channel, serverTopicHex, vcChannelId, myKey, myProfile, knownUsers, onClose, onToggleChat, onLocalStateChange, className, initialVideoOn }) {
  const [isMuted, setIsMuted] = useState(false);
  const [isDeafened, setIsDeafened] = useState(false);
  const [isVideoOn, setIsVideoOn] = useState(initialVideoOn || false);
  const [localVoiceActive, setLocalVoiceActive] = useState(false);
  const [showScreenShareModal, setShowScreenShareModal] = useState(false);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [expandedStreamId, setExpandedStreamId] = useState(null);
  
  // { [peerKey]: { streams: MediaStream[], voiceActive: boolean } }
  const [peers, setPeers] = useState({}); 

  const pcs = useRef({});
  const pendingCandidates = useRef({});
  const makingOffer = useRef({});
  const ignoreOffer = useRef({});
  
  const localStreamRef = useRef(null);
  const localClonedAudioStreamRef = useRef(null);
  const localScreenStreamRef = useRef(null);
  const localCameraStreamRef = useRef(null);
  const audioCtxRef = useRef(null);
  const animationFrameRef = useRef(null);

  useEffect(() => {
    playSound('join');
    return () => playSound('leave');
  }, []);

  // Broadcast VC state to the server swarm if this is a server VC
  useEffect(() => {
    if (!serverTopicHex || !vcChannelId) return;
    
    const broadcastState = () => {
      network.sendEphemeral({
        type: 'vc-state',
        serverTopicHex,
        channel: vcChannelId,
        muted: isMuted,
        deafened: isDeafened,
        screenshare: isScreenSharing
      });
      if (onLocalStateChange) onLocalStateChange(isMuted, isDeafened, isScreenSharing);
    };
    
    broadcastState(); // Initial broadcast
    const interval = setInterval(broadcastState, 4000); // Broadcast every 4 seconds
    
    return () => clearInterval(interval);
  }, [serverTopicHex, vcChannelId, isMuted, isDeafened, isScreenSharing]);

  // Send leave ONLY on unmount or channel change
  useEffect(() => {
    if (!serverTopicHex || !vcChannelId) return;
    return () => {
      network.sendEphemeral({
        type: 'vc-leave',
        serverTopicHex,
        channel: vcChannelId
      });
    };
  }, [serverTopicHex, vcChannelId]);

  const sendSignal = (targetKey, signal) => {
    network.sendWebRTCSignal(targetKey, { type: 'webrtc-group-signal', channel, target: targetKey, signal });
  };

  const createPC = (peerKey) => {
    const pc = new RTCPeerConnection({ iceServers:[{ urls: 'stun:stun.l.google.com:19302' }] });
    makingOffer.current[peerKey] = false;
    ignoreOffer.current[peerKey] = false;
    
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(t => pc.addTrack(t, localStreamRef.current));
    }
    if (localScreenStreamRef.current) {
      localScreenStreamRef.current.getTracks().forEach(t => pc.addTrack(t, localScreenStreamRef.current));
    }
    if (localCameraStreamRef.current) {
      localCameraStreamRef.current.getTracks().forEach(t => pc.addTrack(t, localCameraStreamRef.current));
    }

    pc.onicecandidate = (e) => {
      if (e.candidate) sendSignal(peerKey, { type: 'ice', candidate: e.candidate });
    };

    pc.ontrack = (e) => {
      setPeers(prev => {
        const existing = prev[peerKey] || { streams:[], voiceActive: false };
        const streamExists = existing.streams.find(s => s.id === e.streams[0].id);
        if (!streamExists) {
          return { ...prev, [peerKey]: { ...existing, streams:[...existing.streams, e.streams[0]] } };
        }
        return prev;
      });
    };

    // Perfect Negotiation: Anyone can create an offer when needed
    pc.onnegotiationneeded = async () => {
      try {
        makingOffer.current[peerKey] = true;
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        sendSignal(peerKey, { type: 'offer', sdp: pc.localDescription });
      } catch (err) {
        console.error("Failed to create offer:", err);
      } finally {
        makingOffer.current[peerKey] = false;
      }
    };

    pcs.current[peerKey] = pc;
    return pc;
  };

  useEffect(() => {
    const setupMedia = async () => {
      try {
        const audioInputId = localStorage.getItem('pear_audio_input');
        const noiseSuppression = localStorage.getItem('pear_noise_suppression') !== 'false';
        
        const audioConstraints = {
          noiseSuppression: noiseSuppression,
          echoCancellation: true,
          autoGainControl: true
        };
        
        if (audioInputId && audioInputId !== 'default') {
          audioConstraints.deviceId = { exact: audioInputId };
        }

        let aStream;
        try {
          aStream = await navigator.mediaDevices.getUserMedia({ audio: audioConstraints });
        } catch (err) {
          console.warn("Failed to get audio with specific constraints, falling back to default.", err);
          aStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        }
        
        localStreamRef.current = aStream;

        if (initialVideoOn) {
          try {
            const videoInputId = localStorage.getItem('pear_video_input');
            const vStream = await navigator.mediaDevices.getUserMedia({
              video: videoInputId && videoInputId !== 'default' ? { deviceId: { exact: videoInputId } } : true
            });
            localCameraStreamRef.current = vStream;
          } catch (err) {
            console.error("Failed to get video", err);
            setIsVideoOn(false);
          }
        }

        const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        audioCtxRef.current = audioCtx;
        if (audioCtx.state === 'suspended') {
          await audioCtx.resume().catch(() => {});
        }
        
        // Clone the stream for the analyser to prevent Web Audio API from interfering with WebRTC's internal audio processing pipeline
        const clonedAudioStream = new MediaStream(aStream.getAudioTracks().map(t => t.clone()));
        localClonedAudioStreamRef.current = clonedAudioStream;
        
        const source = audioCtx.createMediaStreamSource(clonedAudioStream);
        const analyser = audioCtx.createAnalyser();
        analyser.fftSize = 256;
        
        // Connect to a muted gain node and then to destination. 
        // This prevents Chrome from aggressively optimizing/suspending the audio graph which causes silent mics.
        const dummyGain = audioCtx.createGain();
        dummyGain.gain.value = 0;
        
        source.connect(analyser);
        analyser.connect(dummyGain);
        dummyGain.connect(audioCtx.destination);

        const bufferLength = analyser.frequencyBinCount;
        const dataArray = new Uint8Array(bufferLength);

        let lastSpeakingState = false;
        const checkAudio = () => {
          analyser.getByteFrequencyData(dataArray);
          let sum = 0;
          for (let i = 0; i < bufferLength; i++) sum += dataArray[i];
          const average = sum / bufferLength;
          const isSpeaking = average > 15; 
          
          if (isSpeaking !== lastSpeakingState) {
            network.sendEphemeral({ type: 'webrtc-group-voice', channel, state: isSpeaking ? 'speaking' : 'silent' });
            setLocalVoiceActive(isSpeaking);
            lastSpeakingState = isSpeaking;
          }
          animationFrameRef.current = requestAnimationFrame(checkAudio);
        };
        checkAudio();

        // Broadcast join to the GC or VC mesh
        network.sendEphemeral({ type: 'webrtc-group-join', channel });

      } catch (err) {
        console.error("Failed to access microphone:", err);
        alert("Could not access microphone. Please check your permissions.");
        onClose();
      }
    };

    setupMedia();

    // Cleanup dead streams periodically
    const cleanupInterval = setInterval(() => {
      setPeers(prev => {
        let changed = false;
        const next = {};
        for (const [key, peer] of Object.entries(prev)) {
          const activeStreams = peer.streams.filter(s => s.active && s.getTracks().length > 0);
          if (activeStreams.length !== peer.streams.length) changed = true;
          next[key] = { ...peer, streams: activeStreams };
        }
        return changed ? next : prev;
      });
    }, 2000);

    return () => {
      clearInterval(cleanupInterval);
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
      if (audioCtxRef.current) audioCtxRef.current.close().catch(() => {});
      if (localStreamRef.current) localStreamRef.current.getTracks().forEach(t => t.stop());
      if (localClonedAudioStreamRef.current) localClonedAudioStreamRef.current.getTracks().forEach(t => t.stop());
      if (localScreenStreamRef.current) localScreenStreamRef.current.getTracks().forEach(t => t.stop());
      if (localCameraStreamRef.current) localCameraStreamRef.current.getTracks().forEach(t => t.stop());
      
      Object.values(pcs.current).forEach(pc => pc.close());
      pcs.current = {};
      
      network.sendEphemeral({ type: 'webrtc-group-leave', channel });
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[]);

  useEffect(() => {
    const handleSignal = async (peerKey, payload) => {
      if (payload.channel !== channel) return;

      if (payload.type === 'webrtc-group-join' && peerKey !== myKey) {
        playSound('join');
        if (!pcs.current[peerKey]) createPC(peerKey);
        // Send a ping back so the other peer knows we are here if they joined earlier
        network.sendEphemeral({ type: 'webrtc-group-hello', channel, target: peerKey });
      } 
      else if (payload.type === 'webrtc-group-hello' && payload.target === myKey) {
        if (!pcs.current[peerKey]) createPC(peerKey);
      }
      else if (payload.type === 'webrtc-group-leave') {
        playSound('leave');
        if (pcs.current[peerKey]) {
          pcs.current[peerKey].close();
          delete pcs.current[peerKey];
        }
        setPeers(prev => {
          const next = { ...prev };
          delete next[peerKey];
          return next;
        });
      }
      else if (payload.type === 'webrtc-group-action') {
        if (peerKey !== myKey) {
          playSound(payload.action);
        }
      }
      else if (payload.type === 'webrtc-group-voice') {
        setPeers(prev => {
          if (!prev[peerKey]) return prev;
          return { ...prev, [peerKey]: { ...prev[peerKey], voiceActive: payload.state === 'speaking' } };
        });
      }
      else if (payload.type === 'webrtc-group-signal' && payload.target === myKey) {
        const { signal } = payload;
        let pc = pcs.current[peerKey];
        
        if (!pc) pc = createPC(peerKey);

        if (signal.type === 'offer' || signal.type === 'answer') {
          // Perfect Negotiation Collision Resolution
          const isPolite = myKey < peerKey;
          const offerCollision = signal.type === 'offer' && (makingOffer.current[peerKey] || pc.signalingState !== 'stable');

          ignoreOffer.current[peerKey] = !isPolite && offerCollision;
          if (ignoreOffer.current[peerKey]) {
            return;
          }

          try {
            await pc.setRemoteDescription(signal.sdp);
            if (signal.type === 'offer') {
              const answer = await pc.createAnswer();
              await pc.setLocalDescription(answer);
              sendSignal(peerKey, { type: 'answer', sdp: pc.localDescription });
            }

            if (pendingCandidates.current[peerKey]) {
              for (const c of pendingCandidates.current[peerKey]) {
                await pc.addIceCandidate(c).catch(console.error);
              }
              pendingCandidates.current[peerKey] =[];
            }
          } catch (err) {
            console.error("Error setting remote description:", err);
          }
        } 
        else if (signal.type === 'ice') {
          try {
            if (pc && pc.remoteDescription) {
              await pc.addIceCandidate(signal.candidate);
            } else {
              if (!pendingCandidates.current[peerKey]) pendingCandidates.current[peerKey] =[];
              pendingCandidates.current[peerKey].push(signal.candidate);
            }
          } catch (err) {
            if (!ignoreOffer.current[peerKey]) {
              console.error("Error adding ICE candidate:", err);
            }
          }
        }
      }
    };

    network.addWebRTCListener(handleSignal);
    return () => network.removeWebRTCListener(handleSignal);
  },[channel, myKey]);

  const toggleMute = () => {
    if (isDeafened) return; // Cannot unmute while deafened
    if (localStreamRef.current) {
      const audioTrack = localStreamRef.current.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled;
        setIsMuted(!audioTrack.enabled);
        const action = !audioTrack.enabled ? 'mute' : 'unmute';
        playSound(action);
        network.sendEphemeral({ type: 'webrtc-group-action', channel, action });
      }
    }
  };

  const toggleDeafen = () => {
    const newDeafened = !isDeafened;
    setIsDeafened(newDeafened);
    const action = newDeafened ? 'deafen' : 'undeafen';
    playSound(action);
    network.sendEphemeral({ type: 'webrtc-group-action', channel, action });
    
    if (newDeafened) {
      if (!isMuted && localStreamRef.current) {
        const audioTrack = localStreamRef.current.getAudioTracks()[0];
        if (audioTrack) {
          audioTrack.enabled = false;
          setIsMuted(true);
        }
      }
    } else {
      if (localStreamRef.current) {
        const audioTrack = localStreamRef.current.getAudioTracks()[0];
        if (audioTrack) {
          audioTrack.enabled = true;
          setIsMuted(false);
        }
      }
    }
  };

  const toggleVideo = async () => {
    if (isVideoOn) {
      if (localCameraStreamRef.current) {
        const track = localCameraStreamRef.current.getVideoTracks()[0];
        Object.values(pcs.current).forEach(pc => {
          const sender = pc.getSenders().find(s => s.track === track);
          if (sender) pc.removeTrack(sender);
        });
        track.stop();
        localCameraStreamRef.current = null;
      }
      setIsVideoOn(false);
      playSound('stop_video');
      network.sendEphemeral({ type: 'webrtc-group-action', channel, action: 'stop_video' });
    } else {
      try {
        const videoInputId = localStorage.getItem('pear_video_input');
        const stream = await navigator.mediaDevices.getUserMedia({
          video: videoInputId && videoInputId !== 'default' ? { deviceId: { exact: videoInputId } } : true
        });
        localCameraStreamRef.current = stream;
        const track = stream.getVideoTracks()[0];
        Object.values(pcs.current).forEach(pc => {
          pc.addTrack(track, stream);
        });
        setIsVideoOn(true);
        playSound('start_video');
        network.sendEphemeral({ type: 'webrtc-group-action', channel, action: 'start_video' });
      } catch (err) {
        console.error("Failed to start video", err);
      }
    }
  };

  const startScreenShare = async (sourceId, res, fps, shareAudio) => {
    setShowScreenShareModal(false);
    let stream = null;
    
    try {
      if (sourceId === 'native') {
        stream = await navigator.mediaDevices.getDisplayMedia({
          video: true,
          audio: shareAudio 
        });
      } else {
        try {
          stream = await navigator.mediaDevices.getUserMedia({
            audio: shareAudio ? {
              mandatory: {
                chromeMediaSource: 'desktop',
                chromeMediaSourceId: sourceId
              }
            } : false,
            video: {
              mandatory: {
                chromeMediaSource: 'desktop',
                chromeMediaSourceId: sourceId,
                maxWidth: res.width,
                maxHeight: res.height,
                maxFrameRate: fps
              }
            }
          });
        } catch (initialErr) {
          console.warn("Optimal capture rejected. Using fallback.", initialErr);
          stream = await navigator.mediaDevices.getUserMedia({
            audio: shareAudio ? {
              mandatory: {
                chromeMediaSource: 'desktop',
                chromeMediaSourceId: sourceId
              }
            } : false,
            video: {
              mandatory: {
                chromeMediaSource: 'desktop',
                chromeMediaSourceId: sourceId
              }
            }
          });
        }
      }
      
      const videoTrack = stream.getVideoTracks()[0];
      const audioTrack = stream.getAudioTracks()[0];

      if (videoTrack) {
        videoTrack.contentHint = 'motion';
        videoTrack.onended = () => {
          stopScreenShare();
        };
      }

      localScreenStreamRef.current = stream;
      setIsScreenSharing(true); 
      playSound('start_screen');
      network.sendEphemeral({ type: 'webrtc-group-action', channel, action: 'start_screen' });

      Object.values(pcs.current).forEach(pc => {
        if (videoTrack) {
          const sender = pc.addTrack(videoTrack, stream);
          try {
            const params = sender.getParameters();
            if (!params.encodings || params.encodings.length === 0) {
              params.encodings = [{}];
            }
            params.encodings[0].maxFramerate = fps;
            let maxBitrate = 8000000; 
            if (res.height <= 720) maxBitrate = 4000000; 
            if (res.height <= 480) maxBitrate = 1500000; 
            if (res.height <= 360) maxBitrate = 800000; 
            params.encodings[0].maxBitrate = maxBitrate;
            if ('degradationPreference' in params) {
              params.degradationPreference = 'maintain-framerate'; 
            }
            sender.setParameters(params);
          } catch (paramErr) {
            console.warn("Could not set sender parameters:", paramErr);
          }
        }
        
        if (audioTrack) {
          pc.addTrack(audioTrack, stream);
        }
      });

    } catch (err) {
      console.error("Screen share failed or cancelled", err);
      
      if (stream) stream.getTracks().forEach(t => { t.enabled = false; t.stop(); });
      if (localScreenStreamRef.current) {
        localScreenStreamRef.current.getTracks().forEach(t => { t.enabled = false; t.stop(); });
        localScreenStreamRef.current = null;
      }
      
      setIsScreenSharing(false);
      
      if (err.name !== 'NotAllowedError' && err.name !== 'AbortError') {
        alert(`Could not capture this window/screen.\nError: ${err.name} - ${err.message}`);
      }
    }
  };

  const stopScreenShare = async () => {
    if (localScreenStreamRef.current) {
      localScreenStreamRef.current.getTracks().forEach(t => {
        Object.values(pcs.current).forEach(pc => {
          const senders = pc.getSenders();
          const sender = senders.find(s => s.track === t);
          if (sender) {
            try { pc.removeTrack(sender); } catch (e) {}
          }
        });
        t.enabled = false;
        t.stop();
      });
      localScreenStreamRef.current = null;
    }
    
    setIsScreenSharing(false);
    playSound('stop_screen');
    network.sendEphemeral({ type: 'webrtc-group-action', channel, action: 'stop_screen' });
    
    if (expandedStreamId === 'local-screen') {
      setExpandedStreamId(null);
    }
  };

  // Flatten all streams for the grid
  const gridItems = [];
  
  // Local User
  if (isVideoOn && localCameraStreamRef.current) {
    gridItems.push({
      id: 'local-user',
      isLocal: true,
      name: `${myProfile.displayName} (You)`,
      stream: localCameraStreamRef.current,
      isAudioOnly: false,
      voiceActive: localVoiceActive && !isMuted
    });
  } else {
    gridItems.push({
      id: 'local-user',
      isLocal: true,
      name: `${myProfile.displayName} (You)`,
      avatar: myProfile.avatar,
      voiceActive: localVoiceActive && !isMuted,
      stream: null,
      isAudioOnly: true
    });
  }

  // Local Screen Share
  if (isScreenSharing && localScreenStreamRef.current) {
    gridItems.push({
      id: 'local-screen',
      isLocal: true,
      name: 'Your Screen',
      stream: localScreenStreamRef.current,
      isAudioOnly: false
    });
  }

  // Remote Peers
  Object.entries(peers).forEach(([peerKey, peer]) => {
    const profile = knownUsers.find(u => u.key === peerKey) || { displayName: 'Unknown' };
    
    let audioStream = null;

    peer.streams.forEach((stream, i) => {
      if (stream.getVideoTracks().length > 0) {
        gridItems.push({
          id: `${peerKey}-video-${i}`,
          isLocal: false,
          name: `${profile.displayName}'s Screen`,
          stream: stream,
          isAudioOnly: false
        });
      } else if (stream.getAudioTracks().length > 0) {
        audioStream = stream;
      }
    });

    // Always add their voice box (avatar)
    gridItems.push({
      id: `${peerKey}-voice`,
      isLocal: false,
      name: profile.displayName,
      avatar: profile.avatar,
      voiceActive: peer.voiceActive,
      stream: audioStream,
      isAudioOnly: true
    });
  });

  return (
    <div className={`bg-[#1e1f22] flex flex-col relative ${className}`}>
      
      {/* Header */}
      <div className="h-12 shadow-sm flex items-center px-4 border-b border-gray-900/20 gap-2 shrink-0">
        <span className="font-bold text-white">
          {vcChannelId ? `Voice Channel: ${vcChannelId}` : 'Group Call'}
        </span>
        <span className="ml-2 text-xs font-bold uppercase tracking-widest text-green-500 flex items-center gap-1">
          Connected • {Object.keys(peers).length + 1} in call
        </span>
      </div>

      {/* Main Call Area (Auto-sizing Grid) */}
      <div className="flex-1 p-4 overflow-y-auto custom-scrollbar">
        <div className="grid gap-4 auto-rows-fr" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))' }}>
          {gridItems.map(item => (
            <div 
              key={item.id} 
              className={`group bg-[#2b2d31] rounded-xl flex flex-col items-center justify-center transition-all duration-300 shadow-lg border border-gray-800 relative overflow-hidden aspect-video ${item.voiceActive && !isDeafened ? 'ring-2 ring-green-500' : 'ring-2 ring-transparent'}`}
            >
              {item.stream && !item.isAudioOnly ? (
                <>
                  <VideoPlayer stream={item.stream} muted={item.isLocal} deafened={isDeafened} isAudioOnly={false} />
                  <button 
                    onClick={(e) => { e.stopPropagation(); setExpandedStreamId(item.id); }}
                    className="absolute top-2 right-2 bg-black/60 hover:bg-black/80 text-white p-1.5 rounded opacity-0 group-hover:opacity-100 transition-opacity z-10"
                    title="Full Screen"
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"></path></svg>
                  </button>
                </>
              ) : (
                <>
                  {item.stream && item.isAudioOnly && <VideoPlayer stream={item.stream} muted={item.isLocal} deafened={isDeafened} isAudioOnly={true} />}
                  <div className={`rounded-full flex items-center justify-center text-white font-bold overflow-hidden w-24 h-24 text-3xl ${item.avatar ? 'bg-transparent' : 'bg-indigo-500'}`}>
                    {item.avatar ? (
                      <img src={item.avatar} alt="avatar" className="w-full h-full object-cover" />
                    ) : (
                      item.name.substring(0, 2).toUpperCase()
                    )}
                  </div>
                </>
              )}
              <span className="absolute bottom-2 left-2 bg-black/60 text-white text-xs px-2 py-1 rounded backdrop-blur-sm font-medium">
                {item.name}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Bottom Controls */}
      <div className="h-20 bg-[#2b2d31] flex items-center justify-center gap-4 shrink-0 rounded-t-2xl mx-4 border-t border-x border-gray-800">
        <button 
          onClick={toggleMute}
          className={`w-12 h-12 rounded-full flex items-center justify-center transition-colors ${isMuted ? 'bg-red-500 text-white hover:bg-red-600' : 'bg-[#383a40] text-gray-300 hover:bg-gray-600'} ${isDeafened ? 'opacity-50 cursor-not-allowed' : ''}`}
          title={isMuted ? "Unmute" : "Mute"}
        >
          {isMuted ? (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="1" y1="1" x2="23" y2="23"></line><path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6"></path><path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2a7 7 0 0 1-.11 1.23"></path><line x1="12" y1="19" x2="12" y2="23"></line><line x1="8" y1="23" x2="16" y2="23"></line></svg>
          ) : (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"></path><path d="M19 10v2a7 7 0 0 1-14 0v-2"></path><line x1="12" y1="19" x2="12" y2="23"></line><line x1="8" y1="23" x2="16" y2="23"></line></svg>
          )}
        </button>

        <button 
          onClick={toggleDeafen}
          className={`w-12 h-12 rounded-full flex items-center justify-center transition-colors ${isDeafened ? 'bg-red-500 text-white hover:bg-red-600' : 'bg-[#383a40] text-gray-300 hover:bg-gray-600'}`}
          title={isDeafened ? "Undeafen" : "Deafen"}
        >
          {isDeafened ? (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.3 17.3A8.9 8.9 0 0 0 21 12a9 9 0 0 0-18 0 8.9 8.9 0 0 0 3.7 5.3"></path><line x1="1" y1="1" x2="23" y2="23"></line><path d="M3 12v3a3 3 0 0 0 3 3h1v-7H3z"></path><path d="M21 12v3a3 3 0 0 1-3 3h-1v-7h4z"></path></svg>
          ) : (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 18v-6a9 9 0 0 1 18 0v6"></path><path d="M21 19a2 2 0 0 1-2 2h-1v-9h4v7z"></path><path d="M3 19a2 2 0 0 0 2 2h1v-9H2v7z"></path></svg>
          )}
        </button>

        <button 
          onClick={toggleVideo}
          className={`w-12 h-12 rounded-full flex items-center justify-center transition-colors ${!isVideoOn ? 'bg-red-500 text-white hover:bg-red-600' : 'bg-[#383a40] text-gray-300 hover:bg-gray-600'}`}
          title={isVideoOn ? "Turn Off Camera" : "Turn On Camera"}
        >
          {isVideoOn ? (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="23 7 16 12 23 17 23 7"></polygon><rect x="1" y="5" width="15" height="14" rx="2" ry="2"></rect></svg>
          ) : (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 16v1a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h2m5.66 0H14a2 2 0 0 1 2 2v3.34l1 1L23 7v10"></path><line x1="1" y1="1" x2="23" y2="23"></line></svg>
          )}
        </button>

        <button 
          onClick={onToggleChat}
          className="px-6 h-10 rounded bg-[#383a40] hover:bg-gray-600 text-white font-medium flex items-center gap-2 transition-colors"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>
          Chat
        </button>

        {isScreenSharing ? (
          <button 
            onClick={stopScreenShare}
            className="px-6 h-10 rounded bg-red-500 hover:bg-red-600 text-white font-medium flex items-center gap-2 transition-colors"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="3" width="20" height="14" rx="2" ry="2"></rect><line x1="8" y1="21" x2="16" y2="21"></line><line x1="12" y1="17" x2="12" y2="21"></line><line x1="1" y1="1" x2="23" y2="23"></line></svg>
            Stop Sharing
          </button>
        ) : (
          <button 
            onClick={() => setShowScreenShareModal(true)}
            className="px-6 h-10 rounded bg-[#383a40] hover:bg-gray-600 text-white font-medium flex items-center gap-2 transition-colors"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="3" width="20" height="14" rx="2" ry="2"></rect><line x1="8" y1="21" x2="16" y2="21"></line><line x1="12" y1="17" x2="12" y2="21"></line></svg>
            Share Screen
          </button>
        )}

        <button 
          onClick={onClose}
          className="px-6 h-10 rounded bg-red-500 hover:bg-red-600 text-white font-medium flex items-center gap-2 transition-colors"
        >
          Disconnect
        </button>
      </div>

      {showScreenShareModal && (
        <ScreenShareModal 
          onClose={() => setShowScreenShareModal(false)}
          onStart={startScreenShare}
        />
      )}

      {/* Fullscreen Expanded View */}
      {expandedStreamId && (() => {
        const expandedItem = gridItems.find(i => i.id === expandedStreamId);
        if (!expandedItem) {
          setExpandedStreamId(null);
          return null;
        }
        return (
          <div className="fixed inset-0 z-[100] bg-black/95 flex items-center justify-center backdrop-blur-sm" onClick={() => setExpandedStreamId(null)}>
            <div className="relative w-full h-full flex items-center justify-center p-8">
              <VideoPlayer stream={expandedItem.stream} muted={expandedItem.isLocal} deafened={isDeafened} isAudioOnly={false} />
              <button 
                className="absolute top-6 right-6 text-white hover:text-gray-300 bg-black/50 hover:bg-black/80 rounded-full p-2 transition-colors" 
                onClick={(e) => { e.stopPropagation(); setExpandedStreamId(null); }}
              >
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
              </button>
              <span className="absolute bottom-8 left-8 bg-black/60 text-white text-lg px-4 py-2 rounded backdrop-blur-sm font-medium">
                {expandedItem.name}
              </span>
            </div>
          </div>
        );
      })()}
    </div>
  );
}