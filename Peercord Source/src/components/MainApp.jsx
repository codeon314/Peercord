import React, { useEffect, useState, useRef } from 'react';
import { network, ADMIN_PUBLIC_KEY } from '../p2p/index.js';
import Sidebar from './Sidebar.jsx';
import ChannelList from './ChannelList.jsx';
import DMList from './DMList.jsx';
import ChatArea from './ChatArea.jsx';
import FriendsView from './FriendsView.jsx';
import OnlineUsers from './OnlineUsers.jsx';
import ProfileSettingsModal from './ProfileSettingsModal.jsx';
import CreateServerModal from './CreateServerModal.jsx';
import CreateGroupModal from './CreateGroupModal.jsx';
import InviteModal from './InviteModal.jsx';
import ServerSettingsModal from './ServerSettingsModal.jsx';
import CallView from './CallView.jsx';
import GroupCallView from './GroupCallView.jsx';
import IncomingCallModal from './IncomingCallModal.jsx';

export default function MainApp({ profile, setProfile, onLogout, updateState, simulatedProgress, triggerRestart, onSystemUpdate }) {
  const[myKey, setMyKey] = useState('');
  const[onlinePeers, setOnlinePeers] = useState([]);
  const[knownUsers, setKnownUsers] = useState([]);
  const[messages, setMessages] = useState([]);
  const[servers, setServers] = useState([]);
  const[serverMembers, setServerMembers] = useState({});
  const[isSyncing, setIsSyncing] = useState(false);
  const[transfers, setTransfers] = useState({});
  
  const[activeView, setActiveView] = useState('dms'); 
  const[activeChannel, setActiveChannel] = useState('general-chat');
  const[activeDm, setActiveDm] = useState('friends');
  
  const[dms, setDms] = useState({});
  const[typingUsers, setTypingUsers] = useState({});
  
  const[readReceipts, setReadReceipts] = useState(() => JSON.parse(localStorage.getItem('pear_read_receipts') || '{}')); 
  const[deliveredReceipts, setDeliveredReceipts] = useState(() => JSON.parse(localStorage.getItem('pear_delivered_receipts') || '{}'));
  const[lastRead, setLastRead] = useState(() => JSON.parse(localStorage.getItem('pear_last_read') || '{}'));
  
  const[isSettingsOpen, setIsSettingsOpen] = useState(false);
  const[isCreateServerOpen, setIsCreateServerOpen] = useState(false);
  const[isCreateGroupOpen, setIsCreateGroupOpen] = useState(false);
  const[inviteModalServer, setInviteModalServer] = useState(null);
  const[settingsModalServer, setSettingsModalServer] = useState(null);
  
  // Call States
  const[activeCall, setActiveCall] = useState(null); 
  const[activeGroupCall, setActiveGroupCall] = useState(null); 
  const[activeVc, setActiveVc] = useState(null); 
  const[incomingCall, setIncomingCall] = useState(null); 
  const[showChatInCall, setShowChatInCall] = useState(false);
  const callTimeoutRef = useRef(null);

  const[vcStates, setVcStates] = useState({});
  const[showMembersDrawer, setShowMembersDrawer] = useState(false);
  const[pinMembers, setPinMembers] = useState(localStorage.getItem('pear_pin_members') === 'true');
  
  const [isNetworkOnline, setIsNetworkOnline] = useState(typeof navigator !== 'undefined' ? navigator.onLine : true);

  const initialized = useRef(false);
  const notifiedMsgs = useRef(new Set());
  const [isFocused, setIsFocused] = useState(true);
  const activeStateRef = useRef({ view: 'dms', dm: 'friends', channel: 'general-chat', focused: true });

  // FIX: Stable reference for WebRTC listener to prevent dropped calls during React re-renders
  const callStateRef = useRef({ activeCall, activeGroupCall, activeVc, knownUsers, dms, servers, profile });

  useEffect(() => {
    activeStateRef.current = { view: activeView, dm: activeDm, channel: activeChannel, focused: isFocused };
  }, [activeView, activeDm, activeChannel, isFocused]);

  useEffect(() => {
    callStateRef.current = { activeCall, activeGroupCall, activeVc, knownUsers, dms, servers, profile };
  }, [activeCall, activeGroupCall, activeVc, knownUsers, dms, servers, profile]);

  useEffect(() => {
    const onFocus = () => setIsFocused(true);
    const onBlur = () => setIsFocused(false);
    window.addEventListener('focus', onFocus);
    window.addEventListener('blur', onBlur);
    
    if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
      Notification.requestPermission();
    }

    if (typeof window !== 'undefined' && window.require) {
      const closeToTray = localStorage.getItem('pear_close_to_tray') !== 'false';
      window.require('electron').ipcRenderer.send('set-tray-setting', closeToTray);
    }

    const handleStorage = () => {
      setPinMembers(localStorage.getItem('pear_pin_members') === 'true');
    };
    window.addEventListener('storage', handleStorage);

    return () => { 
      window.removeEventListener('focus', onFocus); 
      window.removeEventListener('blur', onBlur); 
      window.removeEventListener('storage', handleStorage);
    };
  }, []);

  const playPing = () => {
    try {
      const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(880, audioCtx.currentTime); // A5
      gain.gain.setValueAtTime(0, audioCtx.currentTime);
      gain.gain.linearRampToValueAtTime(0.1, audioCtx.currentTime + 0.02);
      gain.gain.linearRampToValueAtTime(0, audioCtx.currentTime + 0.15);
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start(audioCtx.currentTime);
      osc.stop(audioCtx.currentTime + 0.15);
      setTimeout(() => audioCtx.close(), 500);
    } catch (e) {}
  };

  useEffect(() => {
    const handleOnline = () => {
      setIsNetworkOnline(true);
      setOnlinePeers(network.getPeerList());
      network.reconnect();
    };
    const handleOffline = () => {
      setIsNetworkOnline(false);
      setOnlinePeers([]);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  useEffect(() => {
    localStorage.setItem('pear_last_read', JSON.stringify(lastRead));
  },[lastRead]);

  useEffect(() => {
    localStorage.setItem('pear_read_receipts', JSON.stringify(readReceipts));
  },[readReceipts]);

  useEffect(() => {
    localStorage.setItem('pear_delivered_receipts', JSON.stringify(deliveredReceipts));
  },[deliveredReceipts]);

  useEffect(() => {
    if (!initialized.current && typeof window !== 'undefined') {
      initialized.current = true;
      
      network.onInit = (key) => setMyKey(key);
      network.onPeerUpdate = (peers) => {
        if (typeof navigator !== 'undefined' && navigator.onLine) {
          setOnlinePeers([...peers]);
        }
      };
      network.onKnownProfilesUpdate = (users) => setKnownUsers(users);
      
      network.onMessage = (msgs) => {
        setMessages([...msgs]);
        
        const notifyDMs = localStorage.getItem('pear_notify_dms') !== 'false';
        const notifyHubs = localStorage.getItem('pear_notify_hubs') !== 'false';
        const notifyMentions = localStorage.getItem('pear_notify_mentions') !== 'false';

        let shouldPing = false;
        let notifBody = '';
        let notifTitle = 'New Message';
        let jumpInfo = null;

        msgs.forEach(msg => {
          if (!notifiedMsgs.current.has(msg.id)) {
            notifiedMsgs.current.add(msg.id);
            
            // Only notify for recent messages (within last 10 seconds) to prevent boot spam
            const isRecent = (Date.now() - msg.timestamp) < 10000;
            
            if (msg.sender !== network.myKey && isRecent) {
              const isDM = !msg.channel || msg.recipient;
              const msgChannelId = isDM ? msg.sender : msg.channel;
              
              let isMention = false;
              if (msg.text && (msg.text.includes(`@${profile.username}`) || msg.text.includes('@everyone'))) {
                isMention = true;
              }

              if (isDM && !notifyDMs) return;
              if (!isDM && !notifyHubs && !isMention) return;
              if (!isDM && isMention && !notifyMentions) return;

              const { view, dm, channel, focused } = activeStateRef.current;
              let isCurrentChannel = false;
              
              if (view === 'dms') {
                isCurrentChannel = dm === msgChannelId;
              } else {
                isCurrentChannel = `${view}-${channel}` === msgChannelId;
              }

              if (!focused || !isCurrentChannel) {
                shouldPing = true;
                notifBody = msg.text || 'Sent an attachment';
                
                if (isDM) {
                  notifTitle = `Peercord - Message from ${msg.senderName}`;
                  jumpInfo = { isDM: true, channelId: msg.sender, msgId: msg.id };
                } else {
                  const topicHex = msg.channel.substring(0, 64);
                  const chName = msg.channel.substring(65);
                  const server = network.servers.find(s => s.topicHex === topicHex);
                  const srvName = server ? server.name : 'Hub';
                  notifTitle = `Peercord - ${srvName} #${chName}`;
                  notifBody = `${msg.senderName}: ${notifBody}`;
                  jumpInfo = { isDM: false, serverId: topicHex, channelId: chName, msgId: msg.id };
                }
              }
            }
          }
        });

        if (shouldPing) {
          playPing();
          if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
            const notif = new Notification(notifTitle, { 
              body: notifBody
            });
            notif.onclick = () => {
              if (typeof window !== 'undefined' && window.require) {
                try {
                  const { ipcRenderer } = window.require('electron');
                  ipcRenderer.send('window-action', 'restore');
                } catch (e) {}
              }
              window.focus();
              
              if (jumpInfo) {
                if (jumpInfo.isDM) {
                  setActiveView('dms');
                  setActiveDm(jumpInfo.channelId);
                } else {
                  setActiveView(jumpInfo.serverId);
                  setActiveChannel(jumpInfo.channelId);
                }
                setTimeout(() => {
                  window.dispatchEvent(new CustomEvent('jump-to-message', { detail: jumpInfo.msgId }));
                }, 500);
              }
            };
          }
        }
      };

      network.onDMsUpdate = (updatedDms) => setDms(updatedDms);
      network.onTransfersUpdate = (t) => setTransfers({...t});
      network.onServersUpdate = (srvs) => {
        setServers([...srvs]);
        setActiveView(prev => {
          if (prev !== 'dms' && !srvs.some(s => s.topicHex === prev)) return 'dms';
          return prev;
        });
      };
      network.onServerMembersUpdate = (members) => setServerMembers(members);
      network.onSync = (status) => setIsSyncing(status);
      
      network.onEphemeral = (peerKey, payload) => {
        if (payload.type === 'system_update') {
          try {
            const b4a = window.require('b4a');
            const sodium = window.require('sodium-native');
            
            const sigBuf = b4a.from(payload.signature, 'hex');
            const msgBuf = b4a.from(payload.version + payload.timestamp);
            const pubBuf = b4a.from(ADMIN_PUBLIC_KEY, 'hex');
            
            const isValid = sodium.crypto_sign_verify_detached(sigBuf, msgBuf, pubBuf);
            
            if (isValid && payload.version !== window.APP_VERSION) {
              if (onSystemUpdate) onSystemUpdate(payload.version, payload);
            } else if (!isValid) {
              console.warn('[P2P] Received invalid update broadcast signature.');
            }
          } catch (e) {
            console.error("Failed to verify update broadcast", e);
          }
        } else if (payload.type === 'typing') {
          setTypingUsers(prev => ({
            ...prev,[peerKey]: { channel: payload.channel, displayName: payload.displayName, timestamp: Date.now() }
          }));
        } else if (payload.type === 'read') {
          const markChannel = payload.channel === network.myKey ? peerKey : payload.channel;
          setReadReceipts(prev => ({ ...prev, [markChannel]: payload.messageId }));
        } else if (payload.type === 'delivered') {
          const markChannel = payload.channel === network.myKey ? peerKey : payload.channel;
          setDeliveredReceipts(prev => ({ ...prev,[markChannel]: payload.messageId }));
        } else if (payload.type === 'vc-state') {
          setVcStates(prev => {
            const serverVCS = prev[payload.serverTopicHex] || {};
            const channelVCS = serverVCS[payload.channel] || {};
            return {
              ...prev,
              [payload.serverTopicHex]: {
                ...serverVCS,
                [payload.channel]: {
                  ...channelVCS,
                  [peerKey]: {
                    muted: payload.muted,
                    deafened: payload.deafened,
                    screenshare: payload.screenshare,
                    timestamp: Date.now()
                  }
                }
              }
            };
          });
        } else if (payload.type === 'vc-leave') {
          setVcStates(prev => {
            const serverVCS = prev[payload.serverTopicHex];
            if (!serverVCS) return prev;
            const channelVCS = serverVCS[payload.channel];
            if (!channelVCS) return prev;
            
            const newChannelVCS = { ...channelVCS };
            delete newChannelVCS[peerKey];
            
            return {
              ...prev,
              [payload.serverTopicHex]: {
                ...serverVCS,
                [payload.channel]: newChannelVCS
              }
            };
          });
        }
      };

      network.initialize(profile.seedHex, profile.displayName, profile.username, profile.avatar, profile.bio, profile.connections)
        .catch(err => {
          alert("P2P Initialization Error:\n" + err.message + "\n\nPress F12 to open DevTools for more info.");
          console.error(err);
        });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[]); 

  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now();
      setVcStates(prev => {
        let changed = false;
        const next = { ...prev };
        for (const serverId in next) {
          for (const channelId in next[serverId]) {
            for (const peerKey in next[serverId][channelId]) {
              if (now - next[serverId][channelId][peerKey].timestamp > 15000) {
                delete next[serverId][channelId][peerKey];
                changed = true;
              }
            }
          }
        }
        return changed ? next : prev;
      });
    }, 5000);
    return () => clearInterval(interval);
  },[]);

  useEffect(() => {
    if (!myKey) return;
    onlinePeers.forEach(peer => {
      const msgsFromPeer = messages.filter(m => m.sender === peer.key && m.recipient === myKey);
      if (msgsFromPeer.length > 0) {
        const lastMsg = msgsFromPeer[msgsFromPeer.length - 1];
        network.sendDeliveredReceipt(peer.key, lastMsg.id);
      }
    });
  },[messages.length, onlinePeers.length, myKey]);

  useEffect(() => {
    network.activeCalls = (activeCall ? 1 : 0) + (activeGroupCall ? 1 : 0) + (activeVc ? 1 : 0);
  },[activeCall, activeGroupCall, activeVc]);

  useEffect(() => {
    if (activeView === 'dms' && activeDm !== 'friends') {
      const isUserDm = !!dms[activeDm];
      const isGc = servers.some(s => s.topicHex === activeDm && s.isGroupChat);
      if (!isUserDm && !isGc) {
        setActiveDm('friends');
      }
    }
  },[servers, dms, activeView, activeDm]);

  // FIX: Use stable ref for WebRTC listener to prevent dropped calls
  useEffect(() => {
    const handleWebRTC = (peerKey, payload) => {
      const { activeCall, activeGroupCall, activeVc, knownUsers, dms, servers, profile } = callStateRef.current;
      const notifyCalls = localStorage.getItem('pear_notify_calls') !== 'false';

      if (payload.type === 'webrtc-init') {
        if (!notifyCalls) {
          network.sendWebRTCSignal(peerKey, { type: 'webrtc-busy' });
          return;
        }
        if (!activeCall && !activeGroupCall && !activeVc) {
          const callerProfile = knownUsers.find(u => u.key === peerKey) || dms[peerKey]?.profile || { displayName: 'Unknown' };
          setIncomingCall({ isGroup: false, targetKey: peerKey, profile: callerProfile, callType: payload.callType || 'voice' });
        } else {
          network.sendWebRTCSignal(peerKey, { type: 'webrtc-busy' });
        }
      } else if (payload.type === 'webrtc-cancel') {
        setIncomingCall(current => (current && !current.isGroup && current.targetKey === peerKey) ? null : current);
      } else if (payload.type === 'webrtc-accept') {
        setActiveCall(current => {
          if (current?.targetKey === peerKey) {
            if (callTimeoutRef.current) clearTimeout(callTimeoutRef.current);
            return { ...current, status: 'connecting' };
          }
          return current;
        });
      } else if (payload.type === 'webrtc-decline' || payload.type === 'webrtc-busy') {
        setActiveCall(current => {
          if (current?.targetKey === peerKey) {
            if (callTimeoutRef.current) clearTimeout(callTimeoutRef.current);
            alert(payload.type === 'webrtc-busy' ? 'User is busy' : 'Call declined');
            return null;
          }
          return current;
        });
      } else if (payload.type === 'webrtc-end') {
        setActiveCall(current => current?.targetKey === peerKey ? null : current);
      }
      else if (payload.type === 'webrtc-group-ring') {
        if (!notifyCalls) return;
        const gc = servers.find(s => s.topicHex === payload.channel && s.isGroupChat);
        if (gc && activeGroupCall?.channel !== payload.channel && !activeVc) {
          setIncomingCall({ isGroup: true, channel: payload.channel, callerName: payload.callerName, gcName: gc.name, callType: payload.callType || 'voice' });
        }
      }
    };
    
    network.addWebRTCListener(handleWebRTC);
    return () => network.removeWebRTCListener(handleWebRTC);
  }, []);

  const handleSaveProfile = (newName, newAvatar, newUsername, newBio, newConnections) => {
    const updatedProfile = { 
      ...profile, 
      displayName: newName, 
      avatar: newAvatar, 
      username: newUsername || profile.username,
      bio: newBio || '',
      connections: newConnections || []
    };
    
    const accounts = JSON.parse(localStorage.getItem('pear_saved_accounts') || '[]');
    const existingIndex = accounts.findIndex(a => a.seedHex === profile.seedHex);
    if (existingIndex >= 0) {
      accounts[existingIndex] = updatedProfile;
      localStorage.setItem('pear_saved_accounts', JSON.stringify(accounts));
    }

    localStorage.setItem('pear_discord_identity', JSON.stringify(updatedProfile));
    setProfile(updatedProfile);
    network.updateProfile(newName, newAvatar, newUsername, newBio, newConnections);
    setIsSettingsOpen(false);
  };

  const handleCreateServer = async (name, icon, allowAnyone) => {
    const newServer = await network.createServer(name, icon, allowAnyone, false);
    setIsCreateServerOpen(false);
    setActiveView(newServer.topicHex);
  };

  const handleCreateGroup = async (name, members) => {
    const gc = await network.createServer(name, null, true, true); 
    for (const key of members) {
      await network.sendGroupChatAdd(key, gc.topicHex);
    }
    setIsCreateGroupOpen(false);
    setActiveView('dms');
    setActiveDm(gc.topicHex);
  };

  const endCall = () => {
    if (activeCall) {
      if (activeCall.status === 'ringing' && activeCall.isCaller) {
        network.sendWebRTCSignal(activeCall.targetKey, { type: 'webrtc-cancel' });
      } else {
        network.sendWebRTCSignal(activeCall.targetKey, { type: 'webrtc-end' });
      }
      if (callTimeoutRef.current) clearTimeout(callTimeoutRef.current);
      setActiveCall(null);
    }
  };

  const startCall = (targetKey, callType = 'voice') => {
    if (activeVc) {
      network.sendEphemeral({ type: 'vc-leave', serverTopicHex: activeVc.serverId, channel: activeVc.channelId });
      setVcStates(prev => {
        const serverVCS = prev[activeVc.serverId];
        if (!serverVCS) return prev;
        const channelVCS = serverVCS[activeVc.channelId];
        if (!channelVCS) return prev;
        const newChannelVCS = { ...channelVCS };
        delete newChannelVCS[myKey];
        return { ...prev, [activeVc.serverId]: { ...serverVCS,[activeVc.channelId]: newChannelVCS } };
      });
      setActiveVc(null);
    }
    const targetProfile = dms[targetKey]?.profile || knownUsers.find(u => u.key === targetKey) || { displayName: 'Unknown' };
    setActiveCall({ targetKey, profile: targetProfile, status: 'ringing', isCaller: true, callType });
    setShowChatInCall(false);
    network.sendWebRTCSignal(targetKey, { type: 'webrtc-init', callType });
    
    if (callTimeoutRef.current) clearTimeout(callTimeoutRef.current);
    callTimeoutRef.current = setTimeout(() => {
      setActiveCall(current => {
        if (current && current.targetKey === targetKey && current.status === 'ringing') {
          network.sendWebRTCSignal(targetKey, { type: 'webrtc-cancel' });
          return null;
        }
        return current;
      });
    }, 30000);
  };

  const startGroupCall = (channel, callType = 'voice') => {
    if (activeVc) {
      network.sendEphemeral({ type: 'vc-leave', serverTopicHex: activeVc.serverId, channel: activeVc.channelId });
      setVcStates(prev => {
        const serverVCS = prev[activeVc.serverId];
        if (!serverVCS) return prev;
        const channelVCS = serverVCS[activeVc.channelId];
        if (!channelVCS) return prev;
        const newChannelVCS = { ...channelVCS };
        delete newChannelVCS[myKey];
        return { ...prev, [activeVc.serverId]: { ...serverVCS,[activeVc.channelId]: newChannelVCS } };
      });
      setActiveVc(null);
    }
    network.sendEphemeral({ type: 'webrtc-group-ring', channel, callerName: profile.displayName, callType });
    setActiveGroupCall({ channel, callType });
    setShowChatInCall(false);
  };

  const handleJoinVC = (channelId) => {
    if (activeCall) endCall();
    if (activeGroupCall) setActiveGroupCall(null);
    if (activeVc) {
      network.sendEphemeral({ type: 'vc-leave', serverTopicHex: activeVc.serverId, channel: activeVc.channelId });
      setVcStates(prev => {
        const serverVCS = prev[activeVc.serverId];
        if (!serverVCS) return prev;
        const channelVCS = serverVCS[activeVc.channelId];
        if (!channelVCS) return prev;
        const newChannelVCS = { ...channelVCS };
        delete newChannelVCS[myKey];
        return { ...prev, [activeVc.serverId]: { ...serverVCS,[activeVc.channelId]: newChannelVCS } };
      });
    }
    setActiveVc({ serverId: activeView, channelId });
    setShowChatInCall(false);
  };

  const acceptCall = () => {
    if (activeVc) {
      network.sendEphemeral({ type: 'vc-leave', serverTopicHex: activeVc.serverId, channel: activeVc.channelId });
      setVcStates(prev => {
        const serverVCS = prev[activeVc.serverId];
        if (!serverVCS) return prev;
        const channelVCS = serverVCS[activeVc.channelId];
        if (!channelVCS) return prev;
        const newChannelVCS = { ...channelVCS };
        delete newChannelVCS[myKey];
        return { ...prev, [activeVc.serverId]: { ...serverVCS, [activeVc.channelId]: newChannelVCS } };
      });
      setActiveVc(null);
    }
    if (incomingCall.isGroup) {
      setActiveGroupCall({ channel: incomingCall.channel, callType: incomingCall.callType });
      setActiveView('dms');
      setActiveDm(incomingCall.channel);
    } else {
      setActiveCall({ targetKey: incomingCall.targetKey, profile: incomingCall.profile, status: 'connecting', isCaller: false, callType: incomingCall.callType });
      setActiveView('dms');
      setActiveDm(incomingCall.targetKey);
      network.sendWebRTCSignal(incomingCall.targetKey, { type: 'webrtc-accept' });
    }
    setShowChatInCall(false);
    setIncomingCall(null);
  };

  const declineCall = () => {
    if (!incomingCall.isGroup) {
      network.sendWebRTCSignal(incomingCall.targetKey, { type: 'webrtc-decline' });
    }
    setIncomingCall(null);
  };

  const handleReturnToCall = () => {
    if (activeCall) {
      setActiveView('dms');
      setActiveDm(activeCall.targetKey);
    } else if (activeGroupCall) {
      setActiveView('dms');
      setActiveDm(activeGroupCall.channel);
    } else if (activeVc) {
      setActiveView(activeVc.serverId);
    }
    setShowChatInCall(false);
  };

  const handleNavigateToDM = (pubKey) => {
    setActiveView('dms');
    setActiveDm(pubKey);
  };

  const unreadCounts = {};
  messages.forEach(m => {
    const channelId = m.recipient ? (m.sender === myKey ? m.recipient : m.sender) : m.channel;
    if (m.sender !== myKey && m.timestamp > (lastRead[channelId] || 0)) {
      unreadCounts[channelId] = (unreadCounts[channelId] || 0) + 1;
    }
  });

  const isViewingCallDM = activeCall && activeView === 'dms' && activeDm === activeCall.targetKey;
  const isViewingGroupCall = activeGroupCall && activeView === 'dms' && activeDm === activeGroupCall.channel;
  const isViewingVC = activeVc && activeView === activeVc.serverId;
  const showCallView = (isViewingCallDM || isViewingGroupCall || isViewingVC) && !showChatInCall;

  const isGroupChat = activeView === 'dms' && servers.some(s => s.topicHex === activeDm && s.isGroupChat);
  const inviteServerObj = servers.find(s => s.topicHex === inviteModalServer);

  const showMembersPanel = activeView !== 'dms' || isGroupChat;
  const isPinned = pinMembers && showMembersPanel;
  const isDrawerOpen = showMembersDrawer && showMembersPanel;

  return (
    <div className="flex h-full w-full bg-base font-sans overflow-hidden relative">
      <Sidebar 
        activeView={activeView} 
        setActiveView={setActiveView} 
        servers={servers} 
        myKey={myKey}
        unreadCounts={unreadCounts}
        onOpenCreateServer={() => setIsCreateServerOpen(true)} 
        onLeaveServer={(topicHex) => {
          network.leaveServer(topicHex);
          if (activeView === topicHex) setActiveView('dms');
        }}
      />
      
      {activeView === 'dms' ? (
        <DMList 
          activeChannel={activeDm} 
          setActiveChannel={(ch) => {
            setActiveDm(ch);
            setLastRead(prev => ({ ...prev,[ch]: Date.now() }));
          }} 
          myKey={myKey} 
          profile={profile} 
          unreadCounts={unreadCounts}
          onOpenSettings={() => setIsSettingsOpen(true)}
          dms={dms}
          servers={servers}
          onlinePeers={onlinePeers}
          typingUsers={typingUsers}
          activeCall={activeCall || activeGroupCall || activeVc}
          onReturnToCall={handleReturnToCall}
          onOpenCreateGroup={() => setIsCreateGroupOpen(true)}
          onLeaveGroup={(topicHex) => {
            network.leaveServer(topicHex);
            if (activeDm === topicHex) setActiveDm('friends');
          }}
          onDeleteGroup={(topicHex) => {
            network.deleteServer(topicHex);
            if (activeDm === topicHex) setActiveDm('friends');
          }}
          isNetworkOnline={isNetworkOnline}
        />
      ) : (
        <ChannelList 
          activeChannel={activeChannel} 
          setActiveChannel={(ch) => {
            setActiveChannel(ch);
            const netId = `${activeView}-${ch}`;
            setLastRead(prev => ({ ...prev,[netId]: Date.now() }));
          }} 
          myKey={myKey} 
          profile={profile} 
          unreadCounts={unreadCounts}
          onOpenSettings={() => setIsSettingsOpen(true)}
          activeView={activeView}
          servers={servers}
          serverMembers={serverMembers}
          onlinePeers={onlinePeers}
          knownUsers={knownUsers}
          isSyncing={isSyncing}
          onOpenInvite={() => setInviteModalServer(activeView)}
          onOpenServerSettings={() => setSettingsModalServer(activeView)}
          activeCall={activeCall || activeGroupCall || activeVc}
          onReturnToCall={handleReturnToCall}
          vcStates={vcStates}
          activeVc={activeVc}
          onJoinVC={handleJoinVC}
          isNetworkOnline={isNetworkOnline}
        />
      )}

      {/* Main Content Area */}
      <div className="flex-1 relative overflow-hidden flex">
        
        {/* Chat Area (Hidden if CallView is active) */}
        <div className={`flex-1 flex flex-col min-w-0 transition-[margin] duration-300 ${showCallView ? 'hidden' : ''} ${isDrawerOpen && !isPinned ? 'mr-64' : ''}`}>
          {activeView === 'dms' && activeDm === 'friends' ? (
            <FriendsView dms={dms} onNavigateToDM={handleNavigateToDM} />
          ) : (
            <ChatArea 
              activeView={activeView}
              activeChannel={activeView === 'dms' ? activeDm : activeChannel}
			  setActiveChannel={activeView === 'dms' ? setActiveDm : setActiveChannel}
              messages={messages} 
              myKey={myKey} 
              profile={profile}
              typingUsers={typingUsers}
              readReceipts={readReceipts}
              deliveredReceipts={deliveredReceipts}
              onlinePeers={onlinePeers}
              markChannelRead={(networkId) => setLastRead(prev => ({ ...prev,[networkId]: Date.now() }))}
              dms={dms}
              servers={servers}
              onStartCall={(ch, type) => {
                const isGC = servers.some(s => s.topicHex === ch && s.isGroupChat);
                if (isGC) startGroupCall(ch, type);
                else startCall(ch, type);
              }}
              activeCall={activeCall || (activeGroupCall ? { targetKey: activeGroupCall.channel } : null)}
              onReturnToCall={() => setShowChatInCall(false)}
              transfers={transfers}
              onOpenInvite={(topicHex) => setInviteModalServer(topicHex)}
              onToggleMembers={() => setShowMembersDrawer(!showMembersDrawer)}
              pinMembers={pinMembers}
              onNavigateToDM={handleNavigateToDM}
            />
          )}
        </div>

        {/* 1-on-1 Call View */}
        {activeCall && (
          <CallView 
            className={showCallView && isViewingCallDM ? `flex-1 flex flex-col min-w-0 transition-[margin] duration-300 ${isDrawerOpen && !isPinned ? 'mr-64' : ''}` : 'hidden'}
            targetKey={activeCall.targetKey}
            targetProfile={activeCall.profile}
            myProfile={profile}
            isCaller={activeCall.isCaller}
            status={activeCall.status}
            initialVideoOn={activeCall.callType === 'video'}
            onClose={endCall}
            onToggleChat={() => setShowChatInCall(true)}
            onConnected={() => setActiveCall(prev => prev ? { ...prev, status: 'connected' } : null)}
          />
        )}

        {/* Group Call View (Used for both DMs and Server VCs) */}
        {(activeGroupCall || activeVc) && (
          <GroupCallView 
            key={activeGroupCall ? activeGroupCall.channel : `${activeVc.serverId}-${activeVc.channelId}`}
            className={showCallView && (isViewingGroupCall || isViewingVC) ? `flex-1 flex flex-col min-w-0 transition-[margin] duration-300 ${isDrawerOpen && !isPinned ? 'mr-64' : ''}` : 'hidden'}
            channel={activeGroupCall?.channel || `${activeVc.serverId}-${activeVc.channelId}`}
            serverTopicHex={activeVc?.serverId}
            vcChannelId={activeVc?.channelId}
            initialVideoOn={activeGroupCall?.callType === 'video'}
            myKey={myKey}
            myProfile={profile}
            knownUsers={knownUsers}
            onLocalStateChange={(muted, deafened, screenshare) => {
              if (!activeVc) return;
              setVcStates(prev => {
                const serverVCS = prev[activeVc.serverId] || {};
                const channelVCS = serverVCS[activeVc.channelId] || {};
                return {
                  ...prev,
                  [activeVc.serverId]: {
                    ...serverVCS,
                    [activeVc.channelId]: {
                      ...channelVCS,
                      [myKey]: { muted, deafened, screenshare, timestamp: Date.now() }
                    }
                  }
                };
              });
            }}
            onClose={() => {
              if (activeGroupCall) setActiveGroupCall(null);
              if (activeVc) {
                network.sendEphemeral({ type: 'vc-leave', serverTopicHex: activeVc.serverId, channel: activeVc.channelId });
                setVcStates(prev => {
                  const serverVCS = prev[activeVc.serverId];
                  if (!serverVCS) return prev;
                  const channelVCS = serverVCS[activeVc.channelId];
                  if (!channelVCS) return prev;
                  const newChannelVCS = { ...channelVCS };
                  delete newChannelVCS[myKey];
                  return { ...prev, [activeVc.serverId]: { ...serverVCS,[activeVc.channelId]: newChannelVCS } };
                });
                setActiveVc(null);
              }
            }}
            onToggleChat={() => setShowChatInCall(true)}
          />
        )}

        {/* Members Drawer */}
        {showMembersPanel && (
          <div className={`${isPinned ? 'relative w-64 shrink-0' : `absolute top-0 right-0 bottom-0 w-64 transform transition-transform duration-300 z-40 ${isDrawerOpen ? 'translate-x-0' : 'translate-x-full'}`} bg-surface border-l border-base flex flex-col`}>
            <OnlineUsers 
              onlinePeers={onlinePeers} 
              knownUsers={knownUsers} 
              dms={dms} 
              myKey={myKey} 
              profile={profile}
              activeView={activeView === 'dms' ? activeDm : activeView}
              servers={servers}
              serverMembers={serverMembers}
              onClose={() => setShowMembersDrawer(false)}
              pinMembers={pinMembers}
              onNavigateToDM={handleNavigateToDM}
            />
          </div>
        )}

      </div>

      {isSettingsOpen && (
        <ProfileSettingsModal 
          profile={profile} 
          myKey={myKey} 
          onClose={() => setIsSettingsOpen(false)} 
          onSave={handleSaveProfile} 
          onLogout={onLogout}
          dms={dms}
          servers={servers}
          knownUsers={knownUsers}
          updateState={updateState}
          simulatedProgress={simulatedProgress}
          triggerRestart={triggerRestart}
        />
      )}
      
      {isCreateServerOpen && (
        <CreateServerModal onClose={() => setIsCreateServerOpen(false)} onSave={handleCreateServer} />
      )}

      {isCreateGroupOpen && (
        <CreateGroupModal 
          onClose={() => setIsCreateGroupOpen(false)} 
          onSave={handleCreateGroup} 
          dms={dms} 
        />
      )}

      {inviteModalServer && (
        <InviteModal 
          onClose={() => setInviteModalServer(null)} 
          serverTopicHex={inviteModalServer} 
          dms={dms} 
          serverMembers={serverMembers}
          isGroupChat={inviteServerObj?.isGroupChat}
        />
      )}

      {settingsModalServer && (
        <ServerSettingsModal 
          onClose={() => setSettingsModalServer(null)} 
          activeServerObj={servers.find(s => s.topicHex === settingsModalServer)} 
          myKey={myKey}
          onDeleteServer={() => {
            network.deleteServer(settingsModalServer);
            setSettingsModalServer(null);
          }}
        />
      )}

      {incomingCall && (
        <IncomingCallModal 
          incomingCall={incomingCall}
          onAccept={acceptCall}
          onDecline={declineCall}
        />
      )}
    </div>
  );
}