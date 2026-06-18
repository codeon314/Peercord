import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import Hyperswarm from 'hyperswarm';
import b4a from 'b4a';
import sodium from 'sodium-native';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '../package.json'), 'utf-8'));

// The private admin seed used to sign updates
const ADMIN_SEED_HEX = '[PLACE_HOLDER]';
const seedBuf = b4a.from(ADMIN_SEED_HEX, 'hex');
const pubKey = b4a.alloc(32);
const secKey = b4a.alloc(64);
sodium.crypto_sign_seed_keypair(pubKey, secKey, seedBuf);

const version = pkg.version;
const timestamp = Date.now();

// Create cryptographic signature to prevent fake updates
const msgBuf = b4a.from(version + timestamp);
const sigBuf = b4a.alloc(sodium.crypto_sign_BYTES);
sodium.crypto_sign_detached(sigBuf, msgBuf, secKey);

const payload = {
  type: 'system_update',
  version,
  timestamp,
  signature: b4a.toString(sigBuf, 'hex')
};

console.log(`\n🚀 [Broadcast] Announcing update v${version} to P2P network...`);

const swarm = new Hyperswarm();
const topic = b4a.alloc(32);
sodium.crypto_generichash(topic, b4a.from('peercord-global-updates'));

let peersConnected = 0;
swarm.on('connection', (conn) => {
  peersConnected++;
  console.log(`📡 [Broadcast] Connected to peer ${peersConnected}. Sending payload...`);
  const msg = b4a.from(JSON.stringify({ type: 'ephemeral', payload }));
  conn.write(msg);
});

// Join the global updates mesh as both client and server to maximize holepunching success
const discovery = swarm.join(topic, { client: true, server: true });

console.log("⏳ [Broadcast] Searching DHT for peers...");

// Wait for the DHT search to exhaustively complete
await discovery.flushed();

console.log("⏳ [Broadcast] DHT search complete. Waiting 5 seconds for connections to establish...");

// Give it a few seconds for NAT holepunching and connections to fully establish
setTimeout(async () => {
  console.log(`✅ [Broadcast] Finished. Reached ${peersConnected} direct peers. The Gossip protocol will flood the rest of the network instantly.`);
  await swarm.destroy();
  process.exit(0);
}, 5000);