const b4a = window.require('b4a');

export let Hyperswarm, Corestore, Hyperbee, sodium, fs, os, path, http, Protomux, cenc, DHT;

// The PUBLIC key is 100% safe to be in the open-source code. 
// It is mathematically impossible to derive your private seed from it.
export const ADMIN_PUBLIC_KEY = '[PLACE_HOLDER]';

export async function initP2P() {
  const req = window.require;
  Hyperswarm = req('hyperswarm');
  Corestore = req('corestore');
  Hyperbee = req('hyperbee');
  sodium = req('sodium-native');
  fs = req('fs');
  os = req('os');
  path = req('path');
  http = req('http');
  Protomux = req('protomux');
  cenc = req('compact-encoding');
  DHT = req('hyperdht');
}

export function generateUUID() {
  const buffer = b4a.alloc(16);
  sodium.randombytes_buf(buffer);
  return b4a.toString(buffer, 'hex');
}