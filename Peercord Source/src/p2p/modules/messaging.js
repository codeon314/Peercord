const b4a = window.require('b4a');
import { generateUUID, sodium, ADMIN_PUBLIC_KEY } from '../utils.js';
import { getSharedSecret, encryptPayload, decryptPayload } from './identity.js';

export function getAllMessages(network) {
  const joinedTopics = new Set(network.servers.map(s => s.topicHex));
  
  return Array.from(network.messages.values()).filter(m => {
    const ch = m.payload.channel;
    if (!m.recipient && ch) {
      if (ch.length > 64 && ch[64] === '-') {
        const topicHex = ch.substring(0, 64);
        const chName = ch.substring(65);
        if (!joinedTopics.has(topicHex)) return false;
        
        const server = network.servers.find(s => s.topicHex === topicHex);
        if (server && network.myKey !== server.owner && network.myKey !== ADMIN_PUBLIC_KEY) {
          const userRoles = server.memberRoles?.[network.myKey] || [];
          const isServerAdmin = userRoles.some(rId => {
            const r = server.roles?.find(role => role.id === rId);
            return r && r.permissions.includes('admin');
          });
          
          if (!isServerAdmin) {
            const channelPerms = server.channels?.permissions?.[chName];
            if (channelPerms && channelPerms.length > 0) {
              const hasChannelAccess = userRoles.some(rId => channelPerms.includes(rId));
              if (!hasChannelAccess) return false;
            }
            
            const hasReadPerm = userRoles.some(rId => {
              const r = server.roles?.find(role => role.id === rId);
              return r && r.permissions.includes('read_messages');
            });
            if (!hasReadPerm && server.roles && server.roles.length > 0) return false;
          }
        }
      } else if (ch.length === 64) {
        if (!joinedTopics.has(ch)) return false;
      }
    }
    return true;
  }).map(m => {
    const known = network.knownProfiles.get(m.sender);
    const isInvite = m.payload.type === 'server_invite';
    const isFile = m.payload.type === 'file';
    
    // Deep clone reactions to ensure React detects the state change and re-renders
    const rawReactions = network.reactions.get(m.payload.id) || {};
    const clonedReactions = {};
    for (const [emoji, users] of Object.entries(rawReactions)) {
      clonedReactions[emoji] = [...users];
    }
    
    return {
      id: m.payload.id,
      channel: m.recipient ? m.recipient : m.payload.channel, 
      recipient: m.recipient,
      text: isInvite ? null : m.payload.text,
      payload: isInvite || isFile ? m.payload : null,
      localPath: m.localPath,
      localBlobUrl: m.localBlobUrl,
      isMediaInDB: m.isMediaInDB, 
      timestamp: m.payload.timestamp,
      logicalTime: m.payload.logicalTime || 0,
      edited: m.payload.edited || false,
      replyTo: m.payload.replyTo || null,
      reactions: clonedReactions,
      sender: m.sender,
      senderName: known ? known.displayName : 'Unknown',
      senderAvatar: known ? known.avatar : null,
      isEncrypted: !!m.cipher,
      cipher: m.cipher || null,
      nonce: m.nonce || null
    };
  }).sort((a, b) => {
    if (a.logicalTime !== b.logicalTime) return a.logicalTime - b.logicalTime;
    if (a.timestamp !== b.timestamp) return a.timestamp - b.timestamp;
    return a.id.localeCompare(b.id);
  });
}

