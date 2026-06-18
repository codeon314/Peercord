const b4a = window.require('b4a');
import { generateUUID, Hyperswarm, Corestore, Hyperbee, sodium, fs, os, path, http, Protomux, cenc, DHT } from './utils.js';
import * as Identity from './modules/identity.js';
import { handleData } from './handlers.js';
import { getAllMessages, processMessage, sendDMRequest, sendMessage, sendDM, sendEditMessage, sendDeleteMessage, acceptDMRequest, sendEphemeral, sendReadReceipt, sendDeliveredReceipt, sendOffline, sendTyping, sendReaction, _appendSignedMessage, _appendEncryptedMessage } from './modules/messaging.js';
import { createServer, joinServer, deleteServer, leaveServer, sendServerInvite, updateServerSettings, sendGroupChatAdd } from './modules/servers.js';
import { searchUser, queueFriendRequest, trackPeerCore } from './modules/discovery.js';
import { sendFile, sendDMFile, downloadFile } from './modules/files.js';
import { addWebRTCListener, removeWebRTCListener, sendWebRTCSignal } from './modules/webrtc.js';

class P2PNetwork {
  constructor() {
    this.swarm = null;
    this.store = null;
    this.localCore = null;
    this.db = null; 
    this.serverDb = null;
    this.dirDb = null;
    this.pendingRequestsDb = null;
    this.localFilesDb = null;
    this.coresDb = null;
    this.profilesDb = null;
    
    this.seedHex = null;
    this.coreKey = null; 
    this.myKey = null;   
    this.secretKey = null; 
    this.displayName = '';
    this.username = '';
    this.avatar = null;
    this.bio = '';
    this.connections = [];
    this.storagePath = null; 
    
    this.peers = new Map(); 
    this.peerCores = new Map(); 
    this.knownProfiles = new Map(); 
    this.userDirectory = new Map();
    this.pendingWhois = new Map();
    this.pendingFriendRequests = new Set();
    
    this.messages = new Map(); 
    this.reactions = new Map(); // targetId -> { emoji: [senders] }
    this.processedSigs = new Set(); // signature -> true (prevents double processing)
    this.deletedMessages = new Set(); 
    this.dms = {}; 
    this.servers =[];
    this.serverMembers = {}; 
    this.joinedTopics = new Set();
    this.syncTimeout = null;
    this._msgTimeout = null;
    this._identityTimeout = null;
    this._reconnectTimeout = null;
    
    this.transfers = {};
    this.webrtcListeners = new Set();

    this.logicalClock = 0;
    this.timeOffset = 0;
    this.activeCalls = 0; 
    
    this.onInit = null;
    this.onPeerUpdate = null;
    this.onMessage = null;
    this.onEphemeral = null; 
    this.onDMsUpdate = null;
    this.onKnownProfilesUpdate = null;
    this.onServersUpdate = null;
    this.onServerMembersUpdate = null;
    this.onSync = null;
    this.onTransfersUpdate = null;
  }

  getAllMessages = () => getAllMessages(this);
  processMessage = (msg) => processMessage(this, msg);
  sendDMRequest = (targetKey, profile) => sendDMRequest(this, targetKey, profile);
  acceptDMRequest = (targetKey) => acceptDMRequest(this, targetKey);
  sendMessage = (channel, text, replyTo) => sendMessage(this, channel, text, replyTo);
  sendDM = (targetKey, text, replyTo) => sendDM(this, targetKey, text, replyTo);
  sendEditMessage = (targetId, newText) => sendEditMessage(this, targetId, newText);
  sendDeleteMessage = (targetId) => sendDeleteMessage(this, targetId);
  sendReaction = (targetId, emoji, isDM, targetKey) => sendReaction(this, targetId, emoji, isDM, targetKey);
  sendEphemeral = (payload) => sendEphemeral(this, payload);
  sendReadReceipt = (channel, messageId) => sendReadReceipt(this, channel, messageId);
  sendDeliveredReceipt = (channel, messageId) => sendDeliveredReceipt(this, channel, messageId);
  sendOffline = () => sendOffline(this);
  sendTyping = (channel) => sendTyping(this, channel);
  
  pruneFile = (msgId) => this._pruneFile(msgId);
  getStorageStats = () => this._getStorageStats();

  _appendSignedMessage = (payloadObj) => _appendSignedMessage(this, payloadObj);
  _appendEncryptedMessage = (targetKey, payloadObj) => _appendEncryptedMessage(this, targetKey, payloadObj);
  _downloadFile = (msgId, fileMeta, isSender) => downloadFile(this, msgId, fileMeta, isSender);
  
