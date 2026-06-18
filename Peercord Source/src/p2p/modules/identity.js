const b4a = window.require('b4a');
import { sodium } from '../utils.js';

export function generateIdentitySeed() {
  const buffer = b4a.alloc(32);
  sodium.randombytes_buf(buffer);
  return b4a.toString(buffer, 'hex');
}

export function getSharedSecret(network, targetPubKeyHex) {
  const myCurveSec = b4a.alloc(sodium.crypto_scalarmult_BYTES);
  const theirCurvePub = b4a.alloc(sodium.crypto_scalarmult_BYTES);
  const theirEdPub = b4a.from(targetPubKeyHex, 'hex');

  sodium.crypto_sign_ed25519_sk_to_curve25519(myCurveSec, network.secretKey);
  sodium.crypto_sign_ed25519_pk_to_curve25519(theirCurvePub, theirEdPub);

  const sharedSecret = b4a.alloc(sodium.crypto_scalarmult_BYTES);
  sodium.crypto_scalarmult(sharedSecret, myCurveSec, theirCurvePub);
  return sharedSecret;
}

export function encryptPayload(payloadObj, sharedSecret) {
  const message = b4a.from(JSON.stringify(payloadObj));
  const nonce = b4a.alloc(sodium.crypto_aead_xchacha20poly1305_ietf_NPUBBYTES);
  sodium.randombytes_buf(nonce);
  const cipher = b4a.alloc(message.length + sodium.crypto_aead_xchacha20poly1305_ietf_ABYTES);
  sodium.crypto_aead_xchacha20poly1305_ietf_encrypt(cipher, message, null, null, nonce, sharedSecret);
  return { nonce: b4a.toString(nonce, 'hex'), cipher: b4a.toString(cipher, 'hex') };
}

export function decryptPayload(nonceHex, cipherHex, sharedSecret) {
  const nonce = b4a.from(nonceHex, 'hex');
  const cipher = b4a.from(cipherHex, 'hex');
  const message = b4a.alloc(cipher.length - sodium.crypto_aead_xchacha20poly1305_ietf_ABYTES);
  try {
    sodium.crypto_aead_xchacha20poly1305_ietf_decrypt(message, null, cipher, null, nonce, sharedSecret);
    return JSON.parse(b4a.toString(message));
  } catch (e) {
    return null;
  }
}

export function updateProfile(network, displayName, avatar, username, bio = '', connections = []) {
  network.displayName = displayName;
  network.avatar = avatar;
  network.bio = bio;
  network.connections = connections;
  
  if (username && username !== 'unknown' && network.username === 'unknown') {
    network.username = username;
    const myTopic = b4a.alloc(32);
    sodium.crypto_generichash(myTopic, b4a.from('peercord-user:' + network.username));
    network.swarm.join(myTopic, { client: false, server: true });
  }

  network.knownProfiles.set(network.myKey, { displayName, username: network.username, avatar, bio, connections });
  if (network.profilesDb) network.profilesDb.put(network.myKey, { displayName, username: network.username, avatar, bio, connections });
  network._emitKnownProfiles();

  if (!network.swarm) return;
  network._broadcastIdentity();
}