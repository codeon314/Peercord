import b4a from 'b4a';
import sodium from 'sodium-native';
import Hyperswarm from 'hyperswarm'; 

// 1. GENERATE YOUR KEYS
const seed = b4a.alloc(32);
sodium.randombytes_buf(seed);

const pubKey = b4a.alloc(32);
const secKey = b4a.alloc(64);
sodium.crypto_sign_seed_keypair(pubKey, secKey, seed);

console.log("YOUR SECRET SEED:", b4a.toString(seed, 'hex'));
console.log("YOUR PUBLIC KEY (Put in utils.js):", b4a.toString(pubKey, 'hex'));

// Force Node to exit and kill background network pools
process.exit(0);