  _emitMessages() {
    if (!this.onMessage) return;
    if (this._msgTimeout) clearTimeout(this._msgTimeout);
    this._msgTimeout = setTimeout(() => {
      this.onMessage(this.getAllMessages());
      this._msgTimeout = null;
    }, 50);
  }

  _wipeLocalServerData = async (topicHex) => {
    this.servers = this.servers.filter(s => s.topicHex !== topicHex);
    if (this.serverDb) await this.serverDb.del(topicHex);
    delete this.serverMembers[topicHex];
    
    const msgsToDelete =[];
    for (const [msgId, msg] of this.messages.entries()) {
      const ch = msg.payload?.channel;
      if (ch === topicHex || (ch && ch.startsWith(topicHex + '-'))) {
        msgsToDelete.push(msgId);
      }
    }
    
    let localDeleted =[];
    if (typeof window !== 'undefined') {
      localDeleted = JSON.parse(localStorage.getItem('pear_local_deleted_msgs') || '[]');
    }

    for (const msgId of msgsToDelete) {
      const msg = this.messages.get(msgId);
      if (msg) {
        if (msg.localPath && fs && fs.existsSync(msg.localPath)) {
          try { fs.unlinkSync(msg.localPath); } catch (e) {}
        }
        if (msg.payload?.file?.coreKey) {
          try {
            const core = this.store.get({ key: b4a.from(msg.payload.file.coreKey, 'hex') });
            await core.ready();
            await core.clear(0, core.length);
          } catch (e) {}
        }
        this.deletedMessages.add(msgId);
        this.messages.delete(msgId);
        this.reactions.delete(msgId);
        if (!localDeleted.includes(msgId)) localDeleted.push(msgId);
        if (this.transfers[msgId]) delete this.transfers[msgId];
      }
    }

    if (typeof window !== 'undefined' && msgsToDelete.length > 0) {
      localStorage.setItem('pear_local_deleted_msgs', JSON.stringify(localDeleted));
    }

    if (this.onTransfersUpdate) this.onTransfersUpdate(this.transfers);
    this._emitMessages();
    this._emitServers();
    this._emitServerMembers();
  };

  _reloadCores = async () => {
    this._emitSync();
  };
  
  createServer = (...args) => createServer(this, ...args);
  joinServer = (...args) => joinServer(this, ...args);
  deleteServer = (...args) => deleteServer(this, ...args);
  leaveServer = (...args) => leaveServer(this, ...args);
  sendServerInvite = (...args) => sendServerInvite(this, ...args);
  updateServerSettings = (...args) => updateServerSettings(this, ...args);
  sendGroupChatAdd = (...args) => sendGroupChatAdd(this, ...args);

  searchUser = (username) => searchUser(this, username);
  queueFriendRequest = (username) => queueFriendRequest(this, username);
  trackPeerCore = (coreKeyHex) => trackPeerCore(this, coreKeyHex);
  
  sendFile = (...args) => sendFile(this, ...args);
  sendDMFile = (...args) => sendDMFile(this, ...args);

  addWebRTCListener = (fn) => addWebRTCListener(this, fn);
  removeWebRTCListener = (fn) => removeWebRTCListener(this, fn);
  sendWebRTCSignal = (target, payload) => sendWebRTCSignal(this, target, payload);

  updateProfile = (name, avatar, username, bio, connections) => Identity.updateProfile(this, name, avatar, username, bio, connections);
  
  async openDM(targetKey, profile) {
    if (this.dms[targetKey]) {
      this.dms[targetKey].isOpen = true;
      if (profile) {
        this.dms[targetKey].profile = { ...this.dms[targetKey].profile, ...profile };
        this.knownProfiles.set(targetKey, this.dms[targetKey].profile);
        this._emitKnownProfiles();
      }
      await this.db.put('dm:' + targetKey, this.dms[targetKey]);
      if (this.onDMsUpdate) this.onDMsUpdate({ ...this.dms });
    } else {
      await this.sendDMRequest(targetKey, profile);
    }
  }

  async closeDM(targetKey) {
    if (this.dms[targetKey]) {
      this.dms[targetKey].isOpen = false;
      await this.db.put('dm:' + targetKey, this.dms[targetKey]);
      if (this.onDMsUpdate) this.onDMsUpdate({ ...this.dms });
    }
  }

