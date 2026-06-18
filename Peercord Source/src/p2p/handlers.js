const b4a = window.require('b4a');

export async function handleData(network, peerKey, parsed, send) {
  try {
    switch (parsed.type) {
      case 'identity':
        await handleIdentity(network, peerKey, parsed);
        break;
      case 'whois':
        handleWhois(network, parsed, send);
        break;
      case 'whois_reply':
        handleWhoisReply(network, parsed);
        break;
      case 'ephemeral':
        handleEphemeral(network, peerKey, parsed, send);
        break;
      default:
        // Could be a standard message core, which is handled by replication, not this handler.
    }
  } catch (err) {
    // Likely binary data from core replication, ignore.
  }
}

async function handleIdentity(network, peerKey, parsed) {
  const peerInfo = network.peers.get(peerKey);
  if (!peerInfo) return;

  peerInfo.displayName = parsed.displayName;
  peerInfo.username = parsed.username;
  peerInfo.avatar = parsed.avatar;
  peerInfo.bio = parsed.bio || '';
  peerInfo.connections = parsed.connections || [];
  peerInfo.coreKey = parsed.coreKey;
  
  const profileObj = { 
    displayName: parsed.displayName, 
    username: parsed.username, 
    avatar: parsed.avatar,
    bio: parsed.bio || '',
    connections: parsed.connections || []
  };
  
  network.knownProfiles.set(peerKey, profileObj);
  if (network.profilesDb) await network.profilesDb.put(peerKey, profileObj);
  if (network.coresDb && parsed.coreKey) await network.coresDb.put(peerKey, parsed.coreKey);
  
  network._emitKnownProfiles();
  
  if (parsed.username) {
    const uname = parsed.username.toLowerCase();
    network.userDirectory.set(uname, { pubKey: peerKey, profile: profileObj });
    network.dirDb.put(uname, { pubKey: peerKey, profile: profileObj });
    network._checkPendingRequests(uname, peerKey, profileObj);
  }

  if (network.dms[peerKey]) {
    network.dms[peerKey].profile = profileObj;
    await network.db.put('dm:' + peerKey, network.dms[peerKey]);
    if (network.onDMsUpdate) network.onDMsUpdate({ ...network.dms });
  }

  if (network.onPeerUpdate) network.onPeerUpdate(network.getPeerList());
  network._emitMessages(); 
  
  // PRIVACY FILTER: Only track cores of peers we actually interact with
  let shouldTrack = false;
  
  // 1. Are they a direct friend? (Accepted or Pending)
  if (network.dms[peerKey]) {
    shouldTrack = true;
  }
  
  // 2. Do we share a Hub or Group Chat?
  if (!shouldTrack && parsed.topics && Array.isArray(parsed.topics)) {
    for (const t of parsed.topics) {
      if (network.joinedTopics.has(t)) {
        shouldTrack = true;
        break;
      }
    }
  }

  // 3. Are they trying to send us a friend request?
  if (!shouldTrack && parsed.pendingTargets && Array.isArray(parsed.pendingTargets)) {
    if (parsed.pendingTargets.includes(network.myKey)) {
      shouldTrack = true;
    }
  }

  if (shouldTrack) {
    await network.trackPeerCore(parsed.coreKey);
  }
}

function handleWhois(network, parsed, send) {
  const uname = parsed.username;
  if (network.userDirectory.has(uname)) {
    const cached = network.userDirectory.get(uname);
    send({ type: 'whois_reply', queryId: parsed.queryId, username: uname, pubKey: cached.pubKey, profile: cached.profile });
  }
}

function handleWhoisReply(network, parsed) {
  const cb = network.pendingWhois.get(parsed.queryId);
  if (cb) cb({ pubKey: parsed.pubKey, profile: parsed.profile });
  
  network.userDirectory.set(parsed.username, { pubKey: parsed.pubKey, profile: parsed.profile });
  network.dirDb.put(parsed.username, { pubKey: parsed.pubKey, profile: parsed.profile });
  network._checkPendingRequests(parsed.username, parsed.pubKey, parsed.profile);
}

function handleEphemeral(network, peerKey, parsed, send) {
  const { payload } = parsed;
  if (!payload) return;

  if (payload.type === 'sync_request') {
    if (network.joinedTopics.has(payload.topic)) {
      const pendingTargets = Object.entries(network.dms)
        .filter(([_, data]) => data.status === 'pending_outgoing')
        .map(([key]) => key);

      const identityMsg = { 
        type: 'identity', 
        displayName: network.displayName, 
        username: network.username, 
        avatar: network.avatar, 
        bio: network.bio, 
        connections: network.connections, 
        coreKey: network.coreKey,
        topics: Array.from(network.joinedTopics),
        pendingTargets
      };
      try { send(identityMsg); } catch(e) {}
    }
    return;
  }

  if (payload.type === 'offline') {
    const peerInfo = network.peers.get(peerKey);
    if (peerInfo) {
      network.peers.delete(peerKey);
      try { peerInfo.conn.destroy(); } catch (e) {} 
      if (network.onPeerUpdate) network.onPeerUpdate(network.getPeerList());
    }
  }
  
  if (payload.type.startsWith('webrtc-') || payload.type === 'voice_activity' || payload.type.startsWith('vc-')) {
    for (const fn of network.webrtcListeners) fn(peerKey, payload);
  }

  if (payload.type === 'transfer_progress') {
    const current = network.transfers[payload.id] || { progress: 0, speed: 0 };
    if (payload.progress >= current.progress || payload.progress === 1) {
      network.transfers[payload.id] = {
        ...current,
        progress: payload.progress,
        speed: payload.speed,
        state: payload.progress >= 1 ? 'completed' : 'uploading'
      };
      if (network.onTransfersUpdate) network.onTransfersUpdate(network.transfers);
    }
  }

  if (network.onEphemeral) network.onEphemeral(peerKey, payload);
}