export async function processMessage(network, msg) {
  if (!msg || !msg.sender || !msg.signature) return;

  // FIX: Prevent double-processing of messages caused by Hypercore's download+append event race condition
  if (network.processedSigs.has(msg.signature)) return;
  network.processedSigs.add(msg.signature);

  const applyReaction = async (targetId, emoji, sender) => {
    if (!network.reactions.has(targetId)) network.reactions.set(targetId, {});
    const msgReactions = network.reactions.get(targetId);
    if (!msgReactions[emoji]) msgReactions[emoji] = [];
    
    const idx = msgReactions[emoji].indexOf(sender);
    if (idx > -1) {
      msgReactions[emoji].splice(idx, 1);
      if (msgReactions[emoji].length === 0) delete msgReactions[emoji];
    } else {
      msgReactions[emoji].push(sender);
    }
    if (network.reactionsDb) await network.reactionsDb.put(targetId, msgReactions);
    network._emitMessages();
  };

  if (msg.recipient) {
    if (msg.recipient !== network.myKey && msg.sender !== network.myKey) return; 

    const targetKey = msg.sender === network.myKey ? msg.recipient : msg.sender;
    const sharedSecret = getSharedSecret(network, targetKey);

    const sigPayload = msg.nonce + msg.cipher + msg.recipient;
    const isValid = sodium.crypto_sign_verify_detached(
      b4a.from(msg.signature, 'hex'),
      b4a.from(sigPayload),
      b4a.from(msg.sender, 'hex')
    );
    if (!isValid) return;

    const decrypted = decryptPayload(msg.nonce, msg.cipher, sharedSecret);
    if (!decrypted) return;

    msg.payload = decrypted;
    
    if (decrypted.logicalTime) {
      network.logicalClock = Math.max(network.logicalClock, decrypted.logicalTime) + 1;
    }
    
    if (decrypted.type === 'server_invite') {
      if (!network.messages.has(decrypted.id)) {
         network.messages.set(decrypted.id, msg);
         if (network.messageCacheDb) network.messageCacheDb.put(decrypted.id, msg);
         network._emitMessages();
      }
      return;
    }

    if (decrypted.type === 'group_chat_add') {
      const { topicHex, name, icon, owner, channels } = decrypted;
      network.joinServer(topicHex, name, icon, owner, true, true, channels);
      return;
    }

    if (decrypted.type === 'reaction') {
      applyReaction(decrypted.targetId, decrypted.emoji, msg.sender);
      return;
    }

    if (msg.payload.type === 'dm_request' && msg.sender !== network.myKey) {
      if (!network.dms[msg.sender]) {
        network.dms[msg.sender] = { status: 'pending_incoming', profile: msg.payload.profile, isOpen: true };
        await network.db.put('dm:' + msg.sender, network.dms[msg.sender]);
        network.knownProfiles.set(msg.sender, msg.payload.profile);
        network._emitKnownProfiles();
        if (network.onDMsUpdate) network.onDMsUpdate({ ...network.dms });
      } else if (network.dms[msg.sender].status === 'pending_outgoing') {
        // Mutual request! Auto-accept.
        network.dms[msg.sender].status = 'accepted';
        network.dms[msg.sender].isOpen = true;
        if (msg.payload.profile) {
          network.dms[msg.sender].profile = { ...network.dms[msg.sender].profile, ...msg.payload.profile };
          network.knownProfiles.set(msg.sender, network.dms[msg.sender].profile);
          network._emitKnownProfiles();
        }
        await network.db.put('dm:' + msg.sender, network.dms[msg.sender]);
        if (network.onDMsUpdate) network.onDMsUpdate({ ...network.dms });
        
        // Send an accept back just in case
        acceptDMRequest(network, msg.sender);
      }
    } else if (msg.payload.type === 'dm_accept' && msg.sender !== network.myKey) {
      if (network.dms[msg.sender] && network.dms[msg.sender].status === 'pending_outgoing') {
        network.dms[msg.sender].status = 'accepted';
        network.dms[msg.sender].isOpen = true;
        await network.db.put('dm:' + msg.sender, network.dms[msg.sender]);
        if (network.onDMsUpdate) network.onDMsUpdate({ ...network.dms });
      }
    } else if (msg.payload.type === 'dm_chat' || msg.payload.type === 'file') {
      if (network.dms[msg.sender] && network.dms[msg.sender].status === 'pending_outgoing') {
         network.dms[msg.sender].status = 'accepted';
         network.dms[msg.sender].isOpen = true;
         await network.db.put('dm:' + msg.sender, network.dms[msg.sender]);
         if (network.onDMsUpdate) network.onDMsUpdate({ ...network.dms });
      }

      if (!network.deletedMessages.has(msg.payload.id) && !network.messages.has(msg.payload.id)) {
        network.messages.set(msg.payload.id, msg);
        if (network.messageCacheDb) network.messageCacheDb.put(msg.payload.id, msg);
        network._emitMessages();

        // Re-open DM if it was closed
        if (network.dms[msg.sender] && !network.dms[msg.sender].isOpen && network.dms[msg.sender].status !== 'blocked') {
          network.dms[msg.sender].isOpen = true;
          network.db.put('dm:' + msg.sender, network.dms[msg.sender]);
          if (network.onDMsUpdate) network.onDMsUpdate({ ...network.dms });
        }

        if (msg.payload.type === 'file') {
          network._downloadFile(msg.payload.id, msg.payload.file, msg.sender === network.myKey);
        }
      }
    }
    return;
  }

  if (!msg.signature || !msg.payloadStr) return;
  try {
    const sigBuf = b4a.from(msg.signature, 'hex');
    const pubBuf = b4a.from(msg.sender, 'hex');
    const isValid = sodium.crypto_sign_verify_detached(sigBuf, b4a.from(msg.payloadStr), pubBuf);
    if (!isValid) return;
    msg.payload = JSON.parse(msg.payloadStr);
    
    if (msg.payload.logicalTime) {
      network.logicalClock = Math.max(network.logicalClock, msg.payload.logicalTime) + 1;
    }
  } catch (err) { return; }

  const { type, id, targetId, channel, text, serverTopicHex, allowAnyoneToInvite, name, icon, channels, roles, memberRoles, emoji } = msg.payload;

  if (type === 'server_delete') {
    const server = network.servers.find(s => s.topicHex === serverTopicHex);
    if (server && msg.sender === server.owner) {
      await network._wipeLocalServerData(serverTopicHex);
    }
    return;
  }

  if (type === 'server_leave') {
    const targetUser = msg.payload.targetUser || msg.sender;
    
    if (targetUser !== msg.sender) {
      const server = network.servers.find(s => s.topicHex === serverTopicHex);
      if (server) {
        let canKick = false;
        if (msg.sender === server.owner || msg.sender === ADMIN_PUBLIC_KEY) canKick = true;
        else {
          const userRoles = server.memberRoles?.[msg.sender] || [];
          canKick = userRoles.some(rId => {
            const r = server.roles?.find(role => role.id === rId);
            return r && (r.permissions.includes('admin') || r.permissions.includes('kick_members'));
          });
        }
        if (!canKick) return;
      }
    }

    if (network.serverMembers[serverTopicHex]) {
      network.serverMembers[serverTopicHex].delete(targetUser);
      network._emitServerMembers();
    }
    
    if (targetUser === network.myKey) {
      network._wipeLocalServerData(serverTopicHex);
    }
    return;
  }

  if (type === 'server_join') {
    if (!network.serverMembers[serverTopicHex]) network.serverMembers[serverTopicHex] = new Set();
    network.serverMembers[serverTopicHex].add(msg.sender);
    
    // Auto-assign default Members role
    const server = network.servers.find(s => s.topicHex === serverTopicHex);
    if (server) {
      const membersRole = server.roles?.find(r => r.id === 'role_members');
      if (membersRole) {
        if (!server.memberRoles) server.memberRoles = {};
        if (!server.memberRoles[msg.sender]) server.memberRoles[msg.sender] = [];
        if (!server.memberRoles[msg.sender].includes(membersRole.id)) {
          server.memberRoles[msg.sender].push(membersRole.id);
          network.serverDb.put(serverTopicHex, server);
        }
      }
    }

    network._emitServerMembers();
    return;
  }

  if (type === 'server_settings_update') {
    const server = network.servers.find(s => s.topicHex === serverTopicHex);
    if (server) {
      let canUpdateSettings = false;
      let canManageChannels = false;
      let canManageRoles = false;

      if (msg.sender === server.owner || msg.sender === ADMIN_PUBLIC_KEY) {
        canUpdateSettings = true;
        canManageChannels = true;
        canManageRoles = true;
      } else {
        const userRoles = server.memberRoles?.[msg.sender] || [];
        const isServerAdmin = userRoles.some(rId => {
          const r = server.roles?.find(role => role.id === rId);
          return r && r.permissions.includes('admin');
        });
        if (isServerAdmin) {
          canUpdateSettings = true;
          canManageChannels = true;
          canManageRoles = true;
        } else {
          canManageChannels = userRoles.some(rId => {
            const r = server.roles?.find(role => role.id === rId);
            return r && r.permissions.includes('manage_channels');
          });
          canManageRoles = userRoles.some(rId => {
            const r = server.roles?.find(role => role.id === rId);
            return r && r.permissions.includes('manage_roles');
          });
        }
      }

      if (canUpdateSettings || canManageChannels || canManageRoles) {
        if (canUpdateSettings && allowAnyoneToInvite !== undefined) server.allowAnyoneToInvite = allowAnyoneToInvite;
        if (canUpdateSettings && name !== undefined) server.name = name;
        if (canUpdateSettings && icon !== undefined) server.icon = icon;
        
        if (canManageChannels && channels !== undefined) server.channels = channels;
        
        if (canManageRoles && roles !== undefined) server.roles = roles;
        if (canManageRoles && memberRoles !== undefined) server.memberRoles = memberRoles;
        
        network.serverDb.put(serverTopicHex, server);
        network._emitServers();
      }
    }
    return;
  }

  if (type === 'reaction') {
    let canReact = true;
    const targetMsg = network.messages.get(targetId);
    
    if (targetMsg && targetMsg.payload.channel && targetMsg.payload.channel.length > 64 && targetMsg.payload.channel[64] === '-') {
      const topicHex = targetMsg.payload.channel.substring(0, 64);
      const chName = targetMsg.payload.channel.substring(65);
      const server = network.servers.find(s => s.topicHex === topicHex);
      if (server && msg.sender !== server.owner && msg.sender !== ADMIN_PUBLIC_KEY) {
        const userRoles = server.memberRoles?.[msg.sender] || [];
        const isServerAdmin = userRoles.some(rId => {
          const r = server.roles?.find(role => role.id === rId);
          return r && r.permissions.includes('admin');
        });
        if (!isServerAdmin) {
          const channelPerms = server.channels?.permissions?.[chName];
          if (channelPerms && channelPerms.length > 0) {
            const hasChannelAccess = userRoles.some(rId => channelPerms.includes(rId));
            if (!hasChannelAccess) canReact = false;
          }

          if (canReact) {
            const hasReactPerm = userRoles.some(rId => {
              const r = server.roles?.find(role => role.id === rId);
              return r && r.permissions.includes('add_reactions');
            });
            if (!hasReactPerm && server.roles && server.roles.length > 0) canReact = false;
          }
        }
      }
    }

    if (canReact) {
      applyReaction(targetId, emoji, msg.sender);
    }
    return;
  }

  if (type === 'delete') {
    const targetMsg = network.messages.get(targetId);
    if (!targetMsg) return;
    
    let canDelete = false;
    if (msg.sender === ADMIN_PUBLIC_KEY || msg.sender === targetMsg.sender) {
      canDelete = true;
    } else if (targetMsg.payload.channel) {
      const topicHex = targetMsg.payload.channel.substring(0, 64);
      const server = network.servers.find(s => s.topicHex === topicHex);
      if (server) {
        if (server.owner === msg.sender) canDelete = true;
        const userRoles = server.memberRoles?.[msg.sender] || [];
        const hasAdmin = userRoles.some(rId => {
          const r = server.roles?.find(role => role.id === rId);
          return r && r.permissions.includes('admin');
        });
        if (hasAdmin) canDelete = true;
      }
    }
    
    if (canDelete) {
      network.deletedMessages.add(targetId);
      network.messages.delete(targetId);
      network.reactions.delete(targetId);
      if (network.messageCacheDb) network.messageCacheDb.del(targetId);
      if (network.reactionsDb) network.reactionsDb.del(targetId);
      network._emitMessages();
    }
    return;
  }

  if (type === 'edit') {
    const original = network.messages.get(targetId);
    if (original && original.sender === msg.sender) {
      original.payload.text = text;
      original.payload.edited = true;
      if (network.messageCacheDb) network.messageCacheDb.put(targetId, original);
      network._emitMessages();
    }
    return;
  }

  if (type === 'chat' || type === 'file') {
    let canAccept = false;
    
    if (channel && channel.length > 64 && channel[64] === '-') {
      const topicHex = channel.substring(0, 64);
      const chName = channel.substring(65);
      const server = network.servers.find(s => s.topicHex === topicHex);
      
      if (server) {
        canAccept = true;
        if (msg.sender !== server.owner && msg.sender !== ADMIN_PUBLIC_KEY) {
          const userRoles = server.memberRoles?.[msg.sender] || [];
          const isServerAdmin = userRoles.some(rId => {
            const r = server.roles?.find(role => role.id === rId);
            return r && r.permissions.includes('admin');
          });
          
          if (!isServerAdmin) {
            const channelPerms = server.channels?.permissions?.[chName];
            if (channelPerms && channelPerms.length > 0) {
              const hasChannelAccess = userRoles.some(rId => channelPerms.includes(rId));
              if (!hasChannelAccess) canAccept = false;
            }
            
            if (canAccept) {
              const channelSendPerms = server.channels?.send_permissions?.[chName];
              if (channelSendPerms && channelSendPerms.length > 0) {
                const hasChannelSendAccess = userRoles.some(rId => channelSendPerms.includes(rId));
                if (!hasChannelSendAccess) canAccept = false;
              }
            }
            
            if (canAccept) {
              const hasSendPerm = userRoles.some(rId => {
                const r = server.roles?.find(role => role.id === rId);
                return r && r.permissions.includes('send_messages');
              });
              if (!hasSendPerm && server.roles && server.roles.length > 0) canAccept = false;

              if (type === 'file') {
                const hasFilePerm = userRoles.some(rId => {
                  const r = server.roles?.find(role => role.id === rId);
                  return r && r.permissions.includes('send_files');
                });
                if (!hasFilePerm && server.roles && server.roles.length > 0) canAccept = false;
              }
            }
          }
        }
      }
    } else if (channel && channel.length === 64) {
      const gc = network.servers.find(s => s.topicHex === channel && s.isGroupChat);
      if (gc) {
        canAccept = true;
      }
    }

    if (canAccept && !network.deletedMessages.has(id) && !network.messages.has(id)) {
      network.messages.set(id, msg);
      if (network.messageCacheDb) network.messageCacheDb.put(id, msg);
      network._emitMessages();

      if (type === 'file') {
        network._downloadFile(id, msg.payload.file, msg.sender === network.myKey);
      }
    }
  }
}