  async removeFriend(targetKey) {
    if (this.dms[targetKey]) {
      delete this.dms[targetKey];
      await this.db.del('dm:' + targetKey);
      if (this.onDMsUpdate) this.onDMsUpdate({ ...this.dms });
    }
  }

  async blockUser(targetKey) {
    if (this.dms[targetKey]) {
      this.dms[targetKey].status = 'blocked';
      this.dms[targetKey].isOpen = false;
      await this.db.put('dm:' + targetKey, this.dms[targetKey]);
      if (this.onDMsUpdate) this.onDMsUpdate({ ...this.dms });
    } else {
      this.dms[targetKey] = { status: 'blocked', isOpen: false, profile: this.knownProfiles.get(targetKey) || { displayName: 'Unknown' } };
      await this.db.put('dm:' + targetKey, this.dms[targetKey]);
      if (this.onDMsUpdate) this.onDMsUpdate({ ...this.dms });
    }
  }

  async exportAccount() {
    const exportData = {
      profile: {
        displayName: this.displayName,
        username: this.username,
        avatar: this.avatar,
        bio: this.bio,
        connections: this.connections,
        seedHex: this.seedHex
      },
      dms: this.dms,
      servers: this.servers,
      knownProfiles: Array.from(this.knownProfiles.entries()),
      userDirectory: Array.from(this.userDirectory.entries()),
      settings: {
        theme: localStorage.getItem('peercord_theme'),
        audioInput: localStorage.getItem('pear_audio_input'),
        audioOutput: localStorage.getItem('pear_audio_output'),
        videoInput: localStorage.getItem('pear_video_input'),
        autoRestart: localStorage.getItem('pear_auto_restart'),
        liveDecryption: localStorage.getItem('pear_live_decryption'),
        ircMode: localStorage.getItem('pear_irc_mode'),
        noiseSuppression: localStorage.getItem('pear_noise_suppression'),
        closeToTray: localStorage.getItem('pear_close_to_tray'),
        pinMembers: localStorage.getItem('pear_pin_members'),
        notifyDMs: localStorage.getItem('pear_notify_dms'),
        notifyHubs: localStorage.getItem('pear_notify_hubs'),
        notifyMentions: localStorage.getItem('pear_notify_mentions'),
        notifyCalls: localStorage.getItem('pear_notify_calls')
      }
    };
    return JSON.stringify(exportData);
  }

