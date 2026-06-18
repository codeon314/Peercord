const b4a = window.require('b4a');

export function addWebRTCListener(network, fn) {
  network.webrtcListeners.add(fn);
}

export function removeWebRTCListener(network, fn) {
  network.webrtcListeners.delete(fn);
}

export function sendWebRTCSignal(network, targetKey, payload) {
  if (!network.swarm) return;
  const peerInfo = network.peers.get(targetKey);
  if (peerInfo && peerInfo.send) {
    peerInfo.send({ type: 'ephemeral', payload });
  }
}