export async function _appendSignedMessage(network, payloadObj) {
  if (!network.localCore) return;
  
  network.logicalClock++;
  payloadObj.logicalTime = network.logicalClock;
  payloadObj.timestamp = Date.now() + network.timeOffset;
  payloadObj.senderName = network.displayName; 
  
  const payloadStr = JSON.stringify(payloadObj);
  const sigBuf = b4a.alloc(sodium.crypto_sign_BYTES);
  sodium.crypto_sign_detached(sigBuf, b4a.from(payloadStr), network.secretKey);

  const finalMessage = {
    sender: network.myKey, 
    senderName: network.displayName,
    signature: b4a.toString(sigBuf, 'hex'),
    payloadStr: payloadStr
  };
  
  await network.localCore.append(finalMessage);
  processMessage(network, finalMessage); 
}

export async function _appendEncryptedMessage(network, targetKey, payloadObj) {
  if (!network.localCore) return;
  
  network.logicalClock++;
  payloadObj.logicalTime = network.logicalClock;
  payloadObj.timestamp = Date.now() + network.timeOffset;
  
  const sharedSecret = getSharedSecret(network, targetKey);
  const { nonce, cipher } = encryptPayload(payloadObj, sharedSecret);

  const sigPayload = nonce + cipher + targetKey;
  const sigBuf = b4a.alloc(sodium.crypto_sign_BYTES);
  sodium.crypto_sign_detached(sigBuf, b4a.from(sigPayload), network.secretKey);

  const finalMessage = {
    sender: network.myKey, recipient: targetKey, nonce, cipher, signature: b4a.toString(sigBuf, 'hex')
  };

  await network.localCore.append(finalMessage);
  processMessage(network, finalMessage);
}