  async importAccount(jsonString) {
    const data = JSON.parse(jsonString);
    
    for (const [key, value] of Object.entries(data.dms)) {
      await this.db.put('dm:' + key, value);
    }
    for (const server of data.servers) {
      await this.serverDb.put(server.topicHex, server);
    }
    for (const [key, value] of data.knownProfiles) {
      await this.profilesDb.put(key, value);
    }
    for (const [key, value] of data.userDirectory) {
      await this.dirDb.put(key, value);
    }

    if (data.settings) {
      for (const [k, v] of Object.entries(data.settings)) {
        if (v !== null && v !== undefined) {
          const storageKey = k === 'theme' ? 'peercord_theme' : `pear_${k.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`)}`;
          localStorage.setItem(storageKey, v);
        }
      }
    }

    return data.profile;
  }

  _checkPendingRequests = (uname, pubKey, profile) => {
    if (this.pendingFriendRequests.has(uname)) {
      this.pendingFriendRequests.delete(uname);
      this.pendingRequestsDb.del(uname);
      this.sendDMRequest(pubKey, profile);
    }
  }

  _emitKnownProfiles() {
    if (this.onKnownProfilesUpdate) {
      this.onKnownProfilesUpdate(Array.from(this.knownProfiles.entries()).map(([key, profile]) => ({ key, ...profile })));
    }
  }

  _emitServers() {
    if (this.onServersUpdate) this.onServersUpdate([...this.servers]);
  }

  _emitServerMembers() {
    if (this.onServerMembersUpdate) {
      const formatted = {};
      for (const topic in this.serverMembers) {
        formatted[topic] = Array.from(this.serverMembers[topic]);
      }
      this.onServerMembersUpdate(formatted);
    }
  }

  _emitSync() {
    if (this.onSync) this.onSync(true);
    if (this.syncTimeout) clearTimeout(this.syncTimeout);
    this.syncTimeout = setTimeout(() => {
      if (this.onSync) this.onSync(false);
    }, 500);
  }

  getBusyReasons() {
    const reasons =[];
    let activeUploads = 0;
    let activeDownloads = 0;
    let processing = 0;

    for (const t of Object.values(this.transfers)) {
      if (t.state === 'processing') {
        processing++;
      } else if (t.state === 'downloading') {
        if (t.speed > 0 || (t.progress > 0 && t.progress < 1)) {
          activeDownloads++;
        }
      } else if (t.state === 'uploading') {
        if (t.progress < 1) { 
          activeUploads++;
        }
      }
    }

    if (processing > 0) reasons.push("Processing local files");
    if (activeUploads > 0) reasons.push("Uploading files to peers");
    if (activeDownloads > 0) reasons.push("Downloading files");
    if (this.activeCalls > 0) reasons.push("Active voice/video call");

    return reasons;
  }

  isBusy() {
    return this.getBusyReasons().length > 0;
  }

  async _syncTimeWithServer() {
    try {
      if (!http) throw new Error("HTTP module not loaded");
      
      await new Promise((resolve, reject) => {
        const req = http.request({
          hostname: '1.1.1.1',
          method: 'HEAD',
          port: 80,
          timeout: 5000
        }, (res) => {
          const dateHeader = res.headers.date;
          if (dateHeader) {
            const serverTime = new Date(dateHeader).getTime();
            const localTime = Date.now();
            this.timeOffset = serverTime - localTime;
            console.log(`[Time Sync] Offset calculated: ${this.timeOffset}ms`);
          } else {
            console.warn('[Time Sync] No date header found in response.');
          }
          resolve();
        });
        
        req.on('timeout', () => {
          req.destroy();
          reject(new Error('Connection timed out'));
        });
        
        req.on('error', (err) => {
          reject(err);
        });
        
        req.end();
      });
    } catch (err) {
      console.warn('[Time Sync] Failed to reach time server, falling back to local system clock.', err.message || err);
      this.timeOffset = 0;
    }
  }

  async checkUsernameAvailable(username) {
    const normalized = username.toLowerCase();
    // FIX: Explicitly pass ephemeral DHT to prevent router exhaustion
    const dht = new DHT({ ephemeral: true });
    const tempSwarm = new Hyperswarm({ dht, maxPeers: 3, maxClientConnections: 3, maxServerConnections: 0 });
    const topic = b4a.alloc(32);
    sodium.crypto_generichash(topic, b4a.from('peercord-user:' + normalized));
    
    let isTaken = false;
    tempSwarm.on('connection', (conn) => {
      isTaken = true;
      conn.destroy();
    });
    
    tempSwarm.join(topic, { client: true, server: false });
    
    for (let i = 0; i < 30; i++) {
      if (isTaken) break;
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    await tempSwarm.destroy();
    return !isTaken;
  }

  async reconnect() {
    if (!this.swarm) return;
    
    if (this._reconnectTimeout) return;
    this._reconnectTimeout = setTimeout(() => {
      this._reconnectTimeout = null;
    }, 5000);

    console.log("[P2P] Network online event detected. Reconnecting...");
    try {
      this.swarm.flush().catch(()=>{});
    } catch (e) {
      console.warn("[P2P] Reconnect flush failed:", e);
    }
  }

  _broadcastIdentity() {
    if (!this.swarm) return;
    
    const pendingTargets = Object.entries(this.dms)
      .filter(([_, data]) => data.status === 'pending_outgoing')
      .map(([key]) => key);

    const identityMsg = {
      type: 'identity',
      displayName: this.displayName,
      username: this.username,
      avatar: this.avatar,
      bio: this.bio,
      connections: this.connections,
      coreKey: this.coreKey,
      topics: Array.from(this.joinedTopics),
      pendingTargets
    };

    for (const { send } of this.peers.values()) {
      if (send) send(identityMsg);
    }
  }

  async initialize(seedHex, displayName, username, avatar = null, bio = '', connections = []) {
    this.seedHex = seedHex;
    this.displayName = displayName;
    this.username = (username || 'unknown').toLowerCase();
    this.avatar = avatar;
    this.bio = bio;
    this.connections = connections;

    this._syncTimeWithServer().catch(() => {});

    let instanceId = 'default';
    if (typeof window !== 'undefined') {
      instanceId = localStorage.getItem('pear_instance_id');
      if (!instanceId) {
        instanceId = generateUUID();
        localStorage.setItem('pear_instance_id', instanceId);
      }
      
      const localDeleted = JSON.parse(localStorage.getItem('pear_local_deleted_msgs') || '[]');
      localDeleted.forEach(id => this.deletedMessages.add(id));
    }

    let basePath = './p2p-storage';
    if (os && path && typeof os.homedir === 'function') {
      const home = os.homedir();
      const appData = process.platform === 'win32' 
        ? process.env.APPDATA 
        : (process.platform === 'darwin' ? path.join(home, 'Library', 'Application Support') : path.join(home, '.config'));
      basePath = path.join(appData || home, 'Peercord', 'p2p-storage');
    }

    const hashBuf = b4a.alloc(32);
    sodium.crypto_generichash(hashBuf, b4a.from(seedHex, 'hex'));
    const accountHash = b4a.toString(hashBuf, 'hex').substring(0, 16);
    this.storagePath = path.join(basePath, `${instanceId}-${accountHash}`);
    
    if (fs && fs.existsSync) {
      const badDownloadsPath = path.join(this.storagePath, 'downloads');
      if (fs.existsSync(badDownloadsPath)) {
        try { fs.rmSync(badDownloadsPath, { recursive: true, force: true }); } catch (e) {}
      }
    }

    this.store = new Corestore(this.storagePath);
    await this.store.ready();

    const dbCore = this.store.get({ name: 'dm-db' }); await dbCore.ready();
    this.db = new Hyperbee(dbCore, { keyEncoding: 'utf-8', valueEncoding: 'json' }); await this.db.ready();
    const serverDbCore = this.store.get({ name: 'server-db' }); await serverDbCore.ready();
    this.serverDb = new Hyperbee(serverDbCore, { keyEncoding: 'utf-8', valueEncoding: 'json' }); await this.serverDb.ready();
    const dirDbCore = this.store.get({ name: 'directory-db' }); await dirDbCore.ready();
    this.dirDb = new Hyperbee(dirDbCore, { keyEncoding: 'utf-8', valueEncoding: 'json' }); await this.dirDb.ready();
    const pendingDbCore = this.store.get({ name: 'pending-requests-db' }); await pendingDbCore.ready();
    this.pendingRequestsDb = new Hyperbee(pendingDbCore, { keyEncoding: 'utf-8', valueEncoding: 'json' }); await this.pendingRequestsDb.ready();
    const localFilesDbCore = this.store.get({ name: 'local-files-db' }); await localFilesDbCore.ready();
    this.localFilesDb = new Hyperbee(localFilesDbCore, { keyEncoding: 'utf-8', valueEncoding: 'utf-8' }); await this.localFilesDb.ready();
    const coresDbCore = this.store.get({ name: 'peer-cores-db' }); await coresDbCore.ready();
    this.coresDb = new Hyperbee(coresDbCore, { keyEncoding: 'utf-8', valueEncoding: 'utf-8' }); await this.coresDb.ready();
    const profilesDbCore = this.store.get({ name: 'profiles-db' }); await profilesDbCore.ready();
    this.profilesDb = new Hyperbee(profilesDbCore, { keyEncoding: 'utf-8', valueEncoding: 'json' }); await this.profilesDb.ready();

    for await (const { key, value } of this.db.createReadStream({ gt: 'dm:', lt: 'dm:~' })) { 
      const pubKey = key.split(':')[1];
      if (value.isOpen === undefined) value.isOpen = true; 
      this.dms[pubKey] = value; 
      if (value.profile) this.knownProfiles.set(pubKey, value.profile); 
    }
    for await (const { key, value } of this.serverDb.createReadStream()) { this.servers.push({ topicHex: key, ...value }); }
    for await (const { key, value } of this.dirDb.createReadStream()) { this.userDirectory.set(key, value); if (value.pubKey && value.profile) this.knownProfiles.set(value.pubKey, value.profile); }
    for await (const { key } of this.pendingRequestsDb.createReadStream()) { this.pendingFriendRequests.add(key); }
    for await (const { key, value } of this.profilesDb.createReadStream()) { this.knownProfiles.set(key, value); }

    this.localCore = this.store.get({ name: 'user-messages', valueEncoding: 'json' }); await this.localCore.ready();
    this.coreKey = b4a.toString(this.localCore.key, 'hex');

    const seed = b4a.from(seedHex, 'hex');
    const publicKey = b4a.alloc(32);
    const secretKey = b4a.alloc(64);
    sodium.crypto_sign_seed_keypair(publicKey, secretKey, seed);
    this.myKey = b4a.toString(publicKey, 'hex'); 
    this.secretKey = secretKey; 
    this.knownProfiles.set(this.myKey, { displayName: this.displayName, username: this.username, avatar: this.avatar, bio: this.bio, connections: this.connections });

    // EMIT IMMEDIATELY BEFORE SWARM JOINS TO PREVENT UI BLOCKING
    this._emitKnownProfiles();
    if (this.onInit) this.onInit(this.myKey);
    if (this.onDMsUpdate) this.onDMsUpdate({ ...this.dms });
    this._emitServers();
    
    for (let i = 0; i < this.localCore.length; i++) { this.processMessage(await this.localCore.get(i)); }
    this._emitMessages();

    const corePromises =[];
    for await (const { key, value } of this.coresDb.createReadStream()) {
      corePromises.push(this.trackPeerCore(value));
    }
    await Promise.all(corePromises);

    // Compact-encoding codec for the JSON app protocol. Built on cenc.string
    // (utf-8) so it works regardless of whether this compact-encoding build
    // ships a dedicated `json` codec.
    const appEncoding = {
      preencode(state, m) { cenc.string.preencode(state, JSON.stringify(m)); },
      encode(state, m) { cenc.string.encode(state, JSON.stringify(m)); },
      decode(state) { return JSON.parse(cenc.string.decode(state)); }
    };

    // FIX: Explicitly create an ephemeral DHT instance to guarantee we don't route traffic for others
    // Also limit maxPeers to protect cheap home routers from NAT exhaustion
    const dht = new DHT({ ephemeral: true });
    this.swarm = new Hyperswarm({ 
      keyPair: { publicKey, secretKey },
      dht,
      maxPeers: 24,
      maxClientConnections: 12,
      maxServerConnections: 12
    });
    
    this.swarm.on('connection', (conn, info) => {
      conn.on('error', () => {}); // Prevent ECONNRESET crashes
      this.store.replicate(conn);
      const peerKey = b4a.toString(info.publicKey, 'hex');

      // The hyperswarm connection is a Noise stream that corestore wraps in
      // Protomux for replication framing. Raw conn.write would corrupt that
      // mux, so the JSON app protocol rides on its own Protomux channel that
      // shares the same connection with replication.
      const mux = Protomux.from(conn);
      const channel = mux.createChannel({ protocol: 'peercord/app' });

      // createChannel returns null if a channel for this protocol already
      // exists on the connection (e.g. a duplicate/multiplexed link). Bail
      // gracefully but keep the connection alive for replication.
      if (!channel) {
        if (this.onPeerUpdate) this.onPeerUpdate(this.getPeerList());
        return;
      }

      const appMessage = channel.addMessage({
        encoding: appEncoding,
        onmessage: (msg) => { 
          // Intercept Account Sync Requests directly on the main swarm
          if (msg.type === 'ephemeral' && msg.payload?.type === 'account_sync_request') {
            try {
              const sigBuf = b4a.from(msg.payload.signature, 'hex');
              const msgBuf = b4a.from('sync-request:' + msg.payload.tempKey);
              const pubBuf = b4a.from(this.myKey, 'hex');
              
              if (sodium.crypto_sign_verify_detached(sigBuf, msgBuf, pubBuf)) {
                console.log("[Sync] Valid sync request received. Exporting account...");
                this.exportAccount().then(exportData => {
                  send({ type: 'ephemeral', payload: { type: 'account_sync_reply', data: exportData } });
                });
              }
            } catch (e) {
              console.error("Sync request error:", e);
            }
            return;
          }
          handleData(this, peerKey, msg, send); 
        }
      });

      const send = (obj) => {
        try { appMessage.send(obj); } catch (e) {}
      };

      channel.open();

      // Preserve existing peer info if connection multiplexes
      const existingPeer = this.peers.get(peerKey);
      if (existingPeer) {
        existingPeer.conn = conn;
        existingPeer.send = send;
      } else {
        this.peers.set(peerKey, { conn, send, displayName: 'Unknown', username: 'unknown', avatar: null, bio: '', connections: [], coreKey: null });
      }

      const pendingTargets = Object.entries(this.dms)
        .filter(([_, data]) => data.status === 'pending_outgoing')
        .map(([key]) => key);

      send({
        type: 'identity',
        displayName: this.displayName,
        username: this.username,
        avatar: this.avatar,
        bio: this.bio,
        connections: this.connections,
        coreKey: this.coreKey,
        topics: Array.from(this.joinedTopics),
        pendingTargets
      });

      if (this.onPeerUpdate) this.onPeerUpdate(this.getPeerList());

      conn.on('close', () => {
        // Only delete if this specific connection is still the active one
        const currentPeer = this.peers.get(peerKey);
        if (currentPeer && currentPeer.conn === conn) {
          this.peers.delete(peerKey);
          if (this.onPeerUpdate) this.onPeerUpdate(this.getPeerList());
        }
      });
    });

    // BACKGROUND JOINS TO PREVENT UDP FLOOD / NAT EXHAUSTION
    (async () => {
      // FIX: Increased pacing to 3 seconds to protect router NAT tables
      const pace = () => new Promise(r => setTimeout(r, 3000)); 

      // Join the sync topic on the main swarm instead of creating a second swarm
      const syncTopic = b4a.alloc(32);
      sodium.crypto_generichash(syncTopic, b4a.from('peercord-sync:' + this.myKey));
      this.swarm.join(syncTopic, { server: true, client: false });
      await pace();

      if (this.username && this.username !== 'unknown') {
        const myTopic = b4a.alloc(32);
        sodium.crypto_generichash(myTopic, b4a.from('peercord-user:' + this.username));
        this.swarm.join(myTopic, { client: false, server: true });
        await pace();
      }

      for (const uname of this.pendingFriendRequests) {
        const topic = b4a.alloc(32);
        sodium.crypto_generichash(topic, b4a.from('peercord-user:' + uname));
        this.swarm.join(topic, { client: true, server: false });
        await pace();
      }

      for (const server of this.servers) {
        await this._joinTopic(server.topicHex, true); 
        await pace();
      }

      const globalUpdateTopic = b4a.alloc(32);
      sodium.crypto_generichash(globalUpdateTopic, b4a.from('peercord-global-updates'));
      this.swarm.join(globalUpdateTopic, { client: true, server: true });

      this.swarm.flush().then(() => {
        console.log("[P2P] Swarm flushed and announced.");
      }).catch(err => console.warn("[P2P] Swarm flush failed:", err));
    })();
  }

  getPeerList() {
    return Array.from(this.peers.entries()).map(([key, info]) => ({
      key, displayName: info.displayName, username: info.username, avatar: info.avatar, bio: info.bio, connections: info.connections
    }));
  }

  async _joinTopic(topicHex, skipFlush = false) {
    if (!this.swarm) return;
    if (this.joinedTopics.has(topicHex)) return;
    this.joinedTopics.add(topicHex);
    const topic = b4a.from(topicHex, 'hex');
    this.swarm.join(topic, { client: true, server: true });
    
    // Debounce identity broadcast to prevent TCP floods when joining many topics
    if (this._identityTimeout) clearTimeout(this._identityTimeout);
    this._identityTimeout = setTimeout(() => {
      this._broadcastIdentity();
    }, 1000);
    
    // Request sync from existing members to fetch history immediately
    this.sendEphemeral({ type: 'sync_request', topic: topicHex });

    if (!skipFlush) {
      // Don't await flush, it blocks the caller.
      this.swarm.flush().catch(()=>{});
    }
  }

  async close() {
    if (this.swarm) {
      for (const peer of this.swarm.connections) peer.destroy();
      await this.swarm.destroy();
      this.swarm = null;
    }
    if (this.db) { await this.db.close(); this.db = null; }
    if (this.serverDb) { await this.serverDb.close(); this.serverDb = null; }
    if (this.dirDb) { await this.dirDb.close(); this.dirDb = null; }
    if (this.pendingRequestsDb) { await this.pendingRequestsDb.close(); this.pendingRequestsDb = null; }
    if (this.localFilesDb) { await this.localFilesDb.close(); this.localFilesDb = null; }
    if (this.coresDb) { await this.coresDb.close(); this.coresDb = null; }
    if (this.profilesDb) { await this.profilesDb.close(); this.profilesDb = null; }
    if (this.store) { await this.store.close(); this.store = null; }
    
    this.peers.clear();
    this.peerCores.clear();
    this.knownProfiles.clear();
    this.userDirectory.clear();
    this.pendingWhois.clear();
    this.pendingFriendRequests.clear();
    this.messages.clear();
    this.reactions.clear();
    this.processedSigs.clear();
    this.deletedMessages.clear();
    this.dms = {};
    this.servers =[];
    this.serverMembers = {};
    this.joinedTopics.clear();
    this.transfers = {};
    this.webrtcListeners.clear();
    if (this._msgTimeout) clearTimeout(this._msgTimeout);
    if (this._identityTimeout) clearTimeout(this._identityTimeout);
    if (this._reconnectTimeout) clearTimeout(this._reconnectTimeout);
  }

  async wipeAllData() {
    await this.close();
    if (typeof window !== 'undefined') localStorage.removeItem('pear_discord_identity');
    try {
      if (this.storagePath && fs) await fs.promises.rm(this.storagePath, { recursive: true, force: true });
    } catch (err) { console.error("Failed to delete storage directory:", err); }
    window.location.reload();
  }

  async _getStorageStats() {
    const stats = {
      total: 0,
      dms: {},
      servers: {},
      files: []
    };
    
    const guessServerName = (topicHex) => {
      const s = this.servers.find(s => s.topicHex === topicHex);
      if (s) return s.name;
      for (const msg of this.messages.values()) {
        if (msg.payload?.serverTopicHex === topicHex && msg.payload?.name) return msg.payload.name;
        if (msg.payload?.type === 'server_invite' && msg.payload?.serverTopicHex === topicHex) return msg.payload.serverName;
        if (msg.payload?.type === 'group_chat_add' && msg.payload?.topicHex === topicHex) return msg.payload.name;
      }
      return 'Unknown Hub';
    };

    for (const msg of this.messages.values()) {
      if (msg.payload?.type === 'file' && msg.localPath) {
        const size = msg.payload.file.size || 0;
        stats.total += size;
        
        const target = msg.recipient ? (msg.sender === this.myKey ? msg.recipient : msg.sender) : null;
        
        let serverName = null;
        let isGroupChat = false;
        if (!msg.recipient && msg.payload.channel) {
          const topicHex = msg.payload.channel.substring(0, 64);
          serverName = guessServerName(topicHex);
          const s = this.servers.find(s => s.topicHex === topicHex);
          if (s) isGroupChat = s.isGroupChat;
        }

        const fileInfo = {
          id: msg.payload.id,
          name: msg.payload.file.name,
          size: size,
          coreKey: msg.payload.file.coreKey,
          timestamp: msg.payload.timestamp,
          channel: msg.payload.channel,
          recipient: msg.recipient,
          sender: msg.sender,
          target: target,
          serverName: serverName,
          isGroupChat: isGroupChat
        };
        stats.files.push(fileInfo);
        
        if (msg.recipient) {
          stats.dms[target] = (stats.dms[target] || 0) + size;
        } else if (msg.payload.channel) {
          const topicHex = msg.payload.channel.substring(0, 64);
          const channelName = msg.payload.channel.substring(65) || 'general';
          if (!stats.servers[topicHex]) stats.servers[topicHex] = { total: 0, channels: {}, name: serverName, isGroupChat };
          stats.servers[topicHex].total += size;
          stats.servers[topicHex].channels[channelName] = (stats.servers[topicHex].channels[channelName] || 0) + size;
        }
      }
    }
    
    stats.files.sort((a, b) => b.size - a.size);
    return stats;
  }

  async _pruneFile(msgId) {
    const msg = this.messages.get(msgId);
    if (!msg) return;
    
    try {
      if (msg.localPath && fs && fs.existsSync(msg.localPath)) {
        try { fs.unlinkSync(msg.localPath); } catch (e) { console.error("Failed to delete physical file:", e); }
      }
      
      if (msg.payload?.file?.coreKey) {
        try {
          const core = this.store.get({ key: b4a.from(msg.payload.file.coreKey, 'hex') });
          await core.ready();
          await core.clear(0, core.length);
        } catch (e) { console.error("Failed to clear hypercore:", e); }
      }
      
      this.deletedMessages.add(msgId);
      this.messages.delete(msgId);
      this.reactions.delete(msgId);
      
      if (typeof window !== 'undefined') {
        const localDeleted = JSON.parse(localStorage.getItem('pear_local_deleted_msgs') || '[]');
        if (!localDeleted.includes(msgId)) {
          localDeleted.push(msgId);
          localStorage.setItem('pear_local_deleted_msgs', JSON.stringify(localDeleted));
        }
      }
      
      if (this.transfers[msgId]) {
        delete this.transfers[msgId];
        if (this.onTransfersUpdate) this.onTransfersUpdate(this.transfers);
      }
      this._emitMessages();
      
    } catch (err) {
      console.error("Failed to prune file:", err);
    }
  }
}

export const network = new P2PNetwork();
export { initP2P, ADMIN_PUBLIC_KEY } from './utils.js';
export { generateIdentitySeed } from './modules/identity.js';