const b4a = window.require('b4a');

export function addWebRTCListener(network, fn) {
  network.webrtcListeners.add(fn);
}

export function removeWebRTCListener(network, fn) {
  network.webrtcListeners.delete(fn);
}

export function sendWebRTCSignal(network, targetKey, payload) {
  if (!network.swarm) return;
  for (const peer of network.peers.values()) {
    if (peer.identityKey === targetKey && peer.send) {
      peer.send({ type: 'ephemeral', payload });
    }
  }
}