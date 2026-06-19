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

export default function CallView({ targetKey, targetProfile, myProfile, isCaller, status, onClose, onToggleChat, onConnected, className, initialVideoOn }) {
  const [isMuted, setIsMuted] = useState(false);
  const [isDeafened, setIsDeafened] = useState(false);
  const [isVideoOn, setIsVideoOn] = useState(initialVideoOn || false);
  const [localVoiceActive, setLocalVoiceActive] = useState(false);
  const [remoteVoiceActive, setRemoteVoiceActive] = useState(false);
  
  const [showScreenShareModal, setShowScreenShareModal] = useState(false);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [hasRemoteVideo, setHasRemoteVideo] = useState(false);
  const [remoteVideoStream, setRemoteVideoStream] = useState(null);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const pcRef = useRef(null);
  const localStreamRef = useRef(null);
  const localClonedAudioStreamRef = useRef(null);
  const localScreenStreamRef = useRef(null);
  const localCameraStreamRef = useRef(null);
  
  const remoteAudioRef = useRef(null);
  const remoteAudioStreamRef = useRef(new MediaStream());
  const remoteVideoRef = useRef(null);
  const localVideoRef = useRef(null);
  
  const animationFrameRef = useRef(null);
  const audioCtxRef = useRef(null);
  
  const pendingCandidates = useRef([]);
  const pendingSignals = useRef([]);
  const isProcessingSignals = useRef(false);
  const drainPendingSignalsRef = useRef(null);
  const [mediaReady, setMediaReady] = useState(false);

  const isLocalVideoActive = isScreenSharing || isVideoOn;
  const isVideoActive = hasRemoteVideo || isLocalVideoActive;

  const wasConnected = useRef(false);
  useEffect(() => {
    if (status === 'connected' && !wasConnected.current) {
      wasConnected.current = true;
      playSound('join');
    }
  }, [status]);

  useEffect(() => {
    return () => {
      if (wasConnected.current) {
        playSound('leave');
      }
    };
  }, []);

  useEffect(() => {
    if (localVideoRef.current) {
      if (isScreenSharing && localScreenStreamRef.current) {
        localVideoRef.current.srcObject = localScreenStreamRef.current;
      } else if (isVideoOn && localCameraStreamRef.current) {
        localVideoRef.current.srcObject = localCameraStreamRef.current;
      } else {
        localVideoRef.current.srcObject = null;
      }
    }
  }, [isScreenSharing, isVideoOn, hasRemoteVideo, isFullscreen]);

  useEffect(() => {
    if (remoteVideoRef.current) {
      if (hasRemoteVideo && remoteVideoStream) {
        remoteVideoRef.current.srcObject = remoteVideoStream;
      } else {
        remoteVideoRef.current.srcObject = null;
      }
    }
  }, [hasRemoteVideo, isFullscreen, remoteVideoStream]);

  const initPC = async () => {
    const pc = new RTCPeerConnection({ iceServers:[{ urls: 'stun:stun.l.google.com:19302' }] });
    pcRef.current = pc;

    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => pc.addTrack(track, localStreamRef.current));
    }
    if (localCameraStreamRef.current) {
      localCameraStreamRef.current.getTracks().forEach(track => pc.addTrack(track, localCameraStreamRef.current));
    }

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'connected') {
        onConnected();
      }
    };

    pc.oniceconnectionstatechange = () => {
      if (pc.iceConnectionState === 'connected' || pc.iceConnectionState === 'completed') {
        onConnected();
      }
    };

    pc.onicecandidate = (e) => {
      if (e.candidate) {
        network.sendWebRTCSignal(targetKey, { type: 'webrtc-ice-candidate', candidate: e.candidate });
      }
    };

    pc.ontrack = (e) => {
      if (e.track.kind === 'video') {
        setRemoteVideoStream(e.streams[0]);
        setHasRemoteVideo(true);
        
        e.track.onended = () => { 
          setHasRemoteVideo(false); 
          setRemoteVideoStream(null);
          setIsFullscreen(false); 
        };
        e.track.onmute = () => { 
          setHasRemoteVideo(false); 
          setIsFullscreen(false); 
        };
        e.track.onunmute = () => {
          setHasRemoteVideo(true);
        };
      } else if (e.track.kind === 'audio') {
        // Add all incoming audio tracks to a unified MediaStream
        remoteAudioStreamRef.current.addTrack(e.track);
        
        if (remoteAudioRef.current) {
          if (remoteAudioRef.current.srcObject !== remoteAudioStreamRef.current) {
            remoteAudioRef.current.srcObject = remoteAudioStreamRef.current;
          }
          const outputId = localStorage.getItem('pear_audio_output');
          if (outputId && outputId !== 'default' && remoteAudioRef.current.setSinkId) {
            remoteAudioRef.current.setSinkId(outputId).catch(console.error);
          }
        }

        e.track.onended = () => {
          remoteAudioStreamRef.current.removeTrack(e.track);
        };
      }
    };

    if (drainPendingSignalsRef.current) {
      await drainPendingSignalsRef.current();
    }

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

        setMediaReady(true);

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
            network.sendWebRTCSignal(targetKey, { type: 'voice_activity', state: isSpeaking ? 'speaking' : 'silent' });
            setLocalVoiceActive(isSpeaking);
            lastSpeakingState = isSpeaking;
          }
          animationFrameRef.current = requestAnimationFrame(checkAudio);
        };
        checkAudio();

        if (!isCaller) {
          initPC();
        }

      } catch (err) {
        console.error("Failed to access microphone:", err);
        alert("Could not access microphone. Please check your permissions.");
        onClose();
      }
    };

    setupMedia();

    return () => {
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
      if (audioCtxRef.current) audioCtxRef.current.close().catch(() => {});
      if (localStreamRef.current) localStreamRef.current.getTracks().forEach(t => t.stop());
      if (localClonedAudioStreamRef.current) localClonedAudioStreamRef.current.getTracks().forEach(t => t.stop());
      if (localScreenStreamRef.current) localScreenStreamRef.current.getTracks().forEach(t => t.stop());
      if (localCameraStreamRef.current) localCameraStreamRef.current.getTracks().forEach(t => t.stop());
      if (pcRef.current) pcRef.current.close();
      network.sendWebRTCSignal(targetKey, { type: 'webrtc-end' });
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[]);

  useEffect(() => {
    if (isCaller && status === 'connecting' && !pcRef.current && mediaReady) {
      initPC().then(async (pc) => {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        network.sendWebRTCSignal(targetKey, { type: 'webrtc-offer', sdp: offer });
      });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[status, isCaller, targetKey, mediaReady]);

  useEffect(() => {
    const processSignal = async (payload) => {
      const pc = pcRef.current;
      if (!pc) return;

      if (payload.type === 'webrtc-offer') {
        await pc.setRemoteDescription(new RTCSessionDescription(payload.sdp));
        for (const candidate of pendingCandidates.current) {
          await pc.addIceCandidate(candidate).catch(console.error);
        }
        pendingCandidates.current =[];

        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        network.sendWebRTCSignal(targetKey, { type: 'webrtc-answer', sdp: answer });
        
      } else if (payload.type === 'webrtc-answer') {
        await pc.setRemoteDescription(new RTCSessionDescription(payload.sdp));
        for (const candidate of pendingCandidates.current) {
          await pc.addIceCandidate(candidate).catch(console.error);
        }
        pendingCandidates.current =[];
        
      } else if (payload.type === 'webrtc-ice-candidate') {
        const candidate = new RTCIceCandidate(payload.candidate);
        if (pc.remoteDescription && pc.remoteDescription.type) {
          await pc.addIceCandidate(candidate).catch(console.error);
        } else {
          pendingCandidates.current.push(candidate);
        }
        
      } else if (payload.type === 'voice_activity') {
        setRemoteVoiceActive(payload.state === 'speaking');
      }
    };

    const drainPendingSignals = async () => {
      if (isProcessingSignals.current) return;
      isProcessingSignals.current = true;
      while (pendingSignals.current.length > 0) {
        const payload = pendingSignals.current.shift();
        await processSignal(payload);
      }
      isProcessingSignals.current = false;
    };

    drainPendingSignalsRef.current = drainPendingSignals;

    const handleSignal = async (peerKey, payload) => {
      if (peerKey !== targetKey) return;
      
      try {
        if (payload.type === 'webrtc-action') {
          playSound(payload.action);
          return;
        }

        if (!pcRef.current && payload.type !== 'voice_activity') {
          pendingSignals.current.push(payload);
          return;
        }
        
        if (pcRef.current) {
          pendingSignals.current.push(payload);
          await drainPendingSignals();
        } else if (payload.type === 'voice_activity') {
          setRemoteVoiceActive(payload.state === 'speaking');
        }
      } catch (err) {
        console.error("Error handling WebRTC signal:", err);
      }
    };

    network.addWebRTCListener(handleSignal);
    return () => network.removeWebRTCListener(handleSignal);
  }, [targetKey]);

  const toggleMute = () => {
    if (isDeafened) return; // Cannot unmute while deafened
    if (localStreamRef.current) {
      const audioTrack = localStreamRef.current.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled;
        setIsMuted(!audioTrack.enabled);
        const action = !audioTrack.enabled ? 'mute' : 'unmute';
        playSound(action);
        network.sendWebRTCSignal(targetKey, { type: 'webrtc-action', action });
      }
    }
  };

  const toggleDeafen = () => {
    const newDeafened = !isDeafened;
    setIsDeafened(newDeafened);
    const action = newDeafened ? 'deafen' : 'undeafen';
    playSound(action);
    network.sendWebRTCSignal(targetKey, { type: 'webrtc-action', action });
    
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
        const sender = pcRef.current?.getSenders().find(s => s.track === track);
        if (sender && pcRef.current) pcRef.current.removeTrack(sender);
        track.stop();
        localCameraStreamRef.current = null;
      }
      setIsVideoOn(false);
      playSound('stop_video');
      network.sendWebRTCSignal(targetKey, { type: 'webrtc-action', action: 'stop_video' });
      
      if (pcRef.current && pcRef.current.signalingState !== 'closed') {
        const offer = await pcRef.current.createOffer();
        await pcRef.current.setLocalDescription(offer);
        network.sendWebRTCSignal(targetKey, { type: 'webrtc-offer', sdp: offer });
      }
    } else {
      try {
        const videoInputId = localStorage.getItem('pear_video_input');
        const stream = await navigator.mediaDevices.getUserMedia({
          video: videoInputId && videoInputId !== 'default' ? { deviceId: { exact: videoInputId } } : true
        });
        localCameraStreamRef.current = stream;
        const track = stream.getVideoTracks()[0];
        if (pcRef.current) {
          pcRef.current.addTrack(track, stream);
          const offer = await pcRef.current.createOffer();
          await pcRef.current.setLocalDescription(offer);
          network.sendWebRTCSignal(targetKey, { type: 'webrtc-offer', sdp: offer });
        }
        setIsVideoOn(true);
        playSound('start_video');
        network.sendWebRTCSignal(targetKey, { type: 'webrtc-action', action: 'start_video' });
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
      network.sendWebRTCSignal(targetKey, { type: 'webrtc-action', action: 'start_screen' });

      if (pcRef.current) {
        if (videoTrack) {
          const sender = pcRef.current.addTrack(videoTrack, stream);
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
            await sender.setParameters(params);
          } catch (paramErr) {
            console.warn("Could not set sender parameters:", paramErr);
          }
        }
        
        if (audioTrack) {
          pcRef.current.addTrack(audioTrack, stream);
        }

        const offer = await pcRef.current.createOffer();
        await pcRef.current.setLocalDescription(offer);
        network.sendWebRTCSignal(targetKey, { type: 'webrtc-offer', sdp: offer });
      }

    } catch (err) {
      console.error("Screen share failed or cancelled", err);
      
      if (localVideoRef.current) localVideoRef.current.srcObject = null;
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
    if (localVideoRef.current) {
      localVideoRef.current.srcObject = null;
    }

    if (localScreenStreamRef.current) {
      localScreenStreamRef.current.getTracks().forEach(t => {
        if (pcRef.current) {
          const senders = pcRef.current.getSenders();
          const sender = senders.find(s => s.track === t);
          if (sender) {
            try { pcRef.current.removeTrack(sender); } catch (e) {}
          }
        }
        t.enabled = false;
        t.stop();
      });
      localScreenStreamRef.current = null;
    }
    
    setIsScreenSharing(false);
    setIsFullscreen(false);
    playSound('stop_screen');
    network.sendWebRTCSignal(targetKey, { type: 'webrtc-action', action: 'stop_screen' });
    
    if (pcRef.current && pcRef.current.signalingState !== 'closed') {
      try {
        const offer = await pcRef.current.createOffer();
        await pcRef.current.setLocalDescription(offer);
        network.sendWebRTCSignal(targetKey, { type: 'webrtc-offer', sdp: offer });
      } catch (e) {
        console.warn("Failed to negotiate track removal", e);
      }
    }
  };

  return (
    <div className={`bg-base flex flex-col relative ${className}`}>
      <audio ref={remoteAudioRef} autoPlay muted={isDeafened} className="hidden" />
      
      {/* Header */}
      <div className="h-14 shadow-sm flex items-center px-4 border-b border-surface gap-2 shrink-0 bg-panel">
        <span className="font-bold text-text">Call: {targetProfile.displayName}</span>
        <span className="ml-2 text-xs font-bold uppercase tracking-widest text-muted flex items-center gap-1">
          {status === 'ringing' ? (
            <>
              Ringing
              <span className="flex gap-0.5 items-center mt-1">
                <span className="w-1 h-1 bg-muted rounded-full typing-dot" style={{ animationDelay: '0s' }}></span>
                <span className="w-1 h-1 bg-muted rounded-full typing-dot" style={{ animationDelay: '0.15s' }}></span>
                <span className="w-1 h-1 bg-muted rounded-full typing-dot" style={{ animationDelay: '0.3s' }}></span>
              </span>
            </>
          ) : status === 'connecting' ? (
            'Connecting...'
          ) : (
            <span className="text-green-500">Connected</span>
          )}
        </span>
      </div>

      {/* Main Call Area */}
      <div className={`flex-1 flex ${isVideoActive ? 'flex-col' : 'items-center justify-center'} gap-8 p-8 overflow-hidden relative`}>
        
        {/* Video Area */}
        {isVideoActive && (
          <div 
            className={isFullscreen 
              ? "fixed inset-0 z-50 bg-black flex items-center justify-center" 
              : "flex-1 w-full bg-black rounded-lg overflow-hidden relative shadow-lg border border-surface cursor-pointer group"
            }
            onClick={() => !isFullscreen && setIsFullscreen(true)}
          >
            {hasRemoteVideo && (
              <video ref={remoteVideoRef} autoPlay playsInline muted={true} className="w-full h-full object-contain" />
            )}
            {isLocalVideoActive && !hasRemoteVideo && (
              <video ref={localVideoRef} autoPlay playsInline muted className="w-full h-full object-contain" />
            )}
            
            {/* Small PiP if both are sharing */}
            {hasRemoteVideo && isLocalVideoActive && (
              <div className={`absolute bottom-4 right-4 aspect-video bg-black rounded border-2 border-surface overflow-hidden shadow-xl ${isFullscreen ? 'w-80' : 'w-48'}`}>
                <video ref={localVideoRef} autoPlay playsInline muted className="w-full h-full object-cover" />
              </div>
            )}

            {!isFullscreen && (
              <div className="absolute inset-0 bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                <span className="text-white font-bold bg-black/50 px-4 py-2 rounded-full backdrop-blur-sm flex items-center gap-2">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"></path></svg>
                  Click to Enlarge
                </span>
              </div>
            )}

            {isFullscreen && (
              <button 
                onClick={(e) => { e.stopPropagation(); setIsFullscreen(false); }}
                className="absolute top-6 right-6 bg-red-500 hover:bg-red-600 text-white px-6 py-2 rounded-full font-bold shadow-lg transition-colors z-50 flex items-center gap-2"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M8 3v3a2 2 0 0 1-2 2H3m18 0h-3a2 2 0 0 1-2-2V3m0 18v-3a2 2 0 0 1 2-2h3M3 16h3a2 2 0 0 1 2 2v3"></path></svg>
                Exit Fullscreen
              </button>
            )}
          </div>
        )}

        {/* User Squares Grid */}
        <div className={`flex justify-center gap-6 ${isVideoActive ? 'shrink-0 h-40' : 'w-full max-w-3xl'}`}>
          
          {/* Remote User Square */}
          <div className={`bg-surface rounded-xl flex flex-col items-center justify-center gap-3 transition-all duration-300 shadow-lg border border-panel relative overflow-hidden ${isVideoActive ? 'w-48 h-full' : 'w-72 h-72'} ${status === 'ringing' ? 'opacity-50' : ''} ${remoteVoiceActive && !isDeafened ? 'ring-2 ring-green-500' : 'ring-2 ring-transparent'}`}>
            {status === 'ringing' && (
              <div className="absolute inset-0 bg-black/20 flex items-center justify-center z-10">
                <div className="w-full h-full animate-pulse bg-white/5"></div>
              </div>
            )}
            <div className={`rounded-md flex items-center justify-center text-white font-bold overflow-hidden ${isVideoActive ? 'w-16 h-16 text-2xl' : 'w-28 h-28 text-4xl'} ${targetProfile.avatar ? 'bg-transparent' : 'bg-indigo-500'}`}>
              {targetProfile.avatar ? (
                <img src={targetProfile.avatar} alt="avatar" className="w-full h-full object-cover" />
              ) : (
                targetProfile.displayName?.substring(0, 2).toUpperCase() || '?'
              )}
            </div>
            <span className={`text-text font-bold ${isVideoActive ? 'text-sm' : 'text-lg'}`}>{targetProfile.displayName || 'Unknown'}</span>
          </div>

          {/* Local User Square */}
          <div className={`bg-surface rounded-xl flex flex-col items-center justify-center gap-3 transition-all duration-300 shadow-lg border border-panel ${isVideoActive ? 'w-48 h-full' : 'w-72 h-72'} ${localVoiceActive && !isMuted ? 'ring-2 ring-green-500' : 'ring-2 ring-transparent'}`}>
            <div className={`rounded-md flex items-center justify-center text-white font-bold overflow-hidden ${isVideoActive ? 'w-16 h-16 text-2xl' : 'w-28 h-28 text-4xl'} ${myProfile.avatar ? 'bg-transparent' : 'bg-indigo-500'}`}>
              {myProfile.avatar ? (
                <img src={myProfile.avatar} alt="avatar" className="w-full h-full object-cover" />
              ) : (
                myProfile.displayName?.substring(0, 2).toUpperCase() || '?'
              )}
            </div>
            <span className={`text-text font-bold ${isVideoActive ? 'text-sm' : 'text-lg'}`}>{myProfile.displayName} (You)</span>
          </div>

        </div>

      </div>

      {/* Bottom Controls */}
      <div className="h-20 bg-surface flex items-center justify-center gap-4 shrink-0 rounded-t-2xl mx-4 border-t border-x border-panel">
        <button 
          onClick={toggleMute}
          className={`w-12 h-12 rounded-full flex items-center justify-center transition-colors ${isMuted ? 'bg-red-500 text-white hover:bg-red-600' : 'bg-panel text-text hover:bg-base'} ${isDeafened ? 'opacity-50 cursor-not-allowed' : ''}`}
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
          className={`w-12 h-12 rounded-full flex items-center justify-center transition-colors ${isDeafened ? 'bg-red-500 text-white hover:bg-red-600' : 'bg-panel text-text hover:bg-base'}`}
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
          className={`w-12 h-12 rounded-full flex items-center justify-center transition-colors ${!isVideoOn ? 'bg-red-500 text-white hover:bg-red-600' : 'bg-panel text-text hover:bg-base'}`}
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
          className="px-6 h-10 rounded bg-panel hover:bg-base text-text font-medium flex items-center gap-2 transition-colors"
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
            disabled={status !== 'connected'}
            className="px-6 h-10 rounded bg-panel hover:bg-base text-text font-medium flex items-center gap-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="3" width="20" height="14" rx="2" ry="2"></rect><line x1="8" y1="21" x2="16" y2="21"></line><line x1="12" y1="17" x2="12" y2="21"></line></svg>
            Share Screen
          </button>
        )}

        <button 
          onClick={onClose}
          className="px-6 h-10 rounded bg-red-500 hover:bg-red-600 text-white font-medium flex items-center gap-2 transition-colors"
        >
          End Call
        </button>
      </div>

      {showScreenShareModal && (
        <ScreenShareModal 
          onClose={() => setShowScreenShareModal(false)}
          onStart={startScreenShare}
        />
      )}
    </div>
  );
}