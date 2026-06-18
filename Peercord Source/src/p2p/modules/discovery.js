const b4a = window.require('b4a');
import { generateUUID, sodium } from '../utils.js';

export async function searchUser(network, targetUsername) {
  const normalized = targetUsername.toLowerCase();
  
  if (network.userDirectory.has(normalized)) {
    return network.userDirectory.get(normalized);
  }

  const topic = b4a.alloc(32);
  sodium.crypto_generichash(topic, b4a.from('peercord-user:' + normalized));
  network.swarm.join(topic, { client: true, server: false });

  return new Promise((resolve) => {
    let resolved = false;
    
    const finish = (result) => {
      if (resolved) return;
      resolved = true;
      network.swarm.leave(topic);
      resolve(result);
    };

    const timeout = setTimeout(() => {
      finish(null);
    }, 5000);

    const interval = setInterval(() => {
      if (network.userDirectory.has(normalized)) {
        clearTimeout(timeout);
        clearInterval(interval);
        finish(network.userDirectory.get(normalized));
      }
    }, 500);

    const queryId = generateUUID();
    network.pendingWhois.set(queryId, (result) => {
      clearTimeout(timeout);
      clearInterval(interval);
      finish(result);
    });

    const msg = { type: 'whois', queryId, username: normalized };
    for (const { send } of network.peers.values()) {
      if (send) send(msg);
    }
  });
}

export async function queueFriendRequest(network, targetUsername) {
  const uname = targetUsername.toLowerCase();
  network.pendingFriendRequests.add(uname);
  await network.pendingRequestsDb.put(uname, { timestamp: Date.now() });
  
  const topic = b4a.alloc(32);
  sodium.crypto_generichash(topic, b4a.from('peercord-user:' + uname));
  network.swarm.join(topic, { client: true, server: false });
}

export async function trackPeerCore(network, coreKeyHex) {
  if (network.peerCores.has(coreKeyHex)) return;
  const core = network.store.get({ key: b4a.from(coreKeyHex, 'hex'), valueEncoding: 'json' });
  await core.ready();
  network.peerCores.set(coreKeyHex, core);

  let processedSeq = -1;

  // Process already downloaded messages immediately to prevent hanging on boot
  for (let i = 0; i < core.length; i++) {
    if (core.has(i)) {
      const msg = await core.get(i);
      network.processMessage(msg);
      processedSeq = Math.max(processedSeq, i);
    }
  }
  
  // Listen for newly downloaded blocks (historical sync)
  core.on('download', async (index) => {
    const msg = await core.get(index);
    network.processMessage(msg);
  });

  // Listen for new messages appended live
  core.on('append', async () => {
    network._emitSync(); 
    for (let i = processedSeq + 1; i < core.length; i++) {
      // Force download of the new block by awaiting core.get without checking core.has
      const msg = await core.get(i);
      network.processMessage(msg);
      processedSeq = Math.max(processedSeq, i);
    }
  });
  
  // Tell the core to download all blocks continuously in the background
  core.download(); 
}