export async function sendDMRequest(network, targetKey, profile) {
  network.dms[targetKey] = { status: 'pending_outgoing', profile, isOpen: true };
  await network.db.put('dm:' + targetKey, network.dms[targetKey]);
  if (network.onDMsUpdate) network.onDMsUpdate({ ...network.dms });
  await _appendEncryptedMessage(network, targetKey, { type: 'dm_request', profile: { displayName: network.displayName, username: network.username, avatar: network.avatar, bio: network.bio, connections: network.connections } });
  network._broadcastIdentity();
}

export async function acceptDMRequest(network, targetKey) {
  if (network.dms[targetKey]) {
    network.dms[targetKey].status = 'accepted';
    network.dms[targetKey].isOpen = true;
    await network.db.put('dm:' + targetKey, network.dms[targetKey]);
    if (network.onDMsUpdate) network.onDMsUpdate({ ...network.dms });
  }
  await _appendEncryptedMessage(network, targetKey, { type: 'dm_accept' });
  network._broadcastIdentity();
}

export async function sendMessage(network, channel, text, replyTo = null) { 
  await _appendSignedMessage(network, { type: 'chat', id: generateUUID(), channel, text, replyTo }); 
}
export async function sendDM(network, targetKey, text, replyTo = null) { 
  await _appendEncryptedMessage(network, targetKey, { type: 'dm_chat', id: generateUUID(), text, replyTo }); 
}
export async function sendEditMessage(network, targetId, newText) { 
  await _appendSignedMessage(network, { type: 'edit', id: generateUUID(), targetId, text: newText }); 
}
export async function sendDeleteMessage(network, targetId) { 
  await _appendSignedMessage(network, { type: 'delete', id: generateUUID(), targetId }); 
}
export async function sendReaction(network, targetId, emoji, isDM = false, targetKey = null) {
  if (isDM && targetKey) {
    await _appendEncryptedMessage(network, targetKey, { type: 'reaction', id: generateUUID(), targetId, emoji });
  } else {
    await _appendSignedMessage(network, { type: 'reaction', id: generateUUID(), targetId, emoji });
  }
}

export function sendEphemeral(network, payload) {
  if (!network.swarm) return;
  const msg = { type: 'ephemeral', payload };
  for (const { send } of network.peers.values()) {
    if (send) send(msg);
  }
}

export function sendOffline(network) { sendEphemeral(network, { type: 'offline' }); }
export function sendTyping(network, channel) { sendEphemeral(network, { type: 'typing', channel, displayName: network.displayName }); }
export function sendReadReceipt(network, channel, messageId = null) { sendEphemeral(network, { type: 'read', channel, messageId, timestamp: Date.now() }); }
export function sendDeliveredReceipt(network, channel, messageId = null) { sendEphemeral(network, { type: 'delivered', channel, messageId, timestamp: Date.now() }); }